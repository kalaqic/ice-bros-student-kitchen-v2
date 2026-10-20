/**
 * Headless multiplayer smoke test: starts against a running server (default ws://localhost:2567/ws),
 * connects two bot clients and checks room flow + authoritative sync.
 *   npm start   (in another terminal)   then   npm run test:net
 */
import { WebSocket } from 'ws';
import type { ServerMsg, Snapshot } from '../shared/protocol.ts';

const URL = process.env.WS_URL || 'ws://localhost:2567/ws';
type Bot = { ws: WebSocket; msgs: ServerMsg[]; snap?: Snapshot; ice: number[]; id?: string; role?: string; code?: string; seq: number };

function bot(): Promise<Bot> {
  return new Promise((res, rej) => {
    const b: Bot = { ws: new WebSocket(URL), msgs: [], seq: 0, ice: [] };
    b.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      if (m.t === 's') { b.snap = m; if (m.ice) b.ice = m.ice; } else b.msgs.push(m);
      if (m.t === 'joined') { b.id = m.you.id; b.role = m.you.role; b.code = m.code; }
    });
    b.ws.on('open', () => res(b));
    b.ws.on('error', (e) => rej(e));
  });
}
const send = (b: Bot, m: object) => b.ws.send(JSON.stringify(m));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failures++; };
const me = (b: Bot) => b.snap!.p.find((p) => p.id === b.id)!;

async function walk(b: Bot, dx: number, dy: number, ticks: number) {
  for (let i = 0; i < ticks; i++) { send(b, { t: 'input', seq: ++b.seq, dx, dy }); await sleep(33); }
}

const A = await bot();
send(A, { t: 'create', role: 'david' });
await sleep(200);
check(!!A.code && A.role === 'david', `room created (${A.code}), A is david`);

const B = await bot();
send(B, { t: 'join', code: A.code, role: 'david' });
await sleep(200);
check(B.role === 'nemanja', 'B asked for david but was auto-assigned nemanja');

const C = await bot();
send(C, { t: 'join', code: A.code, role: 'david' });
await sleep(200);
check(C.msgs.some((m) => m.t === 'error'), 'third player is rejected (room full)');
C.ws.close();

// lobby movement
const x0 = me(A).x;
await walk(A, 1, 0, 15);
await sleep(150);
check(me(A).x > x0 + 50, `lobby movement is authoritative (x ${x0} -> ${me(A).x})`);
check(B.snap!.p.find((p) => p.id === A.id)!.x === me(A).x, 'B sees A at the same lobby position');

// cheating: huge dx gets clamped
const x1 = me(A).x;
send(A, { t: 'input', seq: ++A.seq, dx: 500, dy: 0 });
await sleep(120);
check(me(A).x - x1 < 10, 'oversized input is clamped to one step');

// ready -> level
send(A, { t: 'ready', v: true }); send(B, { t: 'ready', v: true });
await sleep(300);
check(A.msgs.some((m) => m.t === 'level') && B.msgs.some((m) => m.t === 'level'), 'both READY -> level starts for both');
await sleep(100);
check(me(A).hp === 3 && me(A).cof === 2, 'players start with 3 HP and 2 coffees');
check(A.snap!.e.length === 3, '3 enemies are simulated');

// ice: david spawns at (3,11) facing up; ice up the column
send(A, { t: 'act', a: 'ice' });
await sleep(150);
check(A.ice.length >= 1, `SPACE creates ice in the facing direction (${A.ice.length} tiles)`);
check(JSON.stringify(A.ice) === JSON.stringify(B.ice), 'ice tiles synced to the other client');
await sleep(300);
send(A, { t: 'act', a: 'ice' });
await sleep(400);
check(A.ice.length === 0 && B.ice.length === 0, 'SPACE again breaks the ice line (both clients)');

// coffee at full HP is refused
send(A, { t: 'act', a: 'coffee' });
await sleep(150);
check(me(A).cof === 2, 'coffee is not consumed at full HP');

// camera
send(B, { t: 'act', a: 'camera' });
await sleep(150);
check(me(B).cam > 5000, `camera goes on cooldown (${me(B).cam}ms)`);
send(B, { t: 'act', a: 'camera' });
await sleep(100);
check(me(B).cam < 6000, 'second flash during cooldown is ignored');

// disconnect / pause / resume
const token = (A.msgs.find((m) => m.t === 'joined') as Extract<ServerMsg, { t: 'joined' }>).you.token;
A.ws.close();
await sleep(300);
check(!!B.snap!.paused, `level pauses when a player drops ("${B.snap!.paused}")`);
const A2 = await bot();
send(A2, { t: 'resume', code: A.code, token });
await sleep(300);
check(A2.role === 'david' && !B.snap!.paused, 'player resumes with token and the level unpauses');

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
