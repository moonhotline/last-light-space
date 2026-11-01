/**
 * Advanced Autonomous Steering Behaviors & Tactical Decision-Tree AI for NPCs.
 * Implements Reynolds Steering (Seek, Flee, Arrive, Wander, Obstacle Avoidance, Leader Follow)
 * and hierarchical tactical state transitions for planetary companions and alien fauna.
 */

import type { Vec3 } from "./celestial";

export interface SteeringForce {
  x: number;
  y: number;
  z: number;
}

export type NPCTacticalState = "idle" | "patrol" | "follow" | "alert" | "combat" | "retreat";

export interface Obstacle {
  x: number;
  y: number;
  z: number;
  radius: number;
}

function length(v: SteeringForce): number {
  return Math.hypot(v.x, v.y, v.z) || 1e-6;
}

function normalize(v: SteeringForce): SteeringForce {
  const len = length(v);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function truncate(v: SteeringForce, max: number): SteeringForce {
  const len = length(v);
  if (len > max) {
    const factor = max / len;
    return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
  }
  return v;
}

export class SteeringSystem {
  /** Seek: Direct acceleration towards a target location */
  static seek(pos: Vec3, vel: Vec3, target: Vec3, maxSpeed: number, maxForce: number): SteeringForce {
    const desired = {
      x: target.x - pos.x,
      y: target.y - pos.y,
      z: target.z - pos.z,
    };
    const desiredNorm = normalize(desired);
    const desiredVel = {
      x: desiredNorm.x * maxSpeed,
      y: desiredNorm.y * maxSpeed,
      z: desiredNorm.z * maxSpeed,
    };
    const steer = {
      x: desiredVel.x - vel.x,
      y: desiredVel.y - vel.y,
      z: desiredVel.z - vel.z,
    };
    return truncate(steer, maxForce);
  }

  /** Flee: Acceleration away from a threat */
  static flee(pos: Vec3, vel: Vec3, threat: Vec3, maxSpeed: number, maxForce: number): SteeringForce {
    const desired = {
      x: pos.x - threat.x,
      y: pos.y - threat.y,
      z: pos.z - threat.z,
    };
    const desiredNorm = normalize(desired);
    const desiredVel = {
      x: desiredNorm.x * maxSpeed,
      y: desiredNorm.y * maxSpeed,
      z: desiredNorm.z * maxSpeed,
    };
    const steer = {
      x: desiredVel.x - vel.x,
      y: desiredVel.y - vel.y,
      z: desiredVel.z - vel.z,
    };
    return truncate(steer, maxForce);
  }

  /** Arrive: Smooth deceleration as NPC approaches target radius */
  static arrive(
    pos: Vec3,
    vel: Vec3,
    target: Vec3,
    maxSpeed: number,
    slowingRadius: number,
    maxForce: number,
  ): SteeringForce {
    const toTarget = {
      x: target.x - pos.x,
      y: target.y - pos.y,
      z: target.z - pos.z,
    };
    const dist = length(toTarget);
    if (dist < 0.05) return { x: -vel.x, y: -vel.y, z: -vel.z };

    let targetSpeed = maxSpeed;
    if (dist < slowingRadius) {
      targetSpeed = maxSpeed * (dist / slowingRadius);
    }
    const desiredNorm = normalize(toTarget);
    const desiredVel = {
      x: desiredNorm.x * targetSpeed,
      y: desiredNorm.y * targetSpeed,
      z: desiredNorm.z * targetSpeed,
    };
    const steer = {
      x: desiredVel.x - vel.x,
      y: desiredVel.y - vel.y,
      z: desiredVel.z - vel.z,
    };
    return truncate(steer, maxForce);
  }

  /** Leader Follow: Follows behind a leader with offset, arriving smoothly */
  static leaderFollow(
    pos: Vec3,
    vel: Vec3,
    leaderPos: Vec3,
    leaderVel: Vec3,
    followDistance: number,
    maxSpeed: number,
    maxForce: number,
  ): SteeringForce {
    const leaderSpeed = length(leaderVel);
    const behindNorm = leaderSpeed > 0.1 ? normalize({ x: -leaderVel.x, y: -leaderVel.y, z: -leaderVel.z }) : { x: 0, y: 0, z: 1 };
    const target = {
      x: leaderPos.x + behindNorm.x * followDistance,
      y: leaderPos.y + behindNorm.y * followDistance,
      z: leaderPos.z + behindNorm.z * followDistance,
    };
    return this.arrive(pos, vel, target, maxSpeed, followDistance * 1.5, maxForce);
  }

  /** Obstacle Avoidance: Lateral force to circumvent spherical/cylindrical obstacles */
  static avoidObstacles(
    pos: Vec3,
    vel: Vec3,
    obstacles: Obstacle[],
    lookAheadDist: number,
    maxForce: number,
  ): SteeringForce {
    const speed = length(vel);
    if (speed < 0.1) return { x: 0, y: 0, z: 0 };
    const forward = normalize(vel);

    let mostThreatening: Obstacle | null = null;
    let closestDist = Infinity;

    for (const obs of obstacles) {
      const toObs = { x: obs.x - pos.x, y: obs.y - pos.y, z: obs.z - pos.z };
      const proj = toObs.x * forward.x + toObs.y * forward.y + toObs.z * forward.z;
      if (proj > 0 && proj < lookAheadDist) {
        const perpDist = Math.hypot(
          toObs.x - forward.x * proj,
          toObs.y - forward.y * proj,
          toObs.z - forward.z * proj,
        );
        if (perpDist < obs.radius + 1.2 && proj < closestDist) {
          closestDist = proj;
          mostThreatening = obs;
        }
      }
    }

    if (!mostThreatening) return { x: 0, y: 0, z: 0 };

    const toObs = {
      x: mostThreatening.x - pos.x,
      y: mostThreatening.y - pos.y,
      z: mostThreatening.z - pos.z,
    };
    let lateral = {
      x: forward.x * closestDist - toObs.x,
      y: forward.y * closestDist - toObs.y,
      z: forward.z * closestDist - toObs.z,
    };
    // If obstacle is dead-ahead, provide a deterministic lateral evasion vector
    if (Math.hypot(lateral.x, lateral.y, lateral.z) < 1e-4) {
      lateral = Math.abs(forward.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
    }
    return truncate(normalize(lateral), maxForce);
  }
}

export class TacticalNPCAgent {
  id: string;
  name: string;
  faction: "friendly" | "hostile";
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  maxHp = 100;
  hp = 100;
  maxSpeed = 8.0;
  maxForce = 12.0;

  state: NPCTacticalState = "idle";
  waypoints: Vec3[] = [];
  waypointIndex = 0;

  leaderTarget: Vec3 | null = null;
  leaderVel: Vec3 = { x: 0, y: 0, z: 0 };
  enemyTarget: Vec3 | null = null;

  shootCooldown = 0;

  constructor(id: string, name: string, faction: "friendly" | "hostile", pos: Vec3) {
    this.id = id;
    this.name = name;
    this.faction = faction;
    this.pos = { ...pos };
  }

  update(dt: number, obstacles: Obstacle[] = []): void {
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    // Tactical Decision Tree
    if (this.hp <= this.maxHp * 0.25 && this.enemyTarget) {
      this.state = "retreat";
    } else if (this.enemyTarget && Math.hypot(this.enemyTarget.x - this.pos.x, this.enemyTarget.z - this.pos.z) < 35) {
      this.state = "combat";
    } else if (this.leaderTarget) {
      this.state = "follow";
    } else if (this.waypoints.length > 0) {
      this.state = "patrol";
    } else {
      this.state = "idle";
    }

    let steering: SteeringForce = { x: 0, y: 0, z: 0 };

    switch (this.state) {
      case "retreat":
        if (this.enemyTarget) {
          steering = SteeringSystem.flee(this.pos, this.vel, this.enemyTarget, this.maxSpeed * 1.2, this.maxForce);
        }
        break;
      case "combat":
        if (this.enemyTarget) {
          const dist = Math.hypot(this.enemyTarget.x - this.pos.x, this.enemyTarget.z - this.pos.z);
          if (dist > 12) {
            steering = SteeringSystem.arrive(this.pos, this.vel, this.enemyTarget, this.maxSpeed, 14, this.maxForce);
          } else {
            // Keep combat distance
            steering = { x: -this.vel.x * 0.8, y: -this.vel.y * 0.8, z: -this.vel.z * 0.8 };
          }
        }
        break;
      case "follow":
        if (this.leaderTarget) {
          steering = SteeringSystem.leaderFollow(
            this.pos,
            this.vel,
            this.leaderTarget,
            this.leaderVel,
            3.5,
            this.maxSpeed,
            this.maxForce,
          );
        }
        break;
      case "patrol":
        if (this.waypoints.length > 0) {
          const wp = this.waypoints[this.waypointIndex];
          const dist = Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z);
          if (dist < 2.0) {
            this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
          }
          steering = SteeringSystem.arrive(this.pos, this.vel, wp, this.maxSpeed, 6.0, this.maxForce);
        }
        break;
      case "idle":
      default:
        steering = { x: -this.vel.x * 3.0, y: -this.vel.y * 3.0, z: -this.vel.z * 3.0 };
        break;
    }

    // Apply obstacle avoidance blend
    const avoidForce = SteeringSystem.avoidObstacles(this.pos, this.vel, obstacles, 10.0, this.maxForce * 1.5);
    steering.x += avoidForce.x * 1.8;
    steering.y += avoidForce.y * 1.8;
    steering.z += avoidForce.z * 1.8;

    // Euler integration
    this.vel.x += steering.x * dt;
    this.vel.y += steering.y * dt;
    this.vel.z += steering.z * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.1) {
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
    }
  }
}
