import test from "node:test";
import assert from "node:assert/strict";
import { HighFrequencyBenchmark } from "../../frontend/space-escape/shared/perf-benchmark";
import { SteeringSystem, TacticalNPCAgent } from "../../frontend/space-escape/shared/npc-ai";
import { InterplanetaryNavigator, ShipAutopilot } from "../../frontend/space-escape/shared/interplanetary-nav";
import { SOLAR_SYSTEM, computeAtmosphericFog } from "../../frontend/space-escape/shared/celestial";
import { FrustumCullingEngine, LazyAssetScheduler } from "../../frontend/space-escape/shared/lod-culling";
import { MultiPlanetaryExpedition } from "../../frontend/space-escape/shared/expedition";
import { EntityWorld } from "../../frontend/space-escape/shared/entity-system";
import { MineralSystem } from "../../frontend/space-escape/shared/mineral-system";
import { SnapshotInterpolator } from "../../frontend/space-escape/shared/tick-engine";

test("Full-Stack Interplanetary Expedition & Multi-Agent P99 Benchmark Audit", () => {
  // 1. Initialize world & systems
  const world = new EntityWorld();
  const expedition = new MultiPlanetaryExpedition(SOLAR_SYSTEM.kepler);
  const mineralSystem = new MineralSystem();
  const interpolator = new SnapshotInterpolator(32, 40);

  // 2. Setup player ship entity
  const shipEntity = world.createEntity("cruiser_alpha");
  shipEntity.add({
    type: "Transform",
    pos: { ...SOLAR_SYSTEM.kepler.position },
    rot: { yaw: 0, pitch: 0, roll: 0 },
    scale: 1.0,
  });
  shipEntity.add({
    type: "Physics",
    vel: { x: 0, y: 0, z: 0 },
    mass: 5000,
    useGravity: false,
    isGrounded: false,
  });
  shipEntity.add({
    type: "Render",
    modelKey: "intergalactic",
    lodLevel: "high",
    visible: true,
    boundingRadius: 18.0,
  });

  // 3. Recruit NPC companion (Blerk) and board spaceship
  const blerk = expedition.registerCompanion("blerk", "Blerk (Guide)", "blerk", SOLAR_SYSTEM.kepler.position);
  expedition.setCompanionFollowing("blerk", true);
  const boarded = expedition.boardCompanion("blerk", 0);
  assert.equal(boarded, true, "Blerk must successfully board seat 0");

  // 4. Setup enemy NPC agent
  const alienPredator = new TacticalNPCAgent("alien1", "Crawler", "hostile", { x: 165, y: 35, z: -85 });

  // 5. Engage flight plan to Mercury
  const autopilot = new ShipAutopilot(SOLAR_SYSTEM.kepler.position);
  autopilot.engageFlightPlan(SOLAR_SYSTEM.kepler, SOLAR_SYSTEM.mercury);
  expedition.launchExpedition(SOLAR_SYSTEM.mercury);

  // 6. High-Frequency Benchmark Loop measuring P99 across all subsystems
  let simTime = 0;
  const tickCount = 2000;

  const report = HighFrequencyBenchmark.run(tickCount, (i) => {
    const dt = 0.05;
    simTime += dt * 1000;

    // A. Step Autopilot navigation & spaceship physics
    autopilot.update(dt);
    const shipTransform = shipEntity.get<any>("Transform");
    shipTransform.pos.x = autopilot.shipPos.x;
    shipTransform.pos.y = autopilot.shipPos.y;
    shipTransform.pos.z = autopilot.shipPos.z;

    // B. Record snapshot into ring buffer
    interpolator.push({
      seq: i,
      timestamp: simTime,
      pos: { ...shipTransform.pos },
      vel: { ...autopilot.shipVel },
      yaw: autopilot.yaw,
    });

    // C. Evaluate smoothed render position
    interpolator.evaluate(simTime);

    // D. Step Tactical AI
    alienPredator.update(dt, [{ x: 165, y: 35, z: -70, radius: 2 }]);

    // E. Dynamic Atmospheric Fog evaluation
    const fog = computeAtmosphericFog(shipTransform.pos.y);
    assert.ok(fog.density > 0);

    // F. LOD Frustum evaluation
    world.updateLOD(shipTransform.pos);
  });

  // 7. Verify P99 Latency & Performance SLA
  assert.equal(report.iterations, tickCount);
  assert.ok(report.p99Us < 2500, `P99 latency must be under 2.5ms (2500us), actual: ${report.p99Us}us`);
  assert.ok(report.meanUs < 500, `Mean tick time must be sub-millisecond, actual: ${report.meanUs}us`);
  assert.ok(report.opsPerSecond > 2000, `Throughput must exceed 2000 ticks/sec, actual: ${report.opsPerSecond} ops/sec`);

  // 8. Verify Expedition Arrival & Automatic Disembarkation on Mercury
  expedition.advanceFlightPhase("alien_surface_exploration");
  assert.equal(expedition.currentPlanet.id, "mercury");
  assert.equal(blerk.status, "exploring", "Companion should be exploring on target planet");
  assert.equal(blerk.seatIndex, -1);
});
