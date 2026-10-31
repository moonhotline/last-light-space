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
