import type * as Party from "partykit/server";
import { initPhysics } from "../shared/physics";
import { Simulation } from "../shared/simulation";
import { DT } from "../shared/types";

// Polyfill Cloudflare Workers / workerd environment for Rapier wasm-bindgen
if (typeof (globalThis as any).window === "undefined") {
  (globalThis as any).window = globalThis;
}
if (typeof (globalThis as any).performance === "undefined") {
  (globalThis as any).performance = { now: () => Date.now() };
} else if (typeof (globalThis as any).performance.now !== "function") {
  (globalThis as any).performance.now = () => Date.now();
}

async function loadWasmModule() {
  try {
    const mod = await import("./rapier.wasm");
    return mod.default || mod;
  } catch {
    return undefined;
  }
}

type Message = { type?: string; data?: unknown };

export default class GameRoom implements Party.Server {
  sim!: Simulation;
  commands = new Map<string, number>();
  timer: ReturnType<typeof setInterval> | undefined;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const wasmModule = await loadWasmModule();
    await initPhysics(wasmModule);
    this.sim = new Simulation();
  }

  private startLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.sim.tick();
      this.broadcastSnapshot();
    }, DT * 1000);
  }

  private stopLoop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    if ([...this.room.getConnections()].length > 4) {
      connection.close(4001, "room full");
      return;
    }
    const name = new URL(context.request.url).searchParams.get("name") || undefined;
    try {
      this.sim.add(connection.id, name);
    } catch {
      connection.close(4001, "room full");
      return;
    }
    this.startLoop();
    connection.send(JSON.stringify({ type: "snapshot", data: this.sim.snapshot() }));
    this.broadcastSnapshot();
  }

  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (typeof raw !== "string") return;
    let message: Message;
    try {
      message = JSON.parse(raw) as Message;
    } catch {
      return;
    }
    if (message.type === "input") this.sim.input(sender.id, message.data);
    if (message.type === "sync")
      sender.send(JSON.stringify({ type: "snapshot", data: this.sim.snapshot() }));
    if (message.type === "start" && this.sim.start(sender.id)) this.broadcastSnapshot();
    if (message.type === "restart") this.restart(sender.id);
    if (message.type === "action") {
      if (message.data === "close-lore") {
        this.sim.action(sender.id, message.data);
        return;
      }
      const now = Date.now();
      if (now - (this.commands.get(sender.id) || 0) < 100) return;
      this.commands.set(sender.id, now);
      this.sim.action(sender.id, message.data);
    }
    if (message.type === "chat") {
      const p = this.sim.player(sender.id);
      const rawText =
        typeof message.data === "string"
          ? message.data
          : (message.data as any)?.text;
      const text = String(rawText || "").trim().slice(0, 150);
      if (text && p) {
        this.room.broadcast(
          JSON.stringify({
            type: "chat",
            data: {
              id: p.id,
              name: p.name,
              color: p.color,
              text,
              time: Date.now(),
            },
          }),
        );
      }
    }
  }

  onClose(connection: Party.Connection) {
    if (!this.sim.player(connection.id)) return;
    this.sim.remove(connection.id);
    this.commands.delete(connection.id);
    if (!this.sim.s.players.length) this.stopLoop();
    this.broadcastSnapshot();
  }

  onError(connection: Party.Connection) {
    this.onClose(connection);
  }

  onRequest() {
    return Response.json({
      ok: true,
      game: "last-light",
      transport: "partykit",
      version: "0.3.0",
      room: this.room.id,
      capacity: 4,
    });
  }

  private restart(id: string) {
    if (id !== this.sim.s.host || this.sim.s.phase !== "won") return;
    const players = this.sim.s.players.map((player) => ({
      id: player.id,
      name: player.name,
    }));
    const seed = this.sim.s.seed + 1;
    this.sim.dispose();
    this.sim = new Simulation(seed);
    players.forEach((player) => this.sim.add(player.id, player.name));
    this.broadcastSnapshot();
  }

  private broadcastSnapshot() {
    this.room.broadcast(
      JSON.stringify({ type: "snapshot", data: this.sim.snapshot() }),
    );
  }
}

GameRoom satisfies Party.Worker;
