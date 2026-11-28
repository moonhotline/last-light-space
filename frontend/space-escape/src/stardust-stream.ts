import * as THREE from "three";
import { SHIP_MAX_SPEED } from "../shared/adventure-data";
import { clamp } from "../shared/map";

/**
 * Near-field Stardust Parallax & Velocity-Stretched Warp Streak Field:
 * Combines 3 subtle parallax mote layers with velocity-stretched luminous
 * speed lines so high-speed flight & afterburner feel sharp instead of snowy dots.
 */
export class StardustParallaxStream {
  group = new THREE.Group();
  layers: {
    points: THREE.Points;
    speedMult: number;
    count: number;
  }[] = [];
  private streakLines: THREE.LineSegments;
  private streakCount = 340;
  private streakSeeds: Float32Array;
  private streakPositions: Float32Array;
  private streakColors: Float32Array;

  private createMoteTexture(): THREE.CanvasTexture | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255, 255, 255, 1)");
    g.addColorStop(0.22, "rgba(205, 240, 255, 0.72)");
    g.addColorStop(0.5, "rgba(96, 185, 255, 0.2)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  constructor() {
    const moteTex = this.createMoteTexture();
    const layerConfigs = [
      { count: 240, speedMult: 1.8, size: 0.46, color: 0xbae6fd, boxRadius: 42, depth: 95 },
      { count: 320, speedMult: 1.0, size: 0.36, color: 0x7dd3fc, boxRadius: 52, depth: 115 },
      { count: 260, speedMult: 0.5, size: 0.28, color: 0xc4b5fd, boxRadius: 64, depth: 135 },
    ];

    for (const cfg of layerConfigs) {
      const positions = new Float32Array(cfg.count * 3);
      for (let i = 0; i < cfg.count; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * cfg.boxRadius * 2;
        positions[i3 + 1] = (Math.random() - 0.5) * cfg.boxRadius * 1.5;
        positions[i3 + 2] = -Math.random() * cfg.depth;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: cfg.color,
        size: cfg.size,
        ...(moteTex ? { map: moteTex } : {}),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.group.add(points);

      this.layers.push({
        points,
        speedMult: cfg.speedMult,
        count: cfg.count,
      });
    }

    // Crisp velocity-stretched warp streaks around camera frustum perimeter
    this.streakSeeds = new Float32Array(this.streakCount * 4);
    this.streakPositions = new Float32Array(this.streakCount * 2 * 3);
    this.streakColors = new Float32Array(this.streakCount * 2 * 3);
    for (let i = 0; i < this.streakCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radial = 11.5 + Math.pow(Math.random(), 0.78) * 52;
      const i4 = i * 4;
      this.streakSeeds[i4] = Math.cos(angle) * radial;
      this.streakSeeds[i4 + 1] = Math.sin(angle) * radial * 0.72;
      this.streakSeeds[i4 + 2] = -10 - Math.random() * 120;
      this.streakSeeds[i4 + 3] = 0.75 + Math.random() * 1.35;
    }

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute("position", new THREE.BufferAttribute(this.streakPositions, 3));
    sGeo.setAttribute("color", new THREE.BufferAttribute(this.streakColors, 3));
    this.streakLines = new THREE.LineSegments(
      sGeo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.streakLines.frustumCulled = false;
    this.streakLines.name = "velocity-warp-streaks";
    this.group.add(this.streakLines);
  }

  update(
    cameraPos: THREE.Vector3,
    cameraQuat: THREE.Quaternion,
    velocity: THREE.Vector3,
    thrust: number,
    isDriving: boolean,
    dt: number,
  ) {
    this.group.position.copy(cameraPos);
    this.group.quaternion.copy(cameraQuat);

    const speed = velocity.length();
    const threshold = 300;
    const isFlightAtSpeed = isDriving && speed >= threshold;
    const flightSpeedRatio = isFlightAtSpeed
      ? clamp((speed - threshold) / (SHIP_MAX_SPEED - threshold), 0, 1)
      : 0;
    const boostGlow = isFlightAtSpeed ? clamp((thrust - 1.5) / 1.5, 0, 1) : 0;
    const baseOpacity = isFlightAtSpeed ? 0.1 + 0.32 * flightSpeedRatio : 0;
    const speedFactor = Math.max(10, speed);

    for (const layer of this.layers) {
      const mat = layer.points.material as THREE.PointsMaterial;
      mat.opacity = baseOpacity * (layer.speedMult > 1.2 ? 0.85 : 0.55);

      const posAttr = layer.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const step = speedFactor * layer.speedMult * dt;

      for (let i = 0; i < layer.count; i++) {
        const i3 = i * 3;
        posArray[i3 + 2] += step;

        if (posArray[i3 + 2] > -6) {
          posArray[i3] = (Math.random() - 0.5) * 70;
          posArray[i3 + 1] = (Math.random() - 0.5) * 52;
          posArray[i3 + 2] = -95 - Math.random() * 35;
        }
      }
      posAttr.needsUpdate = true;
    }

    const streakMat = this.streakLines.material as THREE.LineBasicMaterial;
    streakMat.opacity = isFlightAtSpeed ? 0.14 + 0.32 * flightSpeedRatio + 0.12 * boostGlow : 0;
    if (!isFlightAtSpeed) return;

    const streakLenBase = 1.2 + Math.min(speed * 0.032, 12) + boostGlow * 3.5;
    for (let i = 0; i < this.streakCount; i++) {
      const i4 = i * 4;
      const mult = this.streakSeeds[i4 + 3];
      this.streakSeeds[i4 + 2] += speedFactor * mult * 1.15 * dt;
      if (this.streakSeeds[i4 + 2] > -4) {
        const angle = Math.random() * Math.PI * 2;
        const radial = 11.5 + Math.pow(Math.random(), 0.78) * 52;
        this.streakSeeds[i4] = Math.cos(angle) * radial;
        this.streakSeeds[i4 + 1] = Math.sin(angle) * radial * 0.72;
        this.streakSeeds[i4 + 2] = -100 - Math.random() * 45;
      }

      const sx = this.streakSeeds[i4];
      const sy = this.streakSeeds[i4 + 1];
      const sz = this.streakSeeds[i4 + 2];
      const len = streakLenBase * mult;
      const depthFade = clamp(1 - (-sz) / 135, 0.15, 1);

      const p6 = i * 6;
      this.streakPositions[p6] = sx;
      this.streakPositions[p6 + 1] = sy;
      this.streakPositions[p6 + 2] = sz;
      this.streakPositions[p6 + 3] = sx;
      this.streakPositions[p6 + 4] = sy;
      this.streakPositions[p6 + 5] = sz - len;

      this.streakColors[p6] = (0.76 + boostGlow * 0.24) * depthFade;
      this.streakColors[p6 + 1] = (0.94 + boostGlow * 0.06) * depthFade;
      this.streakColors[p6 + 2] = 1.0 * depthFade;
      this.streakColors[p6 + 3] = (0.14 + boostGlow * 0.3) * depthFade * 0.35;
      this.streakColors[p6 + 4] = (0.48 + boostGlow * 0.1) * depthFade * 0.35;
      this.streakColors[p6 + 5] = 0.95 * depthFade * 0.42;
    }
    (this.streakLines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.streakLines.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}
