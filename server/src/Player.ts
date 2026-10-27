import type { WebSocket } from 'ws';
import type { SkillId } from '../../shared/skills.ts';
import type { Dir, Role } from '../../shared/types.ts';

export class Player {
  ws: WebSocket | null = null;
  connected = true;
  disconnectedAt = 0;
  ready = false;
  lastIvSent = -1;
  emoteReadyAt = 0;
  /** level ids this browser has completed (sent on join, merged into the room) */
  progress: string[] = [];
  // movement (server authoritative)
  x = 0; y = 0; facing: Dir = 1; moving = false;
  inputs: { seq: number; dx: number; dy: number }[] = [];
  ack = 0;
  // level state
  hp = 3; coffee = 2; camReadyAt = 0; slowUntil = 0; drinkUntil = 0; healPending = false; coffeeReadyAt = 0;
  invulnUntil = 0; ko = false; koUntil = 0; reviveMs = 0; iceReadyAt = 0; collected = 0; lastDisgustAt = 0;
  // status effects
  stunUntil = 0; debtUntil = 0;
  /** went through the open exit door: hidden and safe until the teammate follows */
  exited = false;
  locks: Partial<Record<SkillId, number>> = {};
  /** station index being worked on (-1 none) */
  task = -1;
  /** kid question being answered */
  quiz: { kid: number; q: number; sure: boolean; until: number } | null = null;

  constructor(readonly id: string, readonly token: string, public role: Role) {}
}
