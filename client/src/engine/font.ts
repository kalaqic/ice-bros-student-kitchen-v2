/**
 * Tiny 5x7 bitmap pixel font (original glyphs) so all text matches the chunky arcade
 * lettering of the concept art without relying on web fonts. Text is rendered into
 * cached offscreen canvases.
 */
const G: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  ';': ['..', '.#', '..', '..', '..', '.#', '#.'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  '#': ['.#.#.', '#####', '.#.#.', '.#.#.', '.#.#.', '#####', '.#.#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '@': ['.....', '.#.#.', '#####', '#####', '.###.', '..#..', '.....'], // heart
  '^': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '.....'], // arrow up
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'],
  '[': ['##', '#.', '#.', '#.', '#.', '#.', '##'],
  ']': ['##', '.#', '.#', '.#', '.#', '.#', '##'],
};
const MAP: Record<string, string> = { 'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'DJ', '♥': '@' };

export function normalize(s: string): string {
  let out = '';
  for (const ch of s.toUpperCase()) out += MAP[ch] ?? ch;
  return out;
}
const width = (ch: string) => (ch === ' ' ? 3 : (G[ch]?.[0].length ?? 3));

export interface TextStyle {
  size?: number; // pixels per font dot
  color?: string;
  outline?: string | null;
  shadow?: string | null;
  spacing?: number;
}

const cache = new Map<string, HTMLCanvasElement>();

export function measure(text: string, size = 2, spacing = 1): number {
  const s = normalize(text);
  let w = 0;
  for (const ch of s) w += width(ch) + spacing;
  return Math.max(0, w - spacing) * size;
}

function render(text: string, st: Required<TextStyle>): HTMLCanvasElement {
  const key = `${text}|${st.size}|${st.color}|${st.outline}|${st.shadow}|${st.spacing}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = normalize(text);
  const k = st.size;
  const pad = st.outline ? 1 : 0;
  const shadowH = st.shadow ? 1 : 0;
  const wDots = measure(s, 1, st.spacing) + pad * 2;
  const hDots = 7 + pad * 2 + shadowH;
  const c = document.createElement('canvas');
  c.width = Math.max(1, wDots * k);
  c.height = hDots * k;
  const g = c.getContext('2d')!;
  const dots: [number, number][] = [];
  let cx = pad;
  for (const ch of s) {
    const gl = G[ch];
    if (gl) gl.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') dots.push([cx + x, pad + y]); });
    cx += width(ch) + st.spacing;
  }
  if (st.shadow) { g.fillStyle = st.shadow; for (const [x, y] of dots) g.fillRect(x * k, (y + 1 + (pad ? 1 : 0)) * k, k, k); }
  if (st.outline) {
    g.fillStyle = st.outline;
    for (const [x, y] of dots) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) g.fillRect((x + ox) * k, (y + oy) * k, k, k);
  }
  g.fillStyle = st.color;
  for (const [x, y] of dots) g.fillRect(x * k, y * k, k, k);
  if (cache.size > 800) cache.clear();
  cache.set(key, c);
  return c;
}

export type Align = 'left' | 'center' | 'right';

/** Draw pixel text. (x, y) is the top of the text; align applies horizontally. */
export function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, style: TextStyle = {}, align: Align = 'left') {
  const st: Required<TextStyle> = {
    size: style.size ?? 2, color: style.color ?? '#ffffff', outline: style.outline ?? null,
    shadow: style.shadow ?? null, spacing: style.spacing ?? 1,
  };
  const c = render(str, st);
  const off = st.outline ? st.size : 0;
  let dx = x - off;
  if (align === 'center') dx = x - c.width / 2;
  else if (align === 'right') dx = x - c.width + off;
  ctx.drawImage(c, Math.round(dx), Math.round(y - off));
}

/** Word-wrap into lines that fit maxWidth at the given size. */
export function wrap(str: string, maxWidth: number, size = 2): string[] {
  const words = normalize(str).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (measure(t, size) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
