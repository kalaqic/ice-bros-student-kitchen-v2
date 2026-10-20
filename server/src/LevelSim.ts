import {
  CAMERA_COOLDOWN_MS, CAMERA_RADIUS, COFFEE_COOLDOWN_MS, COFFEE_MAX, COFFEE_START, DISGUST_SLOW_MS, DRINK_MS,
  DT, ENEMY_HIT_RANGE, HIT_HH, HIT_HW, ICE_COOLDOWN_MS, ICE_MAX_LEN, INVULN_MS, KNOCKBACK_PX, KO_SELF_REVIVE_MS, MAX_HP,
  PICKUP_RANGE, REVIVE_MS, REVIVE_RANGE, SPAWN_INVULN_MS, STATION_MS, STATION_RANGE, STUN_MS, TILE,
} from '../../shared/constants.ts';
import { COLLECT_LINES, DISGUST_LINES, ITEM_OWNER, type ItemKind } from '../../shared/items.ts';
import { type LevelDef, type TileCode, SOLID_STATIC, STATION_CODES, checkLevel, levelCols, levelRows, playerTileSolid, tileAt } from '../../shared/level.ts';
import { boxBlocked, moveBox, stepPlayer, tileCenter, tileOf, type SolidFn } from '../../shared/physics.ts';
import type { CompleteStats, EnemySnap, GameEvent, PlayerSnap } from '../../shared/protocol.ts';
import { DIRS, type Dir, type Role, roleName } from '../../shared/types.ts';
import type { Player } from './Player.ts';
import { BrankaSim } from './Boss.ts';

interface Enemy {
  i: number; type: string; speed: number;
  x: number; y: number; tx: number; ty: number; // current tile (the one we are leaving / standing on)
  nx: number; ny: number; // target tile
  dir: Dir; stunUntil: number; hitCooldownUntil: number;
}
interface Item { kind: ItemKind; tx: number; ty: number; taken: boolean; by?: string }
interface Station { code: TileCode; role: Role; tx: number; ty: number; progress: number; done: boolean }

/** Debug/testing switch: enemies still move but never hurt (used by tools/playthrough-test.ts). */
const PEACEFUL = process.env.ICEBROS_PEACEFUL === '1';
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class LevelSim {
  readonly cols: number;
  readonly rows: number;
  now = 0; // simulation clock (ms) - stops while paused
  ice: Uint8Array;
  iceVersion = 1;
  items: Item[] = [];
  coffee: { tx: number; ty: number; taken: boolean }[] = [];
  enemies: Enemy[] = [];
  stations: Station[] = [];
  gateOpen = false;
  exitOpen = false;
  events: GameEvent[] = [];
  failAt = 0;
  completed = false;
  boss: BrankaSim | null = null;
  private coffeeRespawnAt = 0;
  stats!: CompleteStats;
  private sayCooldown = new Map<string, number>();

  constructor(readonly level: LevelDef, readonly players: Player[]) {
    this.cols = levelCols(level);
    this.rows = levelRows(level);
    this.ice = new Uint8Array(this.cols * this.rows);
    this.reset();
  }

  reset() {
    const L = this.level;
    this.now = 0;
    this.ice.fill(0);
    this.iceVersion++;
    this.items = L.items.map((it) => ({ ...it, taken: false }));
    this.coffee = L.coffee.map((c) => ({ ...c, taken: false }));
    this.enemies = L.enemies.map((e, i) => ({
      i, type: e.type, speed: e.speed, x: tileCenter(e.tx), y: tileCenter(e.ty), tx: e.tx, ty: e.ty, nx: e.tx, ny: e.ty,
      dir: e.dir, stunUntil: 0, hitCooldownUntil: 0,
    }));
    this.stations = [];
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const c = tileAt(L, tx, ty);
      if (STATION_CODES.includes(c) && L.stations[c]) this.stations.push({ code: c, role: L.stations[c]!.role, tx, ty, progress: 0, done: false });
    }
    this.gateOpen = this.stations.length === 0 || !L.map.some((r) => r.includes('G'));
    this.boss = L.boss ? new BrankaSim(this, L.boss.hp) : null;
    this.coffeeRespawnAt = 20000;
    this.exitOpen = false;
    this.failAt = 0;
    this.completed = false;
    this.stats = {
      timeMs: 0,
      perPlayer: {
        david: { food: 0, ice: 0, flashes: 0, coffee: 0, hits: 0 },
        nemanja: { food: 0, ice: 0, flashes: 0, coffee: 0, hits: 0 },
      },
    };
    for (const p of this.players) this.resetPlayer(p);
  }

  resetPlayer(p: Player) {
    const s = this.level.spawns[p.role];
    p.x = tileCenter(s.tx); p.y = tileCenter(s.ty); p.facing = 3;
    p.hp = MAX_HP; p.coffee = COFFEE_START; p.camReadyAt = 0; p.slowUntil = 0; p.drinkUntil = 0; p.healPending = false;
    p.coffeeReadyAt = 0; p.invulnUntil = SPAWN_INVULN_MS; p.ko = false; p.koUntil = 0; p.reviveMs = 0; p.iceReadyAt = 0;
    p.collected = 0; p.lastDisgustAt = -99999; p.moving = false;
  }

  // ------------------------------------------------------------------ solidity
  idx(tx: number, ty: number) { return ty * this.cols + tx; }
  private iceAt = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows && this.ice[this.idx(tx, ty)] === 1;
  tileSolidForPlayer(tx: number, ty: number): boolean {
    return playerTileSolid(this.level, tx, ty, this.iceAt, this.gateOpen, this.exitOpen);
  }
  solid: SolidFn = (x, y) => this.tileSolidForPlayer(tileOf(x), tileOf(y));

  private tileBlockedForEnemy(tx: number, ty: number, self?: Enemy): boolean {
    const c = tileAt(this.level, tx, ty);
    if (c === 'E' || c === 'G' || SOLID_STATIC.has(c)) return true;
    if (this.ice[this.idx(tx, ty)]) return true;
    for (const e of this.enemies) {
      if (e === self) continue;
      if ((e.tx === tx && e.ty === ty) || (e.nx === tx && e.ny === ty)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ actions
  actIce(p: Player) {
    if (!this.canAct(p) || this.now < p.iceReadyAt) return;
    p.iceReadyAt = this.now + ICE_COOLDOWN_MS;
    const d = DIRS[p.facing];
    let tx = tileOf(p.x) + d.x;
    let ty = tileOf(p.y) + d.y;
    if (this.ice[this.idx(tx, ty)] && tileAt(this.level, tx, ty) !== '#') {
      const tiles: number[] = [];
      while (tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows && this.ice[this.idx(tx, ty)]) {
        this.ice[this.idx(tx, ty)] = 0; tiles.push(this.idx(tx, ty)); tx += d.x; ty += d.y;
      }
      this.iceVersion++;
      this.events.push({ k: 'iceBreak', tiles, by: p.id });
      return;
    }
    const tiles: number[] = [];
    for (let n = 0; n < ICE_MAX_LEN; n++) {
      if (!this.canFreeze(tx, ty, p)) break;
      this.ice[this.idx(tx, ty)] = 1; tiles.push(this.idx(tx, ty));
      tx += d.x; ty += d.y;
    }
    if (tiles.length) {
      // the actor may overlap the first tile by a few px - slide them back into their own tile
      const ox = tileOf(p.x) * TILE, oy = tileOf(p.y) * TILE;
      if (d.x > 0) p.x = Math.min(p.x, ox + TILE - HIT_HW - 0.5);
      if (d.x < 0) p.x = Math.max(p.x, ox + HIT_HW + 0.5);
      if (d.y > 0) p.y = Math.min(p.y, oy + TILE - HIT_HH - 0.5);
      if (d.y < 0) p.y = Math.max(p.y, oy + HIT_HH + 0.5);
      this.iceVersion++;
      this.stats.perPlayer[p.role].ice += tiles.length;
      this.events.push({ k: 'ice', tiles, by: p.id, dir: p.facing });
    } else this.events.push({ k: 'iceFail', by: p.id });
  }

  private canFreeze(tx: number, ty: number, actor?: Player): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    if (tileAt(this.level, tx, ty) !== '.') return false;
    if (this.ice[this.idx(tx, ty)]) return false;
    if (this.items.some((i) => !i.taken && i.tx === tx && i.ty === ty)) return false;
    if (this.coffee.some((c) => !c.taken && c.tx === tx && c.ty === ty)) return false;
    if (this.enemies.some((e) => (e.tx === tx && e.ty === ty) || (e.nx === tx && e.ny === ty) || (tileOf(e.x) === tx && tileOf(e.y) === ty))) return false;
    // player boxes overlapping the tile
    const x0 = tx * TILE, y0 = ty * TILE;
    for (const q of this.players) {
      if (q === actor && (tileOf(q.x) !== tx || tileOf(q.y) !== ty)) continue;
      if (q.x + 14 > x0 && q.x - 14 < x0 + TILE && q.y + 11 > y0 && q.y - 11 < y0 + TILE) return false;
    }
    return true;
  }

  actCoffee(p: Player) {
    if (!this.canAct(p) || this.now < p.coffeeReadyAt) return;
    if (p.coffee <= 0) return this.say(p, 'NEMA VISE KAFE!', 'warn');
    if (p.hp >= MAX_HP) return this.say(p, 'VEC SAM PUN KOFEINA', 'info');
    p.coffee--; p.drinkUntil = this.now + DRINK_MS; p.healPending = true; p.coffeeReadyAt = this.now + COFFEE_COOLDOWN_MS;
    this.stats.perPlayer[p.role].coffee++;
    this.events.push({ k: 'drink', by: p.id });
  }

  actCamera(p: Player) {
    if (!this.canAct(p) || this.now < p.camReadyAt) return;
    p.camReadyAt = this.now + CAMERA_COOLDOWN_MS;
    const cx = p.x, cy = p.y - 14;
    const stunned: number[] = [];
    for (const e of this.enemies) {
      if (Math.hypot(e.x - cx, e.y - cy) <= CAMERA_RADIUS) { e.stunUntil = this.now + STUN_MS; stunned.push(e.i); }
    }
    this.stats.perPlayer[p.role].flashes++;
    this.events.push({ k: 'flash', by: p.id, x: cx, y: cy, stunned });
    this.boss?.onFlash(p, cx, cy);
  }

  private canAct(p: Player) { return !p.ko && this.now >= p.drinkUntil && !this.completed && !this.failAt; }

  private say(p: Player, text: string, key = 'x', cooldown = 900) {
    const k = p.id + key;
    if ((this.sayCooldown.get(k) ?? -1e9) > this.now) return;
    this.sayCooldown.set(k, this.now + cooldown);
    this.events.push({ k: 'say', by: p.id, text });
  }

  // ------------------------------------------------------------------ tick
  /** Advance one fixed step. Returns true when the level was just completed. */
  tick(): boolean {
    if (this.completed) return false;
    this.now += DT * 1000;
    if (this.failAt) {
      if (this.now >= this.failAt) { this.reset(); this.events.push({ k: 'restart' }); }
      return false;
    }
    for (const p of this.players) this.tickPlayer(p);
    for (const e of this.enemies) this.tickEnemy(e);
    if (!PEACEFUL) this.checkHits();
    this.tickStations();
    if (this.boss) {
      this.boss.tick();
      // the office has a coffee machine: one cup comes back every 20 s
      if (this.now >= this.coffeeRespawnAt) {
        this.coffeeRespawnAt = this.now + 20000;
        const c = this.coffee.find((q) => q.taken);
        if (c) { c.taken = false; this.events.push({ k: 'coffeeSpawn', idx: this.coffee.indexOf(c) }); }
      }
      if (this.boss.dead && this.now >= this.boss.deadAt + 3200) {
        this.completed = true; this.stats.timeMs = this.now; return true;
      }
      if (this.players.length === 2 && this.players.every((p) => p.ko)) { this.failAt = this.now + 2600; this.events.push({ k: 'fail' }); }
      return false;
    }
    // exit / completion
    const required = this.items.length;
    const taken = this.items.filter((i) => i.taken).length;
    if (!this.exitOpen && taken === required) { this.exitOpen = true; this.events.push({ k: 'exitOpen' }); }
    if (this.exitOpen && this.players.length === 2 && this.players.every((p) => !p.ko && tileOf(p.y) === 0)) {
      this.completed = true;
      this.stats.timeMs = this.now;
      return true;
    }
    if (this.players.length === 2 && this.players.every((p) => p.ko)) {
      this.failAt = this.now + 2600;
      this.events.push({ k: 'fail' });
    }
    return false;
  }

  private tickPlayer(p: Player) {
    // movement from queued inputs (validated deltas, never client coordinates)
    const canMove = !p.ko && this.now >= p.drinkUntil;
    let processed = 0;
    p.moving = false;
    while (p.inputs.length && processed < 3) {
      const inp = p.inputs.shift()!;
      stepPlayer(p, inp, canMove, this.now < p.slowUntil, this.solid);
      if (canMove && (inp.dx || inp.dy)) p.moving = true;
      p.ack = inp.seq;
      processed++;
    }
    if (p.healPending && this.now >= p.drinkUntil) {
      p.healPending = false;
      p.hp = Math.min(MAX_HP, p.hp + 1);
      this.events.push({ k: 'heal', by: p.id });
    }
    if (p.ko) {
      const mate = this.players.find((q) => q !== p && !q.ko && q.connected);
      if (mate && Math.hypot(mate.x - p.x, mate.y - p.y) < REVIVE_RANGE) {
        p.reviveMs += DT * 1000;
        if (p.reviveMs >= REVIVE_MS) this.revive(p, mate);
      } else p.reviveMs = Math.max(0, p.reviveMs - DT * 500);
      if (p.ko && this.now >= p.koUntil) this.revive(p);
      return;
    }
    // pickups
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.taken || Math.hypot(tileCenter(it.tx) - p.x, tileCenter(it.ty) - p.y) > PICKUP_RANGE) continue;
      const owner = ITEM_OWNER[it.kind];
      if (owner === 'both' || owner === p.role) {
        it.taken = true; it.by = p.id; p.collected++;
        this.stats.perPlayer[p.role].food++;
        this.events.push({ k: 'collect', item: i, by: p.id, text: Math.random() < 0.35 ? pick(COLLECT_LINES[p.role]) : undefined });
      } else if (this.now - p.lastDisgustAt > 1800) {
        p.lastDisgustAt = this.now;
        p.slowUntil = this.now + DISGUST_SLOW_MS;
        this.events.push({ k: 'disgust', item: i, by: p.id, text: pick(DISGUST_LINES[p.role]) });
      }
    }
    for (let i = 0; i < this.coffee.length; i++) {
      const c = this.coffee[i];
      if (c.taken || Math.hypot(tileCenter(c.tx) - p.x, tileCenter(c.ty) - p.y) > PICKUP_RANGE) continue;
      if (p.coffee >= COFFEE_MAX) { this.say(p, 'KAFA PUNA. KASNIJE.', 'cofull', 2500); continue; }
      c.taken = true; p.coffee++;
      this.events.push({ k: 'coffeePickup', idx: i, by: p.id });
    }
  }

  private revive(p: Player, helper?: Player) {
    p.ko = false; p.hp = 1; p.reviveMs = 0; p.invulnUntil = this.now + 2000;
    this.events.push({ k: 'revive', by: p.id, helper: helper?.id });
  }

  private tickEnemy(e: Enemy) {
    if (this.now < e.stunUntil) return;
    const tx = tileCenter(e.nx), ty = tileCenter(e.ny);
    const dist = Math.hypot(tx - e.x, ty - e.y);
    const step = e.speed * DT;
    if (dist > step) {
      // if ice appeared on our target tile (shouldn't, canFreeze prevents) or path blocked, turn back
      e.x += ((tx - e.x) / dist) * step;
      e.y += ((ty - e.y) / dist) * step;
      return;
    }
    e.x = tx; e.y = ty; e.tx = e.nx; e.ty = e.ny;
    const next = this.chooseDir(e);
    if (next === null) return; // boxed in by ice - trapped!
    e.dir = next;
    e.nx = e.tx + DIRS[next].x; e.ny = e.ty + DIRS[next].y;
  }

  private chooseDir(e: Enemy): Dir | null {
    const opts = ([0, 1, 2, 3] as Dir[]).filter((d) => !this.tileBlockedForEnemy(e.tx + DIRS[d].x, e.ty + DIRS[d].y, e));
    if (!opts.length) return null;
    const back = ((e.dir + 2) % 4) as Dir;
    const pool = opts.length > 1 ? opts.filter((d) => d !== back) : opts;
    // light chase: sometimes step toward the nearest living player in range
    let target: Player | null = null; let best = 5 * TILE;
    for (const p of this.players) {
      if (p.ko) continue;
      const dd = Math.hypot(p.x - e.x, p.y - e.y);
      if (dd < best) { best = dd; target = p; }
    }
    if (target && Math.random() < 0.4) {
      let bd = Infinity; let bdir = pool[0];
      for (const d of pool) {
        const nx = tileCenter(e.tx + DIRS[d].x), ny = tileCenter(e.ty + DIRS[d].y);
        const dd = Math.hypot(target.x - nx, target.y - ny);
        if (dd < bd) { bd = dd; bdir = d; }
      }
      return bdir;
    }
    if (pool.includes(e.dir) && Math.random() < 0.7) return e.dir;
    return pick(pool);
  }

  private checkHits() {
    for (const p of this.players) {
      if (p.ko || this.now < p.invulnUntil) continue;
      for (const e of this.enemies) {
        if (this.now < e.stunUntil) continue;
        const d = Math.hypot(e.x - p.x, e.y - (p.y - 12));
        if (d > ENEMY_HIT_RANGE) continue;
        this.hurt(p, e.x, e.y, e.i);
        break;
      }
    }
  }

  /** One heart of damage with knockback away from (sx, sy). Used by enemies and the boss. */
  hurt(p: Player, sx: number, sy: number, enemy = -1): boolean {
    if (p.ko || this.now < p.invulnUntil || PEACEFUL) return false;
    p.hp--; p.invulnUntil = this.now + INVULN_MS;
    this.stats.perPlayer[p.role].hits++;
    p.drinkUntil = Math.min(p.drinkUntil, this.now); // a hit interrupts sipping
    if (p.healPending) { p.healPending = false; p.coffee++; }
    const ang = Math.atan2(p.y - sy, p.x - sx);
    const r = moveBox(p.x, p.y, Math.cos(ang) * KNOCKBACK_PX, Math.sin(ang) * KNOCKBACK_PX, this.solid);
    p.x = r.x; p.y = r.y;
    this.events.push({ k: 'hit', by: p.id, enemy });
    if (p.hp <= 0) {
      p.hp = 0; p.ko = true; p.koUntil = this.now + KO_SELF_REVIVE_MS; p.reviveMs = 0;
      this.events.push({ k: 'ko', by: p.id });
    }
    return true;
  }

  /** Removes one ice block (fireballs / meteors melt it). */
  meltIce(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows || !this.ice[this.idx(tx, ty)]) return false;
    this.ice[this.idx(tx, ty)] = 0; this.iceVersion++;
    this.events.push({ k: 'iceBreak', tiles: [this.idx(tx, ty)], by: '' });
    return true;
  }

  private tickStations() {
    let changed = false;
    this.stations.forEach((s, idx) => {
      if (s.done) return;
      const cx = tileCenter(s.tx), cy = tileCenter(s.ty);
      let holding = false;
      for (const p of this.players) {
        if (p.ko || Math.hypot(p.x - cx, p.y - cy) > STATION_RANGE) continue;
        if (p.role === s.role) holding = true;
        else this.say(p, s.role === 'david' ? 'TO JE DAVIDOV KOD. NE DIRAM.' : 'TO JE NEMANJINA ARKADA.', 'st' + idx, 4000);
      }
      if (holding) s.progress = Math.min(1, s.progress + (DT * 1000) / STATION_MS);
      else s.progress = Math.max(0, s.progress - DT * 0.4);
      if (s.progress >= 1) {
        s.done = true; changed = true;
        const p = this.players.find((q) => q.role === s.role);
        this.events.push({ k: 'station', idx, by: p?.id ?? '' });
      }
    });
    if (changed && !this.gateOpen && this.stations.every((s) => s.done)) {
      this.gateOpen = true;
      this.events.push({ k: 'gate' });
    }
  }

  // ------------------------------------------------------------------ snapshot helpers
  playerSnap(p: Player): PlayerSnap {
    return {
      id: p.id, role: p.role, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, f: p.facing, m: p.moving ? 1 : 0,
      hp: p.hp, cof: p.coffee, cam: Math.max(0, Math.round(p.camReadyAt - this.now)),
      sl: this.now < p.slowUntil ? 1 : 0, dr: this.now < p.drinkUntil ? 1 : 0, inv: this.now < p.invulnUntil ? 1 : 0,
      ko: p.ko ? 1 : 0, rv: Math.round((p.reviveMs / REVIVE_MS) * 100) / 100, ack: p.ack, col: p.collected, c: p.connected ? 1 : 0,
    };
  }
  enemySnaps(): EnemySnap[] {
    return this.enemies.map((e) => ({ i: e.i, x: Math.round(e.x), y: Math.round(e.y), d: e.dir, st: Math.max(0, Math.round(e.stunUntil - this.now)) }));
  }
  iceList(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.ice.length; i++) if (this.ice[i]) out.push(i);
    return out;
  }
  playerName(id: string) { const p = this.players.find((q) => q.id === id); return p ? roleName(p.role) : '?'; }
}

/** Sanity check level data at boot so typos in maps fail loudly. */
export function validateLevel(L: LevelDef) {
  checkLevel(L);
  const cols = levelCols(L);
  L.map.forEach((row, i) => { if (row.length !== cols) throw new Error(`${L.id}: row ${i} has ${row.length} cols`); });
  const floor = (tx: number, ty: number, what: string) => {
    if (tileAt(L, tx, ty) !== '.') throw new Error(`${L.id}: ${what} at ${tx},${ty} is on '${tileAt(L, tx, ty)}'`);
  };
  L.items.forEach((it) => floor(it.tx, it.ty, it.kind));
  L.coffee.forEach((c) => floor(c.tx, c.ty, 'coffee'));
  L.enemies.forEach((e) => floor(e.tx, e.ty, e.type));
  floor(L.spawns.david.tx, L.spawns.david.ty, 'spawn david');
  floor(L.spawns.nemanja.tx, L.spawns.nemanja.ty, 'spawn nemanja');
  void boxBlocked;
}
