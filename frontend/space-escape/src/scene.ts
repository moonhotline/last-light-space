import { weatherMaterials } from "./weathering";
import { AdventureView, optimizeModel, type FiringTool } from "./adventure-view";
import { missionObjective } from "../shared/objectives";
import { celestialCockpitPose, celestialFlightFrame } from "../shared/celestial-flight";
import { InterplanetarySystem, computeCelestialAlignment } from "./interplanetary";
import { buildAtmosphereMaterial } from "./celestial-visuals";
import { cosmicAudio } from "./sound-engine";
import { HOME_PLANET_SPHERE } from "../shared/colliders";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  terrainMesh,
  groundAt,
  noise,
  hash,
  ROCKS,
  BEACON_SITES,
  CRYSTALS,
  THERMALS,
  SCENIC_SITES,
  SPAWN,
  HALF,
  WORLD_SIZE,
  distance,
  clamp,
  smooth,
  type Vec,
} from "../shared/map";
import { PLAYER_COLORS, type Snapshot, type Player } from "../shared/types";
import type { MovementWorld } from "../shared/physics";
import { PortalView } from "./portal-view";
import { SOLAR_SYSTEM } from "../shared/celestial";
import { SPAWN_FLEET, SHIP_MAX_SPEED } from "../shared/adventure-data";
import { FOOT_OFFSET, playerUp, surfaceOrientation, eyePosition, viewOrientation } from "../shared/surface";
import { equipmentModel } from "./equipment-model";
import type { PortalColor } from "../shared/portals";

export type Equipment = "none" | "rifle" | "grapple" | "camera" | "portal";
const COLORS = PLAYER_COLORS.map((c) => c.hex);
const v3 = (v: Vec) => new THREE.Vector3(v.x, v.y, v.z);
const vertex = `varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition; void main(){vUv=uv;vNormal=normal;vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const glowMaterial = (color: number, opacity = 0.5) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
}

/**
 * Near-field Stardust Parallax & Velocity-Stretched Warp Streak Field:
 * Combines 3 subtle parallax mote layers with 640 sharp velocity-stretched luminous
 * speed lines so high-speed flight & afterburner feel razor-sharp instead of snowy dots.
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
    this.streakSeeds = new Float32Array(this.streakCount * 4); // x, y, z, speedMult
    this.streakPositions = new Float32Array(this.streakCount * 2 * 3);
    this.streakColors = new Float32Array(this.streakCount * 2 * 3);
    for (let i = 0; i < this.streakCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Keep center cockpit reticle unobstructed; concentrate streaks in sleek peripheral cone
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

      // Luminous white-cyan leading tip fading into deep electric blue/violet tail
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
function createNameplateSprite(name: string, colorHex: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);

  // Background rounded rect pill
  ctx.fillStyle = "rgba(8, 14, 24, 0.78)";
  const x = 12, y = 10, w = 232, h = 44, r = 16;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();

  // Team color border
  const hex = "#" + colorHex.toString(16).padStart(6, "0");
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = hex;
  ctx.stroke();

  // Small glowing indicator dot
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(36, 32, 6, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.font = "bold 22px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText((name || "探索员").slice(0, 10), 52, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.4, 0.35, 1);
  sprite.position.set(0, 2.15, 0);
  sprite.name = "nameplate";
  return sprite;
}
export class GameView {
  scene = new THREE.Scene();
  private portals: PortalView;
  skyScene = new THREE.Scene();
  skyCamera = new THREE.PerspectiveCamera(66, 1, 100, 30000);
  camera = new THREE.PerspectiveCamera(66, 1, 0.1, 30000);
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  sky = new THREE.Group();
  earth = new THREE.Group();
  moon = new THREE.Group();
  private flightPosition: THREE.Vector3 | null = null;
  private flightShipKind: string | null = null;
  sun = new THREE.DirectionalLight(0xffe2b3, 3.1);
  ready = false;
  frames = 0;
  thirdPerson = true;
  cameraOverride: { position: THREE.Vector3; lookAt: THREE.Vector3 } | null = null;
  effects = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.55;
  listener: THREE.AudioListener | null = null;
  music: THREE.Audio | null = null;
  hum: THREE.Audio | null = null;
  sounds = new Map<string, THREE.Audio>();
  musicLayers: THREE.Audio[] = [];
  jetGain: GainNode | null = null;
  jetFilter: BiquadFilterNode | null = null;
  astronaut = new THREE.Group();
  astronautAnimations: THREE.AnimationClip[] = [];
  avatarMixers = new Map<
    string,
    {
      mixer: THREE.AnimationMixer;
      actions: Record<string, THREE.AnimationAction>;
      currentAction: string;
      head?: THREE.Object3D;
      torso?: THREE.Object3D;
      armL?: THREE.Object3D;
      armR?: THREE.Object3D;
    }
  >();
  hoverboardAsset: THREE.Group | null = null;
  rifleAsset: THREE.Group | null = null;
  grappleAsset: THREE.Group | null = null;
  cameraAsset: THREE.Group | null = null;
  obeliskAsset: THREE.Group | null = null;
  activeWeapon: Equipment = "none";
  weaponSwitchTime = 0;
  cameraZoom = 1.0;
  fpRifle: THREE.Group | null = null;
  fpGrapple: THREE.Group | null = null;
  fpCamera: THREE.Group | null = null;
  fpPortal: THREE.Group | null = null;
  private readonly portalLights = new Set<THREE.MeshStandardMaterial>();
  private portalColor: PortalColor = "blue";
  private toolPass: RenderPass;
  private readonly toolScene = new THREE.Scene();
  private readonly toolCamera = new THREE.PerspectiveCamera(66, 1, 0.04, 8);
  toolModel = new THREE.Group();
  private rifleEnvironment: THREE.WebGLRenderTarget | null = null;
  private flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: this.radialTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  private firingTool: FiringTool | null = null;
  private flashAge = Infinity;
  private rifleNoise: AudioBuffer | null = null;
  private rifleFill = new THREE.PointLight(0xfff5e8, 0.45, 2, 2);
  interplanetary: InterplanetarySystem;
  stardustStream: StardustParallaxStream;
  flightSpringArm = {
    focus: new THREE.Vector3(),
    position: new THREE.Vector3(),
    roll: 0,
    pitch: 0,
    boostLag: 0,
    initialized: false,
  };
  private homePlanetCloudUniforms: { time: { value: number }; opacity: { value: number } } | null = null;
  private homePlanetAtmoUniforms: { intensity: { value: number } } | null = null;
  private skyStarUniforms: { time: { value: number } } | null = null;
  private skyDomeUniforms: { spaceFactor: { value: number } } | null = null;
  private lastShipCollisionId = 0;
  private flightShake = 0;
  private compiling = false;

  async compilePipeline() {
    if (this.compiling) return;
    this.compiling = true;
    try {
      const compilePromises: Promise<any>[] = [
        this.renderer.compileAsync(this.scene, this.camera),
        this.renderer.compileAsync(this.skyScene, this.skyCamera),
      ];
      compilePromises.push(this.renderer.compileAsync(this.toolScene, this.toolCamera));
      await Promise.all(compilePromises);
    } catch {
      /* Fallback if compileAsync is not supported */
    } finally {
      this.compiling = false;
    }
  }

  setWeapon(w: Equipment) {
    if (this.activeWeapon === w) return;
    this.activeWeapon = w;
    this.weaponSwitchTime = 0.25;
    if (w !== "none") this.sound("tool", 1.35);
    if (w === "none") {
      for (const anim of this.avatarMixers.values()) {
        if (anim.armR) anim.armR.quaternion.identity();
        if (anim.armL) anim.armL.quaternion.identity();
        if (anim.torso) anim.torso.quaternion.identity();
      }
    }
    void this.compilePipeline();
  }
  private brightenRifle(root: THREE.Object3D) {
    // Metallic surfaces need broad reflections as well as a small local fill.
    if (!this.rifleEnvironment) {
      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.rifleEnvironment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 });
      room.dispose();
      pmrem.dispose();
    }
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMap = this.rifleEnvironment!.texture;
          material.envMapIntensity = 1.0;
          material.needsUpdate = true;
        }
      }
    });
  }
  setPortalColor(color: PortalColor) {
    if (this.portalColor === color) return;
    this.portalColor = color;
    this.updatePortalLights();
  }

  private updatePortalLights() {
    const color = this.portalColor;
    for (const material of this.portalLights) {
      material.color.setHex(color === "blue" ? 0x0b516f : 0x741722);
      material.emissive.setHex(color === "blue" ? 0x139ae9 : 0xff3045);
    }
  }

  private muzzleFeedback(kind: FiringTool, color: number) {
    if (this.thirdPerson || this.activeWeapon !== kind) return;
    const model = kind === "rifle" ? this.fpRifle : this.fpPortal;
    const muzzle = model?.getObjectByName("weapon-muzzle");
    if (!muzzle) return;
    this.firingTool = kind;
    this.flashAge = 0;
    muzzle.add(this.flash);
    this.flash.material.color.setHex(color);

    // Match the viewmodel's on-screen muzzle even when flight or zoom changed the world FOV.
    const world = muzzle.getWorldPosition(new THREE.Vector3());
    const ratio = this.toolCamera.projectionMatrix.elements[5] / this.camera.projectionMatrix.elements[5];
    world.x *= ratio;
    world.y *= ratio;
    return this.camera.localToWorld(world);
  }

  private addMuzzle(model: THREE.Group, x: number, y: number, z: number) {
    const muzzle = new THREE.Object3D();
    muzzle.name = "weapon-muzzle";
    muzzle.position.set(x, y, z).divideScalar(model.scale.x);
    model.add(muzzle);
  }

  private mountFirstPerson(source: THREE.Group, kind: "rifle" | "grapple" | "camera") {
    const size = kind === "rifle" ? 1.12 : kind === "grapple" ? 0.62 : 0.4;
    const model = equipmentModel(source, size);
    model.name = `first_person_${kind}`;
    model.userData.asset = kind === "rifle" ? "hmg-379" : kind;
    const pos = kind === "camera"
      ? new THREE.Vector3(0.3, -0.17, -0.52)
      : new THREE.Vector3(0.34, -0.22, kind === "rifle" ? -0.85 : -0.68);
    model.position.copy(pos);
    if (kind === "rifle") this.addMuzzle(model, 0.078, 0.084, -0.577);
    this.toolModel.add(model);
    if (kind === "grapple") {
      const light = new THREE.PointLight(0x65e6ff, 1.5, 2.4, 2);
      light.name = "grapple_point_light";
      light.position.set(0, 0.08, 0.2);
      model.add(light);
    }
    model.visible = this.activeWeapon === kind;
    return model;
  }
  avatars = new Map<string, THREE.Group>();
  beacons: THREE.Group[] = [];
  beaconBeams: THREE.Mesh[] = [];
  crystals: THREE.InstancedMesh;
  crystalHalo: THREE.InstancedMesh;
  thermalGroups: THREE.Group[] = [];
  markers = new Map<string, THREE.Group>();
  raycaster = new THREE.Raycaster();
  terrain!: THREE.Mesh;
  particlePoints: THREE.Points;
  particles: Particle[] = [];
  particlePositions = new Float32Array(240 * 3);
  particleColors = new Float32Array(240 * 3);
  particleSizes = new Float32Array(240);
  lastCollected = 0;
  lastLanding = 0;
  lastDash = 0;
  lastLevel = 0;
  lastY = 0;
  shake = 0;
  jetTimer = 0;
  footTimer = 0;
  lastMe = "";
  cameraObstructed = false;
  cameraRange = 8;
  adventure: AdventureView;
  private dummy = new THREE.Object3D();
  private cinematic: ShaderPass;
  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    this.portals = new PortalView(this.scene, this.skyScene, this.renderer);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // Ultra-subtle deep cosmic dust haze instead of thick blue fog overlay
    this.scene.fog = new THREE.FogExp2(0x0c141d, 0.00004);
    this.scene.add(new THREE.HemisphereLight(0x8db4d8, 0x222f3a, 1.8));
    this.sun.position.set(-240, 190, -140);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -95,
      right: 95,
      top: 95,
      bottom: -95,
      near: 1,
      far: 600,
    });
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.22;
    this.scene.add(this.sun, this.sun.target, this.camera);
    this.rifleFill.name = "rifle_point_light";
    this.rifleFill.position.set(-0.3, 0.15, 0.05);
    this.toolModel.add(this.rifleFill);
    this.toolCamera.add(this.toolModel);
    this.toolScene.add(this.toolCamera, new THREE.HemisphereLight(0xd8ebff, 0x41444c, 1.5));
    const toolKey = new THREE.DirectionalLight(0xe6f1ff, 1.6);
    toolKey.position.set(-1, 2, 1);
    this.toolScene.add(toolKey);
    this.stardustStream = new StardustParallaxStream();
    this.scene.add(this.stardustStream.group);
    this.buildSky();
    this.buildTerrain();
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x95f5ff,
      emissive: 0x4acded,
      emissiveIntensity: 1.3,
      metalness: 0.45,
      roughness: 0.2,
    });
    this.crystals = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.5, 0),
      crystalMat,
      CRYSTALS.length,
    );
    this.crystalHalo = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.8, 0),
      glowMaterial(0x65daff, 0.12),
      CRYSTALS.length,
    );
    this.crystals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crystalHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crystals.frustumCulled = false;
    this.crystalHalo.frustumCulled = false;
    this.scene.add(this.crystals, this.crystalHalo);
    this.buildThermals();
    this.adventure = new AdventureView(
      this.scene,
      (p, n, c, s) => this.burst(p, n, c, s),
      (n, p) => this.sound(n, p),
      (kind, color) => this.muzzleFeedback(kind, color),
    );
    this.interplanetary = new InterplanetarySystem(this.scene, this.camera);
    this.interplanetary.setShipReference(this.adventure.ship);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute(
      "position",
      new THREE.BufferAttribute(this.particlePositions, 3),
    );
    pg.setAttribute("color", new THREE.BufferAttribute(this.particleColors, 3));
    pg.setAttribute("size", new THREE.BufferAttribute(this.particleSizes, 1));
    this.particlePoints = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `attribute float size; varying vec3 vColor; void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*420./max(1.,-p.z),0.,85.);}`,
        fragmentShader: `varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(vColor,pow(1.-d,2.));}`,
      }),
    );
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
    this.renderer.info.autoReset = false;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.skyScene, this.skyCamera));
    const worldPass = new RenderPass(this.scene, this.camera);
    worldPass.clear = false;
    worldPass.clearDepth = true;
    this.composer.addPass(worldPass);
    // First-person props have their own depth buffer and never intersect world geometry.
    this.toolPass = new RenderPass(this.toolScene, this.toolCamera);
    this.toolPass.clear = false;
    this.toolPass.clearDepth = true;
    this.composer.addPass(this.toolPass);
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(800, 600),
      0.34,
      0.55,
      1.2,
    );
    this.composer.addPass(this.bloom);
    this.cinematic = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse;uniform float time;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec2 p=vUv-.5;float vignette=1.-.32*dot(p,p);c*=vignette;gl_FragColor=vec4(c,1.);}`,
    });
    this.composer.addPass(this.cinematic);
    this.composer.addPass(new OutputPass());
    this.resize();
    addEventListener("resize", () => this.resize());
  }
  buildTerrain() {
    const { vertices, indices } = terrainMesh(),
      g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    g.setIndex(new THREE.BufferAttribute(indices, 1));
    g.computeVertexNormals();
    const normals = g.getAttribute("normal"),
      colors = new Float32Array(vertices.length),
      uv = new Float32Array((vertices.length / 3) * 2);
    const dark = new THREE.Color(0x364e61),
      ice = new THREE.Color(0x9aafb5),
      sand = new THREE.Color(0x8d9290),
      snow = new THREE.Color(0xdce9ee),
      redRock = new THREE.Color(0x8d4d3d),
      blueIce = new THREE.Color(0x9fc4cf),
      temp = new THREE.Color();
    for (let i = 0; i < vertices.length / 3; i++) {
      const x = vertices[i * 3],
        y = vertices[i * 3 + 1],
        z = vertices[i * 3 + 2],
        flat = normals.getY(i);
      temp
        .copy(dark)
        .lerp(
          ice,
          smooth((flat - 0.62) / 0.37) *
            (0.38 + noise(x * 0.015, z * 0.015) * 0.48),
        );
      temp.lerp(sand, noise(x * 0.009 + 12, z * 0.009) * 0.22);
      temp.multiplyScalar(0.8 + noise(x * 0.11, z * 0.11) * 0.28);
      if (y > 170)
        temp.lerp(ice, smooth((y - 170) / 100) * Math.max(0, flat) * 0.52);
      const north = smooth((z - 520) / 420);
      const west = smooth((-x - 520) / 520) * smooth((-z - 60) / 620);
      const east = smooth((x - 520) / 560) * smooth((z + 180) / 720);
      temp.lerp(snow, north * 0.32);
      temp.lerp(redRock, west * 0.34);
      temp.lerp(blueIce, east * 0.28);
      temp.toArray(colors, i * 3);
      uv[i * 2] = x / 35;
      uv[i * 2 + 1] = z / 35;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const n = 512,
      data = new Uint8Array(n * n * 4);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 4;
        const strata = Math.sin(z * 0.14 + Math.sin(x * 0.05) * 2.2) * 14;
        const v = clamp(
          Math.round(
            128 +
              strata +
              48 * noise(x * 0.032, z * 0.032) +
              28 * noise(x * 0.12, z * 0.12) +
              18 * noise(x * 0.36, z * 0.36) +
              14 * hash(x, z),
          ),
          30,
          255,
        );
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, n, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 16;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.89,
      metalness: 0.09,
      map: tex,
      bumpMap: tex,
      bumpScale: 0.28,
    });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    const rockGeo = new THREE.IcosahedronGeometry(1, 3),
      rp = rockGeo.getAttribute("position");
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i),
        y = rp.getY(i),
        z = rp.getZ(i),
        k = 0.86 + noise(x * 8 + 11, z * 8 + y * 2) * 0.24;
      rp.setXYZ(i, x * k, y * k, z * k);
    }
    rockGeo.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshStandardMaterial({
        color: 0x586977,
        roughness: 0.9,
        map: tex,
        bumpMap: tex,
        bumpScale: 0.28,
      }),
      ROCKS.length,
    );
    ROCKS.forEach((r, i) => {
      this.dummy.position.set(r.x, r.y + r.size * 0.3, r.z);
      this.dummy.scale.set(r.size, r.size * 0.8, r.size * 0.72);
      this.dummy.rotation.set(r.angle * 0.23, r.angle, r.angle * 0.12);
      this.dummy.updateMatrix();
      rocks.setMatrixAt(i, this.dummy.matrix);
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;

    // Converge the playable basin seamlessly into a complete high-poly spherical home planet.
    const homePlanetGroup = new THREE.Group();
    homePlanetGroup.name = "converged-home-planet";
    const { center: hpCenter, radius: hpRadius, cloudRadius: hpCloudR, atmosphereRadius: hpAtmoR } = HOME_PLANET_SPHERE;

    // 1. Seamless curved planetary continental shelf bridging the square basin onto the spherical globe (256 x 48 = 24,576 tris)
    const angular = 256;
    const rings = 48;
    const skirtPos = new Float32Array((angular + 1) * (rings + 1) * 3);
    const skirtCol = new Float32Array((angular + 1) * (rings + 1) * 3);
    const skirtUv = new Float32Array((angular + 1) * (rings + 1) * 2);
    const skirtIndices: number[] = [];
    const skirtTemp = new THREE.Color();
    for (let row = 0; row <= rings; row++) {
      const u = row / rings;
      // Gentle S-curve slope down onto the spherical crust (no abrupt vertical mesa wall)
      const uSmooth = u * u * (3 - 2 * u);
      for (let col = 0; col <= angular; col++) {
        const angle = (col / angular) * Math.PI * 2;
        const dx = Math.sin(angle);
        const dz = Math.cos(angle);
        const sqEdge = HALF / Math.max(Math.abs(dx), Math.abs(dz));
        const edgeX = dx * sqEdge;
        const edgeZ = dz * sqEdge;
        const edgeY = groundAt(clamp(edgeX, -HALF + 1, HALF - 1), clamp(edgeZ, -HALF + 1, HALF - 1));

        // Expand gently across a broad 1,450m continental slope to weld flush into the round R=3800 sphere
        const outerR = Math.min(hpRadius * 0.94, Math.max(sqEdge + 1100, 3250));
        const r = sqEdge + (outerR - sqEdge) * Math.pow(u, 0.92);
        const x = dx * r;
        const z = dz * r;

        // Exact spherical crust height at radial distance r
        const sphereY = hpCenter.y + Math.sqrt(Math.max(1, hpRadius * hpRadius - r * r));
        const ridge = 1 - Math.abs(noise(x * 0.0024 + 70, z * 0.0024 - 40) * 2 - 1);
        const crag = 1 - Math.abs(noise(x * 0.008 + 12, z * 0.008) * 2 - 1);
        const mountainEnvelope = Math.sin(u * Math.PI) * (1 - u * 0.55);
        const mountainBump = mountainEnvelope * (75 * Math.pow(ridge, 2.4) + 28 * Math.pow(crag, 3.5));
        const y = edgeY * (1 - uSmooth) + (sphereY + 1.5) * uSmooth + mountainBump;

        const vIdx = row * (angular + 1) + col;
        const vi = vIdx * 3;
        skirtPos[vi] = x;
        skirtPos[vi + 1] = y;
        skirtPos[vi + 2] = z;
        skirtUv[vIdx * 2] = x / 35;
        skirtUv[vIdx * 2 + 1] = z / 35;

        // Match basin edge biomes near u=0, blending smoothly into the spherical planet's slate/ice crust near u=1
        skirtTemp.setHex(0x3a5264).lerp(new THREE.Color(0x6e8596), ridge * 0.52);
        if (z > 400) skirtTemp.lerp(new THREE.Color(0xcde0ea), smooth((z - 400) / 800) * 0.38);
        if (x < -400 && z < 200) skirtTemp.lerp(new THREE.Color(0x884c3d), smooth((-x - 400) / 800) * 0.34);
        if (x > 400) skirtTemp.lerp(new THREE.Color(0x8ab3c2), smooth((x - 400) / 800) * 0.28);
        skirtTemp.lerp(new THREE.Color(0x284054), uSmooth * 0.55);
        skirtTemp.toArray(skirtCol, vi);

        if (row < rings && col < angular) {
          const a = vIdx;
          const b = a + 1;
          const c = a + angular + 1;
          skirtIndices.push(a, c, b, b, c, c + 1);
        }
      }
    }
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute("position", new THREE.BufferAttribute(skirtPos, 3));
    skirtGeo.setAttribute("color", new THREE.BufferAttribute(skirtCol, 3));
    skirtGeo.setAttribute("uv", new THREE.BufferAttribute(skirtUv, 2));
    skirtGeo.setIndex(skirtIndices);
    skirtGeo.computeVertexNormals();
    // Blend outer ring normals smoothly into the spherical radial normal for a seamless terminator
    const sNorm = skirtGeo.getAttribute("normal");
    const tmpN = new THREE.Vector3();
    const radN = new THREE.Vector3();
    for (let row = 0; row <= rings; row++) {
      const blend = Math.pow(row / rings, 1.4);
      for (let col = 0; col <= angular; col++) {
        const idx = row * (angular + 1) + col;
        tmpN.fromBufferAttribute(sNorm, idx);
        radN.set(
          skirtPos[idx * 3] - hpCenter.x,
          skirtPos[idx * 3 + 1] - hpCenter.y,
          skirtPos[idx * 3 + 2] - hpCenter.z,
        ).normalize();
        tmpN.lerp(radN, blend).normalize();
        sNorm.setXYZ(idx, tmpN.x, tmpN.y, tmpN.z);
      }
    }
    const skirtMesh = new THREE.Mesh(
      skirtGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.08,
        map: tex,
        bumpMap: tex,
        bumpScale: 0.24,
      }),
    );
    skirtMesh.name = "home-planet-horizon-skirt";
    homePlanetGroup.add(skirtMesh);

    // 2. Full high-poly spherical home planet globe (144 x 96 = 27,648 tris) with crisp 512x256 multi-biome crust texture
    const globeW = 512;
    const globeH = 256;
    const globeData = new Uint8Array(globeW * globeH * 4);
    const globeBump = new Uint8Array(globeW * globeH * 4);
    const cOcean = new THREE.Color(0x162b3d).convertLinearToSRGB();
    const cSlate = new THREE.Color(0x3a5266).convertLinearToSRGB();
    const cRed = new THREE.Color(0x7c4536).convertLinearToSRGB();
    const cIce = new THREE.Color(0xcadfe8).convertLinearToSRGB();
    const gc = new THREE.Color();
    for (let row = 0; row < globeH; row++) {
      const lat = (row / (globeH - 1) - 0.5) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      for (let col = 0; col < globeW; col++) {
        const lon = (col / (globeW - 1)) * Math.PI * 2;
        const sx = -Math.cos(lon) * cosLat;
        const sy = sinLat;
        const sz = Math.sin(lon) * cosLat;
        const cont =
          Math.sin(sx * 4.5 + sy * 3.8 + sz * 3.1) * 0.45 +
          Math.sin(sy * 11.2 - sz * 9.5 + sx * 7.8) * 0.25 +
          Math.sin(sz * 27.0 + sx * 21.0 - sy * 17.0) * 0.14;
        const elev = 0.5 + cont * 0.54;
        if (elev < 0.44) {
          gc.copy(cOcean).lerp(cSlate, clamp(elev / 0.44, 0, 1) * 0.45);
        } else if (elev < 0.72) {
          gc.copy(cSlate).lerp(cRed, clamp((sx + 0.4) * 0.65, 0, 1) * 0.45);
        } else {
          gc.copy(cSlate).lerp(cIce, clamp((elev - 0.72) / 0.28, 0, 1));
        }
        if (Math.abs(sy) > 0.78) {
          gc.lerp(cIce, clamp((Math.abs(sy) - 0.78) / 0.18, 0, 1) * 0.85);
        }
        const off = (row * globeW + col) * 4;
        globeData[off] = (gc.r * 255) | 0;
        globeData[off + 1] = (gc.g * 255) | 0;
        globeData[off + 2] = (gc.b * 255) | 0;
        globeData[off + 3] = 255;
        const bVal = (clamp(elev, 0, 1) * 255) | 0;
        globeBump[off] = globeBump[off + 1] = globeBump[off + 2] = bVal;
        globeBump[off + 3] = 255;
      }
    }
    const globeTex = new THREE.DataTexture(globeData, globeW, globeH);
    globeTex.colorSpace = THREE.SRGBColorSpace;
    globeTex.wrapS = THREE.RepeatWrapping;
    globeTex.generateMipmaps = true;
    globeTex.minFilter = THREE.LinearMipmapLinearFilter;
    globeTex.anisotropy = 16;
    globeTex.needsUpdate = true;

    const globeBumpTex = new THREE.DataTexture(globeBump, globeW, globeH);
    globeBumpTex.wrapS = THREE.RepeatWrapping;
    globeBumpTex.generateMipmaps = true;
    globeBumpTex.minFilter = THREE.LinearMipmapLinearFilter;
    globeBumpTex.needsUpdate = true;

    const planetGlobe = new THREE.Mesh(
      new THREE.SphereGeometry(hpRadius, 144, 96),
      new THREE.MeshStandardMaterial({
        map: globeTex,
        bumpMap: globeBumpTex,
        bumpScale: 12,
        roughness: 0.88,
        metalness: 0.08,
        emissive: 0x0b1926,
        emissiveIntensity: 0.22,
      }),
    );
    planetGlobe.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
    planetGlobe.name = "home-planet-globe";
    homePlanetGroup.add(planetGlobe);

    // 3. Animated Orbital Cloud Deck (fades cleanly when down inside the basin, blooms from orbit)
    this.homePlanetCloudUniforms = { time: { value: 0 }, opacity: { value: 0 } };
    const cloudShell = new THREE.Mesh(
      new THREE.SphereGeometry(hpCloudR, 128, 96),
      new THREE.ShaderMaterial({
        uniforms: this.homePlanetCloudUniforms,
        vertexShader: `
          varying vec3 vUnit;
          void main() {
            vUnit = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform float time;
          uniform float opacity;
          varying vec3 vUnit;
          void main() {
            // Keep the north polar basin opening subtle at low altitude
            float polarClear = smoothstep(0.82, 0.52, vUnit.y);
            float swirl = sin(vUnit.x * 11.0 + time * 0.04 + sin(vUnit.z * 9.0)) * 0.5
                        + sin(vUnit.y * 19.0 + vUnit.z * 14.0 - time * 0.03) * 0.3
                        + sin(vUnit.x * 31.0 - vUnit.y * 23.0 + time * 0.06) * 0.2;
            float cloud = smoothstep(0.08, 0.72, swirl * 0.5 + 0.5);
            float alpha = cloud * opacity * (0.28 + 0.72 * polarClear);
            gl_FragColor = vec4(vec3(0.84, 0.92, 0.98), alpha);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    cloudShell.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
    cloudShell.name = "home-planet-clouds";
    homePlanetGroup.add(cloudShell);

    // 4. Fresnel Rayleigh Atmosphere Limb Shell wrapping the converged home planet (fades to 0 inside basin so zenith stars stay crystal clear)
    const homeAtmoMat = buildAtmosphereMaterial(0x52b6f0, 0, false);
    this.homePlanetAtmoUniforms = homeAtmoMat.uniforms as { intensity: { value: number } };
    const homeAtmo = new THREE.Mesh(
      new THREE.SphereGeometry(hpAtmoR, 128, 96),
      homeAtmoMat,
    );
    homeAtmo.position.set(hpCenter.x, hpCenter.y, hpCenter.z);
    homeAtmo.name = "home-planet-atmosphere";
    homePlanetGroup.add(homeAtmo);

    // Progressive frame-sliced mounting to eliminate single-frame synchronous upload stalls
    requestAnimationFrame(() => {
      this.scene.add(rocks);
      requestAnimationFrame(() => {
        this.scene.add(homePlanetGroup);
        void this.compilePipeline();
      });
    });
  }
  buildSky() {
    this.skyScene.add(this.sky);
    // Rich GPU-friendly cosmic sky dome with deep obsidian space, Milky Way band, dust lanes & altitude-aware horizon haze
    this.skyDomeUniforms = { spaceFactor: { value: 0 } };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyDomeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: vertex,
      fragmentShader: `
        uniform float spaceFactor;
        varying vec3 vPosition;
        float gyroid(vec3 p) {
          return dot(sin(p), cos(p.yzx));
        }
        void main() {
          vec3 d = normalize(vPosition);
          // Deep obsidian cosmic void everywhere in orbit; delicate atmospheric twilight band near surface horizon only
          vec3 deepCosmos = vec3(0.004, 0.008, 0.018);
          float horizonBand = exp(-pow(abs(d.y) * 5.2, 1.6)) * (1.0 - spaceFactor * 0.92);
          vec3 horizonTint = vec3(0.09, 0.16, 0.24) * horizonBand;
          vec3 c = deepCosmos + horizonTint;

          // Inclined Milky Way galactic plane with smooth analytic nebula & dark dust rift
          vec3 galNormal = normalize(vec3(0.36, 0.62, -0.69));
          float galLat = abs(dot(d, galNormal));
          float band = exp(-pow(galLat * 4.2, 2.0));
          float g1 = gyroid(d * 5.2) * 0.35 + 0.5;
          float g2 = gyroid(d * 12.8 + vec3(1.7, -2.3, 0.9)) * 0.32 + 0.5;
          float dustRift = smoothstep(0.46, 0.82, gyroid(d * 9.4 - vec3(2.4, 1.1, 3.2)) * 0.35 + 0.5);

          vec3 galCore = mix(vec3(0.03, 0.09, 0.22), vec3(0.22, 0.14, 0.34), g1);
          vec3 galGold = vec3(0.26, 0.18, 0.11) * smoothstep(0.5, 0.88, g2);
          vec3 tealNebula = vec3(0.025, 0.16, 0.24) * smoothstep(0.55, 0.92, g1 * g2 * 1.4);
          float visibility = mix(smoothstep(-0.1, 0.22, d.y) * 0.72 + 0.28, 1.0, spaceFactor);
          c += (galCore * (0.42 + g1 * 0.88) + galGold * 0.52) * band * (1.0 - dustRift * 0.62) * visibility;
          c += tealNebula * 0.2 * visibility;

          // Warm solar atmospheric scattering glow
          float s = pow(max(0.0, dot(d, normalize(vec3(-0.65, 0.19, -0.5)))), 28.0);
          c += vec3(0.26, 0.15, 0.055) * s;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(18000, 64, 48),
      skyMat,
    );
    dome.renderOrder = -10;
    this.sky.add(dome);

    // 14,000 multi-spectral stars across full sphere with realistic stellar color temperatures
    const starCount = 14000;
    const stars = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const spectralColors: [number, number, number][] = [
      [0.68, 0.82, 1.0],  // O/B blue-white
      [0.86, 0.92, 1.0],  // A white-blue
      [1.0, 0.98, 0.95],  // F crisp white
      [1.0, 0.92, 0.76],  // G warm solar gold
      [1.0, 0.76, 0.54],  // K/M amber giant
    ];
    const galU = new THREE.Vector3(0.86, -0.18, 0.48).normalize();
    const galV = new THREE.Vector3(-0.34, 0.75, 0.56).normalize();
    const galN = new THREE.Vector3().crossVectors(galU, galV).normalize();
    for (let i = 0; i < starCount; i++) {
      let sx: number, sy: number, sz: number;
      if (i < starCount * 0.42) {
        // Concentrated along the Milky Way band
        const theta = hash(i, 1) * Math.PI * 2;
        const spread = (hash(i, 2) + hash(i, 13) - 1.0) * 0.34;
        const cosS = Math.cos(spread);
        const sinS = Math.sin(spread);
        const dir = new THREE.Vector3()
          .addScaledVector(galU, Math.cos(theta) * cosS)
          .addScaledVector(galV, Math.sin(theta) * cosS)
          .addScaledVector(galN, sinS)
          .normalize();
        sx = dir.x;
        sy = dir.y;
        sz = dir.z;
      } else {
        // Uniform full-sphere deep field
        const a = hash(i, 1) * Math.PI * 2;
        const y = hash(i, 2) * 2 - 1;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        sx = Math.cos(a) * r;
        sy = y;
        sz = Math.sin(a) * r;
      }
      const dist = 13800 + hash(i, 5) * 1400;
      const b = 0.2 + Math.pow(hash(i, 8), 5) * 1.15;
      const spec = spectralColors[Math.floor(hash(i, 17) * spectralColors.length)];
      stars.set([sx * dist, sy * dist, sz * dist], i * 3);
      colors.set([spec[0] * b, spec[1] * b, spec[2] * b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const starfield = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 14,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    this.sky.add(starfield);

    // 900 bright hero stars with soft radial glow & subtle scintillation
    const heroCount = 900;
    const heroPos = new Float32Array(heroCount * 3);
    const heroCol = new Float32Array(heroCount * 3);
    const heroSize = new Float32Array(heroCount);
    const heroPhase = new Float32Array(heroCount);
    for (let i = 0; i < heroCount; i++) {
      const a = hash(i + 5000, 1) * Math.PI * 2;
      const y = hash(i + 5000, 2) * 2 - 1;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const dist = 13500;
      heroPos.set([Math.cos(a) * r * dist, y * dist, Math.sin(a) * r * dist], i * 3);
      const spec = spectralColors[Math.floor(hash(i + 5000, 11) * spectralColors.length)];
      const lum = 0.7 + hash(i + 5000, 14) * 0.7;
      heroCol.set([spec[0] * lum, spec[1] * lum, spec[2] * lum], i * 3);
      heroSize[i] = 2.6 + Math.pow(hash(i + 5000, 19), 2) * 4.2;
      heroPhase[i] = hash(i + 5000, 23) * Math.PI * 2;
    }
    const heroGeo = new THREE.BufferGeometry();
    heroGeo.setAttribute("position", new THREE.BufferAttribute(heroPos, 3));
    heroGeo.setAttribute("color", new THREE.BufferAttribute(heroCol, 3));
    heroGeo.setAttribute("aSize", new THREE.BufferAttribute(heroSize, 1));
    heroGeo.setAttribute("aPhase", new THREE.BufferAttribute(heroPhase, 1));
    this.skyStarUniforms = { time: { value: 0 } };
    const heroStars = new THREE.Points(
      heroGeo,
      new THREE.ShaderMaterial({
        uniforms: this.skyStarUniforms,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        vertexShader: `
          attribute float aSize;
          attribute float aPhase;
          uniform float time;
          varying vec3 vColor;
          varying float vTwinkle;
          void main() {
            vColor = color;
            vTwinkle = 0.78 + 0.22 * sin(time * 2.1 + aPhase);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(aSize * vTwinkle, 1.5, 9.0);
          }`,
        fragmentShader: `
          varying vec3 vColor;
          varying float vTwinkle;
          void main() {
            vec2 p = (gl_PointCoord - 0.5) * 2.0;
            float d = length(p);
            if (d > 1.0) discard;
            float core = exp(-d * d * 7.5);
            float crossSpike = (exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.8) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.8)) * 0.32;
            gl_FragColor = vec4(vColor * (1.2 + core * 0.8), clamp((core + crossSpike) * vTwinkle, 0.0, 1.0));
          }`,
      }),
    );
    this.sky.add(heroStars);

    // Distant sun with optical corona
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(75, 32, 24),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(4, 3, 1.8),
        fog: false,
      }),
    );
    sun.position.set(-7800, 2250, -6200);
    this.sky.add(sun);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.radialTexture(),
        color: 0xffd39b,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(sun.position);
    halo.scale.set(2400, 2400, 1);
    this.sky.add(halo);

    // High-poly 3D Moon with directional lunar terminator shading & high-res surface texture
    this.moon.name = "moon-sky";
    this.moon.position.set(-3600, 1400, -8500);
    const texLoader = typeof document !== "undefined" ? new THREE.TextureLoader() : null;
    const moonTex = texLoader ? texLoader.load("/assets/moon.jpg") : null;
    if (moonTex) {
      moonTex.colorSpace = THREE.SRGBColorSpace;
      moonTex.anisotropy = 16;
    }
    const moonShaderUniforms = {
      map: { value: moonTex },
      hasMap: { value: moonTex ? 1.0 : 0.0 },
      sunDir: { value: new THREE.Vector3(-0.68, 0.35, -0.64).normalize() },
    };
    if (texLoader) {
      texLoader.load("/assets/models/solar_system/textures/Moon_baseColor.png", (hdMoon) => {
        hdMoon.colorSpace = THREE.SRGBColorSpace;
        hdMoon.anisotropy = 16;
        moonShaderUniforms.map.value = hdMoon;
        moonShaderUniforms.hasMap.value = 1.0;
      });
    }
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(180, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: moonShaderUniforms,
        fog: false,
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormalWorld;
          void main() {
            vUv = uv;
            vNormalWorld = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform sampler2D map;
          uniform float hasMap;
          uniform vec3 sunDir;
          varying vec2 vUv;
          varying vec3 vNormalWorld;
          void main() {
            vec3 albedo = hasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(0.76, 0.78, 0.82);
            float ndl = dot(normalize(vNormalWorld), normalize(sunDir));
            float phase = smoothstep(-0.18, 0.85, ndl);
            vec3 earthshine = vec3(0.06, 0.11, 0.18) * (1.0 - phase);
            vec3 col = albedo * (0.14 + phase * 1.12) + earthshine;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.moon.add(moonMesh);
    const moonHaloTex = this.radialTexture();
    if (moonHaloTex) {
      const moonHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: moonHaloTex,
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      moonHalo.scale.set(1150, 1150, 1);
      this.moon.add(moonHalo);
    }
    this.sky.add(this.moon);
  }
  syncSkyCamera() {
    this.sky.position.copy(this.camera.position);
    this.skyCamera.position.copy(this.camera.position);
    this.skyCamera.quaternion.copy(this.camera.quaternion);
    this.skyCamera.fov = this.camera.fov;
    this.skyCamera.aspect = this.camera.aspect;
    this.skyCamera.updateProjectionMatrix();
  }
  radialTexture() {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!,
      g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.12, "#ffffff70");
    g.addColorStop(0.5, "#ffffff12");
    g.addColorStop(1, "#ffffff00");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  atmosphere(parent: THREE.Group, r: number, color: number, strength: number) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tint: { value: new THREE.Color(color) },
        strength: { value: strength },
      },
      vertexShader: `varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);eye=-p.xyz;n=normalize(normalMatrix*normal);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `uniform vec3 tint;uniform float strength;varying vec3 n;varying vec3 eye;void main(){float rim=pow(1.-max(0.,dot(normalize(n),normalize(eye))),4.);gl_FragColor=vec4(tint,rim*strength);}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    parent.add(
      new THREE.Mesh(new THREE.SphereGeometry(r * 1.013, 64, 48), mat),
    );
  }
  buildThermals() {
    for (const t of THERMALS) {
      const g = new THREE.Group();
      g.position.copy(v3(t));
      const positions = new Float32Array(300 * 3);
      for (let i = 0; i < 300; i++) {
        const a = hash(i, 44) * Math.PI * 2,
          r = hash(i, 19) * t.radius;
        positions.set(
          [Math.cos(a) * r, hash(i, 12) * t.height, Math.sin(a) * r],
          i * 3,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, height: { value: t.height } },
        vertexShader: `uniform float time;uniform float height;varying float alpha;void main(){vec3 p=position;float a=time*.4+p.y*.04;mat2 rot=mat2(cos(a),-sin(a),sin(a),cos(a));p.xz=rot*p.xz;p.y=mod(p.y+time*16.,height);alpha=sin(p.y/height*3.14159);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(130./max(1.,-mv.z),1.,5.);}`,
        fragmentShader: `varying float alpha;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.6,.88,1.,(1.-d)*alpha*.7);}`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      g.add(new THREE.Points(geo, mat));
      const base = new THREE.Mesh(
        new THREE.RingGeometry(t.radius - 1, t.radius, 96),
        glowMaterial(0x8cefff, 0.3),
      );
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.4;
      g.add(base);
      g.visible = false;
      this.thermalGroups.push(g);
      this.scene.add(g);
    }
  }
  async load() {
    THREE.DefaultLoadingManager.onError = () => {};
    const loader = new GLTFLoader(),
      textureLoader = new THREE.TextureLoader();
    const loadGltf = async (url: string) => {
      let error: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await loader.loadAsync(url);
        } catch (e) {
          error = e;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw error;
    };
    const loadTexture = async (url: string) => {
      let error: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await textureLoader.loadAsync(url);
        } catch (e) {
          error = e;
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      throw error;
    };
    const [
      explorer,
      beacon,
      observatory,
      hoverboardGltf,
      rifleGltf,
      grappleGltf,
      cameraGltf,
      obeliskGltf,
    ] = await Promise.all([
      loadGltf("/assets/explorer-v4.glb"),
      loadGltf("/assets/beacon.glb"),
      loadGltf("/assets/observatory.glb"),
      loadGltf("/assets/hoverboard.glb"),
      loadGltf("/assets/kinetic-rifle.glb"),
      loadGltf("/assets/echo-grapple.glb"),
      loadGltf("/assets/survey-camera.glb"),
      loadGltf("/assets/obelisk.glb"),
    ]);
    this.astronaut = explorer.scene;
    this.astronautAnimations = explorer.animations;
    weatherMaterials(this.astronaut);
    this.hoverboardAsset = equipmentModel(hoverboardGltf.scene, 1.3, 0);
    this.rifleAsset = equipmentModel(rifleGltf.scene, 0.95, 0);
    this.brightenRifle(this.rifleAsset);
    this.grappleAsset = equipmentModel(grappleGltf.scene, 0.55, 0);
    this.cameraAsset = equipmentModel(cameraGltf.scene, 0.35, 0);
    this.obeliskAsset = obeliskGltf.scene;

    for (const m of [
      this.hoverboardAsset,
      this.rifleAsset,
      this.grappleAsset,
      this.cameraAsset,
      this.obeliskAsset,
    ]) {
      if (m) {
        m.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });
        weatherMaterials(m);
      }
    }

    if (this.obeliskAsset) {
      const scenic = new THREE.Group();
      for (const site of SCENIC_SITES) {
        const m = this.obeliskAsset.clone(true);
        m.position.set(site.x, site.y, site.z);
        const s = site.scale * 0.18;
        m.scale.set(s, s, s);
        m.rotation.y = hash(site.x, site.z) * Math.PI * 2;
        scenic.add(m);
      }
      this.scene.add(scenic);
    }

    await this.adventure.load();

    // Background progressive hydration: never block initial launch
    void this.interplanetary.loadAssets(loader).catch((err) => {
      console.warn("Background planetary hydration:", err);
    });

    void loader.loadAsync("/assets/portal-gun.glb").then(({ scene }) => {
      const model = equipmentModel(scene, 0.59, 0);
      this.addMuzzle(model, 0, 0.025, -0.309);
      model.name = "first_person_portal";
      model.position.set(.35, -.24, -.69);
      model.rotation.set(-.095, .20, -.06);
      model.traverse(part => {
        if (part instanceof THREE.Mesh && part.material instanceof THREE.MeshStandardMaterial && part.material.name === "lit")
          this.portalLights.add(part.material);
      });
      this.brightenRifle(model);
      this.updatePortalLights();
      this.fpPortal = model;
      model.visible = this.activeWeapon === "portal";
      this.toolModel.add(model);
    }).catch(error => console.warn("Portal gun model:", error));

    // Background upgrade to weapons sequentially
    void (async () => {
      try {
        const hmgGltf = await loader.loadAsync("/assets/models/hmg-379/scene.gltf");
        if (hmgGltf?.scene) {
          this.interplanetary.downloadedAssets.set("hmg-379", hmgGltf.scene);
          weatherMaterials(hmgGltf.scene);
          this.brightenRifle(hmgGltf.scene);
          this.rifleAsset = hmgGltf.scene;
          this.fpRifle?.removeFromParent();
          this.fpRifle = this.mountFirstPerson(this.rifleAsset, "rifle");
          for (const avatar of this.avatars.values()) avatar.userData.equipmentDirty = true;
        }
        const hoverGltf = await loader.loadAsync("/assets/models/hoverboard/scene.gltf");
        if (hoverGltf?.scene) {
          this.interplanetary.downloadedAssets.set("hoverboard", hoverGltf.scene);
          weatherMaterials(hoverGltf.scene);
          this.hoverboardAsset = equipmentModel(hoverGltf.scene, 1.3, 0);
          for (const avatar of this.avatars.values()) avatar.userData.equipmentDirty = true;
        }
        const dx5Gltf = await loader.loadAsync("/assets/models/dx5-mobility-rifle/scene.gltf");
        if (dx5Gltf?.scene) {
          this.interplanetary.downloadedAssets.set("dx5-mobility-rifle", dx5Gltf.scene);
          weatherMaterials(dx5Gltf.scene);
          this.grappleAsset = equipmentModel(dx5Gltf.scene, 0.55, 0);
          this.fpGrapple?.removeFromParent();
          this.fpGrapple = this.mountFirstPerson(this.grappleAsset, "grapple");
          for (const avatar of this.avatars.values()) avatar.userData.equipmentDirty = true;
        }
      } catch (err) {
        console.warn("Optional weapon model hydration:", err);
      }
    })();
    if (this.rifleAsset) {
      this.fpRifle = this.mountFirstPerson(this.rifleAsset, "rifle");
    }
    if (this.grappleAsset) {
      this.fpGrapple = this.mountFirstPerson(this.grappleAsset, "grapple");
    }
    if (this.cameraAsset) {
      this.fpCamera = this.mountFirstPerson(this.cameraAsset, "camera");
    }
    this.toolModel.visible = false;
    this.astronaut.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    BEACON_SITES.forEach((b, i) => {
      const g = new THREE.Group();
      g.position.copy(v3(b));
      const model = beacon.scene.clone(true);
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      g.add(model);
      this.scene.add(g);
      this.beacons.push(g);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 1.3, 260, 16, 1, true),
        new THREE.ShaderMaterial({
          uniforms: { activation: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          vertexShader: vertex,
          fragmentShader: `uniform float activation;varying vec2 vUv;void main(){float a=pow(1.-vUv.y,1.8)*(.055+activation*.16);gl_FragColor=vec4(.25,.75,1.,a);}`,
        }),
      );
      beam.position.y = 130;
      g.add(beam);
      this.beaconBeams.push(beam);
      for (let j = 0; j < 3; j++) {
        const r = new THREE.Mesh(
          new THREE.RingGeometry(7 + j * 3, 7.07 + j * 3, 100),
          glowMaterial(0x70d9f1, 0.14),
        );
        r.rotation.x = -Math.PI / 2;
        r.position.y = 0.17;
        g.add(r);
      }
      if (i === 1) {
        const arch = observatory.scene.clone();
        arch.position.set(b.x, b.y, b.z - 28);
        arch.rotation.y = 0;
        arch.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.scene.add(arch);
      }
    });
    this.ready = true;
    this.interplanetary.onModelLoaded = () => void this.compilePipeline();
    void this.compilePipeline();
  }
  async audio(initialVolume?: number) {
    if (this.listener) {
      await this.listener.context.resume();
      if (initialVolume !== undefined) {
        this.listener.setMasterVolume(initialVolume);
        cosmicAudio.setVolume(initialVolume);
      }
      return;
    }
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    await this.listener.context.resume();
    const vol = initialVolume !== undefined ? initialVolume : 0.5;
    this.listener.setMasterVolume(vol);
    cosmicAudio.setVolume(vol);
    void cosmicAudio.init(this.listener.context, this.listener.getInput());
    const ctx = this.listener.context,
      buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * 0.4;
    const jet = ctx.createBufferSource();
    jet.buffer = buffer;
    jet.loop = true;
    this.jetFilter = ctx.createBiquadFilter();
    this.jetFilter.type = "lowpass";
    this.jetFilter.frequency.value = 400;
    this.jetGain = ctx.createGain();
    this.jetGain.gain.value = 0;
    jet.connect(this.jetFilter);
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(this.listener.getInput());
    jet.start();
    const buffers = await Promise.all(
      ["planet-ambient", "planet-awake", "planet-finale"].map((n) =>
        new THREE.AudioLoader().loadAsync(`/assets/${n}.wav`),
      ),
    );
    buffers.forEach((b, i) => {
      const audio = new THREE.Audio(this.listener!);
      audio.setBuffer(b);
      audio.setLoop(true);
      audio.setVolume(i === 0 ? 0.5 : 0);
      audio.play();
      this.musicLayers.push(audio);
    });
    this.music = this.musicLayers[0];
  }
  sound(name: string, pitch = 1) {
    if (!this.listener || this.listener.context.state !== "running") return;
    const ctx = this.listener.context,
      now = ctx.currentTime,
      gain = ctx.createGain(),
      o = ctx.createOscillator();
    gain.connect(this.listener.getInput());
    o.connect(gain);
    const sounds: Record<string, [number, number, number]> = {
      step: [95, 40, 0.09],
      jump: [150, 390, 0.22],
      dash: [100, 55, 0.26],
      pickup: [520 * pitch, 1040 * pitch, 0.24],
      land: [70, 28, 0.28],
      beacon: [220, 880, 1.7],
      mark: [520, 660, 0.26],
      tool: [760, 110, 0.16],
      rifle: [156, 53, 0.12],
      "portal-open": [310 * pitch, 965 * pitch, 0.23],
      "portal-invalid": [145, 85, 0.115],
      "portal-undo": [670, 230, 0.19],
      "portal-transit": [440, 1220, 0.31],
      grapple: [280, 1100, 0.32],
      kill: [160, 32, 0.65],
      hurt: [110, 42, 0.35],
      enemy: [340, 70, 0.22],
      shutter: [1600, 380, 0.09],
      trick: [440 * pitch, 880 * pitch, 0.22],
    };
    const [a, b, d] = sounds[name] || sounds.mark;
    o.type =
      name === "land" || name === "dash" || name === "step" || name === "shutter" || name === "rifle" || name === "portal-invalid"
        ? "triangle"
        : "sine";
    o.frequency.setValueAtTime(a, now);
    o.frequency.exponentialRampToValueAtTime(b, now + d);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      name === "beacon" ? 0.19 : name === "step" ? 0.035 : 0.13,
      now + (name === "rifle" ? 0.003 : 0.016),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
    if (name === "rifle") {
      if (!this.rifleNoise) {
        this.rifleNoise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.085), ctx.sampleRate);
        const samples = this.rifleNoise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = (Math.random() * 2 - 1) * Math.exp(-6 * i / samples.length);
        }
      }
      const crack = ctx.createBufferSource();
      crack.buffer = this.rifleNoise;
      crack.connect(gain);
      crack.start(now);
      crack.onended = () => crack.disconnect();
    }
    o.start();
    o.stop(now + d + 0.02);
    o.onended = () => {
      o.disconnect();
      gain.disconnect();
    };
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.camera.aspect = w / h;
    this.toolCamera.aspect = w / h;
    this.toolCamera.updateProjectionMatrix();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
  toggleCamera() {
    this.thirdPerson = !this.thirdPerson;
    void this.compilePipeline();
  }
  burst(pos: Vec, count: number, color: number, power = 3) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 240) this.particles.shift();
      const life = 0.35 + Math.random() * 0.55;
      this.particles.push({
        p: v3(pos),
        v: new THREE.Vector3(
          (Math.random() - 0.5) * power,
          Math.random() * power * 0.5,
          (Math.random() - 0.5) * power,
        ),
        life,
        max: life,
        size: 0.4 + Math.random() * 0.9,
        color: new THREE.Color(color),
      });
    }
  }
  render(
    s: Snapshot | null,
    me: Player | null,
    dt: number,
    t: number,
    playing: boolean,
    physics?: MovementWorld | null,
    pilotFlight?: { boosting: boolean; braking: boolean },
  ) {
    this.adventure.update(s, me, dt, t, pilotFlight);
    this.interplanetary.setShipState(s?.adventure.ship || null, dt);
    let cameraShip = s?.adventure.ship;
    if (cameraShip && me && me.seat >= 0) {
      const kind = cameraShip.kind ?? "light_fighter";
      if (!this.flightPosition || this.flightShipKind !== kind || this.flightPosition.distanceTo(v3(cameraShip)) > 600) this.flightPosition = v3(cameraShip);
      this.flightShipKind = kind;
      // Share the hull's response rate; never clamp an airborne camera to terrain.
      this.flightPosition.lerp(v3(cameraShip), 1 - Math.exp(-dt * 16));
      cameraShip = { ...cameraShip, x: this.flightPosition.x, y: this.flightPosition.y, z: this.flightPosition.z };
    } else {
      this.flightPosition = null;
      this.flightShipKind = null;
    }
    this.toolModel.visible = !!me && !this.thirdPerson && me.seat < 0 && this.activeWeapon !== "none";
    this.rifleFill.visible = this.toolModel.visible && this.activeWeapon === "rifle";
    if (me) {
      if (this.weaponSwitchTime > 0) this.weaponSwitchTime -= dt;
      const switchDrop = Math.sin(Math.max(0, this.weaponSwitchTime) / 0.25 * Math.PI) * 0.14;
      this.flashAge += dt;
      const firing = this.activeWeapon === this.firingTool;
      const kick = firing && this.effects ? Math.exp(-this.flashAge / 0.065) : 0;
      const recoilKick = kick * (this.activeWeapon === "rifle" ? 0.082 : 0.039);
      const flashTime = this.activeWeapon === "portal" ? 0.14 : 0.085;
      const flashFade = clamp(1 - this.flashAge / flashTime, 0, 1);
      if (this.flash) {
        this.flash.visible = this.toolModel.visible && firing && flashFade > 0 && this.effects > 0;
        this.flash.material.opacity = flashFade * 0.92;
        this.flash.scale.setScalar(0.24 + (1 - flashFade) * 0.24);
      }
      this.toolModel.position.y =
        0 -
        switchDrop +
        Math.sin(t * 7) * Math.min(0.012, Math.hypot(me.vx, me.vz) * 0.001);
      this.toolModel.position.z = recoilKick;
      this.toolModel.rotation.x = kick * 0.048;

      if (this.fpRifle) this.fpRifle.visible = this.activeWeapon === "rifle";
      if (this.fpGrapple) this.fpGrapple.visible = this.activeWeapon === "grapple";
      if (this.fpCamera) this.fpCamera.visible = this.activeWeapon === "camera";
      if (this.fpPortal) this.fpPortal.visible = this.activeWeapon === "portal";
    }
    const worldTime = s ? s.time : t * 0.4 + 80,
      level = s?.beacons.filter((b) => b.active).length || 0;
    if (!me) {
      this.camera.position.set(40, 130, 140);
      this.camera.lookAt(0, 170, -400);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    } else {
      if (this.lastMe !== me.id || me.crystals < this.lastCollected) {
        this.lastCollected = me.crystals;
        this.lastLanding = me.landingId;
        this.lastLevel = me.level;
        this.lastMe = me.id;
      }
      const speed = Math.hypot(me.vx, me.vz);
      if (me.seat >= 0 && s) {
        const ship = cameraShip!;
        const shipSpeed = Math.hypot(ship.vx, ship.vy, ship.vz);
        const speedRatio = clamp(shipSpeed / SHIP_MAX_SPEED, 0, 1.0);
        const isBoostNow = pilotFlight ? pilotFlight.boosting : Boolean(ship.boosting);
        const pulseKick = (ship.boostPulse ?? 0) * 5.2 * this.effects;
        let fov = 60 + speedRatio * 18 + (isBoostNow ? 3.5 : 0) + pulseKick; // smooth 60 -> 82 deg
        if (this.activeWeapon === "camera") {
          fov = fov / Math.max(1, this.cameraZoom);
        }
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 6.5, dt);
        this.camera.updateProjectionMatrix();
      } else {
        let fov = 66 + clamp(speed / 43) * 8 * this.effects;
        if (this.activeWeapon === "camera") {
          fov = fov / Math.max(1, this.cameraZoom);
        }
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 10, dt);
        this.camera.updateProjectionMatrix();
      }
      const target = eyePosition(me), up = playerUp(me);
      const orientation = viewOrientation(me);
      this.camera.up.copy(up);
      this.camera.quaternion.copy(orientation);
      this.cameraObstructed = false;
      if (me.seat >= 0 && s && this.thirdPerson) {
        // Flight Spring Arm Lag, Boost Kick, Mouse Pitch Trim & Roll/Pitch Linkage
        const ship = cameraShip!;
        const celestialAlign = computeCelestialAlignment(ship, ship.yaw, ship.bank, undefined, ship.pitch ?? 0);
        const localUp = celestialAlign.captureWeight > 0.05 ? celestialAlign.up.clone() : new THREE.Vector3(0, 1, 0);

        const hullModel = this.interplanetary.shipMeshes?.get(ship.kind ?? "light_fighter");
        const shipPos = hullModel ? hullModel.position.clone() : v3(ship);
        const shipForward = celestialFlightFrame(ship, ship.yaw).forward;

        // Subtle mouse pitch & hull pitch shift the focus point vertically so looking up/down feels alive
        const verticalTrim = clamp((me.pitch ?? 0) * 0.45 + (ship.pitch ?? 0) * 1.1, -0.6, 0.6);
        const idealFocus = shipPos
          .clone()
          .addScaledVector(localUp, 1.8 + verticalTrim * 4.5)
          .addScaledVector(shipForward, 4.5);

        const hull = SPAWN_FLEET[ship.kind ?? "light_fighter"];
        const baseDist = Math.max(22, hull.halfLength * 3);
        const baseH = Math.max(6.5, hull.halfWidth * 1.7);
        const shipSpeed = Math.hypot(ship.vx, ship.vy, ship.vz);
        const isBoostNow = pilotFlight ? pilotFlight.boosting : Boolean(ship.boosting);
        const isBrakeNow = pilotFlight ? pilotFlight.braking : Boolean(ship.braking);
        const targetBoostLag = (isBoostNow ? 3.4 : 0) + (ship.boostPulse ?? 0) * 4.8 - (isBrakeNow ? 2.4 : 0);
        this.flightSpringArm.boostLag = THREE.MathUtils.damp(this.flightSpringArm.boostLag, targetBoostLag, 6.5, dt);
        const lagDist = clamp(shipSpeed * 0.09, 0, 8.5) + this.flightSpringArm.boostLag;

        const idealCamPos = shipPos
          .clone()
          .addScaledVector(localUp, baseH - verticalTrim * 3.2)
          .addScaledVector(shipForward, -(baseDist + lagDist));
        const targetRoll = -ship.bank * 0.65;
        const radialVelocity = new THREE.Vector3(ship.vx, ship.vy, ship.vz).dot(localUp);
        const targetPitch = clamp(radialVelocity / 28, -0.3, 0.3) * 0.18 + (ship.pitch ?? 0) * 0.18;

        if (!this.flightSpringArm.initialized || this.flightSpringArm.position.distanceTo(idealCamPos) > 600) {
          this.flightSpringArm.focus.copy(idealFocus);
          this.flightSpringArm.position.copy(idealCamPos);
          this.flightSpringArm.roll = targetRoll;
          this.flightSpringArm.pitch = targetPitch;
          this.flightSpringArm.initialized = true;
        } else {
          this.flightSpringArm.focus.lerp(idealFocus, 1 - Math.exp(-dt * 11));
          this.flightSpringArm.position.lerp(idealCamPos, 1 - Math.exp(-dt * 8.5));
          this.flightSpringArm.roll = THREE.MathUtils.damp(this.flightSpringArm.roll, targetRoll, 7, dt);
          this.flightSpringArm.pitch = THREE.MathUtils.damp(this.flightSpringArm.pitch, targetPitch, 6, dt);
        }

        this.camera.position.copy(this.flightSpringArm.position);
        this.camera.up.copy(localUp);
        this.camera.lookAt(this.flightSpringArm.focus);
        this.camera.rotateZ(this.flightSpringArm.roll);
        this.camera.rotateX(this.flightSpringArm.pitch);
      } else {
        this.flightSpringArm.initialized = false;
        if (this.thirdPerson) {
          const offset = new THREE.Vector3(
              0,
              me.seat >= 0 ? 6 : 0,
              me.seat >= 0 ? 23 : 8,
            ).applyQuaternion(orientation),
            desired = target.clone().add(offset);
          let range = offset.length();
          if (physics)
            range = Math.min(range, physics.cameraDistance(target, desired));
          // Check the complete camera segment against terrain, including its safety margin.
          for (let f = 0.08; f <= 1; f += 0.035) {
            const q = target.clone().addScaledVector(offset, f);
            if (!me.planet && q.y < groundAt(q.x, q.z) + 0.55) {
              range = Math.min(range, offset.length() * Math.max(0.06, f - 0.04));
              break;
            }
          }
          this.cameraObstructed = range < offset.length() - 0.2;
          this.cameraRange = range;
          this.camera.position
            .copy(target)
            .addScaledVector(offset, range / offset.length());
        } else {
          this.cameraRange = 0;
          this.camera.position.copy(target);
          if (me.seat >= 0 && s) {
            const ship = cameraShip!;
            const cockpit = celestialCockpitPose(ship, ship.yaw, me.yaw, me.pitch);
            this.camera.position.copy(cockpit.position);
            this.camera.up.copy(cockpit.up);
            this.camera.quaternion.copy(cockpit.quaternion);
          }
        }
      }
      const isDriving = me.seat >= 0;
      const vShip = s && isDriving ? new THREE.Vector3(s.adventure.ship.vx, s.adventure.ship.vy, s.adventure.ship.vz) : new THREE.Vector3(me.vx, me.vy, me.vz);
      const shipThrust = isDriving ? (s?.adventure.ship.thrust || 0) : (me.jetting ? 1 : 0);
      this.stardustStream.update(this.camera.position, this.camera.quaternion, vShip, shipThrust, isDriving, dt);
      if (this.cameraOverride) {
        this.camera.position.copy(this.cameraOverride.position);
        this.camera.lookAt(this.cameraOverride.lookAt);
      }
      if (isDriving && s) {
        // Walking shake never leaks into cockpit or flight camera
        this.shake = 0;
        const ship = s.adventure.ship;
        const colId = ship.collisionId ?? 0;
        if (colId > this.lastShipCollisionId) {
          this.lastShipCollisionId = colId;
          this.flightShake = Math.max(this.flightShake, 0.45 + (ship.collisionIntensity ?? 0.5) * 0.75);
        }
        const isBoostNow = pilotFlight ? pilotFlight.boosting : Boolean(ship.boosting);
        const isBrakeNow = pilotFlight ? pilotFlight.braking : Boolean(ship.braking);
        const engineRumble = isBoostNow
          ? 0.22 + (ship.boostPulse ?? 0) * 0.32
          : isBrakeNow
            ? 0.14
            : 0;
        this.flightShake = Math.max(engineRumble, this.flightShake * Math.exp(-dt * 10));
      } else {
        this.flightShake = 0;
        this.shake *= Math.exp(-dt * 12);
      }
      if (!isDriving && playing && this.effects > 0 && this.shake > 0.001) {
        this.camera.position.addScaledVector(up, Math.sin(t * 48) * this.shake * this.effects * 0.09);
        this.camera.rotateZ(Math.sin(t * 33) * this.shake * this.effects * 0.003);
      } else if (isDriving && this.thirdPerson && playing && this.effects > 0 && this.flightShake > 0.004) {
        this.camera.position.addScaledVector(up, Math.sin(t * 44) * this.flightShake * this.effects * 0.15);
        this.camera.rotateZ(Math.sin(t * 31) * this.flightShake * this.effects * 0.004);
      }
      if (me.crystals > this.lastCollected) {
        this.sound("pickup", 1 + Math.min(me.combo, 8) * 0.09);
        this.burst(me, 18, 0x94eeff, 10);
        this.lastCollected = me.crystals;
      }
      if (me.landingId > this.lastLanding) {
        this.sound("land");
        this.burst(
          { x: me.x, y: me.y - 0.6, z: me.z },
          Math.min(32, 8 + Math.round(me.landing)),
          0x9eb8c6,
          3 + me.landing * 0.3,
        );
        if (!isDriving) this.shake = clamp(me.landing / 13);
        this.lastLanding = me.landingId;
      }
      if (me.dashTime > 0 && this.lastDash === 0) {
        this.sound("dash");
        if (!isDriving) this.shake = 0.28;
      }
      this.lastDash = me.dashTime;
      if (me.vy > 8 && this.lastY <= 0 && !me.jetting) this.sound("jump");
      this.lastY = me.vy;
      if (me.level > this.lastLevel) {
        this.sound("beacon");
        this.lastLevel = me.level;
      }
      this.jetTimer += dt;
      if (me.jetting && this.jetTimer > 0.045) {
        this.jetTimer = 0;
        this.burst({ x: me.x, y: me.y + 0.35, z: me.z }, 3, 0x5dcfff, 2);
      }
      this.footTimer += dt;
      if (
        playing &&
        me.grounded &&
        speed > 3 &&
        this.footTimer > Math.max(0.22, 0.46 - speed * 0.008)
      ) {
        this.sound("step");
        this.footTimer = 0;
      }
      const shadowTarget = new THREE.Vector3(me.x, me.y, me.z);
      this.sun.target.position.copy(shadowTarget);
      this.sun.position
        .copy(shadowTarget)
        .add(new THREE.Vector3(-240, 190, -140));
    }
    this.camera.updateMatrixWorld();
    this.interplanetary.step(dt, me || { x: 0, y: 0, z: 0 });
    // Update home planet orbital clouds, atmosphere limb fade, sky space-factor & starfield scintillation
    if (this.homePlanetCloudUniforms) {
      this.homePlanetCloudUniforms.time.value = t;
      const camAlt = Math.max(0, this.camera.position.y - 160);
      this.homePlanetCloudUniforms.opacity.value = clamp(camAlt / 680, 0, 0.65);
    }
    if (this.homePlanetAtmoUniforms) {
      // Strictly 0 while camera is inside or near the home planet atmosphere shell (prevents cyan washout over zenith stars)
      const c = HOME_PLANET_SPHERE.center;
      const radialDist = Math.hypot(
        this.camera.position.x - c.x,
        this.camera.position.y - c.y,
        this.camera.position.z - c.z,
      );
      const orbitFade = smooth((radialDist - (HOME_PLANET_SPHERE.atmosphereRadius + 90)) / 420);
      this.homePlanetAtmoUniforms.intensity.value = orbitFade * 0.62;
    }
    if (this.skyDomeUniforms) {
      const altSpace = clamp((this.camera.position.y - 120) / 700, 0, 1);
      this.skyDomeUniforms.spaceFactor.value = altSpace * altSpace * (3 - 2 * altSpace);
    }
    if (this.skyStarUniforms) {
      this.skyStarUniforms.time.value = t;
    }

    if (this.jetGain && this.listener) {
      // Strictly reserve jetGain for on-foot EVA jetpack so it never pollutes ship acoustics
      const ctx = this.listener.context;
      const onFootJet = Boolean(playing && me && me.seat < 0 && me.jetting);
      this.jetGain.gain.setTargetAtTime(onFootJet ? 0.18 : 0, ctx.currentTime, 0.09);
      this.jetFilter?.frequency.setTargetAtTime(
        onFootJet ? 650 + Math.max(0, me!.vy) * 25 : 280,
        ctx.currentTime,
        0.12,
      );
    }
    if (s?.adventure.ship && playing) {
      const ship = s.adventure.ship;
      const speed = Math.hypot(ship.vx ?? 0, ship.vy ?? 0, ship.vz ?? 0);
      const isBoosting = pilotFlight
        ? pilotFlight.boosting
        : (ship.thrust || 0) > 1.8 || speed > 42;
      const isBraking = pilotFlight
        ? pilotFlight.braking
        : (ship.vy ?? 0) < -15;
      const inDeepSpace = (ship.y ?? 0) > 850;
      const piloting = Boolean(me && me.seat >= 0);
      cosmicAudio.updateShipAudio({
        speed,
        altitude: ship.y ?? 0,
        grounded: ship.grounded,
        boosting: isBoosting,
        braking: isBraking,
        climbing: (ship.vy ?? 0) > 5,
        repaired: ship.repaired,
        inDeepSpace,
        piloting,
        throttle: ship.throttle,
      });

      let nearestGateDist = Infinity;
      for (const [id, planet] of this.interplanetary.planets) {
        if (id.startsWith("warpgate")) {
          const d = planet.group.position.distanceTo(this.camera.position);
          if (d < nearestGateDist) nearestGateDist = d;
        }
      }
      cosmicAudio.updatePortalProximity(nearestGateDist);
    } else {
      cosmicAudio.pause();
    }
    this.syncSkyCamera();
    this.musicLayers.forEach((a, i) => {
      const goal =
        i === 0
          ? 0.48
          : i === 1 && level >= 1
            ? 0.4
            : i === 2 && level >= 3
              ? 0.45
              : 0;
      a.setVolume(THREE.MathUtils.damp(a.getVolume(), goal, 1, dt));
    });
    for (const [index, b] of this.beacons.entries()) {
      const data = s?.beacons[index],
        active = data?.active || false,
        age = active ? Math.max(0, worldTime - data!.activatedAt) : 0;
      const beam = this.beaconBeams[index];
      (beam.material as THREE.ShaderMaterial).uniforms.activation.value = active
        ? smooth(age / 3)
        : 0;
      beam.scale.y = active ? 0.4 + 0.6 * smooth(age / 3) : 0.18;
      beam.position.y = 130 * beam.scale.y;
      b.children.slice(2).forEach((o, j) => {
        (o as THREE.Mesh).scale.setScalar(
          active ? 1 + Math.sin(age * 2 - j) * 0.08 : 1,
        );
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = active
          ? 0.55
          : 0.09;
      });
    }
    const crystals = s?.crystals || CRYSTALS.map((c) => ({ ...c, readyAt: 0 }));
    crystals.forEach((c, i) => {
      const visible = c.readyAt <= worldTime;
      this.dummy.position.set(
        c.x,
        c.y + Math.sin(worldTime * 2 + i) * 0.3,
        c.z,
      );
      this.dummy.rotation.set(
        0,
        worldTime * 0.6 + i,
        0.15 * Math.sin(worldTime + i),
      );
      this.dummy.scale.setScalar(visible ? 1 : 0);
      this.dummy.updateMatrix();
      this.crystals.setMatrixAt(i, this.dummy.matrix);
      this.crystalHalo.setMatrixAt(i, this.dummy.matrix);
    });
    this.crystals.instanceMatrix.needsUpdate = true;
    this.crystalHalo.instanceMatrix.needsUpdate = true;
    this.thermalGroups.forEach((g) => {
      g.visible = level >= 2;
      (
        (g.children[0] as THREE.Points).material as THREE.ShaderMaterial
      ).uniforms.time.value = worldTime;
    });
    const ids = new Set(s?.players.map((p) => p.id) || []);
    for (const [id, a] of this.avatars)
      if (!ids.has(id)) {
        this.scene.remove(a);
        this.avatars.delete(id);
        const anim = this.avatarMixers.get(id);
        if (anim) {
          anim.mixer.stopAllAction();
          this.avatarMixers.delete(id);
        }
      }
    for (const remote of s?.players || []) {
      const own = remote.id === me?.id,
        p = own ? me! : remote;
      let a = this.avatars.get(p.id);
      let anim = this.avatarMixers.get(p.id);
      if (!a) {
        const cloned = SkeletonUtils.clone(this.astronaut);
        a = new THREE.Group();
        a.add(cloned);
        const lamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 12, 8),
          new THREE.MeshBasicMaterial({ color: COLORS[p.color] }),
        );
        lamp.position.set(0, 1.76, 0.14);
        a.add(lamp);

        const nameplate = createNameplateSprite(p.name, COLORS[p.color]);
        if (own) nameplate.visible = false;
        a.add(nameplate);
        a.userData.name = p.name;
        a.position.set(p.x, p.y - 0.82, p.z);
        for (const side of [-1, 1]) {
          const coneGeo = new THREE.ConeGeometry(0.045, 0.35, 12, 1, true);
          coneGeo.rotateZ(Math.PI);
          coneGeo.translate(0, -0.175, 0);
          const jet = new THREE.Mesh(
            coneGeo,
            glowMaterial(0x62dbff, 0.85),
          );
          jet.name = "jet-" + side;
          jet.position.set(side * 0.22, 1.18, -0.26);
          jet.rotation.x = 0.14;
          a.add(jet);
        }

        const board = this.hoverboardAsset
          ? this.hoverboardAsset.clone(true)
          : new THREE.Group();
        board.position.set(0, -0.38, 0.0);
        board.name = "hoverboard";
        board.visible = false;
        a.add(board);

        const rightHand =
          cloned.getObjectByName("mixamorig:RightHand") ||
          cloned.getObjectByName("RightHand") ||
          cloned.getObjectByName("mixamorig:RightForeArm");
        const upperBack =
          cloned.getObjectByName("mixamorig:Spine2") ||
          cloned.getObjectByName("mixamorig:Spine1");
        const leftForeArm =
          cloned.getObjectByName("mixamorig:LeftForeArm") ||
          cloned.getObjectByName("LeftForeArm") ||
          cloned.getObjectByName("mixamorig:LeftArm");
        const hips =
          cloned.getObjectByName("mixamorig:Hips") ||
          cloned.getObjectByName("Hips");

        if (this.rifleAsset) {
          const backRifle = this.rifleAsset.clone(true);
          backRifle.name = "backRifle";
          backRifle.scale.setScalar(17.2);
          backRifle.position.set(0.12, 0.15, -0.22);
          backRifle.rotation.set(0.2, 0.1, 2.35);
          backRifle.visible = false;
          if (upperBack) upperBack.add(backRifle);
        }

        if (this.cameraAsset) {
          const hipCamera = this.cameraAsset.clone(true);
          hipCamera.name = "hipCamera";
          hipCamera.scale.setScalar(100);
          hipCamera.position.set(0.18, -0.06, 0.08);
          hipCamera.rotation.set(0.2, -0.3, 0.1);
          hipCamera.visible = false;
          if (hips) hips.add(hipCamera);
        }

        const mixer = new THREE.AnimationMixer(cloned);
        const findClip = (name: string, fallbackIdx = 0) =>
          THREE.AnimationClip.findByName(this.astronautAnimations, name) ||
          this.astronautAnimations.find((c) =>
            c.name.toLowerCase().includes(name.toLowerCase()),
          ) ||
          this.astronautAnimations[fallbackIdx] ||
          new THREE.AnimationClip(name, 1, []);

        const actions: Record<string, THREE.AnimationAction> = {
          idle: mixer.clipAction(findClip("idle", 0)),
          walk: mixer.clipAction(findClip("walk", 1)),
          run: mixer.clipAction(findClip("run", 2)),
          floating: mixer.clipAction(findClip("floating", 3)),
        };
        actions.idle.play();

        anim = {
          mixer,
          actions,
          currentAction: "idle",
          head: cloned.getObjectByName("mixamorig:Head") || cloned.getObjectByName("Head") || cloned.getObjectByName("head"),
          torso: cloned.getObjectByName("mixamorig:Spine1") || cloned.getObjectByName("Spine1") || cloned.getObjectByName("Spine"),
          armL: cloned.getObjectByName("mixamorig:LeftArm") || cloned.getObjectByName("LeftArm") || cloned.getObjectByName("arm_L"),
          armR: cloned.getObjectByName("mixamorig:RightArm") || cloned.getObjectByName("RightArm"),
        };
        this.avatarMixers.set(p.id, anim);
        this.avatars.set(p.id, a);
        this.scene.add(a);
      }
      if (a.userData.name !== p.name) {
        const old = a.getObjectByName("nameplate");
        if (old) a.remove(old);
        const nameplate = createNameplateSprite(p.name, COLORS[p.color]);
        if (own) nameplate.visible = false;
        a.add(nameplate);
        a.userData.name = p.name;
      }
      a.visible =
        p.seat < 0 && !(own && (!this.thirdPerson || this.cameraRange < 0.4));
      const portaled = (p.portalTransit ?? 0) !== (a.userData.portalTransit ?? 0);
      a.userData.portalTransit = p.portalTransit;
      if (p.planet) {
        a.position.copy(v3(p)).addScaledVector(playerUp(p), -FOOT_OFFSET);
      } else if (own || portaled) a.position.set(p.x, p.y - 0.82, p.z);
      else
        a.position.lerp(
          new THREE.Vector3(p.x, p.y - 0.82, p.z),
          1 - Math.exp(-dt * 14),
        );
      const targetYaw = p.yaw + Math.PI;
      if (portaled) a.rotation.y = targetYaw;
      else if (!p.planet) {
        a.rotation.y +=
          Math.atan2(
            Math.sin(targetYaw - a.rotation.y),
            Math.cos(targetYaw - a.rotation.y),
          ) *
          (1 - Math.exp(-dt * 12));
      }
      const speed = Math.hypot(p.vx, p.vz);
      const targetPitch = p.skate
        ? 0
        : p.jetting
          ? 0
          : p.grounded
            ? 0
            : Math.min(0.12, speed * 0.01);
      a.rotation.x = THREE.MathUtils.damp(a.rotation.x, targetPitch, 8, dt);
      a.rotation.z = THREE.MathUtils.damp(
        a.rotation.z,
        p.grapple ? Math.sin(t * 3) * 0.08 : 0,
        8,
        dt,
      );

      if (p.skate) {
        const turnDelta = Math.atan2(
          Math.sin(targetYaw - a.rotation.y),
          Math.cos(targetYaw - a.rotation.y),
        );
        a.rotation.z = THREE.MathUtils.damp(
          a.rotation.z,
          Math.max(-0.25, Math.min(0.25, -turnDelta * 0.35)),
          8,
          dt,
        );
      }
      if (p.planet) {
        a.quaternion.copy(surfaceOrientation(p)).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetYaw),
        );
      }

      if (anim) {
        anim.mixer.update(dt);
        let target = "idle";
        if (p.skate) {
          // Skateboard strictly overrides jetting and airborne animations!
          // Solid surfing stance with feet firmly planted in the middle of the deck, even when boosting/airborne!
          target = "idle";
        } else if (p.jetting || !p.grounded) {
          target = "floating";
        } else if (speed > 5.0) {
          target = "run";
          anim.actions.run.timeScale = Math.max(0.75, Math.min(1.25, speed * 0.085));
        } else if (speed > 0.35) {
          target = "walk";
          anim.actions.walk.timeScale = Math.max(0.6, Math.min(1.15, speed * 0.22));
        } else {
          target = "idle";
        }

        if (anim.currentAction !== target) {
          const prev = anim.actions[anim.currentAction];
          const next = anim.actions[target];
          if (prev && next) {
            prev.fadeOut(0.2);
            next.reset().fadeIn(0.2).play();
            anim.currentAction = target;
          }
        }

        if (anim.head) {
          anim.head.rotation.x = THREE.MathUtils.damp(
            anim.head.rotation.x,
            -p.pitch * 0.35,
            10,
            dt,
          );
        }

        const inShip = p.seat >= 0;
        const activeWep = own ? this.activeWeapon : (p.grapple ? "grapple" : "none");
        const heldRifle = a.getObjectByName("heldRifle");
        const backRifle = a.getObjectByName("backRifle");
        const heldCamera = a.getObjectByName("heldCamera");
        const hipCamera = a.getObjectByName("hipCamera");
        const grappleLauncher = a.getObjectByName("grappleLauncher");

        if (backRifle) {
          backRifle.visible = !inShip && activeWep === "rifle";
        }
        if (hipCamera) {
          hipCamera.visible = !inShip && activeWep === "camera";
        }

        if (p.skate) {
          // Surfing stance on skateboard: torso turned slightly, balanced stance
          if (anim.torso) {
            anim.torso.rotation.y = THREE.MathUtils.damp(anim.torso.rotation.y, 0.38, 8, dt);
          }
          if (anim.armL && !p.grapple) {
            anim.armL.rotation.z = THREE.MathUtils.damp(anim.armL.rotation.z, -0.4, 8, dt);
            anim.armL.rotation.x = THREE.MathUtils.damp(anim.armL.rotation.x, 0.2, 8, dt);
          }
          if (anim.armR) {
            anim.armR.rotation.z = THREE.MathUtils.damp(anim.armR.rotation.z, 0.4, 8, dt);
            anim.armR.rotation.x = THREE.MathUtils.damp(anim.armR.rotation.x, -0.2, 8, dt);
          }
        }
        if (p.grapple && anim.armL) {
          anim.armL.rotation.x = -1.35 - p.pitch * 0.5;
        }
      }

      for (const side of [-1, 1]) {
        const jet = a.getObjectByName("jet-" + side);
        if (jet) {
          jet.visible = p.jetting && !p.skate;
          const flicker = 0.8 + Math.sin(t * 60 + side * 1.5) * 0.2;
          jet.scale.set(1, flicker, 1);
        }
      }

      const board = a.getObjectByName("hoverboard");
      if (board) {
        board.visible = !!p.skate;
        if (p.skate) {
          const isOllie = !!(p.ollieUntil && p.ollieUntil > worldTime);
          if (isOllie) {
            const remain = Math.max(0, (p.ollieUntil ?? 0) - worldTime);
            const progress = Math.max(0, Math.min(1, 1 - remain / 0.8));
            // 360 Kickflip longitudinal roll along Z-axis (parallel to stance, stays flat beneath feet)
            board.rotation.z = progress < 1 ? progress * Math.PI * 2 : 0;
            // Aerodynamic pop pitch along X-axis: nose rises during takeoff, levels out cleanly for landing
            const popPitch = -Math.sin(progress * Math.PI) * 0.22;
            board.rotation.x = THREE.MathUtils.damp(board.rotation.x, popPitch, 12, dt);
            board.rotation.y = THREE.MathUtils.damp(board.rotation.y, 0, 10, dt);
            // Downward clearance: board drops 12-22cm below feet during the flip to guarantee zero body clipping
            const clearance = -0.44 - Math.sin(progress * Math.PI) * 0.12;
            board.position.set(0, clearance, 0.0);
          } else {
            board.rotation.x = THREE.MathUtils.damp(board.rotation.x, 0, 12, dt);
            board.rotation.z = THREE.MathUtils.damp(board.rotation.z, 0, 12, dt);
            board.rotation.y = THREE.MathUtils.damp(board.rotation.y, 0, 12, dt);
            board.position.set(0, -0.38 + Math.sin(t * 8) * 0.008, 0.0);
          }
        }
      }

      if (p.skate && p.jetting && hash(Math.floor(t * 30), p.color) > 0.25) {
        this.burst({ x: p.x, y: p.y - 0.78, z: p.z }, 3, 0x00f0ff, 2.4);
      }
      if (p.jetting && !p.skate && !own && hash(Math.floor(t * 30), p.color) > 0.4)
        this.burst({ x: p.x, y: p.y + 0.35, z: p.z }, 2, COLORS[p.color], 1.5);
    }
    for (const [id, g] of this.markers)
      if (!s?.markers.some((m) => m.owner === id)) {
        this.scene.remove(g);
        this.markers.delete(id);
      }
    for (const m of s?.markers || []) {
      let g = this.markers.get(m.owner);
      if (!g) {
        g = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(2, 0.06, 8, 48),
          glowMaterial(0xffce90, 0.8),
        );
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        const ray = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 18, 6),
          glowMaterial(0xffce90, 0.6),
        );
        ray.position.y = 9;
        g.add(ray);
        this.markers.set(m.owner, g);
        this.scene.add(g);
      }
      g.position.copy(v3(m));
      g.children[0].rotation.z = worldTime;
    }
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    this.particlePositions.fill(0);
    this.particleSizes.fill(0);
    this.particles.forEach((p, i) => {
      p.p.addScaledVector(p.v, dt);
      p.v.y -= dt * 1.5;
      p.p.toArray(this.particlePositions, i * 3);
      p.color
        .clone()
        .multiplyScalar(p.life / p.max)
        .toArray(this.particleColors, i * 3);
      this.particleSizes[i] = p.size * (p.life / p.max);
    });
    for (const n of ["position", "color", "size"])
      this.particlePoints.geometry.getAttribute(n).needsUpdate = true;
    this.cinematic.uniforms.time.value = t;
    this.renderer.info.reset();
    this.portals.update(s?.portals, this.camera, this.skyCamera, this.effects ? t : 0);
    this.toolPass.enabled = this.toolModel.visible;
    this.composer.render(dt);
    this.frames++;
    this.canvas.dataset.frames = String(this.frames);
  }
  project(target: Vec) {
    const v = new THREE.Vector3(target.x, target.y + 9, target.z).project(
      this.camera,
    );
    if (v.z > 1) return null;
    return {
      x: clamp((v.x * 0.5 + 0.5) * innerWidth, 35, innerWidth - 35),
      y: clamp((-v.y * 0.5 + 0.5) * innerHeight, 140, innerHeight - 145),
    };
  }
  minimap(canvas: HTMLCanvasElement, s: Snapshot, me: Player) {
    const ctx = canvas.getContext("2d")!,
      w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const scale = w / (WORLD_SIZE * 1.05),
      px = (x: number) => w / 2 + x * scale,
      pz = (z: number) => h / 2 + z * scale;
    ctx.strokeStyle = "#93b8c422";
    ctx.lineWidth = 1;
    for (let r = 25; r < 120; r += 25) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = "#9dd9ec55";
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(px(SPAWN.x), pz(SPAWN.z));
    for (const b of s.beacons) ctx.lineTo(px(b.x), pz(b.z));
    ctx.stroke();
    ctx.setLineDash([]);
    const dot = (p: Vec, c: string, r: number) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px(p.x), pz(p.z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    s.beacons.forEach((b) => dot(b, b.active ? "#b0f5ff" : "#eabf83", 3));
    dot(s.adventure.ship, "#d1e3dc", 5);
    dot(missionObjective(s, me).p, "#ffe1a6", 5);
    s.adventure.drones
      .filter((d) => d.hp > 0)
      .forEach((d) => dot(d, "#f28d78", 2));
    s.markers.forEach((m) => dot(m, "#ffc97f", 3));
    s.players.forEach((p) =>
      dot(
        p,
        p.id === me.id ? "#ffffff" : `#${COLORS[p.color].toString(16)}`,
        3,
      ),
    );
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(px(me.x), pz(me.z));
    ctx.lineTo(
      px(me.x) - Math.sin(me.yaw) * 11,
      pz(me.z) - Math.cos(me.yaw) * 11,
    );
    ctx.stroke();
  }
}


export function downloadAsset(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function exportHoverboardGlb(): Promise<void> {
  downloadAsset("/assets/hoverboard.glb", `kepler-hoverboard-${Date.now()}.glb`);
}

export function takeSnapshot(view: GameView): void {
  view.sound("shutter");
  const flash = document.createElement("div");
  flash.className = "camera-flash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 450);
  try {
    const url = view.canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.download = `last-light-snapshot-${Date.now()}.png`;
    a.href = url;
    a.click();
  } catch (err) {
    console.error("Camera snapshot error:", err);
  }
}

export async function exportTechRifleGlb(): Promise<void> {
  downloadAsset("/assets/kinetic-rifle.glb", `kepler-kinetic-rifle-${Date.now()}.glb`);
}

export async function exportSurveyCameraGlb(): Promise<void> {
  downloadAsset("/assets/survey-camera.glb", `kepler-survey-camera-${Date.now()}.glb`);
}

export async function exportGrappleLauncherGlb(): Promise<void> {
  downloadAsset("/assets/echo-grapple.glb", `kepler-echo-grapple-${Date.now()}.glb`);
}
