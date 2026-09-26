import express from "express";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server, Room, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { initPhysics } from "../shared/physics";
import { Simulation } from "../shared/simulation";
import { DT } from "../shared/types";

await initPhysics();
class EscapeRoom extends Room {
  maxClients = 4;
  sim!: Simulation;
  commands = new Map<string, number>();
  onCreate() {
    this.roomId = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    this.sim = new Simulation();
    this.onMessage("input", (client, data) =>
      this.sim.input(client.sessionId, data),
    );
    this.onMessage("sync", (client) =>
      client.send("snapshot", this.sim.snapshot()),
    );
    this.onMessage("action", (client, data) => {
      // Closing a local reading panel must not consume the gameplay action cooldown.
      if (data === "close-lore") {
        this.sim.action(client.sessionId, data);
        return;
      }
      const now = Date.now();
      if (now - (this.commands.get(client.sessionId) || 0) < 100) return;
      this.commands.set(client.sessionId, now);
      this.sim.action(client.sessionId, data);
    });
    this.onMessage("start", (client) => {
      if (this.sim.start(client.sessionId)) void this.lock();
    });
    this.onMessage("restart", (client) => {
      if (client.sessionId !== this.sim.s.host || this.sim.s.phase !== "won")
        return;
      const players = this.sim.s.players.map((p) => ({
        id: p.id,
        name: p.name,
      }));
      const seed = this.sim.s.seed + 1;
      this.sim.dispose();
      this.sim = new Simulation(seed);
      players.forEach((p) => this.sim.add(p.id, p.name));
      void this.unlock();
      this.broadcast("snapshot", this.sim.snapshot());
    });
    this.setFixedTimestep(() => {
      this.sim.tick();
      if (this.sim.s.tick % 2 === 0)
        this.broadcast("snapshot", this.sim.snapshot());
    }, 1 / DT);
  }
  onJoin(client: Client, options: { name?: string }) {
    this.sim.add(
      client.sessionId,
      typeof options?.name === "string" ? options.name : undefined,
    );
    this.broadcast("snapshot", this.sim.snapshot());
  }
  onLeave(client: Client) {
    this.sim.remove(client.sessionId);
    this.commands.delete(client.sessionId);
    this.broadcast("snapshot", this.sim.snapshot());
  }
  onDispose() {
    this.sim.dispose();
  }
}

const app = express();
app.get("/health", (_req, res) =>
  res.json({ ok: true, game: "last-light", version: "0.3.0", capacity: 4 }),
);
// One origin serves both the built game and WebSocket rooms for local/tunnel play.
// Static-only hosts retain their own connection.json with an explicit room URL.
app.get("/connection.json", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ sameOrigin: true });
});
app.use(express.static(fileURLToPath(new URL("../dist/", import.meta.url))));
const http = createServer(app);
const server = new Server({
  transport: new WebSocketTransport({ server: http, maxPayload: 8192 }),
});
server.define("escape", EscapeRoom);
const port = Number(process.env.PORT || process.env.SPACE_PORT || 2567);
const host = process.env.SPACE_HOST || "0.0.0.0";
await server.listen(port, host);
console.log(`Last Light room server: http://${host}:${port}`);
