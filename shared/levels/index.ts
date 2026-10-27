import type { LevelDef } from '../level.ts';
import { CAMPAIGN } from './campaign.ts';
import { LEVEL1 } from './level1.ts';
import { EXTRA } from './extra.ts';

/** Campaign order: per stage the original levels, then the 3 extra (harder) ones, then the stage boss. */
function campaignOrder(): LevelDef[] {
  const all = [LEVEL1, ...CAMPAIGN];
  const out: LevelDef[] = [];
  for (const st of [1, 2, 3, 4]) {
    const lv = all.filter((l) => l.stage === st);
    out.push(...lv.filter((l) => !l.boss), ...(EXTRA[st] ?? []), ...lv.filter((l) => l.boss));
  }
  out.forEach((l, i) => { l.number = i + 1; });
  return out;
}
export const LEVEL_ORDER: LevelDef[] = campaignOrder();
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
  // already beaten levels stay replayable even if new levels were inserted before them
  return i === 0 || (i > 0 && (completed.includes(LEVEL_ORDER[i - 1].id) || completed.includes(id)));
}
/** "STAGE 2 - LEVEL 3" / "STAGE 2 - BOSS": position of a level inside its stage */
export function levelLabel(id: string): string {
  const L = LEVELS[id];
  if (!L) return '';
  if (L.boss) return `STAGE ${L.stage} - BOSS`;
  const i = stageLevels(L.stage).filter((l) => !l.boss).findIndex((l) => l.id === id);
  return `STAGE ${L.stage} - LEVEL ${i + 1}`;
}
export function completedStages(completed: string[]): number[] {
  return [1, 2, 3, 4].filter((n) => { const ls = stageLevels(n); return ls.length > 0 && completed.includes(ls[ls.length - 1].id); });
}
