/**
 * Last Light - Cinematic Spaceship Propulsion & Retro-Brake Visual FX
 * - Volumetric Fresnel dual-nozzle plasma plumes with multi-octave turbulence & Mach shock diamonds
 * - Camera-facing anamorphic nozzle core flares
 * - Dedicated velocity-stretched exhaust plasma particle streams (both fighter & cruiser)
 * - Wingtip aerodynamic/ion ribbon trails on high-bank turns & afterburner
 * - High-fidelity cryo-plasma retro-brake plumes, cold-gas RCS particle vents & airbrake shock ring
 *   (completely replaces legacy low-poly orange brake cones)
 */

import * as THREE from "three";
import type { AdventureShip, Input } from "../shared/types";

const PLASMA_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const PLASMA_OUTER_FRAGMENT_SHADER = `
uniform float time;
uniform float throttle;
uniform float boost;
uniform float brake;
uniform vec3 coreColor;
uniform vec3 flameColor;
uniform vec3 boostTint;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p *= 2.12;
    amp *= 0.5;
  }
  return v;
}

void main() {
  // Axial coordinate: 0.0 at nozzle exit, 1.0 at exhaust tail
  float t = clamp(1.0 - vUv.y, 0.0, 1.0);

  // Seamless cylindrical angle coordinate to avoid UV seam artifacts
  float ang = vUv.x * 6.2831853;
  vec2 flowUv = vec2(sin(ang) * 1.4 + cos(ang) * 0.8, t * 4.5 - time * (11.0 + boost * 10.0));
  float turb = fbm(flowUv);
  float fine = fbm(flowUv * 2.3 + vec2(3.1, -time * 16.0));

  // View-angle Fresnel edge softening eliminates hard cylinder silhouette from every angle
  float ndv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float fresnelSoft = pow(clamp(ndv, 0.0, 1.0), 1.55);

  // 4 Mach shock diamonds decaying along the plume
  float machWave = sin(t * 24.5 - time * (9.0 + boost * 8.0) + turb * 1.4);
  float shock = pow(max(0.0, machWave), 6.0) * (1.0 - t) * (1.2 + boost * 2.4);

  // Smooth axial fade with bright nozzle throat
  float nozzleEntry = smoothstep(0.0, 0.06, t);
  float tailFade = pow(max(0.0, 1.0 - t), 1.45 + (1.0 - boost) * 0.45);
  float density = fresnelSoft * tailFade * (0.45 + 0.55 * nozzleEntry) * (0.62 + turb * 0.55 + fine * 0.25);

  // Blackbody color shift: hot cyan-white throat -> electric azure -> violet-blue afterburner sheath
  vec3 outerCol = mix(flameColor, boostTint, boost * 0.72);
  vec3 col = mix(coreColor, outerCol, pow(t, 0.52));
  col += vec3(0.88, 0.96, 1.0) * shock * (0.55 + 0.45 * fresnelSoft);
  col += coreColor * exp(-t * 14.0) * (0.7 + boost * 0.8);

  float alpha = clamp(density * throttle * (1.0 - brake * 0.45), 0.0, 1.0);
  gl_FragColor = vec4(col * (1.25 + boost * 0.95), alpha);
}
`;

const PLASMA_CORE_FRAGMENT_SHADER = `
uniform float time;
uniform float throttle;
uniform float boost;
uniform vec3 coreColor;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  float t = clamp(1.0 - vUv.y, 0.0, 1.0);
  float ndv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float softEdge = pow(clamp(ndv, 0.0, 1.0), 1.85);
  float pulse = 0.86 + 0.14 * sin(t * 28.0 - time * 32.0);
  float axial = pow(max(0.0, 1.0 - t), 1.9);
  float alpha = clamp(softEdge * axial * pulse * min(1.2, throttle * 0.95), 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.99, 1.0), coreColor, t * 0.65);
  gl_FragColor = vec4(col * (1.7 + boost * 1.1), alpha);
}
`;

const RETRO_PLUME_FRAGMENT_SHADER = `
uniform float time;
uniform float intensity;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

float hash21(vec2 p) {
  p = fract(p * vec2(231.17, 519.43));
  p += dot(p, p + 31.17);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // 0.0 at retro-vent throat, 1.0 at expanded cryo-gas cloud
  float t = clamp(1.0 - vUv.y, 0.0, 1.0);
  float ang = vUv.x * 6.2831853;
  float n1 = vnoise(vec2(cos(ang) * 2.2, t * 5.0 - time * 18.0));
  float n2 = vnoise(vec2(sin(ang) * 4.0 + 1.7, t * 9.0 - time * 26.0));
  float mist = n1 * 0.65 + n2 * 0.35;

  float ndv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
  float fresnelSoft = pow(clamp(ndv, 0.0, 1.0), 1.45);
  float fade = pow(max(0.0, 1.0 - t), 1.35) * smoothstep(0.0, 0.05, t);

  // Cryogenic white-cyan expansion mist with ionized cyan-amber nozzle throat
  vec3 throat = vec3(0.75, 0.96, 1.0);
  vec3 cryoMist = vec3(0.52, 0.84, 0.98);
  vec3 outerVapor = vec3(0.78, 0.92, 1.0);
  vec3 col = mix(throat, cryoMist, smoothstep(0.0, 0.35, t));
  col = mix(col, outerVapor, smoothstep(0.35, 1.0, t) * 0.55);
  col += vec3(0.45, 0.88, 1.0) * exp(-t * 10.0) * 0.85;

  float alpha = clamp(fresnelSoft * fade * (0.55 + mist * 0.65) * intensity, 0.0, 0.92);
  gl_FragColor = vec4(col * 1.35, alpha);
}
`;

const AIRBRAKE_RING_FRAGMENT_SHADER = `
uniform float time;
uniform float intensity;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float ring = exp(-pow((r - 0.78) * 11.0, 2.0));
  float inner = exp(-pow((r - 0.62) * 14.0, 2.0)) * 0.45;
  float ripple = 0.75 + 0.25 * sin(angle * 12.0 - time * 14.0);
  float alpha = clamp((ring + inner) * ripple * intensity * 0.55, 0.0, 0.75);
  vec3 col = mix(vec3(0.38, 0.82, 1.0), vec3(0.9, 0.97, 1.0), ring);
  gl_FragColor = vec4(col * 1.3, alpha);
}
`;

interface ExhaustStreak {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  nozzle: number;
  kind: "main" | "retro";
}

function createNozzleFlareTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  // Core radial glow
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.18, "rgba(180, 240, 255, 0.85)");
  g.addColorStop(0.45, "rgba(56, 189, 248, 0.28)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // Subtle anamorphic horizontal lens flare bar
  const bar = ctx.createLinearGradient(0, 64, 128, 64);
  bar.addColorStop(0, "rgba(0, 0, 0, 0)");
  bar.addColorStop(0.3, "rgba(125, 211, 252, 0.32)");
  bar.addColorStop(0.5, "rgba(255, 255, 255, 0.72)");
  bar.addColorStop(0.7, "rgba(125, 211, 252, 0.32)");
  bar.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bar;
  ctx.fillRect(0, 59, 128, 10);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ShipPropulsionFX {
  readonly rootGroup = new THREE.Group();
  private flameMeshes: THREE.Mesh[] = [];
  private coreMeshes: THREE.Mesh[] = [];
  private nozzleFlares: THREE.Sprite[] = [];
  private retroPlumeMeshes: THREE.Mesh[] = [];
  private airbrakeRing: THREE.Mesh;
  private engineLight: THREE.PointLight;
  private retroLight: THREE.PointLight;

  private flameUniforms: {
    time: { value: number };
    throttle: { value: number };
    boost: { value: number };
    brake: { value: number };
    coreColor: { value: THREE.Color };
    flameColor: { value: THREE.Color };
    boostTint: { value: THREE.Color };
  };
  private coreUniforms: {
    time: { value: number };
    throttle: { value: number };
    boost: { value: number };
    coreColor: { value: THREE.Color };
  };
  private retroUniforms: {
    time: { value: number };
    intensity: { value: number };
  };
  private airbrakeUniforms: {
    time: { value: number };
    intensity: { value: number };
  };

  // Dedicated velocity-stretched exhaust & retro-brake particle streaks
  private readonly streakCount = 320;
  private streaks: ExhaustStreak[] = [];
  private streakPositions: Float32Array;
  private streakColors: Float32Array;
  private streakLines: THREE.LineSegments;
  private emitCarry = 0;
  private retroEmitCarry = 0;

  // Dual wingtip ion/condensation ribbon trails
  private readonly ribbonSegs = 22;
  private wingRibbons: {
    mesh: THREE.Mesh;
    anchor: THREE.Vector3;
    points: THREE.Vector3[];
  }[] = [];
  private ribbonMaterial: THREE.MeshBasicMaterial;

  private nozzleOffsets: { x: number; y: number; z: number }[];
  private retroOffsets: { x: number; y: number; z: number; dir: number }[];

  private currentLength = 1.0;
  private currentThrottle = 0.0;
  private currentBoost = 0.0;
  private currentBrake = 0.0;

  constructor(private kind: "light_fighter" | "intergalactic" = "light_fighter") {
    this.rootGroup.name = "ship-propulsion-vfx";

    this.flameUniforms = {
      time: { value: 0 },
      throttle: { value: 0.2 },
      boost: { value: 0 },
      brake: { value: 0 },
      coreColor: { value: new THREE.Color(0xcffafe) },
      flameColor: { value: new THREE.Color(0x0ea5e9) },
      boostTint: { value: new THREE.Color(0x6366f1) },
    };

    this.coreUniforms = {
      time: { value: 0 },
      throttle: { value: 0.2 },
      boost: { value: 0 },
      coreColor: { value: new THREE.Color(0x7dd3fc) },
    };

    this.retroUniforms = {
      time: { value: 0 },
      intensity: { value: 0 },
    };

    this.airbrakeUniforms = {
      time: { value: 0 },
      intensity: { value: 0 },
    };

    const flameMaterial = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERTEX_SHADER,
      fragmentShader: PLASMA_OUTER_FRAGMENT_SHADER,
      uniforms: this.flameUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const coreMaterial = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERTEX_SHADER,
      fragmentShader: PLASMA_CORE_FRAGMENT_SHADER,
      uniforms: this.coreUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const retroMaterial = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERTEX_SHADER,
      fragmentShader: RETRO_PLUME_FRAGMENT_SHADER,
      uniforms: this.retroUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // Dual nozzle offsets calibrated to real GLTF nozzle faces
    this.nozzleOffsets =
      kind === "intergalactic"
        ? [
            { x: -2.1, y: 0.0, z: 4.9 },
            { x: 2.1, y: 0.0, z: 4.9 },
          ]
        : [
            { x: -1.0, y: 0.5, z: 4.3 },
            { x: 1.0, y: 0.5, z: 4.3 },
          ];

    // First 4 meshes are the 2 outer plumes + 2 inner cores at exact nozzle coordinates
    for (const offset of this.nozzleOffsets) {
      const outerRadiusBase = kind === "intergalactic" ? 0.56 : 0.42;
      const outerRadiusTip = kind === "intergalactic" ? 0.16 : 0.12;
      const outerLen = kind === "intergalactic" ? 4.8 : 3.9;
      const flameGeo = new THREE.CylinderGeometry(outerRadiusTip, outerRadiusBase, outerLen, 32, 20, true);
      flameGeo.rotateX(-Math.PI / 2);
      flameGeo.translate(0, 0, outerLen * 0.5);
      const flameMesh = new THREE.Mesh(flameGeo, flameMaterial);
      flameMesh.position.set(offset.x, offset.y, offset.z);
      flameMesh.name = "volumetric-plasma-plume";
      this.flameMeshes.push(flameMesh);
      this.rootGroup.add(flameMesh);

      const coreGeo = new THREE.CylinderGeometry(outerRadiusTip * 0.5, outerRadiusBase * 0.48, outerLen * 0.52, 24, 12, true);
      coreGeo.rotateX(-Math.PI / 2);
      coreGeo.translate(0, 0, outerLen * 0.26);
      const coreMesh = new THREE.Mesh(coreGeo, coreMaterial);
      coreMesh.position.set(offset.x, offset.y, offset.z);
      coreMesh.name = "volumetric-plasma-core";
      this.coreMeshes.push(coreMesh);
      this.rootGroup.add(coreMesh);
    }

    // Nozzle root flares (camera-facing radial + anamorphic streaks)
    const flareTex = createNozzleFlareTexture();
    for (const offset of this.nozzleOffsets) {
      const flareMat = new THREE.SpriteMaterial({
        ...(flareTex ? { map: flareTex } : {}),
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(flareMat);
      sprite.position.set(offset.x, offset.y, offset.z + 0.12);
      const baseScale = kind === "intergalactic" ? 2.4 : 1.75;
      sprite.scale.set(baseScale * 1.4, baseScale, 1);
      sprite.name = "nozzle-core-flare";
      this.nozzleFlares.push(sprite);
      this.rootGroup.add(sprite);
    }

    // High-fidelity cryo-plasma retro-brake plumes (replaces legacy 8-sided orange ConeGeometry)
    this.retroOffsets =
      kind === "intergalactic"
        ? [
            { x: -3.8, y: 0.9, z: -0.6, dir: -1 },
            { x: 3.8, y: 0.9, z: -0.6, dir: 1 },
          ]
        : [
            { x: -2.25, y: 0.65, z: -0.4, dir: -1 },
            { x: 2.25, y: 0.65, z: -0.4, dir: 1 },
          ];

    for (const retro of this.retroOffsets) {
      // Flared open cryo-expansion bell (narrow throat -> wide dissipating forward cloud)
      const retroGeo = new THREE.CylinderGeometry(0.62, 0.11, 2.35, 28, 14, true);
      retroGeo.rotateX(Math.PI / 2);
      retroGeo.translate(0, 0, -1.18);
      retroGeo.rotateY(retro.dir * 0.42);
      const retroMesh = new THREE.Mesh(retroGeo, retroMaterial);
      retroMesh.position.set(retro.x, retro.y, retro.z);
      retroMesh.visible = false;
      retroMesh.name = "cryo-retro-brake-plume";
      this.retroPlumeMeshes.push(retroMesh);
      this.rootGroup.add(retroMesh);
    }

    // Translucent Airbrake Shock Ring around forward fuselage
    const ringScale = kind === "intergalactic" ? 13.5 : 8.4;
    const ringGeo = new THREE.PlaneGeometry(ringScale, ringScale);
    const ringMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: AIRBRAKE_RING_FRAGMENT_SHADER,
      uniforms: this.airbrakeUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.airbrakeRing = new THREE.Mesh(ringGeo, ringMat);
    this.airbrakeRing.position.set(0, kind === "intergalactic" ? 0.5 : 0.45, -1.8);
    this.airbrakeRing.visible = false;
    this.airbrakeRing.name = "airbrake-shock-ring";
    this.rootGroup.add(this.airbrakeRing);

    // Engine Exhaust Point Light (keeps y=0.50 for fighter)
    this.engineLight = new THREE.PointLight(0x38bdf8, 0, 28, 1.7);
    this.engineLight.position.set(0, kind === "intergalactic" ? 0 : 0.5, 5.2);
    this.rootGroup.add(this.engineLight);

    // Forward Retro-Brake Illumination Light
    this.retroLight = new THREE.PointLight(0x99f6e4, 0, 20, 1.8);
    this.retroLight.position.set(0, kind === "intergalactic" ? 0.9 : 0.7, -1.5);
    this.rootGroup.add(this.retroLight);

    // Dedicated velocity-stretched exhaust & retro-gas streak lines (independent of global burst pool)
    this.streakPositions = new Float32Array(this.streakCount * 2 * 3);
    this.streakColors = new Float32Array(this.streakCount * 2 * 3);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute("position", new THREE.BufferAttribute(this.streakPositions, 3));
    streakGeo.setAttribute("color", new THREE.BufferAttribute(this.streakColors, 3));
    this.streakLines = new THREE.LineSegments(
      streakGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.streakLines.frustumCulled = false;
    this.streakLines.name = "propulsion-velocity-streaks";
    this.rootGroup.add(this.streakLines);

    // Wingtip aerodynamic condensation / ion ribbon trails
    this.ribbonMaterial = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const wingX = kind === "intergalactic" ? 7.6 : 4.55;
    const wingY = kind === "intergalactic" ? 0.25 : 0.38;
    const wingZ = kind === "intergalactic" ? 2.4 : 2.3;
    for (const side of [-1, 1]) {
      const anchor = new THREE.Vector3(side * wingX, wingY, wingZ);
      const pts = Array.from({ length: this.ribbonSegs }, (_, i) =>
        new THREE.Vector3(anchor.x, anchor.y, anchor.z + i * 0.45),
      );
      const rGeo = new THREE.BufferGeometry();
      const verts = new Float32Array(this.ribbonSegs * 2 * 3);
      const indices: number[] = [];
      for (let i = 0; i < this.ribbonSegs - 1; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
      rGeo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      rGeo.setIndex(indices);
      const mesh = new THREE.Mesh(rGeo, this.ribbonMaterial);
      mesh.frustumCulled = false;
      mesh.name = `wingtip-ribbon-${side < 0 ? "L" : "R"}`;
      this.rootGroup.add(mesh);
      this.wingRibbons.push({ mesh, anchor, points: pts });
    }
  }

  private spawnStreak(kind: "main" | "retro", isBoosting: boolean, speed: number) {
    if (this.streaks.length >= this.streakCount) return;
    if (kind === "main") {
      const nozzleIdx = Math.random() < 0.5 ? 0 : 1;
      const n = this.nozzleOffsets[nozzleIdx];
      const spread = isBoosting ? 0.26 : 0.17;
      const jetSpeed = (isBoosting ? 46 : 24) + Math.min(speed * 0.14, 28) + Math.random() * 14;
      this.streaks.push({
        x: n.x + (Math.random() - 0.5) * spread * 2,
        y: n.y + (Math.random() - 0.5) * spread * 2,
        z: n.z + 0.35 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * (isBoosting ? 2.4 : 1.3),
        vy: (Math.random() - 0.5) * (isBoosting ? 2.4 : 1.3),
        vz: jetSpeed,
        age: 0,
        life: 0.18 + Math.random() * (isBoosting ? 0.24 : 0.16),
        nozzle: nozzleIdx,
        kind: "main",
      });
    } else {
      const idx = Math.random() < 0.5 ? 0 : 1;
      const r = this.retroOffsets[idx];
      const ventSpeed = 18 + Math.random() * 12;
      this.streaks.push({
        x: r.x + (Math.random() - 0.5) * 0.2,
        y: r.y + (Math.random() - 0.5) * 0.2,
        z: r.z - 0.2,
        vx: r.dir * ventSpeed * 0.44 + (Math.random() - 0.5) * 4.2,
        vy: (Math.random() - 0.5) * 3.8,
        vz: -ventSpeed * 0.92,
        age: 0,
        life: 0.16 + Math.random() * 0.16,
        nozzle: idx,
        kind: "retro",
      });
    }
  }

  private updateStreaks(dt: number, speed: number, isBoosting: boolean, isBraking: boolean, grounded: boolean) {
    if (!grounded && !isBraking) {
      const rate = isBoosting ? 420 : speed > 18 ? 160 + Math.min(speed * 1.1, 180) : 45;
      this.emitCarry += rate * dt;
      while (this.emitCarry >= 1) {
        this.emitCarry -= 1;
        this.spawnStreak("main", isBoosting, speed);
      }
    }
    if (isBraking) {
      this.retroEmitCarry += 260 * dt;
      while (this.retroEmitCarry >= 1) {
        this.retroEmitCarry -= 1;
        this.spawnStreak("retro", false, speed);
      }
    }

    this.streakPositions.fill(0);
    this.streakColors.fill(0);
    let writeIdx = 0;

    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.streaks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      // Slight radial diffusion as gas expands
      s.vx *= Math.exp(-1.5 * dt);
      s.vy *= Math.exp(-1.5 * dt);

      const t = s.age / s.life;
      const fade = (1 - t) * (1 - t);
      const tailScale = s.kind === "main" ? (isBoosting ? 0.065 : 0.042) : 0.036;
      const p0 = writeIdx * 6;
      this.streakPositions[p0] = s.x;
      this.streakPositions[p0 + 1] = s.y;
      this.streakPositions[p0 + 2] = s.z;
      this.streakPositions[p0 + 3] = s.x - s.vx * tailScale;
      this.streakPositions[p0 + 4] = s.y - s.vy * tailScale;
      this.streakPositions[p0 + 5] = s.z - s.vz * tailScale;

      if (s.kind === "main") {
        // White-cyan head fading to electric violet-blue tail on boost
        const headR = (isBoosting ? 0.92 : 0.72) * fade;
        const headG = (isBoosting ? 0.96 : 0.95) * fade;
        const headB = 1.0 * fade;
        const tailR = (isBoosting ? 0.45 : 0.08) * fade * 0.45;
        const tailG = (isBoosting ? 0.58 : 0.65) * fade * 0.45;
        const tailB = 1.0 * fade * 0.55;
        this.streakColors[p0] = headR;
        this.streakColors[p0 + 1] = headG;
        this.streakColors[p0 + 2] = headB;
        this.streakColors[p0 + 3] = tailR;
        this.streakColors[p0 + 4] = tailG;
        this.streakColors[p0 + 5] = tailB;
      } else {
        // Cryo-white cold-gas venting streaks
        const c = 0.85 * fade;
        this.streakColors[p0] = c * 0.85;
        this.streakColors[p0 + 1] = c * 0.97;
        this.streakColors[p0 + 2] = c;
        this.streakColors[p0 + 3] = c * 0.25;
        this.streakColors[p0 + 4] = c * 0.45;
        this.streakColors[p0 + 5] = c * 0.55;
      }
      writeIdx++;
    }

    (this.streakLines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.streakLines.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    this.streakLines.geometry.setDrawRange(0, writeIdx * 2);
  }

  private updateWingRibbons(dt: number, ship: AdventureShip, speed: number, isBoosting: boolean) {
    const bankMag = Math.abs(ship.bank ?? 0);
    const targetOpacity = ship.grounded
      ? 0
      : THREE.MathUtils.clamp((speed - 38) / 90, 0, 0.35) +
        (isBoosting ? 0.28 : 0) +
        (bankMag > 0.2 ? (bankMag - 0.2) * 0.55 : 0);
    this.ribbonMaterial.opacity = THREE.MathUtils.damp(
      this.ribbonMaterial.opacity,
      Math.min(0.62, targetOpacity),
      7,
      dt,
    );
    this.ribbonMaterial.color.setHex(isBoosting ? 0xa5b4fc : 0xbae6fd);

    const stretch = 0.32 + Math.min(speed / 120, 1.35) + (isBoosting ? 0.45 : 0);
    const swayX = -(ship.yawVelocity ?? 0) * 0.42;
    const swayY = -(ship.pitch ?? 0) * 0.65;

    for (const ribbon of this.wingRibbons) {
      const posAttr = ribbon.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < this.ribbonSegs; i++) {
        const u = i / (this.ribbonSegs - 1);
        const width = (1 - u) * (this.kind === "intergalactic" ? 0.16 : 0.11);
        const px = ribbon.anchor.x + swayX * u * u * 3.2;
        const py = ribbon.anchor.y + swayY * u * u * 2.4;
        const pz = ribbon.anchor.z + u * stretch * 8.5;
        const idx = i * 6;
        arr[idx] = px - width;
        arr[idx + 1] = py;
        arr[idx + 2] = pz;
        arr[idx + 3] = px + width;
        arr[idx + 4] = py;
        arr[idx + 5] = pz;
      }
      posAttr.needsUpdate = true;
      ribbon.mesh.visible = this.ribbonMaterial.opacity > 0.015;
    }
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
    this.coreUniforms.time.value += dt;
    this.retroUniforms.time.value += dt;
    this.airbrakeUniforms.time.value += dt;

    if (!ship.repaired) {
      this.rootGroup.visible = false;
      this.engineLight.intensity = 0;
      this.retroLight.intensity = 0;
      return;
    }

    this.rootGroup.visible = true;

    const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0, ship.vz ?? 0);
    const climbing = input ? input.jump || input.jet : (ship.vy ?? 0) > 6;
    const forwardThrust = input ? input.forward > 0 : speed > 8;
    const pulse = ship.boostPulse ?? 0;

    let targetThrottle = 0.26;
    let targetFlameLen = 1.05;

    if (ship.grounded && !climbing && !forwardThrust) {
      targetThrottle = 0.1;
      targetFlameLen = 0.45;
    } else if (isBoosting) {
      targetThrottle = 1.45 + pulse * 0.35;
      targetFlameLen = 3.15 + pulse * 0.65;
    } else if (forwardThrust || climbing) {
      targetThrottle = 0.85 + Math.min(speed / 120, 0.42);
      targetFlameLen = 1.7 + Math.min(speed / 95, 0.95);
    } else {
      targetThrottle = 0.44;
      targetFlameLen = 1.15;
    }

    if (isBraking) {
      targetThrottle = 0.16;
      targetFlameLen = 0.5;
    }

    this.currentThrottle = THREE.MathUtils.damp(this.currentThrottle, targetThrottle, 9, dt);
    this.currentLength = THREE.MathUtils.damp(this.currentLength, targetFlameLen, 8, dt);
    this.currentBoost = THREE.MathUtils.damp(this.currentBoost, isBoosting ? 1 : 0, 8, dt);
    this.currentBrake = THREE.MathUtils.damp(this.currentBrake, isBraking ? 1 : 0, 11, dt);

    this.flameUniforms.throttle.value = this.currentThrottle;
    this.flameUniforms.boost.value = this.currentBoost;
    this.flameUniforms.brake.value = this.currentBrake;
    this.coreUniforms.throttle.value = this.currentThrottle;
    this.coreUniforms.boost.value = this.currentBoost;

    // Smooth blackbody color transition into electric violet-white afterburner
    this.flameUniforms.coreColor.value.setRGB(
      THREE.MathUtils.lerp(0.76, 1.0, this.currentBoost),
      THREE.MathUtils.lerp(0.96, 0.97, this.currentBoost),
      1.0,
    );
    this.flameUniforms.flameColor.value.setRGB(
      THREE.MathUtils.lerp(0.04, 0.32, this.currentBoost),
      THREE.MathUtils.lerp(0.68, 0.66, this.currentBoost),
      THREE.MathUtils.lerp(0.96, 1.0, this.currentBoost),
    );
    this.coreUniforms.coreColor.value.copy(this.flameUniforms.coreColor.value);

    // Engine illumination
    this.engineLight.color.setHex(this.currentBoost > 0.4 ? 0x818cf8 : 0x38bdf8);
    this.engineLight.intensity = THREE.MathUtils.damp(
      this.engineLight.intensity,
      isBraking ? 0.7 : 2.6 * this.currentThrottle + this.currentBoost * 4.5,
      8,
      dt,
    );

    const radialPulse = 1 + this.currentBoost * 0.28 + pulse * 0.18;
    for (const flame of this.flameMeshes) {
      flame.scale.set(radialPulse, radialPulse, this.currentLength);
    }
    for (const core of this.coreMeshes) {
      core.scale.set(
        1 + this.currentBoost * 0.22,
        1 + this.currentBoost * 0.22,
        Math.min(this.currentLength * 0.85, 2.5),
      );
    }

    const baseFlare = this.kind === "intergalactic" ? 2.4 : 1.75;
    const flareScale = baseFlare * (0.55 + this.currentThrottle * 0.48 + this.currentBoost * 0.45);
    for (const flare of this.nozzleFlares) {
      flare.scale.set(flareScale * (1.35 + this.currentBoost * 0.65), flareScale, 1);
      (flare.material as THREE.SpriteMaterial).opacity = THREE.MathUtils.clamp(
        0.25 + this.currentThrottle * 0.55,
        0,
        0.95,
      );
    }

    // Cryo-plasma retro-brake plumes & airbrake shock ring
    const brakeActive = this.currentBrake > 0.03;
    this.retroUniforms.intensity.value = this.currentBrake * (0.75 + Math.min(speed / 120, 0.45));
    for (const retro of this.retroPlumeMeshes) {
      retro.visible = brakeActive;
      if (brakeActive) {
        const len = 0.65 + this.currentBrake * (0.65 + Math.min(speed / 140, 0.75));
        const wid = 0.82 + this.currentBrake * 0.35;
        retro.scale.set(wid, wid, len);
      }
    }

    const ringStrength = this.currentBrake * THREE.MathUtils.clamp((speed - 12) / 90, 0, 1);
    this.airbrakeRing.visible = ringStrength > 0.03;
    this.airbrakeUniforms.intensity.value = ringStrength;
    if (this.airbrakeRing.visible) {
      const ringPulse = 0.92 + 0.14 * Math.sin(this.airbrakeUniforms.time.value * 16);
      this.airbrakeRing.scale.setScalar(ringPulse * (0.85 + ringStrength * 0.3));
    }

    this.retroLight.intensity = this.currentBrake * 3.8;

    // Velocity-stretched exhaust & retro-gas streaks + wingtip ribbons
    this.updateStreaks(dt, speed, isBoosting, isBraking, ship.grounded);
    this.updateWingRibbons(dt, ship, speed, isBoosting);
  }

  dispose() {
    this.rootGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
  }
}
