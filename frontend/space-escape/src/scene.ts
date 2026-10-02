import { weatherMaterials } from "./weathering";
import { AdventureView, optimizeModel } from "./adventure-view";
import { missionObjective } from "../shared/objectives";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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
import type { Snapshot, Player } from "../shared/types";
import type { MovementWorld } from "../shared/physics";
const COLORS = [0x9eeafa, 0xffc98b, 0xff9f81, 0xa6baff];
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
  skyScene = new THREE.Scene();
  skyCamera = new THREE.PerspectiveCamera(66, 1, 100, 22000);
  camera = new THREE.PerspectiveCamera(66, 1, 0.1, 6500);
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  sky = new THREE.Group();
  earth = new THREE.Group();
  giant = new THREE.Group();
  moon = new THREE.Group();
  sun = new THREE.DirectionalLight(0xffe2b3, 3.1);
  ready = false;
  frames = 0;
  thirdPerson = true;
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
  activeWeapon: "rifle" | "grapple" | "camera" = "rifle";
  weaponSwitchTime = 0;
  fpRifle: THREE.Group | null = null;
  fpGrapple: THREE.Group | null = null;
  fpCamera: THREE.Group | null = null;
  toolModel = new THREE.Group();

  setWeapon(w: "rifle" | "grapple" | "camera") {
    if (this.activeWeapon === w) return;
    this.activeWeapon = w;
    this.weaponSwitchTime = 0.25;
    this.sound("tool", 1.35);
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.FogExp2(0x667f91, 0.00052);
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
    );
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
    const n = 256,
      data = new Uint8Array(n * n * 4);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const i = (z * n + x) * 4,
          v =
            128 +
            55 * noise(x * 0.035, z * 0.035) +
            30 * noise(x * 0.14, z * 0.14) +
            22 * noise(x * 0.45, z * 0.45) +
            18 * hash(x, z);
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    const tex = new THREE.DataTexture(data, n, n);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.91,
      metalness: 0.08,
      map: tex,
      bumpMap: tex,
      bumpScale: 0.2,
    });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    const rockGeo = new THREE.IcosahedronGeometry(1, 2),
      rp = rockGeo.getAttribute("position");
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i),
        y = rp.getY(i),
        z = rp.getZ(i),
        k = 0.87 + noise(x * 8 + 11, z * 8 + y * 2) * 0.22;
      rp.setXYZ(i, x * k, y * k, z * k);
    }
    rockGeo.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshStandardMaterial({
        color: 0x586977,
        roughness: 0.92,
        map: tex,
        bumpMap: tex,
        bumpScale: 0.22,
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
    this.scene.add(rocks);
    // Distant peaks extend the basin beyond its walkable boundary, without streaming.
    const far = new THREE.Group();
    const farMat = new THREE.MeshStandardMaterial({
      color: 0x526b82,
      roughness: 1,
    });
    const angular = 512,
      rings = 40,
      positions = new Float32Array((angular + 1) * (rings + 1) * 3),
      rangeIndices: number[] = [];
    for (let row = 0; row <= rings; row++)
      for (let col = 0; col <= angular; col++) {
        const angle = (col / angular) * Math.PI * 2,
          radius = HALF + 140 + (row / rings) * 2400;
        const x = Math.sin(angle) * radius,
          z = Math.cos(angle) * radius;
        const ridge =
          1 - Math.abs(noise(x * 0.0023 + 70, z * 0.0023 - 40) * 2 - 1);
        const smaller = 1 - Math.abs(noise(x * 0.007 + 12, z * 0.007) * 2 - 1);
        const envelope = Math.pow(Math.sin((row / rings) * Math.PI), 0.65);
        const y =
          -35 +
          envelope *
            (50 +
              270 * Math.pow(ridge, 3) +
              105 * Math.pow(smaller, 5) +
              22 * noise(x * 0.025, z * 0.025));
        positions.set([x, y, z], (row * (angular + 1) + col) * 3);
        if (row < rings && col < angular) {
          const a = row * (angular + 1) + col,
            b = a + 1,
            c = a + angular + 1;
          rangeIndices.push(a, c, b, b, c, c + 1);
        }
      }
    const rangeGeometry = new THREE.BufferGeometry();
    rangeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    rangeGeometry.setIndex(rangeIndices);
    rangeGeometry.computeVertexNormals();
    far.add(new THREE.Mesh(rangeGeometry, farMat));
    this.scene.add(far);
  }
  buildSky() {
    this.skyScene.add(this.sky);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: vertex,
      fragmentShader: `varying vec3 vPosition;void main(){vec3 d=normalize(vPosition);float h=max(0.,d.y);vec3 c=mix(vec3(.24,.32,.39),vec3(.009,.020,.041),pow(h,.38));float s=pow(max(0.,dot(d,normalize(vec3(-.65,.19,-.5)))),28.);c+=vec3(.24,.13,.045)*s;gl_FragColor=vec4(c,1.);}`,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(18000, 40, 24),
      skyMat,
    );
    dome.renderOrder = -10;
    this.sky.add(dome);
    const stars = new Float32Array(5500 * 3),
      colors = new Float32Array(5500 * 3);
    for (let i = 0; i < 5500; i++) {
      const a = hash(i, 1) * Math.PI * 2,
        y = 0.03 + hash(i, 2) * 0.97,
        r = Math.sqrt(1 - y * y),
        b = 0.14 + hash(i, 8) ** 8 * 0.9;
      stars.set(
        [Math.cos(a) * r * 14000, y * 14000, Math.sin(a) * r * 14000],
        i * 3,
      );
      colors.set([b * 0.85, b * 0.93, b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    sg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const starfield = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 8,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.add(starfield);
    this.sky.add(this.earth, this.giant, this.moon);
    this.giant.position.set(4800, 4500, -9200);
    this.earth.position.set(-900, 1600, -8000);
    this.moon.position.set(-3600, -700, -8500);
    const gas = new THREE.Mesh(
      new THREE.SphereGeometry(1350, 96, 64),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: `varying vec2 vUv;varying vec3 vNormal;void main(){float q=vUv.y+sin(vUv.x*22.+vUv.y*45.)*.003;float b=.5+.13*sin(q*94.)+.065*sin(q*210.+sin(vUv.x*31.))+.04*sin(q*470.);vec3 c=mix(vec3(.28,.19,.12),vec3(.78,.62,.40),b);float l=smoothstep(-.25,.7,dot(normalize(vNormal),normalize(vec3(-.9,.22,.32))));c*=.035+l;gl_FragColor=vec4(c,1.);}`,
      }),
    );
    this.giant.add(gas);
    const ringGeo = new THREE.RingGeometry(1770, 3440, 240, 10);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        vertexShader: vertex,
        fragmentShader: `varying vec3 vPosition;void main(){float r=length(vPosition.xy);float t=(r-1770.)/1670.;float bands=.62+.08*sin(r*.19)+.12*sin(r*.048)+.045*sin(r*.81);float gap=1.-.91*exp(-pow((t-.45)/.018,2.));gap*=1.-.5*exp(-pow((t-.73)/.015,2.));vec3 c=mix(vec3(.39,.29,.18),vec3(.92,.76,.47),bands);float shadow=smoothstep(600.,1800.,vPosition.x+abs(vPosition.y)*1.3);c*=mix(.23,1.,shadow);float edge=smoothstep(0.,.04,t)*(1.-smoothstep(.90,1.,t));gl_FragColor=vec4(c,bands*gap*edge*.93);}`,
      }),
    );
    ring.rotation.x = 1.42;
    ring.rotation.z = 0;
    this.giant.rotation.z = 0.42;
    this.giant.add(ring);
    this.atmosphere(this.giant, 1356, 0xe3c197, 0.24);
    // A distant sun with a soft optical halo, kept below the ring composition.
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(75, 24, 16),
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
        opacity: 0.45,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.position.copy(sun.position);
    halo.scale.set(2100, 2100, 1);
    this.sky.add(halo);
  }
  radialTexture() {
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
    const loader = new GLTFLoader(),
      textureLoader = new THREE.TextureLoader();
    const [
      explorer,
      beacon,
      observatory,
      hoverboardGltf,
      rifleGltf,
      grappleGltf,
      cameraGltf,
      obeliskGltf,
      earth,
      moon,
    ] = await Promise.all([
      loader.loadAsync("/assets/explorer-v4.glb"),
      loader.loadAsync("/assets/beacon.glb"),
      loader.loadAsync("/assets/observatory.glb"),
      loader.loadAsync("/assets/hoverboard.glb"),
      loader.loadAsync("/assets/kinetic-rifle.glb"),
      loader.loadAsync("/assets/echo-grapple.glb"),
      loader.loadAsync("/assets/survey-camera.glb"),
      loader.loadAsync("/assets/obelisk.glb"),
      textureLoader.loadAsync("/assets/earth.jpg"),
      textureLoader.loadAsync("/assets/moon.jpg"),
    ]);
    this.astronaut = explorer.scene;
    this.astronautAnimations = explorer.animations;
    weatherMaterials(this.astronaut);
    this.hoverboardAsset = hoverboardGltf.scene;
    this.rifleAsset = rifleGltf.scene;
    this.grappleAsset = grappleGltf.scene;
    this.cameraAsset = cameraGltf.scene;
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
    if (this.rifleAsset) {
      this.fpRifle = this.rifleAsset.clone(true);
      this.fpRifle.scale.setScalar(0.55);
      this.fpRifle.position.set(0.22, -0.24, -0.44);
      this.fpRifle.rotation.set(0.05, Math.PI, 0);
      this.toolModel.add(this.fpRifle);
    }
    if (this.grappleAsset) {
      this.fpGrapple = this.grappleAsset.clone(true);
      this.fpGrapple.scale.setScalar(0.75);
      this.fpGrapple.position.set(-0.20, -0.22, -0.42);
      this.fpGrapple.rotation.set(0.05, Math.PI, 0);
      this.fpGrapple.visible = false;
      this.toolModel.add(this.fpGrapple);
    }
    if (this.cameraAsset) {
      this.fpCamera = this.cameraAsset.clone(true);
      this.fpCamera.scale.setScalar(1.1);
      this.fpCamera.position.set(0, -0.16, -0.36);
      this.fpCamera.rotation.set(0, 0, 0);
      this.fpCamera.visible = false;
      this.toolModel.add(this.fpCamera);
    }
    this.camera.add(this.toolModel);
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
    earth.colorSpace = moon.colorSpace = THREE.SRGBColorSpace;
    const planetMat = (map: THREE.Texture) =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map } },
        vertexShader: vertex,
        fragmentShader: `uniform sampler2D map;varying vec2 vUv;varying vec3 vNormal;void main(){vec3 c=texture2D(map,vUv).rgb;float d=dot(normalize(vNormal),normalize(vec3(.2,.35,.85)));float light=smoothstep(-.12,.75,d);c*=.025+light*.97;gl_FragColor=vec4(c,1.);}`,
      });
    const e = new THREE.Mesh(
      new THREE.SphereGeometry(890, 96, 64),
      planetMat(earth),
    );
    e.rotation.y = -0.6;
    this.earth.add(e);
    this.atmosphere(this.earth, 890, 0x73bfff, 0.78);
    this.moon.add(
      new THREE.Mesh(new THREE.SphereGeometry(490, 64, 48), planetMat(moon)),
    );
    this.ready = true;
    this.canvas.dataset.assetsLoaded = "4";
    await this.renderer.compileAsync(this.scene, this.camera);
    await this.renderer.compileAsync(this.skyScene, this.skyCamera);
  }
  async audio() {
    if (this.listener) {
      await this.listener.context.resume();
      return;
    }
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);
    await this.listener.context.resume();
    this.listener.setMasterVolume(0.5);
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
    if (!this.listener) return;
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
      grapple: [280, 1100, 0.32],
      kill: [160, 32, 0.65],
      hurt: [110, 42, 0.35],
      enemy: [340, 70, 0.22],
      shutter: [1600, 380, 0.09],
      trick: [440 * pitch, 880 * pitch, 0.22],
    };
    const [a, b, d] = sounds[name] || sounds.mark;
    o.type =
      name === "land" || name === "dash" || name === "step" || name === "shutter"
        ? "triangle"
        : "sine";
    o.frequency.setValueAtTime(a, now);
    o.frequency.exponentialRampToValueAtTime(b, now + d);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      name === "beacon" ? 0.19 : name === "step" ? 0.035 : 0.13,
      now + 0.016,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
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
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }
  toggleCamera() {
    this.thirdPerson = !this.thirdPerson;
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
  ) {
    this.adventure.update(s, me, dt, t);
    this.toolModel.visible = !!me && !this.thirdPerson && me.seat < 0;
    if (me) {
      if (this.weaponSwitchTime > 0) this.weaponSwitchTime -= dt;
      const switchDrop = Math.sin(Math.max(0, this.weaponSwitchTime) / 0.25 * Math.PI) * 0.14;
      const recoilKick = Math.max(0, me.toolCooldown - 0.12) * 0.22;
      this.toolModel.position.y =
        -0.3 -
        switchDrop +
        Math.sin(t * 7) * Math.min(0.012, Math.hypot(me.vx, me.vz) * 0.001);
      this.toolModel.position.z = -0.58 + recoilKick;

      if (this.fpRifle) this.fpRifle.visible = this.activeWeapon === "rifle";
      if (this.fpGrapple) this.fpGrapple.visible = this.activeWeapon === "grapple";
      if (this.fpCamera) this.fpCamera.visible = this.activeWeapon === "camera";
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
      const speed = Math.hypot(me.vx, me.vz),
        fov = 66 + clamp(speed / 43) * 8 * this.effects;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 5, dt);
      this.camera.updateProjectionMatrix();
      const target = new THREE.Vector3(me.x, me.y + 0.9, me.z),
        rotation = new THREE.Euler(me.pitch, me.yaw, 0, "YXZ");
      this.camera.rotation.copy(rotation);
      this.cameraObstructed = false;
      if (this.thirdPerson) {
        const offset = new THREE.Vector3(
            0,
            me.seat >= 0 ? 6 : 0,
            me.seat >= 0 ? 23 : 8,
          ).applyEuler(rotation),
          desired = target.clone().add(offset);
        let range = offset.length();
        if (physics)
          range = Math.min(range, physics.cameraDistance(target, desired));
        // Check the complete camera segment against terrain, including its safety margin.
        for (let f = 0.08; f <= 1; f += 0.035) {
          const q = target.clone().addScaledVector(offset, f);
          if (q.y < groundAt(q.x, q.z) + 0.55) {
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
          this.camera.position.set(
            s.adventure.ship.x - Math.sin(s.adventure.ship.yaw) * 4.7,
            s.adventure.ship.y + 3.9,
            s.adventure.ship.z - Math.cos(s.adventure.ship.yaw) * 4.7,
          );
        }
      }
      this.shake *= Math.exp(-dt * 12);
      if (playing && this.effects > 0) {
        this.camera.position.y +=
          Math.sin(t * 48) * this.shake * this.effects * 0.09;
        this.camera.rotation.z =
          Math.sin(t * 33) * this.shake * this.effects * 0.003;
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
        this.shake = clamp(me.landing / 13);
        this.lastLanding = me.landingId;
      }
      if (me.dashTime > 0 && this.lastDash === 0) {
        this.sound("dash");
        this.shake = 0.28;
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
    if (this.jetGain && this.listener) {
      const ctx = this.listener.context;
      this.jetGain.gain.setTargetAtTime(
        playing &&
          (me?.jetting || (me && me.seat >= 0 && s?.adventure.ship.repaired))
          ? me?.seat! >= 0
            ? 0.1 + Math.min(0.12, (s?.adventure.ship.thrust || 0) * 0.05)
            : 0.18
          : 0,
        ctx.currentTime,
        0.09,
      );
      this.jetFilter?.frequency.setTargetAtTime(
        playing && me?.jetting ? 650 + Math.max(0, me.vy) * 25 : 280,
        ctx.currentTime,
        0.12,
      );
    }
    this.sky.position.copy(this.camera.position);
    this.skyCamera.position.copy(this.camera.position);
    this.skyCamera.quaternion.copy(this.camera.quaternion);
    this.skyCamera.fov = this.camera.fov;
    this.skyCamera.aspect = this.camera.aspect;
    this.skyCamera.updateProjectionMatrix();
    const earthAge = s ? (s.earthAt < 0 ? 0 : s.time - s.earthAt) : 55;
    this.earth.position.y = -420 + 2320 * smooth(earthAge / 45);
    this.earth.rotation.y = worldTime * 0.002;
    const moonAge = s && s.completedAt >= 0 ? s.time - s.completedAt : 0;
    this.moon.position.y = -600 + 2600 * smooth(moonAge / 40);
    this.moon.rotation.y = worldTime * 0.001;
    this.giant.rotation.y = Math.sin(worldTime * 0.001) * 0.05;
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
        board.position.set(0, 0.015, 0.0);
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
          const heldRifle = this.rifleAsset.clone(true);
          heldRifle.name = "heldRifle";
          heldRifle.scale.setScalar(0.52);
          heldRifle.position.set(0.02, -0.05, 0.08);
          heldRifle.rotation.set(-Math.PI / 2, 0, Math.PI);
          if (rightHand) rightHand.add(heldRifle);

          const backRifle = this.rifleAsset.clone(true);
          backRifle.name = "backRifle";
          backRifle.scale.setScalar(0.52);
          backRifle.position.set(0.12, 0.15, -0.22);
          backRifle.rotation.set(0.2, 0.1, 2.35);
          backRifle.visible = false;
          if (upperBack) upperBack.add(backRifle);
        }

        if (this.grappleAsset) {
          const grapple = this.grappleAsset.clone(true);
          grapple.name = "grappleLauncher";
          grapple.scale.setScalar(0.65);
          grapple.position.set(0.02, 0.12, 0.02);
          grapple.rotation.set(0, 0, 0);
          if (leftForeArm) leftForeArm.add(grapple);
        }

        if (this.cameraAsset) {
          const hipCamera = this.cameraAsset.clone(true);
          hipCamera.name = "hipCamera";
          hipCamera.scale.setScalar(1.0);
          hipCamera.position.set(0.18, -0.06, 0.08);
          hipCamera.rotation.set(0.2, -0.3, 0.1);
          if (hips) hips.add(hipCamera);

          const heldCamera = this.cameraAsset.clone(true);
          heldCamera.name = "heldCamera";
          heldCamera.scale.setScalar(1.0);
          heldCamera.position.set(0.05, -0.04, 0.08);
          heldCamera.rotation.set(-Math.PI / 2, 0, 0);
          heldCamera.visible = false;
          if (rightHand) rightHand.add(heldCamera);
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
        a.add(nameplate);
        a.userData.name = p.name;
      }
      a.visible =
        p.seat < 0 && !(own && (!this.thirdPerson || this.cameraRange < 0.4));
      if (own) a.position.set(p.x, p.y - 0.82, p.z);
      else
        a.position.lerp(
          new THREE.Vector3(p.x, p.y - 0.82, p.z),
          1 - Math.exp(-dt * 14),
        );
      const targetYaw = p.yaw + Math.PI;
      a.rotation.y +=
        Math.atan2(
          Math.sin(targetYaw - a.rotation.y),
          Math.cos(targetYaw - a.rotation.y),
        ) *
        (1 - Math.exp(-dt * 12));
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

        const activeWep = own ? this.activeWeapon : (p.grapple ? "grapple" : "rifle");
        const heldRifle = a.getObjectByName("heldRifle");
        const backRifle = a.getObjectByName("backRifle");
        const heldCamera = a.getObjectByName("heldCamera");
        const hipCamera = a.getObjectByName("hipCamera");

        if (heldRifle && backRifle) {
          heldRifle.visible = activeWep === "rifle";
          backRifle.visible = activeWep !== "rifle";
        }
        if (heldCamera && hipCamera) {
          heldCamera.visible = activeWep === "camera";
          hipCamera.visible = activeWep !== "camera";
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
        } else if (activeWep === "rifle") {
          // Two-handed tactical rifle aiming posture
          if (anim.armR) {
            anim.armR.rotation.x = THREE.MathUtils.damp(anim.armR.rotation.x, -1.05 - p.pitch * 0.4, 12, dt);
            anim.armR.rotation.y = THREE.MathUtils.damp(anim.armR.rotation.y, -0.15, 12, dt);
            anim.armR.rotation.z = THREE.MathUtils.damp(anim.armR.rotation.z, 0.1, 12, dt);
          }
          if (anim.armL && !p.grapple) {
            anim.armL.rotation.x = THREE.MathUtils.damp(anim.armL.rotation.x, -0.95 - p.pitch * 0.4, 12, dt);
            anim.armL.rotation.y = THREE.MathUtils.damp(anim.armL.rotation.y, 0.35, 12, dt);
            anim.armL.rotation.z = THREE.MathUtils.damp(anim.armL.rotation.z, 0.42, 12, dt);
          }
          if (anim.torso) {
            anim.torso.rotation.y = THREE.MathUtils.damp(anim.torso.rotation.y, -0.15, 8, dt);
          }
        } else if (activeWep === "camera") {
          // Two-handed camera inspection/shooting posture
          if (anim.armR) {
            anim.armR.rotation.x = THREE.MathUtils.damp(anim.armR.rotation.x, -0.85 - p.pitch * 0.4, 12, dt);
            anim.armR.rotation.y = THREE.MathUtils.damp(anim.armR.rotation.y, -0.25, 12, dt);
          }
          if (anim.armL) {
            anim.armL.rotation.x = THREE.MathUtils.damp(anim.armL.rotation.x, -0.85 - p.pitch * 0.4, 12, dt);
            anim.armL.rotation.y = THREE.MathUtils.damp(anim.armL.rotation.y, 0.25, 12, dt);
          }
          if (anim.torso) {
            anim.torso.rotation.y = THREE.MathUtils.damp(anim.torso.rotation.y, 0, 8, dt);
          }
        } else {
          if (anim.torso) {
            anim.torso.rotation.y = THREE.MathUtils.damp(anim.torso.rotation.y, 0, 8, dt);
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
            const clearance = -0.10 - Math.sin(progress * Math.PI) * 0.12;
            board.position.set(0, clearance, 0.0);
          } else {
            board.rotation.x = THREE.MathUtils.damp(board.rotation.x, 0, 12, dt);
            board.rotation.z = THREE.MathUtils.damp(board.rotation.z, 0, 12, dt);
            board.rotation.y = THREE.MathUtils.damp(board.rotation.y, 0, 12, dt);
            board.position.set(0, 0.015 + Math.sin(t * 8) * 0.008, 0.0);
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
