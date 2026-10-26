/**
 * Full playthrough of any normal level with two path-finding bots against a real server.
 *   ICEBROS_PEACEFUL=1 ICEBROS_DEBUG=1 npm start      then
 *   npx tsx tools/playthrough-test.ts            (all non-boss levels)   or   LEVEL=level4 npx tsx tools/playthrough-test.ts
 * Checks per level: food collected by the right owner, task stations (INTERACT) -> gates, kids' quizzes answered,
 * exit opens, both at exit -> complete.
 */
import { WebSocket } from 'ws';
import { LEVEL_ORDER, LEVELS } from '../shared/levels/index.ts';
import { type LevelDef, STATION_CODES, playerTileSolid, tileAt } from '../shared/level.ts';
import { TASKS, TASK_BY_CODE } from '../shared/tasks.ts';
import { QUESTIONS } from '../shared/quiz.ts';
import { ITEM_OWNER } from '../shared/items.ts';
import { tileCenter, tileOf } from '../shared/physics.ts';
import type { GameEvent, ServerMsg, Snapshot } from '../shared/protocol.ts';
import type { Role } from '../shared/types.ts';

const URL = process.env.WS_URL || 'ws://localhost:2567/ws';
type Goal = { tx: number; ty: number; kind: 'item' | 'station' | 'exit'; idx: number };
type Bot = { role: Role; ws: WebSocket; id?: string; code?: string; snap?: Snapshot; seq: number; goals: Goal[]; path: [number, number][]; events: GameEvent[]; msgs: ServerMsg[]; ice: number[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mk(role: Role): Promise<Bot> {
  return new Promise((res) => {
    const b: Bot = { role, ws: new WebSocket(URL), seq: Math.floor(Date.now() / 10), goals: [], path: [], events: [], msgs: [], ice: [] };
    b.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      if (m.t === 's') { b.snap = m; b.events.push(...m.ev); if (m.ice) b.ice = m.ice; } else b.msgs.push(m);
      if (m.t === 'joined') { b.id = m.you.id; b.code = m.code; }
    });
    b.ws.on('open', () => res(b));
  });
}
const send = (b: Bot, m: object) => b.ws.send(JSON.stringify(m));

function dist(L: LevelDef, b: Bot, from: [number, number]): Map<number, number> & { prev: Map<number, number> } {
  const s = b.snap!; const cols = L.map[0].length;
  const ice = new Set(b.ice);
  const solid = (tx: number, ty: number) => playerTileSolid(L, tx, ty, (x, y) => ice.has(y * cols + x), !!s.gate, !!s.exit);
  const d = new Map<number, number>() as Map<number, number> & { prev: Map<number, number> };
  d.prev = new Map();
  const q: [number, number][] = [from]; d.set(from[1] * cols + from[0], 0);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * cols + nx;
      if (d.has(k) || solid(nx, ny)) continue;
      d.set(k, d.get(y * cols + x)! + 1); d.prev.set(k, y * cols + x); q.push([nx, ny]);
    }
  }
  return d;
}

function step(L: LevelDef, b: Bot) {
  const s = b.snap; if (!s) return;
  const me = s.p.find((p) => p.id === b.id); if (!me || !s.st) return; // ignore lobby snapshots
  // a kid is asking: answer correctly
  if (me.qz >= 0) { if (b.seq % 15 === 0) send(b, { t: 'answer', i: QUESTIONS[me.qz].a }); b.seq++; return; }
  const cols = L.map[0].length;
  // drop finished goals
  if (process.env.VERBOSE) for (const g of b.goals) if (g.kind === "station" && (s.st[g.idx] ?? 1) >= 1) console.log("   drop station", b.role, g.idx, JSON.stringify(s.st), s.time);
  b.goals = b.goals.filter((g) => (g.kind === 'item' ? !s.taken.includes(g.idx) : g.kind === 'station' ? (s.st[g.idx] ?? 1) < 1 : true));
  const exitOpen = !!s.exit;
  const mt: [number, number] = [tileOf(me.x), tileOf(me.y)];
  const d = dist(L, b, mt);
  const avail = b.goals.filter((g) => (g.kind === 'exit' ? exitOpen : true) && d.has(g.ty * cols + g.tx));
  avail.sort((a, c) => (a.kind === 'station' ? -1 : 0) - (c.kind === 'station' ? -1 : 0) || d.get(a.ty * cols + a.tx)! - d.get(c.ty * cols + c.tx)!);
  const g = avail[0];
  if (!g) return;
  const atCenter = mt[0] === g.tx && mt[1] === g.ty && Math.hypot(me.x - tileCenter(g.tx), me.y - tileCenter(g.ty)) < 6;
  if (atCenter) {
    // waiting on station / exit / pickup. stations need INTERACT (re-press if interrupted)
    if (g.kind === 'station' && me.ti !== g.idx && b.seq++ % 10 === 0) send(b, { t: 'act', a: 'interact' });
    return;
  }
  // next step on the BFS path
  let k = g.ty * cols + g.tx; const startK = mt[1] * cols + mt[0];
  let nextK = k;
  while (d.prev.has(k) && d.prev.get(k) !== startK) { k = d.prev.get(k)!; }
  nextK = k === startK ? g.ty * cols + g.tx : k;
  let nx = nextK % cols, ny = Math.floor(nextK / cols);
  if (mt[0] === g.tx && mt[1] === g.ty) { nx = g.tx; ny = g.ty; }
  // first centre on the current tile if we are off-axis
  let tx = tileCenter(nx), ty = tileCenter(ny);
  const offX = Math.abs(me.x - tileCenter(mt[0])), offY = Math.abs(me.y - tileCenter(mt[1]));
  if (nx !== mt[0] && offY > 4) { tx = tileCenter(mt[0]); ty = tileCenter(mt[1]); }
  if (ny !== mt[1] && offX > 4) { tx = tileCenter(mt[0]); ty = tileCenter(mt[1]); }
  const ddx = tx - me.x, ddy = ty - me.y;
  let dx = Math.abs(ddx) > 3.5 ? Math.sign(ddx) : 0, dy = Math.abs(ddy) > 3.5 ? Math.sign(ddy) : 0;
  if (dx && dy) { if (Math.abs(ddx) > Math.abs(ddy)) dy = 0; else dx = 0; }
  if (dx || dy) send(b, { t: 'input', seq: ++b.seq, dx, dy });
}

function goalsFor(L: LevelDef, role: Role, solo = false): Goal[] {
  const out: Goal[] = [];
  let shared = 0;
  L.items.forEach((it, i) => {
    const o = ITEM_OWNER[it.kind];
    if (o === role || (solo && o !== 'both')) out.push({ tx: it.tx, ty: it.ty, kind: 'item', idx: i });
    if (o === 'both') { if (solo || (shared++ % 2 === 0) === (role === 'david')) out.push({ tx: it.tx, ty: it.ty, kind: 'item', idx: i }); }
  });
  let si = 0;
  for (let ty = 0; ty < L.map.length; ty++) for (let tx = 0; tx < L.map[0].length; tx++) {
    const c = tileAt(L, tx, ty);
    if (STATION_CODES.includes(c)) {
      const role0 = TASKS[TASK_BY_CODE[c]].role;
      if (solo || (role0 ? role0 === role : (si % 2 === 0) === (role === 'david'))) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [tx + dx, ty + dy]).find(([x, y]) => tileAt(L, x, y) === '.')!;
        out.push({ tx: adj[0], ty: adj[1], kind: 'station', idx: si });
      }
      si++;
    }
  }
  let ex = 0; for (let tx = 0; tx < L.map[0].length; tx++) if (tileAt(L, tx, 0) === 'E') { ex = tx; break; }
  out.push({ tx: ex + (role === 'david' ? 0 : 1), ty: 0, kind: 'exit', idx: 0 });
  return out;
}

async function run(L: LevelDef): Promise<boolean> {
  const a = await mk('david'), n = await mk('nemanja');
  send(a, { t: 'create', role: 'david', progress: [] }); await sleep(150);
  send(n, { t: 'join', code: a.code, role: 'nemanja', progress: [] }); await sleep(150);
  send(a, { t: 'debug', cmd: 'unlockAll' }); await sleep(80);
  send(a, { t: 'pickLevel', id: L.id }); await sleep(80);
  send(a, { t: 'ready', v: true }); send(n, { t: 'ready', v: true }); await sleep(400);
  a.goals = goalsFor(L, 'david'); n.goals = goalsFor(L, 'nemanja');
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000 && !a.msgs.some((m) => m.t === 'complete')) { step(L, a); step(L, n); await sleep(33); }
  const ok = a.msgs.some((m) => m.t === 'complete');
  if (!ok && process.env.VERBOSE) for (const b of [a, n]) {
    const me = b.snap?.p.find((p) => p.id === b.id);
    console.log(`   st=${JSON.stringify(b.snap?.st)} gate=${b.snap?.gate} kids=${JSON.stringify(b.snap?.e.map((e) => e.ty + ":" + e.s))}`);
    console.log(`   ${b.role} at ${me && [tileOf(me.x), tileOf(me.y), me.x.toFixed(1), me.y.toFixed(1)]} goals`, b.goals.map((g) => `${g.kind}@${g.tx},${g.ty}`).join(' '));
  }
  const wrong = a.events.filter((e) => e.k === 'collect' && ITEM_OWNER[L.items[e.item].kind] !== 'both' &&
    ITEM_OWNER[L.items[e.item].kind] !== (e.by === a.id ? 'david' : 'nemanja')).length;
  console.log(`${ok && !wrong ? 'PASS' : 'FAIL'}  ${L.id.padEnd(8)} ${L.name.padEnd(16)} ${ok ? 'complete in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' : 'NOT complete'}  ` +
    `collected ${a.events.filter((e) => e.k === 'collect').length}/${L.items.length}, gate ${a.events.some((e) => e.k === 'gate') ? 'opened' : '-'}, tasks ${a.events.filter((e) => e.k === 'station').length}, quizzes ${a.events.filter((e) => e.k === 'quizResult' && e.ok).length}${wrong ? ', WRONG OWNER' : ''}`);
  a.ws.close(); n.ws.close();
  return ok && !wrong;
}

/** one bot plays the level alone in a SOLO room */
async function runSolo(L: LevelDef): Promise<boolean> {
  const a = await mk('nemanja');
  send(a, { t: 'create', role: 'nemanja', progress: [], solo: true }); await sleep(150);
  send(a, { t: 'debug', cmd: 'unlockAll' }); await sleep(80);
  send(a, { t: 'pickLevel', id: L.id }); await sleep(80);
  send(a, { t: 'ready', v: true }); await sleep(400);
  a.goals = goalsFor(L, 'nemanja', true);
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && !a.msgs.some((m) => m.t === 'complete')) { step(L, a); await sleep(33); }
  const ok = a.msgs.some((m) => m.t === 'complete');
  console.log(`${ok ? 'PASS' : 'FAIL'}  SOLO ${L.id.padEnd(14)} ${ok ? 'complete in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' : 'NOT complete'}  collected ${a.events.filter((e) => e.k === 'collect').length}/${L.items.length}, tasks ${a.events.filter((e) => e.k === 'station').length}`);
  a.ws.close();
  return ok;
}

const list = process.env.LEVEL ? [LEVELS[process.env.LEVEL]] : LEVEL_ORDER.filter((l) => !l.boss);
let fails = 0;
for (const L of list) if (!(await (process.env.SOLO ? runSolo(L) : run(L)))) fails++;
console.log(fails ? `\n${fails} LEVEL(S) FAILED` : '\nALL LEVELS PLAYABLE');
process.exit(fails ? 1 : 0);
