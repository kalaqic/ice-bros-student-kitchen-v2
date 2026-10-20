import type { ClientMsg, ServerMsg } from '../../../shared/protocol.ts';

type Handler = (m: ServerMsg) => void;
const KEY = 'icebros.session';

export interface SavedSession { code: string; token: string }

/** WebSocket connection with automatic reconnect + session resume (per browser tab). */
export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: string[] = [];
  status: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';
  rtt = 0;
  private wantOpen = false;
  private retry = 0;
  onReconnect: (() => void) | null = null;

  on(h: Handler) { this.handlers.add(h); return () => this.handlers.delete(h); }

  connect(): Promise<void> {
    this.wantOpen = true;
    if (this.ws && (this.status === 'open' || this.status === 'connecting')) {
      return this.status === 'open' ? Promise.resolve() : new Promise((r) => this.ws!.addEventListener('open', () => r(), { once: true }));
    }
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      const ws = new WebSocket(url);
      this.ws = ws; this.status = 'connecting';
      ws.onopen = () => {
        this.status = 'open'; this.retry = 0;
        for (const q of this.queue) ws.send(q);
        this.queue = [];
        resolve();
      };
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'pong') this.rtt = performance.now() - m.c;
        for (const h of this.handlers) h(m);
      };
      ws.onerror = () => { if (this.status === 'connecting') reject(new Error('connect failed')); };
      ws.onclose = () => {
        this.status = 'closed';
        if (this.ws !== ws) return;
        this.ws = null;
        if (this.wantOpen && this.retry < 20) {
          const delay = Math.min(4000, 400 * 2 ** this.retry++);
          setTimeout(() => this.connect().then(() => this.onReconnect?.()).catch(() => {}), delay);
        }
      };
    });
  }

  send(m: ClientMsg) {
    const s = JSON.stringify(m);
    if (this.ws && this.status === 'open') this.ws.send(s);
    else if (m.t !== 'input') this.queue.push(s);
  }

  close() { this.wantOpen = false; this.ws?.close(); this.ws = null; this.status = 'idle'; }

  ping() { this.send({ t: 'ping', c: performance.now() }); }

  static save(s: SavedSession | null) {
    try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  /** tokens remembered per room in localStorage so a closed tab can rejoin its slot */
  static remember(code: string, token: string) {
    try {
      const all = JSON.parse(localStorage.getItem('icebros.tokens') || '{}') as Record<string, string[]>;
      all[code] = [token, ...(all[code] || []).filter((t) => t !== token)].slice(0, 4);
      const keys = Object.keys(all);
      if (keys.length > 10) delete all[keys[0]];
      localStorage.setItem('icebros.tokens', JSON.stringify(all));
    } catch { /* ignore */ }
  }
  static forget(code: string) {
    try {
      const all = JSON.parse(localStorage.getItem('icebros.tokens') || '{}') as Record<string, string[]>;
      delete all[code];
      localStorage.setItem('icebros.tokens', JSON.stringify(all));
    } catch { /* ignore */ }
  }
  static tokensFor(code: string): string[] {
    try { return (JSON.parse(localStorage.getItem('icebros.tokens') || '{}') as Record<string, string[]>)[code] || []; } catch { return []; }
  }
  static load(): SavedSession | null {
    try { const v = sessionStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; }
  }
}
