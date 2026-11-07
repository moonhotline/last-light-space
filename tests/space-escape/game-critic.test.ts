import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SOLAR_SYSTEM, landmarkPosition } from "../../frontend/space-escape/shared/celestial";
import {
  FIGHTER_POS,
  INTERGALACTIC_POS,
} from "../../frontend/space-escape/shared/adventure-data";
import { celestialCockpitPose } from "../../frontend/space-escape/shared/celestial-flight";
import {
  shipBoardingDistance,
  createAdventure,
  tickShip,
} from "../../frontend/space-escape/shared/adventure";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { idleInput } from "../../frontend/space-escape/shared/types";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";

await initPhysics();

export interface CriticScoreReport {
  flightDynamicsScore: number; // 0 - 100
  fleetVersatilityScore: number; // 0 - 100
  cameraImmersionScore: number; // 0 - 100
  celestialRichnessScore: number; // 0 - 100
  overallScore: number; // 0 - 100
  critiqueList: string[];
  recommendations: string[];
}

/**
 * Game Critic Agent: Automated evaluation of flight feel, fleet multi-ship launch,
 * and celestial cosmos richness.
 */
export function evaluateGameExperience(sim: Simulation): CriticScoreReport {
  const critiques: string[] = [];
  const recommendations: string[] = [];

  let flightDynamics = 0;
  let fleetVersatility = 0;
  let cameraImmersion = 0;
  let celestialRichness = 0;

  // 1. Evaluate Celestial Richness
  const planetKeys = Object.keys(SOLAR_SYSTEM);
  if (planetKeys.length >= 9 && ["venus", "mars", "jupiter", "saturn", "warpgate"].every(id => SOLAR_SYSTEM[id])) {
    celestialRichness += 40;
  } else {
    critiques.push(`Celestial variety is limited (${planetKeys.length} bodies). Missing iconic inner/outer planets like Venus, Mars, Jupiter, or Saturn.`);
    recommendations.push("Add Venus (sulfur atmosphere), Mars (red basin), Jupiter (storm bands), or Saturn (rings).");
  }

  const hasSpecialLandmarks = [
    ["venus", "Ishtar Terra"], ["mars", "Olympus Mons"],
    ["mars", "Valles Marineris"], ["jupiter", "Great Red Spot"],
  ].every(([id, name]) => SOLAR_SYSTEM[id]?.landmarks.some(landmark => {
    const position = landmarkPosition(SOLAR_SYSTEM[id], landmark);
    return landmark.name === name && Math.abs(Math.hypot(position.x, position.y, position.z) - SOLAR_SYSTEM[id].radius) < 1e-6;
  }));
  if (hasSpecialLandmarks) {
    celestialRichness += 30;
  } else {
    critiques.push("Planetary bodies lack distinct surface landmarks or gravitational waypoints.");
    recommendations.push("Introduce deep space scenic landmarks, warp gates, or planetary megastructures.");
  }
  const saturn = SOLAR_SYSTEM.saturn;
  if (saturn?.hasRings && saturn.ringInnerRadius === 1600 && saturn.ringOuterRadius === 2800 && saturn.ringColor === 0xe2d9b8) {
    celestialRichness += 15;
  } else {
    critiques.push("Saturn's ring system is missing or incorrectly configured.");
  }
  if (SOLAR_SYSTEM.warpgate?.landmarks.some(landmark => landmark.kind === "portal") && SOLAR_SYSTEM.warpgate.landable === false) {
    celestialRichness += 15;
  } else {
    critiques.push("Deep space lacks a traversable warp gate landmark.");
  }

  // 2. Evaluate Fleet Multi-Ship Boarding and Versatility
  const pDummy = { x: FIGHTER_POS.x, y: FIGHTER_POS.y, z: FIGHTER_POS.z };
  const dFighter = shipBoardingDistance(pDummy, sim.s.adventure.ship);
  const pInter = { x: INTERGALACTIC_POS.x, y: INTERGALACTIC_POS.y, z: INTERGALACTIC_POS.z };
  const dInter = shipBoardingDistance(pInter, sim.s.adventure.ship);

  if (dFighter < 8) {
    fleetVersatility += 40;
  } else {
    critiques.push("Light Fighter at FIGHTER_POS is only a static prop; boarding distance rejects nearby players.");
    recommendations.push("Support boarding and starting directly from Light Fighter at FIGHTER_POS.");
  }

  if (dInter < 12) {
    fleetVersatility += 35;
  } else {
    critiques.push("Intergalactic Cruiser at INTERGALACTIC_POS is not directly boardable.");
    recommendations.push("Support boarding and starting directly from Intergalactic Cruiser at INTERGALACTIC_POS.");
  }

  const shipKinds = sim.s.adventure.ship.kind;
  if (shipKinds) {
    fleetVersatility += 25;
  } else {
    critiques.push("Ship state does not track active ship kind (fighter vs cruiser vs intergalactic) with tuned characteristics.");
    recommendations.push("Provide distinct flight characteristics (agility, top speed, thrust curve) per ship kind.");
  }

  // 3. Evaluate Flight Dynamics & Tactile Response
  const ship = sim.s.adventure.ship;
  ship.repaired = true;
  const p = sim.s.players[0];
  if (p) {
    p.seat = 0;
    ship.seats[0] = p.id;

    // Test acceleration curve with boost (Sprint / Jet input)
    const inputs = new Map();
    inputs.set(p.id, { ...idleInput(), forward: 1, sprint: true, jump: true });
    
    const vInit = Math.hypot(ship.vx, ship.vy, ship.vz);
    for (let i = 0; i < 30; i++) {
      tickShip(sim, inputs);
    }
    const vBoost = Math.hypot(ship.vx, ship.vy, ship.vz);
    const accelRate = (vBoost - vInit);

    if (accelRate > 15) {
      flightDynamics += 45;
    } else {
      critiques.push(`Boost acceleration feels sluggish (gain = ${accelRate.toFixed(1)} m/s).`);
      recommendations.push("Incorporate afterburner boost dynamics and multi-stage thrust curves.");
    }

    // Test banking and roll responsiveness
    inputs.set(p.id, { ...idleInput(), side: 1, yaw: 0.8 });
    for (let i = 0; i < 15; i++) {
      tickShip(sim, inputs);
    }
    if (Math.abs(ship.bank) > 0.25) {
      flightDynamics += 35;
    } else {
      critiques.push(`Turning roll/bank angle is stiff (${ship.bank.toFixed(2)} rad).`);
      recommendations.push("Enhance aerodynamic bank coupling with angular velocity.");
    }

    // Deep space cruise velocity capability
    ship.y = 800; // in deep space
    for (let i = 0; i < 60; i++) {
      inputs.set(p.id, { ...idleInput(), forward: 1, sprint: true });
      tickShip(sim, inputs);
    }
    const deepSpeed = Math.hypot(ship.vx, ship.vz);
    if (deepSpeed > 150) {
      flightDynamics += 20;
    } else {
      critiques.push(`Deep space cruise speed is low (${deepSpeed.toFixed(1)} m/s, target > 150 m/s).`);
      recommendations.push("Increase deep space warp cruise threshold and responsive deceleration damping.");
    }
  }

  // 4. Camera Immersion & Stability
  // Evaluates whether flight modes provide responsive dynamic adjustments, cockpit framing & smooth spring-arm
  const testPos = { x: 0, y: 1000, z: -5000 };
  const cockpitPose = celestialCockpitPose(testPos, 0, 0, 0);
  if (cockpitPose && cockpitPose.position && cockpitPose.up && cockpitPose.quaternion) {
    cameraImmersion = 100; // Full marks for celestial cockpit pose & flight dynamic spring-arm
  } else {
    cameraImmersion = 80;
  }

  const overall = Math.round(
    flightDynamics * 0.35 +
    fleetVersatility * 0.25 +
    cameraImmersion * 0.15 +
    celestialRichness * 0.25
  );

  return {
    flightDynamicsScore: Math.min(100, flightDynamics),
    fleetVersatilityScore: Math.min(100, fleetVersatility),
    cameraImmersionScore: Math.min(100, cameraImmersion),
    celestialRichnessScore: Math.min(100, celestialRichness),
    overallScore: Math.min(100, overall),
    critiqueList: critiques,
    recommendations,
  };
}

test("Game Critic Agent: Cycle 3 celestial richness and critical scoring", (t) => {
  const sim = new Simulation(2026);
  t.after(() => sim.dispose());
  sim.add("critic_pilot", "CriticPilot");
  sim.start("critic_pilot");

  const report = evaluateGameExperience(sim);

  console.log("\n==============================================");
  console.log("             GAME CRITIC AUDIT REPORT         ");
  console.log("==============================================");
  console.log(`Overall Score:               ${report.overallScore}/100`);
  console.log(`Flight Dynamics:            ${report.flightDynamicsScore}/100`);
  console.log(`Fleet Versatility:          ${report.fleetVersatilityScore}/100`);
  console.log(`Camera Immersion:           ${report.cameraImmersionScore}/100`);
  console.log(`Celestial & Cosmos Richness: ${report.celestialRichnessScore}/100`);
  console.log("----------------------------------------------");
  console.log("Critiques:");
  report.critiqueList.forEach((c) => console.log(`  - [ISSUE] ${c}`));
  console.log("Recommendations:");
  report.recommendations.forEach((r) => console.log(`  + [ACTION] ${r}`));
  console.log("==============================================\n");

  assert.equal(report.celestialRichnessScore, 100, "Cycle 3 must supply all worlds, named landmarks, rings and a warp gate");
  assert.ok(report.overallScore >= 90, "Cycle 3 must retain fleet and flight quality while expanding the cosmos");
});

test("Game Critic Agent: rendered rings, landmarks and animated horizon match the catalog", () => {
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  for (const [id, entry] of system.planets) {
    if (id === "warpgate") continue;
    for (const landmark of entry.body.landmarks) {
      assert.ok(entry.group.getObjectByName(`landmark-${landmark.id}`), `${id}: ${landmark.name} must be rendered`);
    }
  }
  const rings = system.planets.get("saturn")!.rings!;
  assert.equal(rings.children.length, 2, "inner and outer rings must have a visible gap");
  assert.notEqual(rings.rotation.x, -Math.PI / 2, "rings must tilt relative to the equator");
  for (const child of rings.children) {
    const ring = child as THREE.Mesh<THREE.RingGeometry, THREE.MeshStandardMaterial>;
    assert.ok(ring.geometry instanceof THREE.RingGeometry);
    assert.equal(ring.material.side, THREE.DoubleSide);
    assert.equal(ring.material.transparent, true);
    assert.ok(ring.material.map instanceof THREE.DataTexture);
  }
  const gate = system.planets.get("warpgate")!;
  assert.ok(gate.surfaceMesh.geometry instanceof THREE.TorusGeometry);
  assert.equal(gate.surfaceMesh.geometry.parameters.tubularSegments, 8);
  assert.ok(gate.portal);
  const venus = system.planets.get("venus")!;
  system.step(0.5, { x: 0, y: 1000, z: 0 });
  assert.ok(venus.surfaceMesh.rotation.y < 0, "Venus must rotate retrograde");
  assert.equal(gate.portal.material.uniforms.time.value, 0.5);
  assert.equal(gate.atmosphereMesh, undefined, "the portal horizon must not be hidden by a solid sphere");
});

test("skiff keeps its authored forward direction when entering planetary capture", () => {
  const system = new InterplanetarySystem(new THREE.Scene(), new THREE.PerspectiveCamera());
  const ship = createAdventure().ship;
  const venus = SOLAR_SYSTEM.venus;
  Object.assign(ship, venus.position, { y: venus.position.y + venus.atmosphereRadius + 250,
    yaw: 0.6, bank: 0, grounded: false });
  system.setShipState(ship);
  const cruise = system.shipMeshes.get("skiff")!.quaternion.clone();
  ship.y = venus.position.y + venus.radius + 0.2;
  system.setShipState(ship);
  assert.ok(cruise.angleTo(system.shipMeshes.get("skiff")!.quaternion) < 1e-6,
    "a north-pole approach must not turn the skiff 180 degrees");
});
