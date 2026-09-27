import PartySocket from "partysocket";

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
    socket.addEventListener("message", (event) => {
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
    socket.addEventListener("error", (event) => {
      const error = new Error(event.message || "PartyKit connection failed");
      for (const handler of errors) handler(error);
      if (!opened) reject(error);
    });
    socket.addEventListener("close", (event) => {
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

export const roomCode = () =>
  crypto
    .getRandomValues(new Uint8Array(3))
    .reduce((value, byte) => value + byte.toString(16).padStart(2, "0"), "")
    .toUpperCase();

export const connectPartyRoom = (
  endpoint: string,
  roomId: string,
  name: string,
) => openRoom(endpoint, roomId, name);
