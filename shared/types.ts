export type Role = 'david' | 'nemanja';
export const ROLES: Role[] = ['david', 'nemanja'];
export const otherRole = (r: Role): Role => (r === 'david' ? 'nemanja' : 'david');
export const roleName = (r: Role) => (r === 'david' ? 'DAVID' : 'NEMANJA');

/** 0 = right, 1 = down, 2 = left, 3 = up */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: { x: number; y: number }[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

export type Phase = 'lobby' | 'level' | 'complete';
