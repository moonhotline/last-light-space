/**
 * Canonical transport-agnostic multiplayer room protocol & lifecycle manager.
 * Single Source of Truth shared by the Colyseus Node server, PartyKit worker,
 * and Cloudflare PartyServer Durable Object.
 */
import { Simulation } from "./simulation";
import { MAX_PLAYERS, type Player } from "./types";

export const ROOM_GAME_ID = "last-light";
export const ROOM_PROTOCOL_VERSION = "0.3.0";
export const ROOM_CAPACITY = MAX_PLAYERS;
export const ACTION_COOLDOWN_MS = 100;
export const MAX_CHAT_LENGTH = 150;
export const SNAPSHOT_BROADCAST_STRIDE = 2;

export const ROOM_MESSAGE_TYPES = [
  "input",
  "sync",
  "start",
  "restart",
  "action",
  "chat",
] as const;

export type RoomMessageType = (typeof ROOM_MESSAGE_TYPES)[number];

export interface RoomTransport {
  send(playerId: string, type: string, data: unknown): void;
  broadcast(type: string, data: unknown): void;
  onLock?(): void;
  onUnlock?(): void;
}

export interface RoomHealthPayload {
  ok: true;
  game: typeof ROOM_GAME_ID;
  transport?: string;
  version: typeof ROOM_PROTOCOL_VERSION;
  room?: string;
  capacity: typeof ROOM_CAPACITY;
}

export function roomHealthPayload(options?: {
  transport?: string;
  room?: string;
}): RoomHealthPayload {
  return {
    ok: true,
    game: ROOM_GAME_ID,
    ...(options?.transport ? { transport: options.transport } : {}),
    version: ROOM_PROTOCOL_VERSION,
    ...(options?.room ? { room: options.room } : {}),
    capacity: ROOM_CAPACITY,
  };
}

export class RoomSession {
  sim: Simulation;
  private commands = new Map<string, number>();

  constructor(
    private readonly transport: RoomTransport,
    private readonly options: {
      seed?: number;
      snapshotStride?: number;
      now?: () => number;
    } = {},
  ) {
    this.sim = new Simulation(options.seed);
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  join(id: string, name?: string, sendInitialToJoiner = false): Player {
    const player = this.sim.add(id, name);
    if (sendInitialToJoiner) this.sendSnapshot(id);
    this.broadcastSnapshot();
    return player;
  }

  leave(id: string): boolean {
    if (!this.sim.player(id)) return false;
    this.sim.remove(id);
    this.commands.delete(id);
    this.broadcastSnapshot();
    return true;
  }

  handleMessage(senderId: string, type: string | undefined, data: unknown): void {
    switch (type) {
      case "input":
        this.sim.input(senderId, data);
        return;
      case "sync":
        this.sendSnapshot(senderId);
        return;
      case "start":
        if (this.sim.start(senderId)) {
          this.transport.onLock?.();
          this.broadcastSnapshot();
        }
        return;
      case "restart":
        this.restart(senderId);
        return;
      case "action":
        this.handleAction(senderId, data);
        return;
      case "chat":
        this.handleChat(senderId, data);
        return;
      default:
        return;
    }
  }

  stepTick(): void {
    this.sim.tick();
    const rawStride = this.options.snapshotStride ?? SNAPSHOT_BROADCAST_STRIDE;
    const stride = Number.isFinite(rawStride)
      ? Math.max(1, Math.floor(rawStride))
      : SNAPSHOT_BROADCAST_STRIDE;
    if (this.sim.s.tick % stride === 0) {
      this.broadcastSnapshot();
    }
  }

  sendSnapshot(playerId: string): void {
    this.transport.send(playerId, "snapshot", this.sim.snapshot());
  }

  broadcastSnapshot(): void {
    this.transport.broadcast("snapshot", this.sim.snapshot());
  }

  dispose(): void {
    this.sim.dispose();
    this.commands.clear();
  }

  private handleAction(senderId: string, data: unknown): void {
    if (!this.sim.player(senderId)) return;
    // Closing a local reading panel must not consume the gameplay action cooldown.
    if (data === "close-lore") {
      this.sim.action(senderId, data);
      return;
    }
    const now = this.now();
    const last = this.commands.get(senderId);
    if (last !== undefined && now - last < ACTION_COOLDOWN_MS) return;
    this.commands.set(senderId, now);
    this.sim.action(senderId, data);
  }

  private handleChat(senderId: string, data: unknown): void {
    const player = this.sim.player(senderId);
    if (!player) return;
    const rawText =
      typeof data === "string"
        ? data
        : data && typeof data === "object" && "text" in data
          ? (data as { text?: unknown }).text
          : undefined;
    if (typeof rawText !== "string") return;
    const text = rawText
      .replace(/[<>\x00-\x1f]/g, "")
      .trim()
      .slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    this.transport.broadcast("chat", {
      id: player.id,
      name: player.name,
      color: player.color,
      text,
      time: this.now(),
    });
  }

  private restart(senderId: string): void {
    if (
      senderId !== this.sim.s.host ||
      (this.sim.s.phase !== "won" && this.sim.s.completedAt <= 0)
    ) {
      return;
    }
    const players = this.sim.s.players.map((player) => ({
      id: player.id,
      name: player.name,
    }));
    const seed = this.sim.s.seed + 1;
    this.sim.dispose();
    this.commands.clear();
    this.sim = new Simulation(seed);
    for (const player of players) {
      this.sim.add(player.id, player.name);
    }
    this.transport.onUnlock?.();
    this.broadcastSnapshot();
  }
}
