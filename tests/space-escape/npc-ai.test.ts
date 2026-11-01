import test from "node:test";
import assert from "node:assert/strict";
import { SteeringSystem, TacticalNPCAgent } from "../../frontend/space-escape/shared/npc-ai";

test("SteeringSystem seek directs agent towards target", () => {
  const pos = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const target = { x: 10, y: 0, z: 0 };
  const force = SteeringSystem.seek(pos, vel, target, 5, 10);
  assert.ok(force.x > 0, "Seek force along X should be positive towards target");
  assert.equal(force.y, 0);
  assert.equal(force.z, 0);
});

test("SteeringSystem arrive decelerates when entering slowing radius", () => {
  const posClose = { x: 9.5, y: 0, z: 0 };
  const vel = { x: 5, y: 0, z: 0 };
  const target = { x: 10, y: 0, z: 0 };
  const forceFar = SteeringSystem.arrive({ x: 0, y: 0, z: 0 }, vel, target, 10, 5, 15);
  const forceClose = SteeringSystem.arrive(posClose, vel, target, 10, 5, 15);
  assert.ok(forceFar.x > forceClose.x, "Force far from target should exceed braking force close to target");
});

test("SteeringSystem avoids obstacles in forward path", () => {
  const pos = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 5 }; // Moving along +Z
  const obstacles = [{ x: 0, y: 0, z: 6, radius: 1.5 }];
  const avoid = SteeringSystem.avoidObstacles(pos, vel, obstacles, 10, 8);
  assert.ok(avoid.x !== 0, "Avoidance should exert lateral force away from obstacle center");
});

test("TacticalNPCAgent transitions from follow to combat when enemy approaches", () => {
  const agent = new TacticalNPCAgent("blerk", "Blerk", "friendly", { x: 0, y: 0, z: 0 });
  agent.leaderTarget = { x: 5, y: 0, z: 0 };
  agent.update(0.1);
  assert.equal(agent.state, "follow", "Should be in follow state when leader exists");

  // Enemy enters detection sphere
  agent.enemyTarget = { x: 10, y: 0, z: 0 };
  agent.update(0.1);
  assert.equal(agent.state, "combat", "Should transition to combat when enemy target is nearby");

  // Health drops critically
  agent.hp = 15;
  agent.update(0.1);
  assert.equal(agent.state, "retreat", "Should transition to retreat when HP is low");
});
