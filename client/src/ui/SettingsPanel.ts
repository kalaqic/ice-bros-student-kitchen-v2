import { ACTIONS, bindings, keyLabel, type ActionKey } from '../engine/bindings.ts';
import { emotes } from '../engine/emotes.ts';
import { EMOTE_MAX, cleanEmote } from '../../../shared/emotes.ts';
import { text } from '../engine/font.ts';
import type { Overlay } from '../engine/Game.ts';
import { C, panel, pixRect } from '../engine/ui.ts';
import type { App } from '../main.ts';

/** PODESAVANJA: remappable controls + music / SFX volume. Everything persists in localStorage. */
export class SettingsPanel implements Overlay {
  private tab: 'controls' | 'audio' | 'emotes' = 'controls';
  /** emote being edited + its draft text */
  private editing = -1;
  private draft = '';
  private blink = 0;
  private waiting: ActionKey | null = null;
  private msg = '';
  private msgColor: string = C.iceL;
  private msgT = 0;
  private drag: 'music' | 'sfx' | null = null;

  constructor(private app: App) {}

  private flash(m: string, color: string = C.iceL) { this.msg = m; this.msgColor = color; this.msgT = 3; }

  update(dt: number) {
    const inp = this.app.game.input;
    if (this.msgT > 0) this.msgT -= dt;
    this.blink += dt;
    if (this.editing >= 0) {
      inp.capture = true;
      for (const k of inp.typed) {
        if (k === '\b') this.draft = this.draft.slice(0, -1);
        else if (k === '\n') { this.commitEmote(); return; }
        else if (k.length === 1) this.draft = cleanEmote(this.draft + k);
      }
      if (inp.pasted) this.draft = cleanEmote(this.draft + inp.pasted);
      if (inp.wasPressed('Escape')) { this.editing = -1; inp.capture = false; this.flash('OTKAZANO'); }
      return;
    }
    if (this.waiting) {
      inp.capture = true;
      const code = inp.firstPressed;
      if (code) {
        if (code === 'Escape' && this.waiting !== 'pause') { this.waiting = null; this.flash('OTKAZANO'); }
        else {
          const r = bindings.set(this.waiting, code);
          if (r.ok) { this.flash(`${ACTIONS.find((a) => a.id === this.waiting)!.label} = ${keyLabel(code)}`, C.green); this.waiting = null; this.app.game.audio.play('ready'); }
          else {
            const who = r.conflict === 'reserved' ? 'EMOTE / ODGOVORI' : ACTIONS.find((a) => a.id === r.conflict)!.label;
            this.flash(`TASTER ${keyLabel(code)} VEC KORISTI: ${who}`, '#ff8a7a');
            this.app.game.audio.play('denied');
          }
        }
      }
      return;
    }
    inp.capture = false;
    if (inp.wasPressed('Escape')) this.close();
    if (!inp.mouse.down) this.drag = null;
  }

  private commitEmote() {
    const i = this.editing;
    emotes.set(i, this.draft);
    this.editing = -1; this.app.game.input.capture = false;
    this.flash(`EMOTE ${i + 1} = ${emotes.get(i)}`, C.green);
    this.app.game.audio.play('ready');
  }

  private close() { if (this.editing >= 0) this.commitEmote(); this.app.game.input.capture = false; this.app.game.close(this); }

  render(ctx: CanvasRenderingContext2D) {
    const { game } = this.app;
    const ui = game.ui;
    ctx.fillStyle = 'rgba(5,10,25,0.7)'; ctx.fillRect(0, 0, 1280, 720);
    const x = 300, y = 36, w = 680, h = 650;
    panel(ctx, x, y, w, h, 'navy');
    text(ctx, 'PODESAVANJA', 640, y + 22, { size: 4, color: C.gold, outline: C.navyD }, 'center');
    const tab = (t: SettingsPanel['tab']) => { this.tab = t; this.waiting = null; if (this.editing >= 0) this.commitEmote(); };
    if (ui.button(ctx, 'KONTROLE', x + 70, y + 70, 170, 40, { color: this.tab === 'controls' ? 'gold' : 'navy', size: 2 })) tab('controls');
    if (ui.button(ctx, 'ZVUK', x + 255, y + 70, 170, 40, { color: this.tab === 'audio' ? 'gold' : 'navy', size: 2 })) tab('audio');
    if (ui.button(ctx, 'EMOTE', x + 440, y + 70, 170, 40, { color: this.tab === 'emotes' ? 'gold' : 'navy', size: 2 })) tab('emotes');
    if (this.tab === 'controls') this.renderControls(ctx, x, y + 130);
    else if (this.tab === 'audio') this.renderAudio(ctx, x, y + 140);
    else this.renderEmotes(ctx, x, y + 140);
    if (this.msgT > 0 && this.msg) {
      ctx.globalAlpha = Math.min(1, this.msgT * 2);
      text(ctx, this.msg, 640, y + h - 92, { size: 2, color: this.msgColor, outline: C.navyD }, 'center');
      ctx.globalAlpha = 1;
    }
    if (ui.button(ctx, 'ZATVORI', 640 - 110, y + h - 62, 220, 44, { color: 'ice', size: 2 })) this.close();
  }

  private renderControls(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const ui = this.app.game.ui;
    let group = '';
    let row = 0;
    for (const a of ACTIONS) {
      if (a.group !== group) { group = a.group; text(ctx, group, x + 60, y + row * RH + 4, { size: 1, color: C.ice }); row += 0.6; }
      const ry = y + row * RH;
      pixRect(ctx, x + 60, ry + 6, w2, 28, '#101c36', 3);
      text(ctx, a.label, x + 76, ry + 13, { size: 2, color: C.white });
      const waiting = this.waiting === a.id;
      const label = waiting ? 'PRITISNI TASTER...' : keyLabel(bindings.code(a.id));
      if (ui.button(ctx, label, x + 380, ry + 6, 230, 28, { color: waiting ? 'gold' : 'ice', size: 2, selected: waiting })) {
        this.waiting = a.id; this.flash('PRITISNI NOVI TASTER (ESC = OTKAZI)');
      }
      row++;
    }
    if (ui.button(ctx, 'RESET NA PODRAZUMEVANO', x + 170, y + row * RH + 14, 340, 38, { color: 'red', size: 2 })) {
      bindings.reset(); this.waiting = null; this.flash('KONTROLE VRACENE NA WASD / SPACE / E / F / Q', C.green);
    }
  }

  private slider(ctx: CanvasRenderingContext2D, label: string, which: 'music' | 'sfx', x: number, y: number) {
    const audio = this.app.game.audio;
    const inp = this.app.game.input;
    const ui = this.app.game.ui;
    const v = audio.settings[which];
    const muted = which === 'music' ? audio.settings.musicMuted : audio.settings.sfxMuted;
    text(ctx, label, x, y, { size: 2, color: C.white });
    const bx = x, by = y + 26, bw = 360, bh = 22;
    pixRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, C.navyD, 3);
    pixRect(ctx, bx, by, bw, bh, '#24365e', 2);
    pixRect(ctx, bx, by, Math.max(4, bw * v), bh, muted ? '#5a6a88' : C.gold, 2);
    ctx.fillStyle = C.white; ctx.fillRect(bx + bw * v - 3, by - 5, 6, bh + 10);
    text(ctx, `${Math.round(v * 100)}%`, bx + bw + 16, by + 4, { size: 2, color: C.iceL });
    const clickedBar = inp.mouse.clicked && ui.hit(bx - 6, by - 8, bw + 12, bh + 16);
    if (clickedBar) this.drag = which;
    if (clickedBar || (this.drag === which && inp.mouse.down)) {
      const nv = Math.max(0, Math.min(1, (inp.mouse.x - bx) / bw));
      audio.set(which === 'music' ? { music: nv } : { sfx: nv });
    }
    if (ui.button(ctx, muted ? 'UKLJUCI' : 'UTISAJ', x + 440, y + 18, 130, 36, { color: muted ? 'red' : 'navy', size: 2 })) {
      audio.set(which === 'music' ? { musicMuted: !muted } : { sfxMuted: !muted });
      if (which === 'sfx' && muted) audio.play('collect');
    }
  }

  private renderEmotes(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const ui = this.app.game.ui;
    text(ctx, 'KLIKNI NA EMOTE, UKUCAJ TEKST, ENTER = SACUVAJ', 640, y, { size: 1, color: C.ice }, 'center');
    for (let i = 0; i < 6; i++) {
      const ry = y + 24 + i * 48;
      const editing = this.editing === i;
      pixRect(ctx, x + 60, ry, 560, 40, editing ? '#24365e' : '#101c36', 3);
      text(ctx, String(i + 1), x + 84, ry + 12, { size: 2, color: C.gold });
      const label = editing ? this.draft + (Math.floor(this.blink * 2) % 2 ? '_' : ' ') : emotes.get(i);
      if (ui.button(ctx, '', x + 110, ry + 4, 500, 32, { color: editing ? 'gold' : 'ice', size: 2, selected: editing }) && !editing) {
        if (this.editing >= 0) this.commitEmote();
        this.editing = i; this.draft = emotes.get(i); this.blink = 0;
        this.flash(`MAX ${EMOTE_MAX} ZNAKOVA, ESC = OTKAZI`);
      }
      text(ctx, label, x + 360, ry + 12, { size: 2, color: C.ink }, 'center');
    }
    if (ui.button(ctx, 'RESET EMOTE', x + 190, y + 324, 300, 38, { color: 'red', size: 2 })) {
      this.editing = -1; this.app.game.input.capture = false; emotes.reset(); this.flash('EMOTE VRACENI NA PODRAZUMEVANE', C.green);
    }
    text(ctx, 'TASTERI 1-6 U IGRI. DRUGI IGRAC VIDI TVOJ TEKST.', 640, y + 376, { size: 1, color: 'rgba(223,243,255,0.6)' }, 'center');
  }

  private renderAudio(ctx: CanvasRenderingContext2D, x: number, y: number) {
    this.slider(ctx, 'MUZIKA', 'music', x + 60, y);
    this.slider(ctx, 'ZVUCNI EFEKTI', 'sfx', x + 60, y + 100);
    const a = this.app.game.audio;
    const src = a.playing ? (a.playing.source === 'synth' ? 'UGRADJENA CHIPTUNE MELODIJA' : a.playing.source.toUpperCase()) : (a.unlocked ? 'NISTA' : 'POCINJE POSLE PRVOG KLIKA / TASTERA');
    text(ctx, 'TRENUTNO: ' + src, x + 60, y + 210, { size: 1, color: C.ice });
    text(ctx, 'SVOJU PESMU UBACI U ASSETS/AUDIO (MUSIC.MP3, LOBBY.MP3, STAGE1.MP3, BOSS.MP3...)', x + 60, y + 230, { size: 1, color: 'rgba(223,243,255,0.6)' });
    text(ctx, 'M = BRZO UTISAVANJE SVEGA', x + 60, y + 250, { size: 1, color: 'rgba(223,243,255,0.6)' });
  }
}
const w2 = 560;
const RH = 32;
