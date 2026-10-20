import { img } from '../engine/assets.ts';

/** Draw the snowy lobby art so it covers the 1280x720 view (same mapping as shared/lobby.ts). */
export function drawLobbyBg(ctx: CanvasRenderingContext2D) {
  const im = img.lobby;
  const s = 1280 / im.width;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, 0, -24, 1280, im.height * s);
  ctx.imageSmoothingEnabled = false;
}

export function drawImageFit(ctx: CanvasRenderingContext2D, im: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number, smooth = true) {
  const s = Math.min(maxW / im.width, maxH / im.height);
  const w = im.width * s, h = im.height * s;
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(im, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
  ctx.imageSmoothingEnabled = false;
}
