import type { BossKind } from './protocol.ts';

/** Boss data shared by server (rules) and client (names, art prefixes). */
export interface BossDef {
  type: BossKind;
  name: string;
  title: string;
  /** camera photo damage by quality: [far / weak, medium / good, close / perfect] */
  photoDamage: [number, number, number];
  sprite: string;
}
export const BOSS_DEFS: Record<BossKind, BossDef> = {
  hrana: { type: 'hrana', name: 'STUDENTSKA HRANA', title: 'KRALJICA SLOPA', photoDamage: [0, 1, 1], sprite: 'hrana' },
  sonja: { type: 'sonja', name: 'SONJA KUKMAN', title: 'STROGA PROFESORKA', photoDamage: [0, 1, 1], sprite: 'sonja' },
  branka: { type: 'branka', name: 'BRANKA', title: 'SEFICA HAOSA', photoDamage: [0, 1, 3], sprite: 'branka' },
  collector: { type: 'collector', name: 'THE COLLECTOR', title: 'KAMATA UVEK STIGNE', photoDamage: [0, 1, 3], sprite: 'collector' },
};

/** Collector attack labels (money is dangerous, not a reward) */
export const COLLECTOR_BILLS = ['TAX', 'RENT', 'INTEREST', 'FEE', 'LATE FEE', 'SERVICE FEE'];
