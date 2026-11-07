import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { SOLAR_SYSTEM, celestialCapture, landmarkPosition } from "../../frontend/space-escape/shared/celestial";
import { celestialCockpitPose, celestialFlightFrame } from "../../frontend/space-escape/shared/celestial-flight";
import { shipBoardingDistance, tickShip } from "../../frontend/space-escape/shared/adventure";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { idleInput } from "../../frontend/space-escape/shared/types";
import { computeCelestialAlignment } from "../../frontend/space-escape/src/interplanetary";

await initPhysics();
const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1),
  new Vector3(-1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)];

for (const body of Object.values(SOLAR_SYSTEM).filter(body => body.landable !== false)) {
  test(`${body.id}: capture, stable landing, surface exit/reboarding and radial launch on every hemisphere`, (t) => {
    const sim = new Simulation(2026);
    t.after(() => sim.dispose());
    const pilot = sim.add("pilot");
    sim.start(pilot.id);
    const ship = sim.s.adventure.ship;
    const center = new Vector3().copy(body.position);
    for (const normal of axes) {
      const approach = center.clone().addScaledVector(normal, body.radius + 3);
      Object.assign(ship, approach, { repaired: true, vx: -normal.x * 2, vy: -normal.y * 2,
        vz: -normal.z * 2, yaw: 0, bank: 0, grounded: false });
      ship.seats[0] = pilot.id;
      pilot.seat = 0;
      const inputs = new Map([[pilot.id, idleInput()]]);
      for (let tick = 0; tick < 180; tick++) tickShip(sim, inputs);
      const landed = new Vector3(ship.x, ship.y, ship.z);
      assert.equal(ship.grounded, true, `${body.id} at ${normal.toArray()}`);
      assert.ok(Math.abs(landed.distanceTo(center) - body.radius - 0.2) < 1e-6);
      assert.ok(Math.hypot(ship.vx, ship.vy, ship.vz) < 0.05, "idle ship must stay still on the crust");
      const alignment = computeCelestialAlignment(ship, ship.yaw, ship.bank);
      assert.equal(alignment.body?.id, body.id);
      assert.equal(alignment.isLanded, true);
      assert.ok(alignment.up.dot(normal) > 0.999);
      assert.ok(Math.abs(alignment.quaternion.length() - 1) < 1e-6);
      assert.equal(pilot.planet, body.id);
      for (let tick = 0; tick < 60; tick++) tickShip(sim, inputs);
      assert.ok(new Vector3(ship.x, ship.y, ship.z).distanceTo(landed) < 0.01, "parking must not drift");

      const interact = (pressed: boolean) => {
        sim.input(pilot.id, { ...idleInput(pilot.ack + 1), interact: pressed });
        sim.tick();
      };
      pilot.interactHeld = false;
      interact(true);
      assert.equal(pilot.seat, -1);
      assert.equal(pilot.planet, body.id);
      assert.ok(Math.abs(new Vector3(pilot.x, pilot.y, pilot.z).distanceTo(center) - body.radius - 0.825) < 1e-6);
      assert.ok(shipBoardingDistance(pilot, ship) < 8);
      interact(false);
      interact(true);
      assert.equal(pilot.seat, 0);
      inputs.set(pilot.id, { ...idleInput(), jump: true });
      for (let tick = 0; tick < 30; tick++) tickShip(sim, inputs);
      assert.equal(ship.grounded, false);
      assert.ok(new Vector3(ship.x, ship.y, ship.z).distanceTo(center) > body.radius + 10, "jump thrust must launch radially");
    }
  });
}

test("capture frame stays finite at the antipode, center and capture boundary", () => {
  const body = SOLAR_SYSTEM.mars;
  const center = new Vector3().copy(body.position);
  for (const distance of [0, body.radius + 0.2, body.radius + 90, body.atmosphereRadius + 219, body.atmosphereRadius + 221]) {
    for (const normal of axes) {
      const pos = center.clone().addScaledVector(normal, distance);
      const frame = celestialFlightFrame(pos, 0);
      assert.ok(frame.up.toArray().every(Number.isFinite));
      assert.ok(Math.abs(frame.up.length() - 1) < 1e-6);
      assert.ok(Math.abs(frame.forward.dot(frame.up)) < 1e-6);
      assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-6);
      assert.ok(Math.abs(frame.quaternion.length() - 1) < 1e-6);
    }
  }
});

test("cockpit cameras stay outside the crust and look along the local horizon on every hemisphere", () => {
  for (const body of Object.values(SOLAR_SYSTEM).filter(body => body.landable !== false)) {
    for (const normal of axes) {
      const center = new Vector3().copy(body.position);
      const ship = center.clone().addScaledVector(normal, body.radius + 0.2);
      const pose = celestialCockpitPose(ship, 0.8, 0.8, 0);
      assert.ok(pose.position.distanceTo(center) > body.radius + 3.9);
      assert.ok(pose.up.dot(normal) > 0.99999);
      const look = new Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
      assert.ok(Math.abs(look.dot(normal)) < 1e-6);
      assert.ok(look.dot(celestialFlightFrame(ship, 0.8).forward) > 0.99999);
    }
  }
});

test("gravity selects the destination by position and ignores the gate's open horizon", () => {
  for (const id of ["venus", "mars", "jupiter", "saturn"]) {
    assert.equal(celestialCapture(SOLAR_SYSTEM[id].landingSite)?.body.id, id);
  }
  assert.equal(celestialCapture(SOLAR_SYSTEM.warpgate.position), null);
  assert.equal(computeCelestialAlignment(SOLAR_SYSTEM.warpgate.position, 0, 0).captureWeight, 0);
  for (const body of Object.values(SOLAR_SYSTEM)) {
    for (const landmark of body.landmarks) {
      const point = landmarkPosition(body, landmark);
      assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - body.radius) < 1e-6);
    }
  }
});

test("deep space above Saturn and below a planet has no global height clamp", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  const ship = sim.s.adventure.ship;
  for (const height of [9000, -1000]) {
    Object.assign(ship, { x: 24000, y: height, z: -24000, vx: 0, vy: 10, vz: 0, repaired: true });
    tickShip(sim, new Map());
    assert.ok(ship.y > height && ship.y < height + 1);
    assert.equal(ship.grounded, false);
  }
});

test("forward thrust crosses the south pole without reversing the flight frame", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  const pilot = sim.add("pilot");
  sim.start(pilot.id);
  const ship = sim.s.adventure.ship;
  const body = SOLAR_SYSTEM.mars;
  const center = new Vector3().copy(body.position);
  const initial = center.clone().add(new Vector3(0, -body.radius - 0.2, 0));
  Object.assign(ship, initial, { repaired: true, grounded: true, yaw: 0, vx: 0, vy: 0, vz: 0 });
  ship.seats[0] = pilot.id;
  pilot.seat = 0;
  const inputs = new Map([[pilot.id, { ...idleInput(), forward: 1 }]]);
  let previousForward = celestialFlightFrame(ship, 0).forward;
  for (let tick = 0; tick < 120; tick++) {
    tickShip(sim, inputs);
    const forward = celestialFlightFrame(ship, 0).forward;
    assert.ok(forward.dot(previousForward) > 0.99, "flight heading must not flip at the antipode");
    previousForward = forward;
  }
  assert.ok(new Vector3(ship.x, ship.y, ship.z).distanceTo(initial) > 100, "forward thrust must move beyond the pole");
  assert.ok(sim.snapshot().adventure.ship.flightRotation, "transported frame must survive snapshots");
});
