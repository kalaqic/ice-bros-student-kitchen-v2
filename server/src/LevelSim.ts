import {
  COFFEE_COOLDOWN_MS, COFFEE_MAX, COFFEE_START, DEBT_COOLDOWN_MULT, DISGUST_SLOW_MS, DRINK_MS,
  DT, ENEMY_HIT_RANGE, HIT_HH, HIT_HW, ICE_COOLDOWN_MS, ICE_MAX_LEN, INVULN_MS, KNOCKBACK_PX, KO_SELF_REVIVE_MS, MAX_HP,
  PICKUP_RANGE, REVIVE_MS, REVIVE_RANGE, SPAWN_INVULN_MS, STATION_RANGE, STUN_MS, TILE, CAMERA_COOLDOWN_MS,
} from '../../shared/constants.ts';
import { CAM_RANGE, CAM_STUN, inCone, photoQuality } from '../../shared/camera.ts';
import { ENEMIES, type Ability, type EnemyDef, type ProjectileEffect, type ProjectileKind } from '../../shared/enemies.ts';
import { COLLECT_LINES, DISGUST_LINES, ITEM_OWNER, type ItemKind } from '../../shared/items.ts';
import { type LevelDef, SOLID_STATIC, STATION_CODES, checkLevel, levelCols, levelRows, playerTileSolid, tileAt } from '../../shared/level.ts';
import { moveBox, stepPlayer, tileCenter, tileOf, type SolidFn } from '../../shared/physics.ts';
import type { CompleteStats, EnemySnap, GameEvent, PlayerSnap } from '../../shared/protocol.ts';
import { QUESTIONS } from '../../shared/quiz.ts';
import { PATIENCE_REVIVE_MULT, PATIENCE_TASK_MULT, type SkillId } from '../../shared/skills.ts';
import { TASKS, TASK_BY_CODE, taskSpeed, type TaskType } from '../../shared/tasks.ts';
import { DIRS, type Dir, type Role, roleName } from '../../shared/types.ts';
import type { Player } from './Player.ts';
import { makeBoss, type BossSim } from './Boss.ts';

export interface Enemy {
  i: number; type: string; def: EnemyDef; speed: number;
  x: number; y: number; tx: number; ty: number; // current tile (the one we are leaving / standing on)
  nx: number; ny: number; // target tile
  sx: number; sy: number; // spawn tile
  dir: Dir; stunUntil: number;
  /** 0 normal, 1 ice-frozen, 2 gone, 3 telegraph, 4 kid asking, 5 kid happy, 6 dashing */
  state: number;
  cd: number[];                       // ability ready times
  tele: { a: number; until: number; ang: number } | null;
  dashUntil: number;
  trappedMs: number; frozenAt: number; respawnAt: number;
  summoned: boolean;
  // kids
  kid?: { nextAskAt: number; target: string | null; q: number; sure: boolean; satisfied: boolean; again?: string };
}
interface Item { kind: ItemKind; tx: number; ty: number; taken: boolean; by?: string }
export interface Station { code: string; task: TaskType; role?: Role; tx: number; ty: number; progress: number; done: boolean; rechargeAt: number }
export interface Projectile {
  id: number; kind: ProjectileKind; x: number; y: number; vx: number; vy: number;
  effect: ProjectileEffect; dur: number; born: number; ttl: number; homing: string | null; melts: boolean; r: number;
}
export interface Hazard {
  id: number; kind: string; x: number; y: number; r: number;
  activeAt: number; until: number; effect: ProjectileEffect | 'none'; dur: number; once: boolean; fired: boolean;
  vx: number; vy: number; hitAt: Map<string, number>;
}

/** Debug/testing switch: enemies still move but never hurt (used by tools/playthrough-test.ts). */
const PEACEFUL = process.env.ICEBROS_PEACEFUL === '1';
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const QUIZ_TIMEOUT = 15000;

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
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  gateOpen = false;
  exitOpen = false;
  /** levels with stations but no gate: tasks are part of the exit condition */
  readonly tasksGateExit: boolean;
  events: GameEvent[] = [];
  failAt = 0;
  completed = false;
  boss: BossSim | null = null;
  private coffeeRespawnAt = 0;
  stats!: CompleteStats;
  private sayCooldown = new Map<string, number>();
  private ids = 1;

  constructor(readonly level: LevelDef, readonly players: Player[], public skills: SkillId[] = ['ice', 'coffee', 'camera', 'patience']) {
    this.cols = levelCols(level);
    this.rows = levelRows(level);
    this.ice = new Uint8Array(this.cols * this.rows);
    this.tasksGateExit = level.map.some((r) => STATION_CODES.some((c) => r.includes(c))) && !level.map.some((r) => r.includes('G'));
    this.reset();
  }

  has(s: SkillId) { return this.skills.includes(s); }
  nextId() { return this.ids++; }

  reset() {
    const L = this.level;
    this.now = 0;
    this.ice.fill(0);
    this.iceVersion++;
    this.items = L.items.map((it) => ({ ...it, taken: false }));
    this.coffee = L.coffee.map((c) => ({ ...c, taken: false }));
    this.enemies = [];
    L.enemies.forEach((e) => this.spawnEnemy(e.type, e.tx, e.ty, e.speed, false, e.dir));
    this.stations = [];
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const c = tileAt(L, tx, ty);
      const task = TASK_BY_CODE[c];
      if (task) this.stations.push({ code: c, task, role: TASKS[task].role, tx, ty, progress: 0, done: false, rechargeAt: 0 });
    }
    this.gateOpen = !L.map.some((r) => r.includes('G')) || this.stations.length === 0;
    this.projectiles = []; this.hazards = [];
    this.boss = L.boss ? makeBoss(this, L.boss.type, L.boss.hp) : null;
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
    p.hp = MAX_HP; p.coffee = this.has('coffee') ? COFFEE_START : 0; p.camReadyAt = 0; p.slowUntil = 0; p.drinkUntil = 0; p.healPending = false;
    p.coffeeReadyAt = 0; p.invulnUntil = SPAWN_INVULN_MS; p.ko = false; p.koUntil = 0; p.reviveMs = 0; p.iceReadyAt = 0;
    p.collected = 0; p.lastDisgustAt = -99999; p.moving = false;
    p.stunUntil = 0; p.debtUntil = 0; p.locks = {}; p.task = -1; p.quiz = null;
  }

  spawnEnemy(type: string, tx: number, ty: number, speed?: number, summoned = false, dir: Dir = 0): Enemy {
    const def = ENEMIES[type] ?? ENEMIES.slop_blob;
    const e: Enemy = {
      i: this.enemies.length, type: def.id, def, speed: speed ?? def.speed,
      x: tileCenter(tx), y: tileCenter(ty), tx, ty, nx: tx, ny: ty, sx: tx, sy: ty, dir, stunUntil: 0, state: 0,
      cd: def.abilities.map((a) => this.now + a.cooldownMs * (0.4 + Math.random() * 0.6)), tele: null, dashUntil: 0,
      trappedMs: 0, frozenAt: 0, respawnAt: 0, summoned,
    };
    if (!def.hostile) e.kid = { nextAskAt: this.now + 5000 + Math.random() * 7000, target: null, q: Math.floor(Math.random() * QUESTIONS.length), sure: false, satisfied: false };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ solidity
  idx(tx: number, ty: number) { return ty * this.cols + tx; }
  iceAt = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows && this.ice[this.idx(tx, ty)] === 1;
  tileSolidForPlayer(tx: number, ty: number): boolean {
    return playerTileSolid(this.level, tx, ty, this.iceAt, this.gateOpen, this.exitOpen);
  }
  solid: SolidFn = (x, y) => this.tileSolidForPlayer(tileOf(x), tileOf(y));

  tileBlockedForEnemy(tx: number, ty: number, self?: Enemy): boolean {
    const c = tileAt(this.level, tx, ty);
    if (c === 'E' || c === 'G' || SOLID_STATIC.has(c)) return true;
    if (this.ice[this.idx(tx, ty)]) return true;
    if (this.boss?.blocksTile?.(tx, ty)) return true;
    for (const e of this.enemies) {
      if (e === self || e.state === 2) continue;
      if ((e.tx === tx && e.ty === ty) || (e.nx === tx && e.ny === ty)) return true;
    }
    return false;
  }

  alive() { return this.players.filter((p) => !p.ko && p.connected); }
  private skillLocked(p: Player, s: SkillId) { return (p.locks[s] ?? 0) > this.now; }
  private cooldownMult(p: Player) { return this.now < p.debtUntil ? DEBT_COOLDOWN_MULT : 1; }

  /** central gate for active skills: unlocked by progression, not locked by a debuff */
  private canUse(p: Player, s: SkillId): boolean {
    if (!this.has(s)) { this.events.push({ k: 'denied', by: p.id, skill: s, why: 'locked' }); return false; }
    if (this.skillLocked(p, s)) { this.events.push({ k: 'denied', by: p.id, skill: s, why: 'debuff' }); return false; }
    return true;
  }

  // ------------------------------------------------------------------ actions
  actIce(p: Player) {
    if (!this.canAct(p) || this.now < p.iceReadyAt) return;
    if (!this.canUse(p, 'ice')) return;
    p.iceReadyAt = this.now + ICE_COOLDOWN_MS * this.cooldownMult(p);
    this.stopTask(p);
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
      this.onIceBroken(tiles, p);
      return;
    }
    const tiles: number[] = [];
    for (let n = 0; n < ICE_MAX_LEN; n++) {
      const kid = this.kidOnTile(tx, ty);
      if (kid) { this.penalize(p, 'NE ZAZIDAVAJ DECU!'); break; }
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
      // a child boxed in by the new ice counts as trapping it
      for (const e of this.enemies) {
        if (!e.kid || e.state === 2) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => this.tileBlockedForEnemy(e.tx + dx, e.ty + dy, e))
          && tiles.some((t) => Math.abs((t % this.cols) - e.tx) + Math.abs(Math.floor(t / this.cols) - e.ty) === 1)) {
          this.penalize(p, 'NE ZAROBLJAVAJ DETE!');
          for (const t of tiles) this.ice[t] = 0;
          this.iceVersion++;
          this.events.push({ k: 'iceBreak', tiles, by: '' });
          break;
        }
      }
    } else this.events.push({ k: 'iceFail', by: p.id });
  }

  private kidOnTile(tx: number, ty: number): Enemy | undefined {
    return this.enemies.find((e) => e.kid && e.state !== 2 && ((e.tx === tx && e.ty === ty) || (e.nx === tx && e.ny === ty)));
  }

  private canFreeze(tx: number, ty: number, actor?: Player): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    if (tileAt(this.level, tx, ty) !== '.') return false;
    if (this.ice[this.idx(tx, ty)]) return false;
    if (this.items.some((i) => !i.taken && i.tx === tx && i.ty === ty)) return false;
    if (this.coffee.some((c) => !c.taken && c.tx === tx && c.ty === ty)) return false;
    if (this.enemies.some((e) => e.state !== 2 && ((e.tx === tx && e.ty === ty) || (e.nx === tx && e.ny === ty) || (tileOf(e.x) === tx && tileOf(e.y) === ty)))) return false;
    if (this.boss?.blocksTile?.(tx, ty)) return false;
    const x0 = tx * TILE, y0 = ty * TILE;
    for (const q of this.players) {
      if (q === actor && (tileOf(q.x) !== tx || tileOf(q.y) !== ty)) continue;
      if (q.x + 14 > x0 && q.x - 14 < x0 + TILE && q.y + 11 > y0 && q.y - 11 < y0 + TILE) return false;
    }
    return true;
  }

  /** player broke ice: frozen slops next to the broken blocks get crushed, bosses may react */
  private onIceBroken(tiles: number[], p: Player) {
    for (const e of this.enemies) {
      if (e.state !== 1) continue;
      const near = tiles.some((t) => Math.abs((t % this.cols) - e.tx) + Math.abs(Math.floor(t / this.cols) - e.ty) <= 1);
      if (near) this.crush(e, p);
    }
    this.boss?.onIceBreak?.(tiles, p);
  }

  private crush(e: Enemy, p: Player) {
    e.state = 2; e.respawnAt = e.summoned ? Infinity : this.now + 15000; e.tele = null;
    this.events.push({ k: 'crush', i: e.i, by: p.id });
  }

  actCoffee(p: Player) {
    if (!this.canAct(p) || this.now < p.coffeeReadyAt) return;
    if (!this.canUse(p, 'coffee')) return;
    if (p.coffee <= 0) return this.say(p, 'NEMA VISE KAFE!', 'warn');
    if (p.hp >= MAX_HP) return this.say(p, 'VEC SAM PUN KOFEINA', 'info');
    this.stopTask(p);
    p.coffee--; p.drinkUntil = this.now + DRINK_MS; p.healPending = true; p.coffeeReadyAt = this.now + COFFEE_COOLDOWN_MS * this.cooldownMult(p);
    this.stats.perPlayer[p.role].coffee++;
    this.events.push({ k: 'drink', by: p.id });
  }

  /** directional photo: everything inside the cone is evaluated by distance */
  actCamera(p: Player) {
    if (!this.canAct(p) || this.now < p.camReadyAt) return;
    if (!this.canUse(p, 'camera')) return;
    this.stopTask(p);
    p.camReadyAt = this.now + CAMERA_COOLDOWN_MS * this.cooldownMult(p);
    const ox = p.x, oy = p.y - 14;
    const ang = Math.atan2(DIRS[p.facing].y, DIRS[p.facing].x);
    const hits: { i: number; q: number; ms: number }[] = [];
    let kidHit = false;
    for (const e of this.enemies) {
      if (e.state === 2) continue;
      const d = inCone(ox, oy, ang, e.x, e.y - 10);
      if (d < 0) continue;
      if (e.kid) { kidHit = true; continue; }
      const q = photoQuality(d);
      const ms = Math.round(STUN_MS * CAM_STUN[q] * e.def.cameraResist);
      if (ms > 0) { e.stunUntil = Math.max(e.stunUntil, this.now + ms); e.tele = null; if (e.state === 3) e.state = 0; }
      hits.push({ i: e.i, q, ms });
    }
    this.stats.perPlayer[p.role].flashes++;
    const ev: GameEvent = { k: 'flash', by: p.id, x: ox, y: oy, ang, range: CAM_RANGE, hits };
    if (this.boss && !this.boss.dead) {
      const tp = this.boss.target();
      const d = inCone(ox, oy, ang, tp.x, tp.y, CAM_RANGE + 30);
      if (d >= 0) { const q = photoQuality(d); ev.boss = { q, dmg: this.boss.onPhoto(p, q) }; }
    }
    this.events.push(ev);
    if (kidHit) this.penalize(p, 'NE SLIKAJ DECU!');
  }

  /** INTERACT: start working on the nearest station that is allowed for this character */
  actInteract(p: Player) {
    if (!this.canAct(p) || p.quiz) return;
    if (p.task >= 0) { this.stopTask(p); return; }
    let best = -1, bd = STATION_RANGE + 1;
    this.stations.forEach((s, i) => {
      const d = Math.hypot(tileCenter(s.tx) - p.x, tileCenter(s.ty) - p.y);
      if (d < bd && !s.done && this.now >= s.rechargeAt) { bd = d; best = i; }
    });
    if (best < 0) return;
    const s = this.stations[best];
    if (s.role && s.role !== p.role) {
      this.say(p, s.role === 'david' ? 'TO JE DAVIDOV KOD. NE DIRAM.' : 'TO JE NEMANJINA ARKADA.', 'st' + best, 2500);
      return;
    }
    p.task = best;
    this.events.push({ k: 'taskStart', idx: best, by: p.id });
  }

  answer(p: Player, i: number) {
    const qz = p.quiz;
    if (!qz || !Number.isInteger(i) || i < 0 || i > 2) return;
    this.resolveQuiz(p, i === QUESTIONS[qz.q].a);
  }

  private resolveQuiz(p: Player, ok: boolean) {
    const qz = p.quiz!;
    const kid = this.enemies[qz.kid];
    p.quiz = null;
    this.events.push({ k: 'quizResult', by: p.id, kid: qz.kid, ok });
    if (!kid?.kid) return;
    kid.kid.target = null;
    if (ok) { kid.kid.satisfied = true; kid.state = 5; }
    else { kid.kid.sure = true; kid.kid.again = p.id; kid.state = 0; kid.kid.nextAskAt = this.now + 3500; } // doesn't trust YOU: comes back to the same player
  }

  stopTask(p: Player) {
    if (p.task < 0) return;
    this.events.push({ k: 'taskStop', idx: p.task, by: p.id });
    p.task = -1;
  }

  private canAct(p: Player) { return !p.ko && this.now >= p.drinkUntil && this.now >= p.stunUntil && !this.completed && !this.failAt; }

  say(p: Player, text: string, key = 'x', cooldown = 900) {
    const k = p.id + key;
    if ((this.sayCooldown.get(k) ?? -1e9) > this.now) return;
    this.sayCooldown.set(k, this.now + cooldown);
    this.events.push({ k: 'say', by: p.id, text });
  }

  /** punishment for hurting a child: one heart, ignores invulnerability */
  penalize(p: Player, text: string) {
    this.events.push({ k: 'penalty', by: p.id, text });
    p.invulnUntil = 0;
    this.hurt(p, p.x, p.y + 1, -1, true);
  }

  // ------------------------------------------------------------------ status effects (shared by enemies, projectiles, bosses)
  applyEffect(p: Player, effect: ProjectileEffect | 'none', dur: number, sx: number, sy: number) {
    if (p.ko || PEACEFUL) return;
    switch (effect) {
      case 'damage': this.hurt(p, sx, sy); break;
      case 'slow': if (this.now >= p.invulnUntil) { p.slowUntil = Math.max(p.slowUntil, this.now + dur); this.events.push({ k: 'slowed', by: p.id }); } break;
      case 'debt': p.debtUntil = Math.max(p.debtUntil, this.now + dur); this.events.push({ k: 'debt', by: p.id }); break;
      case 'stun': if (this.now >= p.invulnUntil) this.stun(p, dur); break;
      case 'lock': this.lockSkill(p, dur); break;
    }
  }
  stun(p: Player, ms: number) {
    if (p.ko || PEACEFUL) return;
    p.stunUntil = Math.max(p.stunUntil, this.now + ms);
    this.stopTask(p);
    this.events.push({ k: 'stun', by: p.id, ms });
  }
  lockSkill(p: Player, ms: number) {
    if (PEACEFUL) return;
    const can = (['ice', 'coffee', 'camera'] as SkillId[]).filter((s) => this.has(s) && !this.skillLocked(p, s));
    if (!can.length) return;
    const s = pick(can);
    p.locks[s] = this.now + ms;
    this.events.push({ k: 'locked', by: p.id, skill: s, ms });
  }

  spawnProj(kind: ProjectileKind, x: number, y: number, vx: number, vy: number, effect: ProjectileEffect, dur = 0, o: { homing?: string; ttl?: number; melts?: boolean; r?: number } = {}) {
    this.projectiles.push({ id: this.nextId(), kind, x, y, vx, vy, effect, dur, born: this.now, ttl: o.ttl ?? 5000, homing: o.homing ?? null, melts: !!o.melts, r: o.r ?? 18 });
  }
  addHazard(kind: string, x: number, y: number, r: number, delayMs: number, lifeMs: number, effect: ProjectileEffect | 'none', dur = 0, o: { once?: boolean; vx?: number; vy?: number } = {}) {
    const h: Hazard = { id: this.nextId(), kind, x, y, r, activeAt: this.now + delayMs, until: this.now + delayMs + lifeMs, effect, dur, once: !!o.once, fired: false, vx: o.vx ?? 0, vy: o.vy ?? 0, hitAt: new Map() };
    this.hazards.push(h);
    return h;
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
    this.tickProjectiles();
    this.tickHazards();
    this.tickStations();
    if (this.boss) {
      this.boss.tick();
      // the arena has a coffee machine: one cup comes back every 20 s
      if (this.now >= this.coffeeRespawnAt) {
        this.coffeeRespawnAt = this.now + 20000;
        const c = this.coffee.find((q) => q.taken);
        if (c && this.has('coffee')) { c.taken = false; this.events.push({ k: 'coffeeSpawn', idx: this.coffee.indexOf(c) }); }
      }
      if (this.boss.dead && this.now >= this.boss.deadAt + 3200) {
        this.completed = true; this.stats.timeMs = this.now; return true;
      }
      if (this.players.length === 2 && this.players.every((p) => p.ko)) { this.failAt = this.now + 2600; this.events.push({ k: 'fail' }); }
      return false;
    }
    // exit / completion
    const taken = this.items.filter((i) => i.taken).length;
    const tasksOk = !this.tasksGateExit || this.stations.every((s) => s.done);
    if (!this.exitOpen && taken === this.items.length && tasksOk) { this.exitOpen = true; this.events.push({ k: 'exitOpen' }); }
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
    const canMove = !p.ko && this.now >= p.drinkUntil && this.now >= p.stunUntil && !p.quiz;
    let processed = 0;
    p.moving = false;
    while (p.inputs.length && processed < 3) {
      const inp = p.inputs.shift()!;
      stepPlayer(p, inp, canMove, this.now < p.slowUntil, this.solid, this.now < p.debtUntil);
      if (canMove && (inp.dx || inp.dy)) p.moving = true;
      p.ack = inp.seq;
      processed++;
    }
    if (p.moving && p.task >= 0) this.stopTask(p);
    if (p.healPending && this.now >= p.drinkUntil) {
      p.healPending = false;
      p.hp = Math.min(MAX_HP, p.hp + 1);
      this.events.push({ k: 'heal', by: p.id });
    }
    if (p.quiz && this.now >= p.quiz.until) this.resolveQuiz(p, false);
    if (p.ko) {
      const mate = this.players.find((q) => q !== p && !q.ko && q.connected);
      const reviveMs = REVIVE_MS * (this.has('patience') ? PATIENCE_REVIVE_MULT : 1);
      if (mate && Math.hypot(mate.x - p.x, mate.y - p.y) < REVIVE_RANGE) {
        p.reviveMs += DT * 1000;
        if (p.reviveMs >= reviveMs) this.revive(p, mate);
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
    if (!this.has('coffee')) return; // coffee pickups do nothing until the skill is earned
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

  // ------------------------------------------------------------------ enemies
  private nearest(e: Enemy, maxD: number): Player | null {
    let best: Player | null = null, bd = maxD;
    for (const p of this.players) {
      if (p.ko || !p.connected) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private tickEnemy(e: Enemy) {
    if (e.state === 2) {
      if (this.now >= e.respawnAt) {
        if (this.ice[this.idx(e.sx, e.sy)]) { e.respawnAt = this.now + 3000; return; }
        e.state = 0; e.x = tileCenter(e.sx); e.y = tileCenter(e.sy); e.tx = e.nx = e.sx; e.ty = e.ny = e.sy; e.trappedMs = 0;
        this.events.push({ k: 'respawn', i: e.i });
      }
      return;
    }
    if (e.state === 1) {
      // frozen in ice: thaws if the ice is gone or after a while
      const iceNear = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.iceAt(e.tx + dx, e.ty + dy));
      if (!iceNear || this.now - e.frozenAt > 14000) { e.state = 0; e.trappedMs = 0; }
      return;
    }
    if (e.kid) { this.tickKid(e); return; }
    if (this.now < e.stunUntil) return;
    if (e.tele) { this.tickTelegraph(e); return; }
    this.tickAbilities(e);
    if (e.tele) return;
    const fast = this.now < e.dashUntil;
    e.state = fast ? 6 : 0;
    this.stepEnemyMove(e, e.speed * (fast ? 2.1 : 1), 0.4);
  }

  /** grid walker shared by enemies and kids. chase = chance to step toward the nearest player */
  private stepEnemyMove(e: Enemy, speed: number, chase: number, target?: Player | null) {
    const tx = tileCenter(e.nx), ty = tileCenter(e.ny);
    const dist = Math.hypot(tx - e.x, ty - e.y);
    const step = speed * DT;
    if (dist > step) {
      e.x += ((tx - e.x) / dist) * step;
      e.y += ((ty - e.y) / dist) * step;
      return;
    }
    e.x = tx; e.y = ty; e.tx = e.nx; e.ty = e.ny;
    const next = this.chooseDir(e, chase, target);
    if (next === null) {
      // boxed in: slops trapped by ice freeze solid
      if (e.def.iceCrushable && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.iceAt(e.tx + dx, e.ty + dy))) {
        e.trappedMs += DT * 1000;
        if (e.trappedMs > 1100) { e.state = 1; e.frozenAt = this.now; this.events.push({ k: 'eFrozen', i: e.i }); }
      }
      return;
    }
    e.trappedMs = 0;
    e.dir = next;
    e.nx = e.tx + DIRS[next].x; e.ny = e.ty + DIRS[next].y;
  }

  private chooseDir(e: Enemy, chase: number, forced?: Player | null): Dir | null {
    const opts = ([0, 1, 2, 3] as Dir[]).filter((d) => !this.tileBlockedForEnemy(e.tx + DIRS[d].x, e.ty + DIRS[d].y, e));
    if (!opts.length) return null;
    const back = ((e.dir + 2) % 4) as Dir;
    const pool = opts.length > 1 ? opts.filter((d) => d !== back) : opts;
    const target = forced ?? (e.def.hostile ? this.nearest(e, 5 * TILE) : null);
    if (target && Math.random() < chase) {
      let bd = Infinity; let bdir = pool[0];
      for (const d of (forced ? opts : pool)) {
        const nx = tileCenter(e.tx + DIRS[d].x), ny = tileCenter(e.ty + DIRS[d].y);
        const dd = Math.hypot(target.x - nx, target.y - ny);
        if (dd < bd) { bd = dd; bdir = d; }
      }
      return bdir;
    }
    if (pool.includes(e.dir) && Math.random() < 0.7) return e.dir;
    return pick(pool);
  }

  /** decide and start abilities (data from shared/enemies.ts) */
  private tickAbilities(e: Enemy) {
    e.def.abilities.forEach((a, ai) => {
      if (e.tele || this.now < e.cd[ai]) return;
      const t = this.nearest(e, a.range + (a.kind === 'lock' ? ENEMY_HIT_RANGE : 0));
      switch (a.kind) {
        case 'flash': {
          if (!t) return;
          const dx = t.x - e.x, dy = (t.y - 12) - (e.y - 10);
          if (Math.min(Math.abs(dx), Math.abs(dy)) > 30) return; // needs a straight line (grid-style aim)
          const ang = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : Math.PI) : (dy > 0 ? Math.PI / 2 : -Math.PI / 2);
          this.startTele(e, ai, a, ang);
          break;
        }
        case 'whistle':
          if (!t) return;
          this.startTele(e, ai, a, 0);
          break;
        case 'icebreak': {
          const r = Math.ceil(a.range / TILE);
          let any = false;
          for (let y = e.ty - r; y <= e.ty + r && !any; y++) for (let x = e.tx - r; x <= e.tx + r; x++) if (this.iceAt(x, y)) { any = true; break; }
          if (any) this.startTele(e, ai, { ...a, telegraphMs: 600 }, 0);
          else e.cd[ai] = this.now + 800;
          break;
        }
        case 'throw': {
          if (!t) return;
          const sp = a.speed ?? 200;
          const ang = Math.atan2((t.y - 12) - (e.y - 14), t.x - e.x);
          this.spawnProj(a.projectile ?? 'test', e.x, e.y - 14, Math.cos(ang) * sp, Math.sin(ang) * sp, a.effect ?? 'damage', a.durationMs ?? 0);
          e.cd[ai] = this.now + a.cooldownMs;
          this.events.push({ k: 'throw', i: e.i });
          break;
        }
        case 'dash':
          if (!t) return;
          e.dashUntil = this.now + (a.durationMs ?? 600);
          e.cd[ai] = this.now + a.cooldownMs;
          break;
        case 'lock':
          if (!t || Math.hypot(t.x - e.x, (t.y - 12) - e.y) > ENEMY_HIT_RANGE + 6) return;
          this.lockSkill(t, a.durationMs ?? 4000);
          this.events.push({ k: 'say', by: t.id, text: 'FALI VAM JEDAN PAPIR!' });
          e.cd[ai] = this.now + a.cooldownMs;
          break;
        case 'debt':
          break;
      }
    });
  }

  private startTele(e: Enemy, ai: number, a: Ability, ang: number) {
    const ms = a.telegraphMs ?? 700;
    e.tele = { a: ai, until: this.now + ms, ang };
    e.state = 3;
    if (Math.abs(Math.cos(ang)) > 0.5) e.dir = Math.cos(ang) > 0 ? 0 : 2;
    this.events.push({ k: 'tele', i: e.i, kind: a.kind as 'flash' | 'whistle' | 'icebreak', ang, len: a.range, ms });
  }

  private tickTelegraph(e: Enemy) {
    if (!e.tele || this.now < e.tele.until) return;
    const a = e.def.abilities[e.tele.a];
    const ang = e.tele.ang;
    e.cd[e.tele.a] = this.now + a.cooldownMs;
    e.tele = null; e.state = 0;
    if (a.kind === 'flash') {
      const ox = e.x, oy = e.y - 10;
      const hit: string[] = [];
      for (const p of this.players) {
        if (p.ko) continue;
        const dx = p.x - ox, dy = (p.y - 12) - oy;
        const along = dx * Math.cos(ang) + dy * Math.sin(ang);
        const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
        if (along > -10 && along < a.range && perp < 30) { hit.push(p.id); this.stun(p, a.durationMs ?? 1200); }
      }
      this.events.push({ k: 'eflash', i: e.i, x: ox, y: oy, ang, len: a.range, hit });
    } else if (a.kind === 'whistle') {
      for (const p of this.players) if (!p.ko && Math.hypot(p.x - e.x, p.y - e.y) < a.range) this.applyEffect(p, 'slow', a.durationMs ?? 1500, e.x, e.y);
      this.events.push({ k: 'whistle', i: e.i, x: e.x, y: e.y, r: a.range });
    } else if (a.kind === 'icebreak') {
      const r = Math.ceil(a.range / TILE);
      const tiles: number[] = [];
      for (let y = e.ty - r; y <= e.ty + r; y++) for (let x = e.tx - r; x <= e.tx + r; x++) if (this.iceAt(x, y)) { this.ice[this.idx(x, y)] = 0; tiles.push(this.idx(x, y)); }
      if (tiles.length) { this.iceVersion++; this.events.push({ k: 'iceBreak', tiles, by: '' }); }
    }
  }

  /** children: wander, then run to a player and ask a question */
  private tickKid(e: Enemy) {
    const k = e.kid!;
    if (k.satisfied) { e.state = 5; this.stepEnemyMove(e, e.speed * 0.5, 0); return; }
    if (e.state === 4) {
      const asked = this.players.find((p) => p.quiz?.kid === e.i);
      if (!asked) e.state = 0;
      return;
    }
    if (!k.target && this.now >= k.nextAskAt) {
      const cand = this.players.filter((p) => !p.ko && p.connected && !p.quiz);
      const again = cand.find((p) => p.id === k.again);
      if (again) k.target = again.id;
      else if (cand.length) {
        cand.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
        k.target = cand[0].id;
      } else k.nextAskAt = this.now + 2000;
    }
    const tgt = k.target ? this.players.find((p) => p.id === k.target) : null;
    if (k.target && (!tgt || tgt.ko || tgt.quiz)) { k.target = null; k.nextAskAt = this.now + 2500; }
    if (tgt && !tgt.ko && !tgt.quiz) {
      if (Math.hypot(tgt.x - e.x, (tgt.y - 6) - e.y) < 48) {
        e.state = 4;
        this.stopTask(tgt);
        tgt.quiz = { kid: e.i, q: k.q, sure: k.sure, until: this.now + QUIZ_TIMEOUT };
        this.events.push({ k: 'quiz', by: tgt.id, kid: e.i, q: k.q, sure: k.sure });
        if (k.sure) this.events.push({ k: 'say', by: tgt.id, text: 'JESI LI SIGURAN?' }); // full line is in the quiz panel
        return;
      }
      this.stepEnemyMove(e, e.speed, 0.9, tgt);
      return;
    }
    e.state = 0;
    this.stepEnemyMove(e, e.speed * 0.8, 0);
  }

  private checkHits() {
    for (const p of this.players) {
      if (p.ko || this.now < p.invulnUntil) continue;
      for (const e of this.enemies) {
        if (!e.def.touchDamage || e.state === 1 || e.state === 2 || this.now < e.stunUntil) continue;
        const d = Math.hypot(e.x - p.x, e.y - (p.y - 12));
        if (d > ENEMY_HIT_RANGE) continue;
        this.hurt(p, e.x, e.y, e.i);
        break;
      }
      if (this.boss?.touches?.(p)) this.hurt(p, this.boss.target().x, this.boss.target().y);
    }
  }

  /** One heart of damage with knockback away from (sx, sy). Used by enemies, projectiles and bosses. */
  hurt(p: Player, sx: number, sy: number, enemy = -1, force = false): boolean {
    if (p.ko || this.now < p.invulnUntil || (PEACEFUL && !force)) return false;
    p.hp--; p.invulnUntil = this.now + INVULN_MS;
    this.stats.perPlayer[p.role].hits++;
    p.drinkUntil = Math.min(p.drinkUntil, this.now); // a hit interrupts sipping
    if (p.healPending) { p.healPending = false; p.coffee++; }
    this.stopTask(p);
    const ang = Math.atan2(p.y - sy, p.x - sx);
    const r = moveBox(p.x, p.y, Math.cos(ang) * KNOCKBACK_PX, Math.sin(ang) * KNOCKBACK_PX, this.solid);
    p.x = r.x; p.y = r.y;
    this.events.push({ k: 'hit', by: p.id, enemy });
    if (p.hp <= 0) {
      p.hp = 0; p.ko = true; p.koUntil = this.now + KO_SELF_REVIVE_MS; p.reviveMs = 0;
      if (p.quiz) this.resolveQuiz(p, false);
      this.events.push({ k: 'ko', by: p.id });
    }
    return true;
  }

  /** Removes one ice block (fireballs / meteors / boss chewing melt it). */
  meltIce(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows || !this.ice[this.idx(tx, ty)]) return false;
    this.ice[this.idx(tx, ty)] = 0; this.iceVersion++;
    this.events.push({ k: 'iceBreak', tiles: [this.idx(tx, ty)], by: '' });
    return true;
  }

  private tickProjectiles() {
    for (const f of this.projectiles) {
      if (f.homing) {
        const t = this.players.find((p) => p.id === f.homing && !p.ko);
        if (t) {
          const sp = Math.hypot(f.vx, f.vy);
          const want = Math.atan2((t.y - 12) - f.y, t.x - f.x), cur = Math.atan2(f.vy, f.vx);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const na = cur + Math.max(-0.05, Math.min(0.05, da));
          f.vx = Math.cos(na) * sp; f.vy = Math.sin(na) * sp;
        }
      }
      f.x += f.vx * DT; f.y += f.vy * DT;
      const tx = tileOf(f.x), ty = tileOf(f.y);
      const c = tileAt(this.level, tx, ty);
      let gone = this.now - f.born > f.ttl;
      if (!gone && this.iceAt(tx, ty)) { gone = true; if (f.melts) this.meltIce(tx, ty); } // ice is a shield
      else if (!gone && c !== '.' && c !== 'X' && c !== 'G' && c !== 'E' && SOLID_STATIC.has(c)) gone = true;
      else if (!gone && c === '#') gone = true;
      if (!gone) for (const p of this.players) {
        if (!p.ko && Math.hypot(p.x - f.x, p.y - 12 - f.y) < f.r + 6) {
          this.applyEffect(p, f.effect, f.dur, f.x - f.vx * 0.1, f.y - f.vy * 0.1);
          gone = true; break;
        }
      }
      if (gone) { this.events.push({ k: 'projHit', kind: f.kind, x: Math.round(f.x), y: Math.round(f.y) }); f.born = -1e9; f.ttl = -1; }
    }
    this.projectiles = this.projectiles.filter((f) => f.ttl >= 0);
  }

  private tickHazards() {
    for (const h of this.hazards) {
      if (this.now < h.activeAt) continue;
      if (h.vx || h.vy) { h.x += h.vx * DT; h.y += h.vy * DT; }
      if (h.once) {
        if (h.fired) continue;
        h.fired = true;
        this.events.push({ k: 'hazard', kind: h.kind, x: h.x, y: h.y });
        for (const p of this.players) if (!p.ko && Math.hypot(p.x - h.x, p.y - h.y) < h.r) this.applyEffect(p, h.effect, h.dur, h.x, h.y - 1);
        continue;
      }
      for (const p of this.players) {
        if (p.ko || Math.hypot(p.x - h.x, p.y - h.y) > h.r) continue;
        if ((h.hitAt.get(p.id) ?? -1e9) > this.now) continue;
        h.hitAt.set(p.id, this.now + 700);
        this.applyEffect(p, h.effect, h.dur, h.x, h.y - 1);
      }
    }
    this.hazards = this.hazards.filter((h) => this.now < h.until);
  }

  private tickStations() {
    let changed = false;
    const patience = this.has('patience');
    this.stations.forEach((s, idx) => {
      if (s.done) {
        if (s.rechargeAt && this.now >= s.rechargeAt) { s.done = false; s.progress = 0; s.rechargeAt = 0; }
        return;
      }
      let rate = 0;
      for (const p of this.players) {
        if (p.task !== idx) continue;
        if (p.ko || Math.hypot(p.x - tileCenter(s.tx), p.y - tileCenter(s.ty)) > STATION_RANGE + 8) { this.stopTask(p); continue; }
        rate += taskSpeed(s.task, p.role, patience, PATIENCE_TASK_MULT);
      }
      if (rate > 0) s.progress = Math.min(1, s.progress + rate * DT * 1000);
      else s.progress = Math.max(0, s.progress - DT * 0.15);
      if (s.progress >= 1) {
        s.done = true; changed = true;
        const workers = this.players.filter((q) => q.task === idx);
        for (const w of workers) w.task = -1;
        this.events.push({ k: 'station', idx, by: workers[0]?.id ?? '' });
        this.boss?.onTaskDone?.(s, workers[0]);
      }
    });
    if (changed && !this.gateOpen && this.stations.every((s) => s.done)) {
      this.gateOpen = true;
      this.events.push({ k: 'gate' });
    }
  }

  // ------------------------------------------------------------------ snapshot helpers
  playerSnap(p: Player): PlayerSnap {
    const reviveMs = REVIVE_MS * (this.has('patience') ? PATIENCE_REVIVE_MULT : 1);
    return {
      id: p.id, role: p.role, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, f: p.facing, m: p.moving ? 1 : 0,
      hp: p.hp, cof: p.coffee, cam: Math.max(0, Math.round(p.camReadyAt - this.now)),
      sl: this.now < p.slowUntil ? 1 : 0, dr: this.now < p.drinkUntil ? 1 : 0, inv: this.now < p.invulnUntil ? 1 : 0,
      ko: p.ko ? 1 : 0, rv: Math.round((p.reviveMs / reviveMs) * 100) / 100, ack: p.ack, col: p.collected, c: p.connected ? 1 : 0,
      sn: Math.max(0, Math.round(p.stunUntil - this.now)), db: this.now < p.debtUntil ? 1 : 0,
      lk: (Object.keys(p.locks) as SkillId[]).filter((s) => (p.locks[s] ?? 0) > this.now),
      tk: p.task >= 0 ? TASKS[this.stations[p.task].task].anim : '', ti: p.task,
      qz: p.quiz ? p.quiz.q : -1, qs: p.quiz?.sure ? 1 : 0,
    };
  }
  enemySnaps(): EnemySnap[] {
    return this.enemies.map((e) => ({ i: e.i, ty: e.type, x: Math.round(e.x), y: Math.round(e.y), d: e.dir, st: Math.max(0, Math.round(e.stunUntil - this.now)), s: e.state }));
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
  for (const e of L.enemies) if (!ENEMIES[e.type]) throw new Error(`${L.id}: unknown enemy type ${e.type}`);
}
