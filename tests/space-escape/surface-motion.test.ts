import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { idleInput } from "../../frontend/space-escape/shared/types";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";

await initPhysics();

test("walking straight completes a great circle, crosses both poles and keeps the collider with the player", () => {
  const sim = new Simulation(42);
  try {
    const p = sim.add("walker");
    const planet = SOLAR_SYSTEM.kepler;
    sim.start(p.id);
    Object.assign(p, {
      planet: "kepler",
      x: planet.position.x,
      y: planet.position.y + planet.radius + 0.85,
      z: planet.position.z,
      vx: 0, vy: 0, vz: 0,
    });
    sim.physics.reset(p.id, p);
    let angle = 0, previous = 0, minY = p.y;
    for (let tick = 0; tick < 6000 && angle < Math.PI * 2; tick++) {
      sim.input(p.id, { ...idleInput(p.ack + 1), forward: 1, sprint: true });
      sim.tick();
      const current = Math.atan2(-(p.z - planet.position.z), p.y - planet.position.y);
      angle += Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
      previous = current;
      minY = Math.min(minY, p.y);
      const body = sim.physics.bodies.get(p.id)!.body.translation();
      assert.ok(Math.hypot(body.x - p.x, body.y - p.y, body.z - p.z) < 0.05, "collider must follow spherical movement");
      const radius = Math.hypot(p.x - planet.position.x, p.y - planet.position.y, p.z - planet.position.z);
      assert.ok(Math.abs(radius - planet.radius - 0.825) < 0.1);
    }
    assert.ok(angle >= Math.PI * 2, `complete a full lap, travelled ${angle} radians`);
    assert.ok(minY < planet.position.y - planet.radius + 1);
    assert.equal(p.respawns, 0);
  } finally {
    sim.dispose();
  }
});

test("approaching the underside attracts the airborne player upward before contact", () => {
  const sim = new Simulation(43);
  try {
    const p = sim.add("landing");
    const planet = SOLAR_SYSTEM.kepler;
    sim.start(p.id);
    Object.assign(p, { x: planet.position.x, y: planet.position.y - planet.radius - 35, z: planet.position.z, grounded: false });
    sim.physics.reset(p.id, p);
    const start = p.y;
    for (let tick = 0; tick < 150; tick++) {
      sim.input(p.id, idleInput(p.ack + 1));
      sim.tick();
    }
    assert.equal(p.planet, "kepler");
    assert.ok(p.y > start + 25, "gravity must pull toward the underside, not down toward the old map");
    assert.equal(p.grounded, true);
  } finally {
    sim.dispose();
  }
});
