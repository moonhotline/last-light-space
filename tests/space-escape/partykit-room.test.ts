import { test } from "node:test";
import assert from "node:assert/strict";
import type * as Party from "partykit/server";
import GameRoom from "../../frontend/space-escape/party/index";

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

  server.onMessage(JSON.stringify({ type: "start" }), players[0] as unknown as Party.Connection);
  assert.equal(server.sim.s.phase, "active");

  room.connections.delete("p1");
  server.onClose(players[0] as unknown as Party.Connection);
  assert.equal(server.sim.s.host, "p2");
  assert.equal(server.sim.s.players.length, 3);

  for (const connection of players.slice(1, 4)) {
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
