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
}
const ITEM_CHARS: Record<string, ItemKind> = { p: 'protein', c: 'creatine', m: 'mealprep', z: 'pizza', b: 'burger', s: 'soda', n: 'noodles' };

export function buildLevel(r: RawLevel, speedOf: (type: string) => number): LevelDef {
  const L: LevelDef = {
    id: r.id, number: r.number, stage: r.stage, name: r.name, subtitle: r.subtitle, intro: r.intro, theme: r.theme, boss: r.boss,
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
  return L;
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
