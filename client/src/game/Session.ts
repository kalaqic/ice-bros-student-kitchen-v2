import type { CompleteStats, RoomPlayerInfo } from '../../../shared/protocol.ts';
import type { Phase, Role } from '../../../shared/types.ts';
import { Net } from '../net/Net.ts';

/** App-wide multiplayer session state. */
export class Session {
  net = new Net();
  code = '';
  me: { id: string; role: Role; token: string } | null = null;
  players: RoomPlayerInfo[] = [];
  phase: Phase = 'lobby';
  levelId = 'level1';
  unlocked = 0;
  complete: CompleteStats | null = null;
  wantedRole: Role = 'david';
  error = '';

  playerByRole(r: Role) { return this.players.find((p) => p.role === r); }
  roleOf(id: string): Role | undefined { return this.players.find((p) => p.id === id)?.role; }

  leave() {
    this.net.send({ t: 'leave' });
    setTimeout(() => this.net.close(), 50);
    Net.save(null);
    Net.forget(this.code);
    try { history.replaceState(null, '', location.pathname); } catch { /* ignore */ }
    this.code = ''; this.me = null; this.players = []; this.phase = 'lobby'; this.complete = null;
  }
}
