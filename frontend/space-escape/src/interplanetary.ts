import * as THREE from "three";
import {
  SOLAR_SYSTEM,
  MINERAL_SAMPLES,
  ALIEN_ROSTER,
  type CelestialBody,
  type SpaceshipKind,
  type FlightFlightMode,
} from "../shared/celestial";

export interface PlanetMeshEntry {
  body: CelestialBody;
  group: THREE.Group;
  surfaceMesh: THREE.Mesh;
  atmosphereMesh?: THREE.Mesh;
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

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.scene.add(this.systemGroup);
    this.scene.add(this.corridorGroup);
    this.scene.add(this.mineralNodes);
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
          color: 0x1e293b,
          roughness: 0.6,
          metalness: 0.15,
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
    hallway.position.set(0, 15000, 0);
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
    this.corridorGroup.visible = this.inCorridor;
    this.flightMode = this.inCorridor ? "interior" : "surface";
    return this.inCorridor;
  }

  /** Switch between Spaceship models */
  switchShip(kind: SpaceshipKind) {
    this.activeShip = kind;
  }

  /** Step solar system rotation & flight physics */
  step(dt: number, shipPos: { x: number; y: number; z: number }) {
    // Slowly rotate planets along their polar axis
    for (const [id, entry] of this.planets) {
      entry.group.rotation.y += (id === "mercury" ? 0.04 : 0.08) * dt;
    }

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
    } else if (this.flightAltitude <= 300 && this.flightMode === "cruise") {
      this.flightMode = "surface";
    }
  }
}
