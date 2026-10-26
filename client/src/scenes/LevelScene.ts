import { drawChar, drawFit, img, sp, spN, type ImageKey, BOSS_ANIMS, type BossAnim } from '../engine/assets.ts';
import { bindings, keyLabel, moveLabel } from '../engine/bindings.ts';
import { measure, text, wrap } from '../engine/font.ts';
import { Fx, drawStar, ease } from '../engine/fx.ts';
import type { Overlay, Scene } from '../engine/Game.ts';
import { C, bubble, panel, pixRect, ring, tag } from '../engine/ui.ts';
import { CharacterView, EMOTE_KEYS } from '../game/Character.ts';
import { Interp, Predictor } from '../game/Predictor.ts';
import { buildStaticLayer, drawBossGeneric, drawEnemy, drawHazard, drawProjectile } from '../game/StageArt.ts';
import type { App } from '../main.ts';
import { SkillUnlockedOverlay, skillIcon } from '../ui/SkillsPanel.ts';
import { BOSS_DEFS } from '../../../shared/bosses.ts';
import { CAM_CLOSE, CAM_HALF_ANGLE, CAM_MEDIUM, CAM_QUALITY_LABEL, CAM_RANGE } from '../../../shared/camera.ts';
import { CAMERA_COOLDOWN_MS, COFFEE_MAX, MAX_HP, STATION_RANGE, TILE } from '../../../shared/constants.ts';
import { ENEMIES } from '../../../shared/enemies.ts';
import { ITEM_LABEL, ITEM_OWNER, type ItemKind } from '../../../shared/items.ts';
import { type LevelDef, STATION_CODES, levelCols, levelRows, playerTileSolid, tileAt } from '../../../shared/level.ts';
import { LEVELS, LEVEL_ORDER, levelIndex, levelLabel, levelUnlocked } from '../../../shared/levels/index.ts';
import { tileCenter, tileOf, type SolidFn } from '../../../shared/physics.ts';
import type { BossSnap, EnemySnap, GameEvent, PlayerSnap, ServerMsg, Snapshot } from '../../../shared/protocol.ts';
import { QUESTIONS, QUIZ_SURE } from '../../../shared/quiz.ts';
import { SKILLS, type SkillId } from '../../../shared/skills.ts';
import { stageDef } from '../../../shared/stages.ts';
import { TASKS, TASK_BY_CODE, type TaskType } from '../../../shared/tasks.ts';
import { DIRS, roleName, type Role } from '../../../shared/types.ts';
import { drawImageFit } from './common.ts';

const OX = 160, OY = 72; // level area offset inside the 1280x720 view
const ITEM_IMG: Record<ItemKind, ImageKey> = {
  protein: 'protein', creatine: 'creatine', mealprep: 'mealprep', pizza: 'pizza', burger: 'burger', soda: 'soda', noodles: 'noodles',
};
/** stage pickup art (Nemanja's soda is the Monster-style energy drink from the stage-1 sheet) */
const ITEM_SPRITE: Record<ItemKind, string> = {
  protein: 'item_protein', creatine: 'item_creatine', mealprep: 'item_mealprep', pizza: 'item_pizza', burger: 'item_burger', soda: 'item_energy', noodles: 'item_noodles',
};
const OWNER_COLOR = { david: '#4f8dff', nemanja: '#ffffff', both: '#ffd34d' };
const BOSS_LABELS: Record<string, string> = { cast: 'VATRENA KUGLA!', rain: 'KISA VATRE!', shock: 'UDARNI TALAS!', flash: 'BLIC!', frozen: 'ZALEDJENA!' };
const PROJ_HIT: Record<string, string> = { fireball: 'fire_impact', sauce: 'fx_sauce_splat', grease: 'fx_sauce_splat', money: 'fx_money', debt: 'fx_lock', test: 'fx_fmark' };

interface Banner { title: string; sub: string; t: number; max: number; color: string }
interface Station { tx: number; ty: number; task: TaskType; role?: Role; label: string }

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
  private stations: Station[] = [];
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
  private ePrev = new Map<number, { x: number; y: number; t: number }>();
  private eMoving = new Map<number, boolean>();
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
  private bossSnapAt = 0;
  private bossSay: { text: string; t: number } | null = null;
  private duo: { kind: 'revive' | 'shake'; downed: Role; helper: Role; t: number; dur: number; frame: number } | null = null;
  private sprites: { keys: ImageKey[] | string; x: number; y: number; x1: number; y1: number; t: number; delay: number; dur: number; rot: number; size: number }[] = [];
  /** enemy / boss telegraphs (flash lines, whistle rings) */
  private teles: { x: number; y: number; ang: number; len: number; kind: string; t: number; max: number; i: number }[] = [];
  private beams: { x: number; y: number; ang: number; len: number; t: number }[] = [];
  private cones: { x: number; y: number; ang: number; t: number }[] = [];
  private shownUnlock = false;
  private pauseMenu: PauseMenu | null = null;
  private lastQuiz = -1;

  private spriteFx(keys: ImageKey[] | string, x: number, y: number, o: { x1?: number; y1?: number; delay?: number; dur?: number; rot?: number; size?: number } = {}) {
    this.sprites.push({ keys, x, y, x1: o.x1 ?? x, y1: o.y1 ?? y, t: 0, delay: o.delay ?? 0, dur: o.dur ?? 0.3, rot: o.rot ?? 0, size: o.size ?? 64 });
  }

  constructor(private app: App) {
    this.level = LEVELS[app.session.levelId] ?? LEVELS.level1;
    this.cols = levelCols(this.level);
    this.rows = levelRows(this.level);
    this.pred = new Predictor(app.session.net);
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      const task = TASK_BY_CODE[tileAt(this.level, tx, ty)];
      if (task) this.stations.push({ tx, ty, task, role: TASKS[task].role, label: TASKS[task].label });
    }
    this.staticLayer = buildStaticLayer(this.level);
  }

  enter() {
    this.off = this.app.session.net.on((m) => this.onMsg(m));
    this.app.game.audio.music(this.level.boss ? 'boss' : stageDef(this.level.stage).music);
  }
  exit() { this.off?.(); if (this.pauseMenu) { this.app.game.close(this.pauseMenu); this.app.session.net.send({ t: 'pause', v: false }); } }

  private openPause() {
    if (this.pauseMenu) return;
    this.pauseMenu = new PauseMenu(this.app, () => { this.pauseMenu = null; });
    this.app.game.open(this.pauseMenu);
  }

  // ------------------------------------------------------------------ net
  private view(r: Role) {
    let v = this.views.get(r);
    if (!v) { v = new CharacterView(r); this.views.set(r, v); }
    return v;
  }
  private iceAt = (tx: number, ty: number) => this.ice.has(ty * this.cols + tx);
  private solid: SolidFn = (x, y) => playerTileSolid(this.level, tileOf(x), tileOf(y), this.iceAt, this.gateOpen, this.exitOpen);
  private myRole(): Role | undefined { return this.app.session.me?.role; }
  private mySnap(): PlayerSnap | undefined { return this.snap?.p.find((p) => p.id === this.app.session.me?.id); }

  private onMsg(m: ServerMsg) {
    if (m.t === 'level') { this.restartVisuals(); return; }
    if (m.t !== 's') return;
    this.snap = m;
    if (m.boss) { this.boss = m.boss; this.bossSnapAt = performance.now(); }
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
    for (const e of m.e) {
      const pr = this.ePrev.get(e.i);
      if (pr) this.eMoving.set(e.i, Math.hypot(pr.x - e.x, pr.y - e.y) > 0.5);
      this.ePrev.set(e.i, { x: e.x, y: e.y, t: this.now });
    }
    const me = m.p.find((p) => p.id === s.me?.id);
    if (me) this.pred.reconcile(me, this.solid);
    for (const ev of m.ev) this.onEvent(ev);
  }

  private restartVisuals() {
    this.fx.clear(); this.iceBorn.clear(); this.banners = []; this.intro = 2.4; this.pred.initialised = false;
    this.teles = []; this.beams = []; this.cones = []; this.shownUnlock = false;
  }

  private posOf(id: string): { x: number; y: number } | null {
    const r = this.app.session.roleOf(id);
    const v = r ? this.views.get(r) : null;
    return v ? { x: v.x, y: v.y } : null;
  }
  private isMe(id: string) { return id === this.app.session.me?.id; }
  private enemyPos(i: number) { return this.eInterp.get(i, 0) ?? this.snap?.e.find((e) => e.i === i) ?? null; }

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
        const r0 = ev.by ? roleOf(ev.by) : undefined;
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
          if (spN('fx_heal')) this.spriteFx('fx_heal', p.x, p.y - 30, { dur: 0.6, size: 70 });
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
        this.flash = mine ? 0.45 : 0.2;
        this.camPop.set(ev.by, 0.6);
        this.cones.push({ x: ev.x, y: ev.y, ang: ev.ang, t: 0.45 });
        for (const h of ev.hits) {
          const e = this.enemyPos(h.i);
          if (!e) continue;
          const lbl = h.ms === 0 ? 'IMUN!' : CAM_QUALITY_LABEL[h.q];
          this.fx.float(e.x, e.y - 50, lbl, h.ms === 0 ? '#ff8a7a' : h.q === 2 ? C.gold : h.q === 1 ? '#bfe8ff' : '#9aa7c0', 2);
          if (h.ms > 0) this.fx.burst(e.x, e.y - 20, 8, { shape: 'star', speed: 120, colors: ['#ffd34d'], size: 5, max: 0.6 });
        }
        if (ev.boss && this.boss) {
          this.fx.float(this.boss.x, this.boss.y - 120, ev.boss.dmg > 0 ? `${CAM_QUALITY_LABEL[ev.boss.q]} -${ev.boss.dmg}` : 'PREDALEKO! 0', ev.boss.q === 2 ? C.gold : ev.boss.dmg ? '#bfe8ff' : '#ff8a7a', 3);
        }
        a.play('shutter');
        if (ev.hits.some((h) => h.ms > 0)) a.play('stun');
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
        const r = ev.by ? roleOf(ev.by) : undefined;
        if (r) this.view(r).finishTask();
        for (const p of this.snap?.p ?? []) if (p.ti === ev.idx) this.view(p.role).finishTask();
        a.play('station');
        if (!this.level.boss && !this.stProg.every((v) => v >= 1)) this.banner('ZADATAK ZAVRSEN', 'JOS ZADATAKA CEKA...', '#7fe08a');
        break;
      }
      case 'taskStart': if (this.isMe(ev.by)) a.play('type'); break;
      case 'gate':
        for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) if (tileAt(this.level, tx, ty) === 'G') {
          this.fx.burst(tileCenter(tx), tileCenter(ty), 14, { shape: 'shard', speed: 190, g: 420, colors: ['#bfe8ff', '#8fd0f5', '#ffd34d'], size: 6, max: 0.8 });
        }
        this.banner('REZETKA OTKLJUCANA!', 'TIMSKI RAD', C.gold);
        a.play('gate');
        break;
      case 'exitOpen':
        this.banner('IZLAZ OTVOREN!', this.app.session.solo ? 'IDI NA VRATA GORE' : 'OBOJICA NA VRATA GORE', '#7fe08a');
        a.play('exit');
        break;
      case 'emote': { const r = roleOf(ev.by); if (r) { this.view(r).doEmote(ev.e); a.play('emote'); } break; }
      case 'fail': this.banner(this.app.session.solo ? 'PAO SI!' : 'OBOJICA SU PALI!', 'RESTART NIVOA...', C.red); a.play('ko'); break;
      case 'restart': this.restartVisuals(); break;
      case 'coffeeSpawn': {
        const c = this.level.coffee[ev.idx];
        if (c) this.fx.burst(tileCenter(c.tx), tileCenter(c.ty), 12, { shape: 'star', speed: 90, colors: ['#ffd34d', '#ffffff'], size: 4, max: 0.6 });
        break;
      }
      case 'locked': {
        const p = this.posOf(ev.by);
        if (p) { this.fx.float(p.x, p.y - 96, `${SKILLS[ev.skill].name} ZAKLJUCANA!`, '#c77dff', 2); if (spN('fx_lock')) this.spriteFx('fx_lock', p.x, p.y - 40, { dur: 0.8, size: 80 }); }
        a.play('denied');
        break;
      }
      case 'denied':
        if (this.isMe(ev.by)) {
          const p = this.posOf(ev.by);
          if (p) this.fx.float(p.x, p.y - 84 - (ev.skill === 'camera' ? 22 : ev.skill === 'ice' ? 44 : 0), ev.why === 'locked' ? `${SKILLS[ev.skill].name}: JOS ZAKLJUCANO` : `${SKILLS[ev.skill].name}: BLOKIRANO`, '#ff9a8e', 2);
          a.play('denied');
        }
        break;
      case 'stun': { const p = this.posOf(ev.by); if (p) this.fx.float(p.x, p.y - 96, 'OSLEPLJEN!', '#ffffff', 2); a.play('stun'); break; }
      case 'debt': { const p = this.posOf(ev.by); if (p) this.fx.float(p.x, p.y - 90, '+DUG', '#7fe08a', 2); a.play('money'); break; }
      case 'slowed': break;
      case 'tele': {
        const src = ev.i >= 0 ? this.enemyPos(ev.i) : this.boss ? { x: this.boss.x, y: this.boss.y + 20 } : null;
        if (src) this.teles.push({ x: src.x, y: src.y - 10, ang: ev.ang, len: ev.len, kind: ev.kind, t: ev.ms / 1000, max: ev.ms / 1000, i: ev.i });
        a.play('telegraph');
        break;
      }
      case 'eflash':
        this.beams.push({ x: ev.x, y: ev.y, ang: ev.ang, len: ev.len, t: 0.35 });
        this.teles = this.teles.filter((t) => t.i !== ev.i);
        if (ev.hit.includes(this.app.session.me?.id ?? '-')) this.flash = 0.9;
        a.play('shutter');
        break;
      case 'whistle':
        this.fx.add({ x: ev.x, y: ev.y, shape: 'ring', size: 10, grow: ev.r * 3, color: '#ffd34d', max: 0.35 });
        this.teles = this.teles.filter((t) => t.i !== ev.i);
        a.play('emote');
        break;
      case 'throw': break;
      case 'eFrozen': { const e = this.enemyPos(ev.i); if (e) this.fx.float(e.x, e.y - 50, 'ZALEDJEN!', C.iceL, 2); a.play('ice'); break; }
      case 'crush': {
        const e = this.enemyPos(ev.i);
        if (e) {
          const def = ENEMIES[e.ty];
          const dk = def ? `${def.sprite}_defeat` : '';
          if (spN(dk)) this.spriteFx(dk, e.x, e.y + 4, { dur: 0.9, size: 70 });
          if (spN('fx_shards')) this.spriteFx('fx_shards', e.x, e.y - 10, { dur: 0.5, size: 80 });
          this.fx.burst(e.x, e.y - 10, 16, { shape: 'shard', speed: 200, g: 400, colors: ['#bfe8ff', '#8fd0f5', '#ffffff'], size: 6, max: 0.8 });
          this.fx.float(e.x, e.y - 50, 'SMRVLJEN!', C.gold, 2);
        }
        a.play('crush');
        break;
      }
      case 'respawn': { const e = this.enemyPos(ev.i); if (e && spN('fx_summon')) this.spriteFx('fx_summon', e.x, e.y, { dur: 0.7, size: 70 }); break; }
      case 'penalty': {
        const r = roleOf(ev.by);
        if (r) this.view(r).speak(ev.text, '#a01818', 2.5);
        this.banner(ev.text, 'KAZNA: -1 SRCE', C.red);
        break;
      }
      case 'projHit': {
        const k = PROJ_HIT[ev.kind] ?? 'fx_hit';
        if (spN(k)) this.spriteFx(k, ev.x, ev.y, { dur: 0.35, size: 54 });
        else this.fx.burst(ev.x, ev.y, 8, { speed: 100, colors: ['#ffffff', '#ffd34d'], size: 3, max: 0.3 });
        break;
      }
      case 'quiz': {
        const kid = this.enemyPos(ev.kid);
        if (kid && spN('fx_kidalert')) this.spriteFx('fx_kidalert', kid.x, kid.y - 60, { dur: 0.8, size: 46 });
        if (this.isMe(ev.by)) a.play('quiz');
        break;
      }
      case 'quizResult': {
        const kid = this.enemyPos(ev.kid);
        if (kid) {
          this.fx.float(kid.x, kid.y - 60, ev.ok ? 'HVALA!' : 'HMMM...', ev.ok ? '#7fe08a' : '#ff9a8e', 2);
          if (ev.ok) this.fx.burst(kid.x, kid.y - 30, 14, { shape: 'star', speed: 140, colors: ['#ffd34d', '#ffffff'], size: 5, max: 0.7 });
        }
        if (this.isMe(ev.by)) a.play(ev.ok ? 'correct' : 'wrong');
        break;
      }
      case 'bossCast': if (ev.kind === 'shock' || ev.kind === 'rain' || ev.kind === 'slam') a.play('ko'); else a.play('emote'); break;
      case 'fbHit':
        this.spriteFx(spN('fire_impact') ? 'fire_impact' : ['boss_fireball_2'], ev.x, ev.y, { dur: 0.35, size: 70 });
        this.fx.burst(ev.x, ev.y, 10, { speed: 140, colors: ['#ffb02e', '#ff5a2e', '#fff1a0'], size: 4, max: 0.45 });
        a.play('hit');
        break;
      case 'meteorLand':
        this.spriteFx(spN('fire_explosion') ? 'fire_explosion' : ['boss_fireball_2'], ev.x, ev.y - 10, { dur: 0.45, size: 96 });
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
      case 'hazard':
        this.app.game.shake = Math.max(this.app.game.shake, 6);
        this.fx.burst(ev.x, ev.y, 16, { speed: 180, g: 300, colors: ['#ffb02e', '#ffffff', '#ff5a2e'], size: 5, max: 0.5 });
        a.play('iceBreak');
        break;
      case 'bossHit':
        if (this.boss) {
          this.fx.float(this.boss.x, this.boss.y - 100, `-${ev.dmg ?? 1}`, C.gold, 4);
          if (spN('fx_bossspark')) this.spriteFx('fx_bossspark', this.boss.x, this.boss.y - 40, { dur: 0.4, size: 80 });
          this.fx.burst(this.boss.x, this.boss.y - 30, 14, { shape: 'star', speed: 160, colors: ['#ffd34d', '#ffffff'], size: 6, max: 0.6 });
        }
        a.play('stun');
        break;
      case 'bossFrozen': if (this.boss) this.banner('ZALEDJENA!', 'SAD RAZBIJ LED POD NJOM (SPACE)!', C.iceL); a.play('ice'); break;
      case 'bossEnrage': this.banner(`${this.bossName()} BESNI!`, 'BRZE I JACE', C.red); a.play('ko'); break;
      case 'bossDead':
        this.banner(`${this.bossName()} JE PAO!`, 'BOSS POBEDJEN', '#7fe08a');
        if (this.boss) this.fx.burst(this.boss.x, this.boss.y, 40, { shape: 'star', speed: 260, colors: ['#ffd34d', '#ffffff', '#ff7a6e'], size: 7, max: 1.2 });
        a.play('crush');
        break;
      case 'bossSay': this.bossSay = { text: ev.text, t: 2.6 }; break;
    }
  }

  private bossName() { return this.boss ? BOSS_DEFS[this.boss.type].name : 'BOSS'; }
  private banner(title: string, sub: string, color: string) {
    this.banners = [{ title, sub, t: 2.6, max: 2.6, color }];
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const { game, session } = this.app;
    const inp = game.input;
    // real pause: the server froze the level, so everything on screen freezes too
    if (this.paused && !session.complete) {
      this.alpha = this.pred.update(0, { dx: 0, dy: 0 }, this.solid);
      if (!game.blocked && inp.actionPressed('pause')) this.openPause();
      return;
    }
    this.t += dt; this.now += dt;
    this.fx.update(dt);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.intro > 0) this.intro -= dt;
    for (const b of this.banners) b.t -= dt;
    this.banners = this.banners.filter((b) => b.t > 0);
    if (this.bossSay && (this.bossSay.t -= dt) <= 0) this.bossSay = null;
    for (const sp0 of this.sprites) sp0.t += dt;
    this.sprites = this.sprites.filter((sp0) => sp0.t < sp0.delay + sp0.dur);
    for (const tl of this.teles) tl.t -= dt;
    this.teles = this.teles.filter((tl) => tl.t > 0);
    for (const b of this.beams) b.t -= dt;
    this.beams = this.beams.filter((b) => b.t > 0);
    for (const c of this.cones) c.t -= dt;
    this.cones = this.cones.filter((c) => c.t > 0);
    for (const [k, v] of this.camPop) { if (v - dt <= 0) this.camPop.delete(k); else this.camPop.set(k, v - dt); }

    const complete = !!session.complete;
    if (complete && session.complete?.unlocked && !this.shownUnlock) { this.shownUnlock = true; game.open(new SkillUnlockedOverlay(this.app, session.complete.unlocked)); }
    const blocked = game.blocked;
    const mine = this.mySnap();
    const quizzing = !!mine && mine.qz >= 0;
    if (quizzing && this.lastQuiz < 0) this.intro = 0;
    this.lastQuiz = mine?.qz ?? -1;
    const axis = complete || this.paused || blocked ? { dx: 0, dy: 0 } : inp.axis();
    this.alpha = this.pred.update(dt, axis, this.solid);
    if (!complete && !blocked && inp.actionPressed('pause')) this.openPause();
    if (!complete && !this.paused && !blocked) {
      if (inp.actionPressed('ice')) session.net.send({ t: 'act', a: 'ice' });
      if (inp.actionPressed('coffee')) session.net.send({ t: 'act', a: 'coffee' });
      if (inp.actionPressed('camera')) session.net.send({ t: 'act', a: 'camera' });
      if (inp.actionPressed('interact')) session.net.send({ t: 'act', a: 'interact' });
      if (quizzing) { for (let i = 0; i < 3; i++) if (inp.wasPressed('Digit' + (i + 1), 'Numpad' + (i + 1))) session.net.send({ t: 'answer', i }); }
      else EMOTE_KEYS.forEach((k, i) => { if (inp.wasPressed(k)) session.net.send({ t: 'emote', e: i }); });
    }

    if (!this.snap) return;
    for (const p of this.snap.p) {
      const v = this.view(p.role);
      const isMine = p.id === session.me?.id;
      if (isMine) {
        const d = this.pred.display(this.alpha);
        v.x = d.x; v.y = d.y; v.setFacing(this.pred.pos.facing); v.st.moving = this.pred.moving;
      } else {
        const ip = this.pInterp.get(p.id) ?? p;
        v.x = ip.x; v.y = ip.y; v.setFacing(ip.f); v.st.moving = !!ip.m;
      }
      v.st.drinking = !!p.dr; v.st.ko = !!p.ko; v.st.invuln = !!p.inv; v.st.slowed = !!p.sl; v.st.revive = p.rv;
      v.st.stunned = p.sn > 0; v.st.debt = !!p.db; v.st.locked = p.lk.length > 0;
      v.st.win = complete;
      if (v.st.ko || v.st.drinking || complete || v.st.stunned) v.st.moving = false;
      const st = p.ti >= 0 ? this.stations[p.ti] : null;
      v.setTask(p.tk, !!st && tileCenter(st.tx) < v.x - 4);
      if (v.update(dt) && isMine) {
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

  private nearStation(px: number, py: number): number {
    let best = -1, bd = STATION_RANGE + 1;
    this.stations.forEach((s, i) => {
      if ((this.stProg[i] ?? 0) >= 1) return;
      const d = Math.hypot(tileCenter(s.tx) - px, tileCenter(s.ty) - py);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  private drawWorld(ctx: CanvasRenderingContext2D) {
    const s = this.app.session;
    const L = this.level;
    const t = this.t;
    // exit door
    let ex = -1;
    for (let tx = 0; tx < this.cols; tx++) if (tileAt(L, tx, 0) === 'E') { ex = tx; break; }
    if (ex >= 0) {
      ctx.drawImage(img[this.exitOpen ? 'exit_open' : 'exit_closed'], ex * TILE, 0);
      if (this.exitOpen) {
        ctx.fillStyle = `rgba(255,240,160,${0.25 + Math.sin(t * 5) * 0.12})`;
        ctx.fillRect(ex * TILE - 6, 0, TILE * 2 + 12, TILE + 10);
      }
    }
    for (let ty = 0; ty < this.rows; ty++) for (let tx = 0; tx < this.cols; tx++) {
      if (tileAt(L, tx, ty) === 'G' && !this.gateOpen) ctx.drawImage(img.gate, tx * TILE, ty * TILE);
    }
    // task stations
    const me = this.mySnap();
    const myRole = this.myRole();
    this.stations.forEach((st, i) => {
      const cx = tileCenter(st.tx), cy = tileCenter(st.ty);
      const prog = this.stProg[i] ?? 0;
      const done = prog >= 1;
      if (done) {
        ctx.fillStyle = `rgba(127,224,138,${0.25 + Math.sin(t * 4) * 0.1})`;
        ctx.fillRect(st.tx * TILE - 4, st.ty * TILE - 4, TILE + 8, TILE + 8);
      }
      const by = cy - 46 + Math.sin(t * 3 + i) * 2;
      const lw = Math.max(60, measure(st.label, 1) + 14);
      const col = done ? C.green : st.role === 'david' ? '#3d6fd8' : st.role === 'nemanja' ? '#e8e8e8' : '#ffd34d';
      pixRect(ctx, cx - lw / 2 - 2, by - 10, lw + 4, 20, C.navyD, 4);
      pixRect(ctx, cx - lw / 2, by - 8, lw, 16, col, 3);
      text(ctx, done ? (this.level.boss ? 'PUNI SE...' : 'OK') : st.label, cx, by - 4, { size: 1, color: col === '#3d6fd8' ? C.white : C.ink }, 'center');
      if (!done && prog > 0) {
        if (spN('fx_taskring')) drawFit(ctx, sp('fx_taskring'), 'fx_taskring', cx, cy + 14, 40, 40);
        ring(ctx, cx, cy - 4, 18, prog, C.gold);
      }
      if (!done && st.role) drawImageFit(ctx, img[st.role === 'david' ? 'portrait_david' : 'portrait_nemanja'], cx + lw / 2 + 14, by - 2, 24, 24);
      // hint for the local player
      if (me && !done && myRole && !me.ko && me.ti !== i && this.nearStation(this.pred.pos.x, this.pred.pos.y) === i) {
        const ok = !st.role || st.role === myRole || this.app.session.solo;
        text(ctx, ok ? `[${keyLabel(bindings.code('interact'))}] RADI` : 'NIJE TVOJE', cx, cy + 26, { size: 1, color: ok ? C.gold : '#ff9a8e', outline: C.navyD }, 'center');
      }
    });
    // coffee pickups (only once the skill is unlocked) + items
    if (s.has('coffee')) L.coffee.forEach((c, i) => {
      if (this.coffeeTaken.has(i)) return;
      const cx = tileCenter(c.tx), cy = tileCenter(c.ty) + Math.sin(t * 3 + i) * 2;
      ctx.fillStyle = 'rgba(20,40,80,0.22)';
      ctx.beginPath(); ctx.ellipse(cx, tileCenter(c.ty) + 14, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      if (spN('item_coffee')) drawFit(ctx, sp('item_coffee', Math.floor(t * 4) % spN('item_coffee')), 'item_coffee', cx, cy + 14, 34, 34);
      else drawImageFit(ctx, img.coffee, cx, cy - 2, 30, 30);
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
      const key = ITEM_SPRITE[it.kind];
      const n = spN(key);
      if (n) drawFit(ctx, sp(key, Math.floor(t * 3 + i) % n), key, cx, cy + 18, 38, 38);
      else drawImageFit(ctx, img[ITEM_IMG[it.kind]], cx, cy, 36, 36);
    });
    // ice blocks
    for (const i of this.ice) {
      const tx = i % this.cols, ty = Math.floor(i / this.cols);
      const born = this.iceBorn.get(i) ?? -10;
      const k = Math.max(0, Math.min(1, (this.now - born) / 0.3));
      if (k <= 0) continue;
      ctx.imageSmoothingEnabled = true;
      if (k < 1) {
        const fim = img[(['iceblock_0', 'iceblock_1', 'iceblock_2', 'iceblock_3'] as ImageKey[])[Math.min(3, Math.floor(k * 4))]];
        const sc = 54 / Math.max(fim.width, fim.height);
        ctx.drawImage(fim, tx * TILE + 24 - fim.width * sc / 2, ty * TILE + TILE + 2 - fim.height * sc, fim.width * sc, fim.height * sc);
      } else ctx.drawImage(img.ice_block, tx * TILE, ty * TILE, TILE, TILE);
      ctx.imageSmoothingEnabled = false;
    }
    // hazards on the floor
    for (const [, kind, x, y, r, ms, left] of this.snap?.hz ?? []) drawHazard(ctx, kind, x, y, r, ms, left, t);
    // target tile + camera framing hint for the local player
    const meView = s.me ? this.views.get(s.me.role) : undefined;
    if (me && meView && !me.ko && !s.complete) {
      const d = DIRS[this.pred.pos.facing];
      const tx = tileOf(this.pred.pos.x) + d.x, ty = tileOf(this.pred.pos.y) + d.y;
      const free = tileAt(L, tx, ty) === '.' || this.iceAt(tx, ty);
      if (free) {
        ctx.strokeStyle = this.iceAt(tx, ty) ? 'rgba(255,140,120,0.8)' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 20;
        ctx.strokeRect(tx * TILE + 3, ty * TILE + 3, TILE - 6, TILE - 6);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
      if (s.has('camera') && me.cam <= 0 && !me.lk.includes('camera')) this.drawConeHint(ctx, meView.x, meView.y - 14, Math.atan2(d.y, d.x), 0.07);
    }
    for (const c of this.cones) this.drawConeHint(ctx, c.x, c.y, c.ang, c.t * 1.2, true);
    // enemy flash telegraphs and beams
    for (const tl of this.teles) {
      const k = 1 - tl.t / tl.max;
      if (tl.kind === 'flash') {
        ctx.save();
        ctx.strokeStyle = `rgba(255,${Math.round(220 - k * 180)},80,${0.35 + k * 0.5})`;
        ctx.lineWidth = 6 + k * 8; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
        ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tl.x + Math.cos(tl.ang) * tl.len, tl.y + Math.sin(tl.ang) * tl.len); ctx.stroke();
        ctx.restore();
        text(ctx, '!', tl.x, tl.y - 54, { size: 3, color: C.red, outline: C.navyD }, 'center');
      } else if (tl.kind === 'whistle') {
        ctx.strokeStyle = `rgba(255,211,77,${0.4 + Math.sin(t * 20) * 0.3})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(tl.x, tl.y + 10, tl.len * k, 0, Math.PI * 2); ctx.stroke();
      } else {
        text(ctx, '!!', tl.x, tl.y - 54, { size: 2, color: C.gold, outline: C.navyD }, 'center');
      }
    }
    for (const b of this.beams) {
      const im = sp('fx_beam');
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.ang); ctx.globalAlpha = Math.min(1, b.t * 4);
      if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, 0, -im.height * (b.len / im.width) / 2, b.len, im.height * (b.len / im.width)); }
      else { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -10, b.len, 20); }
      ctx.restore();
    }
    if (this.boss?.type === 'branka') this.drawBossFloor(ctx, this.boss);
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
    if (this.boss) { const b = this.boss; actors.push({ y: b.y + 40, draw: () => b.type === 'branka' ? this.drawBranka(ctx, b) : this.drawOtherBoss(ctx, b) }); }
    for (const e0 of this.snap?.e ?? []) {
      if (e0.s === 2) continue;
      const e = this.eInterp.get(e0.i) ?? e0;
      const live = { ...e0, x: e.x, y: e.y };
      actors.push({ y: e.y + 14, draw: () => this.drawEnemyFull(ctx, live, me) });
    }
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    if (this.exitOpen && ex >= 0) {
      const ay = 58 + Math.sin(t * 6) * 4;
      text(ctx, '^ IZLAZ ^', ex * TILE + TILE, ay, { size: 2, color: C.gold, outline: C.navyD }, 'center');
    }
    // projectiles (generic + Branka's fireballs)
    const pdt = Math.min(0.1, (performance.now() - this.bossSnapAt) / 1000);
    for (const [, kind, x, y, vx, vy] of this.snap?.pr ?? []) drawProjectile(ctx, kind, x + vx * pdt * 0, y + vy * pdt * 0, vx, vy, t);
    if (this.boss?.fb) this.drawFireballs(ctx, this.boss);
    for (const sp0 of this.sprites) {
      const k = (sp0.t - sp0.delay) / sp0.dur;
      if (k < 0) continue;
      let im: HTMLImageElement | null;
      if (typeof sp0.keys === 'string') { const n = spN(sp0.keys); im = n ? sp(sp0.keys, Math.min(n - 1, Math.floor(k * n))) : null; }
      else im = img[sp0.keys[Math.min(sp0.keys.length - 1, Math.floor(k * sp0.keys.length))]];
      if (!im) continue;
      const x = sp0.x + (sp0.x1 - sp0.x) * ease.outCubic(k), y = sp0.y + (sp0.y1 - sp0.y) * ease.outCubic(k);
      const sc = sp0.size / Math.max(im.width, im.height);
      ctx.save(); ctx.translate(x, y); ctx.rotate(sp0.rot);
      ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc);
      ctx.restore();
    }
    this.fx.draw(ctx, true);
  }

  /** camera framing cone with the PERFECT / GOOD distance bands */
  private drawConeHint(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, alpha: number, flash = false) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    const wedge = (r: number) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, ang - CAM_HALF_ANGLE, ang + CAM_HALF_ANGLE); ctx.closePath(); };
    if (flash) {
      ctx.fillStyle = 'rgba(255,255,240,0.55)'; wedge(CAM_RANGE); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,160,0.5)'; wedge(CAM_CLOSE); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,1)'; wedge(CAM_RANGE); ctx.fill();
      ctx.globalAlpha = Math.min(1, alpha * 3);
      ctx.strokeStyle = 'rgba(255,211,77,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(x, y, CAM_CLOSE, ang - CAM_HALF_ANGLE, ang + CAM_HALF_ANGLE); ctx.stroke();
      ctx.strokeStyle = 'rgba(191,232,255,0.8)';
      ctx.beginPath(); ctx.arc(x, y, CAM_MEDIUM, ang - CAM_HALF_ANGLE, ang + CAM_HALF_ANGLE); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  private drawEnemyFull(ctx: CanvasRenderingContext2D, e: EnemySnap, me: PlayerSnap | undefined) {
    drawEnemy(ctx, e, this.t, !!this.eMoving.get(e.i) && e.st <= 0);
    const def = ENEMIES[e.ty];
    // kid asking a question: speech bubble with the question for the asked player
    if (def && !def.hostile && e.s === 4) {
      const asked = this.snap?.p.find((p) => p.qz >= 0 && Math.hypot(p.x - e.x, p.y - e.y) < 90);
      bubble(ctx, [asked && asked.qs ? '??!' : '?'], e.x, e.y - 34, 1, C.ink, C.gold);
      void me;
    }
  }

  private bossFrame(anim: BossAnim, i: number): HTMLImageElement {
    const n = BOSS_ANIMS[anim];
    return img[`boss_${anim}_${Math.max(0, Math.min(n - 1, i))}` as ImageKey];
  }

  private drawOtherBoss(ctx: CanvasRenderingContext2D, b: BossSnap) {
    drawBossGeneric(ctx, b, this.t);
    if (b.st in BOSS_LABELS && b.st !== 'frozen') text(ctx, BOSS_LABELS[b.st], b.x, b.y + 66, { size: 2, color: '#ffb3a8', outline: C.navyD }, 'center');
    if (this.bossSay) bubble(ctx, wrap(this.bossSay.text, 260, 2), b.x + 120, b.y - 50, Math.min(1, this.bossSay.t * 3), '#7a1414');
  }

  private drawBranka(ctx: CanvasRenderingContext2D, b: BossSnap) {
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

  /** Branka telegraphs on the floor: meteor target marks and the shockwave radius */
  private drawBossFloor(ctx: CanvasRenderingContext2D, b: BossSnap) {
    const t = this.t;
    const since = (performance.now() - this.bossSnapAt);
    for (const [, x, y, msRaw] of b.mt ?? []) {
      const ms = Math.max(0, msRaw - since);
      const k = 1 - Math.min(1, ms / 2100);
      const n = spN('fire_mark');
      if (n) drawFit(ctx, sp('fire_mark', Math.min(n - 1, Math.floor(k * n))), 'fire_mark', x, y + 22, 64, 40);
      else {
        const pulse = 0.5 + Math.sin(t * (10 + k * 20)) * 0.3;
        ctx.fillStyle = `rgba(255,60,40,${0.12 + k * 0.25})`;
        ctx.beginPath(); ctx.ellipse(x, y + 6, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,${120 - k * 80},60,${pulse})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, y + 6, 26 * k, 14 * k, 0, 0, Math.PI * 2); ctx.stroke();
      }
      if (ms < 450) {
        const rn = spN('fire_rain');
        if (rn) drawFit(ctx, sp('fire_rain', Math.min(rn - 1, Math.floor((1 - ms / 450) * rn))), 'fire_rain', x, y + 14, 60, 90);
        else {
          const im = img.boss_fireball_1;
          const fy = y - 30 - (ms / 450) * 260;
          ctx.save(); ctx.translate(x, fy); ctx.rotate(Math.PI / 2); ctx.imageSmoothingEnabled = true;
          ctx.drawImage(im, -im.width * 0.45, -im.height * 0.45, im.width * 0.9, im.height * 0.9);
          ctx.restore();
        }
      }
    }
    if ((b.sh ?? -1) >= 0) {
      const ms = Math.max(0, (b.sh ?? 0) - since);
      const r = b.shr ?? 210;
      const k = 1 - Math.min(1, ms / 1000);
      ctx.fillStyle = `rgba(255,80,40,${0.08 + k * 0.18})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,40,${0.5 + Math.sin(t * 25) * 0.3})`; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, r * k, 0, Math.PI * 2); ctx.stroke();
    }
  }

  private drawFireballs(ctx: CanvasRenderingContext2D, b: BossSnap) {
    const dt = (performance.now() - this.bossSnapAt) / 1000;
    for (const [, x, y, vx, vy] of b.fb ?? []) {
      const px = x + vx * Math.min(dt, 0.1), py = y + vy * Math.min(dt, 0.1);
      if (spN('fire_ball')) drawProjectile(ctx, 'fireball', px, py, vx, vy, this.t);
      else {
        const im = img[Math.floor(this.t * 12) % 2 ? 'boss_fireball_0' : 'boss_fireball_1'];
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(vy, vx) + Math.PI); ctx.imageSmoothingEnabled = true;
        const sc = 54 / Math.max(im.width, im.height);
        ctx.drawImage(im, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc);
        ctx.restore();
      }
      if (Math.random() < 0.5) this.fx.add({ x: px, y: py, vx: -vx * 0.2, vy: -vy * 0.2, size: 4, color: Math.random() < 0.5 ? '#ffb02e' : '#ff5a2e', max: 0.3, front: false });
    }
  }

  private drawDuo(ctx: CanvasRenderingContext2D, d: NonNullable<LevelScene['duo']>, dv: CharacterView, hv: CharacterView) {
    const sc = 0.56;
    let key: ImageKey, flip: boolean, cx: number;
    const bottom = Math.max(dv.y, hv.y) + 11;
    if (d.kind === 'revive') {
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
      if (this.app.session.has('patience') && spN('fx_patience_aura')) drawFit(ctx, sp('fx_patience_aura', Math.floor(this.t * 6) % 3), 'fx_patience_aura', dv.x, bottom, 70, 60);
    }
  }

  // ------------------------------------------------------------------ HUD
  private drawFrame(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#0f1d3a'; ctx.fillRect(0, 0, 1280, 720);
    const bd = sp(stageDef(this.level.stage).skin.backdrop);
    if (bd) {
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.35;
      ctx.drawImage(bd, 0, 0, 1280, 720);
      ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = 'rgba(11,20,40,0.45)'; ctx.fillRect(0, 0, 1280, 720);
    } else {
      ctx.fillStyle = 'rgba(143,208,245,0.07)';
      for (let i = 0; i < 60; i++) { const x = (i * 211) % 1280, y = (i * 97 + Math.floor(this.t * 12) * (i % 3)) % 720; ctx.fillRect(x, y, 3, 3); }
    }
    pixRect(ctx, OX - 8, OY - 6, this.cols * TILE + 16, this.rows * TILE + 12, C.navyD, 6);
    pixRect(ctx, OX - 5, OY - 3, this.cols * TILE + 10, this.rows * TILE + 6, C.iceL, 4);
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const s = this.app.session;
    const L = this.level;
    const stg = stageDef(L.stage);
    text(ctx, levelLabel(L.id), 16, 14, { size: 2, color: stg.color, outline: C.navyD });
    text(ctx, L.name, 16, 40, { size: 2, color: C.iceL });
    const total = L.items.length;
    const got = this.taken.size;
    const bx = 470, bw = 340;
    if (this.boss) {
      const b = this.boss;
      const def = BOSS_DEFS[b.type];
      text(ctx, `${def.name}  -  ${def.title}`, 640, 10, { size: 2, color: b.enr ? '#ff8a7a' : C.white, outline: C.navyD }, 'center');
      pixRect(ctx, 400 - 3, 34, 480 + 6, 22, C.navyD, 3);
      pixRect(ctx, 400, 37, 480, 16, '#3a1420', 2);
      if (b.hp > 0) pixRect(ctx, 400, 37, Math.max(6, (480 * b.hp) / b.max), 16, b.enr ? '#ff4a3a' : '#e8a020', 2);
      text(ctx, `${b.hp}/${b.max}`, 640, 40, { size: 1, color: C.white }, 'center');
      const hint = b.type === 'hrana' ? (s.has('camera') ? 'LED OKO NJE + RAZBIJ / ILI SLIKAJ' : 'ZAZIDAJ JE LEDOM, PA RAZBIJ LED')
        : b.type === 'sonja' ? `RESAVAJ ISPITE [${keyLabel(bindings.code('interact'))}]` : `[${keyLabel(bindings.code('camera'))}] SLIKAJ IZBLIZA = VISE STETE`;
      text(ctx, hint, 1264, 46, { size: 1, color: '#ffb3a8' }, 'right');
    } else {
      text(ctx, `HRANA ${got}/${total}`, 640, 10, { size: 2, color: C.white, outline: C.navyD }, 'center');
      pixRect(ctx, bx - 3, 34, bw + 6, 20, C.navyD, 3);
      pixRect(ctx, bx, 37, bw, 14, '#24365e', 2);
      if (got) pixRect(ctx, bx, 37, Math.max(6, (bw * got) / total), 14, got === total ? C.green : C.gold, 2);
      const nTot = L.items.filter((i) => i.kind === 'noodles').length;
      const nGot = L.items.filter((it, i) => it.kind === 'noodles' && this.taken.has(i)).length;
      drawImageFit(ctx, img.noodles, bx + bw + 30, 40, 28, 28);
      text(ctx, `${nGot}/${nTot}`, bx + bw + 48, 34, { size: 2, color: C.gold });
      text(ctx, 'ZAJEDNO', bx + bw + 48, 54, { size: 1, color: C.ice });
      const tasksLeft = this.stations.filter((_, i) => (this.stProg[i] ?? 0) < 1).length;
      const exitTxt = this.exitOpen ? 'IZLAZ: OTVOREN' : tasksLeft && this.stations.length ? `ZADACI: ${this.stations.length - tasksLeft}/${this.stations.length}` : 'IZLAZ: ZAKLJUCAN';
      text(ctx, exitTxt + '  SOBA ' + s.code, 1264, 46, { size: 1, color: this.exitOpen ? '#7fe08a' : C.ice }, 'right');
    }
    const sec = Math.floor(this.timeMs / 1000);
    text(ctx, `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, 1264, 12, { size: 3, color: C.white, outline: C.navyD }, 'right');
    this.rolePanel(ctx, 'david', 6);
    this.rolePanel(ctx, 'nemanja', 1280 - 6 - 148);
    // controls strip from the current bindings (only unlocked skills)
    const k = (a: Parameters<typeof bindings.code>[0]) => keyLabel(bindings.code(a));
    const parts = [`${moveLabel()} HODAJ`, `${k('ice')} LED`];
    if (s.has('coffee')) parts.push(`${k('coffee')} KAFA`);
    if (s.has('camera')) parts.push(`${k('camera')} KAMERA`);
    parts.push(`${k('interact')} ZADATAK`, `${k('pause')} PAUZA`, '1-6 EMOTE');
    text(ctx, parts.join('    '), 640, 704, { size: 1, color: C.iceL }, 'center');
  }

  private skillRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, id: SkillId, p: PlayerSnap, mine: boolean) {
    const s = this.app.session;
    const have = s.has(id);
    const debuff = p.lk.includes(id);
    const label = `${SKILLS[id].name}${mine ? ` [${keyLabel(bindings.code(id as 'coffee' | 'camera'))}]` : ''}`;
    text(ctx, label, x + 16, y, { size: 1, color: have ? C.ice : '#6f7a96' });
    if (!have) {
      pixRect(ctx, x + 14, y + 14, w - 28, 40, '#0f182c', 3);
      const ic = skillIcon(id);
      ctx.globalAlpha = 0.25; if (ic) drawImageFit(ctx, ic, x + 36, y + 34, 30, 30); ctx.globalAlpha = 1;
      text(ctx, 'ZAKLJUCANO', x + 60, y + 22, { size: 1, color: '#ff9a8e' });
      text(ctx, `POSLE STAGE ${SKILLS[id].unlockStage}`, x + 60, y + 36, { size: 1, color: '#7f8aa6' });
      return;
    }
    if (id === 'coffee') {
      for (let i = 0; i < COFFEE_MAX; i++) {
        ctx.globalAlpha = i < p.cof ? 1 : 0.22;
        drawImageFit(ctx, img.coffee, x + 32 + i * 40, y + 26, 32, 30);
        ctx.globalAlpha = 1;
      }
      if (p.dr) text(ctx, 'GLUP GLUP...', x + w / 2, y + 46, { size: 1, color: '#ffcf9a' }, 'center');
    } else {
      const camReady = p.cam <= 0;
      ctx.globalAlpha = camReady ? 1 : 0.55;
      ctx.drawImage(img.camera, x + 16, y + 14);
      ctx.globalAlpha = 1;
      const barX = x + 64, barW = w - 80;
      pixRect(ctx, barX, y + 24, barW, 12, C.navyD, 2);
      const f = 1 - p.cam / CAMERA_COOLDOWN_MS;
      pixRect(ctx, barX + 2, y + 26, Math.max(2, (barW - 4) * Math.min(1, f)), 8, camReady ? C.gold : C.iceD, 1);
      text(ctx, camReady ? 'SPREMNO' : (p.cam / 1000).toFixed(1) + 'S', barX + barW / 2, y + 42, { size: 1, color: camReady ? C.gold : C.ice }, 'center');
    }
    if (debuff) {
      ctx.fillStyle = 'rgba(80,20,120,0.6)'; ctx.fillRect(x + 12, y + 12, w - 24, 44);
      text(ctx, 'BLOKIRANO!', x + w / 2, y + 28, { size: 1, color: '#e0b0ff', outline: C.navyD }, 'center');
    }
  }

  /** food counters for one character's items; returns the item kinds listed */
  private foodList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, role: Role, title: string): ItemKind[] {
    text(ctx, title, x + 16, y, { size: 1, color: C.ice });
    const kinds = [...new Set(this.level.items.filter((i) => ITEM_OWNER[i.kind] === role).map((i) => i.kind))];
    kinds.forEach((k, r) => {
      const ry = y + 18 + r * 38;
      const tot = this.level.items.filter((i) => i.kind === k).length;
      const got = this.level.items.filter((it, i) => it.kind === k && this.taken.has(i)).length;
      pixRect(ctx, x + 14, ry, w - 28, 32, '#101c36', 3);
      const key = ITEM_SPRITE[k];
      if (spN(key)) drawFit(ctx, sp(key), key, x + 34, ry + 30, 28, 28); else drawImageFit(ctx, img[ITEM_IMG[k]], x + 34, ry + 16, 26, 26);
      text(ctx, `${got}/${tot}`, x + w - 22, ry + 9, { size: 2, color: got === tot ? C.green : C.white }, 'right');
    });
    return kinds;
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
    if (!p) {
      if (!s.solo) { text(ctx, 'CEKA SE...', cx, y + 170, { size: 1, color: C.ice }, 'center'); return; }
      // solo: the partner's slot shows what YOU still have to pick up for him
      ctx.fillStyle = 'rgba(11,20,40,0.55)'; ctx.fillRect(x + 14, y + 16, w - 28, 80);
      text(ctx, 'SOLO MOD', cx, y + 150, { size: 2, color: C.green, outline: C.navyD }, 'center');
      text(ctx, 'NJEGOVU HRANU I', cx, y + 190, { size: 1, color: C.iceL }, 'center');
      text(ctx, 'ZADATKE RADIS TI', cx, y + 206, { size: 1, color: C.iceL }, 'center');
      this.foodList(ctx, x, y + 326, w, role, 'ZA NJEGA');
      return;
    }
    for (let i = 0; i < MAX_HP; i++) {
      const hx = cx - 48 + i * 34, hy = y + 146;
      const full = i < p.hp;
      const bob = full && p.hp === 1 ? Math.sin(this.t * 10) * 2 : 0;
      ctx.drawImage(img[full ? 'heart' : 'heart_empty'], hx, hy + bob);
    }
    this.skillRow(ctx, x, y + 190, w, 'coffee', p, mine);
    this.skillRow(ctx, x, y + 258, w, 'camera', p, mine);
    const kinds = this.foodList(ctx, x, y + 326, w, role, 'MOJA HRANA');
    if (!kinds.length && this.boss) text(ctx, '- BOSS -', cx, y + 350, { size: 1, color: '#7f8aa6' }, 'center');
    // patience badge
    if (s.has('patience')) {
      const ic = skillIcon('patience');
      if (ic) drawImageFit(ctx, ic, x + 26, y + 486, 22, 22);
      text(ctx, 'STRPLJENJE', x + 42, y + 482, { size: 1, color: C.gold });
    }
    let status = '', col = C.iceL;
    if (!info?.connected) { status = 'OFFLINE'; col = C.orange; }
    else if (p.ko) { status = 'KO! PRIDJI DA GA PODIGNES'; col = '#ff9a8e'; }
    else if (p.qz >= 0) { status = 'ODGOVARA DETETU'; col = C.gold; }
    else if (p.sn > 0) { status = 'OSLEPLJEN BLICEM'; col = '#ffffff'; }
    else if (p.tk) { status = 'RADI ZADATAK...'; col = '#7fe08a'; }
    else if (p.db) { status = 'DUG: SPORIJI'; col = '#7fe08a'; }
    else if (p.sl) { status = 'USPOREN'; col = '#9ee07a'; }
    else if (p.hp === 1 && s.has('coffee')) { status = 'POPIJ KAFU!'; col = '#ffcf9a'; }
    if (status) wrap(status, 130, 1).forEach((l, i) => text(ctx, l, cx, y + 520 + i * 14, { size: 1, color: col }, 'center'));
    text(ctx, info?.connected ? 'ONLINE' : 'OFFLINE', cx, y + 582, { size: 1, color: info?.connected ? C.green : C.orange }, 'center');
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
      const stg = stageDef(this.level.stage);
      ctx.save(); ctx.translate(cx, 300); ctx.scale(k, k);
      panel(ctx, -320, -90, 640, 190, 'navy');
      text(ctx, `${levelLabel(this.level.id)}  -  ${stg.name}`, 0, -70, { size: 2, color: stg.color }, 'center');
      text(ctx, this.level.name, 0, -44, { size: 4, color: C.white, outline: C.navyD }, 'center');
      wrap(this.level.intro, 580, 1).forEach((l, i) => text(ctx, l, 0, 4 + i * 14, { size: 1, color: C.iceL }, 'center'));
      text(ctx, s.solo ? 'SOLO: SKUPLJAS SVU HRANU I RADIS SVE ZADATKE SAM' : 'PLAVI KRUG = DAVID   BELI = NEMANJA   ZLATNI = ZAJEDNO', 0, 44, { size: 1, color: s.solo ? C.green : C.ice }, 'center');
      const skills = (['ice', 'coffee', 'camera', 'patience'] as SkillId[]).filter((id) => s.has(id)).map((id) => SKILLS[id].name).join(' + ');
      text(ctx, 'VESTINE: ' + skills, 0, 64, { size: 1, color: C.gold }, 'center');
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
    const me = this.mySnap();
    if (me && me.qz >= 0 && !s.complete) this.drawQuiz(ctx, me, ui);
    if (this.paused && !s.complete && !this.pauseMenu) {
      ctx.fillStyle = 'rgba(11,20,40,0.6)'; ctx.fillRect(OX, OY, this.cols * TILE, this.rows * TILE);
      panel(ctx, cx - 300, 280, 600, 140, 'navy');
      const manual = this.paused.startsWith('PAUZA');
      text(ctx, 'PAUZA', cx, 300, { size: 4, color: C.gold }, 'center');
      text(ctx, manual ? this.paused.replace('PAUZA: ', '') + ' JE PAUZIRAO IGRU' : this.paused, cx, 346, { size: 2, color: C.white }, 'center');
      text(ctx, manual ? 'SVE STOJI DOK SE NE NASTAVI' : 'CEKAMO DA SE VRATI (45 S)...', cx, 378, { size: 1, color: C.ice }, 'center');
    }
    if (s.complete) this.drawComplete(ctx, ui);
  }

  private drawQuiz(ctx: CanvasRenderingContext2D, me: PlayerSnap, ui: import('../engine/ui.ts').UI) {
    const q = QUESTIONS[me.qz];
    if (!q) return;
    const x = 330, y = 470, w = 620, h = 190;
    panel(ctx, x, y, w, h, 'ice');
    if (spN('fx_kidalert')) drawFit(ctx, sp('fx_kidalert'), 'fx_kidalert', x + 50, y + 70, 54, 54);
    text(ctx, `DETE PITA (${q.s}):`, x + 90, y + 18, { size: 1, color: C.navy });
    if (me.qs) text(ctx, QUIZ_SURE, x + w - 24, y + 18, { size: 1, color: '#b0281e' }, 'right');
    wrap(q.q, w - 120, 2).forEach((l, i) => text(ctx, l, x + 90, y + 36 + i * 20, { size: 2, color: C.ink }));
    q.o.forEach((o, i) => {
      if (ui.button(ctx, `${i + 1}  ${o}`, x + 24 + i * 196, y + 112, 180, 50, { color: 'navy', size: 2 })) this.app.session.net.send({ t: 'answer', i });
    });
  }

  private drawComplete(ctx: CanvasRenderingContext2D, ui: import('../engine/ui.ts').UI) {
    const s = this.app.session;
    const st = s.complete!;
    if (Math.random() < 0.5) {
      this.fx.add({ x: Math.random() * this.cols * TILE, y: -10, vy: 120 + Math.random() * 80, vx: (Math.random() - 0.5) * 60, g: 40, size: 6, shape: 'sq',
        color: ['#ffd34d', '#8fd0f5', '#ff7a6e', '#7fe08a', '#ffffff'][Math.floor(Math.random() * 5)], max: 4, vr: 5 });
    }
    ctx.fillStyle = 'rgba(11,20,40,0.55)'; ctx.fillRect(0, 0, 1280, 720);
    const cx = 640, x = cx - 330, y = 150, w = 660, h = 430;
    panel(ctx, x, y, w, h, 'navy');
    text(ctx, st.stageDone ? `STAGE ${st.stageDone} COMPLETE!` : 'LEVEL COMPLETE!', cx, y + 26, { size: 5, color: C.gold, outline: C.navyD, shadow: '#c98a12' }, 'center');
    const sec = Math.floor(st.timeMs / 1000);
    text(ctx, `${levelLabel(this.level.id)}: ${this.level.name}  -  VREME ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, cx, y + 82, { size: 2, color: C.iceL }, 'center');
    const cols = ['HRANA', 'LED', 'BLIC', 'KAFA', 'UDARCI'];
    const keys = ['food', 'ice', 'flashes', 'coffee', 'hits'] as const;
    cols.forEach((c, i) => text(ctx, c, x + 250 + i * 82, y + 122, { size: 1, color: C.ice }, 'center'));
    const played: Role[] = s.solo && s.me ? [s.me.role] : ['david', 'nemanja'];
    played.forEach((r, row) => {
      const ry = y + 142 + row * 48 + (played.length === 1 ? 24 : 0);
      pixRect(ctx, x + 30, ry, w - 60, 40, '#101c36', 3);
      drawImageFit(ctx, img[r === 'david' ? 'portrait_david' : 'portrait_nemanja'], x + 62, ry + 20, 44, 34);
      text(ctx, roleName(r), x + 92, ry + 13, { size: 2, color: C.white });
      keys.forEach((k, i) => text(ctx, String(st.perPlayer[r][k]), x + 250 + i * 82, ry + 11, { size: 2, color: C.gold }, 'center'));
    });
    const quote = st.unlocked ? `NOVA VESTINA: ${SKILLS[st.unlocked].name}!` : st.perPlayer.david.hits + st.perPlayer.nemanja.hits === 0 ? 'BEZ IJEDNOG UDARCA. LEGENDE.' : 'PREZIVELI STE!';
    text(ctx, quote, cx, y + 252, { size: 2, color: st.unlocked ? C.gold : '#7fe08a' }, 'center');
    (['david', 'nemanja'] as Role[]).forEach((r, i) => {
      if (!played.includes(r)) return;
      ctx.fillStyle = 'rgba(143,208,245,0.25)';
      ctx.beginPath(); ctx.ellipse(i === 0 ? x - 95 : x + w + 95, y + 392, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
      drawChar(ctx, r, 'win', Math.floor(this.t * 5 + i), i === 0 ? x - 95 : x + w + 95, y + 396, 1.3, i === 1);
    });
    const i = levelIndex(this.level.id);
    const next = LEVEL_ORDER[i + 1];
    if (next && levelUnlocked(next.id, s.completed)) {
      if (ui.button(ctx, 'SLEDECI NIVO >', cx - 150, y + 284, 300, 58, { color: 'gold', size: 3 })) s.net.send({ t: 'next' });
      if (ui.button(ctx, 'NAZAD U LOBI', cx - 250, y + 356, 240, 46, { color: 'navy', size: 2 })) s.net.send({ t: 'toLobby' });
      if (ui.button(ctx, 'IGRAJ PONOVO', cx + 10, y + 356, 240, 46, { color: 'ice', size: 2 })) s.net.send({ t: 'retry' });
    } else {
      text(ctx, 'KAMPANJA ZAVRSENA! ZIVOT.EXE JE POBEDJEN!', cx, y + 280, { size: 2, color: C.gold }, 'center');
      if (ui.button(ctx, 'NAZAD U LOBI', cx - 250, y + 316, 240, 50, { color: 'gold', size: 2 })) s.net.send({ t: 'toLobby' });
      if (ui.button(ctx, 'IGRAJ PONOVO', cx + 10, y + 316, 240, 50, { color: 'ice', size: 2 })) s.net.send({ t: 'retry' });
    }
  }
}

/** ESC menu. The match keeps running online - this only pauses YOUR input. */
class PauseMenu implements Overlay {
  constructor(private app: App, private onClose: () => void) { app.session.net.send({ t: 'pause', v: true }); }
  private close() { this.app.session.net.send({ t: 'pause', v: false }); this.app.game.close(this); this.onClose(); }
  update() {
    const inp = this.app.game.input;
    if (inp.wasPressed(bindings.code('pause')) || inp.wasPressed('Escape')) this.close();
  }
  render(ctx: CanvasRenderingContext2D) {
    const ui = this.app.game.ui;
    if (this.app.game.overlays[this.app.game.overlays.length - 1] !== this) { ui.enabled = false; }
    ctx.fillStyle = 'rgba(5,10,25,0.6)'; ctx.fillRect(0, 0, 1280, 720);
    panel(ctx, 640 - 200, 170, 400, 380, 'navy');
    text(ctx, 'PAUZA', 640, 196, { size: 4, color: C.gold, outline: C.navyD }, 'center');
    text(ctx, this.app.session.solo ? 'IGRA STOJI' : 'IGRA STOJI I ZA DRUGOG IGRACA', 640, 240, { size: 1, color: C.iceL }, 'center');
    if (ui.button(ctx, 'NASTAVI', 640 - 140, 270, 280, 48, { color: 'gold', size: 2 })) this.close();
    if (ui.button(ctx, 'PODESAVANJA', 640 - 140, 334, 280, 44, { color: 'ice', size: 2 })) this.app.settings();
    if (ui.button(ctx, 'VESTINE', 640 - 140, 394, 280, 44, { color: 'ice', size: 2 })) this.app.skillsScreen();
    if (ui.button(ctx, 'NAZAD U LOBI', 640 - 140, 454, 280, 44, { color: 'red', size: 2 })) { this.app.session.net.send({ t: 'toLobby' }); this.close(); }
    ui.enabled = true;
  }
}
