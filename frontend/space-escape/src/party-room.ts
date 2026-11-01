import { Client } from "@colyseus/sdk";

class PartySocket {
  readonly id: string;
  private ws: WebSocket;
  constructor(options: {
    host: string;
    room: string;
    query?: Record<string, string | undefined>;
    maxRetries?: number;
    connectionTimeout?: number;
  }) {
    this.id = "p_" + Math.random().toString(36).slice(2, 10);
    const host = options.host;
    const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
    const params = new URLSearchParams();
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) params.set(k, v);
      }
    }
    const qs = params.toString() ? `?${params.toString()}` : "";
    const url = `${proto}//${host}/parties/main/${options.room}${qs}`;
    this.ws = new WebSocket(url);
  }
  addEventListener(type: string, listener: (event: any) => void) {
    this.ws.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.ws.removeEventListener(type, listener);
  }
  send(data: string) {
    this.ws.send(data);
  }
  close(code?: number, reason?: string) {
    this.ws.close(code, reason);
  }
}

type Handler<T = unknown> = (value: T) => void;

export interface MultiplayerRoom {
  roomId: string;
  sessionId: string;
  send(type: string, data?: unknown): void;
  onMessage<T>(type: string, handler: Handler<T>): void;
  onError(handler: Handler<Error>): void;
  onLeave(handler: Handler<{ code: number; reason: string }>): void;
  leave(): Promise<void>;
}

function endpointHost(endpoint: string) {
  const url = new URL(endpoint);
  return url.host;
}

function openRoom(endpoint: string, roomId: string, name: string) {
  return new Promise<MultiplayerRoom>((resolve, reject) => {
    const socket = new PartySocket({
      host: endpointHost(endpoint),
      room: roomId,
      query: { name },
      maxRetries: 8,
      connectionTimeout: 12_000,
    });
    const handlers = new Map<string, Set<Handler>>();
    const errors = new Set<Handler<Error>>();
    const leaves = new Set<Handler<{ code: number; reason: string }>>();
    let opened = false;
    socket.addEventListener("message", (event: any) => {
      try {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          data?: unknown;
        };
        if (!message.type) return;
        for (const handler of handlers.get(message.type) || []) handler(message.data);
      } catch {
        /* Ignore malformed messages from an incompatible endpoint. */
      }
    });
    socket.addEventListener("error", (event: any) => {
      const error = new Error(event.message || "PartyKit connection failed");
      for (const handler of errors) handler(error);
      if (!opened) reject(error);
    });
    socket.addEventListener("close", (event: any) => {
      for (const handler of leaves) handler({ code: event.code, reason: event.reason });
      if (!opened) reject(new Error(event.reason || "Room unavailable"));
    });
    socket.addEventListener("open", () => {
      opened = true;
      resolve({
        roomId,
        sessionId: socket.id,
        send(type, data) {
          socket.send(JSON.stringify({ type, data }));
        },
        onMessage(type, handler) {
          const list = handlers.get(type) || new Set<Handler>();
          list.add(handler as Handler);
          handlers.set(type, list);
        },
        onError(handler) {
          errors.add(handler);
        },
        onLeave(handler) {
          leaves.add(handler);
        },
        async leave() {
          socket.close(1000, "left room");
        },
      });
    });
  });
}

async function openColyseusRoom(
  endpoint: string,
  roomId: string,
  name: string,
  create: boolean,
): Promise<MultiplayerRoom> {
  const client = new Client(endpoint);
  const room = create
    ? await client.create("escape", { name })
    : await client.joinById(roomId, { name });

  return {
    roomId: room.roomId,
    sessionId: room.sessionId,
    send(type: string, data?: unknown) {
      room.send(type, data);
    },
    onMessage<T>(type: string, handler: Handler<T>) {
      room.onMessage(type, handler as any);
    },
    onError(handler: Handler<Error>) {
      room.onError((code, message) =>
        handler(new Error(message || `Colyseus error ${code}`)),
      );
    },
    onLeave(handler: Handler<{ code: number; reason: string }>) {
      room.onLeave((code) => handler({ code, reason: "" }));
    },
    async leave() {
      await room.leave();
    },
  };
}

export const roomCode = () =>
  crypto
    .getRandomValues(new Uint8Array(3))
    .reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "")
    .toUpperCase();

export const connectPartyRoom = (
  endpoint: string,
  roomId: string,
  name: string,
  create = false,
) => {
  if (endpoint.includes("partykit") || endpoint.includes("/parties/")) {
    return openRoom(endpoint, roomId, name);
  }
  return openColyseusRoom(endpoint, roomId, name, create);
};
