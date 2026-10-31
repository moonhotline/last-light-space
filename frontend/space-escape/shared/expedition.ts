/**
 * Multi-Planetary Expedition & NPC Companion Seating Manager.
 * Enables explorers to recruit NPC companions, board spaceships together,
 * transit across interplanetary space, and deploy onto alien planetary surfaces.
 */

import { SOLAR_SYSTEM, type CelestialBody, type Vec3 } from "./celestial";

export type CompanionStatus = "wandering" | "following" | "boarded" | "exploring";

export interface CompanionCrewMember {
  id: string;
  name: string;
  archetypeId: string;
  status: CompanionStatus;
  seatIndex: number; // 0 = copilot, 1,2 = passengers, -1 = unseated
  pos: Vec3;
}

export type ExpeditionPhase =
  | "ground_prep"
  | "boarding"
  | "orbital_ascent"
  | "deep_space_cruise"
  | "planetary_descent"
  | "alien_surface_exploration";

export class MultiPlanetaryExpedition {
  originPlanet: CelestialBody;
  currentPlanet: CelestialBody;
  destinationPlanet: CelestialBody | null = null;
  phase: ExpeditionPhase = "ground_prep";

  crew: Map<string, CompanionCrewMember> = new Map();
  maxSeats = 4;
  discoveredSites: Set<string> = new Set();

  constructor(startingPlanet: CelestialBody = SOLAR_SYSTEM.kepler) {
    this.originPlanet = startingPlanet;
    this.currentPlanet = startingPlanet;
  }

  registerCompanion(id: string, name: string, archetypeId: string, initialPos: Vec3): CompanionCrewMember {
    const member: CompanionCrewMember = {
      id,
      name,
      archetypeId,
      status: "wandering",
      seatIndex: -1,
      pos: { ...initialPos },
    };
    this.crew.set(id, member);
    return member;
  }

  setCompanionFollowing(id: string, following: boolean): boolean {
    const member = this.crew.get(id);
    if (!member || member.status === "boarded") return false;
    member.status = following ? "following" : "wandering";
    return true;
  }

  boardCompanion(id: string, seatIndex: number): boolean {
    const member = this.crew.get(id);
    if (!member) return false;
    if (seatIndex < 0 || seatIndex >= this.maxSeats) return false;

    // Check seat availability
    for (const [, other] of this.crew) {
      if (other.seatIndex === seatIndex) return false;
    }

    member.status = "boarded";
    member.seatIndex = seatIndex;
    return true;
  }

  disembarkCompanion(id: string, surfacePos: Vec3): boolean {
    const member = this.crew.get(id);
    if (!member || member.status !== "boarded") return false;

    member.status = "exploring";
    member.seatIndex = -1;
    member.pos = { ...surfacePos };
    return true;
  }

  launchExpedition(destination: CelestialBody): boolean {
    if (this.phase !== "ground_prep" && this.phase !== "alien_surface_exploration") {
      return false;
    }
    this.destinationPlanet = destination;
    this.phase = "orbital_ascent";
    return true;
  }

  advanceFlightPhase(next: ExpeditionPhase): void {
    this.phase = next;
    if (next === "alien_surface_exploration" && this.destinationPlanet) {
      this.currentPlanet = this.destinationPlanet;
      // Automatically disembark all boarded companions at the new planet's landing site
      const site = this.destinationPlanet.landingSite;
      for (const [, member] of this.crew) {
        if (member.status === "boarded") {
          this.disembarkCompanion(member.id, {
            x: site.x + (member.seatIndex + 1) * 2,
            y: site.y,
            z: site.z + (member.seatIndex + 1) * 2,
          });
        }
      }
    }
  }

  recordDiscovery(landmarkId: string): void {
    this.discoveredSites.add(landmarkId);
  }
}
