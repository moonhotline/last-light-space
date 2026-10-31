import test from "node:test";
import assert from "node:assert/strict";
import { HighFrequencyBenchmark } from "../../frontend/space-escape/shared/perf-benchmark";
import { sphericalGravity, projectToSphere, SOLAR_SYSTEM } from "../../frontend/space-escape/shared/celestial";
import { groundAt } from "../../frontend/space-escape/shared/map";

test("benchmark engine evaluates high-frequency loop and computes accurate p99 latency", () => {
  const iterations = 5000;
  let counter = 0;

  const report = HighFrequencyBenchmark.run(iterations, (i) => {
    // Math intensive tick simulation: gravity + spherical projection + terrain sample
    const pos = { x: (i % 200) - 100, y: 120 + (i % 50), z: ((i * 7) % 300) - 150 };
    const grav = sphericalGravity(pos, SOLAR_SYSTEM.kepler);
    const spherePos = projectToSphere(pos, SOLAR_SYSTEM.kepler, 2);
    const ground = groundAt(pos.x, pos.z);
    counter += grav.gravityVec.y + spherePos.y + ground;
  });

  assert.equal(report.iterations, iterations);
  assert.ok(report.totalTimeMs > 0, "total time must be positive");
  assert.ok(report.p50Us <= report.p90Us, "p50 must be <= p90");
  assert.ok(report.p90Us <= report.p95Us, "p90 must be <= p95");
  assert.ok(report.p95Us <= report.p99Us, "p95 must be <= p99");
  assert.ok(report.p99Us <= report.maxUs, "p99 must be <= max");
  assert.ok(report.p99Us < 1000, `p99 latency should be sub-millisecond, got ${report.p99Us}us`);
  assert.ok(report.opsPerSecond > 10000, "throughput should exceed 10,000 ops/sec");
  assert.ok(Number.isFinite(counter));
});
