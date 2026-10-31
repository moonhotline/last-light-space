import test from "node:test";
import assert from "node:assert/strict";
import { EntityWorld } from "../../frontend/space-escape/shared/entity-system";

test("EntityWorld supports decoupled component composition and multi-component queries", () => {
  const world = new EntityWorld();

  const scoutShip = world.createEntity("scout_01");
  scoutShip.add({
    type: "Transform",
    pos: { x: 10, y: 20, z: 30 },
    rot: { yaw: 0, pitch: 0, roll: 0 },
    scale: 1.0,
  });
  scoutShip.add({
    type: "Physics",
    vel: { x: 5, y: 0, z: -5 },
    mass: 1200,
    useGravity: false,
    isGrounded: false,
  });
  scoutShip.add({
    type: "Render",
    modelKey: "fighter",
    lodLevel: "high",
    visible: true,
    boundingRadius: 6.0,
  });

  const staticBoulder = world.createEntity("boulder_01");
  staticBoulder.add({
    type: "Transform",
    pos: { x: 100, y: 0, z: 200 },
    rot: { yaw: 0, pitch: 0, roll: 0 },
    scale: 2.0,
  });
  staticBoulder.add({
    type: "Render",
    modelKey: "minerals",
    lodLevel: "low",
    visible: true,
    boundingRadius: 4.0,
  });

  // Query moving entities
  const moving = world.query("Transform", "Physics");
  assert.equal(moving.length, 1);
  assert.equal(moving[0].id, "scout_01");

  // Query all renderables
  const renderables = world.query("Transform", "Render");
  assert.equal(renderables.length, 2);

  // Step physics system
  world.updatePhysics(1.0);
  const t = scoutShip.get<any>("Transform");
  assert.equal(t.pos.x, 15);
  assert.equal(t.pos.z, 25);

  // Step LOD system with camera at origin
  world.updateLOD({ x: 0, y: 0, z: 0 });
  const shipRender = scoutShip.get<any>("Render");
  const boulderRender = staticBoulder.get<any>("Render");

  assert.equal(shipRender.lodLevel, "high"); // dist ~ 32m
  assert.equal(boulderRender.lodLevel, "low"); // dist ~ 223m
});
