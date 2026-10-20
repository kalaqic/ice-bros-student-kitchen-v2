// Minimal typings for the parts of the `ws` package this server uses
// (keeps the project free of an extra @types dependency).
declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';
  import { EventEmitter } from 'node:events';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: 1;
    readonly OPEN: 1;
    readonly readyState: 0 | 1 | 2 | 3;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', cb: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
    on(event: 'close', cb: (code: number) => void): this;
    on(event: 'open' | 'error', cb: (...a: unknown[]) => void): this;
    constructor(url: string);
  }
  export class WebSocketServer extends EventEmitter {
    constructor(opts: { noServer?: boolean; maxPayload?: number; port?: number });
    handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, cb: (ws: WebSocket) => void): void;
    on(event: 'connection', cb: (ws: WebSocket, req: IncomingMessage) => void): this;
  }
  export default WebSocket;
}
