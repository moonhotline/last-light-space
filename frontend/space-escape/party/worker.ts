import { routePartykitRequest, Server } from "partyserver";
import type { Connection, ConnectionContext, WSMessage } from "partyserver";
import { encodeWireMessage, initPartyPhysics, parseWireMessage } from "./runtime";
import { ROOM_CAPACITY, RoomSession, roomHealthPayload } from "../shared/room-session";
import type { Simulation } from "../shared/simulation";
import { DT } from "../shared/types";

export class Main extends Server {
  session!: RoomSession;
  timer: ReturnType<typeof setInterval> | undefined;

  get sim(): Simulation {
    return this.session.sim;
  }

  async onStart() {
    await initPartyPhysics();
    this.session = new RoomSession({
      send: (playerId, type, data) => {
        for (const conn of this.getConnections()) {
          if (conn.id === playerId) {
            conn.send(encodeWireMessage(type, data));
            break;
          }
        }
      },
      broadcast: (type, data) => this.broadcast(encodeWireMessage(type, data)),
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

  onConnect(connection: Connection, context: ConnectionContext) {
    if ([...this.getConnections()].length > ROOM_CAPACITY) {
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

  onMessage(connection: Connection, raw: WSMessage) {
    const message = parseWireMessage(raw);
    if (!message) return;
    this.session.handleMessage(connection.id, message.type, message.data);
  }

  onClose(connection: Connection) {
    if (!this.session.leave(connection.id)) return;
    if (!this.session.sim.s.players.length) this.stopLoop();
  }

  onError(connection: Connection) {
    this.onClose(connection);
  }

  onRequest() {
    return Response.json(
      roomHealthPayload({ transport: "partykit", room: this.name }),
    );
  }
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);

    if (
      url.pathname === "/_health" ||
      url.pathname === "/healthz" ||
      url.pathname === "/parties/main/_health"
    ) {
      return Response.json(roomHealthPayload({ transport: "partyserver" }), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        },
      });
    }

    const partyResponse = await routePartykitRequest(request, env, {
      cors: true,
      locationHint: "apac",
    });
    if (partyResponse) return partyResponse;

    return new Response("Not Found", { status: 404 });
  },
};
