import { drawFit, img, placeholder, sp, spN, type ImageKey } from '../engine/assets.ts';
import { drawStar } from '../engine/fx.ts';
import { text } from '../engine/font.ts';
import { C } from '../engine/ui.ts';
import { TILE } from '../../../shared/constants.ts';
import { ENEMIES, PROJECTILE_FX } from '../../../shared/enemies.ts';
import { type LevelDef, STATION_CODES, levelCols, levelRows, tileAt } from '../../../shared/level.ts';
import type { BossSnap, EnemySnap } from '../../../shared/protocol.ts';
import { stageDef } from '../../../shared/stages.ts';
import { TASKS, TASK_BY_CODE } from '../../../shared/tasks.ts';

/** cover-crop an image into a cell (used for floor / wall tiles) */
function cover(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number, alignBottom = false) {
  const s = Math.max(w / im.width, h / im.height);
  const sw = w / s, sh = h / s;
  const sx = (im.width - sw) / 2, sy = alignBottom ? im.height - sh : (im.height - sh) / 2;
  g.drawImage(im, sx, sy, sw, sh, x, y, w, h);
}

const FURN = new Set(['C', 'F', 'S', 'K', 'T', 'H', 'W']);
const LEGACY: Record<string, ImageKey> = {
  C: 'counter0', F: 'fridge', S: 'stove', K: 'sink', T: 'table', L: 'terminal_david', A: 'terminal_nemanja', H: 'bookshelf', W: 'washer', X: 'boss_carpet',
};
const THEME_TINT: Record<string, string | null> = {
  kitchen: null, canteen: 'rgba(255,214,140,0.16)', dorm: 'rgba(200,140,80,0.20)', library: 'rgba(150,110,190,0.16)',
  laundry: 'rgba(90,180,255,0.16)', lab: 'rgba(120,230,170,0.16)', gym: 'rgba(255,150,80,0.15)', arcade: 'rgba(130,70,200,0.20)',
  office: 'rgba(200,60,60,0.16)', school: 'rgba(255,220,150,0.12)', kids: 'rgba(255,170,220,0.12)', city: 'rgba(90,110,160,0.18)',
};

/**
 * Pre-rendered static level art. Uses the stage skin from shared/stages.ts when its art exists
 * (stage floor/wall tiles + furniture props per map letter), otherwise the original procedural tiles.
 */
export function buildStaticLayer(L: LevelDef): HTMLCanvasElement {
  const cols = levelCols(L), rows = levelRows(L);
  const cv = document.createElement('canvas');
  cv.width = cols * TILE; cv.height = rows * TILE;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const skin = stageDef(L.stage).skin;
  const floors = skin.floors.map((k) => sp(k)).filter(Boolean) as HTMLImageElement[];
  const walls = skin.walls.map((k) => sp(k)).filter(Boolean) as HTMLImageElement[];
  const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const tint = THEME_TINT[L.theme];
  // ---- floor + walls
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const c = tileAt(L, tx, ty);
    const x = tx * TILE, y = ty * TILE;
    if (c === '#') {
      if (walls.length) {
        g.imageSmoothingEnabled = true;
        const wallBelow = ty + 1 < rows && tileAt(L, tx, ty + 1) === '#';
        cover(g, walls[hash(tx, ty) % walls.length], x, y, TILE, TILE, !wallBelow);
        g.fillStyle = 'rgba(10,20,40,0.25)'; g.fillRect(x, y, TILE, TILE);
        g.imageSmoothingEnabled = false;
      } else g.drawImage(img[ty > 0 && tileAt(L, tx, ty - 1) === '#' && ty < rows - 1 ? 'wall' : 'wall_cap'], x, y);
      continue;
    }
    if (floors.length) {
      g.imageSmoothingEnabled = true;
      cover(g, floors[(tx + ty * 3 + (hash(tx, ty) % 3 === 0 ? 1 : 0)) % floors.length], x, y, TILE, TILE);
      g.imageSmoothingEnabled = false;
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    } else {
      g.drawImage(img[(tx + ty) % 2 ? 'floor1' : 'floor0'], x, y);
      if (tint) { g.fillStyle = tint; g.fillRect(x, y, TILE, TILE); }
    }
  }
  // ---- furniture / station clusters
  const seen = new Uint8Array(cols * rows);
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const c = tileAt(L, tx, ty);
    if (seen[ty * cols + tx] || !(FURN.has(c) || STATION_CODES.includes(c) || c === 'X')) continue;
    // flood the cluster of the same letter
    const q: [number, number][] = [[tx, ty]]; const cells: [number, number][] = [];
    seen[ty * cols + tx] = 1;
    while (q.length) {
      const [x, y] = q.shift()!; cells.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ny * cols + nx] || tileAt(L, nx, ny) !== c) continue;
        seen[ny * cols + nx] = 1; q.push([nx, ny]);
      }
    }
    const x0 = Math.min(...cells.map((p) => p[0])), x1 = Math.max(...cells.map((p) => p[0]));
    const y0 = Math.min(...cells.map((p) => p[1])), y1 = Math.max(...cells.map((p) => p[1]));
    const task = TASK_BY_CODE[c];
    let keys: string[] | undefined = task ? (TASKS[task].sprite ? [TASKS[task].sprite!] : undefined) : skin.props[c];
    if (c === 'X') keys = undefined;
    const ims = (keys ?? []).map((k) => sp(k)).filter(Boolean) as HTMLImageElement[];
    const rect = cells.length === (x1 - x0 + 1) * (y1 - y0 + 1);
    if (!ims.length || !rect) {
      for (const [x, y] of cells) {
        const key = c === 'C' ? (['counter0', 'counter1', 'counter2', 'counter3'] as ImageKey[])[hash(x, y) % 7 > 3 ? 0 : hash(x, y) % 4] : LEGACY[c];
        if (key) g.drawImage(img[key], x * TILE, y * TILE);
      }
      continue;
    }
    // underlay keeps the solid area readable, then one or more props stretched over the cluster
    const bx = x0 * TILE, by = y0 * TILE, bw = (x1 - x0 + 1) * TILE, bh = (y1 - y0 + 1) * TILE;
    g.fillStyle = 'rgba(16,28,54,0.28)'; g.fillRect(bx + 2, by + 4, bw - 4, bh - 4);
    const aspect = ims[0].width / ims[0].height;
    const n = Math.max(1, Math.round(bw / Math.max(TILE, bh * aspect)));
    g.imageSmoothingEnabled = true;
    for (let i = 0; i < n; i++) {
      const im = ims[(i + hash(x0, y0)) % ims.length];
      const pw = bw / n;
      const s = Math.min((pw + 6) / im.width, (bh + 12) / im.height);
      const dw = im.width * s, dh = im.height * s;
      g.drawImage(im, bx + pw * i + (pw - dw) / 2, by + bh - dh + 2, dw, dh);
    }
    g.imageSmoothingEnabled = false;
  }
  // ---- soft shadows under walls / furniture
  for (let ty = 0; ty < rows - 1; ty++) for (let tx = 0; tx < cols; tx++) {
    const c = tileAt(L, tx, ty), below = tileAt(L, tx, ty + 1);
    if ((FURN.has(c) || c === '#') && !FURN.has(below) && below !== '#') {
      g.fillStyle = 'rgba(30,60,110,0.20)'; g.fillRect(tx * TILE, (ty + 1) * TILE, TILE, 7);
    }
  }
  return cv;
}

// ------------------------------------------------------------------ enemies
/** generic enemy drawer: <sprite>_idle / _move / _attack / _frozen / _defeat, kids: _help / _happy */
export function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemySnap, t: number, moving: boolean) {
  const def = ENEMIES[e.ty];
  if (!def || e.s === 2) return;
  const x = Math.round(e.x), y = Math.round(e.y);
  const stunned = e.st > 0;
  const pre = def.sprite;
  let anim = moving ? 'move' : 'idle';
  if (e.s === 1) anim = 'frozen';
  else if (e.s === 3) anim = 'attack';
  else if (e.s === 4) anim = 'help';
  else if (e.s === 5) anim = 'happy';
  if (stunned) anim = 'idle';
  let key = `${pre}_${anim}`;
  if (!spN(key)) key = `${pre}_idle`;
  const n = spN(key);
  const fps = anim === 'move' ? 7 : anim === 'frozen' ? 2 : 4;
  const fi = anim === 'attack' ? Math.min(n - 1, Math.floor(t * 6) % Math.max(1, n)) : Math.floor(t * fps + e.i) % Math.max(1, n);
  ctx.fillStyle = 'rgba(20,40,80,0.28)';
  ctx.beginPath(); ctx.ellipse(x, y + 18, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
  const flip = e.d === 2;
  if (n) {
    const im = sp(key, fi)!;
    ctx.save();
    if (stunned) { ctx.translate(x, y + 20); ctx.rotate(Math.sin(t * 14) * 0.08); ctx.translate(-x, -(y + 20)); }
    // sprites face right on the sheets except kids/staff who face left-ish; flip by direction
    drawFit(ctx, im, key, x, y + 21, im.width, im.height, !flip ? false : true);
    ctx.restore();
  } else if (def.fallback) {
    const [a, b] = def.fallback as [ImageKey, ImageKey];
    const frame = stunned ? a : Math.floor(t * 4 + e.i) % 2 ? a : b;
    ctx.save(); ctx.translate(x, y + 20); if (flip) ctx.scale(-1, 1); ctx.drawImage(img[frame], -24, -48); ctx.restore();
  } else placeholder(ctx, key, x - 20, y - 30, 40, 50);
  if (e.s === 1) {
    ctx.fillStyle = 'rgba(190,232,255,0.25)'; ctx.fillRect(x - 22, y - 34, 44, 54);
    text(ctx, 'RAZBIJ LED!', x, y - 50, { size: 1, color: C.iceL, outline: C.navyD }, 'center');
  }
  if (stunned) {
    ctx.fillStyle = C.gold;
    for (let i = 0; i < 3; i++) {
      const ang = t * 4 + (i * Math.PI * 2) / 3;
      drawStar(ctx, x + Math.cos(ang) * 16, y - 42 + Math.sin(ang) * 5, 5, t * 5);
    }
  }
}

// ------------------------------------------------------------------ projectiles / hazards
export function drawProjectile(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, vx: number, vy: number, t: number) {
  const fx = PROJECTILE_FX[kind as keyof typeof PROJECTILE_FX];
  const key = fx?.sprite ?? kind;
  const n = spN(key);
  const im = n ? sp(key, Math.floor(t * 10) % Math.min(n, kind === 'fireball' ? 4 : n)) : null;
  const rot = fx?.spin ? t * 8 : Math.atan2(vy, vx);
  const size = (fx?.radius ?? 16) * 2.4;
  ctx.save();
  ctx.fillStyle = 'rgba(20,20,40,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 22, size * 0.3, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (im) {
    const s = size / Math.max(im.width, im.height);
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s);
    ctx.restore();
  } else placeholder(ctx, key, x - 12, y - 12, 24, 24);
}

const HAZ_ART: Record<string, { tele: string; active: string; label?: string; color: string }> = {
  sludge: { tele: 'fx_warn', active: 'fx_sauce_puddle', color: '#9ccf4a', label: 'SOS' },
  tornado: { tele: 'fx_tornado', active: 'fx_tornado', color: '#e8e8f0' },
  fmark: { tele: 'fx_warn', active: 'fx_fmark', color: '#ff4a4a' },
  slam: { tele: 'fx_hazard', active: 'fx_briefcase', color: '#ff4a4a' },
  audit: { tele: 'fx_hazard', active: 'fx_boom', color: '#ffb02e', label: 'REVIZIJA' },
  cashstorm: { tele: 'fx_cashstorm', active: 'fx_cashstorm', color: '#7fe08a' },
};

export function drawHazard(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, msToActive: number, msLeft: number, t: number) {
  const art = HAZ_ART[kind] ?? { tele: 'fx_warn', active: 'fx_warn', color: '#ff4a4a' };
  if (msToActive > 0) {
    // telegraph: pulsing marker that fills up
    const k = 1 - Math.min(1, msToActive / 1600);
    ctx.save();
    ctx.fillStyle = `rgba(255,60,40,${0.1 + k * 0.25})`;
    ctx.beginPath(); ctx.ellipse(x, y + 6, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = art.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * 20) * 0.3;
    ctx.beginPath(); ctx.ellipse(x, y + 6, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y + 6, r * k, r * 0.55 * k, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    if (kind === 'tornado' || kind === 'cashstorm') return;
    const n = spN(art.tele);
    if (n && r < 80) drawFit(ctx, sp(art.tele, Math.min(n - 1, Math.floor(k * n))), art.tele, x, y + 6 + r * 0.3, r * 2, r * 1.2);
    return;
  }
  if (kind === 'audit' || kind === 'fmark' || kind === 'slam') {
    const n = spN(art.active);
    if (n) drawFit(ctx, sp(art.active, Math.floor(t * 10) % n), art.active, x, y + 10, r * 2.2, r * 2.2);
    return;
  }
  const n = spN(art.active);
  const im = n ? sp(art.active, Math.floor(t * 8) % n) : null;
  ctx.globalAlpha = Math.min(1, msLeft / 500);
  if (kind === 'sludge') {
    ctx.fillStyle = 'rgba(140,190,60,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 6, r, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    drawFit(ctx, im, art.active, x, y + 6 + r * 0.45, r * 2.3, r * 1.3);
  } else drawFit(ctx, im, art.active, x, y + 24, r * 2.4, r * 2.8);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ generic bosses (Hrana / Sonja / Collector)
const BOSS_ART: Record<string, { size: [number, number]; foot: number; anim: (b: BossSnap) => string }> = {
  hrana: {
    size: [210, 110], foot: 44,
    anim: (b) => b.st === 'dead' ? 'hrana_defeat' : b.st === 'frozen' ? 'hrana_frozen' : b.st === 'summon' ? 'hrana_summon' : b.st === 'attack' ? 'hrana_attack' : b.st === 'move' ? 'hrana_move' : 'hrana_idle',
  },
  sonja: {
    size: [110, 104], foot: 22,
    anim: (b) => b.st === 'dead' ? 'sonja_defeat' : b.st === 'flash' ? 'sonja_flash' : b.st === 'storm' ? 'sonja_storm' : b.st === 'quiz' ? 'sonja_quiz'
      : b.st === 'summon' ? 'sonja_summon' : b.st === 'throw' ? 'sonja_quiz' : (b.st === 'hurt' || b.st === 'stunned' || b.hurt) ? 'sonja_hurt' : b.st === 'walk' ? 'sonja_walk' : 'sonja_idle',
  },
  collector: {
    size: [200, 180], foot: 56,
    anim: (b) => b.st === 'dead' ? 'collector_defeat' : (b.st === 'stunned' || b.hurt) ? 'collector_hurt' : b.st === 'cast' ? 'collector_cast' : b.st === 'throw' ? 'collector_throw'
      : b.st === 'taunt' ? 'collector_taunt' : b.enr ? 'collector_enraged' : 'collector_idle',
  },
};

export function drawBossGeneric(ctx: CanvasRenderingContext2D, b: BossSnap, t: number) {
  const art = BOSS_ART[b.type];
  if (!art) return;
  const key = art.anim(b);
  const n = spN(key);
  let fi = Math.floor(t * 5) % Math.max(1, n);
  if (b.st === 'dead' || key.endsWith('_hurt') || key.endsWith('_flash') || key.endsWith('_storm')) fi = Math.min(n - 1, Math.floor(b.sp * n));
  if (key === 'hrana_frozen') fi = Math.min(n - 1, 1 + Math.floor(t * 2) % 2);
  const footY = b.y + art.foot;
  ctx.fillStyle = 'rgba(30,10,30,0.3)';
  ctx.beginPath(); ctx.ellipse(b.x, footY - 2, art.size[0] * 0.38, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  if (b.hurt && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.6;
  const facingLeft = b.type === 'sonja' && Math.sin(t * 0.7) < 0 && b.st === 'walk';
  drawFit(ctx, n ? sp(key, fi) : null, key, b.x, footY, art.size[0], art.size[1], facingLeft);
  ctx.restore();
  if (b.st === 'stunned' || (b.hurt && b.type !== 'hrana')) {
    ctx.fillStyle = C.gold;
    for (let i = 0; i < 4; i++) { const a = t * 4 + (i * Math.PI) / 2; drawStar(ctx, b.x + Math.cos(a) * 34, footY - art.size[1] - 4 + Math.sin(a) * 7, 6, t * 5); }
  }
  if (b.type === 'hrana' && b.st !== 'dead') {
    // freeze meter: wall her in with ice
    const w = 120, fz = b.st === 'frozen' ? 1 : (b.fz ?? 0);
    ctx.fillStyle = 'rgba(11,20,40,0.7)'; ctx.fillRect(b.x - w / 2 - 2, footY + 6, w + 4, 10);
    ctx.fillStyle = b.st === 'frozen' ? '#dff3ff' : '#8fd0f5'; ctx.fillRect(b.x - w / 2, footY + 8, w * fz, 6);
    text(ctx, b.st === 'frozen' ? 'ZALEDJENA! RAZBIJ LED!' : 'LED OKO NJE', b.x, footY + 20, { size: 1, color: b.st === 'frozen' ? C.gold : C.iceL, outline: C.navyD }, 'center');
  }
}
