import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Vector3 } from "three";
import { groundAt } from "../../frontend/space-escape/shared/map";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { LAB } from "../../frontend/space-escape/shared/adventure-data";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { idleInput, type Input, type Player } from "../../frontend/space-escape/shared/types";

await initPhysics();

function expedition(t: TestContext) {
  const sim = new Simulation(20);
  t.after(() => sim.dispose());
  const player = sim.add("host");
  assert.ok(sim.start(player.id));
  return { sim, player };
}

function put(sim: Simulation, p: Player, x: number, y: number, z: number, vy = 0) {
  Object.assign(p, { x, y, z, vx: 0, vy, vz: 0, grounded: vy === 0 });
  sim.physics.reset(p.id, p);
}

function tick(sim: Simulation, p: Player, options: Partial<Input> = {}) {
  sim.input(p.id, {
    ...idleInput(p.ack + 1), yaw: p.yaw, pitch: p.pitch, portalTransit: p.portalTransit ?? 0, ...options,
  });
  sim.tick();
}

test("place two wall portals, enter either end and retain outbound momentum", t => {
  const { sim, player } = expedition(t);
  const floor = LAB.y + 0.3;
  put(sim, player, LAB.x + 4, floor + 0.825, LAB.z);
  tick(sim, player, { placePortal: "blue", yaw: 0 });
  const blue = sim.s.portals?.blue;
  assert.ok(blue);
  assert.equal(blue.normal.z, 1);
  for (let i = 0; i < 37; i++) tick(sim, player, { yaw: 0, forward: 1 });
  assert.equal(player.portalTransit, undefined, "a lone portal is inactive");

  put(sim, player, LAB.x + 4, floor + 0.825, LAB.z);
  tick(sim, player, { placePortal: "orange", yaw: 0 });
  assert.equal(sim.s.portals?.orange, undefined, "portals cannot overlap");
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2 });
  const orange = sim.s.portals?.orange;
  assert.ok(orange);
  assert.equal(orange.normal.x, -1);

  while ((player.portalTransit ?? 0) < 1 && player.ack < 140) {
    tick(sim, player, { yaw: 0, forward: 1 });
  }
  assert.equal(player.portalTransit, 1);
  assert.ok(player.x < orange.center.x && player.x > orange.center.x - 1);
  assert.ok(player.vx < -10 && Math.abs(player.vz) < 0.01);
  tick(sim, player, { portalTransit: 0, yaw: 0 });
  assert.ok(Math.abs(player.yaw - Math.PI / 2) < 0.001, "queued pre-transit aim is ignored");

  for (let i = 0; i < 80 && player.portalTransit === 1; i++) {
    tick(sim, player, { yaw: -Math.PI / 2, forward: 1 });
  }
  assert.equal(player.portalTransit, 2);
  assert.ok(player.z > blue.center.z && player.z < blue.center.z + 1);
  assert.ok(player.vz > 0);
});

test("a floor and ceiling pair supports repeated falling in the same direction", t => {
  const { sim, player } = expedition(t);
  const floor = LAB.y + 0.3;
  const ceiling = LAB.y + 7.15;
  const eye = floor + 0.825 + 0.9;
  const tilt = 1.35;
  const x = LAB.x - 5;
  const z = LAB.z;
  put(sim, player, x, floor + 0.825, z + (eye - floor) / Math.tan(tilt));
  tick(sim, player, { placePortal: "blue", yaw: 0, pitch: -tilt });
  put(sim, player, x, floor + 0.825, z + (ceiling - eye) / Math.tan(tilt));
  tick(sim, player, { placePortal: "orange", yaw: 0, pitch: tilt });
  assert.equal(sim.s.portals?.blue?.normal.y, 1);
  assert.equal(sim.s.portals?.orange?.normal.y, -1);

  const fall = sim.add("guest");
  put(sim, fall, x, floor + 3, z, -14);
  for (let i = 0; i < 55; i++) tick(sim, fall);
  assert.ok((fall.portalTransit ?? 0) >= 3, "another player can fall through the room's pair repeatedly");
  assert.ok(fall.vy < -14);
  assert.ok(Math.abs(fall.x - x) < 0.03);
  assert.deepEqual(sim.snapshot().portals, sim.s.portals);
});

test("a portal placement queued before transit cannot move a portal from the exit", t => {
  const { sim, player } = expedition(t);
  const y = LAB.y + 1.125;
  put(sim, player, LAB.x + 4, y, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  const blue = sim.s.portals?.blue;
  assert.ok(blue);
  put(sim, player, LAB.x + 4, y, LAB.z + 3.5);
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2 });
  assert.ok(sim.s.portals?.orange);
  put(sim, player, blue.center.x, y, blue.center.z + 0.42);
  player.vz = -15;
  const input = { ...idleInput(player.ack + 1), portalTransit: 0, forward: 1 };
  sim.input(player.id, input);
  sim.input(player.id, { ...input, seq: input.seq + 1, placePortal: "blue" });
  sim.tick();
  assert.equal(player.portalTransit, 1);
  sim.tick();
  assert.deepEqual(sim.s.portals?.blue, blue);
});

test("an invalid target and seated player cannot move an existing portal", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  const before = sim.s.portals?.blue;
  assert.ok(before);
  put(sim, player, LAB.x, LAB.y + 1.125, LAB.z + 20);
  tick(sim, player, { placePortal: "blue", yaw: Math.PI, pitch: 0.8 });
  assert.deepEqual(sim.s.portals?.blue, before);
  player.seat = 1;
  sim.s.adventure.ship.seats[1] = player.id;
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2 });
  assert.equal(sim.s.portals?.orange, undefined);
});

test("falling near the entry edge can emerge from a low wall portal without clipping the floor", t => {
  const { sim, player } = expedition(t);
  const floor = LAB.y + 0.3;
  const x = LAB.x - 5;
  const z = LAB.z;
  const tilt = 1.35;
  put(sim, player, x, floor + 0.825, z + 1.725 / Math.tan(tilt));
  tick(sim, player, { placePortal: "blue", yaw: 0, pitch: -tilt });
  put(sim, player, LAB.x + 4, floor + 0.825, z);
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2, pitch: 0 });

  for (const offset of [-1.2, 1.2]) {
    const transit = player.portalTransit ?? 0;
    put(sim, player, x, floor + 3, z + offset, -14);
    for (let i = 0; i < 10 && (player.portalTransit ?? 0) === transit; i++) tick(sim, player);
    assert.equal(player.portalTransit, transit + 1);
    assert.ok(player.y >= floor + 0.8);
    assert.ok(player.vx < -14);
  }
});

test("the contact point detects a fast diagonal entry before the wall slides the collider", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2 });
  const entry = sim.s.portals?.blue;
  assert.ok(entry);
  put(sim, player, entry.center.x, entry.center.y, entry.center.z + 0.41, 0.02);
  Object.assign(player, { vx: 30, vz: -20 });
  tick(sim, player);
  assert.equal(player.portalTransit, 1);
  assert.ok(player.vx < -19 && player.vz < -29);
});

test("an older client without portal support can continue moving and turning in a paired room", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  tick(sim, player, { placePortal: "orange", yaw: -Math.PI / 2 });
  const entry = sim.s.portals?.blue;
  assert.ok(entry);
  const oldClient = sim.add("old");
  put(sim, oldClient, entry.center.x, entry.center.y, entry.center.z + 0.42);
  oldClient.vz = -12;
  tick(sim, oldClient, { portalTransit: undefined, yaw: 0.25, pitch: 0.2 });
  assert.equal(oldClient.portalTransit, undefined);
  assert.equal(oldClient.yaw, 0.25);
  assert.equal(oldClient.pitch, 0.2);
});

test("the lab archive stone occludes a placement ray", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x, LAB.y + 1.125, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  assert.equal(sim.s.portals?.blue, undefined);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  tick(sim, player, { placePortal: "blue" });
  assert.ok(sim.s.portals?.blue);
});

test("a structural rib occludes a portal ray aimed at the side wall", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z + 1);
  tick(sim, player, { placePortal: "blue", yaw: -Math.PI / 2 });
  assert.equal(sim.s.portals?.blue, undefined);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z - 2);
  tick(sim, player, { placePortal: "blue", yaw: -Math.PI / 2 });
  assert.ok(sim.s.portals?.blue);
});

test("the field gun alternates colors outdoors and undoes successful placements in order", t => {
  const { sim, player } = expedition(t);
  const outdoor = (x: number, z: number) => put(sim, player, x, groundAt(x, z) + 0.87, z);
  outdoor(14, 312);
  tick(sim, player, { portalAction: "fire", pitch: -1.35 });
  const blue = sim.s.portals?.blue;
  assert.ok(blue && blue.normal.y > 0.95);
  tick(sim, player, { portalAction: "fire", pitch: -1.35 });
  assert.equal(sim.s.portals?.orange, undefined, "a miss does not advance the color");
  outdoor(1, 250);
  tick(sim, player, { portalAction: "fire", pitch: -1.35 });
  const red = sim.s.portals?.orange;
  assert.ok(red && red.center.z < 251);
  outdoor(-40, 195);
  tick(sim, player, { portalAction: "fire", pitch: -1.35 });
  assert.notDeepEqual(sim.s.portals?.blue, blue);
  tick(sim, player, { portalAction: "undo" });
  assert.deepEqual(sim.s.portals, { blue, orange: red });
  tick(sim, player, { portalAction: "undo" });
  assert.deepEqual(sim.s.portals, { blue });
  assert.equal(sim.snapshot().lastPortalColor, "blue");
});

test("a player can place a gate on a spherical world and travel through it to the basin", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  tick(sim, player, { portalAction: "fire", yaw: 0, pitch: 0 });
  const exit = sim.s.portals?.blue;
  assert.ok(exit);
  const planet = SOLAR_SYSTEM.mercury;
  player.planet = planet.id;
  put(sim, player, planet.position.x, planet.position.y + planet.radius + 4, planet.position.z);
  tick(sim, player, { portalAction: "fire", yaw: 0, pitch: -1.35 });
  const entry = sim.s.portals?.orange;
  assert.ok(entry && entry.planet === planet.id);
  const above = new Vector3().copy(entry.center).addScaledVector(entry.normal, 3);
  put(sim, player, above.x, above.y, above.z, -13);
  for (let i = 0; i < 10 && !player.portalTransit; i++) tick(sim, player);
  assert.equal(player.portalTransit, 1);
  assert.equal(player.planet, null);
  assert.ok(Math.abs(player.z - exit.center.z) < 2);
});

test("fighter recall lifts before moving and parks within reach of the caller", t => {
  const { sim, player } = expedition(t);
  put(sim, player, LAB.x + 4, LAB.y + 1.125, LAB.z);
  const ship = sim.s.adventure.ship;
  const from = { x: ship.x, y: ship.y, z: ship.z };
  sim.action(player.id, "recall-fighter");
  assert.equal(ship.recall?.phase, "lift");
  for (let i = 0; i < 30; i++) sim.tick();
  assert.equal(ship.x, from.x);
  assert.equal(ship.z, from.z);
  assert.ok(ship.y > from.y + 5);
  for (let i = 0; i < 600 && ship.recall; i++) sim.tick();
  assert.equal(ship.recall, undefined);
  assert.equal(ship.grounded, true);
  assert.ok(Math.hypot(ship.x - player.x, ship.z - player.z) <= 39);
  assert.ok(Math.hypot(ship.x - player.x, ship.z - player.z) >= 10);
  assert.equal(ship.flightTime, 0);
  ship.seats[0] = player.id;
  player.seat = 0;
  const parked = { x: ship.x, y: ship.y, z: ship.z };
  const guest = sim.add("guest");
  sim.action(guest.id, "recall-fighter");
  assert.equal(ship.recall, undefined);
  assert.deepEqual({ x: ship.x, y: ship.y, z: ship.z }, parked);
});
