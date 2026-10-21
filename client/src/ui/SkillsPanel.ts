import { hasSp, img, sp } from '../engine/assets.ts';
import { text, wrap } from '../engine/font.ts';
import type { Overlay } from '../engine/Game.ts';
import { C, panel, pixRect } from '../engine/ui.ts';
import type { App } from '../main.ts';
import { SKILLS, SKILL_ORDER, type SkillId } from '../../../shared/skills.ts';
import { STAGES } from '../../../shared/stages.ts';
import { completedStages } from '../../../shared/levels/index.ts';
import { drawImageFit } from '../scenes/common.ts';

export function skillIcon(id: SkillId): HTMLImageElement | null {
  const key = SKILLS[id].icon;
  if (hasSp(key)) return sp(key);
  return (img as Record<string, HTMLImageElement>)[key] ?? null;
}

/** VESTINE: unlocked skills + stage progress */
export class SkillsPanel implements Overlay {
  constructor(private app: App) {}
  update() { if (this.app.game.input.wasPressed('Escape')) this.app.game.close(this); }
  render(ctx: CanvasRenderingContext2D) {
    const { game, session } = this.app;
    ctx.fillStyle = 'rgba(5,10,25,0.7)'; ctx.fillRect(0, 0, 1280, 720);
    const x = 250, y = 60, w = 780, h = 600;
    panel(ctx, x, y, w, h, 'navy');
    text(ctx, 'VESTINE', 640, y + 22, { size: 4, color: C.gold, outline: C.navyD }, 'center');
    const done = completedStages(session.completed);
    SKILL_ORDER.forEach((id, i) => {
      const s = SKILLS[id];
      const have = session.has(id);
      const ry = y + 80 + i * 100;
      pixRect(ctx, x + 30, ry, w - 60, 88, have ? '#1d3566' : '#121a2e', 4);
      ctx.globalAlpha = have ? 1 : 0.35;
      const icon = skillIcon(id);
      if (icon) drawImageFit(ctx, icon, x + 80, ry + 44, 60, 60);
      ctx.globalAlpha = 1;
      text(ctx, s.name, x + 130, ry + 14, { size: 3, color: have ? C.white : '#7f8aa6' });
      wrap(s.desc, 420, 1).forEach((l, k) => text(ctx, l, x + 130, ry + 46 + k * 12, { size: 1, color: have ? C.iceL : '#7f8aa6' }));
      const status = s.unlockStage === null ? 'POCETNA VESTINA' : have ? 'OTKLJUCANO' : `ZAKLJUCANO - PREDJI STAGE ${s.unlockStage}`;
      text(ctx, status, x + w - 50, ry + 18, { size: 1, color: have ? C.green : '#ff9a8e' }, 'right');
      if (s.passive) text(ctx, 'PASIVNA', x + w - 50, ry + 36, { size: 1, color: C.gold }, 'right');
    });
    text(ctx, 'STAGEOVI', x + 40, y + 494, { size: 1, color: C.ice });
    STAGES.forEach((st, i) => {
      const sx = x + 40 + i * 180;
      const ok = done.includes(st.n);
      pixRect(ctx, sx, y + 510, 168, 34, ok ? '#2c8a3c' : '#101c36', 3);
      text(ctx, `${st.n}. ${st.name}`.slice(0, 22), sx + 84, y + 516, { size: 1, color: C.white }, 'center');
      text(ctx, ok ? 'ZAVRSEN' : '-', sx + 84, y + 530, { size: 1, color: ok ? C.white : '#7f8aa6' }, 'center');
    });
    if (game.ui.button(ctx, 'ZATVORI', 640 - 100, y + h - 52, 200, 40, { color: 'ice', size: 2 })) game.close(this);
  }
}

/** big "SKILL UNLOCKED" card shown after a stage boss */
export class SkillUnlockedOverlay implements Overlay {
  private t = 0;
  constructor(private app: App, private id: SkillId) { app.game.audio.play('unlock'); }
  update(dt: number) {
    this.t += dt;
    const inp = this.app.game.input;
    if (this.t > 0.8 && (inp.mouse.clicked || inp.firstPressed)) this.app.game.close(this);
  }
  render(ctx: CanvasRenderingContext2D) {
    const s = SKILLS[this.id];
    const k = Math.min(1, this.t * 3);
    ctx.fillStyle = `rgba(5,10,25,${0.75 * k})`; ctx.fillRect(0, 0, 1280, 720);
    ctx.save(); ctx.translate(640, 330); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    for (let i = 0; i < 12; i++) {
      const a = this.t * 0.6 + (i * Math.PI) / 6;
      ctx.fillStyle = 'rgba(255,211,77,0.12)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 520, Math.sin(a) * 520); ctx.lineTo(Math.cos(a + 0.2) * 520, Math.sin(a + 0.2) * 520); ctx.fill();
    }
    panel(ctx, -280, -170, 560, 340, 'navy');
    text(ctx, 'SKILL UNLOCKED!', 0, -146, { size: 5, color: C.gold, outline: C.navyD, shadow: '#c98a12' }, 'center');
    const icon = skillIcon(this.id);
    if (icon) drawImageFit(ctx, icon, 0, -20, 110, 110);
    text(ctx, s.name, 0, 46, { size: 4, color: C.white, outline: C.navyD }, 'center');
    wrap(s.desc, 480, 2).forEach((l, i) => text(ctx, l, 0, 92 + i * 20, { size: 2, color: C.iceL }, 'center'));
    if (this.t > 0.8) text(ctx, 'KLIKNI ZA NASTAVAK', 0, 146, { size: 1, color: C.ice }, 'center');
    ctx.restore();
  }
}
