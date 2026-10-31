import test from "node:test";
import { terrainMesh } from "../../frontend/space-escape/shared/map";
import assert from "node:assert/strict";
import {
  SOLAR_SYSTEM,
  MINERAL_SAMPLES,
  ALIEN_ROSTER,
  sphericalGravity,
  projectToSphere,
  computeAtmosphericFog,
} from "../../frontend/space-escape/shared/celestial";

test("spherical gravity always directs acceleration towards planet center", () => {
  const kepler = SOLAR_SYSTEM.kepler;
  // Test position at top of sphere
  const topPos = { x: kepler.position.x, y: kepler.position.y + kepler.radius + 10, z: kepler.position.z };
  const topG = sphericalGravity(topPos, kepler);
  assert.ok(topG.gravityVec.y < 0, "Gravity at top should pull down along -y");
  assert.equal(Math.round(topG.altitude), 10);

  // Test position at side of sphere (x > 0)
  const sidePos = { x: kepler.position.x + kepler.radius + 20, y: kepler.position.y, z: kepler.position.z };
  const sideG = sphericalGravity(sidePos, kepler);
  assert.ok(sideG.gravityVec.x < 0, "Gravity at +x side should pull back towards -x center");
  assert.equal(Math.round(sideG.altitude), 20);

  // Test position at bottom of sphere (y < 0) - Columbus 'world is round'
  const bottomPos = { x: kepler.position.x, y: kepler.position.y - (kepler.radius + 5), z: kepler.position.z };
  const bottomG = sphericalGravity(bottomPos, kepler);
  assert.ok(bottomG.gravityVec.y > 0, "Gravity at antipodal bottom must pull upwards towards center");
  assert.equal(Math.round(bottomG.altitude), 5);
});

test("projectToSphere constrains coordinates onto spherical crust without seams", () => {
  const mercury = SOLAR_SYSTEM.mercury;
  const arbitraryPoint = {
    x: mercury.position.x + 500,
    y: mercury.position.y - 300,
    z: mercury.position.z + 400,
  };
  const projected = projectToSphere(arbitraryPoint, mercury, 2.5);
  const dx = projected.x - mercury.position.x;
  const dy = projected.y - mercury.position.y;
  const dz = projected.z - mercury.position.z;
  const radius = Math.hypot(dx, dy, dz);
  assert.ok(Math.abs(radius - (mercury.radius + 2.5)) < 0.01);
});

test("solar system contains key planetary destinations", () => {
  assert.ok(SOLAR_SYSTEM.kepler, "Must have home planet Kepler");
  assert.ok(SOLAR_SYSTEM.mercury, "Must have Mercury replacing Moon");
  assert.ok(SOLAR_SYSTEM.earth, "Must have Earth");
  assert.ok(SOLAR_SYSTEM.stylized, "Must have Stylized Verdant Planet");
  assert.ok(SOLAR_SYSTEM.earth.radius > SOLAR_SYSTEM.mercury.radius);
});

test("computeAtmosphericFog scales density inversely with space altitude", () => {
  const groundFog = computeAtmosphericFog(50);
  const orbitFog = computeAtmosphericFog(1200);
  assert.ok(groundFog.density > orbitFog.density, "Ground fog must be denser than space vacuum haze");
  assert.equal(groundFog.color, 0x0c141d);
  assert.equal(orbitFog.color, 0x020408);
});

test("alien fauna roster differentiates friendly guides from hostile predators", () => {
  assert.equal(ALIEN_ROSTER.blerk.faction, "friendly");
  assert.equal(ALIEN_ROSTER.another_alien.faction, "hostile");
  assert.equal(ALIEN_ROSTER.reptillian_alien.faction, "hostile");
  assert.ok(ALIEN_ROSTER.reptillian_alien.attackDamage > 0);
});

test("elevated Kepler atmosphere clears the basin and landing site stays on its crust", () => {
  const body = SOLAR_SYSTEM.kepler;
  assert.deepEqual(body.position, { x: 0, y: 1800, z: 340 });
  const vertices = terrainMesh().vertices;
  let highestTerrain = -Infinity;
  for (let index = 1; index < vertices.length; index += 3) {
    highestTerrain = Math.max(highestTerrain, vertices[index]);
  }
  assert.ok(body.position.y - body.atmosphereRadius > highestTerrain);
  assert.equal(sphericalGravity(body.landingSite, body).altitude, 1);
  assert.deepEqual(projectToSphere(body.landingSite, body, 1), body.landingSite);
});
