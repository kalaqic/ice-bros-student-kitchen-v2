/**
 * Boss data for future levels. Nothing here is wired into Level 1 yet; the server's
 * entity system is built so a boss is "an enemy with phases + attack patterns + quotes".
 */
export interface BossAttack {
  id: string;
  kind: 'projectile' | 'shout' | 'summon' | 'charge';
  cooldownMs: number;
  /** text shown in a speech bubble / thrown as a projectile */
  quotes?: string[];
}
export interface BossDef {
  id: string;
  name: string;
  hp: number; // hits with stunned windows, non-lethal theme: you "win the argument"
  phases: { hpBelow: number; attacks: string[] }[];
  attacks: BossAttack[];
}

export const BOSSES: Record<string, BossDef> = {
  nemanjasDad: {
    id: 'nemanjasDad',
    name: 'NEMANJIN TATA',
    hp: 6,
    phases: [
      { hpBelow: 6, attacks: ['motivation'] },
      { hpBelow: 3, attacks: ['motivation', 'comparison'] },
    ],
    attacks: [
      { id: 'motivation', kind: 'shout', cooldownMs: 2600, quotes: ['SVE SE MOZE KAD SE HOCE', 'NEMANJA NADJI POSAO'] },
      { id: 'comparison', kind: 'projectile', cooldownMs: 1800, quotes: ['A NEMANJA KAKO DAVID MOZE'] },
    ],
  },
  professor: {
    id: 'professor',
    name: 'PROFESOR',
    hp: 8,
    phases: [
      { hpBelow: 8, attacks: ['papers'] },
      { hpBelow: 4, attacks: ['papers', 'marketQuestion', 'money'] },
    ],
    attacks: [
      { id: 'papers', kind: 'projectile', cooldownMs: 1400, quotes: ['TRZISNI NACRT 8. POGLAVLJE'] },
      { id: 'marketQuestion', kind: 'shout', cooldownMs: 3000, quotes: ['KOJA JE MARZA PRIHVATLJIVA NA TRZISTU'] },
      { id: 'money', kind: 'summon', cooldownMs: 5000 },
    ],
  },
};
