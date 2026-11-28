import { weatherMaterials } from "./weathering";
import { AdventureView, type FiringTool } from "./adventure-view";
import { missionObjective } from "../shared/objectives";
import { celestialCockpitPose, celestialFlightFrame } from "../shared/celestial-flight";
import { InterplanetarySystem, computeCelestialAlignment } from "./interplanetary";
import { cosmicAudio } from "./sound-engine";
import { HOME_PLANET_SPHERE } from "../shared/colliders";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  groundAt,
  hash,
  BEACON_SITES,
  CRYSTALS,
  SCENIC_SITES,
  SPAWN,
  WORLD_SIZE,
  clamp,
  smooth,
  type Vec,
} from "../shared/map";
import { PLAYER_COLORS, type Snapshot, type Player } from "../shared/types";
import type { MovementWorld } from "../shared/physics";
import { PortalView } from "./portal-view";
import { SPAWN_FLEET, SHIP_MAX_SPEED } from "../shared/adventure-data";
import { playerUp, eyePosition, viewOrientation } from "../shared/surface";
import { equipmentModel } from "./equipment-model";
import type { PortalColor } from "../shared/portals";
import { StardustParallaxStream } from "./stardust-stream";
import {
  BASIC_VERTEX_SHADER,
  buildBasinEnvironment,
  buildCosmicSky,
  buildThermalUpdrafts,
  glowMaterial,
} from "./world-environment";
import { AvatarSystem } from "./avatar-system";
import {
  createRadialGlowTexture,
  loadGltfWithRetry,
  resolvePilotFlightState,
  type PilotFlightFlags,
} from "./asset-loader";

export type Equipment = "none" | "rifle" | "grapple" | "camera" | "portal";
const COLORS = PLAYER_COLORS.map((c) => c.hex);
const v3 = (v: Vec) => new THREE.Vector3(v.x, v.y, v.z);

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
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
  musicLayers: THREE.Audio[] = [];
  jetGain: GainNode | null = null;
  jetFilter: BiquadFilterNode | null = null;
  astronaut = new THREE.Group();
  astronautAnimations: THREE.AnimationClip[] = [];
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
  private flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createRadialGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
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
  private avatarSystem: AvatarSystem;

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

  get avatars() {
    return this.avatarSystem.avatars;
  }

  get avatarMixers() {
    return this.avatarSystem.mixers;
  }

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
    this.avatarSystem = new AvatarSystem(this.scene, (p, n, c, s) => this.burst(p, n, c, s));

    this.buildSky();

    const env = buildBasinEnvironment();
    this.terrain = env.terrain;
    this.homePlanetCloudUniforms = env.cloudUniforms;
    this.homePlanetAtmoUniforms = env.atmoUniforms;
    this.scene.add(this.terrain);
    requestAnimationFrame(() => {
      this.scene.add(env.rocks);
      requestAnimationFrame(() => {
        this.scene.add(env.homePlanetGroup);
        void this.compilePipeline();
      });
    });

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

    this.thermalGroups = buildThermalUpdrafts(this.scene);

    this.adventure = new AdventureView(
      this.scene,
      (p, n, c, s) => this.burst(p, n, c, s),
      (n, p) => this.sound(n, p),
      (kind, color) => this.muzzleFeedback(kind, color),
    );
    this.interplanetary = new InterplanetarySystem(this.scene, this.camera);
    this.interplanetary.setShipReference(this.adventure.ship);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(this.particlePositions, 3));
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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.34, 0.55, 1.2);
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

  async compilePipeline() {
    if (this.compiling) return;
    this.compiling = true;
    try {
      await Promise.all([
        this.renderer.compileAsync(this.scene, this.camera),
        this.renderer.compileAsync(this.skyScene, this.skyCamera),
        this.renderer.compileAsync(this.toolScene, this.toolCamera),
      ]);
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
    if (w === "none") this.avatarSystem.resetUnarmedPose();
    void this.compilePipeline();
  }

  private brightenRifle(root: THREE.Object3D) {
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
    const size = kind === "rifle" ? 1.12 : kind === "grapple" ? 0.62 : 0.24;
    const model = equipmentModel(source, size, kind === "camera" ? 0 : Math.PI);
    model.name = `first_person_${kind}`;
    model.userData.asset = kind === "rifle" ? "hmg-379" : kind;
    const pos =
      kind === "camera"
        ? new THREE.Vector3(0.28, -0.14, -0.56)
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

  buildSky() {
    this.skyScene.add(this.sky);
    const skyResult = buildCosmicSky(this.sky, this.moon, () => this.radialTexture());
    this.skyDomeUniforms = skyResult.skyDomeUniforms;
    this.skyStarUniforms = skyResult.skyStarUniforms;
  }

  radialTexture(): THREE.Texture | null {
    return createRadialGlowTexture();
  }

  syncSkyCamera() {
    this.sky.position.copy(this.camera.position);
    this.skyCamera.position.copy(this.camera.position);
    this.skyCamera.quaternion.copy(this.camera.quaternion);
    this.skyCamera.fov = this.camera.fov;
    this.skyCamera.aspect = this.camera.aspect;
    this.skyCamera.updateProjectionMatrix();
  }

  atmosphere(parent: THREE.Object3D, r: number, color: number, strength: number) {
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
    parent.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.013, 64, 48), mat));
  }

  async load() {
    THREE.DefaultLoadingManager.onError = () => {};
    const loader = new GLTFLoader();
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
      loadGltfWithRetry(loader, "/assets/explorer-v4.glb"),
      loadGltfWithRetry(loader, "/assets/beacon.glb"),
      loadGltfWithRetry(loader, "/assets/observatory.glb"),
      loadGltfWithRetry(loader, "/assets/hoverboard.glb"),
      loadGltfWithRetry(loader, "/assets/kinetic-rifle.glb"),
      loadGltfWithRetry(loader, "/assets/echo-grapple.glb"),
      loadGltfWithRetry(loader, "/assets/survey-camera.glb"),
      loadGltfWithRetry(loader, "/assets/obelisk.glb"),
    ]);

    this.astronaut = explorer.scene;
    this.astronautAnimations = explorer.animations;
    weatherMaterials(this.astronaut);
    this.hoverboardAsset = equipmentModel(hoverboardGltf.scene, 1.3, 0);
    this.rifleAsset = equipmentModel(rifleGltf.scene, 0.95, 0);
    this.brightenRifle(this.rifleAsset);
    this.grappleAsset = equipmentModel(grappleGltf.scene, 0.55, 0);
    // The imported lens faces +Z. Align it with the view camera's -Z axis.
    this.cameraAsset = equipmentModel(cameraGltf.scene, 0.23, Math.PI);
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

    void loader
      .loadAsync("/assets/portal-gun.glb")
      .then(({ scene }) => {
        const model = equipmentModel(scene, 0.59, 0);
        this.addMuzzle(model, 0, 0.025, -0.309);
        model.name = "first_person_portal";
        model.position.set(0.35, -0.24, -0.69);
        model.rotation.set(-0.095, 0.2, -0.06);
        model.traverse((part) => {
          if (
            part instanceof THREE.Mesh &&
            part.material instanceof THREE.MeshStandardMaterial &&
            part.material.name === "lit"
          ) {
            this.portalLights.add(part.material);
          }
        });
        this.brightenRifle(model);
        this.updatePortalLights();
        this.fpPortal = model;
        model.visible = this.activeWeapon === "portal";
        this.toolModel.add(model);
      })
      .catch((error) => console.warn("Portal gun model:", error));

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
        }
        const hoverGltf = await loader.loadAsync("/assets/models/hoverboard/scene.gltf");
        if (hoverGltf?.scene) {
          this.interplanetary.downloadedAssets.set("hoverboard", hoverGltf.scene);
          weatherMaterials(hoverGltf.scene);
          this.hoverboardAsset = equipmentModel(hoverGltf.scene, 1.3, 0);
        }
        const dx5Gltf = await loader.loadAsync("/assets/models/dx5-mobility-rifle/scene.gltf");
        if (dx5Gltf?.scene) {
          this.interplanetary.downloadedAssets.set("dx5-mobility-rifle", dx5Gltf.scene);
          weatherMaterials(dx5Gltf.scene);
          this.grappleAsset = equipmentModel(dx5Gltf.scene, 0.55, 0);
          this.fpGrapple?.removeFromParent();
          this.fpGrapple = this.mountFirstPerson(this.grappleAsset, "grapple");
        }
      } catch (err) {
        console.warn("Optional weapon model hydration:", err);
      }
    })();

    if (this.rifleAsset) this.fpRifle = this.mountFirstPerson(this.rifleAsset, "rifle");
    if (this.grappleAsset) this.fpGrapple = this.mountFirstPerson(this.grappleAsset, "grapple");
    if (this.cameraAsset) this.fpCamera = this.mountFirstPerson(this.cameraAsset, "camera");
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
          vertexShader: BASIC_VERTEX_SHADER,
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

    const ctx = this.listener.context;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
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
    const ctx = this.listener.context;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const o = ctx.createOscillator();
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
      name === "land" ||
      name === "dash" ||
      name === "step" ||
      name === "shutter" ||
      name === "rifle" ||
      name === "portal-invalid"
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
          samples[i] = (Math.random() * 2 - 1) * Math.exp((-6 * i) / samples.length);
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
    const w = innerWidth;
    const h = innerHeight;
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
    pilotFlight?: PilotFlightFlags,
  ) {
    this.adventure.update(s, me, dt, t, pilotFlight);
    this.interplanetary.setShipState(s?.adventure.ship || null, dt);

    let cameraShip = s?.adventure.ship;
    if (cameraShip && me && me.seat >= 0) {
      const kind = cameraShip.kind ?? "light_fighter";
      if (
        !this.flightPosition ||
        this.flightShipKind !== kind ||
        this.flightPosition.distanceTo(v3(cameraShip)) > 600
      ) {
        this.flightPosition = v3(cameraShip);
      }
      this.flightShipKind = kind;
      this.flightPosition.lerp(v3(cameraShip), 1 - Math.exp(-dt * 16));
      cameraShip = {
        ...cameraShip,
        x: this.flightPosition.x,
        y: this.flightPosition.y,
        z: this.flightPosition.z,
      };
    } else {
      this.flightPosition = null;
      this.flightShipKind = null;
    }

    this.toolModel.visible = !!me && !this.thirdPerson && me.seat < 0 && this.activeWeapon !== "none";
    this.rifleFill.visible = this.toolModel.visible && this.activeWeapon === "rifle";
    if (me) {
      if (this.weaponSwitchTime > 0) this.weaponSwitchTime -= dt;
      const switchDrop = Math.sin((Math.max(0, this.weaponSwitchTime) / 0.25) * Math.PI) * 0.14;
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
        -switchDrop + Math.sin(t * 7) * Math.min(0.012, Math.hypot(me.vx, me.vz) * 0.001);
      this.toolModel.position.z = recoilKick;
      this.toolModel.rotation.x = kick * 0.048;

      if (this.fpRifle) this.fpRifle.visible = this.activeWeapon === "rifle";
      if (this.fpGrapple) this.fpGrapple.visible = this.activeWeapon === "grapple";
      if (this.fpCamera) this.fpCamera.visible = this.activeWeapon === "camera";
      if (this.fpPortal) this.fpPortal.visible = this.activeWeapon === "portal";
    }

    const worldTime = s ? s.time : t * 0.4 + 80;
    const level = s?.beacons.filter((b) => b.active).length || 0;

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
        let fov = 60 + speedRatio * 18 + (isBoostNow ? 3.5 : 0) + pulseKick;
        if (this.activeWeapon === "camera") fov = fov / Math.max(1, this.cameraZoom);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 6.5, dt);
        this.camera.updateProjectionMatrix();
      } else {
        let fov = 66 + clamp(speed / 43) * 8 * this.effects;
        if (this.activeWeapon === "camera") fov = fov / Math.max(1, this.cameraZoom);
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 10, dt);
        this.camera.updateProjectionMatrix();
      }

      const target = eyePosition(me);
      const up = playerUp(me);
      const orientation = viewOrientation(me);
      this.camera.up.copy(up);
      this.camera.quaternion.copy(orientation);
      this.cameraObstructed = false;

      if (me.seat >= 0 && s && this.thirdPerson) {
        const ship = cameraShip!;
        const celestialAlign = computeCelestialAlignment(
          ship,
          ship.yaw,
          ship.bank,
          undefined,
          ship.pitch ?? 0,
        );
        const localUp =
          celestialAlign.captureWeight > 0.05 ? celestialAlign.up.clone() : new THREE.Vector3(0, 1, 0);

        const hullModel = this.interplanetary.shipMeshes?.get(ship.kind ?? "light_fighter");
        const shipPos = hullModel ? hullModel.position.clone() : v3(ship);
        const shipForward = celestialFlightFrame(ship, ship.yaw).forward;

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
        const targetBoostLag =
          (isBoostNow ? 3.4 : 0) + (ship.boostPulse ?? 0) * 4.8 - (isBrakeNow ? 2.4 : 0);
        this.flightSpringArm.boostLag = THREE.MathUtils.damp(
          this.flightSpringArm.boostLag,
          targetBoostLag,
          6.5,
          dt,
        );
        const lagDist = clamp(shipSpeed * 0.09, 0, 8.5) + this.flightSpringArm.boostLag;

        const idealCamPos = shipPos
          .clone()
          .addScaledVector(localUp, baseH - verticalTrim * 3.2)
          .addScaledVector(shipForward, -(baseDist + lagDist));
        const targetRoll = -ship.bank * 0.65;
        const radialVelocity = new THREE.Vector3(ship.vx, ship.vy, ship.vz).dot(localUp);
        const targetPitch =
          clamp(radialVelocity / 28, -0.3, 0.3) * 0.18 + (ship.pitch ?? 0) * 0.18;

        if (
          !this.flightSpringArm.initialized ||
          this.flightSpringArm.position.distanceTo(idealCamPos) > 600
        ) {
          this.flightSpringArm.focus.copy(idealFocus);
          this.flightSpringArm.position.copy(idealCamPos);
          this.flightSpringArm.roll = targetRoll;
          this.flightSpringArm.pitch = targetPitch;
          this.flightSpringArm.initialized = true;
        } else {
          this.flightSpringArm.focus.lerp(idealFocus, 1 - Math.exp(-dt * 11));
          this.flightSpringArm.position.lerp(idealCamPos, 1 - Math.exp(-dt * 8.5));
          this.flightSpringArm.roll = THREE.MathUtils.damp(
            this.flightSpringArm.roll,
            targetRoll,
            7,
            dt,
          );
          this.flightSpringArm.pitch = THREE.MathUtils.damp(
            this.flightSpringArm.pitch,
            targetPitch,
            6,
            dt,
          );
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
          ).applyQuaternion(orientation);
          const desired = target.clone().add(offset);
          let range = offset.length();
          if (physics) range = Math.min(range, physics.cameraDistance(target, desired));
          for (let f = 0.08; f <= 1; f += 0.035) {
            const q = target.clone().addScaledVector(offset, f);
            if (!me.planet && q.y < groundAt(q.x, q.z) + 0.55) {
              range = Math.min(range, offset.length() * Math.max(0.06, f - 0.04));
              break;
            }
          }
          this.cameraObstructed = range < offset.length() - 0.2;
          this.cameraRange = range;
          this.camera.position.copy(target).addScaledVector(offset, range / offset.length());
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
      const vShip =
        s && isDriving
          ? new THREE.Vector3(s.adventure.ship.vx, s.adventure.ship.vy, s.adventure.ship.vz)
          : new THREE.Vector3(me.vx, me.vy, me.vz);
      const shipThrust = isDriving ? s?.adventure.ship.thrust || 0 : me.jetting ? 1 : 0;
      this.stardustStream.update(
        this.camera.position,
        this.camera.quaternion,
        vShip,
        shipThrust,
        isDriving,
        dt,
      );

      if (this.cameraOverride) {
        this.camera.position.copy(this.cameraOverride.position);
        this.camera.lookAt(this.cameraOverride.lookAt);
      }

      if (isDriving && s) {
        this.shake = 0;
        const ship = s.adventure.ship;
        const colId = ship.collisionId ?? 0;
        if (colId > this.lastShipCollisionId) {
          this.lastShipCollisionId = colId;
          this.flightShake = Math.max(
            this.flightShake,
            0.45 + (ship.collisionIntensity ?? 0.5) * 0.75,
          );
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
        this.camera.position.addScaledVector(
          up,
          Math.sin(t * 44) * this.flightShake * this.effects * 0.15,
        );
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
      this.sun.position.copy(shadowTarget).add(new THREE.Vector3(-240, 190, -140));
    }

    this.camera.updateMatrixWorld();
    this.interplanetary.step(dt, me || { x: 0, y: 0, z: 0 });

    if (this.homePlanetCloudUniforms) {
      this.homePlanetCloudUniforms.time.value = t;
      const camAlt = Math.max(0, this.camera.position.y - 160);
      this.homePlanetCloudUniforms.opacity.value = clamp(camAlt / 680, 0, 0.65);
    }
    if (this.homePlanetAtmoUniforms) {
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
    if (this.skyStarUniforms) this.skyStarUniforms.time.value = t;

    if (this.jetGain && this.listener) {
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
      const { boosting: isBoosting, braking: isBraking } = resolvePilotFlightState(ship, pilotFlight);
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
        i === 0 ? 0.48 : i === 1 && level >= 1 ? 0.4 : i === 2 && level >= 3 ? 0.45 : 0;
      a.setVolume(THREE.MathUtils.damp(a.getVolume(), goal, 1, dt));
    });

    for (const [index, b] of this.beacons.entries()) {
      const data = s?.beacons[index];
      const active = data?.active || false;
      const age = active ? Math.max(0, worldTime - data!.activatedAt) : 0;
      const beam = this.beaconBeams[index];
      (beam.material as THREE.ShaderMaterial).uniforms.activation.value = active
        ? smooth(age / 3)
        : 0;
      beam.scale.y = active ? 0.4 + 0.6 * smooth(age / 3) : 0.18;
      beam.position.y = 130 * beam.scale.y;
      b.children.slice(2).forEach((o, j) => {
        (o as THREE.Mesh).scale.setScalar(active ? 1 + Math.sin(age * 2 - j) * 0.08 : 1);
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = active ? 0.55 : 0.09;
      });
    }

    const crystals = s?.crystals || CRYSTALS.map((c) => ({ ...c, readyAt: 0 }));
    crystals.forEach((c, i) => {
      const visible = c.readyAt <= worldTime;
      this.dummy.position.set(c.x, c.y + Math.sin(worldTime * 2 + i) * 0.3, c.z);
      this.dummy.rotation.set(0, worldTime * 0.6 + i, 0.15 * Math.sin(worldTime + i));
      this.dummy.scale.setScalar(visible ? 1 : 0);
      this.dummy.updateMatrix();
      this.crystals.setMatrixAt(i, this.dummy.matrix);
      this.crystalHalo.setMatrixAt(i, this.dummy.matrix);
    });
    this.crystals.instanceMatrix.needsUpdate = true;
    this.crystalHalo.instanceMatrix.needsUpdate = true;

    this.thermalGroups.forEach((g) => {
      g.visible = level >= 2;
      ((g.children[0] as THREE.Points).material as THREE.ShaderMaterial).uniforms.time.value =
        worldTime;
    });

    this.avatarSystem.update({
      snapshot: s,
      me,
      assets: {
        astronaut: this.astronaut,
        animations: this.astronautAnimations,
        hoverboard: this.hoverboardAsset,
        rifle: this.rifleAsset,
        camera: this.cameraAsset,
      },
      activeWeapon: this.activeWeapon,
      thirdPerson: this.thirdPerson,
      cameraRange: this.cameraRange,
      dt,
      t,
      worldTime,
    });

    for (const [id, g] of this.markers) {
      if (!s?.markers.some((m) => m.owner === id)) {
        this.scene.remove(g);
        this.markers.delete(id);
      }
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
    for (const n of ["position", "color", "size"]) {
      this.particlePoints.geometry.getAttribute(n).needsUpdate = true;
    }

    this.cinematic.uniforms.time.value = t;
    this.renderer.info.reset();
    this.portals.update(s?.portals, this.camera, this.skyCamera, this.effects ? t : 0);
    this.toolPass.enabled = this.toolModel.visible;
    this.composer.render(dt);
    this.frames++;
    this.canvas.dataset.frames = String(this.frames);
  }
  takeSnapshot(): string | null {
    const showTool = this.toolPass.enabled;
    try {
      if (showTool) {
        this.toolPass.enabled = false;
        this.composer.render(0);
      }
      const photo = this.canvas.toDataURL("image/png");
      if (photo === "data:,") return null;
      this.sound("shutter");
      const flash = document.createElement("div");
      flash.className = "camera-flash";
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 450);
      return photo;
    } catch (err) {
      console.error("Camera snapshot error:", err);
      return null;
    } finally {
      this.toolPass.enabled = showTool;
    }
  }
  project(target: Vec) {
    const v = new THREE.Vector3(target.x, target.y + 9, target.z).project(this.camera);
    if (v.z > 1) return null;
    return {
      x: clamp((v.x * 0.5 + 0.5) * innerWidth, 35, innerWidth - 35),
      y: clamp((-v.y * 0.5 + 0.5) * innerHeight, 140, innerHeight - 145),
    };
  }

  minimap(canvas: HTMLCanvasElement, s: Snapshot, me: Player) {
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const scale = w / (WORLD_SIZE * 1.05);
    const px = (x: number) => w / 2 + x * scale;
    const pz = (z: number) => h / 2 + z * scale;

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
    s.adventure.drones.filter((d) => d.hp > 0).forEach((d) => dot(d, "#f28d78", 2));
    s.markers.forEach((m) => dot(m, "#ffc97f", 3));
    s.players.forEach((p) =>
      dot(p, p.id === me.id ? "#ffffff" : `#${COLORS[p.color].toString(16)}`, 3),
    );
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(px(me.x), pz(me.z));
    ctx.lineTo(px(me.x) - Math.sin(me.yaw) * 11, pz(me.z) - Math.cos(me.yaw) * 11);
    ctx.stroke();
  }
}
