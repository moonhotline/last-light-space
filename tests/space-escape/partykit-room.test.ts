import { test } from "node:test";
import assert from "node:assert/strict";
import type * as Party from "partykit/server";
import GameRoom from "../../frontend/space-escape/party/index";
import { CHAT_COOLDOWN_MS, RoomSession, roomHealthPayload } from "../../frontend/space-escape/shared/room-session";
import { resolveRoomEndpoint } from "../../frontend/space-escape/src/party-room";

class FakeConnection {
  messages: Array<{ type: string; data: any }> = [];
  closed?: { code: number; reason: string };

  constructor(readonly id: string) {}

  send(value: string) {
    this.messages.push(JSON.parse(value));
  }

  close(code: number, reason: string) {
    this.closed = { code, reason };
  }
}

class FakeRoom {
  id = "ABC123";
  connections = new Map<string, FakeConnection>();

  getConnections() {
    return this.connections.values();
  }

  broadcast(value: string) {
    for (const connection of this.connections.values()) connection.send(value);
  }
}

const context = (name: string) =>
  ({ request: new Request(`https://local.test/?name=${encodeURIComponent(name)}`) }) as Party.ConnectionContext;

test("PartyKit room supports four explorers, rejects a fifth and transfers host", async () => {
  const room = new FakeRoom();
  const server = new GameRoom(room as unknown as Party.Room);
  await server.onStart();

  const players = Array.from({ length: 5 }, (_, index) => new FakeConnection(`p${index + 1}`));
  for (const [index, connection] of players.entries()) {
    room.connections.set(connection.id, connection);
    server.onConnect(connection as unknown as Party.Connection, context(`Explorer ${index + 1}`));
  }

  assert.equal(server.sim.s.players.length, 4);
  assert.equal(server.sim.s.host, "p1");
  assert.deepEqual(players[4].closed, { code: 4001, reason: "room full" });
  room.connections.delete(players[4].id);

  server.onMessage(JSON.stringify({ type: "start" }), players[0] as unknown as Party.Connection);
  assert.equal(server.sim.s.phase, "active");

  room.connections.delete("p1");
  server.onClose(players[0] as unknown as Party.Connection);
  assert.equal(server.sim.s.host, "p2");
  assert.equal(server.sim.s.players.length, 3);

  // Mid-game join: another explorer joins an ongoing active expedition
  const midGameJoiner = new FakeConnection("p6");
  room.connections.set("p6", midGameJoiner);
  server.onConnect(midGameJoiner as unknown as Party.Connection, context("Explorer 6"));
  assert.equal(server.sim.s.players.length, 4);
  assert.equal(midGameJoiner.closed, undefined);
  assert.equal(server.sim.player("p6")?.name, "Explorer 6");

  for (const connection of [...players.slice(1, 4), midGameJoiner]) {
    room.connections.delete(connection.id);
    server.onClose(connection as unknown as Party.Connection);
  }
  assert.equal(server.timer, undefined);
  server.sim.dispose();
});

test("PartyKit room exposes a deploy health response", async () => {
  const room = new FakeRoom();
  const server = new GameRoom(room as unknown as Party.Room);
  await server.onStart();
  const response = server.onRequest();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    game: "last-light",
    transport: "partykit",
    version: "0.3.0",
    room: "ABC123",
    capacity: 4,
  });
  server.sim.dispose();
});

test("RoomSession enforces action cooldowns, close-lore bypass, chat sanitization, restart auth, and snapshot stride", async (t) => {
  const sent: Array<{ id: string; type: string; data: any }> = [];
  const broadcasts: Array<{ type: string; data: any }> = [];
  let locked = 0;
  let unlocked = 0;
  let clock = 1000;

  const session = new RoomSession(
    {
      send: (id, type, data) => sent.push({ id, type, data }),
      broadcast: (type, data) => broadcasts.push({ type, data }),
      onLock: () => locked++,
      onUnlock: () => unlocked++,
    },
    { seed: 42, now: () => clock },
  );
  t.after(() => session.dispose());

  session.join("host", "Commander", true);
  session.join("guest", "Scout", false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, "host");
  assert.equal(sent[0].type, "snapshot");

  // Only host can start; triggers onLock and snapshot broadcast
  session.handleMessage("guest", "start", undefined);
  assert.equal(session.sim.s.phase, "lobby");
  assert.equal(locked, 0);

  session.handleMessage("host", "start", undefined);
  assert.equal(session.sim.s.phase, "active");
  assert.equal(locked, 1);

  // close-lore bypasses cooldown and does not block subsequent gameplay action
  const hostPlayer = session.sim.player("host")!;
  hostPlayer.lore = 1;
  session.handleMessage("host", "action", "close-lore");
  assert.equal(hostPlayer.lore, -1);

  session.handleMessage("host", "action", "mark");
  assert.equal(session.sim.s.markers.length, 1);
  const firstEventId = session.sim.s.eventId;

  // Immediate repeat within 100ms is throttled
  clock += 50;
  session.handleMessage("host", "action", "mark");
  assert.equal(session.sim.s.eventId, firstEventId);

  // After 100ms cooldown, action executes again
  clock += 60;
  session.handleMessage("host", "action", "mark");
  assert.equal(session.sim.s.eventId, firstEventId + 1);

  // Chat trims, strips HTML/control chars, rejects non-strings, and enforces 150-char limit
  const beforeChats = broadcasts.filter((b) => b.type === "chat").length;
  session.handleMessage("guest", "chat", { text: "   " });
  session.handleMessage("guest", "chat", { text: ["not", "a", "string"] });
  session.handleMessage("guest", "chat", { text: "<>\x00\x07" });
  assert.equal(broadcasts.filter((b) => b.type === "chat").length, beforeChats);
  session.handleMessage("guest", "chat", { text: "<img src=x onerror=alert(1)>hi\x00" });
  const sanitizedChat = broadcasts.filter((b) => b.type === "chat").at(-1)!;
  assert.equal(sanitizedChat.data.text, "img src=x onerror=alert(1)hi");
  assert.equal(sanitizedChat.data.text.includes("<"), false);
  assert.equal(sanitizedChat.data.text.includes(">"), false);

  // Rapid chat flood within CHAT_COOLDOWN_MS is throttled per sender without blocking gameplay actions
  const afterFirstChat = broadcasts.filter((b) => b.type === "chat").length;
  clock += 50;
  session.handleMessage("guest", "chat", { text: "flood spam" });
  assert.equal(broadcasts.filter((b) => b.type === "chat").length, afterFirstChat);

  // After CHAT_COOLDOWN_MS elapses, valid chat broadcasts again and enforces 150-char limit
  clock += CHAT_COOLDOWN_MS;
  session.handleMessage("guest", "chat", { text: `  ${"x".repeat(200)}  ` });
  const chatMsg = broadcasts.filter((b) => b.type === "chat").at(-1)!;
  assert.equal(broadcasts.filter((b) => b.type === "chat").length, afterFirstChat + 1);
  assert.equal(chatMsg.data.id, "guest");
  assert.equal(chatMsg.data.name, "Scout");
  assert.equal(chatMsg.data.text.length, 150);

  // Unjoined sender actions are ignored without polluting state
  session.handleMessage("ghost", "action", "mark");
  assert.equal(session.sim.s.markers.length, 1);

  // Snapshot stride broadcasts on even ticks only
  const beforeSnapshots = broadcasts.filter((b) => b.type === "snapshot").length;
  session.stepTick(); // tick 1
  assert.equal(broadcasts.filter((b) => b.type === "snapshot").length, beforeSnapshots);
  session.stepTick(); // tick 2
  assert.equal(broadcasts.filter((b) => b.type === "snapshot").length, beforeSnapshots + 1);

  // Restart requires host AND completed/won expedition
  session.handleMessage("host", "restart", undefined);
  assert.equal(session.sim.s.seed, 42);
  session.sim.s.phase = "won";
  session.handleMessage("guest", "restart", undefined);
  assert.equal(session.sim.s.seed, 42);
  session.handleMessage("host", "restart", undefined);
  assert.equal(session.sim.s.seed, 43);
  assert.equal(session.sim.s.phase, "lobby");
  assert.equal(session.sim.s.players.length, 2);
  assert.equal(unlocked, 1);

  assert.deepEqual(roomHealthPayload(), {
    ok: true,
    game: "last-light",
    version: "0.3.0",
    capacity: 4,
  });
});

test("resolveRoomEndpoint validates hosted, same-origin, localhost, and rejects credentialed URLs", () => {
  assert.deepEqual(
    resolveRoomEndpoint({ url: "https://party.oodai.space", transport: "partyserver" }, undefined, {
      protocol: "https:",
      host: "game.example",
      hostname: "game.example",
    }),
    { url: "https://party.oodai.space", transport: "partyserver" },
  );
  assert.deepEqual(
    resolveRoomEndpoint({ sameOrigin: true }, undefined, {
      protocol: "https:",
      host: "local.example:8443",
      hostname: "local.example",
    }),
    { url: "wss://local.example:8443" },
  );
  assert.deepEqual(
    resolveRoomEndpoint({ url: "" }, undefined, {
      protocol: "http:",
      host: "127.0.0.1:5180",
      hostname: "127.0.0.1",
    }),
    { url: "ws://127.0.0.1:2567" },
  );
  assert.equal(
    resolveRoomEndpoint({ url: "https://user:pass@party.oodai.space" }, undefined, {
      protocol: "https:",
      host: "game.example",
      hostname: "game.example",
    }),
    null,
  );
});
