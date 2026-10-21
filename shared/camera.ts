/** Directional camera: a cone in front of the player. Quality depends on distance. */
export const CAM_RANGE = 270;
export const CAM_HALF_ANGLE = (52 * Math.PI) / 180;
export const CAM_CLOSE = 115;   // <= : PERFECT
export const CAM_MEDIUM = 195;  // <= : GOOD, beyond: WEAK
/** stun multiplier per quality (weak, good, perfect) for normal enemies */
export const CAM_STUN = [0.45, 0.75, 1.0];
export const CAM_QUALITY_LABEL = ['SLABA SLIKA', 'DOBRA SLIKA', 'SAVRSENA!'];

export function photoQuality(dist: number): 0 | 1 | 2 {
  return dist <= CAM_CLOSE ? 2 : dist <= CAM_MEDIUM ? 1 : 0;
}
/** returns distance if (tx, ty) is inside the cone from (ox, oy) facing angle `ang`, else -1 */
export function inCone(ox: number, oy: number, ang: number, tx: number, ty: number, range = CAM_RANGE, half = CAM_HALF_ANGLE): number {
  const dx = tx - ox, dy = ty - oy;
  const d = Math.hypot(dx, dy);
  if (d > range) return -1;
  if (d < 30) return d; // point blank always counts
  let a = Math.atan2(dy, dx) - ang;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return Math.abs(a) <= half ? d : -1;
}
