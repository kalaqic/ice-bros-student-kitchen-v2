import { DT } from '../../../shared/constants.ts';
import { stepPlayer, type SolidFn } from '../../../shared/physics.ts';
import type { PlayerSnap } from '../../../shared/protocol.ts';
import type { Dir } from '../../../shared/types.ts';
import type { Net } from '../net/Net.ts';

/**
 * Client-side prediction for the local player: inputs are applied immediately with the
 * same shared physics the server runs, then reconciled against authoritative snapshots.
 */
/** input sequence numbers are global for the tab so they keep increasing across scenes */
let globalSeq = Math.floor(Date.now() / 10); // always above acks from an earlier page load

export class Predictor {
  pos = { x: 0, y: 0, facing: 1 as Dir };
  prev = { x: 0, y: 0 };
  err = { x: 0, y: 0 };
  pending: { seq: number; dx: number; dy: number }[] = [];
  acc = 0;
  moving = false;
  canMove = true;
  slowed = false;
  debt = false;
  initialised = false;

  constructor(private net: Net) {}

  reset(x: number, y: number, f: Dir) {
    this.pos = { x, y, facing: f }; this.prev = { x, y }; this.err = { x: 0, y: 0 };
    this.pending = []; this.initialised = true;
  }

  /** advance fixed steps; returns interpolation alpha */
  update(dt: number, axis: { dx: number; dy: number }, solid: SolidFn): number {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      this.acc -= DT; steps++;
      this.prev = { x: this.pos.x, y: this.pos.y };
      const { dx, dy } = axis;
      this.moving = this.canMove && (dx !== 0 || dy !== 0);
      if (dx !== 0 || dy !== 0) {
        const inp = { seq: ++globalSeq, dx, dy };
        stepPlayer(this.pos, inp, this.canMove, this.slowed, solid, this.debt);
        this.pending.push(inp);
        if (this.pending.length > 60) this.pending.shift();
        this.net.send({ t: 'input', seq: inp.seq, dx, dy });
      }
    }
    if (steps === 4) this.acc = 0;
    // decay visual correction
    const k = Math.pow(0.0005, dt);
    this.err.x *= k; this.err.y *= k;
    return this.acc / DT;
  }

  reconcile(ps: PlayerSnap, solid: SolidFn) {
    this.canMove = !ps.ko && !ps.dr && !(ps.sn > 0) && !(ps.qz >= 0);
    this.slowed = !!ps.sl;
    this.debt = !!ps.db;
    if (!this.initialised) { this.reset(ps.x, ps.y, ps.f); return; }
    const before = { x: this.pos.x, y: this.pos.y };
    this.pending = this.pending.filter((p) => p.seq > ps.ack);
    const base = { x: ps.x, y: ps.y, facing: this.pos.facing };
    if (!this.pending.length) base.facing = ps.f;
    for (const inp of this.pending) stepPlayer(base, inp, this.canMove, this.slowed, solid, this.debt);
    this.pos = base;
    const ex = before.x - base.x, ey = before.y - base.y;
    if (Math.hypot(ex, ey) > 120) { this.err = { x: 0, y: 0 }; this.prev = { x: base.x, y: base.y }; }
    else { this.err.x += ex; this.err.y += ey; this.prev.x -= ex; this.prev.y -= ey; }
  }

  display(alpha: number) {
    return {
      x: this.prev.x + (this.pos.x - this.prev.x) * alpha + this.err.x,
      y: this.prev.y + (this.pos.y - this.prev.y) * alpha + this.err.y,
    };
  }
}

/** Snapshot buffer for smooth remote entities (renders ~100ms in the past). */
export class Interp<T extends { x: number; y: number }> {
  private buf: { t: number; v: Map<string | number, T> }[] = [];
  push(entries: [string | number, T][]) {
    this.buf.push({ t: performance.now(), v: new Map(entries) });
    if (this.buf.length > 30) this.buf.shift();
  }
  clear() { this.buf = []; }
  get(id: string | number, delay = 100): T | null {
    const t = performance.now() - delay;
    const b = this.buf;
    if (!b.length) return null;
    for (let i = b.length - 1; i > 0; i--) {
      if (b[i - 1].t <= t) {
        const a = b[i - 1].v.get(id), c = b[i].v.get(id);
        if (!a || !c) return c ?? a ?? null;
        const f = Math.min(1, (t - b[i - 1].t) / Math.max(1, b[i].t - b[i - 1].t));
        if (Math.hypot(c.x - a.x, c.y - a.y) > 100) return c;
        return { ...c, x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f };
      }
    }
    return b[0].v.get(id) ?? null;
  }
}
