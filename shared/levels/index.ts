import type { LevelDef } from '../level.ts';
import { CAMPAIGN } from './campaign.ts';
import { LEVEL1 } from './level1.ts';

/** Campaign order (stage numbers live on each level). */
export const LEVEL_ORDER: LevelDef[] = [LEVEL1, ...CAMPAIGN];
export const LEVELS: Record<string, LevelDef> = Object.fromEntries(LEVEL_ORDER.map((l) => [l.id, l]));
export const FIRST_LEVEL = 'level1';
export const levelIndex = (id: string) => LEVEL_ORDER.findIndex((l) => l.id === id);
/** last level of a stage = its boss; completing it completes the stage */
export const stageOfLevel = (id: string) => LEVELS[id]?.stage ?? 1;
export const stageLevels = (n: number) => LEVEL_ORDER.filter((l) => l.stage === n);
export const isStageFinal = (id: string) => { const L = LEVELS[id]; if (!L) return false; const ls = stageLevels(L.stage); return ls[ls.length - 1].id === id; };
/** a level is playable when it is the first one or the previous one has been completed */
export function levelUnlocked(id: string, completed: string[]): boolean {
  const i = levelIndex(id);
  return i === 0 || (i > 0 && completed.includes(LEVEL_ORDER[i - 1].id));
}
export function completedStages(completed: string[]): number[] {
  return [1, 2, 3, 4].filter((n) => { const ls = stageLevels(n); return ls.length > 0 && completed.includes(ls[ls.length - 1].id); });
}
