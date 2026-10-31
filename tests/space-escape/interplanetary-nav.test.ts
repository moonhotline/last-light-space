import test from "node:test";
import assert from "node:assert/strict";
import { InterplanetaryNavigator, ShipAutopilot } from "../../frontend/space-escape/shared/interplanetary-nav";
import { SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";

test("computeHohmannTransfer calculates orbital deltaV and non-zero transit time", () => {
  const result = InterplanetaryNavigator.computeHohmannTransfer(SOLAR_SYSTEM.kepler, SOLAR_SYSTEM.mercury);
  assert.ok(result.deltaV1 > 0, "Departure deltaV must be positive");
  assert.ok(result.deltaV2 > 0, "Arrival deltaV must be positive");
  assert.ok(result.totalDeltaV > 0, "Total deltaV must be positive");
  assert.ok(result.transitTimeSeconds > 0, "Transit time must be positive");
  assert.ok(result.semiMajorAxis > 0);
});

test("generateFlightPath produces sequenced waypoints from Kepler to Mercury landing site", () => {
  const path = InterplanetaryNavigator.generateFlightPath(SOLAR_SYSTEM.kepler, SOLAR_SYSTEM.mercury, 6);
  assert.equal(path.length, 6);
  assert.equal(path[0].stage, "ascent");
  assert.equal(path[path.length - 1].stage, "descent");
  const finalWp = path[path.length - 1];
  assert.deepEqual(finalWp.pos, SOLAR_SYSTEM.mercury.landingSite);
});

test("ShipAutopilot tracks flight path and completes voyage", () => {
  const pilot = new ShipAutopilot(SOLAR_SYSTEM.kepler.position);
  pilot.engageFlightPlan(SOLAR_SYSTEM.kepler, SOLAR_SYSTEM.mercury);
  assert.equal(pilot.stage, "takeoff");

  // Step simulation forward until ship arrives at destination
  for (let i = 0; i < 200; i++) {
    pilot.update(1.0);
    if (pilot.stage === "docked") break;
  }

  assert.equal(pilot.stage, "docked", "Autopilot should finish at docked landing site");
  assert.equal(pilot.throttle, 0);
});
