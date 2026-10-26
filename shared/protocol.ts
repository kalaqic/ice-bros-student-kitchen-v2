import type { SkillId } from './skills.ts';
import type { TaskAnim } from './tasks.ts';
import type { Dir, Phase, Role } from './types.ts';

export type ActionId = 'ice' | 'coffee' | 'camera' | 'interact';

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'create'; role: Role; progress?: string[]; solo?: boolean }
  | { t: 'join'; code: string; role: Role; tokens?: string[]; progress?: string[] }
  | { t: 'resume'; code: string; token: string }
  | { t: 'input'; seq: number; dx: number; dy: number }
  | { t: 'act'; a: ActionId }
  | { t: 'answer'; i: number }
  | { t: 'emote'; e: number }
  | { t: 'ready'; v: boolean }
  | { t: 'toLobby' }
  | { t: 'retry' }
  | { t: 'next' }
  | { t: 'pickLevel'; id: string }
  | { t: 'leave' }
  | { t: 'ping'; c: number }
  /** only honoured when the server runs with ICEBROS_DEBUG=1 */
  | { t: 'debug'; cmd: 'collectAll' | 'hurt' | 'toExit' | 'stations' | 'ko' | 'gather' | 'bossLow' | 'unlockAll' | 'resetProgress' | 'killAll' | 'nearBoss' };

// ---------- server -> client ----------
export interface RoomPlayerInfo { id: string; role: Role; connected: boolean; ready: boolean }

export interface PlayerSnap {
  id: string; role: Role;
  x: number; y: number; f: Dir; m: 0 | 1; // moving
  hp: number; cof: number; cam: number; // camera cooldown remaining ms
  sl: 0 | 1; dr: 0 | 1; inv: 0 | 1; ko: 0 | 1; rv: number; // revive progress 0..1
  ack: number; col: number; c: 0 | 1; // connected
  /** stunned ms left, debt (0/1), locked skills */
  sn: number; db: 0 | 1; lk: SkillId[];
  /** working on a task: animation type + station index ('' / -1 = not working) */
  tk: TaskAnim | ''; ti: number;
  /** kid question being answered (-1 none) and "are you sure?" retry flag */
  qz: number; qs: 0 | 1;
}
/** s: 0 normal, 1 ice-frozen, 2 gone (crushed / defeated), 3 telegraphing an attack, 4 kid asking, 5 kid happy, 6 dashing */
export interface EnemySnap { i: number; ty: string; x: number; y: number; d: Dir; st: number /* stun ms left */; s: number }

export type GameEvent =
  | { k: 'ice'; tiles: number[]; by: string; dir: Dir }
  | { k: 'iceBreak'; tiles: number[]; by: string }
  | { k: 'iceFail'; by: string }
  | { k: 'collect'; item: number; by: string; text?: string }
  | { k: 'coffeePickup'; idx: number; by: string }
  | { k: 'disgust'; item: number; by: string; text: string }
  | { k: 'say'; by: string; text: string; color?: string }
  | { k: 'drink'; by: string }
  | { k: 'heal'; by: string }
  /** camera photo: q per target 0 weak / 1 good / 2 perfect */
  | { k: 'flash'; by: string; x: number; y: number; ang: number; range: number; hits: { i: number; q: number; ms: number }[]; boss?: { q: number; dmg: number } }
  | { k: 'hit'; by: string; enemy: number }
  | { k: 'ko'; by: string }
  | { k: 'revive'; by: string; helper?: string }
  | { k: 'station'; idx: number; by: string }
  | { k: 'taskStart'; idx: number; by: string }
  | { k: 'taskStop'; idx: number; by: string }
  | { k: 'gate' }
  | { k: 'exitOpen' }
  | { k: 'emote'; by: string; e: number }
  | { k: 'fail' }
  | { k: 'restart' }
  | { k: 'coffeeSpawn'; idx: number }
  | { k: 'locked'; by: string; skill: SkillId; ms: number }
  | { k: 'denied'; by: string; skill: SkillId; why: 'locked' | 'debuff' }
  | { k: 'stun'; by: string; ms: number }
  | { k: 'debt'; by: string }
  | { k: 'slowed'; by: string }
  // enemies
  | { k: 'tele'; i: number; kind: 'flash' | 'whistle' | 'icebreak'; ang: number; len: number; ms: number }
  | { k: 'eflash'; i: number; x: number; y: number; ang: number; len: number; hit: string[] }
  | { k: 'whistle'; i: number; x: number; y: number; r: number }
  | { k: 'throw'; i: number }
  | { k: 'eFrozen'; i: number }
  | { k: 'crush'; i: number; by: string }
  | { k: 'respawn'; i: number }
  | { k: 'penalty'; by: string; text: string }
  | { k: 'projHit'; kind: string; x: number; y: number }
  // kids / quiz
  | { k: 'quiz'; by: string; kid: number; q: number; sure: boolean }
  | { k: 'quizResult'; by: string; kid: number; ok: boolean }
  // boss
  | { k: 'bossCast'; kind: string }
  | { k: 'fbHit'; x: number; y: number }
  | { k: 'meteorLand'; x: number; y: number }
  | { k: 'bossShock'; x: number; y: number; r: number }
  | { k: 'bossHit'; by: string; hp: number; dmg?: number; q?: number }
  | { k: 'bossEnrage' }
  | { k: 'bossDead' }
  | { k: 'bossSay'; text: string }
  | { k: 'bossFrozen' }
  | { k: 'hazard'; kind: string; x: number; y: number };

export type BossKind = 'hrana' | 'sonja' | 'branka' | 'collector';
export interface BossSnap {
  type: BossKind;
  x: number; y: number; hp: number; max: number;
  st: string;   // state name (boss specific: idle, cast, rain, shock, stunned, dead, frozen, walk, ...)
  sp: number;   // progress 0..1 of the current state
  enr: 0 | 1; hurt: 0 | 1;
  /** Branka only (kept from the original implementation) */
  fb?: [number, number, number, number, number][]; // id, x, y, vx, vy
  mt?: [number, number, number, number][];         // id, x, y, ms until it lands
  sh?: number; shr?: number;                        // shockwave ms until blast (-1 = none), radius
  /** freeze meter 0..1 (Studentska hrana) */
  fz?: number;
}

export interface Snapshot {
  t: 's';
  tick: number;
  p: PlayerSnap[];
  e: EnemySnap[];
  ev: GameEvent[];
  iv: number; ice?: number[]; // ice tile indices when iv changed (or on request)
  taken: number[]; coffee: number[]; // indices of taken items / coffee pickups
  st: number[]; // station progress 0..1
  gate: 0 | 1; exit: 0 | 1;
  paused: string | null;
  time: number; // level time ms
  boss?: BossSnap;
  /** generic projectiles: id, kind, x, y, vx, vy */
  pr: [number, string, number, number, number, number][];
  /** hazards: id, kind, x, y, radius, ms until active (0 = active), ms left */
  hz: [number, string, number, number, number, number, number][];
}

export interface CompleteStats {
  timeMs: number;
  perPlayer: Record<Role, { food: number; ice: number; flashes: number; coffee: number; hits: number }>;
  /** skill earned by finishing this level (stage boss), stage number completed */
  unlocked?: SkillId | null;
  stageDone?: number | null;
}

export type ServerMsg =
  | { t: 'joined'; code: string; you: { id: string; role: Role; token: string } }
  | { t: 'error'; msg: string }
  | { t: 'room'; code: string; phase: Phase; levelId: string; completed: string[]; skills: SkillId[]; players: RoomPlayerInfo[]; solo: boolean }
  | { t: 'level'; levelId: string; seed: number }
  | { t: 'complete'; stats: CompleteStats }
  | Snapshot
  | { t: 'pong'; c: number };
