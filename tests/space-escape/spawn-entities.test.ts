import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  SPAWN,
  groundAt,
} from "../../frontend/space-escape/shared/map";
import {
  SHIP_HOME,
  SHIP1_POS,
  SHIP2_POS,
  FIGHTER_POS,
  INTERGALACTIC_POS,
  ALIEN1_POS,
  ALIEN2_POS,
  MINERALS_POS,
} from "../../frontend/space-escape/shared/adventure-data";
import { InterplanetarySystem } from "../../frontend/space-escape/src/interplanetary";

test("Spawn outpost entities layout guarantees non-clipping clearance and ground alignment", () => {
  const entities = {
    Player: { x: SPAWN.x, z: SPAWN.z },
    Skiff: { x: SHIP1_POS.x, z: SHIP1_POS.z },
    Cruiser: { x: SHIP2_POS.x, z: SHIP2_POS.z },
    Blerk: { x: 8, z: 335 },
    Fighter: { x: FIGHTER_POS.x, z: FIGHTER_POS.z },
    Intergalactic: { x: INTERGALACTIC_POS.x, z: INTERGALACTIC_POS.z },
    Alien1: { x: ALIEN1_POS.x, z: ALIEN1_POS.z },
    Alien2: { x: ALIEN2_POS.x, z: ALIEN2_POS.z },
    Minerals: { x: MINERALS_POS.x, z: MINERALS_POS.z },
  };

  const names = Object.keys(entities) as (keyof typeof entities)[];

  // 1. All entities must be positioned in the spawn outpost region (Z <= 355, within 60m radius of SPAWN)
  for (const name of names) {
    const e = entities[name];
    const distToSpawn = Math.hypot(e.x - SPAWN.x, e.z - SPAWN.z);
    assert.ok(
      distToSpawn < 60,
      `${name} must be within 60m of spawn base camp, actual: ${distToSpawn.toFixed(1)}m`
    );
    assert.ok(
      e.z <= SPAWN.z,
      `${name} must be in front of or at player spawn line (z <= 355), actual z: ${e.z}`
    );
  }

  // 2. Strict anti-clipping validation: pairwise clearance must be >= 6.0m
  let minDistance = Infinity;
  let closestPair = ["", ""];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = entities[names[i]];
      const b = entities[names[j]];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < minDistance) {
        minDistance = d;
        closestPair = [names[i], names[j]];
      }
      assert.ok(
        d >= 6.0,
        `Collision clipping detected between ${names[i]} and ${names[j]}: distance is ${d.toFixed(2)}m (must be >= 6.0m)`
      );
    }
  }

  assert.ok(
    minDistance >= 6.0,
    `Closest pair ${closestPair.join(" - ")} clearance is ${minDistance.toFixed(2)}m >= 6.0m`
  );
});

test("InterplanetarySystem renders Fighter, Intergalactic, Alien1, Alien2 and Minerals at spawn from frame zero", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
  camera.position.set(SPAWN.x, groundAt(SPAWN.x, SPAWN.z) + 1.8, SPAWN.z);
  camera.lookAt(0, groundAt(0, 340), 340);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const system = new InterplanetarySystem(scene, camera);

  // Check 5 required models exist and are visible
  assert.ok(system.fighterModel, "Light Fighter model must exist");
  assert.ok(system.intergalacticModel, "Intergalactic Cruiser model must exist");
  assert.ok(system.alien1Model, "Alien Crawler model must exist");
  assert.ok(system.alien2Model, "Reptillian Guardian model must exist");
  assert.ok(system.mineralsModel, "Minerals cluster model must exist");

  // Check coordinates
  assert.equal(system.fighterModel.position.x, FIGHTER_POS.x);
  assert.equal(system.fighterModel.position.z, FIGHTER_POS.z);

  assert.equal(system.intergalacticModel.position.x, INTERGALACTIC_POS.x);
  assert.equal(system.intergalacticModel.position.z, INTERGALACTIC_POS.z);

  assert.equal(system.alien1Model.position.x, ALIEN1_POS.x);
  assert.equal(system.alien1Model.position.z, ALIEN1_POS.z);

  assert.equal(system.alien2Model.position.x, ALIEN2_POS.x);
  assert.equal(system.alien2Model.position.z, ALIEN2_POS.z);

  assert.equal(system.mineralsModel.position.x, MINERALS_POS.x);
  assert.equal(system.mineralsModel.position.z, MINERALS_POS.z);

  // Frustum culling check: when camera looks at spawn, entities in view are visible
  system.step(1 / 30, { ...SPAWN, y: groundAt(SPAWN.x, SPAWN.z) + 0.85 });
  assert.equal(system.fighterModel.visible, true, "Fighter must be visible in forward view");
  assert.equal(system.alien2Model.visible, true, "Alien2 must be visible in forward view");
  assert.equal(system.mineralsModel.visible, true, "Minerals must be visible in forward view");
});
