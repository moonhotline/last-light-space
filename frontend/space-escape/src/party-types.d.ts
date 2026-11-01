declare module "partysocket" {
  export default class PartySocket {
    id: string;
    constructor(options: any);
    addEventListener(event: string, handler: (e: any) => void): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
}

declare module "partykit/server" {
  export interface Room {
    id: string;
    getConnections(): Iterable<Connection>;
    broadcast(msg: string): void;
  }
  export interface Connection {
    id: string;
    send(msg: string): void;
    close(code?: number, reason?: string): void;
  }
  export interface ConnectionContext {
    request: Request;
  }
  export interface Server {
    onStart?(): Promise<void> | void;
    onConnect?(conn: Connection, ctx: ConnectionContext): void;
    onMessage?(raw: any, sender: Connection): void;
    onClose?(conn: Connection): void;
    onError?(conn: Connection): void;
    onRequest?(): Response | Promise<Response>;
  }
  export type Worker = any;
}

declare module "partyserver" {
  export interface Connection {
    id: string;
    send(msg: string): void;
    close(code?: number, reason?: string): void;
  }
  export interface ConnectionContext {
    request: Request;
  }
  export type WSMessage = string | ArrayBuffer | ArrayBufferView;
  export class Server {
    name: string;
    getConnections(): Iterable<Connection>;
    broadcast(msg: string): void;
  }
  export function routePartykitRequest(
    req: Request,
    env: any,
    options?: any,
  ): Promise<Response | null>;
}

declare module "*.wasm" {
  const content: any;
  export default content;
}
