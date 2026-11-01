import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  SHIP1_POS,
  SHIP2_POS,
  SHIP_HOME,
} from "../../frontend/space-escape/shared/adventure-data";
import {
  shipBoardingDistance,
  createAdventure,
  adventurePlayer,
  interactAdventure,
  tickShip,
} from "../../frontend/space-escape/shared/adventure";
import { groundAt, distance, distance3 } from "../../frontend/space-escape/shared/map";
import { SOLAR_SYSTEM, projectToSphere } from "../../frontend/space-escape/shared/celestial";
import {
  computeChassisAlignment,
  alignShipToGround,
  computeMercuryAlignment,
  clean3DEntityText,
  mercuryGeodesicDistance,
} from "../../frontend/space-escape/src/interplanetary";
import { StardustParallaxStream } from "../../frontend/space-escape/src/scene";
import { Simulation } from "../../frontend/space-escape/shared/simulation";
import { initPhysics } from "../../frontend/space-escape/shared/physics";
import { idleInput } from "../../frontend/space-escape/shared/types";

await initPhysics();

test("dual ships parked side-by-side at spawn with 15~22m spacing and slope alignment", () => {
  // 1. Spacing check: Ship 1 (Skiff) and Ship 2 (Cruiser)
  const spacing = Math.hypot(SHIP1_POS.x - SHIP2_POS.x, SHIP1_POS.z - SHIP2_POS.z);
  assert.ok(
    spacing >= 15 && spacing <= 22,
    `Dual ships spacing must be between 15m and 22m, got ${spacing}m`,
  );
  assert.equal(spacing, 18, "Spacing is exactly 18m");

  // 2. Spawn point check: spawn is at (0, 355), ships are parked in front (z = 347, -Z forward)
  assert.ok(SHIP1_POS.z < 355 && SHIP2_POS.z < 355, "Ships must be in front of spawn");
  assert.ok(SHIP1_POS.x < 0 && SHIP2_POS.x < 0, "Both ships positioned in the staging bay area");

  // 3. Ground elevation via groundAt
  const h1 = groundAt(SHIP1_POS.x, SHIP1_POS.z);
  const h2 = groundAt(SHIP2_POS.x, SHIP2_POS.z);
  assert.equal(SHIP1_POS.y, h1, "Ship 1 y matches terrain ground elevation");
  assert.equal(SHIP2_POS.y, h2, "Ship 2 y matches terrain ground elevation");

  // 4. Chassis footprint multi-corner alignment and slope computation
  const dummyMesh = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3, 12),
    new THREE.MeshBasicMaterial(),
  );
  const align1 = computeChassisAlignment(dummyMesh, SHIP1_POS.x, SHIP1_POS.z, 0, 3, 6);
  assert.ok(align1.groundHeight >= h1 - 0.5, "Alignment ground height accounts for footprint");
  assert.ok(Number.isFinite(align1.pitch), "Pitch angle must be finite");
  assert.ok(Number.isFinite(align1.roll), "Roll angle must be finite");

  // 5. Frustum culling and shadow enablement
  alignShipToGround(dummyMesh, SHIP2_POS.x, SHIP2_POS.z, 0, 4, 8);
  assert.equal(dummyMesh.frustumCulled, true, "Ship model must have frustum culling enabled");
  dummyMesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      assert.equal(child.frustumCulled, true, "Submesh must have frustum culling enabled");
      assert.equal(child.castShadow, true, "Submesh must cast shadow");
    }
  });
});

test("clean3DEntityText strips placeholder labels, text sprites and debug markers", () => {
  const root = new THREE.Group();

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  bodyMesh.name = "ShipHull";
  root.add(bodyMesh);

  const placeholderLabel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1));
  placeholderLabel.name = "Placeholder_Cruiser_Text";
  root.add(placeholderLabel);

  const sprite = new THREE.Sprite();
  sprite.name = "ShipNameTag";
  root.add(sprite);

  const debugObj = new THREE.Group();
  debugObj.name = "debug_pivot_point";
  root.add(debugObj);

  assert.equal(root.children.length, 4);
  clean3DEntityText(root);
  assert.equal(root.children.length, 1, "Only ShipHull mesh should remain");
  assert.equal(root.children[0].name, "ShipHull");
});

test("Mercury gravitational capture aligns Up-vector to radial normal", () => {
  const merc = SOLAR_SYSTEM.mercury;
  const mercCenter = merc.position;

  // Case 1: Ship at apex of Mercury (+Y)
  const apexPos = {
    x: mercCenter.x,
    y: mercCenter.y + merc.radius + 15,
    z: mercCenter.z,
  };
  const apexAlign = computeMercuryAlignment(apexPos, 0, 0);
  assert.ok(apexAlign.captureWeight > 0.8, "Close to surface capture weight should be high");
  assert.ok(apexAlign.up.y > 0.99, "Apex normal must point +Y");

  // Case 2: Ship at +X side of Mercury
  const sidePos = {
    x: mercCenter.x + merc.radius + 20,
    y: mercCenter.y,
    z: mercCenter.z,
  };
  const sideAlign = computeMercuryAlignment(sidePos, 0, 0);
  assert.ok(sideAlign.up.x > 0.95, "Side normal must point +X along radial vector");
  assert.ok(Math.abs(sideAlign.up.y) < 0.1, "Side normal y component near 0");

  // Case 3: Ship far away outside Mercury atmosphere
  const farPos = {
    x: mercCenter.x,
    y: mercCenter.y + 1200,
    z: mercCenter.z,
  };
  const farAlign = computeMercuryAlignment(farPos, 0, 0);
  assert.equal(farAlign.captureWeight, 0, "Outside capture radius weight is 0");
  assert.equal(farAlign.up.y, 1.0, "Up vector defaults to world up (0,1,0)");

  // Case 4: Landing detection
  const landedPos = {
    x: mercCenter.x,
    y: mercCenter.y + merc.radius + 0.1,
    z: mercCenter.z,
  };
  const landedAlign = computeMercuryAlignment(landedPos, 0, 0);
  assert.equal(landedAlign.isLanded, true, "Within 0.35m of crust should be detected as landed");
});

test("Mercury spherical geodesic arc distance vs Euclidean chord distance", () => {
  const merc = SOLAR_SYSTEM.mercury; // R = 320m
  const R = merc.radius;

  // Point A at apex
  const pA = {
    x: merc.position.x,
    y: merc.position.y + R,
    z: merc.position.z,
    planet: "mercury" as const,
  };

  // Point B at angular distance deltaTheta = 0.05 rad (~16m arc)
  const theta = 0.05;
  const pB = {
    x: merc.position.x + R * Math.sin(theta),
    y: merc.position.y + R * Math.cos(theta),
    z: merc.position.z,
    planet: "mercury" as const,
  };

  const expectedArc = R * theta; // 16.0m
  const chordDist = Math.hypot(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z); // 2 * R * sin(theta / 2) ≈ 15.996m
  const geodesicDist = shipBoardingDistance(pA, pB);

  assert.ok(
    geodesicDist >= chordDist,
    "Geodesic arc distance along spherical surface must be >= Euclidean chord distance",
  );
  assert.ok(
    Math.abs(geodesicDist - expectedArc) < 0.05,
    `Geodesic distance (${geodesicDist}) must match R * theta (${expectedArc})`,
  );

  // Large angle theta = 0.5 rad (160m arc vs ~158.3m chord)
  const thetaLarge = 0.5;
  const pC = {
    x: merc.position.x + R * Math.sin(thetaLarge),
    y: merc.position.y + R * Math.cos(thetaLarge),
    z: merc.position.z,
  };
  const arcLarge = R * thetaLarge; // 160.0m
  const chordLarge = Math.hypot(pA.x - pC.x, pA.y - pC.y, pA.z - pC.z);
  const geoCalc = mercuryGeodesicDistance(pA, pC);
  assert.ok(arcLarge > chordLarge + 1.5, "On high-curvature sphere, arc is noticeably longer than chord");
  assert.ok(Math.abs(geoCalc.geodesicArc - arcLarge) < 0.1);

  // Boarding threshold test on Mercury
  const nearPoint = {
    x: merc.position.x + R * Math.sin(16 / R),
    y: merc.position.y + R * Math.cos(16 / R),
    z: merc.position.z,
    planet: "mercury" as const,
  };
  const farPoint = {
    x: merc.position.x + R * Math.sin(21 / R),
    y: merc.position.y + R * Math.cos(21 / R),
    z: merc.position.z,
    planet: "mercury" as const,
  };
  assert.ok(shipBoardingDistance(nearPoint, pA) < 18, "Within 16m arc allows boarding (< 18m)");
  assert.ok(shipBoardingDistance(farPoint, pA) > 18, "21m arc rejects boarding (> 18m)");
});

test("disembarking on Mercury crust and re-boarding via geodesic distance", () => {
  const sim = new Simulation(1001);
  sim.add("pilot", "Explorer");
  sim.start("pilot");

  const p = sim.s.players[0];
  const ship = sim.s.adventure.ship;
  ship.repaired = true;
  ship.progress = 1;

  // Board the ship on Kepler
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, 0, "Pilot must board in seat 0");
  // Release E
  interactAdventure(sim, p, idleInput());

  // Move ship to Mercury surface
  const merc = SOLAR_SYSTEM.mercury;
  ship.x = merc.position.x;
  ship.y = merc.position.y + merc.radius + 0.3;
  ship.z = merc.position.z;
  ship.vx = 0;
  ship.vy = 0;
  ship.vz = 0;
  ship.grounded = true;

  // Disembark on Mercury
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, -1, "Pilot should disembark");
  assert.equal(p.planet, "mercury", "Player must be transferred to Mercury planet state");
  // Release E
  interactAdventure(sim, p, idleInput());

  // Verify player is on Mercury's spherical crust
  const distFromCenter = Math.hypot(
    p.x - merc.position.x,
    p.y - merc.position.y,
    p.z - merc.position.z,
  );
  assert.ok(
    Math.abs(distFromCenter - (merc.radius + 0.85)) < 1.0,
    "Player stands on Mercury spherical surface",
  );

  // Player re-boards from Mercury surface
  interactAdventure(sim, p, { ...idleInput(), interact: true });
  assert.equal(p.seat, 0, "Player re-boards ship from Mercury spherical surface");
  assert.equal(p.planet, null, "Planet cleared when boarding ship");
});

test("StardustParallaxStream features 3 distinct speed layers", () => {
  const stream = new StardustParallaxStream();
  assert.equal(stream.layers.length, 3, "Stream must have 3 distinct parallax layers");

  const [layer0, layer1, layer2] = stream.layers;
  assert.equal(layer0.speedMult, 1.8, "Layer 0 speed multiplier is 1.8x");
  assert.equal(layer1.speedMult, 1.0, "Layer 1 speed multiplier is 1.0x");
  assert.equal(layer2.speedMult, 0.5, "Layer 2 speed multiplier is 0.5x");

  // Verify update moves near-field particles backward
  const camPos = new THREE.Vector3(0, 50, 0);
  const camQuat = new THREE.Quaternion();
  const vel = new THREE.Vector3(0, 0, -40);

  const posAttr = layer0.points.geometry.getAttribute("position") as THREE.BufferAttribute;
  posAttr.setZ(0, -50);
  posAttr.needsUpdate = true;
  const initialZ = posAttr.getZ(0);

  stream.update(camPos, camQuat, vel, 1.0, true, 0.1);
  const updatedZ = posAttr.getZ(0);

  // Particles step forward relative to camera space (+Z step)
  assert.ok(updatedZ > initialZ, "Stardust particles stream along velocity direction");
  const expectedStep = Math.max(10, 40) * 1.8 * 0.1; // 7.2
  assert.ok(
    Math.abs((updatedZ - initialZ) - expectedStep) < 0.01,
    `Particle step must match speedFactor * 1.8 * dt (${expectedStep})`,
  );
});
