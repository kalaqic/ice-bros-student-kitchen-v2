import { text } from './font.ts';

export interface Particle {
  x: number; y: number; vx: number; vy: number; g: number; drag: number;
  life: number; max: number; size: number; color: string; shape: 'sq' | 'star' | 'shard' | 'ring' | 'heart';
  rot: number; vr: number; grow: number; front: boolean;
}

/** Lightweight particle + floating text system (world coords). */
export class Fx {
  parts: Particle[] = [];
  floats: { x: number; y: number; text: string; color: string; life: number; max: number; size: number }[] = [];

  add(p: Partial<Particle> & { x: number; y: number }) {
    const max = p.max ?? p.life ?? 0.6;
    this.parts.push({
      vx: 0, vy: 0, g: 0, drag: 0, size: 4, color: '#fff', shape: 'sq', rot: 0, vr: 0, grow: 0, front: true,
      ...p, life: p.life ?? max, max,
    });
  }
  burst(x: number, y: number, n: number, o: Partial<Particle> & { speed?: number; spread?: number; angle?: number; colors?: string[] }) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const s = (o.speed ?? 120) * (0.4 + Math.random() * 0.8);
      this.add({
        ...o, x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color: o.colors ? o.colors[i % o.colors.length] : o.color, max: (o.max ?? 0.6) * (0.7 + Math.random() * 0.6),
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
      });
    }
  }
  float(x: number, y: number, txt: string, color = '#fff', size = 2, life = 1.1) {
    this.floats.push({ x, y, text: txt, color, life, max: life, size });
  }
  update(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.size += p.grow * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) { f.life -= dt; f.y -= 32 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
  }
  draw(ctx: CanvasRenderingContext2D, front: boolean) {
    for (const p of this.parts) {
      if (p.front !== front) continue;
      const a = Math.min(1, (p.life / p.max) * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      const s = Math.max(1, p.size);
      switch (p.shape) {
        case 'sq': ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s)); break;
        case 'shard':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); ctx.moveTo(-s, -s / 2); ctx.lineTo(s, 0); ctx.lineTo(-s / 2, s); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-s / 2, -s / 4, s / 2, s / 4);
          ctx.restore(); break;
        case 'star': drawStar(ctx, p.x, p.y, s, p.rot); break;
        case 'ring': ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.stroke(); break;
        case 'heart': text(ctx, '@', p.x, p.y, { size: Math.max(1, Math.round(s / 4)), color: p.color, outline: '#0b1428' }, 'center'); break;
      }
    }
    ctx.globalAlpha = 1;
    if (front) for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, (f.life / f.max) * 2.5);
      text(ctx, f.text, f.x, f.y, { size: f.size, color: f.color, outline: '#0b1428' }, 'center');
      ctx.globalAlpha = 1;
    }
  }
  clear() { this.parts = []; this.floats = []; }
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** Ambient snowfall for menus/lobby (screen coords). */
export class Snow {
  flakes = Array.from({ length: 70 }, () => this.make(true));
  private make(init: boolean) {
    return { x: Math.random() * 1280, y: init ? Math.random() * 720 : -10, v: 20 + Math.random() * 40, s: Math.random() < 0.3 ? 4 : 2, ph: Math.random() * 6 };
  }
  update(dt: number) {
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += f.v * dt; f.ph += dt; f.x += Math.sin(f.ph) * 12 * dt;
      if (f.y > 730) this.flakes[i] = this.make(false);
    }
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const f of this.flakes) ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
  }
}

export const ease = {
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};
