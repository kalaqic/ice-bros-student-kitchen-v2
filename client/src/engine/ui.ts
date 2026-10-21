import { measure, text, type TextStyle } from './font.ts';
import type { Input } from './input.ts';

export const C = {
  navy: '#16264a', navyD: '#0b1428', navyL: '#2a4478', ink: '#0d1830',
  ice: '#8fd0f5', iceL: '#dff3ff', iceD: '#3f7fc4', white: '#ffffff', snow: '#f4fbff',
  gold: '#ffd34d', goldD: '#c98a12', orange: '#ff9a2e', red: '#e2463e', green: '#5fd068', greenD: '#2c8a3c',
  wood: '#8a5a2b', woodL: '#c08550', woodD: '#4a2a10', grey: '#8a9ab8',
  david: '#3d6fd8', nemanja: '#e8e8e8',
};

/** Chamfered pixel rectangle (corners cut by `cut` px). */
export function pixRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, cut = 3) {
  ctx.fillStyle = fill;
  for (let i = 0; i < cut; i++) {
    const inset = cut - i;
    ctx.fillRect(x + inset, y + i, w - inset * 2, 1);
    ctx.fillRect(x + inset, y + h - 1 - i, w - inset * 2, 1);
  }
  ctx.fillRect(x, y + cut, w, h - cut * 2);
}

export type PanelStyle = 'navy' | 'ice' | 'wood' | 'dark';

/** Concept-art style panel: dark outline, light frame, navy body. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: PanelStyle = 'navy') {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const sets: Record<PanelStyle, [string, string, string, string]> = {
    navy: [C.navyD, C.iceL, C.navy, C.navyL],
    dark: [C.navyD, C.iceD, '#101c36', C.navy],
    ice: [C.navyD, C.white, C.iceL, '#ffffff'],
    wood: [C.woodD, C.woodL, C.wood, '#a8703c'],
  };
  const [outline, frame, body, hi] = sets[style];
  ctx.fillStyle = 'rgba(5,10,25,0.35)';
  pixRect(ctx, x + 4, y + 6, w, h, 'rgba(5,10,25,0.35)', 6);
  pixRect(ctx, x, y, w, h, outline, 6);
  pixRect(ctx, x + 3, y + 3, w - 6, h - 6, frame, 4);
  pixRect(ctx, x + 6, y + 6, w - 12, h - 12, body, 3);
  ctx.fillStyle = hi;
  ctx.fillRect(x + 9, y + 7, w - 18, 2);
  if (style === 'wood') {
    ctx.fillStyle = 'rgba(74,42,16,0.35)';
    for (let yy = y + 18; yy < y + h - 10; yy += 12) ctx.fillRect(x + 8, yy, w - 16, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 2, w - 12, 4); // snow cap
  }
}

/** Title tag like "DAVID" / "NEMANJA" plates on the concept sheet. */
export function tag(ctx: CanvasRenderingContext2D, label: string, cx: number, y: number, size = 3, bg = C.navy, fg = C.white) {
  const w = measure(label, size) + size * 8;
  const h = 7 * size + size * 6;
  const x = Math.round(cx - w / 2);
  pixRect(ctx, x - 3, y - 3, w + 6, h + 6, C.navyD, 4);
  pixRect(ctx, x, y, w, h, C.iceL, 3);
  pixRect(ctx, x + 3, y + 3, w - 6, h - 6, bg, 2);
  text(ctx, label, cx, y + size * 3, { size, color: fg, shadow: 'rgba(0,0,0,0.45)' }, 'center');
}

export interface ButtonOpts {
  color?: 'ice' | 'gold' | 'green' | 'red' | 'navy';
  size?: number;
  disabled?: boolean;
  selected?: boolean;
  hotkey?: string;
}
const BTN: Record<NonNullable<ButtonOpts['color']>, [string, string, string]> = {
  ice: ['#9fdcff', '#5aa8e0', C.ink],
  gold: ['#ffd34d', '#d08a10', C.ink],
  green: ['#7fe08a', '#2f9a44', C.ink],
  red: ['#ff7a6e', '#b73228', C.white],
  navy: ['#2d4b86', '#17284e', C.white],
};

export class UI {
  hot: string | null = null;
  enabled = true;
  constructor(private input: Input, private onClick: () => void) {}

  begin() { this.hot = null; }

  hit(x: number, y: number, w: number, h: number) {
    if (!this.enabled) return false;
    const m = this.input.mouse;
    return m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
  }

  /** Immediate-mode button. Returns true on click this frame. */
  button(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
    const [face, depth, ink] = BTN[o.color ?? 'ice'];
    const over = this.enabled && !o.disabled && this.hit(x, y, w, h);
    if (over) this.hot = label;
    const pressed = over && this.input.mouse.down;
    const dy = pressed ? 3 : 0;
    const d = 5;
    pixRect(ctx, x - 3, y - 3 + dy, w + 6, h + 6 - dy, C.navyD, 5);
    pixRect(ctx, x, y + dy, w, h - dy, o.disabled ? '#5a6a88' : depth, 4);
    pixRect(ctx, x, y + dy, w, h - d, o.disabled ? '#8d9ab3' : over ? lighten(face) : face, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 6, y + dy + 4, w - 12, 3);
    if (o.selected) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
      ctx.strokeRect(x - 7, y - 7, w + 14, h + 14);
    }
    const size = o.size ?? 3;
    const st: TextStyle = { size, color: o.disabled ? '#dfe6f2' : ink, shadow: ink === C.white ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)' };
    text(ctx, label, x + w / 2, y + dy + (h - d) / 2 - (7 * size) / 2, st, 'center');
    if (o.hotkey) text(ctx, o.hotkey, x + w - 8, y + dy + 6, { size: 1, color: ink }, 'right');
    const clicked = over && this.input.mouse.clicked;
    if (clicked) { this.onClick(); this.input.mouse.clicked = false; }
    return clicked;
  }

  end() { this.input.setCursor(this.hot ? 'pointer' : 'default'); }
}

export function lighten(hex: string, amt = 0.18): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

/** Speech bubble with pixel tail, centred above (cx, bottom). */
export function bubble(ctx: CanvasRenderingContext2D, lines: string[], cx: number, bottom: number, alpha = 1, color = C.ink, bg = C.white) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = 2;
  const w = Math.max(...lines.map((l) => measure(l, size))) + 16;
  const h = lines.length * 18 + 10;
  const x = Math.round(Math.min(Math.max(cx - w / 2, 4), 1276 - w));
  const y = Math.round(bottom - h - 8);
  pixRect(ctx, x - 2, y - 2, w + 4, h + 4, C.navyD, 4);
  pixRect(ctx, x, y, w, h, bg, 3);
  ctx.fillStyle = C.navyD;
  const tx = Math.round(Math.min(Math.max(cx, x + 10), x + w - 10));
  ctx.fillRect(tx - 5, y + h, 10, 4); ctx.fillRect(tx - 3, y + h + 4, 6, 3); ctx.fillRect(tx - 1, y + h + 7, 2, 2);
  ctx.fillStyle = bg;
  ctx.fillRect(tx - 3, y + h - 2, 6, 4); ctx.fillRect(tx - 1, y + h + 2, 2, 3);
  lines.forEach((l, i) => text(ctx, l, x + w / 2, y + 7 + i * 18, { size, color }, 'center'));
  ctx.restore();
}

/** Small progress ring (used for station charge, revive, camera cooldown). */
export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: number, color: string, back = 'rgba(11,20,40,0.6)') {
  ctx.lineWidth = 5;
  ctx.strokeStyle = back;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, f))); ctx.stroke();
}
