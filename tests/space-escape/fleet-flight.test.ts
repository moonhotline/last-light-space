import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SPAWN_FLEET } from "../../frontend/space-escape/shared/adventure-data";
import {
  createAdventure, interactAdventure, shipBoardingDistance, shipBoardingTarget, tickShip,
} from "../../frontend/space-escape/shared/adventure";
import { SOLAR_SYSTEM, type SpaceshipKind } from "../../frontend/space-escape/shared/celestial";
import { groundAt } from "../../frontend/space-escape/shared/map";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { DT, idleInput, type Input } from "../../frontend/space-escape/shared/types";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";

await initPhysics();

function setup(t: TestContext, kind: SpaceshipKind = "light_fighter") {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  const p = sim.add("pilot");
  sim.start(p.id);
  const ship = sim.s.adventure.ship;
  const spawn = SPAWN_FLEET[kind];
  Object.assign(p, spawn.position, { y: spawn.position.y + 0.85 });
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  const fly = (patch: Partial<Input>, ticks: number) => {
    const inputs = new Map([[p.id, { ...idleInput(), yaw: ship.yaw, ...patch }]]);
    for (let n = 0; n < ticks; n++) tickShip(sim, inputs);
  };
  return { sim, p, ship, fly };
}

for (const spawn of Object.values(SPAWN_FLEET)) {
  test(`${spawn.kind}: board the matching hull, ignite, launch, and preserve kind in snapshots`, (t) => {
    const { sim, p, ship, fly } = setup(t, spawn.kind);
    assert.equal(p.seat, 0);
    assert.equal(ship.kind, spawn.kind);
    assert.equal(ship.repaired, true);
    assert.equal(ship.progress, 1);
    assert.equal(ship.x, spawn.position.x);
    assert.equal(ship.y, spawn.position.y);
    assert.equal(ship.z, spawn.position.z);
    assert.equal(sim.snapshot().adventure.ship.kind, spawn.kind);
    fly({ jump: true }, 30);
    assert.equal(ship.grounded, false);
    assert.ok(ship.y > spawn.position.y + 10);
  });

  test(`${spawn.kind}: boarding respects its configured radius`, () => {
    const ship = createAdventure().ship;
    const p = { ...spawn.position, y: spawn.position.y + 1, z: spawn.position.z + spawn.boardingRadius - 0.1 };
    assert.equal(shipBoardingTarget(p, ship)?.kind, spawn.kind);
    assert.ok(shipBoardingDistance(p, ship) < spawn.boardingRadius);
    p.z += 0.2;
    assert.equal(shipBoardingTarget(p, ship), null);
  });

  test(`${spawn.kind}: deep-space afterburners exceed 200 m/s and brake input still stops the ship`, (t) => {
    const { ship, fly } = setup(t, spawn.kind);
    Object.assign(ship, { x: 0, y: 1000, z: 0, grounded: false });
    fly({ forward: 1, sprint: true }, 240);
    const boosted = Math.hypot(ship.vx, ship.vz);
    assert.ok(boosted > 200, `boosted speed was ${boosted}`);
    assert.ok(boosted <= (spawn.kind === "intergalactic" ? 400 : 360) + 1e-6);
    if (spawn.kind === "intergalactic") assert.ok(boosted > 399);
    const height = ship.y;
    fly({ brake: true, sprint: true }, 60);
    assert.ok(Math.hypot(ship.vx, ship.vz) < 1, "X overrides boost and brakes");
    assert.ok(ship.y < height, "X also descends");
  });
}

test("advanced ships board directly even while carrying fighter repair materials", (t) => {
  const { sim, p, ship } = setup(t);
  ship.seats[0] = "";
  ship.repaired = false;
  p.seat = -1;
  p.inventory.ore = 4;
  p.interactHeld = false;
  Object.assign(p, SPAWN_FLEET.intergalactic.position);
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(ship.kind, "intergalactic");
  assert.equal(p.seat, 0);
  assert.equal(p.inventory.ore, 4);
});

test("another player cannot replace an occupied ship, but can join its crew", (t) => {
  const { sim, ship } = setup(t, "light_fighter");
  const guest = sim.add("guest");
  Object.assign(guest, SPAWN_FLEET.intergalactic.position);
  assert.equal(shipBoardingTarget(guest, ship), null);
  interactAdventure(sim, guest, { ...idleInput(), interact: true });
  assert.equal(guest.seat, -1);
  assert.equal(ship.kind, "light_fighter");
  Object.assign(guest, { x: ship.x + 3, y: ship.y + 1, z: ship.z });
  interactAdventure(sim, guest, idleInput());
  interactAdventure(sim, guest, { ...idleInput(), interact: true });
  assert.equal(guest.seat, 1);
  assert.deepEqual(ship.seats.slice(0, 2), ["pilot", "guest"]);
});

test("an empty landed fighter is reboarded where it landed, without creating a duplicate on its old pad", (t) => {
  const { sim, p, ship } = setup(t, "light_fighter");
  Object.assign(ship, { x: 100, y: groundAt(100, 300), z: 300 });
  ship.seats[0] = "";
  p.seat = -1;
  p.interactHeld = false;
  assert.equal(shipBoardingTarget(SPAWN_FLEET.light_fighter.position, ship), null);
  Object.assign(p, { x: ship.x, y: ship.y + 1, z: ship.z });
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, 0);
  assert.equal(ship.kind, "light_fighter");
  assert.equal(ship.x, 100);
  assert.equal(ship.z, 300);
});

test("intergalactic Mercury disembarking and reboarding retains the selected hull", (t) => {
  const { sim, p, ship } = setup(t, "intergalactic");
  const merc = SOLAR_SYSTEM.mercury;
  Object.assign(ship, { ...merc.position, y: merc.position.y + merc.radius + 0.2 });
  interactAdventure(sim, p, idleInput());
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, -1);
  assert.equal(p.planet, "mercury");
  assert.equal(shipBoardingTarget(p, ship)?.kind, "intergalactic");
  interactAdventure(sim, p, idleInput());
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, 0);
  assert.equal(ship.kind, "intergalactic");
  assert.equal(ship.x, merc.position.x);
  assert.equal(ship.z, merc.position.z);
});

test("fighter responds faster and banks farther than the stable cruiser, then levels out", (t) => {
  const fighter = setup(t, "light_fighter");
  const cruiser = setup(t, "intergalactic");
  for (const flight of [fighter, cruiser]) {
    Object.assign(flight.ship, { x: 0, y: 1000, z: 0, yaw: 0, grounded: false });
    flight.fly({ forward: 1, yaw: 2.5 }, 30);
  }
  assert.ok(fighter.ship.yaw > cruiser.ship.yaw * 2);
  assert.ok(fighter.ship.yaw <= 1.8 + 1e-6, "fighter turn rate is limited to 1.8 rad/s");
  assert.ok(Math.abs(fighter.ship.bank) > 0.48);
  assert.ok(Math.abs(fighter.ship.bank) <= 0.52);
  assert.ok(Math.abs(cruiser.ship.bank) <= 0.4);
  assert.ok(Math.hypot(fighter.ship.vx, fighter.ship.vz) > Math.hypot(cruiser.ship.vx, cruiser.ship.vz) * 1.5);
  fighter.fly({ yaw: fighter.ship.yaw }, 60);
  assert.ok(Math.abs(fighter.ship.bank) < 0.01, "roll settles when yaw stops");
  assert.ok(Math.abs(fighter.ship.yawVelocity ?? 0) < 0.01);
});

test("turns take the short path across the yaw wrap and can bank in both directions", (t) => {
  const { ship, fly } = setup(t, "light_fighter");
  Object.assign(ship, { x: 0, y: 1000, z: 0, yaw: Math.PI - 0.05, grounded: false });
  fly({ yaw: -Math.PI + 0.05 }, 1);
  assert.ok(ship.yaw > Math.PI - 0.05);
  assert.ok(ship.yaw - (Math.PI - 0.05) <= 1.8 * DT);
  fly({ yaw: ship.yaw - 2 }, 30);
  assert.ok(ship.bank > 0.45);
});

test("cruiser preserves coasting momentum and releasing boost does not snap speed", (t) => {
  const cruiser = setup(t, "intergalactic");
  const fighter = setup(t, "light_fighter");
  for (const flight of [cruiser, fighter]) {
    Object.assign(flight.ship, { x: 0, y: 1000, z: 0, vx: 100, grounded: false });
    flight.fly({}, 60);
  }
  assert.ok(cruiser.ship.vx > 80);
  assert.ok(fighter.ship.vx < 65);
  Object.assign(cruiser.ship, { vx: 0, vz: -260 });
  cruiser.fly({}, 1);
  assert.ok(Math.abs(cruiser.ship.vz) > 255);
});

test("Shift alone accelerates forward and never suppresses climb thrust", (t) => {
  const normal = setup(t);
  const boost = setup(t);
  for (const flight of [normal, boost]) {
    Object.assign(flight.ship, { x: 0, y: 1000, z: 0, yaw: 0, grounded: false });
  }
  normal.fly({ forward: 1, jump: true }, 30);
  boost.fly({ sprint: true, jump: true }, 30);
  assert.ok(-boost.ship.vz > -normal.ship.vz * 2);
  assert.ok(boost.ship.vy >= normal.ship.vy);
  assert.ok(boost.ship.thrust > normal.ship.thrust);
});

test("legacy snapshots without kind retain balanced fighter handling", (t) => {
  const current = setup(t);
  const legacy = setup(t);
  delete legacy.ship.kind;
  delete legacy.ship.yawVelocity;
  for (const flight of [current, legacy]) {
    Object.assign(flight.ship, { x: 0, y: 1000, z: 0, grounded: false });
    flight.fly({ forward: 1, sprint: true, yaw: 1 }, 30);
  }
  assert.equal(legacy.ship.vx, current.ship.vx);
  assert.equal(legacy.ship.vz, current.ship.vz);
  assert.equal(legacy.ship.bank, current.ship.bank);
});

test("snapshots move only the selected hull while all other hulls stay parked", () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  const system = new InterplanetarySystem(new THREE.Scene(), camera);
  const ship = createAdventure().ship;
  Object.assign(ship, { x: 100, y: 900, z: -100, yaw: 0.7, bank: -0.3, grounded: false });
  for (const kind of Object.keys(SPAWN_FLEET) as SpaceshipKind[]) {
    ship.kind = kind;
    system.setShipState(ship);
    system.switchShip(kind === "intergalactic" ? "light_fighter" : "intergalactic");
    assert.equal(system.activeShip, kind, "local model selection cannot override authoritative kind");
    camera.position.set(ship.x, ship.y + 10, ship.z + 30);
    camera.lookAt(ship.x, ship.y, ship.z);
    system.step(DT, ship);
    for (const [modelKind, model] of system.shipMeshes) {
      const expected = modelKind === kind ? ship : SPAWN_FLEET[modelKind].position;
      assert.equal(model.position.x, expected.x);
      assert.equal(model.position.z, expected.z);
      if (modelKind === kind) {
        assert.ok(model.position.y >= ship.y);
        assert.equal(model.visible, true);
        assert.ok(Math.abs(model.rotation.z + ship.bank) < 1e-6);
      }
    }
  }
  delete ship.kind;
  system.setShipState(ship);
  assert.equal(system.activeShip, "light_fighter");
});

test("downloaded hull hydration preserves the active ship's flight position", async () => {
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  const ship = createAdventure().ship;
  Object.assign(ship, { kind: "intergalactic", x: 120, y: 900, z: -80, grounded: false });
  system.setShipState(ship);
  const loader = {
    async loadAsync(url: string) {
      if (!url.includes("/fighter/") && !url.includes("/intergalactic/")) throw new Error("Unused fixture asset");
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 2, 15), new THREE.MeshStandardMaterial()));
      return { scene };
    },
  } as unknown as GLTFLoader;
  await system.loadAssets(loader);
  assert.equal(system.intergalacticModel?.position.x, ship.x);
  assert.equal(system.intergalacticModel?.position.z, ship.z);
  assert.ok(system.intergalacticModel!.position.y >= ship.y);
  assert.equal(system.shipMeshes.get("intergalactic"), system.intergalacticModel);
  assert.equal(system.intergalacticModel?.children[0], system.downloadedAssets.get("intergalactic"));
  assert.equal(system.fighterModel?.position.x, SPAWN_FLEET.light_fighter.position.x);
});
