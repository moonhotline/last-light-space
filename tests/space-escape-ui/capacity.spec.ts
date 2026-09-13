import { test, expect } from "@playwright/test";
import { Client, type Room } from "@colyseus/sdk";
import type { Snapshot } from "../../frontend/space-escape/shared/types";

test("four players share a room, a fifth is rejected, and host departure opens a seat", async () => {
  const client = new Client(
    process.env.SPACE_ROOM_URL || "ws://127.0.0.1:2567",
  );
  const rooms: Room[] = [];
  const states = new Map<Room, Snapshot>();
  function observe(room: Room) {
    rooms.push(room);
    room.onMessage("snapshot", (s) => states.set(room, s));
    room.send("sync");
    return room;
  }
  try {
    const host = observe(
      await client.create("escape", { name: "Capacity host" }),
    );
    for (let i = 1; i <= 3; i++)
      observe(await client.joinById(host.roomId, { name: `Crew ${i}` }));
    await expect
      .poll(() => rooms.every((r) => states.get(r)?.players.length === 4))
      .toBe(true);
    await expect(
      client.joinById(host.roomId, { name: "Fifth" }),
    ).rejects.toThrow();
    const successor = rooms[1];
    await host.leave();
    rooms.splice(0, 1);
    await expect
      .poll(() => states.get(successor)?.host)
      .toBe(successor.sessionId);
    observe(await client.joinById(successor.roomId, { name: "Replacement" }));
    await expect
      .poll(() => rooms.every((r) => states.get(r)?.players.length === 4))
      .toBe(true);
    successor.send("start");
    await expect
      .poll(() => rooms.every((r) => states.get(r)?.phase === "active"))
      .toBe(true);
  } finally {
    await Promise.allSettled(rooms.map((r) => r.leave()));
  }
});
