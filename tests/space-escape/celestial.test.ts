import test from "node:test";
import assert from "node:assert/strict";
import {
  SOLAR_SYSTEM,
  MINERAL_SAMPLES,
  ALIEN_ROSTER,
  sphericalGravity,
  projectToSphere,
} from "../../frontend/space-escape/shared/celestial";

test("spherical gravity always directs acceleration towards planet center", () => {
  const kepler = SOLAR_SYSTEM.kepler;
  // Test position at top of sphere
  const topPos = { x: 0, y: kepler.radius + 10, z: 0 };
  const topG = sphericalGravity(topPos, kepler);
  assert.ok(topG.gravityVec.y < 0, "Gravity at top should pull down along -y");
  assert.equal(Math.round(topG.altitude), 10);

  // Test position at side of sphere (x > 0)
  const sidePos = { x: kepler.radius + 20, y: 0, z: 0 };
  const sideG = sphericalGravity(sidePos, kepler);
  assert.ok(sideG.gravityVec.x < 0, "Gravity at +x side should pull back towards -x center");
  assert.equal(Math.round(sideG.altitude), 20);

  // Test position at bottom of sphere (y < 0) - Columbus 'world is round'
  const bottomPos = { x: 0, y: -(kepler.radius + 5), z: 0 };
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

test("mineral specimen catalog provides geological properties", () => {
  const calcite = MINERAL_SAMPLES.calcite;
  assert.equal(calcite.formula, "CaCO₃");
  assert.equal(calcite.hardness, 3.0);
  assert.ok(MINERAL_SAMPLES.pyrite);
  assert.ok(MINERAL_SAMPLES.amethyst);
  assert.ok(MINERAL_SAMPLES.celestite);
});

test("alien fauna roster differentiates friendly guides from hostile predators", () => {
  assert.equal(ALIEN_ROSTER.blerk.faction, "friendly");
  assert.equal(ALIEN_ROSTER.another_alien.faction, "hostile");
  assert.equal(ALIEN_ROSTER.reptillian_alien.faction, "hostile");
  assert.ok(ALIEN_ROSTER.reptillian_alien.attackDamage > 0);
});
