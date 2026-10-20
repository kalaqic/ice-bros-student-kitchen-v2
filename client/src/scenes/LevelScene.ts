import { drawChar, img, type ImageKey, BOSS_ANIMS, type BossAnim } from '../engine/assets.ts';
import { measure, text } from '../engine/font.ts';
import { Fx, drawStar, ease } from '../engine/fx.ts';
import type { Scene } from '../engine/Game.ts';
import { C, bubble, panel, pixRect, ring, tag } from '../engine/ui.ts';
import { CharacterView } from '../game/Character.ts';
import { Interp, Predictor } from '../game/Predictor.ts';
import type { App } from '../main.ts';
import { CAMERA_COOLDOWN_MS, CAMERA_RADIUS, COFFEE_MAX, MAX_HP, TILE } from '../../../shared/constants.ts';
import { ITEM_LABEL, ITEM_OWNER, type ItemKind } from '../../../shared/items.ts';
import { type LevelDef, STATION_CODES, levelCols, levelRows, playerTileSolid, tileAt } from '../../../shared/level.ts';
import { LEVELS, LEVEL_ORDER, levelIndex } from '../../../shared/levels/index.ts';
import { tileCenter, tileOf, type SolidFn } from '../../../shared/physics.ts';
import type { BossSnap, EnemySnap, GameEvent, PlayerSnap, ServerMsg, Snapshot } from '../../../shared/protocol.ts';
import { DIRS, roleName, type Role } from '../../../shared/types.ts';
import { drawImageFit } from './common.ts';

const OX = 160, OY = 72; // level area offset inside the 1280x720 view
const ITEM_IMG: Record<ItemKind, ImageKey> = {
  protein: 'protein', creatine: 'creatine', mealprep: 'mealprep', pizza: 'pizza', burger: 'burger', soda: 'soda', noodles: 'noodles',
};
const OWNER_COLOR = { david: '#4f8dff', nemanja: '#ffffff', both: '#ffd34d' };
const ENEMY_IMG: Record<string, [ImageKey, ImageKey]> = {
  mold: ['mold_0', 'mold_1'], yogurt: ['yogurt_0', 'yogurt_1'], dishes: ['dishes_0', 'dishes_1'],
};

const THEME_TINT: Record<string, string | null> = {
  kitchen: null, canteen: 'rgba(255,214,140,0.16)', dorm: 'rgba(200,140,80,0.20)', library: 'rgba(150,110,190,0.16)',
  laundry: 'rgba(90,180,255,0.16)', lab: 'rgba(120,230,170,0.16)', gym: 'rgba(255,150,80,0.15)', arcade: 'rgba(130,70,200,0.20)',
  office: 'rgba(200,60,60,0.16)',
};
const BOSS_LABELS: Record<string, string> = { cast: 'VATRENA KUGLA!', rain: 'KISA VATRE!', shock: 'UDARNI TALAS!' };

interface Banner { title: string; sub: string; t: number; max: number; color: string }

export class LevelScene implements Scene {
  private level: LevelDef;
  get levelId() { return this.level.id; }
  private cols: number;
  private rows: number;
  private staticLayer: HTMLCanvasElement;
  private ice = new Set<number>();
  private iceBorn = new Map<number, number>();
  private taken = new Set<number>();
  private coffeeTaken = new Set<number>();
  private stations: { tx: number; ty: number; role: Role; label: string }[] = [];
  private stProg: number[] = [];
  private gateOpen = false;
  private exitOpen = false;
  private paused: string | null = null;
  private timeMs = 0;
  private snap: Snapshot | null = null;
  private views = new Map<Role, CharacterView>();
  private pred: Predictor;
  private pInterp = new Interp<PlayerSnap>();
  private eInterp = new Interp<EnemySnap>();
  private fx = new Fx();
  private banners: Banner[] = [];
  private flash = 0;
  private t = 0;
  private intro = 3.2;
  private alpha = 0;
  private off: (() => void) | null = null;
  private now = 0;
  private camPop = new Map<string, number>();
  private boss: BossSnap | null = null;
  private bossPrev: BossSnap | null = null;
  private bossSnapAt = 0;
  private bossSay: { text: string; t: number } | null = null;
  /** two-character scenes: being pulled up (driven by revive progress) and the bro handshake after */
  private duo: { kind: 'revive' | 'shake'; downed: Role; helper: Role; t: number; dur: number; frame: number } | null = null;
  /** frame-animated sprite effects from the effect sheets (ice blast, camera flash) */
  private sprites: { keys: ImageKey[]; x: number; y: number; x1: number; y1: number; t: number; delay: number; dur: number; rot: number; size: number }[] = [];

  private spriteFx(keys: ImageKey[], x: number, y: number, o: { x1?: number; y1?: number; delay?: number; dur?: number; rot?: number; size?: number } = {}) {
    this.sprites.push({ keys, x, y, x1: o.x1 ?? x, y1: o.y1 ?? y, t: 0, delay: o.delay ?? 0, dur: o.dur ?? 0.3, rot: o.rot ?? 0, size: o.size ?? 64 });
  }

  constructor(private app: App) {
    this.level = LEVELS[app.session.levelId] ?? LEVELS.level1;
    this.cols = levelCols(this.level);
    this.rows = levelRows(this.level);
    this.pred = new Predictor(app.session.net);
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const c = tileAt(this.level, tx, ty);
      const def = this.level.stations[c];
      if (STATION_CODES.includes(c) && def) this.stations.push({ tx, ty, role: def.role, label: def.label });
    }
    this.staticLayer = this.buildStatic();
  }

  enter() { this.off = this.app.session.net.on((m) => this.onMsg(m)); }
  exit() { this.off?.(); }

  // ------------------------------------------------------------------ static art
  private buildStatic(): HTMLCanvasElement {
    const L = this.level;
    const cv = document.createElement('canvas');
    cv.width = this.cols * TILE; cv.height = this.rows * TILE;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const furn = (c: string) => 'CFSKTLAHWX'.includes(c);
    const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const c = tileAt(L, tx, ty);
      const x = tx * TILE, y = ty * TILE;
      if (c !== '#') g.drawImage(img[(tx + ty) % 2 ? 'floor1' : 'floor0'], x, y);
      let key: ImageKey | null = null;
      switch (c) {
        case '#': key = ty > 0 && tileAt(L, tx, ty - 1) === '#' && ty < this.rows - 1 ? 'wall' : 'wall_cap'; break;
        case 'C': { const h = hash(tx, ty) % 7; key = h === 1 ? 'counter1' : h === 2 ? 'counter2' : h === 3 ? 'counter3' : 'counter0'; break; }
        case 'F': key = 'fridge'; break;
        case 'S': key = 'stove'; break;
        case 'K': key = 'sink'; break;
        case 'T': key = 'table'; break;
        case 'L': key = 'terminal_david'; break;
        case 'A': key = 'terminal_nemanja'; break;
        case 'H': key = 'bookshelf'; break;
        case 'W': key = 'washer'; break;
        case 'X': key = 'boss_carpet'; break;
      }
      if (key) g.drawImage(img[key], x, y);
      // theme colour wash on the floor so every room feels different
      const tint = THEME_TINT[L.theme];
      if (tint && c !== '#' && !key) { g.fillStyle = tint; g.fillRect(x, y, TILE, TILE); }
      if (tint && c === '#') { g.fillStyle = tint; g.fillRect(x, y + 12, TILE, TILE - 12); }
    }
    // shadows + outlines around furniture clusters and under the walls
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const c = tileAt(L, tx, ty);
      const x = tx * TILE, y = ty * TILE;
      const below = tileAt(L, tx, ty + 1);
      if ((furn(c) || c === '#') && !furn(below) && below !== '#' && ty + 1 < this.rows) {
        g.fillStyle = 'rgba(30,60,110,0.22)'; g.fillRect(x, y + TILE, TILE, 8);
        g.fillStyle = 'rgba(30,60,110,0.12)'; g.fillRect(x, y + TILE + 8, TILE, 4);
      }
      if (!furn(c)) continue;
      g.fillStyle = '#16264a';
      const same = (dx: number, dy: number) => { const n = tileAt(L, tx + dx, ty + dy); return n === c || (c === 'C' && n === 'C') || (c === 'F' && n === 'F') || (c === 'S' && n === 'S'); };
      if (!same(0, -1)) g.fillRect(x, y, TILE, 2);
      if (!same(0, 1)) g.fillRect(x, y + TILE - 2, TILE, 2);
      if (!same(-1, 0)) g.fillRect(x, y, 2, TILE);
      if (!same(1, 0)) g.fillRect(x + TILE - 2, y, 2, TILE);
    }
    return cv;
  }

  // ------------------------------------------------------------------ net
  private view(r: Role) {
    let v = this.views.get(r);
    if (!v) { v = new CharacterView(r); this.views.set(r, v); }
    return v;
  }
  private iceAt = (tx: number, ty: number) => this.ice.has(ty * this.cols + tx);
  private solid: SolidFn = (x, y) => playerTileSolid(this.level, tileOf(x), tileOf(y), this.iceAt, this.gateOpen, this.exitOpen);

  private onMsg(m: ServerMsg) {
    if (m.t === 'level') { this.restartVisuals(); return; }
    if (m.t !== 's') return;
    this.snap = m;
    if (m.boss) { this.bossPrev = this.boss; this.boss = m.boss; this.bossSnapAt = performance.now(); }
    const s = this.app.session;
    if (m.ice) {
      const next = new Set(m.ice);
      for (const i of next) if (!this.ice.has(i) && !this.iceBorn.has(i)) this.iceBorn.set(i, this.now);
      for (const i of [...this.iceBorn.keys()]) if (!next.has(i)) this.iceBorn.delete(i);
      this.ice = next;
    }
    this.taken = new Set(m.taken);
    this.coffeeTaken = new Set(m.coffee);
    this.stProg = m.st;
    this.gateOpen = !!m.gate;
    this.exitOpen = !!m.exit;
    this.paused = m.paused;
    this.timeMs = m.time;
    this.pInterp.push(m.p.map((p) => [p.id, p]));
    this.eInterp.push(m.e.map((e) => [e.i, e]));
    const me = m.p.find((p) => p.id === s.me?.id);
    if (me) this.pred.reconcile(me, this.solid);
    for (const ev of m.ev) this.onEvent(ev);
  }

  private restartVisuals() {
    this.fx.clear(); this.iceBorn.clear(); this.banners = []; this.intro = 2.4; this.pred.initialised = false;
  }

  private posOf(id: string): { x: number; y: number } | null {
    const r = this.app.session.roleOf(id);
    const v = r ? this.views.get(r) : null;
    return v ? { x: v.x, y: v.y } : null;
  }
  private isMe(id: string) { return id === this.app.session.me?.id; }

  private onEvent(ev: GameEvent) {
    const a = this.app.game.audio;
    const s = this.app.session;
    const roleOf = (id: string) => s.roleOf(id);
    switch (ev.k) {
      case 'ice': {
        ev.tiles.forEach((t, i) => this.iceBorn.set(t, this.now + 0.14 + i * 0.04));
        const p = this.posOf(ev.by);
        const r0 = roleOf(ev.by);
        if (r0) this.view(r0).play('ice', 0.42);
        if (p) {
          const d = DIRS[ev.dir];
          const last = ev.tiles[ev.tiles.length - 1];
          const lx = (last % this.cols) * TILE + 24, ly = Math.floor(last / this.cols) * TILE + 24;
          this.spriteFx(['iceblast_0', 'iceblast_1', 'iceblast_2', 'iceblast_3'], p.x + d.x * 24, p.y - 22 + d.y * 10,
            { x1: lx, y1: ly - 6, delay: 0.1, dur: 0.12 + ev.tiles.length * 0.04, rot: Math.atan2(d.y, d.x), size: 76 });
          this.fx.burst(p.x + d.x * 20, p.y - 16 + d.y * 16, 14, {
            angle: Math.atan2(d.y, d.x), spread: 0.7, speed: 260, colors: ['#ffffff', '#bfe8ff', '#8fd0f5'], size: 4, drag: 3, max: 0.45,
          });
        }
        for (const t of ev.tiles) {
          const cx = (t % this.cols) * TILE + 24, cy = Math.floor(t / this.cols) * TILE + 24;
          this.fx.burst(cx, cy, 4, { speed: 50, colors: ['#ffffff', '#dff3ff'], size: 3, max: 0.5, g: -20 });
        }
        a.play('ice');
        break;
      }
      case 'iceBreak': {
        const r0 = roleOf(ev.by);
        if (r0) this.view(r0).play('ice', 0.36);
        for (const t of ev.tiles) {
          const cx = (t % this.cols) * TILE + 24, cy = Math.floor(t / this.cols) * TILE + 24;
          this.fx.burst(cx, cy, 10, { shape: 'shard', speed: 170, g: 420, colors: ['#bfe8ff', '#8fd0f5', '#ffffff', '#5aa8e0'], size: 6, max: 0.7 });
          this.fx.burst(cx, cy, 6, { speed: 60, colors: ['#ffffff'], size: 3, max: 0.4 });
        }
        a.play('iceBreak');
        break;
      }
      case 'iceFail': if (this.isMe(ev.by)) a.play('iceFail'); break;
      case 'collect': {
        const it = this.level.items[ev.item];
        const cx = tileCenter(it.tx), cy = tileCenter(it.ty);
        this.fx.burst(cx, cy - 6, 16, { shape: 'star', speed: 150, colors: ['#ffd34d', '#ffffff', '#8fd0f5'], size: 5, max: 0.6, drag: 2 });
        this.fx.float(cx, cy - 34, '+' + ITEM_LABEL[it.kind], ITEM_OWNER[it.kind] === 'both' ? C.gold : '#ffffff');
        const r = roleOf(ev.by);
        if (ev.text && r) this.view(r).speak(ev.text);
        a.play('collect');
        break;
      }
      case 'coffeePickup': {
        const c = this.level.coffee[ev.idx];
        this.fx.float(tileCenter(c.tx), tileCenter(c.ty) - 30, '+1 KAFA', '#ffcf9a');
        this.fx.burst(tileCenter(c.tx), tileCenter(c.ty), 10, { speed: 90, colors: ['#8a5a2b', '#ffffff'], size: 4, max: 0.5 });
        a.play('coffeePickup');
        break;
      }
      case 'disgust': {
        const r = roleOf(ev.by);
        if (r) this.view(r).speak(ev.text, '#2c6a1c', 2.2);
        const p = this.posOf(ev.by);
        if (p) this.fx.burst(p.x, p.y - 40, 10, { speed: 60, g: -60, colors: ['#8bd35a', '#5aa83a'], size: 5, max: 0.9 });
        a.play('disgust');
        break;
      }
      case 'say': { const r = roleOf(ev.by); if (r) this.view(r).speak(ev.text); break; }
      case 'drink': a.play('sip'); break;
      case 'heal': {
        const p = this.posOf(ev.by);
        if (p) {
          this.fx.float(p.x, p.y - 80, '+1 @', '#7fe08a', 3);
          for (let i = 0; i < 6; i++) this.fx.add({ x: p.x + (Math.random() - 0.5) * 40, y: p.y - 30, vy: -60 - Math.random() * 40, shape: 'heart', size: 8, color: '#ff6b6b', max: 1 });
        }
        a.play('heal');
        break;
      }
      case 'flash': {
        const mine = this.isMe(ev.by);
        const fr = roleOf(ev.by);
        if (fr) {
          const v = this.view(fr);
          v.play('photo', 0.62);
          const h = v.handPos();
          this.spriteFx(['flash_0', 'flash_1', 'flash_2', 'flash_3'], h.x, h.y - 6, { delay: 0.2, dur: 0.42, size: 110 });
        }
        this.flash = mine ? 0.85 : 0.35;
        this.camPop.set(ev.by, 0.6);
        this.fx.add({ x: ev.x, y: ev.y, shape: 'ring', size: 20, grow: CAMERA_RADIUS * 3.2, color: '#ffffff', max: 0.32 });
        this.fx.add({ x: ev.x, y: ev.y, shape: 'ring', size: 10, grow: CAMERA_RADIUS * 2.4, color: '#fff7b0', max: 0.42 });
        this.fx.burst(ev.x, ev.y, 18, { speed: 280, colors: ['#ffffff', '#fff7b0'], size: 4, drag: 4, max: 0.4 });
        for (const i of ev.stunned) {
          const e = this.eInterp.get(i, 0);
          if (e) { this.fx.float(e.x, e.y - 44, 'STUN!', C.gold, 2); this.fx.burst(e.x, e.y - 20, 8, { shape: 'star', speed: 120, colors: ['#ffd34d'], size: 5, max: 0.6 }); }
        }
        a.play('shutter');
        if (ev.stunned.length) a.play('stun');
        break;
      }
      case 'hit': {
        const p = this.posOf(ev.by);
        if (p) {
          this.fx.float(p.x, p.y - 80, '-1 @', '#ff6b6b', 3);
          this.fx.burst(p.x, p.y - 30, 12, { speed: 160, colors: ['#ff6b6b', '#ffffff'], size: 4, max: 0.5 });
        }
        if (this.isMe(ev.by)) this.app.game.shake = 10;
        a.play('hit');
        break;
      }
      case 'ko': { const p = this.posOf(ev.by); if (p) this.fx.float(p.x, p.y - 90, 'KNOCKOUT!', C.red, 3); a.play('ko'); break; }
      case 'revive': {
        const r = roleOf(ev.by);
        const p = this.posOf(ev.by);
        if (p) { this.fx.float(p.x, p.y - 90, 'REVIVE!', '#7fe08a', 3); this.fx.burst(p.x, p.y - 30, 18, { shape: 'star', speed: 160, colors: ['#7fe08a', '#ffffff'], size: 5, max: 0.7 }); }
        const hr = ev.helper ? roleOf(ev.helper) : undefined;
        if (r && hr) { this.duo = { kind: 'shake', downed: r, helper: hr, t: 0, dur: 1.1, frame: 0 }; setTimeout(() => this.view(r).speak('HVALA BRATE!'), 900); }
        a.play('revive');
        break;
      }
      case 'station': {
        const st = this.stations[ev.idx];
        if (st) {
          this.fx.float(tileCenter(st.tx), tileCenter(st.ty) - 50, st.label + ' OK!', '#7fe08a', 2);
          this.fx.burst(tileCenter(st.tx), tileCenter(st.ty) - 10, 16, { shape: 'star', speed: 150, colors: ['#7fe08a', '#ffd34d'], size: 5, max: 0.7 });
        }
        a.play('station');
        if (!this.stProg.every((v) => v >= 1)) this.banner('TERMINAL AKTIVAN', 'SAD JOS ONAJ DRUGI...', '#7fe08a');
        break;
      }
      case 'gate':
        for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) if (tileAt(this.level, tx, ty) === 'G') {
          this.fx.burst(tileCenter(tx), tileCenter(ty), 14, { shape: 'shard', speed: 190, g: 420, colors: ['#bfe8ff', '#8fd0f5', '#ffd34d'], size: 6, max: 0.8 });
        }
        this.banner('MAGACIN OTKLJUCAN!', 'KOD + ARKADA = TIMSKI RAD', C.gold);
        a.play('gate');
        break;
      case 'exitOpen':
        this.banner('IZLAZ OTVOREN!', 'OBOJICA NA VRATA GORE', '#7fe08a');
        a.play('exit');
        break;
      case 'emote': { const r = roleOf(ev.by); if (r) { this.view(r).doEmote(ev.e); a.play('emote'); } break; }
      case 'fail': this.banner('OBOJICA SU PALI!', 'RESTART NIVOA...', C.red); a.play('ko'); break;
      case 'restart': this.restartVisuals(); break;
      case 'coffeeSpawn': {
        const c = this.level.coffee[ev.idx];
        if (c) this.fx.burst(tileCenter(c.tx), tileCenter(c.ty), 12, { shape: 'star', speed: 90, colors: ['#ffd34d', '#ffffff'], size: 4, max: 0.6 });
        break;
      }
      case 'bossCast': if (ev.kind !== 'fireball') this.app.game.audio.play('ko'); else this.app.game.audio.play('emote'); break;
      case 'fbHit':
        this.spriteFx(['boss_fireball_2'], ev.x, ev.y, { dur: 0.35, size: 70 });
        this.fx.burst(ev.x, ev.y, 10, { speed: 140, colors: ['#ffb02e', '#ff5a2e', '#fff1a0'], size: 4, max: 0.45 });
        a.play('hit');
        break;
      case 'meteorLand':
        this.spriteFx(['boss_fireball_2'], ev.x, ev.y - 10, { dur: 0.45, size: 96 });
        this.fx.burst(ev.x, ev.y, 18, { speed: 200, g: 300, colors: ['#ffb02e', '#ff5a2e', '#fff1a0', '#7a2a18'], size: 5, max: 0.6 });
        this.app.game.shake = Math.max(this.app.game.shake, 5);
        a.play('iceBreak');
        break;
      case 'bossShock':
        this.fx.add({ x: ev.x, y: ev.y, shape: 'ring', size: 30, grow: ev.r * 3.2, color: '#ff6a3a', max: 0.3 });
        this.fx.add({ x: ev.x, y: ev.y, shape: 'ring', size: 20, grow: ev.r * 2.6, color: '#ffd34d', max: 0.4 });
        this.fx.burst(ev.x, ev.y + 30, 30, { speed: 320, colors: ['#ff6a3a', '#ffd34d', '#ffffff'], size: 5, drag: 3, max: 0.5 });
        this.app.game.shake = 12;
        a.play('hit');
        break;
      case 'bossHit':
        if (this.boss) {
          this.fx.float(this.boss.x, this.boss.y - 100, '-1', C.gold, 4);
          this.fx.burst(this.boss.x, this.boss.y - 30, 14, { shape: 'star', speed: 160, colors: ['#ffd34d', '#ffffff'], size: 6, max: 0.6 });
        }
        a.play('stun');
        break;
      case 'bossEnrage': this.banner('BRANKA BESNI!', 'BRZE KUGLE, VISE VATRE', C.red); a.play('ko'); break;
      case 'bossDead':
        this.banner('BRANKA JE PALA!', 'KANCELARIJA JE SLOBODNA', '#7fe08a');
        if (this.boss) this.fx.burst(this.boss.x, this.boss.y, 40, { shape: 'star', speed: 260, colors: ['#ffd34d', '#ffffff', '#ff7a6e'], size: 7, max: 1.2 });
        a.play('complete');
        break;
      case 'bossSay': this.bossSay = { text: ev.text, t: 2.6 }; break;
    }
  }

  private banner(title: string, sub: string, color: string) {
    this.banners = [{ title, sub, t: 2.6, max: 2.6, color }];
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.t += dt; this.now += dt;
    const { game, session } = this.app;
    const inp = game.input;
    this.fx.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.intro > 0) this.intro -= dt;
    for (const b of this.banners) b.t -= dt;
    this.banners = this.banners.filter((b) => b.t > 0);
    if (this.bossSay && (this.bossSay.t -= dt) <= 0) this.bossSay = null;
    for (const sp of this.sprites) sp.t += dt;
    this.sprites = this.sprites.filter((sp) => sp.t < sp.delay + sp.dur);
    for (const [k, v] of this.camPop) { if (v - dt <= 0) this.camPop.delete(k); else this.camPop.set(k, v - dt); }

    const complete = !!session.complete;
    const axis = complete || this.paused ? { dx: 0, dy: 0 } : inp.axis();
    this.alpha = this.pred.update(dt, axis, this.solid);
    if (!complete && !this.paused) {
      if (inp.wasPressed('Space')) session.net.send({ t: 'act', a: 'ice' });
      if (inp.wasPressed('KeyE')) session.net.send({ t: 'act', a: 'coffee' });
      if (inp.wasPressed('KeyF')) session.net.send({ t: 'act', a: 'camera' });
      for (let i = 0; i < 4; i++) if (inp.wasPressed('Digit' + (i + 1))) session.net.send({ t: 'emote', e: i });
    }

    if (!this.snap) return;
    for (const p of this.snap.p) {
      const v = this.view(p.role);
      const mine = p.id === session.me?.id;
      if (mine) {
        const d = this.pred.display(this.alpha);
        v.x = d.x; v.y = d.y; v.setFacing(this.pred.pos.facing); v.st.moving = this.pred.moving;
      } else {
        const ip = this.pInterp.get(p.id) ?? p;
        v.x = ip.x; v.y = ip.y; v.setFacing(ip.f); v.st.moving = !!ip.m;
      }
      v.st.drinking = !!p.dr; v.st.ko = !!p.ko; v.st.invuln = !!p.inv; v.st.slowed = !!p.sl; v.st.revive = p.rv;
      v.st.win = complete;
      if (v.st.ko || v.st.drinking || complete) v.st.moving = false;
      if (v.update(dt) && mine) {
        game.audio.play('step');
        this.fx.add({ x: v.x + (Math.random() - 0.5) * 10, y: v.y + 9, vy: -10, size: 4, color: 'rgba(255,255,255,0.8)', max: 0.35, front: false });
      }
    }
    // revive scene while a teammate is pulling the downed player up
    if (this.duo?.kind === 'shake') {
      this.duo.t += dt;
      this.duo.frame = Math.min(3, Math.floor((this.duo.t / this.duo.dur) * 4));
      if (this.duo.t >= this.duo.dur) this.duo = null;
    } else {
      this.duo = null;
      for (const p of this.snap.p) {
        if (!p.ko || p.rv <= 0.03) continue;
        const helper = this.snap.p.find((q) => q.id !== p.id && !q.ko);
        if (!helper) continue;
        this.duo = { kind: 'revive', downed: p.role, helper: helper.role, t: 0, dur: 1, frame: Math.min(3, Math.floor(p.rv * 4)) };
      }
    }
    for (const v of this.views.values()) v.hidden = !!this.duo && !complete;
  }

  // ------------------------------------------------------------------ render
  render(ctx: CanvasRenderingContext2D) {
    this.drawFrame(ctx);
    ctx.save();
    ctx.beginPath(); ctx.rect(OX, OY, this.cols * TILE, this.rows * TILE); ctx.clip();
    ctx.translate(OX, OY);
    ctx.drawImage(this.staticLayer, 0, 0);
    this.drawWorld(ctx);
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(OX, OY, this.cols * TILE, this.rows * TILE); }
    this.drawHud(ctx);
    this.drawOverlays(ctx);
  }

  private drawWorld(ctx: CanvasRenderingContext2D) {
    const s = this.app.session;
    const L = this.level;
    const t = this.t;
    // exit door
    let ex = -1, ey = 0;
    for (let tx = 0; tx < this.cols; tx++) if (tileAt(L, tx, 0) === 'E') { ex = tx; break; }
    if (ex >= 0) {
      ctx.drawImage(img[this.exitOpen ? 'exit_open' : 'exit_closed'], ex * TILE, ey);
      if (this.exitOpen) {
        ctx.fillStyle = `rgba(255,240,160,${0.25 + Math.sin(t * 5) * 0.12})`;
        ctx.fillRect(ex * TILE - 6, 0, TILE * 2 + 12, TILE + 10);
      }
    }
    // gate
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      if (tileAt(L, tx, ty) === 'G' && !this.gateOpen) ctx.drawImage(img.gate, tx * TILE, ty * TILE);
    }
    // stations
    this.stations.forEach((st, i) => {
      const cx = tileCenter(st.tx), cy = tileCenter(st.ty);
      const prog = this.stProg[i] ?? 0;
      const done = prog >= 1;
      if (done) {
        ctx.fillStyle = `rgba(127,224,138,${0.25 + Math.sin(t * 4) * 0.1})`;
        ctx.fillRect(st.tx * TILE - 4, st.ty * TILE - 4, TILE + 8, TILE + 8);
      }
      const by = cy - 46 + Math.sin(t * 3 + i) * 2;
      pixRect(ctx, cx - 30, by - 10, 60, 20, C.navyD, 4);
      pixRect(ctx, cx - 28, by - 8, 56, 16, done ? C.green : st.role === 'david' ? '#3d6fd8' : '#e8e8e8', 3);
      text(ctx, done ? 'OK' : st.label, cx, by - 4, { size: 1, color: done || st.role === 'nemanja' ? C.ink : C.white }, 'center');
      if (!done && prog > 0) ring(ctx, cx, cy - 4, 18, prog, C.gold);
      if (!done) drawImageFit(ctx, img[st.role === 'david' ? 'portrait_david' : 'portrait_nemanja'], cx + 30, by - 2, 24, 24);
    });
    // coffee pickups + items
    L.coffee.forEach((c, i) => {
      if (this.coffeeTaken.has(i)) return;
      const cx = tileCenter(c.tx), cy = tileCenter(c.ty) + Math.sin(t * 3 + i) * 2;
      ctx.fillStyle = 'rgba(20,40,80,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, tileCenter(c.ty) + 14, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      drawImageFit(ctx, img.coffee, cx, cy - 2, 30, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 2; k++) { const ph = (t * 1.2 + k * 0.5) % 1; ctx.fillRect(cx - 4 + k * 7 + Math.sin(ph * 6) * 2, cy - 16 - ph * 12, 2, 4); }
    });
    L.items.forEach((it, i) => {
      if (this.taken.has(i)) return;
      const cx = tileCenter(it.tx), base = tileCenter(it.ty);
      const cy = base - 2 + Math.sin(t * 3 + i * 0.7) * 3;
      const owner = ITEM_OWNER[it.kind];
      ctx.fillStyle = 'rgba(20,40,80,0.25)';
      ctx.beginPath(); ctx.ellipse(cx, base + 13, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OWNER_COLOR[owner]; ctx.lineWidth = 3;
      if (owner === 'nemanja') ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(cx, base + 13, 19, 7, 0, 0, Math.PI * 2); ctx.stroke();
      if (owner === 'nemanja') { ctx.strokeStyle = '#1b1b22'; ctx.lineDashOffset = 4.5; ctx.stroke(); ctx.lineDashOffset = 0; }
      ctx.setLineDash([]);
      drawImageFit(ctx, img[ITEM_IMG[it.kind]], cx, cy, 36, 36);
      if (Math.floor(t * 2 + i) % 5 === 0) {
        ctx.fillStyle = '#ffffff';
        const sx = cx + 12, sy = cy - 14;
        ctx.fillRect(sx - 1, sy - 4, 2, 8); ctx.fillRect(sx - 4, sy - 1, 8, 2);
      }
    });
    // ice blocks
    for (const i of this.ice) {
      const tx = i % this.cols, ty = Math.floor(i / this.cols);
      const born = this.iceBorn.get(i) ?? -10;
      const k = Math.max(0, Math.min(1, (this.now - born) / 0.3));
      if (k <= 0) continue;
      ctx.imageSmoothingEnabled = true;
      if (k < 1) {
        // ICE BLOCK CREATE frames from ice_shot.png, then settle into the block tile
        const fim = img[(['iceblock_0', 'iceblock_1', 'iceblock_2', 'iceblock_3'] as ImageKey[])[Math.min(3, Math.floor(k * 4))]];
        const sc = 54 / Math.max(fim.width, fim.height);
        ctx.drawImage(fim, tx * TILE + 24 - fim.width * sc / 2, ty * TILE + TILE + 2 - fim.height * sc, fim.width * sc, fim.height * sc);
      } else {
        ctx.drawImage(img.ice_block, tx * TILE, ty * TILE, TILE, TILE);
      }
      ctx.imageSmoothingEnabled = false;
    }
    // target tile hint for the local player
    const meSnap = this.snap?.p.find((p) => p.id === s.me?.id);
    const meView = s.me ? this.views.get(s.me.role) : undefined;
    if (meSnap && meView && !meSnap.ko && !s.complete) {
      const d = DIRS[this.pred.pos.facing];
      const tx = tileOf(this.pred.pos.x) + d.x, ty = tileOf(this.pred.pos.y) + d.y;
      const free = tileAt(L, tx, ty) === '.' || this.iceAt(tx, ty);
      if (free) {
        ctx.strokeStyle = this.iceAt(tx, ty) ? 'rgba(255,140,120,0.8)' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 20;
        ctx.strokeRect(tx * TILE + 3, ty * TILE + 3, TILE - 6, TILE - 6);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }
    if (this.boss) this.drawBossFloor(ctx, this.boss);
    this.fx.draw(ctx, false);
    // depth-sorted actors
    const actors: { y: number; draw: () => void }[] = [];
    for (const v of this.views.values()) {
      const info = s.playerByRole(v.role);
      if (!info) continue;
      actors.push({ y: v.y, draw: () => {
        if (!info.connected) ctx.globalAlpha = 0.4;
        v.draw(ctx, { you: info.id === s.me?.id });
        ctx.globalAlpha = 1;
        const cp = this.camPop.get(info.id);
        if (cp) drawImageFit(ctx, img.camera, v.x + (v.flip ? -22 : 22), v.y - 52 - (0.6 - cp) * 20, 34, 26, false);
      } });
    }
    if (this.duo && !s.complete) {
      const d = this.duo;
      const dv = this.views.get(d.downed), hv = this.views.get(d.helper);
      if (dv && hv) actors.push({ y: Math.max(dv.y, hv.y), draw: () => this.drawDuo(ctx, d, dv, hv) });
    }
    if (this.boss) { const b = this.boss; actors.push({ y: b.y + 40, draw: () => this.drawBoss(ctx, b) }); }
    for (const e0 of this.snap?.e ?? []) {
      const e = this.eInterp.get(e0.i) ?? e0;
      const def = L.enemies[e0.i];
      actors.push({ y: e.y + 14, draw: () => this.drawEnemy(ctx, def.type, e, e0.i) });
    }
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    // exit arrow
    if (this.exitOpen && ex >= 0) {
      const ay = 58 + Math.sin(t * 6) * 4;
      text(ctx, '^ IZLAZ ^', ex * TILE + TILE, ay, { size: 2, color: C.gold, outline: C.navyD }, 'center');
    }
    if (this.boss) this.drawFireballs(ctx, this.boss);
    for (const sp of this.sprites) {
      const k = (sp.t - sp.delay) / sp.dur;
      if (k < 0) continue;
      const im = img[sp.keys[Math.min(sp.keys.length - 1, Math.floor(k * sp.keys.length))]];
      const x = sp.x + (sp.x1 - sp.x) * ease.outCubic(k), y = sp.y + (sp.y1 - sp.y) * ease.outCubic(k);
      const sc = sp.size / Math.max(im.width, im.height);
      ctx.save(); ctx.translate(x, y); ctx.rotate(sp.rot);
      ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc);
      ctx.restore();
    }
    this.fx.draw(ctx, true);
  }

  private bossFrame(anim: BossAnim, i: number): HTMLImageElement {
    const n = BOSS_ANIMS[anim];
    return img[`boss_${anim}_${Math.max(0, Math.min(n - 1, i))}` as ImageKey];
  }

  private drawBoss(ctx: CanvasRenderingContext2D, b: BossSnap) {
    const t = this.t;
    let im: HTMLImageElement;
    let size = 150;
    switch (b.st) {
      case 'dead': im = this.bossFrame('defeat', Math.floor(b.sp * 4)); break;
      case 'stunned': im = this.bossFrame('stunned', Math.floor(b.sp * 3)); break;
      case 'cast': im = this.bossFrame('cast', Math.floor(b.sp * 4)); break;
      case 'rain': im = b.sp < 0.35 ? this.bossFrame('enraged', 1) : this.bossFrame('attack', 0); size = b.sp < 0.35 ? 160 : 200; break;
      case 'shock': im = this.bossFrame('taunt', Math.floor(t * 8) % 2); break;
      default:
        im = b.hurt ? this.bossFrame('hurt', Math.floor(t * 10) % 3)
          : b.enr ? this.bossFrame('enraged', Math.floor(t * 4) % 2) : this.bossFrame('idle', Math.floor(t * 2) % 2);
        if (b.enr && !b.hurt) size = 160;
    }
    const float = b.st === 'dead' ? 0 : Math.sin(t * 2) * 4;
    const sc = size / Math.max(im.width, im.height);
    const w = im.width * sc, h = im.height * sc;
    const footY = b.y + 52;
    ctx.fillStyle = 'rgba(40,10,20,0.35)';
    ctx.beginPath(); ctx.ellipse(b.x, footY, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (b.hurt && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.6;
    ctx.drawImage(im, b.x - w / 2, footY - h + float, w, h);
    ctx.restore();
    if (b.st === 'stunned' || b.hurt) {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < 4; i++) { const a = t * 4 + (i * Math.PI) / 2; drawStar(ctx, b.x + Math.cos(a) * 40, footY - h - 6 + Math.sin(a) * 8, 7, t * 5); }
    }
    if (b.st in BOSS_LABELS) text(ctx, BOSS_LABELS[b.st], b.x, footY + 12, { size: 2, color: '#ffb3a8', outline: C.navyD }, 'center');
    if (this.bossSay) bubble(ctx, [this.bossSay.text], b.x + 110, footY - h + 40, Math.min(1, this.bossSay.t * 3), '#7a1414');
  }

  /** telegraphs on the floor: meteor target marks and the shockwave radius */
  private drawBossFloor(ctx: CanvasRenderingContext2D, b: BossSnap) {
    const t = this.t;
    const since = (performance.now() - this.bossSnapAt);
    for (const [, x, y, msRaw] of b.mt) {
      const ms = Math.max(0, msRaw - since);
      const k = 1 - Math.min(1, ms / 2100);
      const pulse = 0.5 + Math.sin(t * (10 + k * 20)) * 0.3;
      ctx.fillStyle = `rgba(255,60,40,${0.12 + k * 0.25})`;
      ctx.beginPath(); ctx.ellipse(x, y + 6, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,${120 - k * 80},60,${pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y + 6, 26, 14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y + 6, 26 * k, 14 * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff5a2e'; ctx.fillRect(x - 10, y + 5, 20, 2); ctx.fillRect(x - 1, y - 4, 2, 20);
      if (ms < 450) {
        // the fireball dropping from the ceiling
        const im = img.boss_fireball_1;
        const fy = y - 30 - (ms / 450) * 260;
        ctx.save(); ctx.translate(x, fy); ctx.rotate(Math.PI / 2);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, -im.width * 0.45, -im.height * 0.45, im.width * 0.9, im.height * 0.9);
        ctx.restore();
      }
    }
    if (b.sh >= 0) {
      const ms = Math.max(0, b.sh - since);
      const k = 1 - Math.min(1, ms / 1000);
      ctx.fillStyle = `rgba(255,80,40,${0.08 + k * 0.18})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.shr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,40,${0.5 + Math.sin(t * 25) * 0.3})`; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.shr, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.shr * k, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private drawFireballs(ctx: CanvasRenderingContext2D, b: BossSnap) {
    const dt = (performance.now() - this.bossSnapAt) / 1000;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (const [, x, y, vx, vy] of b.fb) {
      const px = x + vx * Math.min(dt, 0.1), py = y + vy * Math.min(dt, 0.1);
      const im = img[Math.floor(this.t * 12) % 2 ? 'boss_fireball_0' : 'boss_fireball_1'];
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(vy, vx) + Math.PI);
      const sc = 54 / Math.max(im.width, im.height);
      ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc);
      ctx.restore();
      if (Math.random() < 0.5) this.fx.add({ x: px, y: py, vx: -vx * 0.2, vy: -vy * 0.2, size: 4, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a2e', max: 0.3, front: false });
    }
    ctx.restore();
  }

  private drawDuo(ctx: CanvasRenderingContext2D, d: NonNullable<LevelScene['duo']>, dv: CharacterView, hv: CharacterView) {
    const sc = 0.56;
    let key: ImageKey, flip: boolean, cx: number;
    const bottom = Math.max(dv.y, hv.y) + 11;
    if (d.kind === 'revive') {
      // frames show the downed player on the left and the helper reaching from the right
      key = `revive_${d.downed}_${d.frame}` as ImageKey;
      flip = hv.x < dv.x;
      const im = img[key];
      cx = dv.x + (flip ? -1 : 1) * im.width * sc * 0.28;
    } else {
      const left = dv.x <= hv.x ? d.downed : d.helper;
      key = `shake_${left}_${d.frame}` as ImageKey;
      flip = false;
      cx = (dv.x + hv.x) / 2;
    }
    const im = img[key];
    ctx.fillStyle = 'rgba(20,40,80,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, bottom - 2, im.width * sc * 0.42, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(cx, bottom);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -im.width * sc / 2, -im.height * sc, im.width * sc, im.height * sc);
    ctx.restore();
    if (d.kind === 'revive') {
      const p = this.snap?.p.find((q) => q.role === d.downed);
      if (p) ring(ctx, dv.x, bottom - im.height * sc - 14, 11, p.rv, C.green);
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, type: string, e: EnemySnap, idx: number) {
    const [a, b] = ENEMY_IMG[type] ?? ENEMY_IMG.mold;
    const stunned = e.st > 0;
    const frame = stunned ? a : Math.floor(this.t * 4 + idx) % 2 ? a : b;
    const x = Math.round(e.x), y = Math.round(e.y);
    ctx.fillStyle = 'rgba(20,40,80,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 18, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y + 20);
    if (stunned) ctx.rotate(Math.sin(this.t * 14) * 0.12);
    if (e.d === 2) ctx.scale(-1, 1);
    ctx.drawImage(img[frame], -24, -48);
    ctx.restore();
    if (stunned) {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < 3; i++) {
        const ang = this.t * 4 + (i * Math.PI * 2) / 3;
        drawStar(ctx, x + Math.cos(ang) * 16, y - 30 + Math.sin(ang) * 5, 5, this.t * 5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - 16, y - 34, 32 * (e.st / 2700), 3);
    }
  }

  // ------------------------------------------------------------------ HUD
  private drawFrame(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0f1d3a'; ctx.fillRect(0, 0, 1280, 720);
    // subtle snow pattern in the frame
    ctx.fillStyle = 'rgba(143,208,245,0.07)';
    for (let i = 0; i < 60; i++) { const x = (i * 211) % 1280, y = (i * 97 + Math.floor(this.t * 12) * (i % 3)) % 720; ctx.fillRect(x, y, 3, 3); }
    // border around the level
    pixRect(ctx, OX - 8, OY - 6, this.cols * TILE + 16, this.rows * TILE + 12, C.navyD, 6);
    pixRect(ctx, OX - 5, OY - 3, this.cols * TILE + 10, this.rows * TILE + 6, C.iceL, 4);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const s = this.app.session;
    const L = this.level;
    // top bar
    text(ctx, 'NIVO ' + L.number, 16, 14, { size: 2, color: C.gold, outline: C.navyD });
    text(ctx, L.name, 16, 40, { size: 2, color: C.iceL });
    const total = L.items.length;
    const got = this.taken.size;
    const bx = 470, bw = 340;
    if (this.boss) {
      const b = this.boss;
      text(ctx, 'BRANKA  -  SEFICA HAOSA', 640, 10, { size: 2, color: b.enr ? '#ff8a7a' : C.white, outline: C.navyD }, 'center');
      pixRect(ctx, 400 - 3, 34, 480 + 6, 22, C.navyD, 3);
      pixRect(ctx, 400, 37, 480, 16, '#3a1420', 2);
      if (b.hp > 0) pixRect(ctx, 400, 37, Math.max(6, (480 * b.hp) / b.max), 16, b.enr ? '#ff4a3a' : '#e8a020', 2);
      text(ctx, `${b.hp}/${b.max}`, 640, 40, { size: 1, color: C.white }, 'center');
      text(ctx, 'F = SLIKAJ JE IZBLIZA', 1264, 46, { size: 1, color: '#ffb3a8' }, 'right');
    }
    if (!this.boss) text(ctx, `HRANA ${got}/${total}`, 640, 10, { size: 2, color: C.white, outline: C.navyD }, 'center');
    if (!this.boss) {
    pixRect(ctx, bx - 3, 34, bw + 6, 20, C.navyD, 3);
    pixRect(ctx, bx, 37, bw, 14, '#24365e', 2);
    if (got) pixRect(ctx, bx, 37, Math.max(6, (bw * got) / total), 14, got === total ? C.green : C.gold, 2);
    // noodles (shared) counter
    const nTot = L.items.filter((i) => i.kind === 'noodles').length;
    const nGot = L.items.filter((it, i) => it.kind === 'noodles' && this.taken.has(i)).length;
    drawImageFit(ctx, img.noodles, bx + bw + 30, 40, 28, 28);
    text(ctx, `${nGot}/${nTot}`, bx + bw + 48, 34, { size: 2, color: C.gold });
    text(ctx, 'ZAJEDNO', bx + bw + 48, 54, { size: 1, color: C.ice });
    }
    // right: time + room + exit state
    const sec = Math.floor(this.timeMs / 1000);
    text(ctx, `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 1264, 12, { size: 3, color: C.white, outline: C.navyD }, 'right');
    if (!this.boss) text(ctx, (this.exitOpen ? 'IZLAZ: OTVOREN  ' : 'IZLAZ: ZAKLJUCAN  ') + 'SOBA ' + s.code, 1264, 46, { size: 1, color: this.exitOpen ? '#7fe08a' : C.ice }, 'right');
    // side panels
    this.rolePanel(ctx, 'david', 6);
    this.rolePanel(ctx, 'nemanja', 1280 - 6 - 148);
    // bottom controls strip
    text(ctx, 'WASD HODAJ    SPACE LED (STVORI / RAZBIJ)    E KAFA = +1@    F FOTO-BLIC = STUN    1-4 EMOTE    M ZVUK',
      640, 704, { size: 1, color: C.iceL }, 'center');
  }

  private rolePanel(ctx: CanvasRenderingContext2D, role: Role, x: number) {
    const s = this.app.session;
    const p = this.snap?.p.find((q) => q.role === role);
    const info = s.playerByRole(role);
    const mine = info?.id === s.me?.id;
    const w = 148, y = 74;
    panel(ctx, x, y, w, 616, mine ? 'navy' : 'dark');
    const cx = x + w / 2;
    pixRect(ctx, x + 14, y + 16, w - 28, 80, role === 'david' ? '#22408a' : '#26262e', 4);
    drawImageFit(ctx, img[role === 'david' ? 'portrait_david' : 'portrait_nemanja'], cx, y + 58, w - 40, 72);
    tag(ctx, roleName(role), cx, y + 102, 2, role === 'david' ? '#22408a' : '#1b1b22');
    if (mine) { pixRect(ctx, x + w - 40, y + 12, 30, 18, C.gold, 3); text(ctx, 'TI', x + w - 25, y + 15, { size: 2, color: C.ink }, 'center'); }
    if (!p) { text(ctx, 'CEKA SE...', cx, y + 170, { size: 1, color: C.ice }, 'center'); return; }
    // hearts
    for (let i = 0; i < MAX_HP; i++) {
      const hx = cx - 48 + i * 34, hy = y + 146;
      const full = i < p.hp;
      const bob = full && p.hp === 1 ? Math.sin(this.t * 10) * 2 : 0;
      ctx.drawImage(img[full ? 'heart' : 'heart_empty'], hx, hy + bob);
    }
    // coffee
    text(ctx, 'KAFA  [E]', x + 16, y + 190, { size: 1, color: C.ice });
    for (let i = 0; i < COFFEE_MAX; i++) {
      ctx.globalAlpha = i < p.cof ? 1 : 0.22;
      drawImageFit(ctx, img.coffee, x + 32 + i * 40, y + 216, 32, 30);
      ctx.globalAlpha = 1;
    }
    if (p.dr) text(ctx, 'GLUP GLUP...', cx, y + 238, { size: 1, color: '#ffcf9a' }, 'center');
    // camera
    text(ctx, 'FOTO  [F]', x + 16, y + 258, { size: 1, color: C.ice });
    const camReady = p.cam <= 0;
    ctx.globalAlpha = camReady ? 1 : 0.55;
    ctx.drawImage(img.camera, x + 16, y + 272);
    ctx.globalAlpha = 1;
    const barX = x + 64, barW = w - 80;
    pixRect(ctx, barX, y + 282, barW, 12, C.navyD, 2);
    const f = 1 - p.cam / CAMERA_COOLDOWN_MS;
    pixRect(ctx, barX + 2, y + 284, Math.max(2, (barW - 4) * f), 8, camReady ? C.gold : C.iceD, 1);
    text(ctx, camReady ? 'SPREMNO' : (p.cam / 1000).toFixed(1) + 'S', barX + barW / 2, y + 300, { size: 1, color: camReady ? C.gold : C.ice }, 'center');
    // food progress for this player's items
    text(ctx, 'MOJA HRANA', x + 16, y + 326, { size: 1, color: C.ice });
    const kinds = [...new Set(this.level.items.filter((i) => ITEM_OWNER[i.kind] === role).map((i) => i.kind))];
    kinds.forEach((k, r) => {
      const ry = y + 344 + r * 38;
      const tot = this.level.items.filter((i) => i.kind === k).length;
      const got = this.level.items.filter((it, i) => it.kind === k && this.taken.has(i)).length;
      pixRect(ctx, x + 14, ry, w - 28, 32, '#101c36', 3);
      drawImageFit(ctx, img[ITEM_IMG[k]], x + 34, ry + 16, 26, 26);
      text(ctx, `${got}/${tot}`, x + w - 22, ry + 9, { size: 2, color: got === tot ? C.green : C.white }, 'right');
    });
    // legend ring
    const ly = y + 344 + kinds.length * 38 + 8;
    ctx.strokeStyle = OWNER_COLOR[role]; ctx.lineWidth = 3;
    if (role === 'nemanja') ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.ellipse(x + 30, ly + 8, 12, 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '= MOJE', x + 48, ly + 5, { size: 1, color: C.iceL });
    // status
    let status = '', col = C.iceL;
    if (!info?.connected) { status = 'OFFLINE'; col = C.orange; }
    else if (p.ko) { status = 'KO! PRIDJI DA GA PODIGNES'; col = '#ff9a8e'; }
    else if (p.sl) { status = 'BLJAK... USPOREN'; col = '#9ee07a'; }
    else if (p.hp === 1) { status = 'POPIJ KAFU!'; col = '#ffcf9a'; }
    if (status) {
      const lines = status.length > 14 ? [status.slice(0, status.lastIndexOf(' ', 14) > 0 ? status.lastIndexOf(' ', 14) : 14), status.slice((status.lastIndexOf(' ', 14) > 0 ? status.lastIndexOf(' ', 14) : 14) + 1)] : [status];
      lines.forEach((l, i) => text(ctx, l, cx, y + 520 + i * 14, { size: 1, color: col }, 'center'));
    }
    if (mine) {
      text(ctx, 'SPACE = LED', cx, y + 566, { size: 1, color: 'rgba(223,243,255,0.65)' }, 'center');
      text(ctx, 'E = KAFA  F = FOTO', cx, y + 582, { size: 1, color: 'rgba(223,243,255,0.65)' }, 'center');
    } else {
      text(ctx, info?.connected ? 'ONLINE' : 'OFFLINE', cx, y + 582, { size: 1, color: info?.connected ? C.green : C.orange }, 'center');
    }
  }

  // ------------------------------------------------------------------ overlays
  private drawOverlays(ctx: CanvasRenderingContext2D) {
    const s = this.app.session;
    const ui = this.app.game.ui;
    const cx = OX + (this.cols * TILE) / 2;
    if (this.intro > 0 && !s.complete) {
      const a = Math.min(1, this.intro * 2);
      ctx.globalAlpha = a;
      const k = ease.outBack(Math.min(1, (3.2 - this.intro) * 3));
      ctx.save(); ctx.translate(cx, 300); ctx.scale(k, k);
      panel(ctx, -300, -80, 600, 180, 'navy');
      text(ctx, 'NIVO ' + this.level.number, 0, -60, { size: 2, color: C.gold }, 'center');
      text(ctx, this.level.name, 0, -34, { size: 4, color: C.white, outline: C.navyD }, 'center');
      text(ctx, this.level.intro, 0, 10, { size: 1, color: C.iceL }, 'center');
      text(ctx, 'PLAVI KRUG = DAVID   BELI = NEMANJA   ZLATNI = ZAJEDNO', 0, 34, { size: 1, color: C.ice }, 'center');
      text(ctx, 'TERMINAL + ARKADA OTKLJUCAVAJU MAGACIN', 0, 54, { size: 1, color: C.gold }, 'center');
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    for (const b of this.banners) {
      const a = Math.min(1, b.t * 2, (b.max - b.t) * 6);
      ctx.globalAlpha = a;
      const w = Math.max(measure(b.title, 4), measure(b.sub, 2)) + 60;
      pixRect(ctx, cx - w / 2, 190, w, 84, 'rgba(11,20,40,0.85)', 6);
      text(ctx, b.title, cx, 204, { size: 4, color: b.color, outline: C.navyD }, 'center');
      text(ctx, b.sub, cx, 246, { size: 2, color: C.white }, 'center');
      ctx.globalAlpha = 1;
    }
    if (this.paused && !s.complete) {
      ctx.fillStyle = 'rgba(11,20,40,0.6)'; ctx.fillRect(OX, OY, this.cols * TILE, this.rows * TILE);
      panel(ctx, cx - 300, 280, 600, 140, 'navy');
      text(ctx, 'PAUZA', cx, 300, { size: 4, color: C.gold }, 'center');
      text(ctx, this.paused, cx, 346, { size: 2, color: C.white }, 'center');
      text(ctx, 'CEKAMO DA SE VRATI (45 S)...', cx, 378, { size: 1, color: C.ice }, 'center');
    }
    if (s.complete) this.drawComplete(ctx, ui);
  }

  private drawComplete(ctx: CanvasRenderingContext2D, ui: import('../engine/ui.ts').UI) {
    const s = this.app.session;
    const st = s.complete!;
    if (Math.random() < 0.5) {
      this.fx.add({ x: OX + Math.random() * this.cols * TILE - OX, y: -10, vy: 120 + Math.random() * 80, vx: (Math.random() - 0.5) * 60, g: 40, size: 6, shape: 'sq',
        color: ['#ffd34d', '#8fd0f5', '#ff7a6e', '#7fe08a', '#ffffff'][Math.floor(Math.random() * 5)], max: 4, vr: 5 });
    }
    ctx.fillStyle = 'rgba(11,20,40,0.55)'; ctx.fillRect(0, 0, 1280, 720);
    const cx = 640, x = cx - 330, y = 150, w = 660, h = 430;
    panel(ctx, x, y, w, h, 'navy');
    text(ctx, 'LEVEL COMPLETE!', cx, y + 26, { size: 5, color: C.gold, outline: C.navyD, shadow: '#c98a12' }, 'center');
    const sec = Math.floor(st.timeMs / 1000);
    text(ctx, `${this.level.name}  -  VREME ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, cx, y + 82, { size: 2, color: C.iceL }, 'center');
    const cols = ['HRANA', 'LED', 'BLIC', 'KAFA', 'UDARCI'];
    const keys = ['food', 'ice', 'flashes', 'coffee', 'hits'] as const;
    cols.forEach((c, i) => text(ctx, c, x + 250 + i * 82, y + 122, { size: 1, color: C.ice }, 'center'));
    (['david', 'nemanja'] as Role[]).forEach((r, row) => {
      const ry = y + 142 + row * 48;
      pixRect(ctx, x + 30, ry, w - 60, 40, '#101c36', 3);
      drawImageFit(ctx, img[r === 'david' ? 'portrait_david' : 'portrait_nemanja'], x + 62, ry + 20, 44, 34);
      text(ctx, roleName(r), x + 92, ry + 13, { size: 2, color: C.white });
      keys.forEach((k, i) => text(ctx, String(st.perPlayer[r][k]), x + 250 + i * 82, ry + 11, { size: 2, color: C.gold }, 'center'));
    });
    const quote = st.perPlayer.david.hits + st.perPlayer.nemanja.hits === 0 ? 'BEZ IJEDNOG UDARCA. LEGENDE.' : 'PREZIVELI STE STUDENTSKU KUHINJU!';
    text(ctx, quote, cx, y + 252, { size: 2, color: '#7fe08a' }, 'center');
    // victory dance
    (['david', 'nemanja'] as Role[]).forEach((r, i) => {
      const sc = 1.3;
      ctx.fillStyle = 'rgba(143,208,245,0.25)';
      ctx.beginPath(); ctx.ellipse(i === 0 ? x - 95 : x + w + 95, y + 392, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
      drawChar(ctx, r, 'win', Math.floor(this.t * 5 + i), i === 0 ? x - 95 : x + w + 95, y + 396, sc, i === 1);
    });
    const hasNext = levelIndex(this.level.id) + 1 < LEVEL_ORDER.length;
    if (hasNext) {
      if (ui.button(ctx, 'SLEDECI NIVO >', cx - 150, y + 284, 300, 58, { color: 'gold', size: 3 })) s.net.send({ t: 'next' });
      if (ui.button(ctx, 'NAZAD U LOBI', cx - 250, y + 356, 240, 46, { color: 'navy', size: 2 })) s.net.send({ t: 'toLobby' });
      if (ui.button(ctx, 'IGRAJ PONOVO', cx + 10, y + 356, 240, 46, { color: 'ice', size: 2 })) s.net.send({ t: 'retry' });
    } else {
      text(ctx, 'KAMPANJA ZAVRSENA! GG BRACO!', cx, y + 280, { size: 2, color: C.gold }, 'center');
      if (ui.button(ctx, 'NAZAD U LOBI', cx - 250, y + 316, 240, 50, { color: 'gold', size: 2 })) s.net.send({ t: 'toLobby' });
      if (ui.button(ctx, 'IGRAJ PONOVO', cx + 10, y + 316, 240, 50, { color: 'ice', size: 2 })) s.net.send({ t: 'retry' });
    }
  }
}
