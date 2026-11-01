import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initPhysics,
  MovementWorld,
  fuelCapacity,
} from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import {
  DT,
  idleInput,
  parseInput,
  type Input,
} from "../../frontend/space-escape/shared/types";
import {
  groundAt,
  SPAWN,
  THERMALS,
  distance,
  WORLD_SIZE,
} from "../../frontend/space-escape/shared/map";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
await initPhysics();

test("expanded basin keeps the authored world at five times the prior area", () => {
  assert.equal(WORLD_SIZE, 3580);
  assert.ok(Math.abs((WORLD_SIZE * WORLD_SIZE) / (1600 * 1600) - 5) < 0.02);
});

function setup() {
  const sim = new Simulation(42),
    p = sim.add("pilot");
  sim.start(p.id);
  return { sim, p };
}
function ticks(
  sim: Simulation,
  n: number,
  id = "pilot",
  patch: Partial<Input> = {},
) {
  for (let j = 0; j < n; j++) {
    const p = sim.player(id)!;
    sim.input(id, { ...idleInput(p.ack + 1), ...patch });
    sim.tick();
  }
}
function place(sim: Simulation, id: string, x: number, z: number, h = 0.85) {
  const p = sim.player(id)!;
  Object.assign(p, {
    x,
    z,
    y: groundAt(x, z) + h,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
  });
  sim.physics.reset(id, p);
}
test("untrusted movement is finite, clamped, and cannot inject gameplay state", () => {
  assert.equal(parseInput({ seq: 1, forward: NaN }), null);
  assert.equal(parseInput({ ...idleInput(), seq: -1 }), null);
  const i = parseInput({
    ...idleInput(1),
    forward: 99,
    side: -99,
    fuel: 999,
    level: 99,
  })!;
  assert.equal(i.forward, 1);
  assert.equal(i.side, -1);
  assert.ok(!("fuel" in i));
});
test("player stands on the same authored terrain used by rendering", () => {
  const { sim, p } = setup();
  ticks(sim, 40);
  assert.ok(Math.abs(p.y - groundAt(p.x, p.z) - 0.825) < 0.08);
  ticks(sim, 90, p.id, { forward: 1 });
  assert.ok(p.z < SPAWN.z - 35);
  assert.ok(p.y > groundAt(p.x, p.z) + 0.7);
  sim.dispose();
});
test("kepler traversal keeps the explorer on a continuous spherical surface", () => {
  const { sim, p } = setup();
  const planet = SOLAR_SYSTEM.kepler;
  Object.assign(p, {
    planet: "kepler",
    x: planet.position.x,
    y: planet.position.y + planet.radius + 0.85,
    z: planet.position.z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
  });
  sim.physics.reset(p.id, p);
  ticks(sim, 120, p.id, { forward: 1, yaw: 0 });
  const radius = Math.hypot(
    p.x - planet.position.x,
    p.y - planet.position.y,
    p.z - planet.position.z,
  );
  assert.ok(Math.abs(radius - planet.radius - 0.825) < 0.02);
  assert.ok(Math.hypot(p.x - planet.position.x, p.z - planet.position.z) > 1);
  sim.dispose();
});
test("low-gravity jump rises, lands, and reports impact exactly once", () => {
  const { sim, p } = setup();
  ticks(sim, 5);
  const start = p.y;
  ticks(sim, 1, p.id, { jump: true });
  ticks(sim, 20);
  assert.ok(p.y > start + 5);
  ticks(sim, 150);
  assert.equal(p.grounded, true);
  assert.ok(p.landing > 5);
  const id = p.landingId;
  ticks(sim, 20);
  assert.equal(p.landingId, id);
  sim.dispose();
});
test("jetpack consumes finite fuel, runs out, and recharges on the ground", () => {
  const { sim, p } = setup();
  ticks(sim, 60, p.id, { jet: true });
  assert.ok(p.y > SPAWN.y + 15);
  assert.ok(p.fuel < 62);
  ticks(sim, 200, p.id, { jet: true });
  assert.ok(p.fuel < 1);
  ticks(sim, 300);
  assert.equal(p.grounded, true);
  assert.equal(Math.round(p.fuel), 100);
  sim.dispose();
});
test("dash costs energy and cannot retrigger while held", () => {
  const { sim, p } = setup();
  ticks(sim, 1, p.id, { dash: true, forward: 1 });
  assert.ok(p.dashTime > 0);
  assert.ok(p.fuel < 90);
  ticks(sim, 60, p.id, { dash: true, forward: 1 });
  assert.equal(p.dashTime, 0);
  ticks(sim, 1);
  ticks(sim, 1, p.id, { dash: true });
  assert.ok(p.dashTime > 0);
  sim.dispose();
});
test("crystals refill flight fuel and synchronize combo with a respawn timer", () => {
  const { sim, p } = setup();
  const c = sim.s.crystals[0];
  place(sim, p.id, c.x, c.z, c.y - groundAt(c.x, c.z));
  p.fuel = 20;
  ticks(sim, 1);
  assert.equal(p.crystals, 1);
  assert.equal(p.combo, 1);
  assert.ok(p.fuel >= 54);
  assert.ok(c.readyAt > sim.s.time + 30);
  ticks(sim, 30);
  assert.equal(p.crystals, 1);
  sim.dispose();
});
test("beacon requires proximity, prior discovery, and held interaction", () => {
  const { sim, p } = setup();
  const b = sim.s.beacons[1];
  place(sim, p.id, b.x, b.z);
  ticks(sim, 95, p.id, { interact: true });
  assert.equal(b.active, false);
  ticks(sim, 95, p.id, { interact: true });
  assert.equal(sim.s.beacons[0].active, false);
  const first = sim.s.beacons[0];
  place(sim, p.id, first.x, first.z);
  ticks(sim, 95, p.id, { interact: true });
  assert.equal(first.active, true);
  assert.equal(p.level, 1);
  assert.equal(fuelCapacity(p.level), 150);
  assert.equal(p.checkpoint, 1);
  sim.dispose();
});
test("two explorers charge a shared beacon faster and receive the same upgrade", () => {
  const sim = new Simulation(),
    p = sim.add("pilot"),
    g = sim.add("guest");
  sim.start(p.id);
  const b = sim.s.beacons[0];
  for (const id of [p.id, g.id]) place(sim, id, b.x, b.z + 2);
  for (let j = 0; j < 48; j++) {
    for (const id of [p.id, g.id])
      sim.input(id, { ...idleInput(j + 1), interact: true });
    sim.tick();
  }
  assert.equal(b.active, true);
  assert.equal(p.level, 1);
  assert.equal(g.level, 1);
  sim.dispose();
});
test("three optional beacons unlock upgrades without ending the ship expedition", () => {
  const { sim, p } = setup();
  for (const b of sim.s.beacons) {
    place(sim, p.id, b.x, b.z + 2);
    ticks(sim, 95, p.id, { interact: true });
  }
  assert.equal(sim.s.phase, "active");
  assert.ok(sim.s.completedAt > 0);
  const before = p.z;
  ticks(sim, 30, p.id, { forward: 1 });
  assert.ok(p.z < before - 8);
  assert.equal(p.level, 2);
  sim.dispose();
});
test("unlocked thermals lift an explorer and replenish fuel", () => {
  const { sim, p } = setup(),
    t = THERMALS[0];
  place(sim, p.id, t.x, t.z, 3);
  p.level = 2;
  p.fuel = 20;
  const y = p.y;
  ticks(sim, 30);
  assert.ok(p.y > y + 10);
  assert.ok(p.fuel > 30);
  sim.dispose();
});
test("camera obstruction ray stops before terrain or boulders", () => {
  const world = new MovementWorld(),
    a = { x: 0, y: groundAt(0, 350) + 5, z: 350 },
    b = { ...a, y: a.y - 12 };
  const d = world.cameraDistance(a, b);
  assert.ok(d < 6 && d > 3);
  world.dispose();
});
test("normal packet bursts are queued; sequence replay and floods cannot accelerate the player", () => {
  const a = setup(),
    b = setup();
  for (let j = 1; j <= 15; j++)
    a.sim.input(a.p.id, { ...idleInput(j), forward: 1 });
  for (let j = 1; j <= 15; j++) {
    a.sim.tick();
    b.sim.input(b.p.id, { ...idleInput(j), forward: 1 });
    b.sim.tick();
  }
  assert.equal(a.p.ack, 15);
  assert.ok(distance(a.p, b.p) < 0.001);
  a.sim.input(a.p.id, { ...idleInput(15), forward: 1 });
  assert.equal(a.sim.queues.get(a.p.id)!.length, 0);
  for (let j = 16; j < 200; j++)
    a.sim.input(a.p.id, { ...idleInput(j), forward: 1 });
  assert.equal(a.sim.queues.get(a.p.id)!.length, 60);
  a.sim.tick();
  assert.equal(a.p.ack, 16);
  a.sim.dispose();
  b.sim.dispose();
});
test("route marker positions are server generated and limited to one per player", () => {
  const { sim, p } = setup();
  sim.action(p.id, "mark");
  assert.equal(sim.s.markers.length, 1);
  const m = sim.s.markers[0];
  assert.ok(Math.abs(distance(p, m) - 65) < 0.001);
  sim.action(p.id, { x: 999999 });
  sim.action(p.id, "mark");
  assert.equal(sim.s.markers.length, 1);
  ticks(sim, 902);
  assert.equal(sim.s.markers.length, 0);
  sim.dispose();
});
test("recall returns to the latest shared checkpoint with restored fuel", () => {
  const { sim, p } = setup();
  const b = sim.s.beacons[0];
  place(sim, p.id, b.x, b.z);
  ticks(sim, 95, p.id, { interact: true });
  place(sim, p.id, 300, 300);
  p.fuel = 2;
  sim.action(p.id, "respawn");
  assert.equal(p.checkpoint, 1);
  assert.ok(distance(p, b) < 10);
  assert.equal(p.fuel, 150);
  assert.equal(p.respawns, 1);
  sim.dispose();
});
