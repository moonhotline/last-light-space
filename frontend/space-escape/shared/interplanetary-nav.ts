/**
 * Interplanetary Flight Autopilot & Orbital Transfer Trajectory Algorithm.
 * Implements Keplerian orbital dynamics, Hohmann transfer approximations,
 * cubic spline cruise corridor generation, and automated planetary entry controllers.
 */

import type { Vec3, CelestialBody } from "./celestial";

export interface TransferOrbitResult {
  deltaV1: number; // Departure burn (m/s)
  deltaV2: number; // Insertion burn (m/s)
  totalDeltaV: number;
  transitTimeSeconds: number;
  semiMajorAxis: number;
}

export interface FlightWaypoint {
  pos: Vec3;
  targetSpeed: number;
  stage: "ascent" | "warp_cruise" | "descent";
}

export type AutopilotStage = "docked" | "takeoff" | "cruise" | "warp" | "injection" | "landing";

export class InterplanetaryNavigator {
  /**
   * Approximates Hohmann Transfer Orbit requirements between two concentric planetary orbits.
   * r1 = distance of origin planet to solar system barycenter (0,0,0)
   * r2 = distance of destination planet to solar system barycenter
   */
  static computeHohmannTransfer(
    origin: CelestialBody,
    destination: CelestialBody,
    muSolar = 1.327e7, // Standard gravitational parameter scaled for mini solar system
  ): TransferOrbitResult {
    const r1 = Math.hypot(origin.position.x, origin.position.z) || 500;
    const r2 = Math.hypot(destination.position.x, destination.position.z) || 500;

    const semiMajorAxis = (r1 + r2) / 2;

    const v1 = Math.sqrt(muSolar / r1);
    const v2 = Math.sqrt(muSolar / r2);

    const vTransfer1 = Math.sqrt(muSolar * (2 / r1 - 1 / semiMajorAxis));
    const vTransfer2 = Math.sqrt(muSolar * (2 / r2 - 1 / semiMajorAxis));

    const deltaV1 = Math.abs(vTransfer1 - v1);
    const deltaV2 = Math.abs(v2 - vTransfer2);
    const totalDeltaV = deltaV1 + deltaV2;

    const transitTimeSeconds = Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / muSolar);

    return {
      deltaV1,
      deltaV2,
      totalDeltaV,
      transitTimeSeconds,
      semiMajorAxis,
    };
  }

  /**
   * Generates a 3D smooth cruise corridor between two celestial bodies with
   * atmospheric ascent arc, warp cruise spline, and retrograde insertion deceleration.
   */
  static generateFlightPath(
    origin: CelestialBody,
    destination: CelestialBody,
    sampleCount = 10,
  ): FlightWaypoint[] {
    const waypoints: FlightWaypoint[] = [];

    // Stage 1: Ascent above atmosphere
    const startPos = {
      x: origin.position.x,
      y: origin.position.y + origin.atmosphereRadius + 50,
      z: origin.position.z,
    };
    waypoints.push({ pos: startPos, targetSpeed: 60, stage: "ascent" });

    // Stage 2: Deep space cruise waypoints
    const destArrival = {
      x: destination.position.x,
      y: destination.position.y + destination.atmosphereRadius + 80,
      z: destination.position.z,
    };

    const midApex = {
      x: (startPos.x + destArrival.x) * 0.5,
      y: Math.max(startPos.y, destArrival.y) + 400,
      z: (startPos.z + destArrival.z) * 0.5,
    };

    const midCount = Math.max(1, sampleCount - 3);
    for (let i = 1; i <= midCount; i++) {
      const t = i / (midCount + 1);
      const oneMinusT = 1 - t;
      const x = oneMinusT * oneMinusT * startPos.x + 2 * oneMinusT * t * midApex.x + t * t * destArrival.x;
      const y = oneMinusT * oneMinusT * startPos.y + 2 * oneMinusT * t * midApex.y + t * t * destArrival.y;
      const z = oneMinusT * oneMinusT * startPos.z + 2 * oneMinusT * t * midApex.z + t * t * destArrival.z;

      const speed = t > 0.2 && t < 0.8 ? 350 : 180; // Warp burst in mid-course
      waypoints.push({
        pos: { x, y, z },
        targetSpeed: speed,
        stage: "warp_cruise",
      });
    }

    // Stage 3: Planetary landing site touchdown
    waypoints.push({
      pos: destArrival,
      targetSpeed: 80,
      stage: "descent",
    });
    waypoints.push({
      pos: destination.landingSite,
      targetSpeed: 40,
      stage: "descent",
    });

    return waypoints;
  }
}

export class ShipAutopilot {
  shipPos: Vec3;
  shipVel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  pitch = 0;
  roll = 0;
  throttle = 0;

  stage: AutopilotStage = "docked";
  flightPath: FlightWaypoint[] = [];
  currentWaypointIdx = 0;
  targetPlanet: CelestialBody | null = null;

  constructor(initialPos: Vec3) {
    this.shipPos = { ...initialPos };
  }

  engageFlightPlan(origin: CelestialBody, destination: CelestialBody): void {
    this.targetPlanet = destination;
    this.flightPath = InterplanetaryNavigator.generateFlightPath(origin, destination, 8);
    this.currentWaypointIdx = 0;
    this.stage = "takeoff";
    this.throttle = 1.0;
  }

  update(dt: number): void {
    if (this.stage === "docked" || this.flightPath.length === 0) return;

    const wp = this.flightPath[this.currentWaypointIdx];
    const dx = wp.pos.x - this.shipPos.x;
    const dy = wp.pos.y - this.shipPos.y;
    const dz = wp.pos.z - this.shipPos.z;
    const distToWp = Math.hypot(dx, dy, dz);

    // Target attitude orientation
    this.yaw = Math.atan2(dx, dz);
    const horizDist = Math.hypot(dx, dz) || 1e-4;
    this.pitch = Math.atan2(dy, horizDist);

    const speed = wp.targetSpeed * this.throttle;
    const invDist = distToWp > 0.001 ? 1 / distToWp : 0;
    const step = Math.min(distToWp, speed * dt);

    this.shipVel = {
      x: dx * invDist * speed,
      y: dy * invDist * speed,
      z: dz * invDist * speed,
    };

    this.shipPos.x += dx * invDist * step;
    this.shipPos.y += dy * invDist * step;
    this.shipPos.z += dz * invDist * step;

    const isFinalWp = this.currentWaypointIdx === this.flightPath.length - 1;
    const arrivalThreshold = isFinalWp ? 1.0 : 25;

    if (distToWp <= arrivalThreshold || step >= distToWp) {
      if (isFinalWp) {
        this.shipPos = { ...wp.pos };
        this.shipVel = { x: 0, y: 0, z: 0 };
        this.stage = "docked";
        this.throttle = 0;
      } else {
        this.currentWaypointIdx++;
        const nextStage = this.flightPath[this.currentWaypointIdx].stage;
        this.stage = nextStage === "ascent" ? "takeoff" : nextStage === "warp_cruise" ? "warp" : "landing";
      }
    }
  }
}
