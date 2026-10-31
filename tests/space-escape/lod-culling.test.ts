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

test("LazyAssetScheduler prioritizes requests, respects concurrency ceiling, and deduplicates in-flight requests", async () => {
  const scheduler = new LazyAssetScheduler(1); // Strict concurrency = 1
  let peakActive = 0;
  const executionOrder: string[] = [];

  // Deferred promise helper
  type Resolver = () => void;
  const resolvers: Record<string, Resolver> = {};
  const createControlledLoad = (id: string) => {
    return () =>
      new Promise<string>((resolve) => {
        peakActive = Math.max(peakActive, scheduler.currentActiveCount);
        executionOrder.push(id);
        resolvers[id] = () => resolve(id);
      });
  };

  // Submit 3 requests with concurrency = 1
  const pLow = scheduler.requestAsset({
    id: "low_pri",
    priority: 1,
    load: createControlledLoad("low_pri"),
  });
  const pHigh = scheduler.requestAsset({
    id: "high_pri",
    priority: 10,
    load: createControlledLoad("high_pri"),
  });
  const pUrgent = scheduler.requestAsset({
    id: "urgent",
    priority: 100,
    load: createControlledLoad("urgent"),
  });

  // At this moment, low_pri was shifted first before others were queued
  assert.equal(scheduler.currentActiveCount, 1);
  assert.equal(scheduler.isLoaded("low_pri"), false);

  // Complete low_pri
  resolvers["low_pri"]();
  await pLow;
  // Let finally microtask pump next queue item
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(scheduler.isLoaded("low_pri"), true);

  // Next active task must be "urgent" due to priority 100 > 10
  assert.equal(executionOrder[1], "urgent");
  assert.equal(peakActive, 1);

  // Test deduplication: request "urgent" again while it's in flight
  let dedupeCalled = false;
  const pUrgentDedupe = scheduler.requestAsset({
    id: "urgent",
    onLoad: () => {
      dedupeCalled = true;
    },
  });

  // Complete urgent
  resolvers["urgent"]();
  const resUrgent = await pUrgent;
  await pUrgentDedupe;
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(resUrgent, "urgent");
  assert.equal(dedupeCalled, true);
  assert.equal(scheduler.isLoaded("urgent"), true);

  // Finally high_pri runs
  assert.equal(executionOrder[2], "high_pri");
  resolvers["high_pri"]();
  await pHigh;
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(scheduler.isLoaded("high_pri"), true);
  assert.equal(peakActive, 1);
});

test("LazyAssetScheduler handles load failures cleanly without blocking queue", async () => {
  const scheduler = new LazyAssetScheduler(1);
  let failedCaught = false;

  const pFail = scheduler
    .requestAsset({
      id: "failing_asset",
      load: () => Promise.reject(new Error("Network timeout")),
    })
    .catch(() => {
      failedCaught = true;
    });

  const pSuccess = scheduler.requestAsset({
    id: "subsequent_asset",
    load: () => Promise.resolve("ok"),
  });

  await Promise.all([pFail, pSuccess]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(failedCaught, true);
  assert.equal(scheduler.isLoaded("failing_asset"), false);
  assert.equal(scheduler.failedAssets.has("failing_asset"), true);
  assert.equal(scheduler.isLoaded("subsequent_asset"), true);
  assert.equal(scheduler.currentActiveCount, 0);
});
