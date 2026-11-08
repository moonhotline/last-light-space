import test from "node:test";
import assert from "node:assert/strict";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { tickShip } from "../../frontend/space-escape/shared/adventure";
import { groundAt } from "../../frontend/space-escape/shared/map";
import { LAB } from "../../frontend/space-escape/shared/adventure-data";
import { DT, idleInput } from "../../frontend/space-escape/shared/types";

await initPhysics();

for (const kind of ["light_fighter", "intergalactic"] as const) {
  test(`${kind}: X descends promptly, brakes forward thrust and settles safely on the basin floor`, (t) => {
    const sim = new Simulation(42);
    t.after(() => sim.dispose());
    const pilot = sim.add("pilot");
    sim.start(pilot.id);
    pilot.seat = 0;
    const ship = sim.s.adventure.ship;
    Object.assign(ship, { kind, x: 0, y: 500, z: 355, vx: 0, vy: 0, vz: -60,
      repaired: true, grounded: false, seats: [pilot.id, "", "", ""] });
    const inputs = new Map([[pilot.id, { ...idleInput(), brake: true, sprint: true }]]);
    for (let frame = 0; frame < 3 / DT; frame++) tickShip(sim, inputs);
    assert.ok(ship.vy <= -35 && ship.vy >= -60, `surface descent must reach 35–60 m/s; got ${ship.vy}`);
    assert.ok(Math.hypot(ship.vx, ship.vz) < 1, "X must retain horizontal braking priority over boost");
    for (let frame = 0; frame < 12 / DT; frame++) {
      tickShip(sim, inputs);
      assert.ok(ship.y >= groundAt(ship.x, ship.z), "fast descent must never cross the floor");
    }
    assert.equal(ship.grounded, true);
    assert.equal(ship.vy, 0);
  });
}

test("X supplies stronger deep-space descent and releases back to a gentle drift", (t) => {
  const sim = new Simulation(42);
  t.after(() => sim.dispose());
  const pilot = sim.add("pilot");
  sim.start(pilot.id);
  pilot.seat = 0;
  const ship = sim.s.adventure.ship;
  Object.assign(ship, { x: 0, y: 2000, z: 355, vx: 0, vy: 0, vz: 0,
    repaired: true, grounded: false, seats: [pilot.id, "", "", ""] });
  const inputs = new Map([[pilot.id, { ...idleInput(), brake: true }]]);
  for (let frame = 0; frame < 3 / DT; frame++) tickShip(sim, inputs);
  assert.ok(ship.vy < -100 && ship.vy >= -160, `deep-space descent must be stronger; got ${ship.vy}`);
  inputs.set(pilot.id, idleInput());
  for (let frame = 0; frame < 3 / DT; frame++) tickShip(sim, inputs);
  assert.ok(ship.vy > -3, "releasing X must stop powered descent");
});

test("low flight over basin slopes preserves forward momentum while the floor resolves contact", (t) => {
  const sim = new Simulation(42);
  t.after(() => sim.dispose());
  const pilot = sim.add("pilot");
  sim.start(pilot.id);
  const ship = sim.s.adventure.ship;
  pilot.seat = 0;
  const inputs = new Map([[pilot.id, { ...idleInput(), forward: 1 }]]);
  for (const x of [-80, -76]) {
    Object.assign(ship, { x, y: groundAt(x, 292), z: 292, yaw: 0,
      vx: 0, vy: 0, vz: -24, grounded: true, repaired: true, seats: [pilot.id, "", "", ""] });
    for (let frame = 0; frame < 25; frame++) {
      const speed = Math.hypot(ship.vx, ship.vz);
      const z = ship.z;
      tickShip(sim, inputs);
      assert.ok(Math.hypot(ship.vx, ship.vz) >= speed, `x=${x}, frame=${frame}: slope must not brake forward flight`);
      assert.ok(ship.z < z, "the ship must keep advancing");
      assert.ok(ship.y >= groundAt(ship.x, ship.z), "floor still prevents underground flight");
    }
  }
});

test("descending flight over a slope is not treated as a frontal collision", (t) => {
  const sim = new Simulation(42);
  t.after(() => sim.dispose());
  for (const [x, z] of [[-80, 292], [-64, 264], [-60, 264]]) {
    const from = { x, y: groundAt(x, z), z };
    const next = sim.physics.shipMotion(from, { x: 0, y: -0.004, z: -0.8 });
    assert.ok(Math.abs(next.z - (from.z - 0.8)) < 1e-6,
      "rays exiting the underside of a slope must leave contact resolution to the floor");
  }
});

test("raised hull rays still stop fast flight against laboratory walls", (t) => {
  const sim = new Simulation(42);
  t.after(() => sim.dispose());
  const from = { x: LAB.x + 16, y: LAB.y + 1, z: LAB.z };
  const next = sim.physics.shipMotion(from, { x: -30, y: 0, z: 0 });
  assert.ok(next.x > LAB.x + 10);
  assert.ok(next.x <= from.x);
});

test("steep basin mountains still block a head-on hull sweep", (t) => {
  const sim = new Simulation(42);
  t.after(() => sim.dispose());
  // A 63-degree face in the shipped terrain mesh, approached horizontally.
  const from = { x: -1017.429, y: 54.3904, z: -1767.542 };
  const delta = { x: -39.4912, y: 0, z: 6.35964 };
  const next = sim.physics.shipMotion(from, delta);
  assert.equal(next.frontalCollision, true);
  assert.ok(Math.hypot(next.x - from.x, next.z - from.z) < 20, "the ship must stop before the mountain face");
});
