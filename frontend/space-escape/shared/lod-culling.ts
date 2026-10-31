/**
 * Lazy Asset Hydration, Frustum Culling & On-Demand LOD Engine.
 * Decoupled, mathematical frustum testing and distance-based LOD scheduler.
 * Prevents network bandwidth saturation and avoids wasting GPU draw calls on off-screen assets.
 */

import type { Vec3 } from "./celestial";

export type LODLevel = "high" | "medium" | "low" | "culled";

export interface BoundingSphere {
  center: Vec3;
  radius: number;
}

export interface FrustumPlane {
  normal: Vec3;
  constant: number;
}

export interface CullingCamera {
  pos: Vec3;
  forward: Vec3;
  up: Vec3;
  right: Vec3;
  fovRad: number;
  near: number;
  far: number;
}

export class FrustumCullingEngine {
  /**
   * Evaluates signed distance from a 3D point to a plane defined by N . P + d = 0.
   */
  static distanceToPlane(point: Vec3, plane: FrustumPlane): number {
    return point.x * plane.normal.x + point.y * plane.normal.y + point.z * plane.normal.z + plane.constant;
  }

  /**
   * Tests whether a bounding sphere is inside or intersecting a set of frustum planes.
   */
  static isSphereInFrustum(sphere: BoundingSphere, planes: FrustumPlane[]): boolean {
    for (let i = 0; i < planes.length; i++) {
      const dist = this.distanceToPlane(sphere.center, planes[i]);
      if (dist < -sphere.radius) {
        return false; // Completely outside plane boundary
      }
    }
    return true;
  }

  /**
   * Determines LOD level based on camera distance and frustum visibility.
   */
  static evaluateLOD(
    sphere: BoundingSphere,
    cameraPos: Vec3,
    frustumPlanes: FrustumPlane[] = [],
    highDist = 45,
    medDist = 140,
    maxDrawDist = 400,
  ): LODLevel {
    const dist = Math.hypot(
      sphere.center.x - cameraPos.x,
      sphere.center.y - cameraPos.y,
      sphere.center.z - cameraPos.z,
    );

    if (dist > maxDrawDist) return "culled";

    if (frustumPlanes.length > 0 && !this.isSphereInFrustum(sphere, frustumPlanes)) {
      return "culled";
    }

    if (dist <= highDist) return "high";
    if (dist <= medDist) return "medium";
    return "low";
  }
}

export interface AssetLoadRequest {
  id: string;
  url: string;
  priority: number; // Higher number = higher priority
  onLoad: () => void;
}

export class LazyAssetScheduler {
  private queue: AssetLoadRequest[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  loadedAssets = new Set<string>();

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  requestAsset(req: AssetLoadRequest): void {
    if (this.loadedAssets.has(req.id)) {
      req.onLoad();
      return;
    }
    if (!this.queue.some((r) => r.id === req.id)) {
      this.queue.push(req);
      this.queue.sort((a, b) => b.priority - a.priority);
    }
    this.pump();
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;

      this.activeCount++;
      // Simulate or delegate asynchronous progressive download
      Promise.resolve().then(() => {
        this.loadedAssets.add(next.id);
        next.onLoad();
        this.activeCount--;
        this.pump();
      });
    }
  }

  isLoaded(id: string): boolean {
    return this.loadedAssets.has(id);
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
