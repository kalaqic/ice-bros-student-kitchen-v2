/**
 * Enemy catalogue. Behaviour is composed from abilities so stages mix mechanics instead of
 * only scaling HP/speed. `sprite` is the stage asset prefix (<sprite>_idle/move/attack/frozen/defeat).
 */
export type AbilityKind =
  | 'flash'     // telegraphed camera flash in facing direction: stuns players in a short line
  | 'throw'     // ranged projectile at the nearest player
  | 'lock'      // touching it locks one of your skills for a while ("FALI VAM JEDAN PAPIR")
  | 'icebreak'  // smashes player ice around itself
  | 'dash'      // short burst of speed toward a nearby player
  | 'whistle'   // shout: slows players around it
  | 'debt';     // touch adds DEBT (slower + longer ability cooldowns)

export type ProjectileKind =
  | 'grease' | 'sauce' | 'noodle' | 'chunk' | 'test' | 'flashball' | 'fireball'
  | 'tax' | 'rent' | 'fee' | 'pastdue' | 'money' | 'debt' | 'key' | 'job' | 'policy';
export type ProjectileEffect = 'damage' | 'slow' | 'debt' | 'lock' | 'stun';

export interface Ability {
  kind: AbilityKind;
  cooldownMs: number;
  range: number;          // px
  telegraphMs?: number;
  projectile?: ProjectileKind;
  effect?: ProjectileEffect;
  speed?: number;
  durationMs?: number;    // stun / slow / lock / debt length
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  /** legacy fallback images (old procedural enemies) */
  fallback?: [string, string];
  speed: number;            // px/s
  hostile: boolean;         // false = child NPC (never hurts, must not be hurt)
  touchDamage: boolean;
  abilities: Ability[];
  /** camera stun multiplier: stage-2 enemies have seen too many flashes (0.4), elites are immune (0) */
  cameraResist: number;
  /** stage-1 slops: trapped in ice -> frozen -> breaking the ice crushes them (respawn later) */
  iceCrushable?: boolean;
  scale?: number;
}

const E = (d: EnemyDef) => d;
export const ENEMIES: Record<string, EnemyDef> = {
  // ---- stage 1: slops (learn ice)
  slop_blob: E({ id: 'slop_blob', name: 'SLOP', sprite: 'slop_blob', fallback: ['mold_0', 'mold_1'], speed: 76, hostile: true, touchDamage: true, abilities: [], cameraResist: 1, iceCrushable: true }),
  slop_noodle: E({ id: 'slop_noodle', name: 'NUDLA', sprite: 'slop_noodle', fallback: ['yogurt_0', 'yogurt_1'], speed: 72, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 4200, range: 230, projectile: 'sauce', effect: 'slow', speed: 170, durationMs: 1500 }], cameraResist: 1, iceCrushable: true }),
  slop_burger: E({ id: 'slop_burger', name: 'BURGER SLOP', sprite: 'slop_burger', fallback: ['dishes_0', 'dishes_1'], speed: 62, hostile: true, touchDamage: true, abilities: [], cameraResist: 1, iceCrushable: true }),
  // ---- stage 2: Ekonomska skola (camera users, slower)
  prefect: E({ id: 'prefect', name: 'KAMERA PREFEKT', sprite: 'prefect', speed: 52, hostile: true, touchDamage: true,
    abilities: [{ kind: 'flash', cooldownMs: 5200, range: 190, telegraphMs: 900, durationMs: 1300 }], cameraResist: 0.4 }),
  runner: E({ id: 'runner', name: 'PAPIR TRKAC', sprite: 'runner', speed: 66, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 3600, range: 260, projectile: 'test', effect: 'damage', speed: 210 }], cameraResist: 0.4 }),
  monitor: E({ id: 'monitor', name: 'DEZURNI', sprite: 'monitor', speed: 56, hostile: true, touchDamage: true,
    abilities: [{ kind: 'whistle', cooldownMs: 6000, range: 120, telegraphMs: 700, durationMs: 1800 }], cameraResist: 0.4 }),
  elite: E({ id: 'elite', name: 'ELITNI PREFEKT', sprite: 'elite', speed: 50, hostile: true, touchDamage: true,
    abilities: [{ kind: 'flash', cooldownMs: 4600, range: 210, telegraphMs: 800, durationMs: 1300 }], cameraResist: 0 }),
  // ---- stage 3: DRPD
  staff: E({ id: 'staff', name: 'VASPITACICA', sprite: 'staff', speed: 70, hostile: true, touchDamage: true,
    abilities: [{ kind: 'dash', cooldownMs: 4500, range: 200, durationMs: 700 }], cameraResist: 1 }),
  super: E({ id: 'super', name: 'NADZORNICA', sprite: 'super', speed: 58, hostile: true, touchDamage: true,
    abilities: [{ kind: 'whistle', cooldownMs: 5500, range: 130, telegraphMs: 700, durationMs: 1800 }], cameraResist: 1 }),
  kid1: E({ id: 'kid1', name: 'DETE', sprite: 'kid1', speed: 92, hostile: false, touchDamage: false, abilities: [], cameraResist: 1 }),
  kid2: E({ id: 'kid2', name: 'DETE', sprite: 'kid2', speed: 88, hostile: false, touchDamage: false, abilities: [], cameraResist: 1 }),
  // ---- stage 4: ZIVOT.EXE
  taxman: E({ id: 'taxman', name: 'POREZNIK', sprite: 'taxman', speed: 58, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 3000, range: 280, projectile: 'tax', effect: 'damage', speed: 220 }], cameraResist: 1 }),
  bureau: E({ id: 'bureau', name: 'BIROKRATA', sprite: 'bureau', speed: 54, hostile: true, touchDamage: true,
    abilities: [{ kind: 'lock', cooldownMs: 4000, range: 34, durationMs: 5000 },
      { kind: 'throw', cooldownMs: 5200, range: 230, projectile: 'fee', effect: 'lock', speed: 180, durationMs: 4000 }], cameraResist: 1 }),
  banker: E({ id: 'banker', name: 'BANKAR', sprite: 'banker', speed: 60, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 3400, range: 260, projectile: 'money', effect: 'debt', speed: 190, durationMs: 4000 }], cameraResist: 1 }),
  landlord: E({ id: 'landlord', name: 'STANODAVAC', sprite: 'landlord', speed: 64, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 3800, range: 240, projectile: 'key', effect: 'damage', speed: 260 }], cameraResist: 1 }),
  recruiter: E({ id: 'recruiter', name: 'REGRUTER', sprite: 'recruiter', speed: 84, hostile: true, touchDamage: true,
    abilities: [{ kind: 'dash', cooldownMs: 3800, range: 220, durationMs: 650 }], cameraResist: 1 }),
  insurance: E({ id: 'insurance', name: 'OSIGURANJE', sprite: 'insurance', speed: 58, hostile: true, touchDamage: true,
    abilities: [{ kind: 'throw', cooldownMs: 3600, range: 240, projectile: 'policy', effect: 'slow', speed: 200, durationMs: 1800 }], cameraResist: 1 }),
  official: E({ id: 'official', name: 'DRZAVNI SLUZBENIK', sprite: 'official', speed: 50, hostile: true, touchDamage: true,
    abilities: [{ kind: 'icebreak', cooldownMs: 3500, range: 2 * 48 }, { kind: 'whistle', cooldownMs: 7000, range: 140, telegraphMs: 800, durationMs: 1500 }], cameraResist: 1 }),
};

export const PROJECTILE_FX: Record<ProjectileKind, { sprite: string; spin?: boolean; radius: number }> = {
  grease: { sprite: 'fx_grease', radius: 16 }, sauce: { sprite: 'proj_sauce', radius: 14 }, noodle: { sprite: 'proj_noodle', radius: 16, spin: true },
  chunk: { sprite: 'proj_chunk', radius: 16, spin: true }, test: { sprite: 'proj_test', radius: 14, spin: true }, flashball: { sprite: 'fx_flashball', radius: 16 },
  fireball: { sprite: 'fire_ball', radius: 18 }, tax: { sprite: 'doc_tax', radius: 16, spin: true }, rent: { sprite: 'doc_rent', radius: 16, spin: true },
  fee: { sprite: 'doc_fee', radius: 16, spin: true }, pastdue: { sprite: 'doc_pastdue', radius: 16, spin: true }, money: { sprite: 'fx_money', radius: 16 },
  debt: { sprite: 'proj_debt', radius: 16 }, key: { sprite: 'proj_key', radius: 14, spin: true }, job: { sprite: 'doc_fee', radius: 14, spin: true },
  policy: { sprite: 'doc_rent', radius: 14, spin: true },
};
