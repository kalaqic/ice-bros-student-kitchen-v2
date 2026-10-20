import { text } from '../engine/font.ts';
import { Snow } from '../engine/fx.ts';
import type { Scene } from '../engine/Game.ts';
import { C, panel, pixRect } from '../engine/ui.ts';
import { CharacterView, EMOTES } from '../game/Character.ts';
import { Interp, Predictor } from '../game/Predictor.ts';
import type { App } from '../main.ts';
import { LOBBY_SIGN, lobbySolid } from '../../../shared/lobby.ts';
import type { PlayerSnap, ServerMsg } from '../../../shared/protocol.ts';
import { roleName, type Role } from '../../../shared/types.ts';
import { drawLobbyBg } from './common.ts';
import { LEVEL_ORDER, levelIndex } from '../../../shared/levels/index.ts';

/** Playable waiting lobby on top of assets/snowy_lobby.png. */
export class LobbyScene implements Scene {
  private snow = new Snow();
  private views = new Map<Role, CharacterView>();
  private pred: Predictor;
  private interp = new Interp<PlayerSnap>();
  private last: PlayerSnap[] = [];
  private off: (() => void) | null = null;
  private alpha = 0;
  private t = 0;
  private copied = 0;

  constructor(private app: App) { this.pred = new Predictor(app.session.net); }

  enter() {
    this.off = this.app.session.net.on((m) => this.onMsg(m));
  }
  exit() { this.off?.(); }

  private view(r: Role) {
    let v = this.views.get(r);
    if (!v) { v = new CharacterView(r); v.scale = 0.8; v.moveAnim = 'walk'; this.views.set(r, v); }
    return v;
  }

  private onMsg(m: ServerMsg) {
    const s = this.app.session;
    if (m.t === 'room') {
      // a player that left disappears
      for (const r of [...this.views.keys()]) if (!m.players.some((p) => p.role === r)) this.views.delete(r);
    }
    if (m.t !== 's') return;
    this.last = m.p;
    this.interp.push(m.p.map((p) => [p.id, p]));
    const me = m.p.find((p) => p.id === s.me?.id);
    if (me) this.pred.reconcile(me, lobbySolid);
    for (const ev of m.ev) {
      if (!('by' in ev)) continue;
      const r = s.roleOf(ev.by);
      if (!r) continue;
      if (ev.k === 'emote') { this.view(r).doEmote(ev.e); this.app.game.audio.play('emote'); }
      if (ev.k === 'say') { this.view(r).speak(ev.text); this.app.game.audio.play('join'); }
    }
  }

  private myReady() { const s = this.app.session; return !!s.players.find((p) => p.id === s.me?.id)?.ready; }
  private toggleReady() {
    const v = !this.myReady();
    this.app.session.net.send({ t: 'ready', v });
    this.app.game.audio.play(v ? 'ready' : 'click');
  }

  update(dt: number) {
    this.t += dt;
    this.snow.update(dt);
    const { game, session } = this.app;
    const inp = game.input;
    if (!session.me) return;
    this.alpha = this.pred.update(dt, inp.axis(), lobbySolid);
    for (let i = 0; i < 4; i++) if (inp.wasPressed('Digit' + (i + 1))) session.net.send({ t: 'emote', e: i });
    if (inp.wasPressed('KeyR', 'Enter')) this.toggleReady();
    if (this.copied > 0) this.copied -= dt;

    for (const p of this.last) {
      const v = this.view(p.role);
      if (p.id === session.me.id) {
        const d = this.pred.display(this.alpha);
        v.x = d.x; v.y = d.y; v.setFacing(this.pred.pos.facing); v.st.moving = this.pred.moving;
      } else {
        const ip = this.interp.get(p.id) ?? p;
        v.x = ip.x; v.y = ip.y; v.setFacing(ip.f); v.st.moving = !!ip.m;
      }
      if (v.update(dt) && p.id === session.me.id) game.audio.play('step');
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    const { game, session } = this.app;
    const ui = game.ui;
    drawLobbyBg(ctx);

    // room code painted on the wooden sign
    const sg = LOBBY_SIGN;
    text(ctx, 'SOBA', sg.x, sg.y - 20, { size: 1, color: '#f6deb0' }, 'center');
    text(ctx, session.code || '....', sg.x + 2, sg.y - 8, { size: 4, color: '#3a1e08', spacing: 2 }, 'center');
    text(ctx, session.code || '....', sg.x, sg.y - 10, { size: 4, color: '#fff3d6', spacing: 2 }, 'center');

    // players sorted by depth
    const vs = [...this.views.values()].filter((v) => session.players.some((p) => p.role === v.role)).sort((a, b) => a.y - b.y);
    for (const v of vs) {
      const info = session.playerByRole(v.role);
      if (info && !info.connected) ctx.globalAlpha = 0.4;
      v.draw(ctx, { name: true, you: info?.id === session.me?.id, ready: info?.ready });
      ctx.globalAlpha = 1;
    }
    this.snow.draw(ctx);

    // ---- top-left room panel
    panel(ctx, 14, 14, 300, 150, 'navy');
    text(ctx, 'SOBA', 34, 32, { size: 2, color: C.ice });
    text(ctx, session.code, 104, 28, { size: 3, color: C.gold, outline: C.navyD, spacing: 2 });
    (['david', 'nemanja'] as Role[]).forEach((r, i) => {
      const y = 70 + i * 40;
      const p = session.playerByRole(r);
      pixRect(ctx, 30, y, 268, 32, '#101c36', 3);
      ctx.fillStyle = !p ? '#55607a' : p.connected ? C.green : C.orange;
      ctx.fillRect(40, y + 12, 8, 8);
      text(ctx, roleName(r), 58, y + 9, { size: 2, color: p ? C.white : '#7f8aa6' });
      const status = !p ? 'CEKA SE...' : !p.connected ? 'OFFLINE' : p.ready ? 'READY' : 'NIJE READY';
      const col = !p ? '#7f8aa6' : p.ready ? C.green : C.iceL;
      text(ctx, status, 288, y + 12, { size: 1, color: col }, 'right');
      if (p && p.id === session.me?.id) text(ctx, '(TI)', 58 + (r === 'david' ? 84 : 112), y + 12, { size: 1, color: C.gold });
    });

    // ---- top-right buttons
    if (ui.button(ctx, this.copied > 0 ? 'KOPIRANO!' : 'KOPIRAJ LINK', 1000, 18, 264, 46, { color: 'ice', size: 2 })) {
      const url = `${location.origin}${location.pathname}?room=${session.code}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      this.copied = 1.6;
    }
    if (ui.button(ctx, 'NAPUSTI SOBU', 1000, 76, 264, 40, { color: 'navy', size: 2 })) { session.leave(); this.app.toMenu(); }

    // ---- status banner over the fence
    const both = session.players.length === 2 && session.players.every((p) => p.connected);
    const other = session.players.find((p) => p.id !== session.me?.id);
    let msg: string;
    if (!both) msg = other && !other.connected ? `${roleName(other.role)} SE DISKONEKTOVAO...` : `CEKAMO ${session.me?.role === 'david' ? 'NEMANJU' : 'DAVIDA'}... POSALJI MU KOD ${session.code}`;
    else if (this.myReady()) msg = other?.ready ? 'KRECEMO!' : `CEKAMO DA ${roleName(other!.role)} KLIKNE READY`;
    else msg = 'OBOJICA SU TU! KLIKNI READY';
    const bw = Math.min(900, msg.length * 12 + 60);
    pixRect(ctx, 640 - bw / 2, 344, bw, 34, 'rgba(11,20,40,0.72)', 4);
    text(ctx, msg, 640, 354, { size: 2, color: C.white }, 'center');

    // ---- level picker (bottom centre)
    const li = Math.max(0, levelIndex(session.levelId));
    const lv = LEVEL_ORDER[li];
    panel(ctx, 440, 616, 400, 92, 'navy');
    text(ctx, `NIVO ${lv.number}/${LEVEL_ORDER.length}`, 640, 632, { size: 1, color: lv.boss ? '#ff8a7a' : C.gold }, 'center');
    text(ctx, lv.name, 640, 650, { size: lv.name.length > 11 ? 2 : 3, color: C.white, outline: C.navyD }, 'center');
    text(ctx, lv.boss ? 'BOSS!' : lv.subtitle, 640, 680, { size: 1, color: lv.boss ? '#ff8a7a' : C.ice }, 'center');
    if (ui.button(ctx, '<', 452, 640, 44, 44, { color: 'ice', size: 3, disabled: li <= 0 })) session.net.send({ t: 'pickLevel', id: LEVEL_ORDER[li - 1].id });
    if (ui.button(ctx, '>', 784, 640, 44, 44, { color: 'ice', size: 3, disabled: li >= session.unlocked || li + 1 >= LEVEL_ORDER.length })) session.net.send({ t: 'pickLevel', id: LEVEL_ORDER[li + 1].id });
    if (li + 1 < LEVEL_ORDER.length && li >= session.unlocked) text(ctx, 'PREDJI OVAJ ZA SLEDECI', 640, 694, { size: 1, color: 'rgba(223,243,255,0.6)' }, 'center');

    // ---- bottom: controls + READY
    panel(ctx, 14, 626, 404, 82, 'dark');
    text(ctx, 'WASD  HODAJ PO LOBIJU', 34, 644, { size: 2, color: C.iceL });
    text(ctx, '1-4   EMOTE: ' + EMOTES.join(' '), 34, 668, { size: 1, color: C.ice });
    text(ctx, 'R     READY   M  ZVUK', 34, 686, { size: 1, color: C.ice });
    const ready = this.myReady();
    const pulse = !ready && both ? 1 + Math.sin(this.t * 6) * 0.03 : 1;
    const bw2 = 250 * pulse, bh = 70 * pulse;
    if (ui.button(ctx, ready ? 'READY!' : 'READY', 1264 - 250 - (bw2 - 250) / 2, 636 - (bh - 70) / 2, bw2, bh, { color: ready ? 'green' : 'gold', size: 4 })) this.toggleReady();
    if (ready) text(ctx, 'KLIKNI OPET ZA OTKAZ', 1139, 616, { size: 1, color: C.white, outline: C.navyD }, 'center');
  }
}
