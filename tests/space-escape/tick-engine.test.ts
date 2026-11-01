import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotInterpolator } from "../../frontend/space-escape/shared/tick-engine";

test("SnapshotInterpolator performs smooth Hermite spline interpolation between snapshots", () => {
  const interpolator = new SnapshotInterpolator(16, 50);

  // Push two frames: t=0 and t=100
  interpolator.push({
    seq: 1,
    timestamp: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 10, y: 0, z: 0 },
    yaw: 0,
  });
  interpolator.push({
    seq: 2,
    timestamp: 100,
    pos: { x: 10, y: 0, z: 0 },
    vel: { x: 10, y: 0, z: 0 },
    yaw: 0.5,
  });

  // Evaluate at renderTime=100 (which targets t=50 with 50ms delay)
  const result = interpolator.evaluate(100);
  assert.ok(result);
  assert.equal(result.extrapolated, false);
  // Midpoint x should be approximately 5.0
  assert.ok(Math.abs(result.pos.x - 5.0) < 0.2);
  assert.ok(Math.abs(result.yaw - 0.25) < 0.05);
});

test("SnapshotInterpolator extrapolates using velocity when target time exceeds latest packet", () => {
  const interpolator = new SnapshotInterpolator(16, 0);

  interpolator.push({
    seq: 1,
    timestamp: 100,
    pos: { x: 10, y: 0, z: 0 },
    vel: { x: 20, y: 0, z: 0 },
    yaw: 0,
  });

  // Target 100ms in the future
  const result = interpolator.evaluate(200);
  assert.ok(result);
  assert.equal(result.extrapolated, true);
  // Extrapolated x: 10 + 20 * 0.1s = 12.0
  assert.ok(Math.abs(result.pos.x - 12.0) < 0.01);
});
