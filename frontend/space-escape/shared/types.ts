import type { Vec } from "./map";
import type { Inventory, ItemId } from "./adventure-data";
import type { SpaceshipKind } from "./celestial";
import type { PortalAction, PortalColor, PortalPair } from "./portals";
export const DT = 1 / 30;
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = [
  { css: "#b0edff", hex: 0x9eeafa },
  { css: "#ffd397", hex: 0xffc98b },
  { css: "#ffa994", hex: 0xff9f81 },
  { css: "#bbc5ff", hex: 0xa6baff },
] as const;
export const fuelCapacity = (level: number) => (level >= 1 ? 150 : 100);
export type Phase = "lobby" | "active" | "won";
export interface FighterRecall {
  caller: string;
  phase: "lift" | "approach" | "land";
  landing: Vec;
  cruiseY: number;
  expires: number;
}
export interface ShipMotionContext {
  kind?: SpaceshipKind;
  yaw?: number;
  pitch?: number;
  bank?: number;
  flightRotation?: { x: number; y: number; z: number; w: number };
}
export interface ShipMotionResult extends Vec {
  frontalCollision: boolean;
  collided: boolean;
  normal?: Vec;
  impactRatio?: number;
}
export interface PhysicsQueries {
  aim(p: Player, range: number, minDistance?: number): Vec | null;
  visible(a: Vec, b: Vec): boolean;
  reset(id: string, p: Vec): void;
  shipMotion(a: Vec, delta: Vec, ctx?: ShipMotionContext): ShipMotionResult;
  homeSurfaceHeight(x: number, z: number): number | null;
}
export interface SimulationHost {
  s: Snapshot;
  physics: PhysicsQueries;
  queues: Map<string, Input[]>;
  player(id: string): Player | undefined;
  emit(message: string): void;
  respawn(p: Player): void;
}
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
  grapple: boolean;
  fire: boolean;
  brake: boolean;
  skate?: boolean;
  warpUntil?: number;
  placePortal?: PortalColor;
  portalAction?: PortalAction;
  portalTransit?: number;
}
export type PortalFeedback = {
  id: number;
} & (
  | { kind: "placed"; color: PortalColor; origin: Vec; end: Vec }
  | { kind: "blocked" | "undo" }
);
export interface Player extends Vec {
  planet: string | null;
  surfaceRotation: { x: number; y: number; z: number; w: number };
  id: string;
  name: string;
  color: number;
  yaw: number;
  pitch: number;
  ack: number;
  portalTransit?: number;
  portalFeedback?: PortalFeedback;
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
  grapple: Vec | null;
  grappleHeld: boolean;
  grappleId: number;
  inventory: Inventory;
  health: number;
  damageId: number;
  toolCooldown: number;
  shotId: number;
  shotEnd: Vec;
  shotOrigin?: Vec;
  shotImpact?: boolean;
  hitKind: string;
  interactHeld: boolean;
  lore: number;
  seat: number;
  invulnerable: number;
  skate?: boolean;
  trickScore?: number;
  ollieUntil?: number;
}
export interface Beacon extends Vec {
  id: number;
  name: string;
  subtitle: string;
  active: boolean;
  progress: number;
  activatedAt: number;
}
export interface ResourceNode extends Vec {
  id: number;
  item: ItemId;
  amount: number;
  hp: number;
  readyAt: number;
  hitId: number;
}
export interface Drone extends Vec {
  id: number;
  hp: number;
  yaw: number;
  target: string;
  mode: "patrol" | "charge" | "fire" | "stunned" | "dead";
  timer: number;
  hitId: number;
  shotId: number;
  aim: Vec;
}
export interface AdventureShip extends Vec {
  kind?: SpaceshipKind;
  flightRotation?: { x: number; y: number; z: number; w: number };
  yaw: number;
  yawVelocity?: number;
  pitch?: number;
  vx: number;
  vy: number;
  vz: number;
  bank: number;
  repaired: boolean;
  progress: number;
  cargo: Inventory;
  seats: string[];
  grounded: boolean;
  thrust: number;
  throttle?: number;
  boostPulse?: number;
  flightTime: number;
  arrived: boolean;
  boosting?: boolean;
  braking?: boolean;
  warpUntil?: number;
  collisionId?: number;
  collisionIntensity?: number;
  recall?: FighterRecall;
}
export type Ship = AdventureShip;
export interface Adventure {
  lore: number[];
  nodes: ResourceNode[];
  drones: Drone[];
  ship: AdventureShip;
  completeAt: number;
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
  adventure: Adventure;
  portals?: PortalPair;
  lastPortalColor?: PortalColor;
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
  grapple: false,
  fire: false,
  brake: false,
  skate: false,
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
    portalAction: v.portalAction === "fire" || v.portalAction === "undo" ? v.portalAction : undefined,
    placePortal: v.placePortal === "blue" || v.placePortal === "orange" ? v.placePortal : undefined,
    portalTransit: typeof v.portalTransit === "number" && Number.isSafeInteger(v.portalTransit) && v.portalTransit >= 0
      ? v.portalTransit : undefined,
    warpUntil: typeof v.warpUntil === "number" && Number.isFinite(v.warpUntil) && v.warpUntil >= 0 ? v.warpUntil : 0,
    forward: Math.max(-1, Math.min(1, v.forward as number)),
    side: Math.max(-1, Math.min(1, v.side as number)),
    yaw: (v.yaw as number) % (Math.PI * 2),
    pitch: Math.max(-1.4, Math.min(1.4, v.pitch as number)),
    sprint: v.sprint === true,
    jump: v.jump === true,
    jet: v.jet === true,
    dash: v.dash === true,
    interact: v.interact === true,
    grapple: v.grapple === true,
    fire: v.fire === true,
    brake: v.brake === true,
    skate: v.skate === true,
  };
}
