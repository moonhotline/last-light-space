import test from "node:test";
import assert from "node:assert/strict";
import { MultiPlanetaryExpedition } from "../../frontend/space-escape/shared/expedition";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";

test("MultiPlanetaryExpedition registers NPC companion and handles seat boarding", () => {
  const expedition = new MultiPlanetaryExpedition(SOLAR_SYSTEM.kepler);
  const blerk = expedition.registerCompanion("blerk", "Blerk Guide", "blerk", { x: 10, y: 15, z: 20 });

  assert.equal(blerk.status, "wandering");
  expedition.setCompanionFollowing("blerk", true);
  assert.equal(blerk.status, "following");

  // Board companion into ship seat #1
  const boarded = expedition.boardCompanion("blerk", 1);
  assert.equal(boarded, true);
  assert.equal(blerk.status, "boarded");
  assert.equal(blerk.seatIndex, 1);

  // Another companion cannot take the same seat
  expedition.registerCompanion("alien_scout", "Scout", "friendly", { x: 0, y: 0, z: 0 });
  const conflict = expedition.boardCompanion("alien_scout", 1);
  assert.equal(conflict, false);
});

test("MultiPlanetaryExpedition executes full interplanetary flight and disembarks companions on Mercury", () => {
  const expedition = new MultiPlanetaryExpedition(SOLAR_SYSTEM.kepler);
  expedition.registerCompanion("blerk", "Blerk", "blerk", { x: 0, y: 0, z: 0 });
  expedition.boardCompanion("blerk", 0);

  const launched = expedition.launchExpedition(SOLAR_SYSTEM.mercury);
  assert.equal(launched, true);
  assert.equal(expedition.phase, "orbital_ascent");

  expedition.advanceFlightPhase("deep_space_cruise");
  assert.equal(expedition.phase, "deep_space_cruise");

  expedition.advanceFlightPhase("planetary_descent");
  assert.equal(expedition.phase, "planetary_descent");

  // Touchdown on alien planet surface
  expedition.advanceFlightPhase("alien_surface_exploration");
  assert.equal(expedition.phase, "alien_surface_exploration");
  assert.equal(expedition.currentPlanet.id, "mercury");

  const blerk = expedition.crew.get("blerk")!;
  assert.equal(blerk.status, "exploring", "Blerk should automatically disembark onto Mercury surface");
  assert.equal(blerk.seatIndex, -1);
  assert.ok(Math.hypot(blerk.pos.x - SOLAR_SYSTEM.mercury.landingSite.x, blerk.pos.z - SOLAR_SYSTEM.mercury.landingSite.z) < 10);
});
