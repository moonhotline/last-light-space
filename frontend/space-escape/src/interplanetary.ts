import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  SOLAR_SYSTEM,
  MINERAL_SAMPLES,
  ALIEN_ROSTER,
  type CelestialBody,
  type SpaceshipKind,
  type FlightFlightMode,
} from "../shared/celestial";
import { groundAt } from "../shared/map";
import { SHIP_HOME, SHIP1_POS, SHIP2_POS } from "../shared/adventure-data";

export function normalizeModelContainer(
  obj: THREE.Object3D,
  targetSize: number,
): THREE.Group {
  const container = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0.001 ? targetSize / maxDim : 1;
  obj.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  obj.position.sub(center);

  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  container.add(obj);
  return container;
}

export function clean3DEntityText(root: THREE.Object3D) {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const name = (obj.name || "").toLowerCase();
    if (
      (obj as any).isSprite ||
      (obj as any).isCSS2DObject ||
      (obj as any).isCSS3DObject ||
      name.includes("placeholder") ||
      name.includes("label") ||
      name.includes("debug") ||
      name.includes("text") ||
      name.includes("hint")
    ) {
      toRemove.push(obj);
    }
    if (obj instanceof THREE.Mesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        const maps = [m.map, m.emissiveMap, m.alphaMap, m.bumpMap, m.roughnessMap, m.metalnessMap];
        for (const tex of maps) {
          if (
            tex &&
            (tex instanceof THREE.CanvasTexture ||
              (typeof HTMLCanvasElement !== "undefined" && tex.image instanceof HTMLCanvasElement))
          ) {
            toRemove.push(obj);
            break;
          }
        }
      }
    }
  });
  for (const obj of toRemove) {
    obj.removeFromParent();
  }
}

export interface ChassisGroundAlignment {
  position: THREE.Vector3;
  pitch: number;
  roll: number;
  groundHeight: number;
}

/**
 * Calculates ground contact height and terrain inclination angles based on the model's chassis footprint.
 * Samples multiple perimeter corners to prevent clipping into sloped terrain.
 */
export function computeChassisAlignment(
  model: THREE.Object3D,
  cx: number,
  cz: number,
  yaw: number,
  halfWidth = 4,
  halfLength = 7,
  groundOffset = 0.08,
): ChassisGroundAlignment {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  // 4 corners of the chassis footprint
  const corners = [
    { x: -halfWidth, z: -halfLength }, // front-left
    { x: halfWidth, z: -halfLength },  // front-right
    { x: -halfWidth, z: halfLength },  // rear-left
    { x: halfWidth, z: halfLength },   // rear-right
  ];

  const heights = corners.map((c) => {
    const wx = cx + c.x * cosY - c.z * sinY;
    const wz = cz + c.x * sinY + c.z * cosY;
    return groundAt(wx, wz);
  });

  const centerH = groundAt(cx, cz);
  const maxH = Math.max(...heights, centerH);

  const frontAvg = (heights[0] + heights[1]) * 0.5;
  const rearAvg = (heights[2] + heights[3]) * 0.5;
  const leftAvg = (heights[0] + heights[2]) * 0.5;
  const rightAvg = (heights[1] + heights[3]) * 0.5;

  const pitch = THREE.MathUtils.clamp(Math.atan2(frontAvg - rearAvg, halfLength * 2), -0.15, 0.15);
  const roll = THREE.MathUtils.clamp(Math.atan2(leftAvg - rightAvg, halfWidth * 2), -0.15, 0.15);

  const targetY = maxH + 0.82 + groundOffset;

  return {
    position: new THREE.Vector3(cx, targetY, cz),
    pitch,
    roll,
    groundHeight: maxH,
  };
}

/**
 * Aligns a spaceship model to the local ground height and terrain inclination angle.
 * Strips any placeholder text and guarantees frustum culling is enabled on all submeshes.
 */
export function alignShipToGround(
  shipObj: THREE.Object3D,
  cx: number,
  cz: number,
  yaw: number,
  halfWidth = 4,
  halfLength = 7,
  groundOffset = 0.08,
) {
  clean3DEntityText(shipObj);
  const alignment = computeChassisAlignment(
    shipObj,
    cx,
    cz,
    yaw,
    halfWidth,
    halfLength,
    groundOffset,
  );
  shipObj.position.copy(alignment.position);
  shipObj.rotation.set(alignment.pitch, yaw, -alignment.roll);

  shipObj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.frustumCulled = true;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return alignment;
}

/**
 * Computes smooth Up-vector alignment to Mercury's radial normal vector:
 * n_hat = normalize(P_ship - P_mercury)
 * Supports stable arbitrary landing on Mercury's 320m spherical surface.
 */
export function computeMercuryAlignment(
  shipPos: { x: number; y: number; z: number },
  shipYaw: number,
  shipBank: number,
): {
  up: THREE.Vector3;
  quaternion: THREE.Quaternion;
  captureWeight: number;
  altitude: number;
  isLanded: boolean;
} {
  const merc = SOLAR_SYSTEM.mercury;
  const mercPos = new THREE.Vector3(merc.position.x, merc.position.y, merc.position.z);
  const pShip = new THREE.Vector3(shipPos.x, shipPos.y, shipPos.z);
  const diff = pShip.clone().sub(mercPos);
  const dist = diff.length();
  const normal = dist > 0.001 ? diff.clone().normalize() : new THREE.Vector3(0, 1, 0);

  const captureRadius = merc.atmosphereRadius + 180; // 660m
  const t = THREE.MathUtils.clamp((captureRadius - dist) / (captureRadius - merc.radius), 0, 1);
  const captureWeight = t * t * (3 - 2 * t); // smoothstep

  const worldUp = new THREE.Vector3(0, 1, 0);
  const blendedUp = worldUp.clone().lerp(normal, captureWeight).normalize();

  // Project forward vector from yaw onto the tangent plane perpendicular to blendedUp
  let forward = new THREE.Vector3(-Math.sin(shipYaw), 0, -Math.cos(shipYaw));
  forward.addScaledVector(blendedUp, -forward.dot(blendedUp));
  if (forward.lengthSq() < 0.0001) {
    forward.set(1, 0, 0).addScaledVector(blendedUp, -blendedUp.x);
  }
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, blendedUp).normalize();

  const matrix = new THREE.Matrix4().makeBasis(right, blendedUp, forward.clone().negate());
  const quat = new THREE.Quaternion().setFromRotationMatrix(matrix);

  if (Math.abs(shipBank) > 0.001) {
    const bankQuat = new THREE.Quaternion().setFromAxisAngle(forward, -shipBank);
    quat.multiply(bankQuat);
  }

  const altitude = Math.max(0, dist - merc.radius);
  const isLanded = dist <= merc.radius + 0.35;

  return {
    up: blendedUp,
    quaternion: quat,
    captureWeight,
    altitude,
    isLanded,
  };
}

/**
 * Calculates spherical geodesic arc distance (R * DeltaTheta) between two points on Mercury's 320m spherical surface.
 */
export function mercuryGeodesicDistance(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
): { geodesicArc: number; altDiff: number; totalDistance: number; valueOf: () => number } {
  const merc = SOLAR_SYSTEM.mercury;
  const v1 = new THREE.Vector3(p1.x - merc.position.x, p1.y - merc.position.y, p1.z - merc.position.z);
  const v2 = new THREE.Vector3(p2.x - merc.position.x, p2.y - merc.position.y, p2.z - merc.position.z);

  const r1 = v1.length();
  const r2 = v2.length();

  v1.normalize();
  v2.normalize();

  const dot = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
  const deltaTheta = Math.acos(dot);
  const geodesicArc = merc.radius * deltaTheta; // 320m * deltaTheta
  const altDiff = Math.abs(r1 - r2);
  const totalDistance = altDiff > 12 ? geodesicArc + (altDiff - 12) : geodesicArc;

  return {
    geodesicArc,
    altDiff,
    totalDistance,
    valueOf: () => geodesicArc,
  };
}

export interface PlanetMeshEntry {
  body: CelestialBody;
  group: THREE.Group;
  surfaceMesh: THREE.Mesh;
  atmosphereMesh?: THREE.Mesh;
  rayleighMesh?: THREE.Mesh;
  highDetail?: THREE.Group;
}

/**
 * Interplanetary Navigation, Solar System Cruise & Spaceship Interior Module.
 * Modular, decoupled and pluggable into GameView.
 */
export class InterplanetarySystem {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  // Space cruise group containing solar system planets & flight waypoints
  systemGroup = new THREE.Group();
  planets: Map<string, PlanetMeshEntry> = new Map();

  // Spaceship Interior Corridor Group
  corridorGroup = new THREE.Group();
  inCorridor = false;

  // Flight Cruise State
  flightMode: FlightFlightMode = "surface";
  activeShip: SpaceshipKind = "light_fighter";
  currentPlanet = "kepler";
  targetPlanet = "mercury";

  warpSpeed = 0; // Current warp velocity
  warpCharge = 100; // 0..100
  flightAltitude = 0;

  // Spaceship models in flight
  shipMeshes: Map<SpaceshipKind, THREE.Group> = new Map();
  cruiserModel: THREE.Group | null = null;
  initialPlaceholderShip?: THREE.Group;

  setShipReference(shipGroup: THREE.Group) {
    if (this.initialPlaceholderShip && this.initialPlaceholderShip.parent) {
      this.initialPlaceholderShip.parent.remove(this.initialPlaceholderShip);
      this.initialPlaceholderShip.visible = false;
    }
    this.shipMeshes.set("light_fighter", shipGroup);
  }

  // Mineral specimens placed in world
  mineralNodes: THREE.Group = new THREE.Group();
  assetLibrary: THREE.Group = new THREE.Group();
  downloadedAssets = new Map<string, THREE.Group>();
  assetErrors: string[] = [];
  guideModel: THREE.Group | null = null;
  guideFollowing = false;
  guideHoverboard: THREE.Group | null = null;
  guideInteractHeld = false;
  guideMixer: THREE.AnimationMixer | null = null;
  guideActions: Record<"idle" | "run" | "shoot", THREE.AnimationAction | null> = { idle: null, run: null, shoot: null };
  guideState: "idle" | "run" | "shoot" = "idle";
  guideShootTimer = 0;
  caveModel: THREE.Group | null = null;
  skyModel: THREE.Group | null = null;
  solarModel: THREE.Group | null = null;
  mercuryOrbitEntered = false;

  onModelLoaded?: () => void;

  attachBlerkHoverboard(): THREE.Group | null {
    if (!this.guideModel) return null;
    const existing = this.guideModel.getObjectByName("blerk-hoverboard");
    if (existing) {
      this.guideHoverboard = existing as THREE.Group;
      return this.guideHoverboard;
    }

    const board = new THREE.Group();
    board.name = "blerk-hoverboard";

    const deckGeo = new THREE.BoxGeometry(0.55, 0.05, 1.35);
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.8,
      roughness: 0.2,
    });
    board.add(new THREE.Mesh(deckGeo, deckMat));

    const glowGeo = new THREE.BoxGeometry(0.58, 0.02, 1.38);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    board.add(new THREE.Mesh(glowGeo, glowMat));

    board.position.set(0, 0.05, 0);
    board.visible = false;
    this.guideModel.add(board);
    this.guideHoverboard = board;
    return board;
  }

  makePlaceholder(kind: "ship" | "npc", targetSize: number): THREE.Group {
    const group = new THREE.Group();
    group.userData.placeholder = true;
    if (kind === "npc") {
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.45, 1.1, 4, 12),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.6, emissive: 0x0c4a6e, emissiveIntensity: 0.4 }),
      );
      mesh.position.y = 1.1;
      mesh.castShadow = true;
      group.add(mesh);
    } else {
      const hull = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.6 }),
      );
      hull.rotation.x = Math.PI / 2;
      hull.castShadow = true;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.5, 2.2),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 }),
      );
      body.castShadow = true;
      group.add(hull);
      group.add(body);
    }
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    group.scale.setScalar(targetSize / maxDim);
    return group;
  }

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.scene.add(this.systemGroup);
    this.scene.add(this.corridorGroup);
    this.scene.add(this.mineralNodes);
    this.assetLibrary.visible = false;
    this.scene.add(this.assetLibrary);
    this.corridorGroup.visible = false;

    // Dock spaceship at starting home position from frame zero
    const homePos = new THREE.Vector3(SHIP_HOME.x, groundAt(SHIP_HOME.x, SHIP_HOME.z) + 1.2, SHIP_HOME.z);
    const initialShip = this.makePlaceholder("ship", 12);
    initialShip.position.copy(homePos);
    initialShip.visible = true;
    this.initialPlaceholderShip = initialShip;
    this.shipMeshes.set("light_fighter", initialShip);
    this.scene.add(initialShip);

    this.buildSolarSystem();
    this.buildSpaceshipCorridor();
    this.buildMineralSpecimens();
    this.buildCruiserModel();
  }

  /** Build 3D planetary celestial bodies and orbits */
  private buildSolarSystem() {
    for (const [id, body] of Object.entries(SOLAR_SYSTEM)) {
      const pGroup = new THREE.Group();
      pGroup.position.set(body.position.x, body.position.y, body.position.z);
      pGroup.frustumCulled = true;

      let mat: THREE.Material;
      if (id === "earth") {
        // High-contrast Earth with continent & cloud shaders
        mat = new THREE.MeshStandardMaterial({
          color: 0x1e3a8a,
          roughness: 0.35,
          metalness: 0.1,
          emissive: 0x0c4a6e,
          emissiveIntensity: 0.25,
        });
      } else if (id === "mercury") {
        // Mercury heavily cratered surface
        mat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.85,
          metalness: 0.2,
        });
      } else if (id === "stylized") {
        // Stylized emerald green biosphere planet
        mat = new THREE.MeshStandardMaterial({
          color: 0x059669,
          roughness: 0.5,
          metalness: 0.1,
          emissive: 0x065f46,
          emissiveIntensity: 0.3,
        });
      } else {
        // Kepler home planet
        mat = new THREE.MeshStandardMaterial({
          color: 0x47758c,
          roughness: 0.78,
          metalness: 0.05,
          emissive: 0x102b3a,
          emissiveIntensity: 0.32,
          transparent: true,
          opacity: 0.38,
        });
      }

      const geo = new THREE.SphereGeometry(body.radius, 48, 36);
      const surfaceMesh = new THREE.Mesh(geo, mat);
      surfaceMesh.castShadow = true;
      surfaceMesh.receiveShadow = true;
      surfaceMesh.frustumCulled = true;

      // Atmospheric Rayleigh scattering blending shell
      const rayleighGeo = new THREE.SphereGeometry(body.radius * 1.018, 48, 36);
      const rayleighMat = new THREE.MeshBasicMaterial({
        color: 0x1b3547,
        transparent: true,
        opacity: id === "kepler" ? 0.78 : 0.45,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const rayleighMesh = new THREE.Mesh(rayleighGeo, rayleighMat);
      rayleighMesh.renderOrder = 2;
      rayleighMesh.frustumCulled = true;

      // Atmosphere glow layer
      const atmoGeo = new THREE.SphereGeometry(body.atmosphereRadius, 32, 24);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: body.atmosphereColor,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        depthWrite: false,
      });
      const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
      atmoMesh.frustumCulled = true;

      if (id === "mercury") {
        // Frame-sliced progressive mounting for alien planet surface & atmosphere to eliminate synchronous compile stalls
        if (typeof requestAnimationFrame !== "undefined") {
          requestAnimationFrame(() => {
            pGroup.add(surfaceMesh);
            requestAnimationFrame(() => {
              pGroup.add(rayleighMesh);
              pGroup.add(atmoMesh);
              this.onModelLoaded?.();
            });
          });
        } else {
          pGroup.add(surfaceMesh);
          pGroup.add(rayleighMesh);
          pGroup.add(atmoMesh);
        }
      } else {
        pGroup.add(surfaceMesh);
        pGroup.add(rayleighMesh);
        pGroup.add(atmoMesh);
      }

      // Planetary orbital ring line
      const orbitDist = Math.hypot(body.position.x, body.position.z);
      if (orbitDist > 100) {
        const ringGeo = new THREE.RingGeometry(orbitDist - 4, orbitDist + 4, 96);
        const ringMat = new THREE.MeshBasicMaterial({
          color: body.atmosphereColor,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.frustumCulled = true;
        this.systemGroup.add(ring);
      }

      this.systemGroup.add(pGroup);
      this.planets.set(id, {
        body,
        group: pGroup,
        surfaceMesh,
        atmosphereMesh: atmoMesh,
        rayleighMesh,
      });
    }
  }

  /**
   * Procedural Spaceship Corridor Interior:
   * Futuristic sci-fi hallway with observation airlock, LED strips and holographic consoles.
   */
  private buildSpaceshipCorridor() {
    const hallway = new THREE.Group();

    // Corridor Floor & Ceiling
    const floorGeo = new THREE.PlaneGeometry(8, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.25,
      metalness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    hallway.add(floor);

    const ceiling = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }),
    );
    ceiling.position.y = 4.2;
    ceiling.rotation.x = Math.PI / 2;
    hallway.add(ceiling);

    // Ribbed bulkhead frames
    for (let z = -16; z <= 16; z += 4) {
      const arch = new THREE.Group();
      arch.position.z = z;

      // Vertical pillars
      const pillarGeo = new THREE.BoxGeometry(0.4, 4.2, 0.6);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.6,
      });

      const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
      leftPillar.position.set(-4, 2.1, 0);
      arch.add(leftPillar);

      const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
      rightPillar.position.set(4, 2.1, 0);
      arch.add(rightPillar);

      // Cyan LED illumination strips
      const lightGeo = new THREE.BoxGeometry(0.08, 3.8, 0.08);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const leftLight = new THREE.Mesh(lightGeo, lightMat);
      leftLight.position.set(-3.75, 2.1, 0);
      arch.add(leftLight);

      const rightLight = new THREE.Mesh(lightGeo, lightMat);
      rightLight.position.set(3.75, 2.1, 0);
      arch.add(rightLight);

      hallway.add(arch);
    }

    // Front panoramic observation bay viewport
    const windowGeo = new THREE.BoxGeometry(7.6, 3.8, 0.1);
    const windowMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.9,
    });
    const viewport = new THREE.Mesh(windowGeo, windowMat);
    viewport.position.set(0, 2.1, -18);
    hallway.add(viewport);

    // Position corridor off-world
    hallway.position.set(0, 0, 0);
    this.corridorGroup.add(hallway);
  }

  /**
   * Mineral Specimen Outcrops:
   * Generates interactive crystal clusters across planetary sites.
   */
  private buildMineralSpecimens() {
    const crystalGeo = new THREE.OctahedronGeometry(0.85, 0);
    const sites = [
      { id: "calcite", pos: { x: -35, y: 19, z: 120 } },
      { id: "pyrite", pos: { x: 145, y: 38, z: -40 } },
      { id: "amethyst", pos: { x: -180, y: 75, z: -160 } },
      { id: "celestite", pos: { x: 80, y: 24, z: 290 } },
    ];

    for (const site of sites) {
      const spec = MINERAL_SAMPLES[site.id];
      if (!spec) continue;

      const cluster = new THREE.Group();
      cluster.position.set(site.pos.x, site.pos.y, site.pos.z);
      cluster.userData = { mineralId: spec.id, mineral: spec };

      const cMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(spec.color),
        roughness: 0.15,
        transmission: 0.6,
        thickness: 1.2,
        emissive: new THREE.Color(spec.color).multiplyScalar(0.25),
      });

      for (let i = 0; i < 4; i++) {
        const cMesh = new THREE.Mesh(crystalGeo, cMat);
        const scale = 0.5 + Math.random() * 0.7;
        cMesh.scale.set(scale, scale * 1.5, scale);
        cMesh.position.set(
          (Math.random() - 0.5) * 1.6,
          scale * 0.7,
          (Math.random() - 0.5) * 1.6,
        );
        cMesh.rotation.set(
          Math.random() * 0.4,
          Math.random() * Math.PI,
          Math.random() * 0.4,
        );
        cluster.add(cMesh);
      }

      this.mineralNodes.add(cluster);
    }
  }


  /** Toggle Spaceship Corridor Interior View */
  toggleCorridor(enter?: boolean): boolean {
    this.inCorridor = enter !== undefined ? enter : !this.inCorridor;
    if (this.inCorridor) {
      this.corridorGroup.position.copy(this.camera.position);
      this.corridorGroup.rotation.copy(this.camera.rotation);
    } else {
      this.corridorGroup.position.set(0, 0, 0);
      this.corridorGroup.rotation.set(0, 0, 0);
    }
    this.corridorGroup.visible = this.inCorridor;
    this.flightMode = this.inCorridor ? "interior" : "surface";
    return this.inCorridor;
  }

  /**
   * Procedural High-Fidelity Interstellar Cruiser (2号星际战舰):
   * Built immediately at instantiation so the warship is guaranteed visible at spawn from frame 0.
   * Scaled to 34m with multi-corner chassis slope alignment and frustum culling.
   */
  private buildCruiserModel(): THREE.Group {
    if (this.cruiserModel && this.cruiserModel.children.length > 0) {
      return this.cruiserModel;
    }
    const cruiser = this.cruiserModel || new THREE.Group();
    cruiser.name = "InterstellarCruiser_Root";

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.28,
      metalness: 0.82,
    });
    const armorPlateMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.9,
    });
    const glowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.2,
    });
    const engineGlowMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    // 1. Main Fuselage Hull (Angular heavy warship chassis)
    const hullGeo = new THREE.BoxGeometry(6.4, 2.6, 22);
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.position.set(0, 1.4, 0);
    cruiser.add(hullMesh);

    // 2. Chiseled Forward Bow / Ramming Prow
    const prowGeo = new THREE.ConeGeometry(3.6, 9.5, 4);
    const prowMesh = new THREE.Mesh(prowGeo, armorPlateMat);
    prowMesh.rotation.y = Math.PI / 4;
    prowMesh.rotation.x = -Math.PI / 2;
    prowMesh.position.set(0, 1.3, -14.5);
    cruiser.add(prowMesh);

    // 3. Command Bridge Deck (Elevated sci-fi cockpit)
    const bridgeGeo = new THREE.BoxGeometry(3.4, 1.3, 6.2);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, armorPlateMat);
    bridgeMesh.position.set(0, 2.9, -1.5);
    cruiser.add(bridgeMesh);

    // Glowing panoramic visor canopy
    const visorGeo = new THREE.BoxGeometry(3.0, 0.65, 3.2);
    const visorMesh = new THREE.Mesh(visorGeo, glowCyanMat);
    visorMesh.position.set(0, 3.2, -3.2);
    cruiser.add(visorMesh);

    // 4. Heavy Tactical Swept Delta Wings (Port & Starboard)
    for (const side of [-1, 1]) {
      const wingGeo = new THREE.BoxGeometry(7.2, 0.45, 12);
      const wingMesh = new THREE.Mesh(wingGeo, hullMat);
      wingMesh.position.set(side * 6.2, 1.2, 2.0);
      wingMesh.rotation.z = side * -0.06;
      wingMesh.rotation.y = side * 0.12;
      cruiser.add(wingMesh);

      // Wingtip vertical stabilizer fin
      const finGeo = new THREE.BoxGeometry(0.35, 2.8, 5.0);
      const finMesh = new THREE.Mesh(finGeo, armorPlateMat);
      finMesh.position.set(side * 9.8, 2.4, 3.5);
      cruiser.add(finMesh);

      // Navigation strobe beacon
      const navLightGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const navLightMat = new THREE.MeshBasicMaterial({
        color: side < 0 ? 0xf43f5e : 0x10b981,
      });
      const navLight = new THREE.Mesh(navLightGeo, navLightMat);
      navLight.position.set(side * 9.8, 3.8, 2.0);
      cruiser.add(navLight);

      // Forward Kinetic Railgun Battery
      const cannonGeo = new THREE.CylinderGeometry(0.25, 0.35, 7.5, 12);
      const cannonMesh = new THREE.Mesh(cannonGeo, armorPlateMat);
      cannonMesh.rotation.x = Math.PI / 2;
      cannonMesh.position.set(side * 3.8, 0.8, -10.5);
      cruiser.add(cannonMesh);

      // Twin Heavy Stern Thrusters
      const thrusterGeo = new THREE.CylinderGeometry(1.25, 1.5, 5.2, 16);
      const thrusterMesh = new THREE.Mesh(thrusterGeo, armorPlateMat);
      thrusterMesh.rotation.x = Math.PI / 2;
      thrusterMesh.position.set(side * 2.2, 1.4, 11.2);
      cruiser.add(thrusterMesh);

      // Exhaust glow nozzle
      const glowNozzleGeo = new THREE.CircleGeometry(1.2, 16);
      const glowNozzle = new THREE.Mesh(glowNozzleGeo, engineGlowMat);
      glowNozzle.position.set(side * 2.2, 1.4, 13.81);
      cruiser.add(glowNozzle);
    }

    // 5. Ventral Armored Magnetic Landing Gear Skids (4 corners)
    const gearPositions = [
      { x: -3.2, z: -8.0 },
      { x: 3.2, z: -8.0 },
      { x: -3.2, z: 8.0 },
      { x: 3.2, z: 8.0 },
    ];
    for (const gPos of gearPositions) {
      const legGeo = new THREE.CylinderGeometry(0.25, 0.3, 1.8, 8);
      const legMesh = new THREE.Mesh(legGeo, armorPlateMat);
      legMesh.position.set(gPos.x, 0.1, gPos.z);
      cruiser.add(legMesh);

      const footPadGeo = new THREE.BoxGeometry(1.4, 0.25, 2.2);
      const footPad = new THREE.Mesh(footPadGeo, armorPlateMat);
      footPad.position.set(gPos.x, -0.7, gPos.z);
      cruiser.add(footPad);
    }

    cruiser.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = true;
      }
    });

    clean3DEntityText(cruiser);

    this.cruiserModel = cruiser;
    this.shipMeshes.set("cruiser", cruiser);
    this.scene.add(cruiser);
    alignShipToGround(cruiser, SHIP2_POS.x, SHIP2_POS.z, 0, 3.5, 8.0, 0.05);
    cruiser.visible = true;

    return cruiser;
  }

  /** Switch between Spaceship models */
  switchShip(kind: SpaceshipKind) {
    this.activeShip = kind;
    if (typeof window !== "undefined") {
      (window as any).__activeShip = kind;
    }
    if (this.cruiserModel) this.cruiserModel.visible = true;
    for (const [id, ship] of this.shipMeshes) {
      if (id === "cruiser") {
        ship.visible = true;
        continue;
      }
      ship.visible = this.flightMode === "cruise" && id === kind;
    }
  }
  guideDialogue(player: { x: number; y: number; z: number }, pressed: boolean) {
    const guide = this.guideModel;
    const near = guide && Math.hypot(
      player.x - guide.position.x,
      player.y - guide.position.y,
      player.z - guide.position.z,
    ) < 8;
    const toggled = pressed && !this.guideInteractHeld && !!near;
    this.guideInteractHeld = pressed;
    if (toggled) this.guideFollowing = !this.guideFollowing;
    return toggled ? this.guideFollowing : null;
  }
  setShipState(ship: { x: number; y: number; z: number; yaw: number; bank: number; seats: string[]; flightTime?: number } | null) {
    if (this.cruiserModel) {
      this.cruiserModel.visible = true;
      this.cruiserModel.traverse((c) => {
        if (c instanceof THREE.Mesh) c.frustumCulled = true;
      });

      const isCruiserFlying = this.activeShip === "cruiser" && ship && (ship.seats.some(Boolean) || (ship.flightTime || 0) > 0);
      if (isCruiserFlying) {
        const mercAlign = computeMercuryAlignment(ship, ship.yaw, ship.bank);
        if (mercAlign.captureWeight > 0.05) {
          this.cruiserModel.position.set(ship.x, ship.y + 1.2, ship.z);
          this.cruiserModel.quaternion.copy(mercAlign.quaternion);
        } else {
          this.cruiserModel.position.set(ship.x, ship.y + 1.8, ship.z);
          this.cruiserModel.rotation.set(0, ship.yaw, -ship.bank);
        }
      } else if (this.activeShip === "cruiser" && ship) {
        alignShipToGround(this.cruiserModel, ship.x, ship.z, ship.yaw, 3.5, 8.0, 0.05);
      } else {
        // Parked in spawn position side-by-side with Skiff (18m apart)
        alignShipToGround(this.cruiserModel, SHIP2_POS.x, SHIP2_POS.z, 0, 3.5, 8.0, 0.05);
      }
    }
  }

  /** Step solar system rotation & flight physics */
  step(dt: number, shipPos: { x: number; y: number; z: number; planet?: string | null }) {
    // Altitude calculation relative to current planet surface
    const current = SOLAR_SYSTEM[shipPos.planet || this.currentPlanet] || SOLAR_SYSTEM.kepler;
    const distToCenter = Math.hypot(
      shipPos.x - current.position.x,
      shipPos.y - current.position.y,
      shipPos.z - current.position.z,
    );
    const altitude = Math.max(
      0,
      current.id === "kepler" && shipPos.planet !== "kepler"
        ? shipPos.y - groundAt(shipPos.x, shipPos.z)
        : distToCenter - current.radius,
    );
    this.flightAltitude = altitude;

    // Automatic flight mode transition
    const prevFlightMode = this.flightMode;
    if (this.flightAltitude > 350 && this.flightMode === "surface") {
      this.flightMode = "cruise";
    } else if (this.flightAltitude <= 300 && this.flightMode === "cruise" && shipPos.y < 300) {
      this.flightMode = "surface";
    }
    if (this.flightMode !== prevFlightMode) {
      this.onModelLoaded?.();
    }

    // Mercury orbital capture detection & async compilation trigger
    const mercAlign = computeMercuryAlignment(shipPos, 0, dt);
    if (mercAlign.captureWeight > 0.05 && !this.mercuryOrbitEntered) {
      this.mercuryOrbitEntered = true;
      this.onModelLoaded?.();
    } else if (mercAlign.captureWeight <= 0.01 && this.mercuryOrbitEntered) {
      this.mercuryOrbitEntered = false;
    }

    // Altitude factor: 0 on ground, 1 in deep space cruise via smoothstep
    const groundLevel = 15;
    const orbitAltitude = 450;
    const tAtmo = THREE.MathUtils.clamp((shipPos.y - groundLevel) / (orbitAltitude - groundLevel), 0, 1);
    const spaceFactor = tAtmo * tAtmo * (3 - 2 * tAtmo); // smoothstep
    const rayleighBlend = 1.0 - spaceFactor;
    const surfaceOpacity = THREE.MathUtils.lerp(0.38, 1.0, spaceFactor);

    // Relative celestial distance & parallax factor for Kepler:
    // On ground (spaceFactor = 0): Kepler is placed at distant sky position (160, 2800, -2600)
    // As player ascends (spaceFactor -> 1): smoothly transitions to orbital solar system coordinates
    const keplerEntry = this.planets.get("kepler");
    if (keplerEntry) {
      const distantSkyPos = new THREE.Vector3(160, 2800, -2600);
      const orbitalPos = new THREE.Vector3(
        SOLAR_SYSTEM.kepler.position.x,
        SOLAR_SYSTEM.kepler.position.y,
        SOLAR_SYSTEM.kepler.position.z,
      );
      keplerEntry.group.position.lerpVectors(distantSkyPos, orbitalPos, spaceFactor);
    }

    // Update ALL planets:
    // STRICT RULE: NEVER set visible = false in surface mode! All planets remain visible and rely on frustum culling.
    for (const [id, entry] of this.planets) {
      entry.group.rotation.y += (id === "mercury" ? 0.04 : 0.08) * dt;
      entry.group.visible = true; // All planets must remain visible through frustum culling
      entry.group.frustumCulled = true;

      // Handle high detail vs surface mesh without ever hiding planets
      if (entry.highDetail) {
        entry.highDetail.visible = true;
        entry.highDetail.frustumCulled = true;
        entry.surfaceMesh.visible = false;
        if (id === "kepler") {
          entry.highDetail.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              for (const m of mats) {
                m.transparent = true;
                m.opacity = surfaceOpacity;
              }
            }
          });
        }
      } else {
        entry.surfaceMesh.visible = true;
        entry.surfaceMesh.frustumCulled = true;
        if (id === "kepler" && entry.surfaceMesh.material) {
          const mat = entry.surfaceMesh.material as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.opacity = surfaceOpacity;
        }
      }

      // Atmospheric Rayleigh scattering blending:
      // At surface, 远景天体 naturally blends into atmospheric sky tone (0x1b3547 / 0x38bdf8).
      // As ship ascends, Rayleigh mask smoothly fades away according to altitude, revealing deep space body.
      if (entry.rayleighMesh) {
        entry.rayleighMesh.visible = true;
        entry.rayleighMesh.frustumCulled = true;
        const mat = entry.rayleighMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (id === "kepler" ? 0.75 : 0.45) * rayleighBlend;
      }
      if (entry.atmosphereMesh) {
        entry.atmosphereMesh.visible = true;
        entry.atmosphereMesh.frustumCulled = true;
        const atmoMat = entry.atmosphereMesh.material as THREE.MeshBasicMaterial;
        atmoMat.opacity = THREE.MathUtils.lerp(0.18, 0.42, rayleighBlend);
      }
    }
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);
    const isInFrustum = (pos: THREE.Vector3, radius: number): boolean => {
      return frustum.intersectsSphere(new THREE.Sphere(pos, radius));
    };

    for (const [id, ship] of this.shipMeshes) {
      if (id === "cruiser") {
        ship.visible = true;
        continue;
      }
      const shouldShow = this.flightMode === "cruise" ? id === this.activeShip : id === "light_fighter";
      ship.visible = shouldShow && isInFrustum(ship.position, 40);
    }
    if (this.guideMixer) {
      this.guideMixer.update(dt);
    }
    if (this.guideModel) {
      let desiredState: "idle" | "run" | "shoot" = "idle";
      const dx = shipPos.x - this.guideModel.position.x;
      const dz = shipPos.z - this.guideModel.position.z;
      const distanceToPlayer = Math.hypot(dx, dz);

      // Enemy check: alien predators or combat encounters
      const alien1 = this.downloadedAssets.get("alien1");
      const alien2 = this.downloadedAssets.get("alien2");
      let nearEnemy = false;
      let enemyTarget: THREE.Vector3 | null = null;
      for (const enemy of [alien1, alien2]) {
        if (enemy && enemy.visible) {
          const eDist = Math.hypot(
            enemy.position.x - this.guideModel.position.x,
            enemy.position.z - this.guideModel.position.z
          );
          if (eDist < 45) {
            nearEnemy = true;
            enemyTarget = enemy.position;
            break;
          }
        }
      }

      if (nearEnemy && enemyTarget) {
        // Combat state: turn towards enemy and shoot
        desiredState = "shoot";
        const aimAngle = Math.atan2(
          enemyTarget.x - this.guideModel.position.x,
          enemyTarget.z - this.guideModel.position.z
        );
        this.guideModel.rotation.y = THREE.MathUtils.damp(this.guideModel.rotation.y, aimAngle, 10, dt);
      } else if (this.guideFollowing && distanceToPlayer > 4) {
        // Patrol & follow running state
        desiredState = "run";
        const step = Math.min(distanceToPlayer - 3, dt * 7);
        this.guideModel.position.x += (dx / Math.max(distanceToPlayer, 0.001)) * step;
        this.guideModel.position.z += (dz / Math.max(distanceToPlayer, 0.001)) * step;
        const moveAngle = Math.atan2(dx, dz);
        this.guideModel.rotation.y = THREE.MathUtils.damp(this.guideModel.rotation.y, moveAngle, 10, dt);
      } else {
        // Idle standby state
        desiredState = "idle";
      }

      this.guideModel.position.y =
        groundAt(this.guideModel.position.x, this.guideModel.position.z) +
        (desiredState === "run" ? 1.4 : 1.1);
      if (this.guideHoverboard) {
        this.guideHoverboard.visible = desiredState === "run";
      }

      // Cross-fade state machine transitions
      if (this.guideState !== desiredState && this.guideActions[desiredState]) {
        const currentAction = this.guideActions[this.guideState];
        const nextAction = this.guideActions[desiredState];
        if (currentAction && nextAction) {
          currentAction.fadeOut(0.2);
          nextAction.reset().fadeIn(0.2).play();
          this.guideState = desiredState;
        }
      }
    }
    if (this.caveModel) this.caveModel.visible = this.inCorridor;
    if (this.skyModel) this.skyModel.visible = this.flightMode === "cruise";
    if (this.solarModel) this.solarModel.visible = this.flightMode === "cruise";

    // Mineral clusters crystal oscillation
    this.mineralNodes.children.forEach((c, idx) => {
      c.rotation.y += 0.4 * dt * (idx % 2 === 0 ? 1 : -1);
    });
  }


  /**
   * Asynchronously load real downloaded Sketchfab models with anti-clipping normalization.
   * Runs progressively in background so game boot is instantaneous and never blocked.
   */
  async loadAssets(loader: GLTFLoader) {
    const loadSafe = async (url: string) => {
      try {
        return await loader.loadAsync(url);
      } catch {
        this.assetErrors.push(url);
        return null;
      }
    };

    const loadModel = async (key: string, url: string, targetSize = 1) => {
      const gltf = await loadSafe(url);
      if (!gltf) return null;
      const model = normalizeModelContainer(gltf.scene, targetSize);
      this.downloadedAssets.set(key, model);
      this.assetLibrary.add(model);
      return model;
    };
    const replacePlanet = async (id: string, key: string, url: string) => {
      const model = await loadModel(key, url, this.planets.get(id)!.body.radius * 2);
      const entry = this.planets.get(id);
      if (!model || !entry) return;
      clean3DEntityText(model);
      model.visible = true;
      model.frustumCulled = true;
      entry.highDetail = model;
      requestAnimationFrame(() => {
        entry.group.add(model);
        this.onModelLoaded?.();
      });
    };

    for (const [id, key, url] of [
      ["mercury", "mercury", "/assets/models/mercury/scene.gltf"],
      ["kepler", "kepler_surface", "/assets/models/stylized_planet/scene.gltf"],
      ["stylized", "stylized_planet", "/assets/models/stylized_planet/scene.gltf"],
      ["earth", "earth", "/assets/models/earth/scene.gltf"],
    ] as const) {
      await replacePlanet(id, key, url);
    }

    try {
      const landerGltf = await loader.loadAsync("/assets/lander.glb");
      if (landerGltf && this.cruiserModel) {
        clean3DEntityText(landerGltf.scene);
        landerGltf.scene.scale.setScalar(1.2);
        landerGltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = true;
          }
        });
        this.cruiserModel.clear();
        this.cruiserModel.add(landerGltf.scene);
        alignShipToGround(this.cruiserModel, SHIP2_POS.x, SHIP2_POS.z, 0, 3.5, 8.0, 0.05);
      }
    } catch {
      /* Keep authored cruiser chassis fallback */
    }

    for (const [key, url, size] of [
      ["fighter", "/assets/models/fighter/scene.gltf", 12],
      ["corridor", "/assets/models/corridor/scene.gltf", 38],
      ["cave", "/assets/models/cave/scene.gltf", 40],
      ["sky", "/assets/models/sky/scene.gltf", 40],
      ["solar_system", "/assets/models/solar_system/scene.gltf", 80],
    ] as const) {
      const model = await loadModel(key, url, size);
      if (model) {
        clean3DEntityText(model);
        if (key === "corridor") {
          this.corridorGroup.clear();
          this.corridorGroup.add(model);
          this.onModelLoaded?.();
        } else if (key === "fighter") {
          model.position.copy(SOLAR_SYSTEM.kepler.position).add(new THREE.Vector3(0, 520, 0));
          model.visible = false;
          this.shipMeshes.set("light_fighter", model);
          this.systemGroup.add(model);
          this.onModelLoaded?.();
        }
      }
    }
    await Promise.allSettled([
      loadModel("blerk", "/assets/models/blerk/scene-web.glb", 2.2).then((model) => {
        if (model) {
          model.position.set(8, groundAt(8, 335) + 1.1, 335);
          this.guideModel = model;
          this.scene.add(model);

          // Setup Cleck/Blerk skeletal animation clips (Idle, Run, Shoot)
          const mixer = new THREE.AnimationMixer(model);
          this.guideMixer = mixer;

          // Target existing or child groups for keyframe tracks
          const trackTarget = model.children[0]?.name || "";
          const prefix = trackTarget ? `${trackTarget}.` : "";

          // 1. Idle clip: subtle breathing and posture swaying
          const idleTrackPos = new THREE.VectorKeyframeTrack(
            `${prefix}position`,
            [0, 1.2, 2.4],
            [0, 0, 0,  0, 0.04, 0,  0, 0, 0]
          );
          const idleTrackRot = new THREE.QuaternionKeyframeTrack(
            `${prefix}quaternion`,
            [0, 1.2, 2.4],
            [0, 0, 0, 1,  0, 0.035, 0, 0.999,  0, 0, 0, 1]
          );
          const idleClip = new THREE.AnimationClip("Idle", 2.4, [idleTrackPos, idleTrackRot]);

          // 2. Run clip: energetic patrol movement with stride bounce
          const runTrackPos = new THREE.VectorKeyframeTrack(
            `${prefix}position`,
            [0, 0.25, 0.5, 0.75, 1.0],
            [0, 0, 0,  0, 0.12, 0,  0, 0, 0,  0, 0.12, 0,  0, 0, 0]
          );
          const runTrackRot = new THREE.QuaternionKeyframeTrack(
            `${prefix}quaternion`,
            [0, 0.25, 0.5, 0.75, 1.0],
            [
              0, 0, 0.06, 0.998,
              0.04, 0, 0, 0.999,
              0, 0, -0.06, 0.998,
              0.04, 0, 0, 0.999,
              0, 0, 0.06, 0.998,
            ]
          );
          const runClip = new THREE.AnimationClip("Run", 1.0, [runTrackPos, runTrackRot]);

          // 3. Shoot clip: combat recoil and weapon discharge stance
          const shootTrackPos = new THREE.VectorKeyframeTrack(
            `${prefix}position`,
            [0, 0.08, 0.2, 0.4],
            [0, 0, 0,  0, 0.02, -0.14,  0, 0.01, -0.05,  0, 0, 0]
          );
          const shootTrackRot = new THREE.QuaternionKeyframeTrack(
            `${prefix}quaternion`,
            [0, 0.08, 0.2, 0.4],
            [
              0, 0, 0, 1,
              -0.08, 0, 0, 0.997,
              -0.02, 0, 0, 1.0,
              0, 0, 0, 1,
            ]
          );
          const shootClip = new THREE.AnimationClip("Shoot", 0.4, [shootTrackPos, shootTrackRot]);

          this.guideActions.idle = mixer.clipAction(idleClip);
          this.guideActions.run = mixer.clipAction(runClip);
          this.guideActions.shoot = mixer.clipAction(shootClip);
          this.guideActions.idle.play();
          this.guideState = "idle";
        }
      }),
      loadModel("alien1", "/assets/models/alien1/scene.gltf", 2).then((model) => {
        if (model) {
          model.position.set(165, groundAt(165, -85) + 1, -85);
          this.scene.add(model);
        }
      }),
      loadModel("alien2", "/assets/models/alien2/scene.gltf", 2.4).then((model) => {
        if (model) {
          model.position.set(-170, groundAt(-170, -150) + 1.2, -150);
          this.scene.add(model);
        }
      }),
      loadModel("minerals", "/assets/models/minerals/scene.gltf", 2.4).then((model) => {
        if (model) {
          model.position.set(-30, 21.5, 115);
          this.mineralNodes.add(model);
        }
      }),
    ]);
    this.caveModel = this.downloadedAssets.get("cave") || null;
    this.skyModel = this.downloadedAssets.get("sky") || null;
    this.solarModel = this.downloadedAssets.get("solar_system") || null;
    if (this.caveModel) {
      this.caveModel.position.set(-310, groundAt(-310, -210) + 20, -210);
      this.scene.add(this.caveModel);
    }
    if (this.skyModel) {
      this.skyModel.position.copy(SOLAR_SYSTEM.kepler.position);
      this.scene.add(this.skyModel);
    }
    if (this.solarModel) {
      this.solarModel.position.copy(SOLAR_SYSTEM.kepler.position);
      this.systemGroup.add(this.solarModel);
    }
    this.onModelLoaded?.();
  }
}
