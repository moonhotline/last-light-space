import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { authoredModel } from "./helpers/authored-model";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { idleInput } from "../../frontend/space-escape/shared/types";
import { InterplanetarySystem, normalizeModelContainer } from "../../frontend/space-escape/src/interplanetary";
import { ShipPropulsionFX } from "../../frontend/space-escape/src/thruster-fx";

await initPhysics();
for (const kind of ["light_fighter", "intergalactic"] as const) {
  for (const height of [120, 40000]) {
    test(`${kind}: boost reaches 600 m/s and combined climb/strafe cannot exceed it at y=${height}`, t => {
      const sim = new Simulation(2026);
      t.after(() => sim.dispose());
      const p = sim.add("pilot"); sim.start(p.id); p.seat = 0;
      const ship = sim.s.adventure.ship;
      Object.assign(ship, { kind, repaired: true, grounded: false, seats: [p.id, "", "", ""],
        x: 40000, y: height, z: 40000, yaw: 0, vx: 0, vy: 0, vz: 0 });
      // Keep the surface case over the basin without crossing terrain or buildings.
      for (let seq = 1; seq <= 1200; seq++) {
        Object.assign(ship, { x: height < 650 ? 200 : 40000, y: height, z: height < 650 ? 200 : 40000 });
        sim.input(p.id, { ...idleInput(), seq, sprint: true, forward: 1, jump: seq > 900, side: seq > 900 ? 1 : 0 });
        sim.tick();
        assert.ok(Math.hypot(ship.vx, ship.vy, ship.vz) <= 600 + 1e-6, "total velocity must respect the cap");
        if (seq === 900) assert.ok(Math.hypot(ship.vx, ship.vy, ship.vz) > 599, "the cap must be attainable");
      }
      const before = Math.hypot(ship.vx, ship.vy, ship.vz);
      sim.input(p.id, { ...idleInput(), seq: 1201 }); sim.tick();
      assert.ok(Math.hypot(ship.vx, ship.vy, ship.vz) > before * 0.97, "releasing boost must retain momentum");
      for (let seq = 1202; seq <= 1262; seq++) {
        sim.input(p.id, { ...idleInput(), seq, brake: true, sprint: true }); sim.tick();
      }
      assert.ok(Math.hypot(ship.vx, ship.vz) < 1, "braking must override boost");
    });
  }
}

test("black ship plasma bases sit on the actual authored nozzle faces", async () => {
  const hull = normalizeModelContainer((await authoredModel("/assets/models/intergalactic/scene.gltf")).scene, 18, Math.PI);
  hull.updateMatrixWorld(true);
  const fx = new ShipPropulsionFX("intergalactic");
  const bases = fx.rootGroup.children.filter(node => node instanceof THREE.Mesh).slice(0, 4);
  for (const emitter of bases) {
    assert.ok(Math.abs(Math.abs(emitter.position.x) - 2.1) < 0.01, "use the two engine centers, not the wings");
    const ray = new THREE.Raycaster(new THREE.Vector3(emitter.position.x, emitter.position.y, 10), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(hull, true)[0];
    assert.ok(hit && hit.point.distanceTo(emitter.position) < 0.06, "plasma must begin at the real nozzle face");
  }
});

test("Kepler keeps physical scale through ascent, approach and landing, with authored terrain at the collision surface", async t => {
  const gltf = await authoredModel("/assets/models/stylized_planet/scene.gltf");
  const loader = new GLTFLoader();
  t.mock.method(loader, "loadAsync", async (url: string) => {
    if (url !== "/assets/models/stylized_planet/scene.gltf") throw new Error("unrelated asset");
    return { ...gltf, scene: gltf.scene.clone(true) };
  });
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  await system.loadAssets(loader);
  const entry = system.planets.get("kepler")!, body = SOLAR_SYSTEM.kepler;
  for (const position of [{ x: 0, y: 20, z: 355 }, { x: 0, y: 500, z: 355 },
    { x: 1300, y: 500, z: 0 }, body.landingSite]) {
    system.step(1 / 60, position);
    assert.equal(entry.group.scale.x, 1, "altitude must not resize the world");
    assert.equal(entry.surfaceMesh.scale.x, 0.98, "fallback must remain beneath the authored crust");
  }
  system.scene.updateMatrixWorld(true);
  const terrain: THREE.Mesh[] = [];
  entry.highDetail!.traverse(node => { if (node instanceof THREE.Mesh && (node.material as THREE.Material).name === "Planet") terrain.push(node); });
  assert.ok(terrain.length);
  for (const normal of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)]) {
    const ray = new THREE.Raycaster(new THREE.Vector3().copy(body.position).addScaledVector(normal, body.radius + 5), normal.clone().negate());
    const hit = ray.intersectObjects(terrain, true)[0];
    assert.ok(hit && hit.distance >= 5 - 1e-4 && hit.distance < 6.1, "authored terrain must render within 1.1m of spherical landing contact");
    assert.equal(hit.object.visible, true);
    const backup = ray.intersectObject(entry.surfaceMesh)[0];
    assert.ok(!backup || backup.distance > hit.distance, "fallback cannot cover the terrain");
  }
});
