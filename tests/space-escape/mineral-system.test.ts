import test from "node:test";
import assert from "node:assert/strict";
import { MineralSystem } from "../../frontend/space-escape/shared/mineral-system";

test("MineralSystem detects mineral resonance pulses inversely proportional to distance", () => {
  const system = new MineralSystem();
  // Calcite is at (-35, 19, 120)
  const hits = system.scan({ x: -35, y: 19, z: 125 }, 100);
  assert.ok(hits.length > 0);
  assert.equal(hits[0].specimen.id, "calcite");
  assert.ok(hits[0].distance < 6);
  assert.ok(hits[0].resonanceIntensity > 0.9);
  assert.ok(hits[0].audioPitch > 1.0);
});

test("MineralSystem validates extraction distance and Mohs hardness threshold", () => {
  const system = new MineralSystem();
  // Amethyst has Mohs hardness 7.0, located at (-180, 75, -160)
  const depositId = "dep_amethyst";
  const playerClose = { x: -180, y: 75, z: -162 };

  // Tool with hardness 4.0 should fail on Amethyst (Mohs 7.0)
  const weakToolResult = system.extract(playerClose, depositId, 4.0);
  assert.equal(weakToolResult.success, false);
  assert.ok(weakToolResult.reason?.includes("insufficient"));

  // Tool with hardness 8.0 extracts Amethyst successfully
  const strongToolResult = system.extract(playerClose, depositId, 8.0);
  assert.equal(strongToolResult.success, true);
  assert.equal(strongToolResult.xpEarned, 250);
  assert.equal(system.totalXp, 250);
  assert.ok(system.collectedSamples.has("amethyst"));

  // Second extraction attempt fails
  const repeat = system.extract(playerClose, depositId, 8.0);
  assert.equal(repeat.success, false);
});
