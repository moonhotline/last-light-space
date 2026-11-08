import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  SOLAR_SYSTEM,
  MINERAL_SAMPLES,
  ALIEN_ROSTER,
  celestialCapture,
  type CelestialBody,
  type SpaceshipKind,
  type FlightFlightMode,
} from "../shared/celestial";
import { buildLandmark, buildPlanetaryRings, buildWarpGate, planetTexture } from "./celestial-visuals";
import { celestialFlightFrame } from "../shared/celestial-flight";
import { groundAt, HALF } from "../shared/map";
import type { AdventureShip } from "../shared/types";
import {
  ALIEN1_POS,
  ALIEN2_POS,
  MINERALS_POS,
  SPAWN_FLEET,
} from "../shared/adventure-data";

type RenderShip = Pick<AdventureShip, "x" | "y" | "z" | "yaw" | "bank" | "seats"> & Partial<AdventureShip>;

export function normalizeModelContainer(
  obj: THREE.Object3D,
  targetSize: number,
): THREE.Group {
  const container = new THREE.Group();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0.001 ? targetSize / maxDim : 1;
  obj.scale.multiplyScalar(scale);
  obj.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  obj.position.sub(center);
  obj.updateMatrixWorld(true);

  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  container.add(obj);
  container.userData.chassisClearance = Math.max(0.82, scaledBox.getSize(new THREE.Vector3()).y / 2);
  return container;
}

export function clean3DEntityText(root: THREE.Object3D) {
  // Authored node names, sprites and canvas textures can all be model content.
  // Retain this compatibility hook without removing or hiding any asset nodes.
  return root;
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

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const bottomClearance = model.userData.chassisClearance ?? (!box.isEmpty()
    ? Math.max(0.82, model.position.y - box.min.y)
    : 0.82);
  if (!box.isEmpty()) model.userData.chassisClearance = bottomClearance;
  const targetY = maxH + bottomClearance + groundOffset;

  return {
    position: new THREE.Vector3(cx, targetY, cz),
    pitch,
    roll,
    groundHeight: maxH,
  };
}

/** Smooth authoritative flight positions; terrain alignment is only for a resting hull. */
export function updateShipTransform(model: THREE.Group, ship: RenderShip, dt: number) {
  const spawn = SPAWN_FLEET[ship.kind ?? "light_fighter"];
  const position = new THREE.Vector3(ship.x, ship.y, ship.z);
  const alignment = computeCelestialAlignment(position, ship.yaw, ship.bank);
  const quaternion = alignment.quaternion;
  const overBasin = Math.abs(ship.x) <= HALF - 10 && Math.abs(ship.z) <= HALF - 10 && ship.y <= 650;
  const clearance = model.userData.chassisClearance ?? 0.82;
  if (alignment.captureWeight > 0.05) {
    position.addScaledVector(alignment.up, clearance);
  } else if (overBasin) {
    const resting = ship.grounded && Math.hypot(ship.vx ?? 0, ship.vz ?? 0) < 3;
    if (resting) {
      const ground = computeChassisAlignment(model, ship.x, ship.z, ship.yaw,
        spawn.halfWidth, spawn.halfLength, spawn.clearance);
      // Save the pad clearance once; airborne Y never resamples the terrain.
      model.userData.launchOffset ??= Math.max(clearance + spawn.clearance, ground.position.y - ship.y);
      position.y = Math.max(ground.position.y, ship.y + model.userData.launchOffset);
      quaternion.setFromEuler(new THREE.Euler(ground.pitch, ship.yaw, -ground.roll));
    } else {
      position.y += model.userData.launchOffset ?? clearance + spawn.clearance;
    }
  }
  model.position.lerp(position, 1 - Math.exp(-dt * 16));
  model.quaternion.slerp(quaternion, 1 - Math.exp(-dt * 12));
}

/**
 * Aligns a spaceship model to the local ground height and terrain inclination angle.
 * Preserves authored nodes and enables frustum culling on all submeshes.
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
  return computeCelestialAlignment(shipPos, shipYaw, shipBank, SOLAR_SYSTEM.mercury);
}

/** Universal gravitational capture frame for every spherical celestial body. */
export function computeCelestialAlignment(
  shipPos: { x: number; y: number; z: number },
  shipYaw: number,
  shipBank: number,
  preferredBody?: CelestialBody,
): {
  body: CelestialBody | null;
  up: THREE.Vector3;
  quaternion: THREE.Quaternion;
  captureWeight: number;
  altitude: number;
  isLanded: boolean;
} {
  const frame = celestialFlightFrame(shipPos, shipYaw, preferredBody ? [preferredBody] : undefined);
  // Bank is a local roll, independent of the planet's orientation in world space.
  const quaternion = frame.quaternion.clone().multiply(
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -shipBank),
  );
  return {
    body: frame.capture?.body ?? null,
    up: frame.up,
    quaternion,
    captureWeight: frame.capture?.weight ?? 0,
    altitude: frame.capture ? Math.max(0, frame.capture.altitude) : Infinity,
    isLanded: !!frame.capture && frame.capture.altitude <= 0.35,
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
  rings?: THREE.Group;
  portal?: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
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
  private shipState: RenderShip | null = null;
  currentPlanet = "kepler";
  targetPlanet = "mercury";

  warpSpeed = 0; // Current warp velocity
  warpCharge = 100; // 0..100
  flightAltitude = 0;

  // Spaceship models in flight
  shipMeshes: Map<SpaceshipKind, THREE.Group> = new Map();
  fighterModel: THREE.Group | null = null;
  intergalacticModel: THREE.Group | null = null;
  alien1Model: THREE.Group | null = null;
  alien2Model: THREE.Group | null = null;
  mineralsModel: THREE.Group | null = null;
  private adventureShip: THREE.Group | null = null;

  setShipReference(shipGroup: THREE.Group) {
    const previous = this.shipMeshes.get("light_fighter");
    if (previous && previous !== shipGroup) this.scene.remove(previous);
    this.adventureShip = shipGroup;
    this.fighterModel = shipGroup;
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
  mercuryOrbitEntered = false; // Legacy status for Mercury-specific consumers
  private capturedPlanet: string | null = null;

  onModelLoaded?: () => void;

  attachBlerkHoverboard(): THREE.Group | null {
    if (!this.guideModel) return null;
    const existing = this.guideModel.getObjectByName("blerk-hoverboard");
    if (existing) {
      this.guideHoverboard = existing as THREE.Group;
      return this.guideHoverboard;
    }

    const asset = this.downloadedAssets.get("hoverboard");
    if (!asset) return null;
    const board = asset.clone(true);
    board.name = "blerk-hoverboard";

    board.position.set(0, 0.05, 0);
    board.visible = false;
    this.guideModel.add(board);
    this.guideHoverboard = board;
    return board;
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

    // Stable flight containers receive authored assets when their files load.
    for (const kind of Object.keys(SPAWN_FLEET) as SpaceshipKind[]) {
      const ship = new THREE.Group();
      ship.name = `${kind}-ship`;
      this.parkShip(kind, ship);
      this.shipMeshes.set(kind, ship);
      this.scene.add(ship);
    }
    this.fighterModel = this.shipMeshes.get("light_fighter")!;
    this.intergalacticModel = this.shipMeshes.get("intergalactic")!;

    this.alien1Model = new THREE.Group();
    this.alien1Model.position.set(ALIEN1_POS.x, ALIEN1_POS.y, ALIEN1_POS.z);
    this.alien1Model.rotation.set(0, 1.2, 0);
    this.alien1Model.visible = true;
    this.scene.add(this.alien1Model);

    this.alien2Model = new THREE.Group();
    this.alien2Model.position.set(ALIEN2_POS.x, ALIEN2_POS.y, ALIEN2_POS.z);
    this.alien2Model.rotation.set(0, -0.8, 0);
    this.alien2Model.visible = true;
    this.scene.add(this.alien2Model);

    this.mineralsModel = new THREE.Group();
    this.mineralsModel.position.set(MINERALS_POS.x, MINERALS_POS.y, MINERALS_POS.z);
    this.mineralsModel.rotation.set(0, 0.3, 0);
    this.mineralsModel.visible = true;
    this.scene.add(this.mineralsModel);
    this.mineralNodes.add(this.mineralsModel);

    this.buildSolarSystem();
    this.buildSpaceshipCorridor();
    this.buildMineralSpecimens();
  }

  /** Build 3D planetary celestial bodies and orbits */
  private buildSolarSystem() {
    for (const [id, body] of Object.entries(SOLAR_SYSTEM)) {
      const pGroup = new THREE.Group();
      pGroup.position.set(body.position.x, body.position.y, body.position.z);
      pGroup.frustumCulled = true;

      if (id === "warpgate") {
        const gate = buildWarpGate(body);
        // Keep the entry shape shared, but never give a portal a spherical shell.
        pGroup.add(...gate.group.children.slice());
        this.systemGroup.add(pGroup);
        this.planets.set(id, { body, group: pGroup, surfaceMesh: gate.frame, portal: gate.portal });
        continue;
      }
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
          emissive: 0x475569,
          emissiveIntensity: 0.25,
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
      } else if (id === "venus") {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd9a441, roughness: 0.52, metalness: 0.02,
          emissive: 0x8a4f16, emissiveIntensity: 0.18,
        });
      } else if (id === "mars") {
        mat = new THREE.MeshStandardMaterial({
          color: 0xb74f30, roughness: 0.94, metalness: 0.03,
          emissive: 0x4a160d, emissiveIntensity: 0.22,
        });
      } else if (id === "jupiter") {
        mat = new THREE.MeshStandardMaterial({
          color: 0xd8ac83, roughness: 0.7, metalness: 0,
          emissive: 0x6c3f2c, emissiveIntensity: 0.16,
        });
      } else if (id === "saturn") {
        mat = new THREE.MeshStandardMaterial({
          color: 0xdcca96, roughness: 0.62, metalness: 0,
          emissive: 0x725d2d, emissiveIntensity: 0.14,
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

      if (["venus", "mars", "jupiter", "saturn"].includes(id) && mat instanceof THREE.MeshStandardMaterial) {
        mat.color.set(0xffffff);
        mat.map = planetTexture(body);
        if (id === "mars") { mat.bumpMap = mat.map; mat.bumpScale = 1.8; }
      }
      const geo = new THREE.SphereGeometry(body.radius, 64, 48);
      const surfaceMesh = new THREE.Mesh(geo, mat);
      surfaceMesh.castShadow = true;
      surfaceMesh.receiveShadow = true;
      surfaceMesh.frustumCulled = true;

      // Atmospheric Rayleigh scattering blending shell
      const rayleighGeo = new THREE.SphereGeometry(body.radius * 1.018, 48, 36);
      const rayleighMat = new THREE.MeshBasicMaterial({
        color: id === "kepler" ? 0x1b3547 : body.atmosphereColor,
        transparent: true,
        opacity: id === "kepler" ? 0.78 : 0.18,
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

      const rings = body.hasRings ? buildPlanetaryRings(body) : undefined;
      if (rings) pGroup.add(rings);
      for (const landmark of body.landmarks) pGroup.add(buildLandmark(body, landmark));

      // The fallback must exist from frame zero, before downloaded detail arrives.
      pGroup.add(surfaceMesh, rayleighMesh, atmoMesh);

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
        rings,
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
   * Empty site containers receive clones of the downloaded mineral asset.
   */
  private buildMineralSpecimens() {
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

  /** Switch between Spaceship models */
  switchShip(kind: SpaceshipKind) {
    this.activeShip = this.shipState ? this.shipState.kind ?? "light_fighter" : kind;
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
  private parkShip(kind: SpaceshipKind, model: THREE.Group) {
    const spawn = SPAWN_FLEET[kind];
    alignShipToGround(model, spawn.position.x, spawn.position.z,
      spawn.yaw,
      spawn.halfWidth, spawn.halfLength, spawn.clearance);
  }

  setShipState(ship: RenderShip | null, dt = Infinity) {
    const changed = this.activeShip !== (ship?.kind ?? "light_fighter");
    this.shipState = ship;
    this.activeShip = ship?.kind ?? "light_fighter";
    for (const [kind, model] of this.shipMeshes) {
      if (model === this.adventureShip) continue;
      if (ship && kind === this.activeShip) {
        updateShipTransform(model, ship, changed ? Infinity : dt);
      } else {
        this.parkShip(kind, model);
      }
    }
  }

  /** Step solar system rotation & flight physics */
  step(dt: number, shipPos: { x: number; y: number; z: number; planet?: string | null }) {
    const capture = celestialCapture(shipPos);
    const requested = shipPos.planet ? SOLAR_SYSTEM[shipPos.planet] : null;
    const current = capture?.body ?? (requested?.landable !== false ? requested : null);
    const altitude = current
      ? Math.max(0, Math.hypot(shipPos.x - current.position.x, shipPos.y - current.position.y,
        shipPos.z - current.position.z) - current.radius)
      : Math.max(0, shipPos.y - groundAt(shipPos.x, shipPos.z));
    this.flightAltitude = altitude;
    this.currentPlanet = current?.id ?? "kepler";
    const prevFlightMode = this.flightMode;
    if (altitude > 350 && this.flightMode === "surface") this.flightMode = "cruise";
    else if (altitude <= 300 && this.flightMode === "cruise") this.flightMode = "surface";
    const captured = capture?.body.id ?? null;
    if (captured !== this.capturedPlanet || this.flightMode !== prevFlightMode) this.onModelLoaded?.();
    this.capturedPlanet = captured;
    this.mercuryOrbitEntered = captured === "mercury";

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
      const rotationStep = (entry.body.rotationSpeed ?? 0.08) * dt;
      entry.surfaceMesh.rotation.y += rotationStep;
      if (entry.highDetail) entry.highDetail.rotation.y += rotationStep;
      for (const child of entry.group.children) {
        // Landmarks rotate about the same center as the textured crust.
        if (child.name.startsWith("landmark-")) child.rotation.y += rotationStep;
      }
      if (entry.portal) entry.portal.material.uniforms.time.value += dt;
      entry.group.visible = true; // All planets must remain visible through frustum culling
      entry.group.frustumCulled = true;
      entry.surfaceMesh.visible = true;
      entry.surfaceMesh.frustumCulled = true;
      if (id === "kepler") {
        const mat = entry.surfaceMesh.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = surfaceOpacity;
      }

      // Keep both layers mounted, including while the detail mount is pending.
      if (entry.highDetail) {
        entry.highDetail.visible = true;
        entry.highDetail.frustumCulled = true;
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
      }

      // Atmospheric Rayleigh scattering blending:
      // At surface, 远景天体 naturally blends into atmospheric sky tone (0x1b3547 / 0x38bdf8).
      // As ship ascends, Rayleigh mask smoothly fades away according to altitude, revealing deep space body.
      if (entry.rayleighMesh) {
        entry.rayleighMesh.visible = true;
        entry.rayleighMesh.frustumCulled = true;
        const mat = entry.rayleighMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (id === "kepler" ? 0.75 : 0.18) * rayleighBlend;
      }
      if (entry.atmosphereMesh) {
        entry.atmosphereMesh.visible = true;
        entry.atmosphereMesh.frustumCulled = true;
        const atmoMat = entry.atmosphereMesh.material as THREE.MeshBasicMaterial;
        atmoMat.opacity = THREE.MathUtils.lerp(0.18, 0.42, rayleighBlend);
      }
    }
    // Leave visibility to gameplay. Three.js culls each mesh with current render matrices.
    if (this.guideMixer) {
      this.guideMixer.update(dt);
    }
    if (this.guideModel) {
      let desiredState: "idle" | "run" | "shoot" = "idle";
      const dx = shipPos.x - this.guideModel.position.x;
      const dz = shipPos.z - this.guideModel.position.z;
      const distanceToPlayer = Math.hypot(dx, dz);

      // Enemy check: alien predators or combat encounters
      const alien1 = this.alien1Model || this.downloadedAssets.get("alien1");
      const alien2 = this.alien2Model || this.downloadedAssets.get("alien2");
      let nearEnemy = false;
      let enemyTarget: THREE.Vector3 | null = null;
      for (const enemy of [alien1, alien2]) {
        if (enemy && enemy.visible && enemy.userData.isHostile) {
          const eDist = Math.hypot(
            enemy.position.x - this.guideModel.position.x,
            enemy.position.z - this.guideModel.position.z
          );
          if (eDist < 25) {
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

    await Promise.all(Object.values(SPAWN_FLEET).map(async (spawn) => {
      if (spawn.kind === "light_fighter" && this.adventureShip) return;
      const container = this.shipMeshes.get(spawn.kind)!;
      const model = await loadModel(spawn.assetKey, spawn.asset, spawn.modelSize);
      if (!model) return;
      container.add(model);
      container.userData.chassisClearance = model.userData.chassisClearance;
      this.setShipState(this.shipState);
      this.onModelLoaded?.();
    }));

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

    for (const [key, url, size] of [
      ["corridor", "/assets/models/corridor/scene.gltf", 38],
      ["cave", "/assets/models/cave/scene.gltf", 40],
      ["sky", "/assets/models/sky/scene.gltf", 40],
      ["solar_system", "/assets/models/solar_system/scene.gltf", 80],
    ] as const) {
      const model = await loadModel(key, url, size);
      if (model) {
        clean3DEntityText(model);
        if (key === "corridor") {
          this.corridorGroup.add(model);
          this.onModelLoaded?.();
        }
      }
    }
    await loadModel("hoverboard", "/assets/models/hoverboard/scene.gltf", 1.35);
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
          this.attachBlerkHoverboard();
          this.guideActions.idle.play();
          this.guideState = "idle";
        }
      }),
      loadModel("alien1", "/assets/models/alien1/scene.gltf", 2.2).then((model) => {
        if (model && this.alien1Model) {
          clean3DEntityText(model);
          this.alien1Model.add(model);
        }
      }),
      loadModel("alien2", "/assets/models/alien2/scene.gltf", 2.6).then((model) => {
        if (model && this.alien2Model) {
          clean3DEntityText(model);
          this.alien2Model.add(model);
        }
      }),
      loadModel("minerals", "/assets/models/minerals/scene.gltf", 2.5).then((model) => {
        if (model && this.mineralsModel) {
          clean3DEntityText(model);
          this.mineralsModel.add(model);
          for (const cluster of this.mineralNodes.children) {
            if (cluster.userData.mineralId && cluster.children.length === 0) cluster.add(model.clone(true));
          }
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
