import type { Role } from './types.ts';

export type ItemKind = 'protein' | 'creatine' | 'mealprep' | 'pizza' | 'burger' | 'soda' | 'noodles';
export type Owner = Role | 'both';

export const ITEM_OWNER: Record<ItemKind, Owner> = {
  protein: 'david', creatine: 'david', mealprep: 'david',
  pizza: 'nemanja', burger: 'nemanja', soda: 'nemanja',
  noodles: 'both',
};

export const ITEM_LABEL: Record<ItemKind, string> = {
  protein: 'PROTEIN', creatine: 'KREATIN', mealprep: 'MEAL PREP',
  pizza: 'PICA', burger: 'BURGER', soda: 'SOK',
  noodles: 'NUDLE',
};

/** Lines a player shouts when touching the other guy's food. */
export const DISGUST_LINES: Record<Role, string[]> = {
  david: ['BLJAK. GDE SU MAKROI?', 'OVO NEMA NI GRAM PROTEINA', 'MOJ TRENER BI PLAKAO'],
  nemanja: ['BLJAK. GDE JE BURGER?', 'TO JE HRANA ZA KOZE', 'KREATIN? JA JEDEM PICU'],
};
export const COLLECT_LINES: Record<Role, string[]> = {
  david: ['+ GAINZ', 'MAKROI OK', 'CISTO!'],
  nemanja: ['NJAM!', 'TO TREBA', 'CHEAT MEAL'],
};
