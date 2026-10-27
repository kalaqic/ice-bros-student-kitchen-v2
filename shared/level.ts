import type { Dir, Role } from './types.ts';
import type { ItemKind } from './items.ts';
import { TASK_BY_CODE } from './tasks.ts';
import { stageDef } from './stages.ts';

/**
 * Map legend
 *  #  wall            .  floor           E  exit door (opens when all food is collected)
 *  C  counter         F  fridge          S  stove        K  sink        T  table
 *  H  bookshelf       W  washing machine X  boss carpet (solid)
 *  G  gate (opens when every task station of the level is done)
 *  Task stations (see shared/tasks.ts): L coding (David)  A gaming (Nemanja)
 *      M math  Y history  V slovenian  Q chemistry  U exam   (both players)
 *
 * Raw campaign maps may also contain entities, which buildLevel() turns into floor + data:
 *  p protein  c creatine  m meal prep   (David)      z pizza  b burger  s soda (Nemanja)
 *  n noodles (shared)  k coffee pickup  1-6 enemies (index into the stage roster)  D / N spawns
 */
export type TileCode = string;
export type Theme = 'kitchen' | 'canteen' | 'dorm' | 'library' | 'laundry' | 'lab' | 'gym' | 'arcade' | 'office' | 'school' | 'kids' | 'city';
export type BossType = 'hrana' | 'sonja' | 'branka' | 'collector';

export interface LevelDef {
  id: string;
  number: number;
  stage: number;
  name: string;
  subtitle: string;
  map: string[];
  spawns: Record<Role, { tx: number; ty: number }>;
  items: { kind: ItemKind; tx: number; ty: number }[];
  coffee: { tx: number; ty: number }[];
  enemies: { type: string; tx: number; ty: number; dir: Dir; speed: number }[];
  intro: string;
  theme: Theme;
  /** boss levels have no food/exit: beating the boss completes the level (and the stage) */
  boss?: { type: BossType; hp: number };
  /** dark level: only circles of light around the players are visible */
  dark?: boolean;
}

export const STATION_CODES: string[] = Object.keys(TASK_BY_CODE);
export const SOLID_STATIC = new Set<string>(['#', 'C', 'F', 'S', 'K', 'T', 'H', 'W', 'X', ...STATION_CODES]);

export function tileAt(level: LevelDef, tx: number, ty: number): TileCode {
  if (ty < 0 || ty >= level.map.length || tx < 0 || tx >= level.map[0].length) return '#';
  return level.map[ty][tx];
}
export const levelCols = (l: LevelDef) => l.map[0].length;
export const levelRows = (l: LevelDef) => l.map.length;

/** Player collision for a tile, used identically by the server sim and client prediction. */
export function playerTileSolid(
  level: LevelDef, tx: number, ty: number, iceAt: (tx: number, ty: number) => boolean, gateOpen: boolean, exitOpen: boolean,
): boolean {
  const c = tileAt(level, tx, ty);
  if (SOLID_STATIC.has(c)) return true;
  if (c === 'G' && !gateOpen) return true;
  if (c === 'E' && !exitOpen) return true;
  return iceAt(tx, ty);
}

// ------------------------------------------------------------------ campaign map builder
export interface RawLevel {
  id: string; number: number; stage: number; name: string; subtitle: string; intro: string; theme: Theme;
  map: string[];
  /** % speed tweak on top of the enemy catalogue speed (difficulty comes from mechanics, not this) */
  enemySpeed?: number;
  boss?: LevelDef['boss'];
  /** dark level: you only see a circle of light around each player */
  dark?: boolean;
}
const ITEM_CHARS: Record<string, ItemKind> = { p: 'protein', c: 'creatine', m: 'mealprep', z: 'pizza', b: 'burger', s: 'soda', n: 'noodles' };

export function buildLevel(r: RawLevel, speedOf: (type: string) => number): LevelDef {
  const L: LevelDef = {
    id: r.id, number: r.number, stage: r.stage, name: r.name, subtitle: r.subtitle, intro: r.intro, theme: r.theme, boss: r.boss, dark: r.dark,
    map: [], spawns: { david: { tx: 1, ty: 1 }, nemanja: { tx: 2, ty: 1 } }, items: [], coffee: [], enemies: [],
  };
  const roster = stageDef(r.stage).roster;
  const mult = (r.enemySpeed ?? 100) / 100;
  r.map.forEach((row, ty) => {
    let out = '';
    [...row].forEach((ch, tx) => {
      if (ITEM_CHARS[ch]) { L.items.push({ kind: ITEM_CHARS[ch], tx, ty }); out += '.'; }
      else if (ch === 'k') { L.coffee.push({ tx, ty }); out += '.'; }
      else if (ch >= '1' && ch <= '6') { const t = roster[Number(ch) - 1]; L.enemies.push({ type: t, tx, ty, dir: 0, speed: Math.round(speedOf(t) * mult) }); out += '.'; }
      else if (ch === 'D') { L.spawns.david = { tx, ty }; out += '.'; }
      else if (ch === 'N') { L.spawns.nemanja = { tx, ty }; out += '.'; }
      else out += ch;
    });
    L.map.push(out);
  });
  if (!L.boss) balanceFood(L);
  return L;
}

/** every normal level: the same amount of food, the same for both players */
export const FOOD_PER_PLAYER = 6;          // 2 of each of the character's 3 kinds
export const FOOD_SHARED = 2;              // noodles, either player
const FOOD_KINDS: Record<'david' | 'nemanja', ItemKind[]> = { david: ['protein', 'creatine', 'mealprep'], nemanja: ['pizza', 'burger', 'soda'] };

/**
 * Deterministic (server and client build identical levels): keeps the map's item spots where possible,
 * adds / drops spots with farthest-point sampling so the food stays spread over the whole map,
 * then hands the spots out alternately to David and Nemanja along a snake path through the map.
 */
function balanceFood(L: LevelDef) {
  const total = FOOD_PER_PLAYER * 2 + FOOD_SHARED;
  const cols = L.map[0].length, rows = L.map.length;
  const key = (x: number, y: number) => y * cols + x;
  // reachable floor (gates count as open, like checkLevel)
  const reach = new Set<number>([key(L.spawns.david.tx, L.spawns.david.ty)]);
  const q: [number, number][] = [[L.spawns.david.tx, L.spawns.david.ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = L.map[ny]?.[nx];
      if (reach.has(key(nx, ny)) || !(c === '.' || c === 'G' || c === 'E')) continue;
      reach.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  const taken = new Set<number>([
    key(L.spawns.david.tx, L.spawns.david.ty), key(L.spawns.nemanja.tx, L.spawns.nemanja.ty),
    ...L.coffee.map((c) => key(c.tx, c.ty)), ...L.enemies.map((e) => key(e.tx, e.ty)),
  ]);
  const d2 = (a: { tx: number; ty: number }, b: { tx: number; ty: number }) => (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2;
  const noodles = L.items.filter((i) => i.kind === 'noodles').slice(0, FOOD_SHARED).map((i) => ({ tx: i.tx, ty: i.ty }));
  const chosen: { tx: number; ty: number }[] = [...noodles];
  const anchors = [{ tx: L.spawns.david.tx, ty: L.spawns.david.ty }, { tx: L.spawns.nemanja.tx, ty: L.spawns.nemanja.ty }];
  const pickFrom = (pool: { tx: number; ty: number }[]) => {
    const left = pool.filter((p) => !chosen.some((c) => c.tx === p.tx && c.ty === p.ty));
    while (chosen.length < total && left.length) {
      let bi = 0, bv = -1;
      left.forEach((p, i) => {
        const v = Math.min(...[...chosen, ...anchors].map((c) => d2(c, p)));
        if (v > bv || (v === bv && key(p.tx, p.ty) < key(left[bi].tx, left[bi].ty))) { bv = v; bi = i; }
      });
      chosen.push(left.splice(bi, 1)[0]);
    }
  };
  pickFrom(L.items.map((i) => ({ tx: i.tx, ty: i.ty })));                    // the map's own spots first
  const free: { tx: number; ty: number }[] = [];
  for (let ty = 1; ty < rows - 1; ty++) for (let tx = 1; tx < cols - 1; tx++) {
    if (L.map[ty][tx] === '.' && reach.has(key(tx, ty)) && !taken.has(key(tx, ty))) free.push({ tx, ty });
  }
  pickFrom(free);                                                           // top up thin levels
  // shared noodles: keep the designed ones, otherwise the spots nearest the middle
  const mid = { tx: cols / 2, ty: rows / 2 };
  const shared = [...noodles];
  const rest = chosen.filter((c) => !shared.includes(c));
  rest.sort((a, b) => d2(a, mid) - d2(b, mid));
  while (shared.length < FOOD_SHARED && rest.length) shared.push(rest.shift()!);
  // snake order through the map, alternate owners -> both get food everywhere
  rest.sort((a, b) => a.ty - b.ty || (a.ty % 2 ? b.tx - a.tx : a.tx - b.tx));
  const out: LevelDef['items'] = shared.map((p) => ({ kind: 'noodles' as ItemKind, tx: p.tx, ty: p.ty }));
  const n = { david: 0, nemanja: 0 };
  rest.forEach((p, i) => {
    const who = i % 2 === 0 ? 'david' : 'nemanja';
    out.push({ kind: FOOD_KINDS[who][n[who]++ % 3], tx: p.tx, ty: p.ty });
  });
  L.items = out;
}

const KNOWN = new Set(['#', '.', 'E', 'G', 'C', 'F', 'S', 'K', 'T', 'H', 'W', 'X', ...STATION_CODES]);

/** Throws on broken maps: bad row lengths, unknown tiles, unreachable items/stations. */
export function checkLevel(L: LevelDef): void {
  const cols = levelCols(L), rows = levelRows(L);
  L.map.forEach((row, i) => {
    if (row.length !== cols) throw new Error(`${L.id}: row ${i} has ${row.length} cols (expected ${cols})`);
    for (const ch of row) if (!KNOWN.has(ch)) throw new Error(`${L.id}: unknown tile '${ch}' in row ${i}`);
  });
  const floor = (tx: number, ty: number, what: string) => {
    if (tileAt(L, tx, ty) !== '.') throw new Error(`${L.id}: ${what} at ${tx},${ty} is on '${tileAt(L, tx, ty)}'`);
  };
  L.items.forEach((it) => floor(it.tx, it.ty, it.kind));
  L.coffee.forEach((c) => floor(c.tx, c.ty, 'coffee'));
  L.enemies.forEach((e) => floor(e.tx, e.ty, e.type));
  floor(L.spawns.david.tx, L.spawns.david.ty, 'spawn david');
  floor(L.spawns.nemanja.tx, L.spawns.nemanja.ty, 'spawn nemanja');
  const seen = new Set<number>();
  const q: [number, number][] = [[L.spawns.david.tx, L.spawns.david.ty]];
  seen.add(L.spawns.david.ty * cols + L.spawns.david.tx);
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, c = tileAt(L, nx, ny);
      if (seen.has(ny * cols + nx) || !(c === '.' || c === 'G' || c === 'E')) continue;
      seen.add(ny * cols + nx); q.push([nx, ny]);
    }
  }
  const reach = (tx: number, ty: number) => seen.has(ty * cols + tx);
  const need = (tx: number, ty: number, what: string) => { if (!reach(tx, ty)) throw new Error(`${L.id}: ${what} at ${tx},${ty} is unreachable`); };
  L.items.forEach((it) => need(it.tx, it.ty, it.kind));
  L.coffee.forEach((c) => need(c.tx, c.ty, 'coffee'));
  need(L.spawns.nemanja.tx, L.spawns.nemanja.ty, 'spawn nemanja');
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const c = tileAt(L, tx, ty);
    if (STATION_CODES.includes(c)) {
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach(tx + dx, ty + dy))) throw new Error(`${L.id}: station at ${tx},${ty} unreachable`);
    }
    if (c === 'E' && !L.boss && !reach(tx, ty)) throw new Error(`${L.id}: exit unreachable`);
  }
  if (!L.boss && !L.map[0].includes('E')) throw new Error(`${L.id}: no exit in the top wall`);
  // every task station must be reachable with the gates still CLOSED (gates open only after all tasks -> deadlock otherwise)
  const pre = new Set<number>([L.spawns.david.ty * cols + L.spawns.david.tx]);
  const q2: [number, number][] = [[L.spawns.david.tx, L.spawns.david.ty]];
  while (q2.length) {
    const [x, y] = q2.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (pre.has(ny * cols + nx) || tileAt(L, nx, ny) !== '.') continue;
      pre.add(ny * cols + nx); q2.push([nx, ny]);
    }
  }
  if (!pre.has(L.spawns.nemanja.ty * cols + L.spawns.nemanja.tx)) throw new Error(`${L.id}: nemanja starts in a closed-off area`);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    if (STATION_CODES.includes(tileAt(L, tx, ty)) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pre.has((ty + dy) * cols + tx + dx)))
      throw new Error(`${L.id}: station at ${tx},${ty} can only be reached through a gate`);
  }
}
