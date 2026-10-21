import type { CompleteStats, RoomPlayerInfo } from '../../../shared/protocol.ts';
import type { SkillId } from '../../../shared/skills.ts';
import type { Phase, Role } from '../../../shared/types.ts';
import { Net } from '../net/Net.ts';

const PROGRESS_KEY = 'icebros.progress';

/** App-wide multiplayer session state. */
export class Session {
  net = new Net();
  code = '';
  me: { id: string; role: Role; token: string } | null = null;
  players: RoomPlayerInfo[] = [];
  phase: Phase = 'lobby';
  levelId = 'level1';
  /** shared room progress (synchronised by the server) */
  completed: string[] = [];
  skills: SkillId[] = ['ice'];
  complete: CompleteStats | null = null;
  wantedRole: Role = 'david';
  error = '';

  playerByRole(r: Role) { return this.players.find((p) => p.role === r); }
  roleOf(id: string): Role | undefined { return this.players.find((p) => p.id === id)?.role; }
  has(s: SkillId) { return this.skills.includes(s); }

  /** locally saved campaign progress (sent to the server when creating / joining a room) */
  static loadProgress(): string[] {
    try { const v = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
  }
  static saveProgress(list: string[]) {
    try {
      const merged = [...new Set([...Session.loadProgress(), ...list])];
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
  }

  leave() {
    this.net.send({ t: 'leave' });
    setTimeout(() => this.net.close(), 50);
    Net.save(null);
    Net.forget(this.code);
    try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
    this.code = ''; this.me = null; this.players = []; this.phase = 'lobby'; this.complete = null;
  }
}
