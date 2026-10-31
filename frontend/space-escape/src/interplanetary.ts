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
import { SHIP_HOME } from "../shared/adventure-data";
import { ShipAutopilot, InterplanetaryNavigator } from "../shared/interplanetary-nav";
import { MultiPlanetaryExpedition } from "../shared/expedition";
import { SteeringSystem } from "../shared/npc-ai";
import { LazyAssetScheduler } from "../shared/lod-culling";

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

export interface PlanetMeshEntry {
  body: CelestialBody;
  group: THREE.Group;
  surfaceMesh: THREE.Mesh;
  atmosphereMesh?: THREE.Mesh;
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

  // Mineral specimens placed in world
  mineralNodes: THREE.Group = new THREE.Group();
  assetLibrary: THREE.Group = new THREE.Group();
  downloadedAssets = new Map<string, THREE.Group>();
  assetErrors: string[] = [];
  // Category-driven loading state. No button ever triggers a model load:
  // planets / ships / NPCs load in the background and retry on their own.
  assetStatus = new Map<string, "pending" | "loaded" | "placeholder" | "failed">();
  scheduler = new LazyAssetScheduler(3);
  guideHoverboard: THREE.Group | null = null;
  private lastLoader: GLTFLoader | null = null;
  private retryTimer = 0;
  private retrying = false;
  private lastShipPosition: THREE.Vector3 | null = null;
  private lastShipYaw = 0;

  private makePlaceholder(kind: "ship" | "npc", targetSize: number): THREE.Group {
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
      group.add(hull, body);
    }
    const box = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.001) group.scale.setScalar(targetSize / maxDim);
    return group;
  }

  private replacePlaceholder(oldModel: THREE.Group | undefined, parent: THREE.Object3D) {
    if (oldModel && oldModel.userData.placeholder) parent.remove(oldModel);
  }
  guideModel: THREE.Group | null = null;
  guideFollowing = false;
  guideInteractHeld = false;
  guideMixer: THREE.AnimationMixer | null = null;
  guideActions: Record<"idle" | "run" | "shoot", THREE.AnimationAction | null> = { idle: null, run: null, shoot: null };
  guideState: "idle" | "run" | "shoot" = "idle";
  guideShootTimer = 0;
  autopilot: ShipAutopilot;
  expedition: MultiPlanetaryExpedition;
  caveModel: THREE.Group | null = null;
  skyModel: THREE.Group | null = null;
  solarModel: THREE.Group | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.autopilot = new ShipAutopilot(SOLAR_SYSTEM.kepler.position);
    this.expedition = new MultiPlanetaryExpedition(SOLAR_SYSTEM.kepler);
    this.scene.add(this.systemGroup);
    this.scene.add(this.corridorGroup);
    this.scene.add(this.mineralNodes);
    this.assetLibrary.visible = false;
    this.scene.add(this.assetLibrary);
    this.corridorGroup.visible = false;

    this.buildSolarSystem();
    this.buildSpaceshipCorridor();
    this.buildMineralSpecimens();

    // Dock spaceship at starting home position from frame zero
    const homePos = new THREE.Vector3(SHIP_HOME.x, groundAt(SHIP_HOME.x, SHIP_HOME.z) + 1.2, SHIP_HOME.z);
    const initialShip = this.makePlaceholder("ship", 12);
    initialShip.position.copy(homePos);
    initialShip.visible = true;
    this.shipMeshes.set("light_fighter", initialShip);
    this.scene.add(initialShip);
  }

  /** Build 3D planetary celestial bodies and orbits */
  private buildSolarSystem() {
    for (const [id, body] of Object.entries(SOLAR_SYSTEM)) {
      const pGroup = new THREE.Group();
      pGroup.position.set(body.position.x, body.position.y, body.position.z);

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
        // Mercury cratered surface with visible celestial albedo and specular
        mat = new THREE.MeshStandardMaterial({
          color: 0xa0aec0,
          roughness: 0.75,
          metalness: 0.25,
          emissive: 0x334155,
          emissiveIntensity: 0.28,
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
        });
      }

      const geo = new THREE.SphereGeometry(body.radius, 48, 36);
      const surfaceMesh = new THREE.Mesh(geo, mat);
      surfaceMesh.castShadow = true;
      surfaceMesh.receiveShadow = true;
      pGroup.add(surfaceMesh);

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
      pGroup.add(atmoMesh);

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
        this.systemGroup.add(ring);
      }

      this.systemGroup.add(pGroup);
      this.planets.set(id, {
        body,
        group: pGroup,
        surfaceMesh,
        atmosphereMesh: atmoMesh,
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

  /** Toggle Spaceship Corridor Interior View.
   * The corridor is a real place anchored to the ship, never a box
   * teleported onto the camera. Without a known ship position it stays
   * hidden instead of appearing at the camera. */
  toggleCorridor(enter?: boolean): boolean {
    const next = enter !== undefined ? enter : !this.inCorridor;
    if (!next) {
      this.inCorridor = false;
      this.corridorGroup.visible = false;
      this.flightMode = "surface";
      return false;
    }
    if (!this.lastShipPosition) return false;
    this.inCorridor = true;
    this.corridorGroup.position.copy(this.lastShipPosition);
    this.corridorGroup.rotation.set(0, this.lastShipYaw, 0);
    this.corridorGroup.visible = true;
    this.flightMode = "interior";
    return true;
  }

  /** Switch between Spaceship models */
  switchShip(kind: SpaceshipKind) {
    this.activeShip = kind;
    for (const [id, ship] of this.shipMeshes)
      ship.visible = this.flightMode === "cruise" && id === kind;
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
  setShipState(ship: { x: number; y: number; z: number; yaw: number; bank: number; seats: string[] } | null) {
    if (ship) {
      this.lastShipPosition = new THREE.Vector3(ship.x, ship.y, ship.z);
      this.lastShipYaw = ship.yaw;
    }
    const currentPos = ship
      ? new THREE.Vector3(ship.x, ship.y + 1.2, ship.z)
      : new THREE.Vector3(SHIP_HOME.x, groundAt(SHIP_HOME.x, SHIP_HOME.z) + 1.2, SHIP_HOME.z);
    const yaw = ship ? ship.yaw : Math.PI;
    const bank = ship ? -ship.bank : 0;

    for (const [id, model] of this.shipMeshes) {
      const isSelected = id === this.activeShip;
      model.position.copy(currentPos);
      model.rotation.set(0, yaw, bank);
      model.visible = isSelected;
    }
  }

  /** Step solar system rotation & flight physics */
  step(dt: number, shipPos: { x: number; y: number; z: number; planet?: string | null }) {
    // Category-driven auto-retry: failed planet / ship / NPC models are
    // retried in the background on a timer. No button is involved, and a
    // failed model never leaves its slot empty because placeholders below
    // already occupy it.
    if (this.lastLoader && this.assetErrors.length > 0 && !this.retrying) {
      this.retryTimer += dt;
      if (this.retryTimer >= 20) {
        this.retryTimer = 0;
        this.retrying = true;
        void this.loadAssets(this.lastLoader).finally(() => {
          this.retrying = false;
        });
      }
    }
    // The basin is a heightfield below the decorative Kepler sphere.
    // Raising that sphere must not mark a player on the basin floor as cruising.
    const current = SOLAR_SYSTEM[shipPos.planet || this.currentPlanet] || SOLAR_SYSTEM.kepler;
    const distToCenter = Math.hypot(
      shipPos.x - current.position.x,
      shipPos.y - current.position.y,
      shipPos.z - current.position.z,
    );
    this.flightAltitude = Math.max(0, current.id === "kepler" && shipPos.planet !== "kepler"
      ? shipPos.y - groundAt(shipPos.x, shipPos.z)
      : distToCenter - current.radius);

    // Automatic flight mode transition
    if (this.flightAltitude > 350 && this.flightMode === "surface") {
      this.flightMode = "cruise";
    } else if (this.flightAltitude <= 300 && this.flightMode === "cruise") {
      this.flightMode = "surface";
    }

    const isCruising = this.flightMode === "cruise" || this.flightMode === "ascent" || this.flightMode === "reentry";
    this.systemGroup.visible = true;

    // Camera Frustum Culling Engine: evaluate visibility within camera field of view
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projScreenMatrix);

    const isInFrustum = (pos: THREE.Vector3, radius: number): boolean => {
      return frustum.intersectsSphere(new THREE.Sphere(pos, radius));
    };

    // Rotate and frustum-cull celestial bodies (Kepler, Mercury, Earth, Stylized)
    for (const [id, entry] of this.planets) {
      entry.group.rotation.y += (id === "mercury" ? 0.04 : 0.08) * dt;
      const inView = isInFrustum(entry.group.position, entry.body.radius * 2.5);
      entry.group.visible = inView;
      if (inView) {
        entry.surfaceMesh.visible = !entry.highDetail;
        if (entry.highDetail) entry.highDetail.visible = true;
      }
    }

    for (const [id, ship] of this.shipMeshes) {
      const isSelected = id === this.activeShip;
      if (!isSelected) {
        ship.visible = false;
        continue;
      }
      ship.visible = isInFrustum(ship.position, 40);
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
        if (enemy) {
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

      // Check hoverboard deployment and surfing physics for companion
      if (this.guideHoverboard) {
        const isSurfing = desiredState === "run";
        this.guideHoverboard.visible = isSurfing;
        if (isSurfing) {
          this.guideModel.position.y = groundAt(this.guideModel.position.x, this.guideModel.position.z) + 1.35;
          this.guideHoverboard.rotation.z = THREE.MathUtils.damp(this.guideHoverboard.rotation.z, -dx * 0.015, 10, dt);
        } else {
          this.guideModel.position.y = groundAt(this.guideModel.position.x, this.guideModel.position.z) + 1.1;
          this.guideHoverboard.rotation.z = 0;
        }
      } else {
        this.guideModel.position.y = groundAt(this.guideModel.position.x, this.guideModel.position.z) + 1.1;
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

      // Render only when within camera view frustum
      this.guideModel.visible = !isCruising && isInFrustum(this.guideModel.position, 4);
    }

    // Alien predators frustum visibility
    const alien1 = this.downloadedAssets.get("alien1");
    if (alien1) {
      alien1.visible = !isCruising && isInFrustum(alien1.position, 6);
    }
    const alien2 = this.downloadedAssets.get("alien2");
    if (alien2) {
      alien2.visible = !isCruising && isInFrustum(alien2.position, 8);
    }

    if (this.caveModel) this.caveModel.visible = this.inCorridor && isInFrustum(this.caveModel.position, 60);
    if (this.skyModel) this.skyModel.visible = isCruising && isInFrustum(this.skyModel.position, 1000);
    if (this.solarModel) this.solarModel.visible = isCruising && isInFrustum(this.solarModel.position, 2000);

    // Mineral clusters crystal oscillation and frustum culling
    this.mineralNodes.visible = !isCruising && isInFrustum(new THREE.Vector3(-30, 21.5, 115), 35);
    if (this.mineralNodes.visible) {
      this.mineralNodes.children.forEach((c, idx) => {
        c.rotation.y += 0.4 * dt * (idx % 2 === 0 ? 1 : -1);
      });
    }
  }

  /**
   * Attaches sleek glowing repulsor hoverboard beneath Blerk's feet
   */
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

    const thrusterGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.18, 16);
    const thrusterMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.9,
    });
    const tFront = new THREE.Mesh(thrusterGeo, thrusterMat);
    tFront.position.set(0, -0.08, 0.45);
    board.add(tFront);

    const tRear = new THREE.Mesh(thrusterGeo, thrusterMat);
    tRear.position.set(0, -0.08, -0.45);
    board.add(tRear);

    board.position.set(0, -0.95, 0);
    board.visible = false;
    this.guideModel.add(board);
    this.guideHoverboard = board;
    return board;
  }

  /**
   * Asynchronously load real downloaded Sketchfab models with anti-clipping normalization.
   * Runs progressively in background so game boot is instantaneous and never blocked.
   */
  async loadAssets(loader: GLTFLoader) {
    this.lastLoader = loader;
    // A fresh pass retries only what is still missing; already-loaded real
    // models are returned from cache so a retry never duplicates them.
    const loadSafe = async (url: string, key: string, priority = 5) => {
      return this.scheduler.requestAsset({
        id: key,
        url,
        priority,
        load: async () => {
          this.assetStatus.set(key, "pending");
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              return await loader.loadAsync(url);
            } catch (err) {
              if (attempt === 2) throw err;
              await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            }
          }
          throw new Error(`Failed to load ${url}`);
        },
      }).catch((err) => {
        if (!this.assetErrors.includes(url)) this.assetErrors.push(url);
        this.assetStatus.set(key, "failed");
        return null;
      });
    };

    const loadModel = async (key: string, url: string, targetSize = 1, priority = 5) => {
      const cached = this.downloadedAssets.get(key);
      if (cached && !cached.userData.placeholder) return cached;
      const gltf = await loadSafe(url, key, priority);
      if (!gltf) return null;
      const model = normalizeModelContainer(gltf.scene, targetSize);
      // A real model replaces its placeholder in place; the placeholder
      // is removed from whichever parent it was shown in.
      if (cached) cached.removeFromParent();
      this.downloadedAssets.set(key, model);
      this.assetStatus.set(key, "loaded");
      this.assetLibrary.add(model);
      return model;
    };
    const replacePlanet = async (id: string, key: string, url: string, priority = 1) => {
      const model = await loadModel(key, url, this.planets.get(id)!.body.radius * 2, priority);
      const entry = this.planets.get(id);
      if (!model || !entry) return;
      model.visible = true;
      entry.highDetail = model;
      entry.group.add(model);
    };

    await Promise.allSettled([
      // Interactive companion Blerk with highest priority 10
      loadModel("blerk", "/assets/models/blerk/scene-web.glb", 2.2, 10).then((model) => {
        if (!model) {
          if (!this.guideModel) {
            const placeholder = this.makePlaceholder("npc", 2.2);
            placeholder.position.set(8, groundAt(8, 335) + 1.1, 335);
            this.guideModel = placeholder;
            this.scene.add(placeholder);
            this.assetStatus.set("blerk", "placeholder");
            this.attachBlerkHoverboard();
          }
          return;
        }
        // If already loaded as a real model (e.g. from prior pass or background retry), do not reset position or rebuild mixer
        if (this.guideModel && !this.guideModel.userData.placeholder) {
          this.attachBlerkHoverboard();
          return;
        }
        const prevPos = this.guideModel ? this.guideModel.position.clone() : new THREE.Vector3(8, groundAt(8, 335) + 1.1, 335);
        const prevRot = this.guideModel ? this.guideModel.rotation.y : 0;
        this.replacePlaceholder(this.guideModel ?? undefined, this.scene);
        model.position.copy(prevPos);
        model.rotation.y = prevRot;
        this.guideModel = model;
        this.scene.add(model);
        this.attachBlerkHoverboard();

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
      }),

      // Priority 9: Spaceship
      loadModel("fighter", "/assets/models/fighter/scene.gltf", 12, 9).then((model) => {
        const homePos = new THREE.Vector3(SHIP_HOME.x, groundAt(SHIP_HOME.x, SHIP_HOME.z) + 1.2, SHIP_HOME.z);
        if (!model) {
          if (!this.shipMeshes.has("light_fighter")) {
            const placeholder = this.makePlaceholder("ship", 12);
            placeholder.position.copy(homePos);
            placeholder.visible = this.activeShip === "light_fighter";
            this.shipMeshes.set("light_fighter", placeholder);
            this.scene.add(placeholder);
            this.assetStatus.set("fighter", "placeholder");
          }
          return;
        }
        this.replacePlaceholder(this.shipMeshes.get("light_fighter"), this.scene);
        model.position.copy(homePos);
        model.visible = this.activeShip === "light_fighter";
        this.shipMeshes.set("light_fighter", model);
        this.scene.add(model);
      }),

      // Priority 6: Corridor interior
      loadModel("corridor", "/assets/models/corridor/scene.gltf", 38, 6).then((model) => {
        if (!model) return;
        this.corridorGroup.clear();
        this.corridorGroup.add(model);
      }),

      // Priority 5: Capital ship & environments
      loadModel("intergalactic", "/assets/models/intergalactic/scene.gltf", 34, 5).then((model) => {
        const homePos = new THREE.Vector3(SHIP_HOME.x, groundAt(SHIP_HOME.x, SHIP_HOME.z) + 1.2, SHIP_HOME.z);
        if (!model) {
          if (!this.shipMeshes.has("cruiser")) {
            const placeholder = this.makePlaceholder("ship", 34);
            placeholder.position.copy(homePos);
            placeholder.visible = this.activeShip === "cruiser";
            this.shipMeshes.set("cruiser", placeholder);
            this.scene.add(placeholder);
            this.assetStatus.set("intergalactic", "placeholder");
          }
          return;
        }
        this.replacePlaceholder(this.shipMeshes.get("cruiser"), this.scene);
        model.position.copy(homePos);
        model.visible = this.activeShip === "cruiser";
        this.shipMeshes.set("cruiser", model);
        this.scene.add(model);
      }),
      loadModel("cave", "/assets/models/cave/scene.gltf", 40, 4),
      loadModel("sky", "/assets/models/sky/scene.gltf", 40, 4),
      loadModel("solar_system", "/assets/models/solar_system/scene.gltf", 80, 4),

      // Background planetary celestial bodies
      replacePlanet("kepler", "kepler_surface", "/assets/models/stylized_planet/scene.gltf", 4),
      replacePlanet("mercury", "mercury", "/assets/models/mercury/scene.gltf", 2),
      replacePlanet("stylized", "stylized_planet", "/assets/models/stylized_planet/scene.gltf", 1),
      replacePlanet("earth", "earth", "/assets/models/earth/scene.gltf", 1),
      loadModel("alien1", "/assets/models/alien1/scene.gltf", 2).then((model) => {
        if (!model) {
          if (!this.downloadedAssets.has("alien1")) {
            const placeholder = this.makePlaceholder("npc", 2);
            placeholder.position.set(165, groundAt(165, -85) + 1, -85);
            this.downloadedAssets.set("alien1", placeholder);
            this.scene.add(placeholder);
            this.assetStatus.set("alien1", "placeholder");
          }
          return;
        }
        this.replacePlaceholder(this.downloadedAssets.get("alien1"), this.scene);
        model.position.set(165, groundAt(165, -85) + 1, -85);
        this.scene.add(model);
      }),
      loadModel("alien2", "/assets/models/alien2/scene.gltf", 2.4).then((model) => {
        if (!model) {
          if (!this.downloadedAssets.has("alien2")) {
            const placeholder = this.makePlaceholder("npc", 2.4);
            placeholder.position.set(-170, groundAt(-170, -150) + 1.2, -150);
            this.downloadedAssets.set("alien2", placeholder);
            this.scene.add(placeholder);
            this.assetStatus.set("alien2", "placeholder");
          }
          return;
        }
        this.replacePlaceholder(this.downloadedAssets.get("alien2"), this.scene);
        model.position.set(-170, groundAt(-170, -150) + 1.2, -150);
        this.scene.add(model);
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
  }
}
