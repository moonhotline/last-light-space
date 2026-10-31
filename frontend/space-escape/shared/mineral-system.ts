/**
 * Geological Mineral Resonance Scanning & Planetary Expedition Log.
 * Based on authentic geological specimens (Slovenian Natural History Museum catalog).
 * Simulates ionic resonance wave detection, Mohs hardness validation, and expedition milestones.
 */

import { MINERAL_SAMPLES, type MineralSpecimen, type Vec3 } from "./celestial";

export interface MineralDepositNode {
  id: string;
  specimenId: string;
  pos: Vec3;
  harvested: boolean;
}

export interface ResonanceScanHit {
  depositId: string;
  specimen: MineralSpecimen;
  distance: number;
  resonanceIntensity: number; // 0..1 (1 = close resonance pulse)
  audioPitch: number; // Audio frequency multiplier
}

export class MineralSystem {
  deposits: Map<string, MineralDepositNode> = new Map();
  collectedSamples: Set<string> = new Set();
  totalXp = 0;

  constructor() {
    this.seedDefaultDeposits();
  }

  seedDefaultDeposits(): void {
    const defaultSites: MineralDepositNode[] = [
      { id: "dep_calcite", specimenId: "calcite", pos: { x: -35, y: 19, z: 120 }, harvested: false },
      { id: "dep_pyrite", specimenId: "pyrite", pos: { x: 145, y: 38, z: -40 }, harvested: false },
      { id: "dep_amethyst", specimenId: "amethyst", pos: { x: -180, y: 75, z: -160 }, harvested: false },
      { id: "dep_celestite", specimenId: "celestite", pos: { x: 80, y: 24, z: 290 }, harvested: false },
    ];
    for (const site of defaultSites) {
      this.deposits.set(site.id, site);
    }
  }

  scan(playerPos: Vec3, scanRadius = 150): ResonanceScanHit[] {
    const hits: ResonanceScanHit[] = [];

    for (const [, dep] of this.deposits) {
      if (dep.harvested) continue;
      const spec = MINERAL_SAMPLES[dep.specimenId];
      if (!spec) continue;

      const dist = Math.hypot(
        dep.pos.x - playerPos.x,
        dep.pos.y - playerPos.y,
        dep.pos.z - playerPos.z,
      );

      if (dist <= scanRadius) {
        const intensity = Math.max(0, 1 - dist / scanRadius);
        // Higher hardness emits higher frequency resonance pitch
        const pitch = 0.8 + (spec.hardness / 10) * 0.8 + intensity * 0.4;
        hits.push({
          depositId: dep.id,
          specimen: spec,
          distance: dist,
          resonanceIntensity: intensity,
          audioPitch: pitch,
        });
      }
    }

    return hits.sort((a, b) => b.resonanceIntensity - a.resonanceIntensity);
  }

  extract(playerPos: Vec3, depositId: string, toolHardness = 7.5): { success: boolean; reason?: string; xpEarned?: number } {
    const dep = this.deposits.get(depositId);
    if (!dep) return { success: false, reason: "Deposit not found" };
    if (dep.harvested) return { success: false, reason: "Already extracted" };

    const spec = MINERAL_SAMPLES[dep.specimenId];
    if (!spec) return { success: false, reason: "Unknown mineral specimen" };

    const dist = Math.hypot(
      dep.pos.x - playerPos.x,
      dep.pos.y - playerPos.y,
      dep.pos.z - playerPos.z,
    );
    if (dist > 8.0) return { success: false, reason: "Too far from deposit" };

    if (toolHardness < spec.hardness) {
      return { success: false, reason: `Tool hardness (${toolHardness}) insufficient for ${spec.name} (Mohs ${spec.hardness})` };
    }

    dep.harvested = true;
    this.collectedSamples.add(spec.id);
    this.totalXp += spec.xpReward;

    return { success: true, xpEarned: spec.xpReward };
  }
}
