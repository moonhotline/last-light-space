import test from "node:test";
import assert from "node:assert/strict";
import { Scene, PerspectiveCamera, Vector3 } from "three";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { groundAt, SPAWN } from "../../frontend/space-escape/shared/map";
import { SHIP_HOME } from "../../frontend/space-escape/shared/adventure-data";

test("planet surface and atmosphere share elevated global coordinates", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  for (const [id, planet] of system.planets) {
    assert.deepEqual(planet.group.position.toArray(), Object.values(SOLAR_SYSTEM[id].position));
    assert.equal(planet.surfaceMesh.parent, planet.group);
    const atmosphere = planet.atmosphereMesh;
    assert.ok(atmosphere);
    assert.equal(atmosphere.position.length(), 0);
  }
});

test("raising decorative Kepler does not put basin players in cruise mode", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  const floor = groundAt(SPAWN.x, SPAWN.z);
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.flightMode, "surface");
  assert.ok(system.flightAltitude < 1);
  system.step(1 / 30, { ...SPAWN, y: floor + 700 });
  assert.equal(system.flightMode, "cruise");
  assert.equal(system.flightAltitude, 700);
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.flightMode, "surface");
  const kepler = SOLAR_SYSTEM.kepler;
  system.step(1 / 30, { ...kepler.landingSite, planet: "kepler" });
  assert.equal(system.flightAltitude, 1, "spherical Kepler walkers retain radial altitude");
  assert.equal(system.flightMode, "surface");
  system.currentPlanet = "earth";
  const earth = SOLAR_SYSTEM.earth;
  system.step(1 / 30, new Vector3().copy(earth.position).add(new Vector3(0, earth.radius + 400, 0)));
  assert.equal(system.flightMode, "cruise");
  assert.equal(system.flightAltitude, 400);
});

test("Mercury surfaceMesh possesses visible cosmic emissive glow against deep space", () => {
  const system = new InterplanetarySystem(new Scene(), new PerspectiveCamera());
  const mercury = system.planets.get("mercury");
  assert.ok(mercury);
  const mat = mercury.surfaceMesh.material as any;
  assert.ok(mat.emissiveIntensity >= 0.2, "Mercury must possess positive emissive intensity");
  assert.equal(mercury.surfaceMesh.visible, true);
});

test("Blerk equips hoverboard and activates repulsor surfing when following at speed", () => {
  const scene = new Scene();
  const system = new InterplanetarySystem(scene, new PerspectiveCamera());
  const placeholder = system["makePlaceholder"]("npc", 2.2);
  system.guideModel = placeholder;
  scene.add(placeholder);

  const hoverboard = system.attachBlerkHoverboard();
  assert.ok(hoverboard);
  assert.equal(hoverboard.name, "blerk-hoverboard");
  assert.equal(hoverboard.parent, placeholder);
  assert.equal(hoverboard.visible, false);

  // Trigger follow update: distance > 4 triggers run & hoverboard surfing
  system.guideFollowing = true;
  system.step(0.1, new Vector3(100, 20, 335));
  assert.equal(hoverboard.visible, true, "Hoverboard should deploy when Blerk is running/surfing");
  assert.ok(system.guideModel.position.y > groundAt(system.guideModel.position.x, system.guideModel.position.z) + 1.2);

  // Trigger idle update: close distance
  system.step(0.1, new Vector3(system.guideModel.position.x + 1, 20, system.guideModel.position.z));
  assert.equal(hoverboard.visible, false, "Hoverboard should stow when Blerk is idle");
});

test("InterplanetarySystem preserves all planets and docks spaceship at starting position with frustum culling", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 10000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 10, 100); // looking toward +Z
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const system = new InterplanetarySystem(scene, camera);
  const floor = groundAt(SPAWN.x, SPAWN.z);

  // Kepler and other planets are NOT deleted or hidden; systemGroup remains active
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.systemGroup.visible, true, "systemGroup and planetary bodies must be preserved");
  assert.ok(system.planets.has("kepler"), "Kepler planet must exist");
  assert.ok(system.planets.has("earth"), "Earth planet must exist");
  assert.ok(system.planets.has("mercury"), "Mercury planet must exist");
  assert.ok(system.planets.has("stylized"), "Stylized planet must exist");

  // Spaceship is docked at starting position SHIP_HOME
  const ship = system.shipMeshes.get("light_fighter");
  assert.ok(ship, "Spaceship model must exist");
  assert.equal(ship.position.x, SHIP_HOME.x, "Ship x coordinate must match SHIP_HOME starting position");
  assert.equal(ship.position.z, SHIP_HOME.z, "Ship z coordinate must match SHIP_HOME starting position");

  // Camera pointing at SHIP_HOME starting position
  camera.lookAt(SHIP_HOME.x, SHIP_HOME.y, SHIP_HOME.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(ship.visible, true, "Spaceship in front of camera must be visible at starting position");

  // Camera looking in opposite direction culls the spaceship
  camera.lookAt(-SHIP_HOME.x, SHIP_HOME.y, -SHIP_HOME.z);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(ship.visible, false, "Spaceship outside camera frustum must be culled");
});
