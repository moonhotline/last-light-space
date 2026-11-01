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

export interface AssetLoadRequest<T = any> {
  id: string;
  url?: string;
  priority?: number; // Higher number = higher priority
  load?: () => Promise<T>;
  onLoad?: (asset: T) => void;
  onError?: (err: any) => void;
}

export class LazyAssetScheduler {
  private queue: AssetLoadRequest[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private inFlight = new Map<string, Promise<any>>();
  loadedAssets = new Set<string>();
  failedAssets = new Set<string>();

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  requestAsset<T = any>(req: AssetLoadRequest<T>): Promise<T> {
    const priority = req.priority ?? 0;
    // 1. If already loaded, immediately notify and resolve
    if (this.loadedAssets.has(req.id)) {
      if (req.onLoad) req.onLoad(undefined as any);
      return Promise.resolve(undefined as any);
    }

    // 2. If already in flight, attach callbacks to the existing in-flight Promise
    if (this.inFlight.has(req.id)) {
      const promise = this.inFlight.get(req.id)!;
      return promise.then((res) => {
        if (req.onLoad) req.onLoad(res);
        return res;
      }).catch((err) => {
        if (req.onError) req.onError(err);
        throw err;
      });
    }

    // 3. Queue the request or upgrade priority if already queued
    return new Promise<T>((resolve, reject) => {
      const internalReq: AssetLoadRequest = {
        ...req,
        priority,
        onLoad: (res) => {
          if (req.onLoad) req.onLoad(res);
          resolve(res);
        },
        onError: (err) => {
          if (req.onError) req.onError(err);
          reject(err);
        },
      };

      const existing = this.queue.find((r) => r.id === req.id);
      if (existing) {
        if (priority > (existing.priority ?? 0)) {
          existing.priority = priority;
          this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        }
        const origOnLoad = existing.onLoad;
        const origOnError = existing.onError;
        existing.onLoad = (res) => {
          if (origOnLoad) origOnLoad(res);
          internalReq.onLoad!(res);
        };
        existing.onError = (err) => {
          if (origOnError) origOnError(err);
          internalReq.onError!(err);
        };
      } else {
        this.queue.push(internalReq);
        this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      }

      this.pump();
    });
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;

      this.activeCount++;
      let promise: Promise<any>;
      try {
        promise = Promise.resolve(next.load ? next.load() : undefined);
      } catch (err) {
        promise = Promise.reject(err);
      }
      this.inFlight.set(next.id, promise);

      promise
        .then((result) => {
          this.loadedAssets.add(next.id);
          this.failedAssets.delete(next.id);
          if (next.onLoad) next.onLoad(result);
        })
        .catch((err) => {
          this.failedAssets.add(next.id);
          if (next.onError) next.onError(err);
        })
        .finally(() => {
          this.inFlight.delete(next.id);
          this.activeCount--;
          this.pump();
        });
    }
  }

  isLoaded(id: string): boolean {
    return this.loadedAssets.has(id);
  }

  isInFlight(id: string): boolean {
    return this.inFlight.has(id);
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get currentActiveCount(): number {
    return this.activeCount;
  }
}
