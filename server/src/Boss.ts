import { DT, TILE } from '../../shared/constants.ts';
import { BOSS_DEFS, COLLECTOR_BILLS } from '../../shared/bosses.ts';
import type { ProjectileKind } from '../../shared/enemies.ts';
import { tileAt } from '../../shared/level.ts';
import type { BossKind, BossSnap } from '../../shared/protocol.ts';
import { tileCenter, tileOf } from '../../shared/physics.ts';
import type { LevelSim, Station } from './LevelSim.ts';
import type { Player } from './Player.ts';

/** What LevelSim needs from any boss. */
export interface BossSim {
  type: BossKind;
  hp: number; max: number; dead: boolean; deadAt: number;
  tick(): void;
  snap(): BossSnap;
  /** camera photo landed with quality 0..2; returns damage dealt */
  onPhoto(p: Player, q: number): number;
  /** point the camera has to frame */
  target(): { x: number; y: number };
  onIceBreak?(tiles: number[], p: Player): void;
  onTaskDone?(s: Station, p?: Player): void;
  touches?(p: Player): boolean;
  blocksTile?(tx: number, ty: number): boolean;
}

export function makeBoss(sim: LevelSim, type: BossKind, hp: number): BossSim {
  switch (type) {
    case 'hrana': return new HranaSim(sim, hp);
    case 'sonja': return new SonjaSim(sim, hp);
    case 'collector': return new CollectorSim(sim, hp);
    default: return new BrankaSim(sim, hp);
  }
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** shared HP / state / photo handling */
abstract class BossBase implements BossSim {
  x = 0; y = 0;
  hp: number; readonly max: number;
  state = 'idle';
  stateStart = 0; stateEnd = 0;
  hurtUntil = 0;
  enraged = false;
  dead = false; deadAt = 0;
  nextActionAt = 2500;

  constructor(protected sim: LevelSim, readonly type: BossKind, hp: number) { this.hp = this.max = hp; }
  protected get now() { return this.sim.now; }
  protected alive() { return this.sim.alive(); }
  protected setState(st: string, dur: number) { this.state = st; this.stateStart = this.now; this.stateEnd = this.now + dur; }
  protected say(text: string) { this.sim.events.push({ k: 'bossSay', text }); }
  target() { return { x: this.x, y: this.y }; }

  /** centre of the 'X' carpet (throne / office) or a fallback */
  protected carpetCentre(fallbackTy = 2) {
    let x0 = 99, x1 = -1, y0 = 99, y1 = 0;
    this.sim.level.map.forEach((row, ty) => [...row].forEach((c, tx) => { if (c === 'X') { x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty); } }));
    if (x1 < 0) return { x: (this.sim.cols / 2) * TILE, y: (fallbackTy + 0.5) * TILE };
    return { x: ((x0 + x1 + 1) / 2) * TILE, y: ((y0 + y1 + 1) / 2) * TILE };
  }

  damage(dmg: number, p: Player | undefined, q?: number) {
    if (this.dead || dmg <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtUntil = this.now + 600;
    this.sim.events.push({ k: 'bossHit', by: p?.id ?? '', hp: this.hp, dmg, q });
    if (this.hp <= 0) { this.die(); return; }
    if (!this.enraged && this.hp <= this.max / 2) {
      this.enraged = true;
      this.sim.events.push({ k: 'bossEnrage' });
      this.onEnrage();
    }
  }
  protected onEnrage() {}
  protected die() {
    this.dead = true; this.deadAt = this.now; this.setState('dead', 99999);
    this.sim.projectiles = []; this.sim.hazards = [];
    for (const e of this.sim.enemies) if (e.summoned) e.state = 2;
    this.sim.events.push({ k: 'bossDead' });
  }

  onPhoto(p: Player, q: number): number {
    if (this.dead) return 0;
    const dmg = BOSS_DEFS[this.type].photoDamage[q] ?? 0;
    if (dmg <= 0) { this.say(pick(['MUTNA SLIKA!', 'PRIDJI BLIZE, AKO SMES!', 'HAHA, PROMASIO!'])); return 0; }
    this.damage(dmg, p, q);
    if (!this.dead) this.onPhotoHit();
    return dmg;
  }
  protected onPhotoHit() { this.setState('stunned', 900); this.nextActionAt = this.stateEnd + 400; }

  abstract tick(): void;
  protected baseSnap(): BossSnap {
    const dur = Math.max(1, this.stateEnd - this.stateStart);
    return {
      type: this.type, x: Math.round(this.x), y: Math.round(this.y), hp: this.hp, max: this.max, st: this.state,
      sp: this.state === 'dead' ? Math.min(1, (this.now - this.deadAt) / 1500) : Math.min(1, (this.now - this.stateStart) / dur),
      enr: this.enraged ? 1 : 0, hurt: this.now < this.hurtUntil ? 1 : 0,
    };
  }
  snap(): BossSnap { return this.baseSnap(); }

  protected aim(p: Player, sx: number, sy: number) { return Math.atan2((p.y - 12) - sy, p.x - sx); }
  protected fan(kind: ProjectileKind, sx: number, sy: number, base: number, n: number, spread: number, speed: number, effect: Parameters<LevelSim['spawnProj']>[5], dur = 0) {
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      this.sim.spawnProj(kind, sx, sy, Math.cos(a) * speed, Math.sin(a) * speed, effect, dur);
    }
  }
  protected randomFloorNear(px: number, py: number, spread: number): { x: number; y: number } | null {
    for (let k = 0; k < 8; k++) {
      const tx = tileOf(px) + Math.round((Math.random() * 2 - 1) * spread), ty = tileOf(py) + Math.round((Math.random() * 2 - 1) * spread);
      if (tileAt(this.sim.level, tx, ty) === '.' && ty > 3) return { x: tileCenter(tx), y: tileCenter(ty) };
    }
    return null;
  }
}

// ====================================================================== STAGE 1: STUDENTSKA HRANA
/**
 * A huge slime that slides along the top of the kitchen. Only ICE beats her:
 * wall her in (blocks below and beside her) until she freezes solid, then BREAK the ice -> shatter damage.
 * She chews through ice that blocks her path, spits grease, sprays sauce, leaves sludge and summons slops.
 */
class HranaSim extends BossBase {
  private frozenUntil = 0;
  private chewAt = 0;
  private dirX = 1;
  private shatterLock = 0;
  private freeze = 0;
  readonly row = 1;      // footprint rows 1-2
  constructor(sim: LevelSim, hp: number) {
    super(sim, 'hrana', hp);
    this.x = (sim.cols / 2) * TILE; this.y = 2 * TILE;
  }
  private foot() { const c = tileOf(this.x); return { x0: c - 1, x1: c + 1, y0: this.row, y1: this.row + 1 }; }
  blocksTile(tx: number, ty: number) { const f = this.foot(); return !this.dead && tx >= f.x0 && tx <= f.x1 && ty >= f.y0 && ty <= f.y1; }
  touches(p: Player) {
    if (this.dead || this.state === 'frozen') return false;
    return Math.abs(p.x - this.x) < 66 && p.y < (this.row + 2) * TILE + 14;
  }
  target() { return { x: this.x, y: this.y + 10 }; }
  /** ice tiles hugging the footprint: the row below + the columns at both sides */
  private ring(): [number, number][] {
    const f = this.foot(); const out: [number, number][] = [];
    for (let x = f.x0 - 1; x <= f.x1 + 1; x++) out.push([x, f.y1 + 1]);
    for (let y = f.y0; y <= f.y1; y++) { out.push([f.x0 - 1, y]); out.push([f.x1 + 1, y]); }
    return out;
  }
  private ringIce() { return this.ring().filter(([x, y]) => this.sim.iceAt(x, y)); }

  onIceBreak(tiles: number[]) {
    if (this.state !== 'frozen' || this.now < this.shatterLock) return;
    const ring = new Set(this.ring().map(([x, y]) => y * this.sim.cols + x));
    if (!tiles.some((t) => ring.has(t))) return;
    this.shatterLock = this.now + 1200;
    this.frozenUntil = 0;
    for (const [x, y] of this.ringIce()) this.sim.meltIce(x, y);
    this.damage(1, undefined, 2);
    if (!this.dead) { this.setState('stunned', 1200); this.nextActionAt = this.now + 1800; this.say(pick(['AAAU! MOJ SOS!', 'NE MOJ LED!', 'BLJUC!'])); }
  }

  tick() {
    if (this.dead) return;
    const now = this.now;
    const ringN = this.ringIce().length;
    this.freeze = Math.min(1, ringN / 5);
    if (this.state === 'frozen') {
      if (now >= this.frozenUntil || ringN < 3) { this.state = 'idle'; this.nextActionAt = now + 800; }
      return;
    }
    if (ringN >= 5) {
      this.frozenUntil = now + 4800; this.setState('frozen', 4800);
      this.sim.projectiles = this.sim.projectiles.filter((p) => !['grease', 'sauce', 'noodle', 'chunk'].includes(p.kind));
      this.sim.events.push({ k: 'bossFrozen' });
      this.say('SMRZAVAM SE!');
      return;
    }
    if (this.state !== 'idle' && this.state !== 'move' && now < this.stateEnd) return;
    if (this.state === 'attack' || this.state === 'summon' || this.state === 'stunned') this.state = 'idle';
    // slide toward the players, blocked by ice in front (then chew it)
    const t = this.alive()[0] ? this.alive().reduce((a, b) => (Math.abs(a.x - this.x) < Math.abs(b.x - this.x) ? a : b)) : null;
    if (t) this.dirX = Math.sign(t.x - this.x) || this.dirX;
    const f = this.foot();
    const frontX = this.dirX > 0 ? f.x1 + 1 : f.x0 - 1;
    const blocked = [f.y0, f.y1].some((y) => this.sim.iceAt(frontX, y) || '#'.includes(tileAt(this.sim.level, frontX, y)));
    const iceFront = [f.y0, f.y1].find((y) => this.sim.iceAt(frontX, y));
    if (!blocked && t && Math.abs(t.x - this.x) > 20) { this.x += this.dirX * (this.enraged ? 62 : 46) * DT; this.state = 'move'; }
    else if (iceFront !== undefined && now >= this.chewAt) { this.chewAt = now + (this.enraged ? 1800 : 2600); this.sim.meltIce(frontX, iceFront); }
    else this.state = 'idle';
    this.x = Math.max(2 * TILE, Math.min((this.sim.cols - 2) * TILE, this.x));
    if (now < this.nextActionAt) return;
    const players = this.alive();
    if (!players.length) return;
    const p = pick(players);
    const sx = this.x, sy = this.y + 40;
    const roll = Math.random();
    const summoned = this.sim.enemies.filter((e) => e.summoned && e.state !== 2).length;
    if (roll < 0.22 && summoned < 3) {
      this.setState('summon', 900);
      for (const dx of [-2, 2]) {
        const tx = tileOf(this.x) + dx, ty = 4;
        if (tileAt(this.sim.level, tx, ty) === '.' && !this.sim.iceAt(tx, ty)) this.sim.spawnEnemy(pick(['slop_blob', 'slop_burger']), tx, ty, undefined, true);
      }
      this.sim.events.push({ k: 'bossCast', kind: 'summon' });
      this.say('DECO MOJA, NAPAD!');
    } else if (roll < 0.45) {
      this.setState('attack', 700);
      this.fan('grease', sx, sy, this.aim(p, sx, sy), this.enraged ? 5 : 3, 0.7, 210, 'damage');
      this.sim.events.push({ k: 'bossCast', kind: 'spit' });
    } else if (roll < 0.65) {
      this.setState('attack', 700);
      this.fan('sauce', sx, sy, this.aim(p, sx, sy), 5, 1.4, 160, 'slow', 1600);
      this.sim.events.push({ k: 'bossCast', kind: 'sauce' });
    } else if (roll < 0.82) {
      this.setState('attack', 800);
      for (const q of players) {
        const spot = this.randomFloorNear(q.x, q.y, 1);
        if (spot) this.sim.addHazard('sludge', spot.x, spot.y, 40, 1100, 7000, 'slow', 1400);
      }
      this.sim.events.push({ k: 'bossCast', kind: 'sludge' });
      this.say('MISTERIOZNI SOS!');
    } else {
      this.setState('attack', 900);
      for (let i = 0; i < (this.enraged ? 7 : 5); i++) {
        const a = Math.PI / 2 + (i / 4 - 0.5) * 1.6;
        this.sim.spawnProj(pick(['noodle', 'chunk'] as ProjectileKind[]), sx, sy, Math.cos(a) * 150, Math.sin(a) * 150, 'damage');
      }
      this.sim.events.push({ k: 'bossCast', kind: 'noodles' });
    }
    this.nextActionAt = this.stateEnd + (this.enraged ? 1300 : 1900);
  }
  protected onEnrage() { this.say('SAD STE ME NAJLJUTILI!'); }
  snap(): BossSnap { return { ...this.baseSnap(), fz: Math.round(this.freeze * 100) / 100 }; }
}

// ====================================================================== STAGE 2: SONJA KUKMAN
/**
 * Strict economics teacher. She is damaged by passing her EXAMS (task desks 'U', 1 dmg each)
 * - and by close camera photos on replays. Attacks: telegraphed flash beam (stun), paper storm
 * tornado, F-mark quiz blasts, thrown tests and summoned camera prefects.
 */
class SonjaSim extends BossBase {
  private wp = { x: 0, y: 0 };
  private flashAng = 0;
  constructor(sim: LevelSim, hp: number) {
    super(sim, 'sonja', hp);
    this.x = (sim.cols / 2) * TILE; this.y = 4 * TILE;
    this.wp = { x: this.x, y: this.y };
  }
  touches(p: Player) { return !this.dead && this.state !== 'stunned' && Math.hypot(p.x - this.x, p.y - this.y) < 34; }
  target() { return { x: this.x, y: this.y - 20 }; }
  onTaskDone(s: Station, p?: Player) {
    if (s.task !== 'exam' || this.dead) return;
    s.rechargeAt = this.now + (this.enraged ? 7000 : 5500);
    this.damage(1, p, 2);
    if (!this.dead) { this.setState('hurt', 1100); this.nextActionAt = this.stateEnd + 300; this.say(pick(['KO VAM JE DAO TO PITANJE?!', 'PREPISIVALI STE!', 'NEMOGUCE, 10!'])); }
  }
  tick() {
    if (this.dead) return;
    const now = this.now;
    if (this.state === 'flash' && now >= this.stateEnd) {
      // fire the telegraphed beam
      const hit: string[] = [];
      for (const p of this.sim.players) {
        if (p.ko) continue;
        const dx = p.x - this.x, dy = (p.y - 12) - (this.y - 20);
        const along = dx * Math.cos(this.flashAng) + dy * Math.sin(this.flashAng);
        const perp = Math.abs(-dx * Math.sin(this.flashAng) + dy * Math.cos(this.flashAng));
        if (along > 0 && along < 520 && perp < 34) { hit.push(p.id); this.sim.stun(p, 1500); }
      }
      this.sim.events.push({ k: 'eflash', i: -1, x: this.x, y: this.y - 20, ang: this.flashAng, len: 520, hit });
      this.state = 'idle';
    }
    if (this.state !== 'idle' && this.state !== 'walk' && now < this.stateEnd) return;
    if (this.state !== 'walk') this.state = 'idle';
    // stroll between waypoints in the middle of the classroom
    const d = Math.hypot(this.wp.x - this.x, this.wp.y - this.y);
    if (d < 6) this.wp = { x: (3 + Math.random() * (this.sim.cols - 6)) * TILE, y: (2 + Math.random() * 7) * TILE };
    else {
      const sp = (this.enraged ? 82 : 64) * DT;
      this.x += ((this.wp.x - this.x) / d) * sp; this.y += ((this.wp.y - this.y) / d) * sp; this.state = 'walk';
    }
    if (now < this.nextActionAt) return;
    const players = this.alive();
    if (!players.length) return;
    const p = pick(players);
    const roll = Math.random();
    const prefects = this.sim.enemies.filter((e) => e.summoned && e.state !== 2).length;
    if (roll < 0.3) {
      this.flashAng = this.aim(p, this.x, this.y - 20);
      this.setState('flash', this.enraged ? 800 : 1100);
      this.sim.events.push({ k: 'tele', i: -1, kind: 'flash', ang: this.flashAng, len: 520, ms: this.stateEnd - now });
      this.say('NASMEJ SE ZA DNEVNIK!');
    } else if (roll < 0.5) {
      this.setState('storm', 1000);
      const a = this.aim(p, this.x, this.y);
      this.sim.addHazard('tornado', this.x, this.y + 10, 34, 500, 5500, 'damage', 0, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 });
      this.sim.events.push({ k: 'bossCast', kind: 'storm' });
    } else if (roll < 0.7) {
      this.setState('quiz', 1000);
      for (const q of players) for (let k = 0; k < (this.enraged ? 3 : 2); k++) {
        const s = this.randomFloorNear(q.x, q.y, 2);
        if (s) this.sim.addHazard('fmark', s.x, s.y, 38, 1500, 400, 'damage', 0, { once: true });
      }
      this.sim.events.push({ k: 'bossCast', kind: 'quiz' });
      this.say('KONTROLNI! SADA!');
    } else if (roll < 0.82 && prefects < 2) {
      this.setState('summon', 900);
      const tx = tileOf(this.x), ty = tileOf(this.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(this.sim.level, tx + dx, ty + dy) === '.' && !this.sim.iceAt(tx + dx, ty + dy)) { this.sim.spawnEnemy('prefect', tx + dx, ty + dy, undefined, true); break; }
      }
      this.sim.events.push({ k: 'bossCast', kind: 'summon' });
    } else {
      this.setState('throw', 700);
      this.fan('test', this.x, this.y - 20, this.aim(p, this.x, this.y - 20), this.enraged ? 4 : 3, 0.6, 230, 'damage');
      this.sim.events.push({ k: 'bossCast', kind: 'tests' });
    }
    this.nextActionAt = this.stateEnd + (this.enraged ? 900 : 1500);
  }
  protected onEnrage() { this.say('SVI PADATE!'); }
}

// ====================================================================== STAGE 3: BRANKA (original implementation)
interface Fireball { i: number; x: number; y: number; vx: number; vy: number; born: number }
interface Meteor { i: number; x: number; y: number; at: number }
const QUOTES = [
  'TISINA U MOJOJ KANCELARIJI!', 'KO VAM JE DAO DOZVOLU?!', 'SVI U MOJU KANCELARIJU!',
  'NEMA KAFE BEZ POTPISA!', 'OPET VI DVOJICA?!', 'ROK JE BIO JUCE!',
];

/**
 * BRANKA - sits on her carpet at the top centre and:
 *  - throws fireballs straight at a player (ice blocks them and melts),
 *  - raises her hands: tiles get marked on the floor, meteors land ~2 s later,
 *  - slams a shockwave when someone gets close (the camera needs you near her).
 * Camera photos hurt her by distance (far 0 / medium 1 / close 3) and briefly stun her.
 */
export class BrankaSim extends BossBase {
  rainReadyAt = 7000;
  shockReadyAt = 4000;
  fireballs: Fireball[] = [];
  meteors: Meteor[] = [];
  shockAt = -1;
  private ids = 1;
  private castTarget: Player | null = null;

  constructor(sim: LevelSim, hp: number) {
    super(sim, 'branka', hp);
    const c = this.carpetCentre();
    this.x = c.x; this.y = c.y;
  }

  protected die() { super.die(); this.fireballs = []; this.meteors = []; this.shockAt = -1; }
  protected onPhotoHit() {
    this.shockAt = -1;
    this.setState('stunned', 1100);
    this.nextActionAt = this.stateEnd + 500;
  }
  protected onEnrage() { this.say('SAD STE ME NAJLJUTILI!'); }

  tick() {
    if (this.dead) return;
    const now = this.now;
    this.tickProjectiles();
    if (this.state !== 'idle' && now >= this.stateEnd) {
      if (this.state === 'cast') this.fire();
      if (this.state === 'rain') this.dropMeteors();
      this.state = 'idle';
    }
    if (this.shockAt > 0 && now >= this.shockAt) this.blast();
    if (this.state !== 'idle' || now < this.nextActionAt) return;
    const players = this.alive();
    if (!players.length) return;
    const near = players.some((p) => Math.hypot(p.x - this.x, p.y - this.y) < 215);
    if (near && now >= this.shockReadyAt) {
      this.setState('shock', this.enraged ? 800 : 1000);
      this.shockAt = this.stateEnd;
      this.shockReadyAt = now + (this.enraged ? 3200 : 4500);
      this.sim.events.push({ k: 'bossCast', kind: 'shock' });
      if (Math.random() < 0.5) this.say('NE PRILAZI MI!');
    } else if (now >= this.rainReadyAt) {
      this.setState('rain', this.enraged ? 900 : 1200);
      this.rainReadyAt = now + (this.enraged ? 6500 : 9000);
      this.sim.events.push({ k: 'bossCast', kind: 'rain' });
      if (Math.random() < 0.6) this.say(pick(QUOTES));
    } else {
      this.castTarget = pick(players);
      this.setState('cast', this.enraged ? 500 : 700);
      this.sim.events.push({ k: 'bossCast', kind: 'fireball' });
    }
    this.nextActionAt = this.stateEnd + (this.enraged ? 650 : 1100);
  }

  private fire() {
    const t = this.castTarget && !this.castTarget.ko ? this.castTarget : this.alive()[0];
    if (!t) return;
    const sx = this.x, sy = this.y + 40;
    const base = Math.atan2(t.y - 12 - sy, t.x - sx);
    const speed = this.enraged ? 300 : 240;
    const spread = this.enraged ? [-0.28, 0, 0.28] : [0];
    for (const a of spread) this.fireballs.push({ i: this.ids++, x: sx, y: sy, vx: Math.cos(base + a) * speed, vy: Math.sin(base + a) * speed, born: this.now });
  }

  private dropMeteors() {
    const s = this.sim;
    const targets: [number, number][] = [];
    const add = (tx: number, ty: number) => { if (tileAt(s.level, tx, ty) === '.' && !targets.some(([a, b]) => a === tx && b === ty)) targets.push([tx, ty]); };
    for (const p of this.alive()) {
      add(tileOf(p.x), tileOf(p.y));
      for (let k = 0; k < (this.enraged ? 3 : 2); k++) add(tileOf(p.x) + Math.round(Math.random() * 4 - 2), tileOf(p.y) + Math.round(Math.random() * 4 - 2));
    }
    for (let k = 0; k < (this.enraged ? 6 : 3); k++) add(1 + Math.floor(Math.random() * (s.cols - 2)), 3 + Math.floor(Math.random() * (s.rows - 4)));
    const land = this.now + (this.enraged ? 1700 : 2100);
    targets.forEach(([tx, ty], i) => this.meteors.push({ i: this.ids++, x: tileCenter(tx), y: tileCenter(ty), at: land + i * 60 }));
  }

  private blast() {
    this.shockAt = -1;
    const r = 210;
    this.sim.events.push({ k: 'bossShock', x: this.x, y: this.y, r });
    for (const p of this.sim.players) if (Math.hypot(p.x - this.x, p.y - this.y) < r) this.sim.hurt(p, this.x, this.y);
  }

  private tickProjectiles() {
    const s = this.sim;
    for (const f of this.fireballs) {
      f.x += f.vx * DT; f.y += f.vy * DT;
      const tx = tileOf(f.x), ty = tileOf(f.y);
      const c = tileAt(s.level, tx, ty);
      let gone = this.now - f.born > 6000;
      if (!gone && s.meltIce(tx, ty)) gone = true; // ice blocks fireballs (and melts)
      else if (!gone && c !== '.' && c !== 'X' && c !== 'G' && c !== 'E') gone = true;
      if (!gone) for (const p of s.players) {
        if (!p.ko && Math.hypot(p.x - f.x, p.y - 12 - f.y) < 24) { s.hurt(p, f.x - f.vx * 0.1, f.y - f.vy * 0.1); gone = true; break; }
      }
      if (gone) { s.events.push({ k: 'fbHit', x: Math.round(f.x), y: Math.round(f.y) }); f.born = -1; }
    }
    this.fireballs = this.fireballs.filter((f) => f.born >= 0);
    for (const m of this.meteors) {
      if (this.now < m.at) continue;
      s.events.push({ k: 'meteorLand', x: m.x, y: m.y });
      s.meltIce(tileOf(m.x), tileOf(m.y));
      for (const p of s.players) if (Math.hypot(p.x - m.x, p.y - m.y) < 40) s.hurt(p, m.x, m.y - 1);
      m.at = -1;
    }
    this.meteors = this.meteors.filter((m) => m.at >= 0);
  }

  snap(): BossSnap {
    return {
      ...this.baseSnap(),
      fb: this.fireballs.map((f) => [f.i, Math.round(f.x), Math.round(f.y), Math.round(f.vx), Math.round(f.vy)]),
      mt: this.meteors.map((m) => [m.i, m.x, m.y, Math.max(0, Math.round(m.at - this.now))]),
      sh: this.shockAt > 0 ? Math.round(this.shockAt - this.now) : -1, shr: 210,
    };
  }
}

// ====================================================================== STAGE 4: THE COLLECTOR
/**
 * Final boss on his money throne. Money is dangerous: bills cause DEBT (slower, longer cooldowns),
 * debt tokens home in and LOCK a skill, documents (TAX, RENT, FEE, LATE FEE...) hurt, briefcases
 * slam marked floor tiles and cash tornados roam. Coming close triggers an AUDIT blast - but only
 * close photos deal real damage (far 0 / medium 1 / close 3).
 */
class CollectorSim extends BossBase {
  private auditReadyAt = 5000;
  constructor(sim: LevelSim, hp: number) {
    super(sim, 'collector', hp);
    const c = this.carpetCentre();
    this.x = c.x; this.y = c.y;
  }
  target() { return { x: this.x, y: this.y }; }
  blocksTile(tx: number, ty: number) { return tileAt(this.sim.level, tx, ty) === 'X'; }
  protected onEnrage() { this.say('KAMATA SE UDVOSTRUCUJE!'); }
  tick() {
    if (this.dead) return;
    const now = this.now;
    if (this.state !== 'idle' && now < this.stateEnd) return;
    this.state = 'idle';
    if (now < this.nextActionAt) return;
    const players = this.alive();
    if (!players.length) return;
    const p = pick(players);
    const sx = this.x, sy = this.y + 30;
    const near = players.some((q) => Math.hypot(q.x - this.x, q.y - this.y) < 170);
    const roll = Math.random();
    if (near && now >= this.auditReadyAt) {
      this.setState('taunt', 900);
      this.sim.addHazard('audit', this.x, this.y + 20, 165, 900, 300, 'damage', 0, { once: true });
      this.auditReadyAt = now + (this.enraged ? 3800 : 5200);
      this.say('REVIZIJA!');
    } else if (roll < 0.3) {
      this.setState('cast', 800);
      const kinds: ProjectileKind[] = ['tax', 'rent', 'fee', 'pastdue'];
      const n = this.enraged ? 5 : 3;
      const base = this.aim(p, sx, sy);
      for (let i = 0; i < n; i++) {
        const a = base + (i / Math.max(1, n - 1) - 0.5) * 0.8;
        this.sim.spawnProj(kinds[i % kinds.length], sx, sy, Math.cos(a) * 220, Math.sin(a) * 220, 'damage');
      }
      this.say(pick(COLLECTOR_BILLS) + '!');
      this.sim.events.push({ k: 'bossCast', kind: 'bills' });
    } else if (roll < 0.5) {
      this.setState('throw', 900);
      for (let i = 0; i < (this.enraged ? 14 : 10); i++) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const sp = 120 + Math.random() * 80;
        this.sim.spawnProj('money', sx, sy, Math.cos(a) * sp, Math.sin(a) * sp, 'debt', 4500);
      }
      this.say('UZMITE KREDIT!');
      this.sim.events.push({ k: 'bossCast', kind: 'money' });
    } else if (roll < 0.65) {
      this.setState('cast', 700);
      this.sim.spawnProj('debt', sx, sy, 0, 140, 'lock', 4500, { homing: p.id, ttl: 6500 });
      this.say('INTEREST!');
      this.sim.events.push({ k: 'bossCast', kind: 'debt' });
    } else if (roll < 0.85) {
      this.setState('taunt', 900);
      for (const q of players) {
        this.sim.addHazard('slam', q.x, q.y, 44, 1600, 300, 'damage', 0, { once: true });
        const s2 = this.randomFloorNear(q.x, q.y, 3);
        if (s2) this.sim.addHazard('slam', s2.x, s2.y, 44, 1700, 300, 'damage', 0, { once: true });
      }
      this.say('LATE FEE!');
      this.sim.events.push({ k: 'bossCast', kind: 'slam' });
    } else {
      this.setState('throw', 900);
      const a = this.aim(p, this.x, this.y);
      this.sim.addHazard('cashstorm', this.x, this.y + 60, 40, 400, 6000, 'debt', 3500, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 });
      this.say('SERVICE FEE!');
      this.sim.events.push({ k: 'bossCast', kind: 'tornado' });
    }
    this.nextActionAt = this.stateEnd + (this.enraged ? 700 : 1200);
  }
}
