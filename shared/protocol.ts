import type { Dir, Phase, Role } from './types.ts';

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'create'; role: Role; token?: string }
  | { t: 'join'; code: string; role: Role; tokens?: string[] }
  | { t: 'resume'; code: string; token: string }
  | { t: 'input'; seq: number; dx: number; dy: number }
  | { t: 'act'; a: 'ice' | 'coffee' | 'camera' }
  | { t: 'emote'; e: number }
  | { t: 'ready'; v: boolean }
  | { t: 'toLobby' }
  | { t: 'retry' }
  | { t: 'next' }
  | { t: 'pickLevel'; id: string }
  | { t: 'leave' }
  | { t: 'ping'; c: number }
  /** only honoured when the server runs with ICEBROS_DEBUG=1 */
  | { t: 'debug'; cmd: 'collectAll' | 'hurt' | 'toExit' | 'stations' | 'ko' | 'gather' | 'bossLow' | 'unlockAll' };

// ---------- server -> client ----------
export interface RoomPlayerInfo { id: string; role: Role; connected: boolean; ready: boolean }

export interface PlayerSnap {
  id: string; role: Role;
  x: number; y: number; f: Dir; m: 0 | 1; // moving
  hp: number; cof: number; cam: number; // camera cooldown remaining ms
  sl: 0 | 1; dr: 0 | 1; inv: 0 | 1; ko: 0 | 1; rv: number; // revive progress 0..1
  ack: number; col: number; c: 0 | 1; // connected
}
export interface EnemySnap { i: number; x: number; y: number; d: Dir; st: number /* stun ms left */ }

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
  | { k: 'flash'; by: string; x: number; y: number; stunned: number[] }
  | { k: 'hit'; by: string; enemy: number }
  | { k: 'ko'; by: string }
  | { k: 'revive'; by: string; helper?: string }
  | { k: 'station'; idx: number; by: string }
  | { k: 'gate' }
  | { k: 'exitOpen' }
  | { k: 'emote'; by: string; e: number }
  | { k: 'fail' }
  | { k: 'restart' }
  | { k: 'coffeeSpawn'; idx: number }
  // boss
  | { k: 'bossCast'; kind: 'fireball' | 'rain' | 'shock' }
  | { k: 'fbHit'; x: number; y: number }
  | { k: 'meteorLand'; x: number; y: number }
  | { k: 'bossShock'; x: number; y: number; r: number }
  | { k: 'bossHit'; by: string; hp: number }
  | { k: 'bossEnrage' }
  | { k: 'bossDead' }
  | { k: 'bossSay'; text: string };

export interface BossSnap {
  x: number; y: number; hp: number; max: number;
  st: 'idle' | 'cast' | 'rain' | 'shock' | 'stunned' | 'dead';
  sp: number; // progress 0..1 of the current state
  enr: 0 | 1; hurt: 0 | 1;
  fb: [number, number, number, number, number][]; // id, x, y, vx, vy
  mt: [number, number, number, number][]; // id, x, y, ms until it lands
  sh: number; shr: number; // shockwave ms until blast (-1 = none), radius
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
}

export interface CompleteStats {
  timeMs: number;
  perPlayer: Record<Role, { food: number; ice: number; flashes: number; coffee: number; hits: number }>;
}

export type ServerMsg =
  | { t: 'joined'; code: string; you: { id: string; role: Role; token: string } }
  | { t: 'error'; msg: string }
  | { t: 'room'; code: string; phase: Phase; levelId: string; unlocked: number; players: RoomPlayerInfo[] }
  | { t: 'level'; levelId: string; seed: number }
  | { t: 'complete'; stats: CompleteStats }
  | Snapshot
  | { t: 'pong'; c: number };
