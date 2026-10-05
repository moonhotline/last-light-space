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
  guideModel: THREE.Group | null = null;
  guideFollowing = false;
  guideInteractHeld = false;
  guideMixer: THREE.AnimationMixer | null = null;
  guideActions: Record<"idle" | "run" | "shoot", THREE.AnimationAction | null> = { idle: null, run: null, shoot: null };
  guideState: "idle" | "run" | "shoot" = "idle";
  guideShootTimer = 0;
  caveModel: THREE.Group | null = null;
  skyModel: THREE.Group | null = null;
  solarModel: THREE.Group | null = null;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.scene.add(this.systemGroup);
    this.scene.add(this.corridorGroup);
    this.scene.add(this.mineralNodes);
    this.assetLibrary.visible = false;
    this.scene.add(this.assetLibrary);
    this.corridorGroup.visible = false;

    this.buildSolarSystem();
    this.buildSpaceshipCorridor();
    this.buildMineralSpecimens();
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
    for (const [id, model] of this.shipMeshes) {
      model.visible = !!ship && (this.flightMode === "cruise" || ship.seats.some(Boolean)) && id === this.activeShip;
      if (!ship || !model.visible) continue;
      model.position.set(ship.x, ship.y + 2.2, ship.z);
      model.rotation.set(0, ship.yaw, -ship.bank);
    }
  }

  /** Step solar system rotation & flight physics */
  step(dt: number, shipPos: { x: number; y: number; z: number }) {
    // Slowly rotate planets along their polar axis
    for (const [id, entry] of this.planets) {
      entry.group.rotation.y += (id === "mercury" ? 0.04 : 0.08) * dt;
      const showHighDetail = this.flightMode === "cruise" || id === "kepler";
      entry.surfaceMesh.visible = !showHighDetail || !entry.highDetail;
      if (entry.highDetail) entry.highDetail.visible = showHighDetail;
    }
    for (const [id, ship] of this.shipMeshes)
      ship.visible = this.flightMode === "cruise" && id === this.activeShip;
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

      this.guideModel.position.y = groundAt(this.guideModel.position.x, this.guideModel.position.z) + 1.1;

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

    // Altitude calculation relative to Kepler
    const current = SOLAR_SYSTEM[this.currentPlanet] || SOLAR_SYSTEM.kepler;
    const distToCenter = Math.hypot(
      shipPos.x - current.position.x,
      shipPos.y - current.position.y,
      shipPos.z - current.position.z,
    );
    this.flightAltitude = Math.max(0, distToCenter - current.radius);

    // Automatic flight mode transition
    if (this.flightAltitude > 350 && this.flightMode === "surface") {
      this.flightMode = "cruise";
    } else if (this.flightAltitude <= 300 && this.flightMode === "cruise" && shipPos.y < 300) {
      this.flightMode = "surface";
    }
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
      model.visible = false;
      entry.highDetail = model;
      entry.group.add(model);
    };

    await Promise.allSettled([
      replacePlanet("kepler", "kepler_surface", "/assets/models/stylized_planet/scene.gltf"),
      replacePlanet("stylized", "stylized_planet", "/assets/models/stylized_planet/scene.gltf"),
      replacePlanet("mercury", "mercury", "/assets/models/mercury/scene.gltf"),
      replacePlanet("earth", "earth", "/assets/models/earth/scene.gltf"),
    ]);
    await Promise.allSettled([
      loadModel("cave", "/assets/models/cave/scene.gltf", 40),
      loadModel("sky", "/assets/models/sky/scene.gltf", 40),
      loadModel("solar_system", "/assets/models/solar_system/scene.gltf", 80),
      loadModel("corridor", "/assets/models/corridor/scene.gltf", 38).then((model) => {
        if (!model) return;
        this.corridorGroup.clear();
        this.corridorGroup.add(model);
      }),
      loadModel("fighter", "/assets/models/fighter/scene.gltf", 12).then((model) => {
        if (!model) return;
        model.position.copy(SOLAR_SYSTEM.kepler.position).add(new THREE.Vector3(0, 520, 0));
        model.visible = false;
        this.shipMeshes.set("light_fighter", model);
        this.systemGroup.add(model);
      }),
      loadModel("intergalactic", "/assets/models/intergalactic/scene.gltf", 34).then((model) => {
        if (!model) return;
        model.position.copy(SOLAR_SYSTEM.kepler.position).add(new THREE.Vector3(0, 520, 0));
        model.visible = false;
        this.shipMeshes.set("cruiser", model);
        this.systemGroup.add(model);
      }),
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
  }
}
