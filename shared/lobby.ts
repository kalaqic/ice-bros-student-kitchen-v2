import type { Role } from './types.ts';

/** Walkable floor of assets/snowy_lobby.png drawn to cover 1280x720 (feet positions). */
export const LOBBY_FLOOR: [number, number][] = [
  [150, 440], [1130, 440], [1180, 470], [1180, 560], [1150, 600], [1070, 615], [1050, 650],
  [960, 665], [870, 700], [830, 712], [450, 712], [400, 700], [300, 665], [220, 650],
  [200, 615], [120, 595], [100, 560], [100, 470],
];
export const LOBBY_SPAWNS: Record<Role, { x: number; y: number }> = {
  david: { x: 540, y: 560 },
  nemanja: { x: 740, y: 560 },
};
/** Wooden sign in the background art where the room code is painted. */
export const LOBBY_SIGN = { x: 640, y: 272, w: 210, h: 50 };

export function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const lobbySolid = (x: number, y: number) => !pointInPoly(x, y, LOBBY_FLOOR);
