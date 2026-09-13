import type { Vec } from "./map";
export const DT = 1 / 30;
export type Phase = "lobby" | "active" | "won";
export interface Input {
  seq: number;
  forward: number;
  side: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  jump: boolean;
  jet: boolean;
  dash: boolean;
  interact: boolean;
}
export interface Player extends Vec {
  id: string;
  name: string;
  color: number;
  yaw: number;
  pitch: number;
  ack: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  fuel: number;
  level: number;
  crystals: number;
  combo: number;
  comboUntil: number;
  dashCooldown: number;
  dashTime: number;
  jumpHeld: boolean;
  dashHeld: boolean;
  jetting: boolean;
  landing: number;
  landingId: number;
  travel: number;
  checkpoint: number;
  respawns: number;
}
export interface Beacon extends Vec {
  id: number;
  name: string;
  subtitle: string;
  active: boolean;
  progress: number;
  activatedAt: number;
}
export interface Snapshot {
  phase: Phase;
  tick: number;
  time: number;
  seed: number;
  host: string;
  players: Player[];
  beacons: Beacon[];
  crystals: (Vec & { id: number; readyAt: number })[];
  markers: (Vec & { owner: string; until: number })[];
  earthAt: number;
  completedAt: number;
  event: string;
  eventId: number;
}
export const idleInput = (seq = 0): Input => ({
  seq,
  forward: 0,
  side: 0,
  yaw: 0,
  pitch: 0,
  sprint: false,
  jump: false,
  jet: false,
  dash: false,
  interact: false,
});
export function parseInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (
    !["seq", "forward", "side", "yaw", "pitch"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    )
  )
    return null;
  if (!Number.isSafeInteger(v.seq) || (v.seq as number) < 0) return null;
  return {
    seq: v.seq as number,
    forward: Math.max(-1, Math.min(1, v.forward as number)),
    side: Math.max(-1, Math.min(1, v.side as number)),
    yaw: (v.yaw as number) % (Math.PI * 2),
    pitch: Math.max(-1.4, Math.min(1.4, v.pitch as number)),
    sprint: v.sprint === true,
    jump: v.jump === true,
    jet: v.jet === true,
    dash: v.dash === true,
    interact: v.interact === true,
  };
}
