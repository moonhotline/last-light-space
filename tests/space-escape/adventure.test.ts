import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import {
  idleInput,
  type Input,
  type Player,
} from "../../frontend/space-escape/shared/types";
import {
  LORE,
  LAB,
  REPAIR,
  DESTINATION,
  type ItemId,
} from "../../frontend/space-escape/shared/adventure-data";
import {
  HALF,
  groundAt,
  distance3,
  type Vec,
} from "../../frontend/space-escape/shared/map";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
await initPhysics();
const setup = () => {
  const sim = new Simulation(42),
    p = sim.add("a"),
    g = sim.add("b");
  sim.start(p.id);
  return { sim, p, g };
};
function step(sim: Simulation, p: Player, patch: Partial<Input> = {}, n = 1) {
  for (let j = 0; j < n; j++) {
    sim.input(p.id, {
      ...idleInput(p.ack + 1),
      yaw: p.yaw,
      pitch: p.pitch,
      ...patch,
    });
    sim.tick();
  }
}
function place(sim: Simulation, p: Player, position: Vec) {
  Object.assign(p, position, { vx: 0, vy: 0, vz: 0, grounded: false });
  sim.physics.reset(p.id, p);
}
function aim(p: Player, t: Vec) {
  p.yaw = Math.atan2(p.x - t.x, p.z - t.z);
  p.pitch = Math.atan2(t.y - p.y - 0.9, Math.hypot(t.x - p.x, t.z - p.z));
}

test("grapple attaches to an authoritative wall, toggles once and preserves release momentum", () => {
  const { sim, p } = setup();
  place(sim, p, { x: LAB.x, y: LAB.y + 2, z: LAB.z + 22 });
  const target = { x: LAB.x + 7, y: LAB.y + 6, z: LAB.z + 13 };
  aim(p, target);
  step(sim, p, { grapple: true });
  assert.ok(p.grapple);
  const id = p.grappleId;
  step(sim, p, { grapple: true }, 8);
  assert.equal(p.grappleId, id);
  assert.ok(Math.hypot(p.vx, p.vz) > 3);
  step(sim, p, { grapple: false });
  const speed = Math.hypot(p.vx, p.vz);
  step(sim, p, { grapple: true });
  assert.equal(p.grapple, null);
  assert.ok(Math.hypot(p.vx, p.vz) > speed * 0.9);
  sim.dispose();
});
test("grapple cannot attach to sky or client supplied coordinates", () => {
  const { sim, p } = setup();
  p.pitch = 1.4;
  step(sim, p, { grapple: true });
  assert.equal(p.grapple, null);
  sim.action(p.id, { grapple: { x: 1, y: 900, z: 2 } });
  assert.equal(p.grapple, null);
  sim.dispose();
});
test("resource harvesting requires aim, range and cooldown, and awards one shared node only once", () => {
  const { sim, p, g } = setup();
  const n = sim.s.adventure.nodes[0];
  place(sim, p, { x: n.x, y: n.y + 0.4, z: n.z + 20 });
  aim(p, n);
  step(sim, p, { fire: true }, 30);
  assert.equal(p.inventory.scrap, 0);
  place(sim, p, { x: n.x, y: groundAt(n.x, n.z + 5) + 0.85, z: n.z + 5 });
  aim(p, n);
  step(sim, p, {}, 12);
  step(sim, p, { fire: true });
  assert.equal(n.hp, 2);
  step(sim, p, { fire: true }, 2);
  assert.equal(n.hp, 2);
  step(sim, p, { fire: true }, 25);
  assert.equal(p.inventory.scrap, 4);
  place(sim, g, { x: n.x, y: p.y, z: n.z + 5 });
  aim(g, n);
  step(sim, g, { fire: true }, 40);
  assert.equal(g.inventory.scrap, 0);
  sim.dispose();
});
test("laboratory walls block both tools and player movement", () => {
  const { sim, p } = setup();
  place(sim, p, {
    x: LAB.x + 14,
    y: groundAt(LAB.x + 14, LAB.z) + 0.85,
    z: LAB.z,
  });
  const inside = { x: LAB.x, y: LAB.y + 1, z: LAB.z };
  assert.equal(sim.physics.visible(p, inside), false);
  p.yaw = Math.PI / 2;
  step(sim, p, { forward: 1 }, 60);
  assert.ok(p.x > LAB.x + 10);
  sim.dispose();
});
test("lore is shared and awards navigation module exactly once", () => {
  const { sim, p, g } = setup();
  const l = LORE[1];
  place(sim, p, { x: l.x, y: l.y + 0.85, z: l.z + 3 });
  step(sim, p, { interact: true });
  assert.ok(sim.s.adventure.lore.includes(1));
  assert.equal(p.inventory.circuit, 1);
  assert.equal(g.level, 1);
  step(sim, p, {});
  step(sim, p, { interact: true });
  assert.equal(p.inventory.circuit, 1);
  sim.remove(p.id);
  assert.equal(sim.s.adventure.ship.cargo.circuit, 1);
  sim.dispose();
});
test("repair requires all resources, supports contributions, and holding E cannot also board", () => {
  const { sim, p, g } = setup(),
    ship = sim.s.adventure.ship;
  for (const member of [p, g])
    place(sim, member, { x: ship.x + 9, y: ship.y + 0.85, z: ship.z });
  p.inventory.ore = 4;
  p.inventory.scrap = 4;
  step(sim, p, { interact: true }, 150);
  assert.equal(ship.repaired, false);
  assert.equal(ship.cargo.ore, 4);
  assert.equal(p.inventory.ore, 0);
  g.inventory.cell = 2;
  g.inventory.circuit = 1;
  g.inventory.core = 1;
  step(sim, g, { interact: true }, 125);
  assert.equal(ship.repaired, true);
  assert.equal(g.seat, -1);
  step(sim, g, {});
  step(sim, g, { interact: true });
  assert.equal(g.seat, 0);
  step(sim, p, { interact: true });
  assert.equal(p.seat, 1);
  assert.equal(new Set(ship.seats.filter(Boolean)).size, 2);
  sim.remove(g.id);
  assert.equal(p.seat, 0);
  assert.equal(ship.seats[0], p.id);
  sim.dispose();
});
test("only the pilot controls flight and departure is rejected in midair", () => {
  const { sim, p, g } = setup(),
    ship = sim.s.adventure.ship;
  ship.repaired = true;
  for (const member of [p, g]) {
    place(sim, member, { x: ship.x + 9, y: ship.y + 0.85, z: ship.z });
    step(sim, member, { interact: true });
  }
  assert.equal(p.seat, 0);
  assert.equal(g.seat, 1);
  const z = ship.z;
  step(sim, g, { forward: 1, jump: true }, 60);
  assert.ok(Math.abs(ship.z - z) < 0.01);
  step(sim, p, { jump: true }, 90);
  assert.ok(ship.y > groundAt(ship.x, ship.z) + 15);
  step(sim, p, { interact: true });
  assert.equal(p.seat, 0);
  const y = ship.y;
  step(sim, p, { brake: true, sprint: true }, 180);
  assert.ok(ship.y < y);
  assert.ok(ship.y >= groundAt(ship.x, ship.z));
  sim.dispose();
});
test("enemy windup can be dodged, a stationary target takes damage, and healing consumes gel", () => {
  const { sim, p } = setup(),
    d = sim.s.adventure.drones[0];
  sim.s.adventure.drones.slice(1).forEach((v) => (v.hp = 0));
  place(sim, p, { x: 0, y: groundAt(0, 330) + 0.85, z: 330 });
  Object.assign(d, {
    x: 0,
    y: p.y + 3,
    z: 320,
    mode: "charge",
    timer: 0.4,
    aim: { x: p.x, y: p.y + 0.9, z: p.z },
  });
  place(sim, p, { x: 8, y: groundAt(8, 330) + 0.85, z: 330 });
  step(sim, p, {}, 15);
  assert.equal(p.health, 100);
  Object.assign(d, {
    mode: "charge",
    timer: 0.4,
    aim: { x: p.x, y: p.y + 0.9, z: p.z },
  });
  step(sim, p, {}, 15);
  assert.equal(p.health, 82);
  sim.action(p.id, "heal");
  assert.equal(p.health, 100);
  assert.equal(p.inventory.medgel, 1);
  sim.action(p.id, "heal");
  assert.equal(p.inventory.medgel, 1);
  sim.action(p.id, { health: 999, inventory: { core: 9 } });
  assert.equal(p.inventory.core, 0);
  sim.dispose();
});
test("ship hull sweep stops at laboratory walls instead of passing through at speed", () => {
  const { sim } = setup();
  const from = { x: LAB.x + 16, y: LAB.y + 1, z: LAB.z };
  const to = sim.physics.shipMotion(from, { x: -30, y: 0, z: 0 });
  assert.ok(to.x > LAB.x + 10);
  assert.ok(to.x <= from.x);
  sim.dispose();
});
test("locked core is unobtainable before combat and drones take four valid hits", () => {
  const { sim, p } = setup(),
    a = sim.s.adventure,
    n = a.nodes.find((n) => n.item === "core")!,
    d = a.drones[0];
  place(sim, p, { x: n.x, y: groundAt(n.x, n.z + 6) + 0.85, z: n.z + 6 });
  aim(p, n);
  step(sim, p, { fire: true }, 40);
  assert.equal(p.inventory.core, 0);
  d.mode = "stunned";
  d.timer = 10;
  place(sim, p, { x: d.x, y: d.y - 0.9, z: d.z + 12 });
  aim(p, d);
  p.toolCooldown = 0;
  for (let k = 0; k < 4; k++) {
    d.mode = "stunned";
    d.timer = 10;
    aim(p, d);
    step(sim, p, { fire: true });
    step(sim, p, {}, 10);
  }
  assert.equal(d.hp, 0);
  assert.equal(d.mode, "dead");
  sim.dispose();
});
test("arrival requires repaired ship, a pilot, actual flight and landing in the destination", () => {
  const { sim, p } = setup(),
    ship = sim.s.adventure.ship;
  place(sim, p, { ...DESTINATION, y: DESTINATION.y + 0.85 });
  step(sim, p, {}, 3);
  assert.equal(sim.s.phase, "active");
  ship.repaired = true;
  ship.seats[0] = p.id;
  p.seat = 0;
  Object.assign(ship, DESTINATION, { flightTime: 4, y: DESTINATION.y + 0.05 });
  step(sim, p, {});
  assert.equal(ship.arrived, true);
  assert.equal(sim.s.phase, "won");
  sim.dispose();
});

test("pilot and passenger ascend past 650m and retain controls at deep-space heights", () => {
  const { sim, p, g } = setup();
  try {
    const ship = sim.s.adventure.ship;
    ship.repaired = true;
    ship.seats[0] = p.id;
    ship.seats[1] = g.id;
    p.seat = 0;
    g.seat = 1;
    // Exercise the authoritative simulation, not a mocked position integrator.
    for (const height of [649, 1799, 6999]) {
      Object.assign(ship, { y: height, vy: 0, vx: 0, vz: 0 });
      step(sim, p, { jump: true }, 90);
      assert.ok(ship.y > height + 20, `must ascend from ${height}m`);
      assert.equal(ship.grounded, false);
      for (const occupant of [p, g]) {
        assert.equal(occupant.y, ship.y + 2.2);
        assert.equal(occupant.vy, ship.vy);
        assert.ok(Number.isFinite(occupant.y));
      }
      const top = ship.y;
      step(sim, p, { brake: true, sprint: true }, 90);
      assert.ok(ship.y < top, "brakes must still permit descent");
    }
  } finally {
    sim.dispose();
  }
});

test("unbounded ascent retains the sampled terrain floor and basin lateral limits", () => {
  const { sim, p } = setup();
  try {
    const ship = sim.s.adventure.ship;
    ship.repaired = true;
    ship.seats[0] = p.id;
    p.seat = 0;
    const floor = Math.max(...[-4, 0, 4].flatMap(x =>
      [-5, 0, 5].map(z => groundAt(ship.x + x, ship.z + z))));
    Object.assign(ship, { y: floor + 0.05, vy: -16 });
    step(sim, p, { brake: true });
    assert.equal(ship.y, floor);
    assert.equal(ship.grounded, true);
    assert.equal(ship.vy, 0);
    Object.assign(ship, { x: HALF - 20, y: 7000, vx: 72, yaw: 0 });
    step(sim, p, { side: 1 });
    assert.equal(ship.x, HALF - 20, "lateral release is outside this patch");
    assert.ok(ship.y > 650);
  } finally {
    sim.dispose();
  }
});

test("interplanetary flight carries Blerk, crosses basin limits, and lands successfully on Mercury", () => {
  const { sim, p } = setup();
  try {
    const ship = sim.s.adventure.ship;
    ship.repaired = true;
    // Player boards ship
    Object.assign(p, { x: ship.x, y: ship.y, z: ship.z, grounded: true });
    step(sim, p, { interact: true });
    assert.equal(p.seat, 0, "Player should be in pilot seat");
    assert.ok(ship.companionSeats?.includes("blerk"), "Blerk should automatically board companion seat");

    // Set interplanetary target to Mercury
    sim.setInterplanetaryTarget("mercury");
    assert.equal(ship.targetPlanet, "mercury");

    // Ascend into deep space
    Object.assign(ship, { x: 0, y: 700, z: 0, vx: 0, vy: 50, vz: 0, grounded: false });
    step(sim, p, { sprint: true, forward: 1 });
    assert.equal(ship.flightStage, "space");

    // Fly towards Mercury (x: -3200, y: 1525, z: -5400) crossing the old basin boundary HALF - 20 (1772m)
    Object.assign(ship, { x: -3000, y: 1600, z: -5200, vx: -50, vy: 0, vz: -50 });
    step(sim, p, { forward: 1 });
    assert.ok(Math.abs(ship.x) > HALF, `Ship X (${ship.x}) should cross the old basin limit (${HALF})`);
    assert.ok(Math.abs(ship.z) > HALF, `Ship Z (${ship.z}) should cross the old basin limit (${HALF})`);

    // Approach and land at Mercury landing site
    const mercuryLanding = SOLAR_SYSTEM.mercury.landingSite;
    Object.assign(ship, {
      x: mercuryLanding.x + 10,
      y: mercuryLanding.y + 5,
      z: mercuryLanding.z + 10,
      vx: 2,
      vy: -1,
      vz: 2,
    });
    step(sim, p, { brake: true });

    assert.equal(ship.arrived, true, "Ship should arrive at Mercury");
    assert.equal(ship.flightStage, "landed");
    assert.equal(ship.grounded, true);
    assert.deepEqual(
      { x: ship.x, y: ship.y, z: ship.z },
      mercuryLanding,
      "Ship should touch down exactly on Mercury landing site"
    );
    assert.equal(sim.s.phase, "won");
  } finally {
    sim.dispose();
  }
});
