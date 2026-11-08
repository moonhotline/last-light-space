import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AdventureView } from "../../frontend/space-escape/src/adventure-view";
import { GameView } from "../../frontend/space-escape/src/scene";
import { alignShipToGround } from "../../frontend/space-escape/src/interplanetary";
import { createAdventure } from "../../frontend/space-escape/shared/adventure";
import { SHIP1_POS } from "../../frontend/space-escape/shared/adventure-data";
import { celestialCockpitPose } from "../../frontend/space-escape/shared/celestial-flight";
import type { Snapshot, Player } from "../../frontend/space-escape/shared/types";

const dt = 1 / 60;

async function skiffView() {
  const view = new AdventureView(new THREE.Scene(), () => {}, () => {});
  assert.equal(view.ship.children.length, 0, "the skiff must wait in a clean Group");
  const data = await readFile(new URL("../../frontend/space-escape/public/assets/skiff.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), "");
  view.ship.add(gltf.scene);
  view.scene.add(view.ship);
  alignShipToGround(view.ship, SHIP1_POS.x, SHIP1_POS.z, Math.PI, 3.8, 5.5, 0.05);
  const state = { adventure: createAdventure(), players: [], time: 0 } as unknown as Snapshot;
  const step = () => view.update(state, null, dt, state.time += dt);
  for (let frame = 0; frame < 120; frame++) step();
  return { view, state, ship: state.adventure.ship, step };
}

test("boarding the authored skiff does not change its stationary ground pose", async () => {
  const { view, ship, step } = await skiffView();
  const parked = view.ship.position.clone();
  const orientation = view.ship.quaternion.clone();
  ship.seats[0] = "pilot";
  for (let frame = 0; frame < 120; frame++) step();
  assert.ok(view.ship.position.distanceTo(parked) < 1e-5, "boarding must not lower the chassis");
  assert.ok(view.ship.quaternion.angleTo(orientation) < 1e-5, "boarding must retain the terrain slope");
});

test("slow skiff takeoff never dips as ground contact and landing gear change", async () => {
  const { view, ship, step } = await skiffView();
  ship.seats[0] = "pilot";
  let previousY = view.ship.position.y;
  for (let frame = 0; frame < 180; frame++) {
    ship.y += 0.015;
    ship.grounded = frame < 20 && frame % 2 === 0;
    step();
    assert.ok(view.ship.position.y >= previousY - 1e-5, `frame ${frame}: takeoff must not dip`);
    previousY = view.ship.position.y;
  }
  assert.ok(view.ship.position.y > SHIP1_POS.y + 2, "the skiff must leave the pad");
});

test("landed skiff keeps its pose when the pilot exits after a flight", async () => {
  const { view, ship, step } = await skiffView();
  ship.seats[0] = "pilot";
  ship.flightTime = 10;
  for (let frame = 0; frame < 120; frame++) step();
  const landed = view.ship.position.clone();
  ship.seats[0] = "";
  for (let frame = 0; frame < 120; frame++) step();
  assert.ok(view.ship.position.distanceTo(landed) < 1e-5, "disembarking must not change chassis clearance");
  assert.ok(view.ship.position.y > ship.y + 0.8, "landing must retain hull clearance");
});

test("deep-space skiff can fly below the basin without a phantom ground floor", async () => {
  const { view, ship, step } = await skiffView();
  Object.assign(ship, { x: 10000, y: -1000, z: 10000, grounded: false });
  view.ship.position.set(ship.x, ship.y, ship.z);
  step();
  assert.equal(view.ship.position.y, ship.y, "terrain clearance applies only within the local basin");
});

// Run the real render camera path without creating a WebGL context. Stop at the
// world update boundary after all camera pose and shake handling has completed.
function cameraView(thirdPerson: boolean) {
  const cameraDone = new Error("camera updated");
  const view: GameView = Object.assign(Object.create(GameView.prototype), {
    adventure: { update() {} }, toolModel: new THREE.Group(), rifleFill: new THREE.PointLight(),
    camera: new THREE.PerspectiveCamera(), sun: new THREE.DirectionalLight(),
    activeWeapon: "none", thirdPerson, effects: 1, shake: 0.8,
    weaponSwitchTime: 0, cameraZoom: 1, lastMe: "pilot", lastCollected: 0,
    lastLanding: 0, lastLevel: 0, lastDash: 0, lastY: 0, jetTimer: 0, footTimer: 0,
    flightSpringArm: { initialized: false, focus: new THREE.Vector3(), position: new THREE.Vector3(), roll: 0.4, pitch: -0.2 },
    stardustStream: { update() {} }, sound() {}, burst() {},
    interplanetary: { setShipState() {}, step() { throw cameraDone; } },
  });
  const state = { adventure: createAdventure(), beacons: [], time: 0 } as unknown as Snapshot;
  Object.assign(state.adventure.ship, { y: 1000, vy: 7, bank: 0.3, grounded: false });
  const player = {
    id: "pilot", seat: 0, x: 0, y: 1000, z: 0, vx: 0, vy: 7, vz: 0,
    yaw: 0, pitch: 0, crystals: 0, landing: 10, landingId: 0, level: 0,
    dashTime: 0, toolCooldown: 0, jetting: false, grounded: false, planet: null,
  } as Player;
  const step = () => assert.throws(() => view.render(state, player, dt, 1, true), error => error === cameraDone);
  return { view, state, player, step };
}

test("cockpit boarding clears walking shake even when a landing or dash event arrives", () => {
  const { view, state, player, step } = cameraView(false);
  player.landingId = 1;
  player.dashTime = 0.1;
  step();
  const ship = state.adventure.ship;
  const expected = celestialCockpitPose(ship, ship.yaw, player.yaw, player.pitch);
  assert.ok(view.camera.position.distanceTo(expected.position) < 1e-10, "cockpit position must not inherit walking shake");
  assert.ok(view.camera.quaternion.angleTo(expected.quaternion) < 1e-7);
  assert.equal(view.shake, 0, "walking events must not reintroduce shake while seated");
  step();
  assert.equal(view.shake, 0);
});

test("flight camera initializes bank and pitch from the current ship on entry and re-entry", () => {
  const { view, state, step } = cameraView(true);
  for (const [bank, vy] of [[0.3, 7], [-0.4, -5]]) {
    Object.assign(state.adventure.ship, { bank, vy });
    view.thirdPerson = false;
    step();
    view.thirdPerson = true;
    step();
    assert.equal(view.flightSpringArm.roll, -bank * 0.65);
    assert.equal(view.flightSpringArm.pitch, vy / 28 * 0.18);
    assert.equal(view.shake, 0);
  }
});
