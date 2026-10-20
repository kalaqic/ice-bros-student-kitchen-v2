import { CAMERA_RADIUS, DT, TILE } from '../../shared/constants.ts';
import { tileAt } from '../../shared/level.ts';
import type { BossSnap } from '../../shared/protocol.ts';
import { tileCenter, tileOf } from '../../shared/physics.ts';
import type { LevelSim } from './LevelSim.ts';
import type { Player } from './Player.ts';

type State = BossSnap['st'];
interface Fireball { i: number; x: number; y: number; vx: number; vy: number; born: number }
interface Meteor { i: number; x: number; y: number; at: number }

const QUOTES = [
  'TISINA U MOJOJ KANCELARIJI!', 'KO VAM JE DAO DOZVOLU?!', 'SVI U MOJU KANCELARIJU!',
  'NEMA KAFE BEZ POTPISA!', 'OPET VI DVOJICA?!', 'ROK JE BIO JUCE!',
];

/**
 * BRANKA - boss of level 11. Sits on her carpet at the top centre and:
 *  - throws fireballs straight at a player (ice blocks them and melt),
 *  - raises her hands: tiles get marked on the floor, meteors land ~2 s later,
 *  - slams a shockwave when someone gets close (the risky part: the camera needs you near her).
 * Only camera flashes hurt her (1 HP each) and briefly stun her.
 */
export class BrankaSim {
  x: number; y: number;
  hp: number; readonly max: number;
  state: State = 'idle';
  stateStart = 0; stateEnd = 0;
  nextActionAt = 2500;
  rainReadyAt = 7000;
  shockReadyAt = 4000;
  hurtUntil = 0;
  enraged = false;
  dead = false; deadAt = 0;
  fireballs: Fireball[] = [];
  meteors: Meteor[] = [];
  shockAt = -1;
  private ids = 1;
  private castTarget: Player | null = null;

  constructor(private sim: LevelSim, hp: number) {
    this.hp = this.max = hp;
    // centre of the 'X' carpet
    let x0 = 99, x1 = 0, y0 = 99, y1 = 0;
    sim.level.map.forEach((row, ty) => [...row].forEach((c, tx) => { if (c === 'X') { x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty); } }));
    this.x = ((x0 + x1 + 1) / 2) * TILE;
    this.y = ((y0 + y1 + 1) / 2) * TILE;
  }

  private get now() { return this.sim.now; }
  private alive() { return this.sim.players.filter((p) => !p.ko && p.connected); }
  private setState(st: State, dur: number) { this.state = st; this.stateStart = this.now; this.stateEnd = this.now + dur; }
  private say(text: string) { this.sim.events.push({ k: 'bossSay', text }); }

  onFlash(p: Player, cx: number, cy: number) {
    if (this.dead) return;
    if (Math.hypot(this.x - cx, this.y - cy) > CAMERA_RADIUS + 40) return;
    this.hp = Math.max(0, this.hp - 1);
    this.hurtUntil = this.now + 600;
    this.sim.events.push({ k: 'bossHit', by: p.id, hp: this.hp });
    if (this.hp <= 0) {
      this.dead = true; this.deadAt = this.now; this.setState('dead', 99999);
      this.fireballs = []; this.meteors = []; this.shockAt = -1;
      this.sim.events.push({ k: 'bossDead' });
      return;
    }
    // a flash interrupts whatever she was doing
    this.shockAt = -1;
    this.setState('stunned', 1100);
    this.nextActionAt = this.stateEnd + 500;
    if (!this.enraged && this.hp <= this.max / 2) {
      this.enraged = true;
      this.sim.events.push({ k: 'bossEnrage' });
      this.say('SAD STE ME NAJLJUTILI!');
    }
  }

  tick() {
    if (this.dead) return;
    const now = this.now;
    this.tickProjectiles();
    // finish states
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
      if (Math.random() < 0.6) this.say(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
    } else {
      this.castTarget = players[Math.floor(Math.random() * players.length)];
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
    for (const a of spread) {
      this.fireballs.push({ i: this.ids++, x: sx, y: sy, vx: Math.cos(base + a) * speed, vy: Math.sin(base + a) * speed, born: this.now });
    }
  }

  private dropMeteors() {
    const s = this.sim;
    const targets: [number, number][] = [];
    const free = (tx: number, ty: number) => { const c = tileAt(s.level, tx, ty); return c === '.'; };
    const add = (tx: number, ty: number) => {
      if (free(tx, ty) && !targets.some(([a, b]) => a === tx && b === ty)) targets.push([tx, ty]);
    };
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
    const dur = Math.max(1, this.stateEnd - this.stateStart);
    return {
      x: Math.round(this.x), y: Math.round(this.y), hp: this.hp, max: this.max, st: this.state,
      sp: this.state === 'dead' ? Math.min(1, (this.now - this.deadAt) / 1500) : Math.min(1, (this.now - this.stateStart) / dur),
      enr: this.enraged ? 1 : 0, hurt: this.now < this.hurtUntil ? 1 : 0,
      fb: this.fireballs.map((f) => [f.i, Math.round(f.x), Math.round(f.y), Math.round(f.vx), Math.round(f.vy)]),
      mt: this.meteors.map((m) => [m.i, m.x, m.y, Math.max(0, Math.round(m.at - this.now))]),
      sh: this.shockAt > 0 ? Math.round(this.shockAt - this.now) : -1, shr: 210,
    };
  }
}
