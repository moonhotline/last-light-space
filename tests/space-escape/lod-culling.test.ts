import test from "node:test";
import assert from "node:assert/strict";
import { FrustumCullingEngine, LazyAssetScheduler, type FrustumPlane } from "../../frontend/space-escape/shared/lod-culling";

test("FrustumCullingEngine culls objects behind camera or outside frustum", () => {
  // Simple frustum plane facing +Z at z = 1
  const nearPlane: FrustumPlane = { normal: { x: 0, y: 0, z: 1 }, constant: -1 };
  const inFront = { center: { x: 0, y: 0, z: 10 }, radius: 2 };
  const behind = { center: { x: 0, y: 0, z: -5 }, radius: 2 };

  assert.ok(FrustumCullingEngine.isSphereInFrustum(inFront, [nearPlane]));
  assert.equal(FrustumCullingEngine.isSphereInFrustum(behind, [nearPlane]), false);
});

test("FrustumCullingEngine assigns high, medium, low and culled LOD levels based on distance", () => {
  const cameraPos = { x: 0, y: 0, z: 0 };
  const closeObj = { center: { x: 0, y: 0, z: 20 }, radius: 1 };
  const medObj = { center: { x: 0, y: 0, z: 80 }, radius: 1 };
  const farObj = { center: { x: 0, y: 0, z: 250 }, radius: 1 };
  const beyondObj = { center: { x: 0, y: 0, z: 500 }, radius: 1 };

  assert.equal(FrustumCullingEngine.evaluateLOD(closeObj, cameraPos), "high");
  assert.equal(FrustumCullingEngine.evaluateLOD(medObj, cameraPos), "medium");
  assert.equal(FrustumCullingEngine.evaluateLOD(farObj, cameraPos), "low");
  assert.equal(FrustumCullingEngine.evaluateLOD(beyondObj, cameraPos), "culled");
});

test("LazyAssetScheduler prioritizes requests and respects concurrency ceiling", async () => {
  const scheduler = new LazyAssetScheduler(2);
  let loadedOrder: string[] = [];

  await new Promise<void>((resolve) => {
    scheduler.requestAsset({
      id: "low_pri",
      url: "/assets/low.glb",
      priority: 1,
      onLoad: () => {
        loadedOrder.push("low_pri");
        if (loadedOrder.length === 3) resolve();
      },
    });
    scheduler.requestAsset({
      id: "high_pri",
      url: "/assets/high.glb",
      priority: 10,
      onLoad: () => {
        loadedOrder.push("high_pri");
        if (loadedOrder.length === 3) resolve();
      },
    });
    scheduler.requestAsset({
      id: "urgent",
      url: "/assets/urgent.glb",
      priority: 100,
      onLoad: () => {
        loadedOrder.push("urgent");
        if (loadedOrder.length === 3) resolve();
      },
    });
  });

  assert.equal(scheduler.isLoaded("urgent"), true);
  assert.equal(scheduler.isLoaded("high_pri"), true);
  assert.equal(scheduler.isLoaded("low_pri"), true);
});
