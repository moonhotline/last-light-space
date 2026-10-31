import test from "node:test";
import assert from "node:assert/strict";
import { Scene, PerspectiveCamera, Vector3 } from "three";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { groundAt, SPAWN } from "../../frontend/space-escape/shared/map";

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

test("InterplanetarySystem hides systemGroup on surface and culls off-screen entities with camera frustum", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 10, 0);
  camera.lookAt(0, 10, 100); // looking toward +Z
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const system = new InterplanetarySystem(scene, camera);
  const floor = groundAt(SPAWN.x, SPAWN.z);

  // Surface mode: systemGroup must be hidden so procedural 3D planets do not pollute skybox
  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.flightMode, "surface");
  assert.equal(system.systemGroup.visible, false, "systemGroup must be hidden during surface flightMode");

  // Setup NPC model in front of camera (+Z)
  const npcInFront = system["makePlaceholder"]("npc", 2);
  npcInFront.position.set(0, 10, 50);
  system.guideModel = npcInFront;
  scene.add(npcInFront);

  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.guideModel.visible, true, "NPC inside camera frustum must be visible");

  // Move camera to look in opposite direction (-Z)
  camera.lookAt(0, 10, -100);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  system.step(1 / 30, { ...SPAWN, y: floor + 0.85 });
  assert.equal(system.guideModel.visible, false, "NPC outside camera frustum must be culled (visible = false)");

  // Deep space cruise mode: systemGroup must be visible
  system.step(1 / 30, { ...SPAWN, y: floor + 700 });
  assert.equal(system.flightMode, "cruise");
  assert.equal(system.systemGroup.visible, true, "systemGroup must be visible in cruise mode");
});
