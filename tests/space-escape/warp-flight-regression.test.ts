import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SOLAR_SYSTEM, type SpaceshipKind } from "../../frontend/space-escape/shared/celestial";
import { DT, idleInput } from "../../frontend/space-escape/shared/types";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { StardustParallaxStream } from "../../frontend/space-escape/src/scene";
import { ShipPropulsionFX } from "../../frontend/space-escape/src/thruster-fx";

await initPhysics();
const route = ["warpgate", "warpgate_east", "warpgate_south", "warpgate_west"];
function flight(kind: SpaceshipKind = "light_fighter") {
  const sim = new Simulation(2026);
  const pilot = sim.add("pilot"), passenger = sim.add("crew");
  sim.start(pilot.id);
  pilot.seat = 0; passenger.seat = 1;
  const ship = sim.s.adventure.ship;
  Object.assign(ship, { kind, repaired: true, grounded: false, seats: [pilot.id, passenger.id, "", ""] });
  return { sim, ship, pilot, passenger };
}
function approach(ship: Simulation["s"]["adventure"]["ship"], id: string, lateral = 0) {
  const gate = SOLAR_SYSTEM[id];
  const normal = new THREE.Vector3().subVectors(gate.landingSite, gate.position).normalize();
  const side = new THREE.Vector3(normal.z, 0, -normal.x);
  const position = new THREE.Vector3().copy(gate.position).addScaledVector(normal, 0.5).addScaledVector(side, lateral);
  Object.assign(ship, position, { vx: -normal.x * 200, vy: 0, vz: -normal.z * 200,
    yaw: Math.atan2(normal.x, normal.z), grounded: false });
}
for (const kind of ["light_fighter", "intergalactic"] as const) {
  for (const [index, id] of route.entries()) {
    test(`${kind}: ${id} crosses to its adjacent gate and synchronizes the crew`, t => {
      const { sim, ship, pilot, passenger } = flight(kind);
      t.after(() => sim.dispose());
      approach(ship, id);
      sim.input(pilot.id, { ...idleInput(), yaw: ship.yaw, seq: 1 });
      sim.tick();
      const destination = SOLAR_SYSTEM[route[(index + 1) % route.length]];
      assert.deepEqual({ x: ship.x, y: ship.y, z: ship.z }, destination.landingSite);
      assert.ok((ship.warpUntil ?? 0) > sim.s.time);
      const exit = new THREE.Vector3().subVectors(destination.landingSite, destination.position).normalize();
      const velocity = new THREE.Vector3(ship.vx, ship.vy, ship.vz);
      assert.ok(velocity.dot(exit) > 190, "velocity must point out of the destination portal");
      assert.ok(new THREE.Vector3(-Math.sin(ship.yaw), 0, -Math.cos(ship.yaw)).dot(exit) > 0.999);
      assert.equal(pilot.yaw, ship.yaw);
      assert.equal(passenger.vx, ship.vx);
      assert.equal(passenger.vz, ship.vz);
      assert.equal(passenger.x, ship.x);
      assert.equal(passenger.z, ship.z);
      assert.equal(passenger.y, ship.y + 2.2);
      const snapshot = sim.snapshot();
      assert.equal(snapshot.adventure.ship.warpUntil, ship.warpUntil);
      assert.equal(snapshot.players[1].seat, 1);
      assert.match(snapshot.event, /星门跃迁/);
      const eventId = sim.s.eventId;
      approach(ship, destination.id);
      sim.tick();
      assert.equal(sim.s.eventId, eventId, "cooldown must prevent a second traversal");
      ship.warpUntil = sim.s.time;
      approach(ship, destination.id);
      sim.tick();
      assert.ok(sim.s.eventId > eventId, "gate must reopen when cooldown expires");
    });
  }
  test(`${kind}: climb is faster while X still descends`, t => {
    const { sim, ship, pilot } = flight(kind);
    t.after(() => sim.dispose());
    Object.assign(ship, { x: 0, y: 1000, z: 0, vx: 0, vy: 0, vz: 0 });
    for (let seq = 1; seq <= 90; seq++) {
      sim.input(pilot.id, { ...idleInput(), jump: true, seq });
      sim.tick();
    }
    assert.ok(ship.vy > (kind === "light_fighter" ? 135 : 100), `climb speed: ${ship.vy}`);
    assert.ok(ship.vy <= 160);
    for (let seq = 91; seq <= 150; seq++) {
      sim.input(pilot.id, { ...idleInput(), brake: true, seq });
      sim.tick();
    }
    assert.ok(ship.vy < -90, `brake descent: ${ship.vy}`);
  });
}
test("portal rejects frame flybys, approaching without crossing, and unpiloted ships", t => {
  const { sim, ship, pilot } = flight();
  t.after(() => sim.dispose());
  for (const lateral of [290, 400]) {
    approach(ship, "warpgate", lateral);
    sim.tick();
    assert.equal(ship.warpUntil, undefined);
  }
  approach(ship, "warpgate"); ship.z += 100;
  sim.tick();
  assert.equal(ship.warpUntil, undefined);
  approach(ship, "warpgate"); ship.seats[0] = ""; pilot.seat = -1;
  sim.tick();
  assert.equal(ship.warpUntil, undefined);
});
test("stardust requires actual speed above 35 m/s regardless of stationary ignition", () => {
  const stream = new StardustParallaxStream();
  for (const [speed, thrust, driving, visible] of [
    [0, 8, true, false], [25, 8, true, false], [35, 8, true, false],
    [35.1, 0, true, true], [90, 0, true, true], [90, 8, false, false],
  ] as const) {
    stream.update(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(0, 0, -speed), thrust, driving, DT);
    for (const layer of stream.layers) assert.equal((layer.points.material as THREE.PointsMaterial).opacity > 0, visible);
  }
});
test("fighter plasma cores, outer flames, and exhaust light share the nozzle height", () => {
  const fx = new ShipPropulsionFX("light_fighter");
  for (const mesh of fx.rootGroup.children.slice(0, 4)) assert.equal(mesh.position.y, 0.5);
  const light = fx.rootGroup.children.find(node => node instanceof THREE.PointLight)!;
  assert.equal(light.position.y, 0.5);
});

test("delayed pre-warp input cannot undo the new pilot or passenger heading", t => {
  const { sim, ship, pilot, passenger } = flight();
  t.after(() => sim.dispose());
  approach(ship, "warpgate");
  sim.input(pilot.id, { ...idleInput(), seq: 1, yaw: ship.yaw });
  sim.input(passenger.id, { ...idleInput(), seq: 1, yaw: 0.25 });
  sim.tick();
  const heading = ship.yaw, pilotYaw = pilot.yaw, passengerYaw = passenger.yaw;
  for (let seq = 2; seq <= 8; seq++) {
    sim.input(pilot.id, { ...idleInput(), seq, yaw: 0 });
    sim.input(passenger.id, { ...idleInput(), seq, yaw: 0.25 });
    sim.tick();
    assert.equal(ship.yaw, heading);
    assert.equal(pilot.yaw, pilotYaw);
    assert.equal(passenger.yaw, passengerYaw);
  }
  sim.input(pilot.id, { ...idleInput(), seq: 9, warpUntil: ship.warpUntil, yaw: heading + 0.5 });
  sim.tick();
  assert.ok(ship.yaw > heading, "acknowledged input restores pilot steering");
});
