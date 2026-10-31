/**
 * High-Rate Tick Engine & Snapshot Hermite Interpolator.
 * Features a circular ring buffer, Hermite cubic spline interpolation,
 * and dead-reckoning extrapolation for multi-agent simulation.
 */

import type { Vec3 } from "./celestial";

export interface EntitySnapshot {
  seq: number;
  timestamp: number;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
}

export class SnapshotInterpolator {
  private buffer: EntitySnapshot[] = [];
  private capacity: number;
  interpolationDelayMs: number;

  constructor(capacity = 32, interpolationDelayMs = 50) {
    this.capacity = capacity;
    this.interpolationDelayMs = interpolationDelayMs;
  }

  push(snapshot: EntitySnapshot): void {
    if (this.buffer.length > 0 && snapshot.timestamp <= this.buffer[this.buffer.length - 1].timestamp) {
      return; // Discard out-of-order or duplicate packets
    }
    this.buffer.push(snapshot);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  /**
   * Evaluates smoothed position and yaw at `renderTime` (typically currentTime - interpolationDelayMs).
   */
  evaluate(renderTime: number): { pos: Vec3; yaw: number; extrapolated: boolean } | null {
    if (this.buffer.length === 0) return null;

    const targetTime = renderTime - this.interpolationDelayMs;

    // Check if targetTime is ahead of the latest frame (Extrapolation / Dead Reckoning)
    const latest = this.buffer[this.buffer.length - 1];
    if (targetTime > latest.timestamp) {
      const dt = Math.min(0.25, (targetTime - latest.timestamp) / 1000); // Clamp max 250ms extrapolation
      return {
        pos: {
          x: latest.pos.x + latest.vel.x * dt,
          y: latest.pos.y + latest.vel.y * dt,
          z: latest.pos.z + latest.vel.z * dt,
        },
        yaw: latest.yaw,
        extrapolated: true,
      };
    }

    if (this.buffer.length === 1) {
      return { pos: { ...this.buffer[0].pos }, yaw: this.buffer[0].yaw, extrapolated: false };
    }

    // Check if targetTime is before the earliest buffered frame
    if (targetTime <= this.buffer[0].timestamp) {
      return { pos: { ...this.buffer[0].pos }, yaw: this.buffer[0].yaw, extrapolated: false };
    }

    // Binary search or linear scan for the surrounding two snapshots
    let s0: EntitySnapshot = this.buffer[0];
    let s1: EntitySnapshot = this.buffer[1];

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].timestamp <= targetTime && this.buffer[i + 1].timestamp >= targetTime) {
        s0 = this.buffer[i];
        s1 = this.buffer[i + 1];
        break;
      }
    }

    const span = s1.timestamp - s0.timestamp;
    const t = span > 0 ? (targetTime - s0.timestamp) / span : 0;

    // Cubic Hermite Interpolation
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const spanSec = span / 1000;
    const m0x = s0.vel.x * spanSec;
    const m1x = s1.vel.x * spanSec;
    const m0y = s0.vel.y * spanSec;
    const m1y = s1.vel.y * spanSec;
    const m0z = s0.vel.z * spanSec;
    const m1z = s1.vel.z * spanSec;

    const x = h00 * s0.pos.x + h10 * m0x + h01 * s1.pos.x + h11 * m1x;
    const y = h00 * s0.pos.y + h10 * m0y + h01 * s1.pos.y + h11 * m1y;
    const z = h00 * s0.pos.z + h10 * m0z + h01 * s1.pos.z + h11 * m1z;

    // Shortest-arc angle slerp for yaw
    let deltaYaw = s1.yaw - s0.yaw;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
    const yaw = s0.yaw + deltaYaw * t;

    return { pos: { x, y, z }, yaw, extrapolated: false };
  }

  get size(): number {
    return this.buffer.length;
  }
}
