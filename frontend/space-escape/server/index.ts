import express from "express";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Server, Room, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { initPhysics } from "../shared/physics";
import {
  ROOM_CAPACITY,
  ROOM_MESSAGE_TYPES,
  RoomSession,
  roomHealthPayload,
} from "../shared/room-session";
import { DT } from "../shared/types";

await initPhysics();

class EscapeRoom extends Room {
  maxClients = ROOM_CAPACITY;
  session!: RoomSession;

  onCreate() {
    this.roomId = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    this.session = new RoomSession({
      send: (playerId, type, data) => {
        this.clients.find((client) => client.sessionId === playerId)?.send(type, data);
      },
      broadcast: (type, data) => this.broadcast(type, data),
      onLock: () => {
        void this.lock();
      },
      onUnlock: () => {
        void this.unlock();
      },
    });
    for (const type of ROOM_MESSAGE_TYPES) {
      this.onMessage(type, (client, data) =>
        this.session.handleMessage(client.sessionId, type, data),
      );
    }
    this.setFixedTimestep(() => this.session.stepTick(), 1 / DT);
  }

  onJoin(client: Client, options: { name?: string }) {
    this.session.join(
      client.sessionId,
      typeof options?.name === "string" ? options.name : undefined,
    );
  }

  onLeave(client: Client) {
    this.session.leave(client.sessionId);
  }

  onDispose() {
    this.session.dispose();
  }
}

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.get("/health", (_req, res) => res.json(roomHealthPayload()));
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
