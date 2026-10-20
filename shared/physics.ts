import { DT, HIT_HH, HIT_HW, PLAYER_SPEED, SLOW_FACTOR, TILE } from './constants.ts';
import type { Dir } from './types.ts';

/** Returns true when the world point is blocked. */
export type SolidFn = (x: number, y: number) => boolean;

export function boxBlocked(x: number, y: number, solid: SolidFn, hw = HIT_HW, hh = HIT_HH): boolean {
  return (
    solid(x - hw, y - hh) || solid(x + hw, y - hh) || solid(x - hw, y + hh) || solid(x + hw, y + hh) ||
    solid(x, y - hh) || solid(x, y + hh) || solid(x - hw, y) || solid(x + hw, y)
  );
}

/**
 * Move an axis-aligned feet box, sliding along walls and nudging around corners so
 * 1-tile corridors feel forgiving (classic grid-arcade feel).
 */
export function moveBox(x: number, y: number, dx: number, dy: number, solid: SolidFn): { x: number; y: number } {
  const step = 2;
  // X axis
  if (dx !== 0) {
    let remaining = dx;
    while (Math.abs(remaining) > 1e-6) {
      const s = Math.sign(remaining) * Math.min(step, Math.abs(remaining));
      if (!boxBlocked(x + s, y, solid)) { x += s; remaining -= s; continue; }
      // corner assist: try sliding vertically toward a free lane
      const nudged = nudge(x + s, y, 'y', solid);
      if (nudged !== null && dy === 0) {
        const ny = y + Math.sign(nudged - y) * Math.min(Math.abs(nudged - y), Math.abs(remaining));
        if (!boxBlocked(x, ny, solid)) y = ny;
      }
      break;
    }
  }
  if (dy !== 0) {
    let remaining = dy;
    while (Math.abs(remaining) > 1e-6) {
      const s = Math.sign(remaining) * Math.min(step, Math.abs(remaining));
      if (!boxBlocked(x, y + s, solid)) { y += s; remaining -= s; continue; }
      const nudged = nudge(x, y + s, 'x', solid);
      if (nudged !== null && dx === 0) {
        const nx = x + Math.sign(nudged - x) * Math.min(Math.abs(nudged - x), Math.abs(remaining));
        if (!boxBlocked(nx, y, solid)) x = nx;
      }
      break;
    }
  }
  return { x, y };
}

function nudge(x: number, y: number, axis: 'x' | 'y', solid: SolidFn): number | null {
  const max = 16;
  for (let k = 2; k <= max; k += 2) {
    for (const sgn of [1, -1]) {
      const nx = axis === 'x' ? x + sgn * k : x;
      const ny = axis === 'y' ? y + sgn * k : y;
      if (!boxBlocked(nx, ny, solid)) return axis === 'x' ? nx : ny;
    }
  }
  return null;
}

export interface MoveInput { dx: number; dy: number }

/** One fixed simulation step of player movement (used by server and client prediction). */
export function stepPlayer(
  pos: { x: number; y: number; facing: Dir },
  input: MoveInput,
  canMove: boolean,
  slowed: boolean,
  solid: SolidFn,
): void {
  let { dx, dy } = input;
  if (dx !== 0 || dy !== 0) pos.facing = facingFrom(dx, dy, pos.facing);
  if (!canMove || (dx === 0 && dy === 0)) return;
  const len = Math.hypot(dx, dy) || 1;
  const sp = PLAYER_SPEED * (slowed ? SLOW_FACTOR : 1) * DT;
  const r = moveBox(pos.x, pos.y, (dx / len) * sp, (dy / len) * sp, solid);
  pos.x = r.x; pos.y = r.y;
}

export function facingFrom(dx: number, dy: number, prev: Dir): Dir {
  if (dx !== 0 && dy !== 0) {
    // keep the previous axis if it is still part of the diagonal
    if ((prev === 0 && dx > 0) || (prev === 2 && dx < 0) || (prev === 1 && dy > 0) || (prev === 3 && dy < 0)) return prev;
  }
  if (dx > 0) return 0;
  if (dx < 0) return 2;
  if (dy > 0) return 1;
  return 3;
}

export const tileOf = (v: number) => Math.floor(v / TILE);
export const tileCenter = (t: number) => t * TILE + TILE / 2;
