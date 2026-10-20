import crypto from 'node:crypto';
import { WebSocket } from 'ws';
import { LOBBY_SPAWNS, lobbySolid } from '../../shared/lobby.ts';
import { FIRST_LEVEL, LEVELS, LEVEL_ORDER, levelIndex } from '../../shared/levels/index.ts';
import { stepPlayer } from '../../shared/physics.ts';
import type { GameEvent, PlayerSnap, ServerMsg, Snapshot } from '../../shared/protocol.ts';
import { type Phase, type Role, otherRole, roleName } from '../../shared/types.ts';
import { LevelSim } from './LevelSim.ts';
import { Player } from './Player.ts';

const LOBBY_RECONNECT_MS = 20_000;
const LEVEL_RECONNECT_MS = 45_000;

export class Room {
  phase: Phase = 'lobby';
  levelId = FIRST_LEVEL;
  /** highest level index this room may pick (progress unlocks the next one) */
  unlocked = process.env.ICEBROS_UNLOCK_ALL === '1' ? LEVEL_ORDER.length - 1 : 0;
  players: Player[] = [];
  sim: LevelSim | null = null;
  tickN = 0;
  lobbyEvents: GameEvent[] = [];
  emptySince = 0;

  constructor(readonly code: string) {}

  get full() { return this.players.length >= 2; }

  addPlayer(ws: WebSocket, wanted: Role): Player {
    const taken = this.players.map((p) => p.role);
    const role = taken.includes(wanted) ? otherRole(wanted) : wanted;
    const p = new Player(crypto.randomUUID(), crypto.randomBytes(12).toString('hex'), role);
    p.ws = ws;
    const s = LOBBY_SPAWNS[role];
    p.x = s.x; p.y = s.y; p.facing = role === 'david' ? 0 : 2;
    this.players.push(p);
    this.send(p, { t: 'joined', code: this.code, you: { id: p.id, role: p.role, token: p.token } });
    this.broadcastRoom();
    this.sayLobby(p, role === 'david' ? 'DAVID JE TU!' : 'NEMANJA JE TU!');
    return p;
  }

  resume(ws: WebSocket, token: string, onlyIfDisconnected = false): Player | null {
    const p = this.players.find((q) => q.token === token);
    if (!p || (onlyIfDisconnected && p.connected)) return null;
    if (p.ws && p.ws !== ws && p.ws.readyState === WebSocket.OPEN) p.ws.close(4000, 'replaced');
    p.ws = ws; p.connected = true; p.disconnectedAt = 0; p.inputs = []; p.lastIvSent = -1;
    this.send(p, { t: 'joined', code: this.code, you: { id: p.id, role: p.role, token: p.token } });
    if (this.phase !== 'lobby') this.send(p, { t: 'level', levelId: this.levelId, seed: 0 });
    if (this.phase === 'complete' && this.sim) this.send(p, { t: 'complete', stats: this.sim.stats });
    this.broadcastRoom();
    return p;
  }

  disconnect(p: Player) {
    p.connected = false; p.ws = null; p.disconnectedAt = Date.now(); p.ready = false; p.inputs = [];
    this.broadcastRoom();
  }

  remove(p: Player) {
    this.players = this.players.filter((q) => q !== p);
    if (this.phase !== 'lobby') this.toLobby();
    this.broadcastRoom();
  }

  // ------------------------------------------------------------- messages
  onInput(p: Player, seq: number, dx: number, dy: number) {
    if (!Number.isFinite(seq) || seq <= p.ack) return;
    const last = p.inputs[p.inputs.length - 1];
    if (last && seq <= last.seq) return;
    p.inputs.push({ seq, dx: clampDir(dx), dy: clampDir(dy) });
    while (p.inputs.length > 8) { const dropped = p.inputs.shift()!; p.ack = dropped.seq; }
  }

  onReady(p: Player, v: boolean) {
    if (this.phase !== 'lobby') return;
    p.ready = !!v;
    this.broadcastRoom();
    if (this.players.length === 2 && this.players.every((q) => q.ready && q.connected)) this.startLevel();
  }

  onAct(p: Player, a: string) {
    if (this.phase !== 'level' || !this.sim || this.paused()) return;
    if (a === 'ice') this.sim.actIce(p);
    else if (a === 'coffee') this.sim.actCoffee(p);
    else if (a === 'camera') this.sim.actCamera(p);
  }

  onEmote(p: Player, e: number) {
    const now = Date.now();
    if (now < p.emoteReadyAt || !Number.isInteger(e) || e < 0 || e > 3) return;
    p.emoteReadyAt = now + 700;
    const ev: GameEvent = { k: 'emote', by: p.id, e };
    if (this.phase === 'level' && this.sim) this.sim.events.push(ev); else this.lobbyEvents.push(ev);
  }

  /** Dev cheats for testing (ICEBROS_DEBUG=1 only). */
  onDebug(p: Player, cmd: string) {
    if (cmd === 'unlockAll') { this.unlocked = LEVEL_ORDER.length - 1; this.broadcastRoom(); return; }
    const sim = this.sim;
    if (!sim || this.phase !== 'level') return;
    if (cmd === 'collectAll') sim.items.forEach((it) => { it.taken = true; });
    if (cmd === 'hurt') { p.invulnUntil = 0; p.hp = Math.max(1, p.hp - 1); }
    if (cmd === 'ko') { p.hp = 0; p.ko = true; p.koUntil = sim.now + 10000; p.reviveMs = 0; sim.events.push({ k: 'ko', by: p.id }); }
    if (cmd === 'gather') { const o = this.players.find((q) => q !== p); if (o) { o.x = p.x + 52; o.y = p.y; } }
    if (cmd === 'bossLow' && sim.boss) { sim.boss.hp = 2; }
    if (cmd === 'stations') sim.stations.forEach((s) => { s.progress = 0.99; });
    if (cmd === 'toExit') {
      this.players.forEach((q, i) => { q.x = (9 + i) * 48 + 24; q.y = 24; });
    }
  }

  startLevel() {
    this.phase = 'level';
    this.sim = new LevelSim(LEVELS[this.levelId], this.players);
    for (const p of this.players) { p.inputs = []; p.lastIvSent = -1; }
    this.broadcast({ t: 'level', levelId: this.levelId, seed: 0 });
    this.broadcastRoom();
  }

  pickLevel(id: string) {
    const i = levelIndex(id);
    if (this.phase !== 'lobby' || i < 0 || i > this.unlocked) return;
    this.levelId = id;
    for (const p of this.players) p.ready = false;
    this.broadcastRoom();
  }

  /** after LEVEL COMPLETE: straight into the next level */
  next() {
    if (this.phase !== 'complete') return;
    const i = levelIndex(this.levelId);
    if (i + 1 >= LEVEL_ORDER.length) return;
    this.levelId = LEVEL_ORDER[i + 1].id;
    this.startLevel();
  }

  retry() {
    if (this.phase === 'lobby' || !this.sim) return;
    this.phase = 'level';
    this.sim.reset();
    this.sim.events.push({ k: 'restart' });
    this.broadcast({ t: 'level', levelId: this.levelId, seed: 0 });
    this.broadcastRoom();
  }

  toLobby() {
    this.phase = 'lobby';
    this.sim = null;
    for (const p of this.players) {
      p.ready = false; p.inputs = [];
      const s = LOBBY_SPAWNS[p.role];
      p.x = s.x; p.y = s.y; p.ko = false; p.moving = false;
    }
    this.broadcastRoom();
  }

  paused(): string | null {
    if (this.phase !== 'level') return null;
    const gone = this.players.find((p) => !p.connected);
    if (gone) return `${roleName(gone.role)} SE DISKONEKTOVAO...`;
    if (this.players.length < 2) return 'CEKAM DRUGOG IGRACA';
    return null;
  }

  // ------------------------------------------------------------- tick
  tick() {
    this.tickN++;
    const now = Date.now();
    // drop players that did not come back
    for (const p of [...this.players]) {
      if (!p.connected && now - p.disconnectedAt > (this.phase === 'lobby' ? LOBBY_RECONNECT_MS : LEVEL_RECONNECT_MS)) this.remove(p);
    }
    if (this.phase === 'lobby') {
      for (const p of this.players) {
        let n = 0; p.moving = false;
        while (p.inputs.length && n < 3) {
          const inp = p.inputs.shift()!;
          stepPlayer(p, inp, true, false, lobbySolid);
          if (inp.dx || inp.dy) p.moving = true;
          p.ack = inp.seq; n++;
        }
      }
      const ev = this.lobbyEvents; this.lobbyEvents = [];
      this.sendSnapshots(ev);
      return;
    }
    if (!this.sim) return;
    const pause = this.paused();
    if (pause) {
      for (const p of this.players) { const last = p.inputs.pop(); if (last) p.ack = last.seq; p.inputs = []; p.moving = false; }
    } else if (this.phase === 'level') {
      const done = this.sim.tick();
      if (done) {
        this.phase = 'complete';
        this.unlocked = Math.max(this.unlocked, Math.min(LEVEL_ORDER.length - 1, levelIndex(this.levelId) + 1));
        this.broadcast({ t: 'complete', stats: this.sim.stats });
        this.broadcastRoom();
      }
    }
    const ev = this.sim.events; this.sim.events = [];
    this.sendSnapshots(ev, pause);
  }

  private sendSnapshots(ev: GameEvent[], paused: string | null = null) {
    const sim = this.sim;
    const ps: PlayerSnap[] = this.players.map((p) => sim ? sim.playerSnap(p) : lobbySnap(p));
    for (const p of this.players) {
      if (!p.ws || p.ws.readyState !== WebSocket.OPEN) continue;
      const snap: Snapshot = {
        t: 's', tick: this.tickN, p: ps, e: sim ? sim.enemySnaps() : [], ev,
        iv: sim ? sim.iceVersion : 0,
        taken: sim ? sim.items.flatMap((it, i) => (it.taken ? [i] : [])) : [],
        coffee: sim ? sim.coffee.flatMap((c, i) => (c.taken ? [i] : [])) : [],
        st: sim ? sim.stations.map((s) => Math.round(s.progress * 100) / 100) : [],
        gate: sim?.gateOpen ? 1 : 0, exit: sim?.exitOpen ? 1 : 0, paused, time: sim ? Math.round(sim.now) : 0,
      };
      if (sim?.boss) snap.boss = sim.boss.snap();
      if (sim && (p.lastIvSent !== sim.iceVersion || this.tickN % 30 === 0)) { snap.ice = sim.iceList(); p.lastIvSent = sim.iceVersion; }
      p.ws.send(JSON.stringify(snap));
    }
  }

  // ------------------------------------------------------------- send helpers
  send(p: Player, msg: ServerMsg) { if (p.ws && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(msg)); }
  broadcast(msg: ServerMsg) { for (const p of this.players) this.send(p, msg); }
  broadcastRoom() {
    this.broadcast({
      t: 'room', code: this.code, phase: this.phase, levelId: this.levelId, unlocked: this.unlocked,
      players: this.players.map((p) => ({ id: p.id, role: p.role, connected: p.connected, ready: p.ready })),
    });
  }
  private sayLobby(p: Player, text: string) { this.lobbyEvents.push({ k: 'say', by: p.id, text }); }
}

function clampDir(v: number): number { return v > 0 ? 1 : v < 0 ? -1 : 0; }

function lobbySnap(p: Player): PlayerSnap {
  return {
    id: p.id, role: p.role, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, f: p.facing, m: p.moving ? 1 : 0,
    hp: 3, cof: 0, cam: 0, sl: 0, dr: 0, inv: 0, ko: 0, rv: 0, ack: p.ack, col: 0, c: p.connected ? 1 : 0,
  };
}
