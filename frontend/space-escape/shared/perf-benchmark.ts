/**
 * High-Frequency Simulation & Physics P99 Performance Benchmark Engine.
 * Pure mathematical benchmark harness measuring tick duration, percentile latency,
 * jitter, and throughput under heavy stress workloads.
 */

export interface LatencyReport {
  iterations: number;
  totalTimeMs: number;
  meanUs: number;
  minUs: number;
  maxUs: number;
  p50Us: number;
  p90Us: number;
  p95Us: number;
  p99Us: number;
  p999Us: number;
  jitterUs: number;
  opsPerSecond: number;
}

export class HighFrequencyBenchmark {
  /**
   * Run a benchmark workload for `iterations` iterations, measuring high-resolution
   * duration (in microseconds) for each step.
   */
  static run(iterations: number, workload: (i: number) => void): LatencyReport {
    // Warmup pass
    const warmupCount = Math.min(100, Math.floor(iterations * 0.05));
    for (let i = 0; i < warmupCount; i++) {
      workload(i);
    }

    const samplesUs = new Float64Array(iterations);
    const startTotal = performance.now();

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      workload(i);
      const t1 = performance.now();
      samplesUs[i] = (t1 - t0) * 1000; // convert ms to microseconds
    }

    const endTotal = performance.now();
    const totalTimeMs = endTotal - startTotal;

    // Sort to compute accurate percentiles
    samplesUs.sort();

    const minUs = samplesUs[0];
    const maxUs = samplesUs[iterations - 1];

    let sumUs = 0;
    for (let i = 0; i < iterations; i++) {
      sumUs += samplesUs[i];
    }
    const meanUs = sumUs / iterations;

    // Standard deviation (Jitter)
    let varianceSum = 0;
    for (let i = 0; i < iterations; i++) {
      const diff = samplesUs[i] - meanUs;
      varianceSum += diff * diff;
    }
    const jitterUs = Math.sqrt(varianceSum / iterations);

    const percentile = (p: number): number => {
      const index = Math.min(iterations - 1, Math.max(0, Math.floor(iterations * p)));
      return samplesUs[index];
    };

    const p50Us = percentile(0.5);
    const p90Us = percentile(0.9);
    const p95Us = percentile(0.95);
    const p99Us = percentile(0.99);
    const p999Us = percentile(0.999);

    const opsPerSecond = totalTimeMs > 0 ? (iterations / totalTimeMs) * 1000 : 0;

    return {
      iterations,
      totalTimeMs,
      meanUs,
      minUs,
      maxUs,
      p50Us,
      p90Us,
      p95Us,
      p99Us,
      p999Us,
      jitterUs,
      opsPerSecond,
    };
  }
}
