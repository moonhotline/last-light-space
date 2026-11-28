import { Client } from "@colyseus/sdk";

class PartySocket {
  readonly id: string;
  private ws: WebSocket;
  constructor(endpoint: string, roomId: string, name: string) {
    this.id = "p_" + Math.random().toString(36).slice(2, 10);
    const url = new URL(endpoint);
    url.protocol =
      url.protocol === "https:" || url.protocol === "wss:" ? "wss:" : "ws:";
    url.pathname = `/parties/main/${roomId}`;
    url.search = new URLSearchParams({ name, _pk: this.id }).toString();
    url.hash = "";
    this.ws = new WebSocket(url);
  }
  addEventListener(type: string, listener: (event: any) => void) {
    this.ws.addEventListener(type, listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.ws.removeEventListener(type, listener);
  }
  send(data: string) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
  close(code?: number, reason?: string) {
    this.ws.close(code, reason);
  }
}

type Handler<T = unknown> = (value: T) => void;

export interface RoomEndpoint {
  url: string;
  transport?: "partyserver";
}

export interface ConnectionConfig {
  url?: string;
  sameOrigin?: boolean;
  transport?: string;
}

/**
 * Resolve and validate the multiplayer room endpoint from build overrides,
 * runtime `connection.json`, or localhost fallback.
 */
export function resolveRoomEndpoint(
  config: ConnectionConfig | null | undefined,
  overrideUrl?: string,
  loc?: Pick<Location, "protocol" | "host" | "hostname">,
): RoomEndpoint | null {
  const effectiveLoc = loc ?? (typeof location !== "undefined" ? location : undefined);
  const url =
    overrideUrl ||
    config?.url ||
    (config?.sameOrigin && effectiveLoc
      ? `${effectiveLoc.protocol === "https:" ? "wss:" : "ws:"}//${effectiveLoc.host}`
      : "") ||
    (effectiveLoc && /^(localhost|127\.0\.0\.1)$/.test(effectiveLoc.hostname)
      ? "ws://127.0.0.1:2567"
      : "");
  try {
    const parsed = new URL(url);
    if (
      ["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    ) {
      const endpoint: RoomEndpoint = { url };
      if (!overrideUrl && config?.url && config.transport === "partyserver") {
        endpoint.transport = "partyserver";
      }
      return endpoint;
    }
  } catch {
    /* Solo stays available offline when no valid endpoint is configured. */
  }
  return null;
}

export interface MultiplayerRoom {
  roomId: string;
  sessionId: string;
  send(type: string, data?: unknown): void;
  onMessage<T>(type: string, handler: Handler<T>): void;
  onError(handler: Handler<Error>): void;
  onLeave(handler: Handler<{ code: number; reason: string }>): void;
  leave(): Promise<void>;
}

function openRoom(endpoint: string, roomId: string, name: string) {
  return new Promise<MultiplayerRoom>((resolve, reject) => {
    const socket = new PartySocket(endpoint, roomId, name);
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
  { url, transport }: RoomEndpoint,
  roomId: string,
  name: string,
  create = false,
) => {
  if (
    transport === "partyserver" ||
    url.includes("partykit") ||
    url.includes("/parties/")
  ) {
    return openRoom(url, roomId, name);
  }
  return openColyseusRoom(url, roomId, name, create);
};
