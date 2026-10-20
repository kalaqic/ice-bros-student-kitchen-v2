import type { LevelDef } from '../level.ts';
import { CAMPAIGN } from './campaign.ts';
import { LEVEL1 } from './level1.ts';

/** Campaign order. Asymmetric puzzles reuse the station/gate system, bosses use LevelDef.boss. */
export const LEVEL_ORDER: LevelDef[] = [LEVEL1, ...CAMPAIGN];
export const LEVELS: Record<string, LevelDef> = Object.fromEntries(LEVEL_ORDER.map((l) => [l.id, l]));
export const FIRST_LEVEL = 'level1';
export const levelIndex = (id: string) => LEVEL_ORDER.findIndex((l) => l.id === id);
