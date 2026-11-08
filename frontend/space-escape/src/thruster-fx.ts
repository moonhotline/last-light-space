/**
 * Last Light · Cinematic Spaceship Propulsion Visual FX
 * Implements high-taste dual-nozzle ion plasma plumes, Mach shock diamonds,
 * dynamic retro-braking RCS vents, volumetric engine glow, and high-velocity slipstream.
 */

import * as THREE from "three";
import type { AdventureShip, Input } from "../shared/types";

const FLAME_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLAME_FRAGMENT_SHADER = `
uniform float time;
uniform float throttle;
uniform vec3 coreColor;
uniform vec3 flameColor;
uniform float boost;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  // Axial length: 0.0 at nozzle, 1.0 at exhaust tip
  float t = clamp(1.0 - vUv.y, 0.0, 1.0);
  
  // High-frequency plasma turbulence
  float turb = sin(vUv.x * 32.0 + time * 38.0) * cos(t * 24.0 - time * 28.0) * 0.12;
  
  // Mach shock diamond pattern (3 distinct bright nodes)
  float shock = pow(max(0.0, sin(t * 22.0 - time * 14.0)), 5.0) * (1.0 - t) * (1.5 + boost * 2.0);
  
  // Core to sheath color gradient
  vec3 col = mix(coreColor, flameColor, pow(t, 0.65));
  col += vec3(0.9, 0.95, 1.0) * shock;
  
  // Radial edge glow / fresnel
  float radial = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float alpha = pow(radial, 1.2) * (1.0 - pow(t, 1.35)) * (0.7 + turb) * throttle;
  alpha = clamp(alpha, 0.0, 1.0);
  
  gl_FragColor = vec4(col * (1.3 + boost * 0.8), alpha);
}
`;

export class ShipPropulsionFX {
  readonly rootGroup = new THREE.Group();
  private flameMeshes: THREE.Mesh[] = [];
  private coreMeshes: THREE.Mesh[] = [];
  private rcsBrakeMeshes: THREE.Mesh[] = [];
  private engineLight: THREE.PointLight;
  private flameUniforms: {
    time: { value: number };
    throttle: { value: number };
    boost: { value: number };
    coreColor: { value: THREE.Color };
    flameColor: { value: THREE.Color };
  };

  private currentLength = 1.0;
  private targetLength = 1.0;
  private currentThrottle = 0.0;

  constructor(private kind: "light_fighter" | "intergalactic" = "light_fighter") {
    this.rootGroup.name = "ship-propulsion-vfx";

    // Uniforms for custom plasma shader
    this.flameUniforms = {
      time: { value: 0 },
      throttle: { value: 0.2 },
      boost: { value: 0 },
      coreColor: { value: new THREE.Color(0xdffff) },
      flameColor: { value: new THREE.Color(0x00d4ff) },
    };

    const flameMaterial = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERTEX_SHADER,
      fragmentShader: FLAME_FRAGMENT_SHADER,
      uniforms: this.flameUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const rcsMaterial = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Dual nozzle offsets based on ship kind
    const nozzleOffsets = kind === "intergalactic"
      ? [{ x: -2.2, y: 1.8, z: 5.6 }, { x: 2.2, y: 1.8, z: 5.6 }]
      : [{ x: -1.15, y: 1.6, z: 4.4 }, { x: 1.15, y: 1.6, z: 4.4 }];

    for (const offset of nozzleOffsets) {
      // Outer Volumetric Plasma Flame Cone
      const flameGeo = new THREE.CylinderGeometry(0.18, 0.45, 3.8, 16, 8, true);
      flameGeo.rotateX(-Math.PI / 2);
      flameGeo.translate(0, 0, 1.9); // Anchor base at nozzle origin
      const flameMesh = new THREE.Mesh(flameGeo, flameMaterial);
      flameMesh.position.set(offset.x, offset.y, offset.z);
      this.flameMeshes.push(flameMesh);
      this.rootGroup.add(flameMesh);

      // Inner White-Hot Plasma Core Cone
      const coreGeo = new THREE.CylinderGeometry(0.08, 0.16, 1.6, 12, 1, true);
      coreGeo.rotateX(-Math.PI / 2);
      coreGeo.translate(0, 0, 0.8);
      const coreMesh = new THREE.Mesh(coreGeo, coreMaterial);
      coreMesh.position.set(offset.x, offset.y, offset.z);
      this.coreMeshes.push(coreMesh);
      this.rootGroup.add(coreMesh);
    }

    // RCS Retro-Brake Thrusters (Angled forward-outward on left/right wings)
    const rcsOffsets = kind === "intergalactic"
      ? [{ x: -3.4, y: 1.5, z: 1.2, dir: -1 }, { x: 3.4, y: 1.5, z: 1.2, dir: 1 }]
      : [{ x: -2.1, y: 1.2, z: 0.8, dir: -1 }, { x: 2.1, y: 1.2, z: 0.8, dir: 1 }];

    for (const rcs of rcsOffsets) {
      const rcsGeo = new THREE.ConeGeometry(0.24, 1.4, 8);
      rcsGeo.rotateX(Math.PI / 2); // Point forward
      rcsGeo.rotateY(rcs.dir * 0.35); // Slight outward angle
      const rcsMesh = new THREE.Mesh(rcsGeo, rcsMaterial);
      rcsMesh.position.set(rcs.x, rcs.y, rcs.z);
      rcsMesh.visible = false;
      this.rcsBrakeMeshes.push(rcsMesh);
      this.rootGroup.add(rcsMesh);
    }

    // Engine Exhaust Point Light (illuminates aft hull and ground/asteroids)
    this.engineLight = new THREE.PointLight(0x00f0ff, 0, 24, 1.8);
    this.engineLight.position.set(0, 1.6, 5.2);
    this.rootGroup.add(this.engineLight);
  }

  /**
   * Update real-time propulsion visual state based on ship flight physics and input.
   */
  update(
    dt: number,
    ship: AdventureShip,
    input?: Input | null,
    isBoosting = false,
    isBraking = false,
  ) {
    this.flameUniforms.time.value += dt;

    if (!ship.repaired) {
      this.rootGroup.visible = false;
      this.engineLight.intensity = 0;
      return;
    }

    this.rootGroup.visible = true;

    // Calculate flight speed
    const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0, ship.vz ?? 0);
    const climbing = input ? (input.jump || input.jet) : false;
    const forwardThrust = input ? input.forward > 0 : speed > 8;

    // Throttle evaluation
    let targetThrottle = 0.25; // Base idle
    let targetFlameLen = 1.2;

    if (ship.grounded && !climbing && !forwardThrust) {
      targetThrottle = 0.08;
      targetFlameLen = 0.6;
    } else if (isBoosting) {
      targetThrottle = 1.35;
      targetFlameLen = 3.2; // Extended 3.2x (~12 meters plasma jet!)
    } else if (forwardThrust || climbing) {
      targetThrottle = 0.85 + Math.min(speed / 90, 0.35);
      targetFlameLen = 1.8 + Math.min(speed / 70, 0.9);
    } else {
      // Coasting
      targetThrottle = 0.45;
      targetFlameLen = 1.3;
    }

    if (isBraking) {
      targetThrottle = 0.2;
      targetFlameLen = 0.7;
    }

    // Smoothly damp throttle and plume length
    this.currentThrottle = THREE.MathUtils.damp(this.currentThrottle, targetThrottle, 9, dt);
    this.currentLength = THREE.MathUtils.damp(this.currentLength, targetFlameLen, 7, dt);

    this.flameUniforms.throttle.value = this.currentThrottle;
    this.flameUniforms.boost.value = isBoosting ? 1.0 : 0.0;

    // Shift plume color toward white/violet on afterburner boost
    if (isBoosting) {
      this.flameUniforms.coreColor.value.setHex(0xffffff);
      this.flameUniforms.flameColor.value.setHex(0x60a5fa);
      this.engineLight.color.setHex(0x70c0ff);
      this.engineLight.intensity = THREE.MathUtils.damp(this.engineLight.intensity, 6.5, 8, dt);
    } else {
      this.flameUniforms.coreColor.value.setHex(0x00f0ff);
      this.flameUniforms.flameColor.value.setHex(0x0284c7);
      this.engineLight.color.setHex(0x00f0ff);
      this.engineLight.intensity = THREE.MathUtils.damp(this.engineLight.intensity, 2.8 * this.currentThrottle, 6, dt);
    }

    // Scale flame cones along Z axis
    for (const flame of this.flameMeshes) {
      flame.scale.set(
        1.0 + (isBoosting ? 0.35 : 0),
        1.0 + (isBoosting ? 0.35 : 0),
        this.currentLength,
      );
    }

    // Scale core cones
    for (const core of this.coreMeshes) {
      core.scale.set(
        1.0 + (isBoosting ? 0.2 : 0),
        1.0 + (isBoosting ? 0.2 : 0),
        Math.min(this.currentLength * 0.8, 2.2),
      );
    }

    // Fire RCS retro-braking vents on brake (X key)
    for (const rcs of this.rcsBrakeMeshes) {
      rcs.visible = isBraking;
      if (isBraking) {
        const flicker = 0.8 + Math.random() * 0.45;
        rcs.scale.set(flicker, flicker, flicker * (1.2 + Math.random() * 0.5));
      }
    }
  }

  dispose() {
    this.rootGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
