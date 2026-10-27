import { DEFAULT_EMOTES } from '../../../shared/emotes.ts';
import { CHAR, charImage, sp, spN, type CharAnim } from '../engine/assets.ts';
import type { TaskAnim } from '../../../shared/tasks.ts';
import { drawStar } from '../engine/fx.ts';
import { text } from '../engine/font.ts';
import { C, bubble, pixRect, ring } from '../engine/ui.ts';
import { wrap } from '../engine/font.ts';
import { roleName, type Dir, type Role } from '../../../shared/types.ts';

export const CHAR_SCALE = 0.56;
const FEET = 10; // px below the hitbox centre where the sprite's feet touch the floor

export interface CharState {
  moving: boolean; drinking: boolean; ko: boolean; win: boolean; invuln: boolean; slowed: boolean; revive: number;
  stunned: boolean; debt: boolean; locked: boolean;
}

/**
 * Task animation sets per character (stage asset prefixes: <prefix>_prep / _loop / _done).
 * Add e.g. 'task_studying_david' to the stage manifest and list it here to give a task type its own art;
 * until then a character falls back to its default task animation.
 */
const TASK_ANIM: Record<Role, Partial<Record<TaskAnim, string>> & { default: string }> = {
  david: { default: 'task_coding', coding: 'task_coding', studying: 'task_studying_david' },
  nemanja: { default: 'task_gaming', gaming: 'task_gaming', studying: 'task_studying_nemanja' },
};
export function taskAnimPrefix(role: Role, anim: TaskAnim): string {
  const want = TASK_ANIM[role][anim];
  return want && spN(want + '_loop') ? want : TASK_ANIM[role].default;
}
const TASK_SCALE = 0.8;

/** Visual for David/Nemanja: picks animation frames from the extracted sprite strips. */
export class CharacterView {
  x = 0; y = 0;
  scale = CHAR_SCALE;
  facing: Dir = 1;
  flip = false;
  t = 0;
  st: CharState = { moving: false, drinking: false, ko: false, win: false, invuln: false, slowed: false, revive: 0, stunned: false, debt: false, locked: false };
  /** reusable task animation state: prep (sit down) -> loop while progress fills -> done -> idle */
  private task: { anim: TaskAnim; phase: 'prep' | 'loop' | 'done'; t: number; flip: boolean } | null = null;
  setTask(anim: TaskAnim | '', faceLeft: boolean) {
    if (anim && (!this.task || this.task.phase === 'done')) this.task = { anim, phase: 'prep', t: 0, flip: faceLeft };
    else if (anim && this.task) this.task.flip = faceLeft;
    else if (!anim && this.task && this.task.phase !== 'done') this.task = null;
  }
  /** play the success animation (called when the station completes) */
  finishTask() { if (this.task) { this.task.phase = 'done'; this.task.t = 0; } }
  get working() { return !!this.task; }
  private drinkT = 0;
  private say: { lines: string[]; t: number; color: string } | null = null;
  private emote: { e: number; t: number; text?: string } | null = null;
  private stepT = 0;
  /** one-shot action animation (camera photo / ice shot) */
  private action: { anim: CharAnim; t: number; dur: number } | null = null;
  /** level uses the run cycle, the lobby the calmer walk cycle */
  moveAnim: CharAnim = 'run';
  /** hidden while a two-character scene (revive / handshake) is drawn instead */
  hidden = false;
  private koT = 0;

  play(anim: CharAnim, dur: number) { this.action = { anim, t: 0, dur }; }
  /** where the hands are (for camera flash / ice beam origins) */
  handPos() { return { x: this.x + (this.flip ? -1 : 1) * 30 * this.scale / CHAR_SCALE, y: this.y - 34 * this.scale / CHAR_SCALE }; }

  constructor(readonly role: Role) { this.flip = role === 'nemanja'; }

  setFacing(f: Dir) {
    this.facing = f;
    if (f === 0) this.flip = false;
    else if (f === 2) this.flip = true;
  }

  speak(textStr: string, color: string = C.ink, dur = 2.4) { this.say = { lines: wrap(textStr, 240), t: dur, color }; }
  doEmote(e: number, text?: string) { this.emote = { e, t: 1.8, text }; }

  /** returns true on footstep frames (for sfx/dust) */
  update(dt: number): boolean {
    this.t += dt;
    if (this.action && (this.action.t += dt) >= this.action.dur) this.action = null;
    if (this.task) {
      this.task.t += dt;
      if (this.task.phase === 'prep' && this.task.t > 0.55) { this.task.phase = 'loop'; this.task.t = 0; }
      if (this.task.phase === 'done' && this.task.t > 0.75) this.task = null;
      if (this.st.ko || this.st.moving) this.task = null;
    }
    if (this.st.drinking) this.drinkT += dt; else this.drinkT = 0;
    if (this.st.ko) this.koT += dt; else this.koT = 0;
    if (this.say && (this.say.t -= dt) <= 0) this.say = null;
    if (this.emote && (this.emote.t -= dt) <= 0) this.emote = null;
    if (this.st.moving) {
      this.stepT += dt;
      if (this.stepT > 0.22) { this.stepT = 0; return true; }
    }
    return false;
  }

  private frame(): number {
    const a = CHAR[this.role].anims;
    if (this.st.ko) {
      if (this.koT < 0.75) return a.ko[Math.min(a.ko.length - 1, Math.floor((this.koT / 0.75) * a.ko.length))];
      return a.down[Math.floor((this.koT - 0.75) * 5) % a.down.length];
    }
    if (this.st.win) return a.win[Math.floor(this.t * 5) % a.win.length];
    if (this.st.drinking) return this.drinkT < 0.3 ? a.coffee[0] : a.coffee[2];
    if (this.action && !this.st.ko) {
      const fr = a[this.action.anim];
      return fr[Math.min(fr.length - 1, Math.floor((this.action.t / this.action.dur) * fr.length))];
    }
    if (this.st.moving) { const fr = a[this.moveAnim]; return fr[Math.floor(this.t * (this.moveAnim === 'run' ? 11 : 8)) % fr.length]; }
    return a.idle[Math.floor(this.t * 3) % a.idle.length];
  }

  draw(ctx: CanvasRenderingContext2D, opts: { name?: boolean; you?: boolean; ready?: boolean } = {}) {
    if (this.hidden) return;
    const im = charImage(this.role);
    const s = this.scale;
    const cm = CHAR[this.role];
    const w = cm.cellW * s, h = cm.cellH * s;
    const x = Math.round(this.x), y = Math.round(this.y);
    // shadow
    ctx.fillStyle = 'rgba(20,40,80,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y + FEET - 1, (this.st.ko ? 34 : 19) * s / CHAR_SCALE, 6, 0, 0, Math.PI * 2); ctx.fill();

    if (this.task && !this.st.ko && this.drawTask(ctx, x, y)) { this.drawOverhead(ctx, x, y, opts); return; }
    const fi = this.frame();
    ctx.save();
    if (this.st.invuln && !this.st.ko && Math.floor(this.t * 14) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    {
      // tiny bob while walking / squash on drinking
      const bob = 0;
      ctx.translate(x, y + FEET + bob);
      if (this.flip) ctx.scale(-1, 1);
      ctx.drawImage(im, fi * cm.cellW, 0, cm.cellW, cm.cellH, -w / 2, -h + 2 * s, w, h);
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;

    this.drawOverhead(ctx, x, y, opts);
  }

  /** task frames (laptop coding / headphones gaming); returns false if the art is missing */
  private drawTask(ctx: CanvasRenderingContext2D, x: number, y: number): boolean {
    const t = this.task!;
    const prefix = taskAnimPrefix(this.role, t.anim);
    const key = `${prefix}_${t.phase}`;
    const n = spN(key);
    if (!n) return false;
    const fi = t.phase === 'loop' ? Math.floor(this.t * 8) % n : Math.min(n - 1, Math.floor((t.t / (t.phase === 'prep' ? 0.55 : 0.75)) * n));
    const im = sp(key, fi);
    if (!im) return false;
    const sc = TASK_SCALE * this.scale / CHAR_SCALE;
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.translate(x, y + FEET);
    if (t.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -im.width * sc / 2, -im.height * sc + 2, im.width * sc, im.height * sc);
    ctx.restore();
    // little screen symbols / button presses while the loop runs
    if (t.phase === 'loop') {
      const syms = prefix.includes('gaming') ? ['!', '*', '+', '!'] : ['</>', '{ }', '01', '=>', ';'];
      for (let k = 0; k < 2; k++) {
        const ph = (this.t * 0.9 + k * 0.5) % 1;
        ctx.globalAlpha = 1 - ph;
        text(ctx, syms[Math.floor(this.t * 0.9 + k * 0.5) % syms.length], x + (t.flip ? -1 : 1) * (14 + k * 10), y - 30 - ph * 26, { size: 1, color: prefix.includes('gaming') ? '#ff6a5a' : '#7fe08a', outline: '#0b1428' }, 'center');
      }
      ctx.globalAlpha = 1;
    }
    return true;
  }

  private drawOverhead(ctx: CanvasRenderingContext2D, x: number, y: number, opts: { name?: boolean; you?: boolean; ready?: boolean }) {
    const s = this.scale;
    const headY = y + FEET - 76 * s / CHAR_SCALE + 8;
    if (this.st.stunned && !this.st.ko) {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < 3; i++) { const a = this.t * 5 + (i * Math.PI * 2) / 3; drawStar(ctx, x + Math.cos(a) * 16, headY - 2 + Math.sin(a) * 5, 5, this.t * 6); }
    }
    if (this.st.debt && !this.st.ko) text(ctx, '$', x + 18 + Math.sin(this.t * 4) * 2, headY + 4, { size: 2, color: '#7fe08a', outline: '#0b1428' }, 'center');
    if (this.st.locked && !this.st.ko) {
      ctx.fillStyle = '#b05cff'; ctx.fillRect(x - 24, headY + 6, 10, 8);
      ctx.strokeStyle = '#b05cff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - 19, headY + 6, 4, Math.PI, 0); ctx.stroke();
    }
    if (this.st.ko && this.koT > 0.75) {
      text(ctx, 'KO', x, y - 44, { size: 2, color: C.red, outline: C.navyD }, 'center');
    }
    if (this.st.slowed && !this.st.ko) {
      ctx.strokeStyle = 'rgba(110,190,60,0.85)'; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const ox = x - 14 + i * 14, ph = this.t * 6 + i;
        ctx.beginPath();
        for (let k = 0; k < 12; k++) ctx.lineTo(ox + Math.sin(ph + k * 0.6) * 3, headY - 4 - k * 1.5);
        ctx.stroke();
      }
    }
    if (opts.name) {
      const label = roleName(this.role);
      const tagY = headY - 22;
      text(ctx, label, x, tagY, { size: 2, color: this.role === 'david' ? '#bfe0ff' : C.white, outline: C.navyD }, 'center');
      if (opts.ready) {
        pixRect(ctx, x - 26, tagY - 22, 52, 18, C.navyD, 3);
        pixRect(ctx, x - 24, tagY - 20, 48, 14, C.green, 2);
        text(ctx, 'READY', x, tagY - 17, { size: 1, color: C.ink }, 'center');
      }
    }
    if (opts.you && !this.st.ko) {
      const by = headY - (opts.name ? 30 : 10) + Math.sin(this.t * 5) * 2;
      ctx.fillStyle = C.navyD;
      ctx.fillRect(x - 6, by - 2, 12, 4); ctx.fillRect(x - 4, by + 2, 8, 3); ctx.fillRect(x - 2, by + 5, 4, 3);
      ctx.fillStyle = C.gold;
      ctx.fillRect(x - 4, by - 1, 8, 3); ctx.fillRect(x - 2, by + 2, 4, 3);
    }
    const lift = opts.name ? 26 : 0;
    if (this.emote) drawEmote(ctx, this.emote.text ?? EMOTES[this.emote.e] ?? '!', x, headY - 6 - lift, this.emote.t);
    if (this.say) bubble(ctx, this.say.lines, x, headY - 4 - lift - (this.emote ? 34 : 0), Math.min(1, this.say.t * 3), this.say.color);
  }
}

export const EMOTES = DEFAULT_EMOTES;
export const EMOTE_KEYS = EMOTES.map((_, i) => 'Digit' + (i + 1));
function drawEmote(ctx: CanvasRenderingContext2D, label: string, x: number, bottom: number, t: number) {
  const pop = Math.min(1, (1.8 - t) * 8);
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 3);
  ctx.translate(x, bottom - 18);
  ctx.scale(pop, pop);
  bubble(ctx, [label], 0, 18, 1, C.ink, C.gold);
  ctx.restore();
}
