import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { initPhysics, MovementWorld } from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { interactAdventure, tickShip } from "../../frontend/space-escape/shared/adventure";
import {
  FIGHTER_POS,
  INTERGALACTIC_POS,
  LAB,
  LORE,
  RESOURCE_SITES,
} from "../../frontend/space-escape/shared/adventure-data";
import {
  GROVE_TREES,
  HOME_PLANET_SPHERE,
  OUTPOST_POSTS,
  SHIP_COLLIDER_SPECS,
} from "../../frontend/space-escape/shared/colliders";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { groundAt, HALF, SCENIC_SITES, SEGMENTS, terrainMesh, terrainRaw } from "../../frontend/space-escape/shared/map";
import { HOME_COLLAR_RADIUS, homeSphereHeight } from "../../frontend/space-escape/shared/home-planet";
import { idleInput } from "../../frontend/space-escape/shared/types";
import { ShipPropulsionFX } from "../../frontend/space-escape/src/thruster-fx";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { StardustParallaxStream } from "../../frontend/space-escape/src/scene";

await initPhysics();

test("spaceship flight exhibits three-axis pitch attitude, boost ignition pulse, and turn-carving assist", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  const p = sim.add("pilot");
  sim.start(p.id);
  p.seat = 0;
  const ship = sim.s.adventure.ship;
  Object.assign(ship, {
    kind: "light_fighter",
    repaired: true,
    grounded: false,
    seats: [p.id, "", "", ""],
    x: 0,
    y: 1200,
    z: 0,
    yaw: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  });

  // Climb pitches nose up
  for (let seq = 1; seq <= 25; seq++) {
    tickShip(sim, new Map([[p.id, { ...idleInput(seq), forward: 1, jump: true }]]));
  }
  assert.ok((ship.pitch ?? 0) > 0.12, `expected positive climb pitch, got ${ship.pitch}`);

  // Igniting boost fires a transient pulse
  tickShip(sim, new Map([[p.id, { ...idleInput(26), forward: 1, sprint: true }]]));
  assert.ok((ship.boostPulse ?? 0) > 0.5, `expected boostPulse ignition spike, got ${ship.boostPulse}`);

  // Braking descends with gentle nose-down pitch
  for (let seq = 27; seq <= 70; seq++) {
    tickShip(sim, new Map([[p.id, { ...idleInput(seq), brake: true }]]));
  }
  assert.ok((ship.pitch ?? 0) < -0.05, `expected negative dive/brake pitch, got ${ship.pitch}`);
});

test("ShipPropulsionFX replaces legacy orange brake cones with volumetric cryo-plumes, streaks, and ribbons", () => {
  for (const kind of ["light_fighter", "intergalactic"] as const) {
    const fx = new ShipPropulsionFX(kind);
    const coneMeshes: THREE.Mesh[] = [];
    fx.rootGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.ConeGeometry) {
        coneMeshes.push(obj);
      }
    });
    assert.equal(coneMeshes.length, 0, `${kind} must not contain legacy ConeGeometry brake meshes`);

    // First 4 meshes (2 outer plumes + 2 inner cores) must all use custom Fresnel ShaderMaterial
    const plumes = fx.rootGroup.children.filter((n) => n instanceof THREE.Mesh).slice(0, 4) as THREE.Mesh[];
    assert.equal(plumes.length, 4);
    for (const mesh of plumes) {
      assert.ok(mesh.material instanceof THREE.ShaderMaterial, "both outer and inner plumes must use Fresnel shaders");
    }

    assert.ok(fx.rootGroup.getObjectByName("cryo-retro-brake-plume"), "cryo retro-brake plume must exist");
    assert.ok(fx.rootGroup.getObjectByName("airbrake-shock-ring"), "airbrake shock ring must exist");
    assert.ok(fx.rootGroup.getObjectByName("propulsion-velocity-streaks"), "dedicated stretched streaks must exist");
    assert.ok(fx.rootGroup.getObjectByName("nozzle-core-flare"), "nozzle core flares must exist");
    assert.ok(fx.rootGroup.getObjectByName("wingtip-ribbon-L"), "left wingtip ribbon must exist");
    assert.ok(fx.rootGroup.getObjectByName("wingtip-ribbon-R"), "right wingtip ribbon must exist");

    const ship = {
      x: 0, y: 800, z: 0, vx: 0, vy: 0, vz: -120, yaw: 0, bank: 0.35, pitch: 0.1,
      repaired: true, progress: 1, cargo: { ore: 0, scrap: 0, cell: 0, circuit: 0, core: 0, medgel: 0 },
      seats: ["p", "", "", ""], grounded: false, thrust: 2, flightTime: 5, arrived: false,
    };
    fx.update(0.05, ship, null, false, true);
    assert.equal(fx.rootGroup.getObjectByName("cryo-retro-brake-plume")!.visible, true);
    assert.equal(fx.rootGroup.getObjectByName("airbrake-shock-ring")!.visible, true);
    fx.dispose();
  }
});

test("all 8 high-fidelity 44.1kHz stereo propulsion audio WAV files exist and have valid headers", async () => {
  const files = [
    "engine-idle-loop.wav",
    "engine-cruise-loop.wav",
    "engine-afterburner-loop.wav",
    "afterburner-ignite.wav",
    "retro-brake-ignite.wav",
    "retro-brake-loop.wav",
    "retro-brake-release.wav",
    "ship-impact.wav",
  ];
  for (const name of files) {
    const buf = await readFile(
      new URL(`../../frontend/space-escape/public/assets/audio/${name}`, import.meta.url),
    );
    assert.equal(buf.toString("ascii", 0, 4), "RIFF", `${name}: RIFF header`);
    assert.equal(buf.toString("ascii", 8, 12), "WAVE", `${name}: WAVE format`);
    assert.equal(buf.readUInt16LE(22), 2, `${name}: stereo 2 channels`);
    assert.equal(buf.readUInt32LE(24), 44100, `${name}: 44.1kHz sample rate`);
    assert.ok(buf.length > 32000, `${name}: non-trivial audio payload`);
  }
});

test("spaceship corridor is permanently removed from InterplanetarySystem and runtime", () => {
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  assert.equal("corridorGroup" in system, false, "corridorGroup must be removed");
  assert.equal("inCorridor" in system, false, "inCorridor must be removed");
  assert.equal("toggleCorridor" in system, false, "toggleCorridor must be removed");
});

test("planets, landmarks, warp gates, and speed streaks use high-poly geometry and detailed textures", () => {
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  for (const id of ["venus", "mars", "jupiter", "saturn"]) {
    const entry = system.planets.get(id)!;
    const sphereGeo = entry.surfaceMesh.geometry as THREE.SphereGeometry;
    assert.ok(sphereGeo.parameters.widthSegments >= 128, `${id} widthSegments >= 128`);
    assert.ok(sphereGeo.parameters.heightSegments >= 96, `${id} heightSegments >= 96`);
    const mat = entry.surfaceMesh.material as THREE.MeshStandardMaterial;
    const map = mat.map as THREE.DataTexture;
    assert.ok(map.image.width >= 1024 && map.image.height >= 512, `${id} map must be >= 1024x512`);
    assert.ok(mat.bumpMap, `${id} must have a bump map`);
  }

  // Mars Olympus Mons landmark physically protrudes as 3D displaced relief
  const mars = system.planets.get("mars")!;
  const olympus = mars.group.getObjectByName("landmark-olympus-mons") as THREE.Mesh;
  assert.ok(olympus);
  const posAttr = olympus.geometry.getAttribute("position");
  let maxRadius = 0;
  for (let i = 0; i < posAttr.count; i++) {
    maxRadius = Math.max(maxRadius, Math.hypot(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
  }
  assert.ok(maxRadius > SOLAR_SYSTEM.mars.radius + 5, `Olympus Mons must have 3D relief above crust; maxR=${maxRadius}`);

  // Warp gate megastructure has high-poly inner accelerator, outer ring, and orbiting particles
  const gate = system.planets.get("warpgate")!;
  assert.ok(gate.group.getObjectByName("inner-accelerator-ring"));
  assert.ok(gate.group.getObjectByName("outer-containment-ring"));
  assert.ok(gate.portalParticles);

  // StardustParallaxStream includes velocity-stretched warp streaks
  const stream = new StardustParallaxStream();
  const streaks = stream.group.getObjectByName("velocity-warp-streaks") as THREE.LineSegments;
  assert.ok(streaks instanceof THREE.LineSegments);
  stream.update(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(0, 0, -800), 2.5, true, 1 / 60);
  assert.ok((streaks.material as THREE.LineBasicMaterial).opacity > 0.3);
});

test("solid world objects block player traversal while keeping interactables readable and toggleable", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  const p = sim.add("walker");
  sim.start(p.id);
  sim.physics.syncDynamicEntities(sim.s.adventure, sim.s.time);

  const walkToward = (target: { x: number; y?: number; z: number }, startOffsetZ = 6, ticks = 45) => {
    const startZ = target.z + startOffsetZ;
    let minDist = Infinity;
    Object.assign(p, {
      x: target.x,
      y: groundAt(target.x, startZ) + 0.85,
      z: startZ,
      vx: 0,
      vy: 0,
      vz: 0,
      grounded: true,
    });
    sim.physics.reset(p.id, p);
    for (let i = 0; i < ticks; i++) {
      sim.physics.move(p, { ...idleInput(i + 1), forward: 1, yaw: 0 });
      sim.physics.step();
      minDist = Math.min(minDist, Math.hypot(p.x - target.x, p.z - target.z));
    }
    return { finalZ: p.z, minDist };
  };

  // 1. Parked light fighter blocks player from walking through its fuselage
  const fighterWalk = walkToward(FIGHTER_POS, 7.5, 40);
  assert.ok(fighterWalk.finalZ > FIGHTER_POS.z + 2.5, `player walked through parked fighter (z=${fighterWalk.finalZ})`);

  // 2. Parked intergalactic cruiser blocks player
  const cruiserWalk = walkToward(INTERGALACTIC_POS, 9.5, 40);
  assert.ok(cruiserWalk.finalZ > INTERGALACTIC_POS.z + 3.0, `player walked through parked cruiser (z=${cruiserWalk.finalZ})`);

  // 3. Giant scenic obelisk blocks player from entering its interior (sliding around rotated faces is valid)
  const obelisk = SCENIC_SITES[0];
  const obeliskWalk = walkToward(obelisk, 8, 45);
  assert.ok(obeliskWalk.minDist >= 2.2, `player clipped inside scenic obelisk (minDist=${obeliskWalk.minDist})`);

  // 4. Echo Grove tree trunk blocks player from entering its solid cylinder
  const tree = GROVE_TREES[0];
  const treeWalk = walkToward(tree, 5, 35);
  assert.ok(
    treeWalk.minDist >= 0.72 * tree.scale + 0.25,
    `player clipped inside solid tree trunk (minDist=${treeWalk.minDist})`,
  );

  // 5. Outpost perimeter pillar blocks player from entering its solid footprint
  const post = OUTPOST_POSTS[0];
  const postWalk = walkToward(post, 5, 35);
  assert.ok(postWalk.minDist >= 0.7, `player clipped inside outpost pylon (minDist=${postWalk.minDist})`);

  // 6. Lore monolith blocks movement while remaining visible for reading
  const lore = LORE[0];
  const loreWalk = walkToward(lore, 5, 35);
  assert.ok(loreWalk.minDist >= 0.65, `player clipped inside lore monolith (minDist=${loreWalk.minDist})`);
  assert.equal(
    sim.physics.visible({ x: lore.x, y: lore.y + 1.6, z: lore.z + 5 }, { x: lore.x, y: lore.y + 1.5, z: lore.z }),
    true,
    "lore collider must not block line-of-sight reading",
  );

  // 7. Resource node blocks movement when active, and becomes passable when depleted
  const node = RESOURCE_SITES[1];
  const activeWalk = walkToward(node, 5, 35);
  assert.ok(activeWalk.minDist >= 1.1, `active resource node must block player (minDist=${activeWalk.minDist})`);
  sim.s.adventure.nodes[1].readyAt = sim.s.time + 90;
  sim.physics.syncDynamicEntities(sim.s.adventure, sim.s.time);
  const clearedWalk = walkToward(node, 5, 45);
  assert.ok(clearedWalk.finalZ < node.z - 4, `harvested resource node must disable collider (z=${clearedWalk.finalZ})`);
});

test("ship ShapeCast blocks obelisks, warp gate outer frame, and converged home planet sphere while sliding on walls", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());

  // 1. Scenic obelisk stops ship hull sweep
  const obelisk = SCENIC_SITES[0];
  const obeliskHit = sim.physics.shipMotion(
    { x: obelisk.x, y: obelisk.y + 6, z: obelisk.z + 25 },
    { x: 0, y: 0, z: -40 },
    { kind: "light_fighter", yaw: 0 },
  );
  assert.equal(obeliskHit.collided, true, "ship must collide with giant obelisk");
  assert.ok(obeliskHit.z > obelisk.z + 1.5, "ship must stop outside obelisk");

  // 2. All 4 warp gate structural outer rings (centers + junctions) block hull sweeps while portal centers stay open
  for (const gateId of ["warpgate", "warpgate_east", "warpgate_south", "warpgate_west"] as const) {
    const gate = SOLAR_SYSTEM[gateId];
    const rotY =
      gateId === "warpgate_south"
        ? Math.PI
        : gateId === "warpgate_east"
          ? -Math.PI / 2
          : gateId === "warpgate_west"
            ? Math.PI / 2
            : 0;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    // Gate plane normal along local +Z rotated by rotY
    const nx = sinY;
    const nz = cosY;
    const ringR = gate.radius * 0.945;

    for (const angle of [Math.PI / 8, Math.PI / 4]) {
      const lx = Math.cos(angle) * ringR;
      const ly = Math.sin(angle) * ringR;
      const fx = gate.position.x + lx * cosY;
      const fy = gate.position.y + ly;
      const fz = gate.position.z - lx * sinY;
      const hit = sim.physics.shipMotion(
        { x: fx + nx * 90, y: fy, z: fz + nz * 90 },
        { x: -nx * 180, y: 0, z: -nz * 180 },
        { kind: "light_fighter", yaw: rotY },
      );
      assert.equal(hit.collided, true, `${gateId} angle=${angle.toFixed(2)} must block ship hull`);
    }

    const centerPass = sim.physics.shipMotion(
      { x: gate.position.x + nx * 90, y: gate.position.y, z: gate.position.z + nz * 90 },
      { x: -nx * 180, y: 0, z: -nz * 180 },
      { kind: "light_fighter", yaw: rotY },
    );
    assert.equal(centerPass.collided, false, `${gateId} center portal aperture must stay open`);
  }

  // 3. Glancing impact along Dawn Lab wall slides tangentially instead of dead-stopping
  const glance = sim.physics.shipMotion(
    { x: LAB.x + 15, y: LAB.y + 2, z: LAB.z + 8 },
    { x: -12, y: 0, z: -16 },
    { kind: "light_fighter", yaw: 0 },
  );
  assert.equal(glance.collided, true);
  assert.ok(glance.x > LAB.x + 10, "ship must remain outside lab wall");
  assert.ok(glance.z < LAB.z + 2, "ship must slide forward along wall tangent");

  // 4. Deep-space dive into converged home planet underside resolves onto planetary sphere
  const p = sim.add("pilot");
  sim.start(p.id);
  p.seat = 0;
  const ship = sim.s.adventure.ship;
  Object.assign(ship, {
    kind: "light_fighter",
    repaired: true,
    grounded: false,
    seats: [p.id, "", "", ""],
    x: HOME_PLANET_SPHERE.center.x + HOME_PLANET_SPHERE.radius + 15,
    y: HOME_PLANET_SPHERE.center.y,
    z: HOME_PLANET_SPHERE.center.z,
    vx: -120,
    vy: 0,
    vz: 0,
  });
  for (let i = 0; i < 15; i++) {
    tickShip(sim, new Map([[p.id, idleInput(i + 1)]]));
  }
  const distToHomeCenter = Math.hypot(
    ship.x - HOME_PLANET_SPHERE.center.x,
    ship.y - HOME_PLANET_SPHERE.center.y,
    ship.z - HOME_PLANET_SPHERE.center.z,
  );
  assert.ok(
    distToHomeCenter >= HOME_PLANET_SPHERE.radius + 1.5,
    `ship must stay outside converged home planet sphere (dist=${distToHomeCenter})`,
  );
});

test("mission route remains authored and a single indexed cap seals the square into the globe", () => {
  const mesh = terrainMesh();
  const verts = mesh.vertices;
  const gridCount = (SEGMENTS + 1) ** 2;
  assert.ok(verts.length / 3 > gridCount, "the outer shelf must belong to the same collision mesh");
  for (const [x, z] of [[0, 355], [12, 192], [-40, 160], [180, -90], [-110, -370]]) {
    assert.ok(Math.abs(groundAt(x, z) - terrainRaw(x, z)) < 3,
      `authored landmark height moved at (${x}, ${z})`);
  }
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2];
    const sphereY = homeSphereHeight(x, z);
    if (sphereY !== null) {
      assert.ok(y >= sphereY - 0.02,
        `globe protrudes through shared terrain at (${x}, ${z})`);
    }
  }
  for (let j = 0; j <= SEGMENTS; j++) {
    for (const [ix, iz] of [[0, j], [SEGMENTS, j], [j, 0], [j, SEGMENTS]]) {
      const v = (iz * (SEGMENTS + 1) + ix) * 3;
      const sphereY = homeSphereHeight(verts[v], verts[v + 2]);
      assert.ok(sphereY !== null && Math.abs(verts[v + 1] - sphereY) < 0.02,
        "the square's boundary must meet the spherical shelf without a height step");
    }
  }
  const perimeter = SEGMENTS * 4;
  for (let i = 0; i < perimeter; i += 67) {
    const v = (verts.length / 3 - perimeter + i) * 3;
    assert.ok(Math.abs(Math.hypot(verts[v], verts[v + 2]) - HOME_COLLAR_RADIUS) < 0.02);
    const sphereY = homeSphereHeight(verts[v], verts[v + 2]);
    assert.ok(sphereY !== null && Math.abs(verts[v + 1] - sphereY) < 0.02,
      "the circular collar must end flush against the globe");
  }
});

test("ship touchdown, Rapier surface query, and visible terrain agree outside the old square", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  for (const [x, z] of [[0, 355], [HALF - 5, 0], [HALF + 250, 0], [2100, 700]]) {
    const y = sim.physics.homeSurfaceHeight(x, z);
    assert.ok(y !== null && Number.isFinite(y), `missing collision floor at (${x}, ${z})`);
    assert.ok(Math.abs(y! - groundAt(x, z)) < 1.5,
      `Rapier and the gameplay ground lookup must agree even beyond the old square at (${x}, ${z})`);
  }
  const p = sim.add("pilot");
  sim.start(p.id);
  p.seat = 0;
  const ship = sim.s.adventure.ship;
  const x = HALF + 250, z = 0;
  const y = sim.physics.homeSurfaceHeight(x, z)!;
  Object.assign(ship, {
    kind: "light_fighter", repaired: true, grounded: false,
    seats: [p.id, "", "", ""], x, y: y + 20, z,
    vx: 0, vy: -35, vz: 0, pitch: 0, bank: 0,
  });
  for (let frame = 0; frame < 240; frame++) {
    tickShip(sim, new Map([[p.id, { ...idleInput(frame + 1), brake: true }]]));
    assert.ok(ship.y >= y - 0.1, "the ship must not pass through the outer shelf");
    if (ship.grounded) break;
  }
  assert.ok(ship.grounded, "the formerly visual-only perimeter must now accept a ship landing");
  assert.ok(Math.abs(ship.y - (y + 0.2)) < 1, "landing height must agree with the Rapier triangle surface");
});

test("intergalactic Mercury disembark places player outside hull collider and prediction syncs dynamic colliders", (t) => {
  const sim = new Simulation(2026);
  const prediction = new MovementWorld();
  t.after(() => {
    sim.dispose();
    prediction.dispose();
  });
  const p = sim.add("pilot");
  sim.start(p.id);
  prediction.add(p.id, p);
  p.seat = 0;
  const ship = sim.s.adventure.ship;
  const merc = SOLAR_SYSTEM.mercury;
  Object.assign(ship, {
    kind: "intergalactic",
    repaired: true,
    grounded: true,
    seats: [p.id, "", "", ""],
    x: merc.position.x,
    y: merc.position.y + merc.radius + 0.2,
    z: merc.position.z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    bank: 0,
    pitch: 0,
  });
  sim.physics.syncDynamicEntities(sim.s.adventure, sim.s.time);
  interactAdventure(sim, p, idleInput(1));
  interactAdventure(sim, p, { ...idleInput(2), interact: true });
  assert.equal(p.seat, -1);
  assert.equal(p.planet, "mercury");
  const distFromShip = Math.hypot(p.x - ship.x, p.y - ship.y, p.z - ship.z);
  assert.ok(
    distFromShip > SHIP_COLLIDER_SPECS.intergalactic.halfWidth + 1.5,
    `disembarked player must clear cruiser hull (dist=${distFromShip})`,
  );

  // Client prediction syncDynamicEntities disables harvested resource colliders immediately
  sim.s.adventure.nodes[1].readyAt = sim.s.time + 90;
  prediction.syncDynamicEntities(sim.s.adventure, sim.s.time);
  assert.equal(prediction.resourceColliders.get(1)!.isEnabled(), false);
});
