import type { Role } from '../../../shared/types.ts';

/** two-character scenes from koncked_down.png: revive_<downed>_<i>, shake_<leftmost>_<i> */
function duoImages() {
  const o: Record<string, string> = {};
  for (const scene of ['revive', 'shake']) for (const who of ['david', 'nemanja']) for (let i = 0; i < 4; i++) o[`${scene}_${who}_${i}`] = `duo/${scene}_${who}_${i}.png`;
  return o as Record<`${'revive' | 'shake'}_${'david' | 'nemanja'}_${0 | 1 | 2 | 3}`, string>;
}

/** Branka frames from tools/extract_boss.py */
export const BOSS_ANIMS = { idle: 2, taunt: 2, cast: 4, stunned: 3, hurt: 3, enraged: 2, defeat: 4, attack: 1, fireball: 3 } as const;
export type BossAnim = keyof typeof BOSS_ANIMS;
function bossImages() {
  const o: Record<string, string> = {};
  for (const [k, n] of Object.entries(BOSS_ANIMS)) for (let i = 0; i < n; i++) o[`boss_${k}_${i}`] = `boss/${k}_${i}.png`;
  return o as Record<`boss_${BossAnim}_${0 | 1 | 2 | 3}`, string>;
}

const IMAGES = {
  lobby: 'ui/snowy_lobby.png', logo: 'ui/logo.png',
  portrait_david: 'ui/david_portrait.png', portrait_nemanja: 'ui/nemanja_portrait.png',
  heart: 'ui/heart.png', heart_empty: 'ui/heart_empty.png', camera: 'ui/camera.png',
  char_david: 'chars/david.png', char_nemanja: 'chars/nemanja.png',
  protein: 'items/protein.png', creatine: 'items/creatine.png', mealprep: 'items/mealprep.png',
  pizza: 'items/pizza.png', burger: 'items/burger.png', soda: 'items/soda.png', noodles: 'items/noodles.png',
  noodles_bowl: 'items/noodles_bowl.png', coffee: 'items/coffee.png', ice_block: 'items/ice_block.png',
  laptop: 'items/laptop.png', scarf: 'items/scarf.png',
  floor0: 'tiles/floor0.png', floor1: 'tiles/floor1.png', wall: 'tiles/wall.png', wall_cap: 'tiles/wall_cap.png',
  counter0: 'tiles/counter0.png', counter1: 'tiles/counter1.png', counter2: 'tiles/counter2.png', counter3: 'tiles/counter3.png',
  fridge: 'tiles/fridge.png', stove: 'tiles/stove.png', sink: 'tiles/sink.png', table: 'tiles/table.png',
  bookshelf: 'tiles/bookshelf.png', washer: 'tiles/washer.png', boss_carpet: 'tiles/boss_carpet.png',
  ...bossImages(),
  gate: 'tiles/gate.png', exit_closed: 'tiles/exit_closed.png', exit_open: 'tiles/exit_open.png',
  terminal_david: 'tiles/terminal_david.png', terminal_nemanja: 'tiles/terminal_nemanja.png',
  mold_0: 'enemies/mold_0.png', mold_1: 'enemies/mold_1.png', yogurt_0: 'enemies/yogurt_0.png', yogurt_1: 'enemies/yogurt_1.png',
  dishes_0: 'enemies/dishes_0.png', dishes_1: 'enemies/dishes_1.png',
  flash_0: 'fx/flash_0.png', flash_1: 'fx/flash_1.png', flash_2: 'fx/flash_2.png', flash_3: 'fx/flash_3.png',
  iceblast_0: 'fx/iceblast_0.png', iceblast_1: 'fx/iceblast_1.png', iceblast_2: 'fx/iceblast_2.png', iceblast_3: 'fx/iceblast_3.png',
  ...duoImages(),
  iceblock_0: 'fx/iceblock_0.png', iceblock_1: 'fx/iceblock_1.png', iceblock_2: 'fx/iceblock_2.png', iceblock_3: 'fx/iceblock_3.png',
} as const;
export type ImageKey = keyof typeof IMAGES;

export const img = {} as Record<ImageKey, HTMLImageElement>;

export type CharAnim = 'idle' | 'walk' | 'run' | 'photo' | 'ice' | 'coffee' | 'win' | 'ko' | 'down';
export interface CharMeta { cellW: number; cellH: number; anims: Record<CharAnim, number[]> }
/** Sprite strip layout produced by tools/extract_sprites*.py (loaded from chars/frames.json) */
export const CHAR = {} as Record<Role, CharMeta>;
export const charImage = (r: Role) => img[r === 'david' ? 'char_david' : 'char_nemanja'];

/** Draw one frame with its feet at (x, bottom). */
export function drawChar(ctx: CanvasRenderingContext2D, r: Role, anim: CharAnim, t: number, x: number, bottom: number, scale: number, flip = false) {
  const m = CHAR[r];
  const frames = m.anims[anim];
  const fi = frames[((t % frames.length) + frames.length) % frames.length];
  const w = m.cellW * scale, h = m.cellH * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(x, bottom);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(charImage(r), fi * m.cellW, 0, m.cellW, m.cellH, -w / 2, -h + 2 * scale, w, h);
  ctx.restore();
}

/** build id injected by esbuild - busts the browser cache whenever the game is rebuilt */
declare const __BUILD__: string;
const V = typeof __BUILD__ !== 'undefined' ? __BUILD__ : String(Date.now());

export async function loadAll(onProgress: (f: number) => void): Promise<void> {
  Object.assign(CHAR, await (await fetch('assets/chars/frames.json?v=' + V, { cache: 'no-store' })).json());
  const entries = Object.entries(IMAGES) as [ImageKey, string][];
  let done = 0;
  await Promise.all(entries.map(([k, src]) => new Promise<void>((res, rej) => {
    const im = new Image();
    im.onload = () => { img[k] = im; onProgress(++done / entries.length); res(); };
    im.onerror = () => rej(new Error('failed to load ' + src));
    im.src = 'assets/' + src + '?v=' + V;
  })));
}
