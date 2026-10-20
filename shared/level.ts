import type { Dir, Role } from './types.ts';
import type { ItemKind } from './items.ts';

/**
 * Map legend
 *  #  wall            .  floor           E  exit door (opens when all food is collected)
 *  C  counter         F  fridge          S  stove        K  sink        T  table
 *  G  gate (opens when every station of the level is activated)
 *  L  David station (coding terminal)    A  Nemanja station (arcade cabinet)
 *  H  bookshelf       W  washing machine X  boss office carpet (solid)
 *
 * Raw campaign maps may also contain entities, which buildLevel() turns into floor + data:
 *  p protein  c creatine  m meal prep   (David)      z pizza  b burger  s soda (Nemanja)
 *  n noodles (shared)  k coffee pickup  1-6 enemies  D / N spawn points
 */
export type TileCode = '#' | '.' | 'E' | 'C' | 'F' | 'S' | 'K' | 'T' | 'G' | 'L' | 'A' | 'H' | 'W' | 'X';
export type Theme = 'kitchen' | 'canteen' | 'dorm' | 'library' | 'laundry' | 'lab' | 'gym' | 'arcade' | 'office';

export type EnemyType = 'mold' | 'yogurt' | 'dishes';

export interface StationDef {
  role: Role;
  kind: 'terminal' | 'arcade';
  label: string;
}

export interface LevelDef {
  id: string;
  number: number;
  name: string;
  subtitle: string;
  map: string[];
  spawns: Record<Role, { tx: number; ty: number }>;
  items: { kind: ItemKind; tx: number; ty: number }[];
  coffee: { tx: number; ty: number }[];
  enemies: { type: EnemyType; tx: number; ty: number; dir: Dir; speed: number }[];
  /** station definitions by map letter; all stations must be done to open every 'G' */
  stations: Partial<Record<TileCode, StationDef>>;
  intro: string;
  theme: Theme;
  /** boss levels have no food/exit: beating the boss completes the level */
  boss?: { type: 'branka'; hp: number };
}

export const SOLID_STATIC = new Set<TileCode>(['#', 'C', 'F', 'S', 'K', 'T', 'L', 'A', 'H', 'W', 'X']);
export const STATION_CODES: TileCode[] = ['L', 'A'];

export function tileAt(level: LevelDef, tx: number, ty: number): TileCode {
  if (ty < 0 || ty >= level.map.length || tx < 0 || tx >= level.map[0].length) return '#';
  return level.map[ty][tx] as TileCode;
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
  id: string; number: number; name: string; subtitle: string; intro: string; theme: Theme;
  map: string[];
  enemySpeed?: number;
  boss?: LevelDef['boss'];
}
const ITEM_CHARS: Record<string, ItemKind> = { p: 'protein', c: 'creatine', m: 'mealprep', z: 'pizza', b: 'burger', s: 'soda', n: 'noodles' };
const ENEMY_CHARS: Record<string, EnemyType> = { 1: 'mold', 2: 'yogurt', 3: 'dishes', 4: 'mold', 5: 'yogurt', 6: 'dishes' };
const ENEMY_SPEED: Record<EnemyType, number> = { mold: 0, yogurt: -4, dishes: -12 };

export function buildLevel(r: RawLevel): LevelDef {
  const L: LevelDef = {
    id: r.id, number: r.number, name: r.name, subtitle: r.subtitle, intro: r.intro, theme: r.theme, boss: r.boss,
    map: [], spawns: { david: { tx: 1, ty: 1 }, nemanja: { tx: 2, ty: 1 } }, items: [], coffee: [], enemies: [],
    stations: {
      L: { role: 'david', kind: 'terminal', label: 'KOD' },
      A: { role: 'nemanja', kind: 'arcade', label: 'ARKADA' },
    },
  };
  const base = r.enemySpeed ?? 80;
  r.map.forEach((row, ty) => {
    let out = '';
    [...row].forEach((ch, tx) => {
      if (ITEM_CHARS[ch]) { L.items.push({ kind: ITEM_CHARS[ch], tx, ty }); out += '.'; }
      else if (ch === 'k') { L.coffee.push({ tx, ty }); out += '.'; }
      else if (ENEMY_CHARS[ch]) { const t = ENEMY_CHARS[ch]; L.enemies.push({ type: t, tx, ty, dir: 0, speed: base + ENEMY_SPEED[t] }); out += '.'; }
      else if (ch === 'D') { L.spawns.david = { tx, ty }; out += '.'; }
      else if (ch === 'N') { L.spawns.nemanja = { tx, ty }; out += '.'; }
      else out += ch;
    });
    L.map.push(out);
  });
  return L;
}

/** Throws on broken maps: bad row lengths, unknown tiles, unreachable items/stations. */
export function checkLevel(L: LevelDef): void {
  const cols = levelCols(L), rows = levelRows(L);
  L.map.forEach((row, i) => {
    if (row.length !== cols) throw new Error(`${L.id}: row ${i} has ${row.length} cols (expected ${cols})`);
    for (const ch of row) if (!'#.ECFSKTGLAHWX'.includes(ch)) throw new Error(`${L.id}: unknown tile '${ch}' in row ${i}`);
  });
  const floor = (tx: number, ty: number, what: string) => {
    if (tileAt(L, tx, ty) !== '.') throw new Error(`${L.id}: ${what} at ${tx},${ty} is on '${tileAt(L, tx, ty)}'`);
  };
  L.items.forEach((it) => floor(it.tx, it.ty, it.kind));
  L.coffee.forEach((c) => floor(c.tx, c.ty, 'coffee'));
  L.enemies.forEach((e) => floor(e.tx, e.ty, e.type));
  floor(L.spawns.david.tx, L.spawns.david.ty, 'spawn david');
  floor(L.spawns.nemanja.tx, L.spawns.nemanja.ty, 'spawn nemanja');
  // reachability (gates and exit count as passable - they open during play)
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
    if (c === 'L' || c === 'A') {
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach(tx + dx, ty + dy))) throw new Error(`${L.id}: station at ${tx},${ty} unreachable`);
    }
    if (c === 'E' && !L.boss && !reach(tx, ty)) throw new Error(`${L.id}: exit unreachable`);
  }
  if (!L.boss && !L.map[0].includes('E')) throw new Error(`${L.id}: no exit in the top wall`);
}
