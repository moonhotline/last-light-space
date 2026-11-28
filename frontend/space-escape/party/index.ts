import type * as Party from "partykit/server";
import { encodeWireMessage, initPartyPhysics, parseWireMessage } from "./runtime";
import { ROOM_CAPACITY, RoomSession, roomHealthPayload } from "../shared/room-session";
import type { Simulation } from "../shared/simulation";
import { DT } from "../shared/types";

export default class GameRoom implements Party.Server {
  session!: RoomSession;
  timer: ReturnType<typeof setInterval> | undefined;

  constructor(readonly room: Party.Room) {}

  get sim(): Simulation {
    return this.session.sim;
  }

  async onStart() {
    await initPartyPhysics();
    this.session = new RoomSession({
      send: (playerId, type, data) => {
        for (const conn of this.room.getConnections()) {
          if (conn.id === playerId) {
            conn.send(encodeWireMessage(type, data));
            break;
          }
        }
      },
      broadcast: (type, data) => this.room.broadcast(encodeWireMessage(type, data)),
    });
  }

  private startLoop() {
    if (this.timer) return;
    this.timer = setInterval(() => this.session.stepTick(), DT * 1000);
  }

  private stopLoop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  onConnect(connection: Party.Connection, context: Party.ConnectionContext) {
    if ([...this.room.getConnections()].length > ROOM_CAPACITY) {
      connection.close(4001, "room full");
      return;
    }
    const name = new URL(context.request.url).searchParams.get("name") || undefined;
    try {
      this.session.join(connection.id, name, true);
    } catch {
      connection.close(4001, "room full");
      return;
    }
    this.startLoop();
  }

  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    const message = parseWireMessage(raw);
    if (!message) return;
    this.session.handleMessage(sender.id, message.type, message.data);
  }

  onClose(connection: Party.Connection) {
    if (!this.session.leave(connection.id)) return;
    if (!this.session.sim.s.players.length) this.stopLoop();
  }

  onError(connection: Party.Connection) {
    this.onClose(connection);
  }

  onRequest() {
    return Response.json(
      roomHealthPayload({ transport: "partykit", room: this.room.id }),
    );
  }
}

GameRoom satisfies Party.Worker;
