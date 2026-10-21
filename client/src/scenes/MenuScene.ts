import { drawChar, img } from '../engine/assets.ts';
import { text } from '../engine/font.ts';
import { Snow, ease } from '../engine/fx.ts';
import type { Scene } from '../engine/Game.ts';
import { C, panel, pixRect, tag } from '../engine/ui.ts';
import type { App } from '../main.ts';
import type { Role } from '../../../shared/types.ts';
import { drawImageFit, drawLobbyBg } from './common.ts';
import { Net } from '../net/Net.ts';
import { Session } from '../game/Session.ts';

const TRAITS: Record<Role, [string, string]> = {
  david: ['FITNES I DISCIPLINA', 'KOD + PROTEIN'],
  nemanja: ['GAMING ENTUZIJASTA', 'PICA RESAVA SVE'],
};

export class MenuScene implements Scene {
  private snow = new Snow();
  private t = 0;
  private mode: 'main' | 'join' | 'busy' = 'main';
  private code = '';
  private status = '';

  constructor(private app: App, resuming = false) {
    if (resuming) { this.mode = 'busy'; this.status = 'POVEZIVANJE NAZAD U SOBU...'; }
    try {
      const q = new URLSearchParams(location.search).get('room');
      if (q && !resuming) {
        this.mode = 'join'; this.code = q.toUpperCase().slice(0, 4);
        // we were in this room before (tab closed / crashed) - try to reclaim the slot right away
        if (Net.tokensFor(this.code).length && !app.session.error) setTimeout(() => void this.join(), 0);
      }
      const r = localStorage.getItem('icebros.role');
      if (r === 'david' || r === 'nemanja') app.session.wantedRole = r;
    } catch { /* ignore */ }
  }

  enter() {
    this.app.game.audio.music('menu');
    if (this.app.session.error) { this.status = this.app.session.error; this.mode = this.mode === 'busy' ? 'main' : this.mode; }
  }

  private pickRole(r: Role) {
    this.app.session.wantedRole = r;
    try { localStorage.setItem('icebros.role', r); } catch { /* ignore */ }
  }

  private async create() {
    const s = this.app.session;
    this.mode = 'busy'; this.status = 'PRAVIM SOBU...'; s.error = '';
    try { await s.net.connect(); s.net.send({ t: 'create', role: s.wantedRole, progress: Session.loadProgress() }); }
    catch { this.mode = 'main'; this.status = 'SERVER NIJE DOSTUPAN'; }
  }

  private async join() {
    const s = this.app.session;
    if (this.code.length < 4) { this.status = 'UNESI KOD SOBE (4 ZNAKA)'; return; }
    this.mode = 'busy'; this.status = 'ULAZIM U SOBU ' + this.code + '...'; s.error = '';
    try { await s.net.connect(); s.net.send({ t: 'join', code: this.code, role: s.wantedRole, tokens: Net.tokensFor(this.code), progress: Session.loadProgress() }); }
    catch { this.mode = 'join'; this.status = 'SERVER NIJE DOSTUPAN'; }
  }

  update(dt: number) {
    this.t += dt;
    this.snow.update(dt);
    const inp = this.app.game.input;
    const s = this.app.session;
    if (this.app.game.blocked) return;
    if (s.error && this.mode === 'busy') { this.mode = this.code ? 'join' : 'main'; this.status = s.error; s.error = ''; }
    if (this.mode === 'main') {
      if (inp.wasPressed('ArrowLeft', 'KeyA', 'Digit1')) this.pickRole('david');
      if (inp.wasPressed('ArrowRight', 'KeyD', 'Digit2')) this.pickRole('nemanja');
    }
    if (this.mode === 'join') {
      if (inp.wasPressed('ArrowLeft')) this.pickRole('david');
      if (inp.wasPressed('ArrowRight')) this.pickRole('nemanja');
      const add = (str: string) => {
        for (const ch of str.toUpperCase()) if (/[A-Z0-9]/.test(ch) && this.code.length < 4) this.code += ch;
      };
      for (const k of inp.typed) {
        if (k === '\b') this.code = this.code.slice(0, -1);
        else if (k === '\n') void this.join();
        else if (k.length === 1) add(k);
      }
      if (inp.pasted) add(inp.pasted.replace(/.*room=/i, ''));
      if (inp.wasPressed('Escape')) { this.mode = 'main'; this.status = ''; }
    } else if (this.mode === 'main' && inp.wasPressed('Enter')) void this.create();
  }

  render(ctx: CanvasRenderingContext2D) {
    const { game, session } = this.app;
    const ui = game.ui;
    drawLobbyBg(ctx);
    ctx.fillStyle = 'rgba(11,20,40,0.5)';
    ctx.fillRect(0, 0, 1280, 720);
    this.snow.draw(ctx);

    // logo + ribbon
    const pop = ease.outBack(Math.min(1, this.t * 1.6));
    ctx.save();
    ctx.translate(640, 112); ctx.scale(pop, pop);
    drawImageFit(ctx, img.logo, 0, Math.sin(this.t * 2) * 3, 360, 200);
    ctx.restore();
    tag(ctx, 'CO-OP PUZZLE GAME', 640, 216, 2);

    // character cards
    const roles: Role[] = ['david', 'nemanja'];
    roles.forEach((r, i) => {
      const cx = i === 0 ? 470 : 810;
      const x = cx - 140, y = 262, w = 280, h = 300;
      const sel = session.wantedRole === r;
      const over = this.mode !== 'busy' && ui.hit(x, y, w, h);
      if (over) ui.hot = 'card';
      if (over && game.input.mouse.clicked) { this.pickRole(r); game.audio.play('click'); }
      if (sel) {
        const glow = 0.5 + Math.sin(this.t * 4) * 0.25;
        pixRect(ctx, x - 9, y - 9, w + 18, h + 18, `rgba(255,211,77,${glow})`, 8);
      }
      panel(ctx, x, y, w, h, sel ? 'navy' : 'dark');
      // floor disc
      ctx.fillStyle = sel ? 'rgba(143,208,245,0.35)' : 'rgba(143,208,245,0.12)';
      ctx.beginPath(); ctx.ellipse(cx, y + 206, 70, 14, 0, 0, Math.PI * 2); ctx.fill();
      if (!sel) ctx.globalAlpha = 0.6;
      drawChar(ctx, r, sel ? 'walk' : 'idle', Math.floor(this.t * (sel ? 8 : 3)), cx, y + 212, 1.45, i === 1);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      tag(ctx, r === 'david' ? 'DAVID' : 'NEMANJA', cx, y + 222, 3, r === 'david' ? '#22408a' : '#1b1b22');
      text(ctx, TRAITS[r][0], cx, y + 266, { size: 1, color: C.iceL }, 'center');
      text(ctx, TRAITS[r][1], cx, y + 280, { size: 1, color: C.gold }, 'center');
      // item icons
      const icons = r === 'david' ? [img.protein, img.creatine, img.laptop] : [img.pizza, img.burger, img.soda];
      icons.forEach((ic, k) => drawImageFit(ctx, ic, x + 30 + k * 30, y + 30, 26, 26));
      if (sel) text(ctx, 'TI', x + w - 22, y + 20, { size: 2, color: C.gold, outline: C.navyD }, 'right');
    });
    text(ctx, '< A        IZABERI LIK        D >', 640, 574, { size: 1, color: C.iceL }, 'center');

    // actions
    if (this.mode === 'main') {
      if (ui.button(ctx, 'CREATE ROOM', 340, 598, 280, 62, { color: 'gold' })) void this.create();
      if (ui.button(ctx, 'JOIN ROOM', 660, 598, 280, 62, { color: 'ice' })) { this.mode = 'join'; this.status = ''; }
    } else if (this.mode === 'join') {
      panel(ctx, 300, 590, 330, 76, 'ice');
      text(ctx, 'KOD SOBE', 318, 604, { size: 1, color: C.navy });
      for (let i = 0; i < 4; i++) {
        const bx = 318 + i * 74, by = 618;
        pixRect(ctx, bx, by, 62, 38, C.navy, 3);
        const ch = this.code[i];
        if (ch) text(ctx, ch, bx + 31, by + 8, { size: 3, color: C.white }, 'center');
        else if (i === this.code.length && Math.floor(this.t * 2) % 2 === 0) { ctx.fillStyle = C.gold; ctx.fillRect(bx + 22, by + 28, 18, 4); }
      }
      if (ui.button(ctx, 'JOIN', 660, 598, 160, 62, { color: 'gold', disabled: this.code.length < 4 })) void this.join();
      if (ui.button(ctx, 'NAZAD', 840, 598, 140, 62, { color: 'navy', size: 2 })) { this.mode = 'main'; this.status = ''; }
    } else {
      panel(ctx, 400, 598, 480, 62, 'navy');
      const dots = '.'.repeat(1 + (Math.floor(this.t * 3) % 3));
      text(ctx, 'CEKAJ' + dots, 640, 621, { size: 2, color: C.iceL }, 'center');
    }
    if (this.status) text(ctx, this.status, 640, 684, { size: 2, color: this.status.includes('NE') || this.status.includes('PUN') ? '#ffb3a8' : C.iceL, outline: C.navyD }, 'center');
    text(ctx, 'PLAY TOGETHER IN YOUR BROWSER', 1268, 706, { size: 1, color: 'rgba(223,243,255,0.7)' }, 'right');
    if (ui.button(ctx, 'PODESAVANJA', 14, 14, 200, 44, { color: 'navy', size: 2 })) this.app.settings();
    if (ui.button(ctx, 'VESTINE', 14, 66, 200, 44, { color: 'navy', size: 2 })) this.app.skillsScreen();
    text(ctx, 'M = ZVUK ' + (game.audio.muted ? 'OFF' : 'ON'), 12, 706, { size: 1, color: 'rgba(223,243,255,0.7)' });
  }
}
