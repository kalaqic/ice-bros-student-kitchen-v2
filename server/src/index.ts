import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { TICK_HZ } from '../../shared/constants.ts';
import { LEVELS } from '../../shared/levels/index.ts';
import type { ClientMsg, ServerMsg } from '../../shared/protocol.ts';
import type { Role } from '../../shared/types.ts';
import { validateLevel } from './LevelSim.ts';
import type { Player } from './Player.ts';
import { Room } from './Room.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'client', 'dist');

/** music dropped into assets/audio is picked up on every server start (no rebuild needed) */
function syncAudio() {
  try {
    const src = path.join(ROOT, 'assets', 'audio'), dst = path.join(DIST, 'assets', 'audio');
    if (!fs.existsSync(DIST)) return;
    fs.mkdirSync(dst, { recursive: true });
    const files = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f)) : [];
    for (const f of files) {
      const a = path.join(src, f), b = path.join(dst, f);
      if (!fs.existsSync(b) || fs.statSync(b).size !== fs.statSync(a).size) fs.copyFileSync(a, b);
    }
    fs.writeFileSync(path.join(dst, 'index.json'), JSON.stringify(files));
    if (files.length) console.log('music:', files.join(', '));
  } catch (e) { console.warn('audio sync failed', e); }
}
syncAudio();
const PORT = Number(process.env.PORT || 2567);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

for (const L of Object.values(LEVELS)) validateLevel(L);

const rooms = new Map<string, Room>();

// ------------------------------------------------------------------ static files
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.map': 'application/json',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.length, 0) }));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Client is not built yet. Run "npm run build" (or "npm run dev").');
        return;
      }
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': url.search.includes('v=') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(data);
  });
});

// ------------------------------------------------------------------ websockets
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function makeCode(): string {
  for (;;) {
    let s = '';
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(s)) return s;
  }
}
const sendRaw = (ws: WebSocket, msg: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
const isRole = (r: unknown): r is Role => r === 'david' || r === 'nemanja';

wss.on('connection', (ws) => {
  let room: Room | null = null;
  let me: Player | null = null;
  let msgBudget = 120; // simple flood guard: refills every second
  const refill = setInterval(() => { msgBudget = 120; }, 1000);

  ws.on('message', (raw) => {
    if (--msgBudget < 0) return;
    let m: ClientMsg;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
    switch (m.t) {
      case 'ping': sendRaw(ws, { t: 'pong', c: Number(m.c) || 0 }); return;
      case 'create': {
        if (me) return;
        const role = isRole(m.role) ? m.role : 'david';
        room = new Room(makeCode());
        rooms.set(room.code, room);
        me = room.addPlayer(ws, role, m.progress);
        log(`room ${room.code} created by ${role}`);
        return;
      }
      case 'join': {
        if (me) return;
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        const r = rooms.get(code);
        if (!r) return sendRaw(ws, { t: 'error', msg: 'SOBA NE POSTOJI' });
        // a reopened tab can reclaim its old (disconnected) slot with a remembered token
        r.mergeProgress(m.progress);
        if (Array.isArray(m.tokens)) {
          for (const tk of m.tokens.slice(0, 8)) {
            const p = typeof tk === 'string' ? r.resume(ws, tk, true) : null;
            if (p) { room = r; me = p; log(`room ${r.code}: ${p.role} reclaimed slot`); return; }
          }
        }
        if (r.full) return sendRaw(ws, { t: 'error', msg: 'SOBA JE PUNA (MAX 2)' });
        if (r.phase !== 'lobby') return sendRaw(ws, { t: 'error', msg: 'IGRA JE VEC POCELA' });
        room = r; me = r.addPlayer(ws, isRole(m.role) ? m.role : 'nemanja', m.progress);
        log(`room ${r.code}: ${me.role} joined`);
        return;
      }
      case 'resume': {
        if (me) return;
        const r = rooms.get(String(m.code || '').toUpperCase());
        const p = r && typeof m.token === 'string' ? r.resume(ws, m.token) : null;
        if (!r || !p) return sendRaw(ws, { t: 'error', msg: 'RESUME_FAILED' });
        room = r; me = p;
        log(`room ${r.code}: ${p.role} reconnected`);
        return;
      }
    }
    if (!room || !me) return;
    switch (m.t) {
      case 'input': room.onInput(me, Number(m.seq), Number(m.dx), Number(m.dy)); break;
      case 'act': room.onAct(me, String(m.a)); break;
      case 'answer': room.onAnswer(me, Number(m.i)); break;
      case 'emote': room.onEmote(me, Number(m.e)); break;
      case 'ready': room.onReady(me, !!m.v); break;
      case 'toLobby': if (room.phase !== 'lobby') room.toLobby(); break;
      case 'retry': room.retry(); break;
      case 'next': room.next(); break;
      case 'pickLevel': room.pickLevel(String(m.id)); break;
      case 'leave': room.remove(me); me = null; room = null; break;
      case 'debug': if (process.env.ICEBROS_DEBUG === '1') room.onDebug(me, String(m.cmd)); break;
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    if (room && me && me.ws === ws) { room.disconnect(me); log(`room ${room.code}: ${me.role} disconnected`); }
  });
});

// ------------------------------------------------------------------ game loop
let last = performance.now();
let acc = 0;
const STEP = 1000 / TICK_HZ;
setInterval(() => {
  const now = performance.now();
  acc += now - last; last = now;
  let n = 0;
  while (acc >= STEP && n < 5) {
    acc -= STEP; n++;
    for (const r of rooms.values()) r.tick();
  }
  if (n === 5) acc = 0;
  // garbage-collect empty rooms
  for (const [code, r] of rooms) {
    const anyone = r.players.some((p) => p.connected);
    if (anyone) { r.emptySince = 0; continue; }
    if (!r.emptySince) r.emptySince = Date.now();
    else if (Date.now() - r.emptySince > 60_000) { rooms.delete(code); log(`room ${code} closed`); }
  }
}, STEP / 2);

function log(s: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

server.listen(PORT, () => log(`Ice Bros server on http://localhost:${PORT}`));
