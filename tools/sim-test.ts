/** Deterministic rule tests on the authoritative simulation (no network). npx tsx tools/sim-test.ts */
import { LevelSim } from '../server/src/LevelSim.ts';
import { Player } from '../server/src/Player.ts';
import { LEVEL1 } from '../shared/levels/level1.ts';
import { CAMERA_RADIUS, MAX_HP } from '../shared/constants.ts';

let fails = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails++; };
const ticks = (s: LevelSim, n: number) => { for (let i = 0; i < n; i++) s.tick(); };

const d = new Player('d', 't', 'david'), n = new Player('n', 't', 'nemanja');
const sim = new LevelSim(LEVEL1, [d, n]);
ticks(sim, 90); // spawn invulnerability passes
// enemy contact damages
const e = sim.enemies[0];
e.x = d.x; e.y = d.y - 12; e.stunUntil = 0;
ticks(sim, 1);
check(d.hp === MAX_HP - 1, 'enemy contact removes one heart');
check(sim.events.some((ev) => ev.k === 'hit'), 'hit event emitted');
const hp = d.hp;
e.x = d.x; e.y = d.y - 12;
ticks(sim, 1);
check(d.hp === hp, 'brief invulnerability after a hit');
// coffee heals, does not stun
ticks(sim, 60);
e.x = 2000; e.y = 2000; // park the enemy far away
const cof = d.coffee;
sim.actCoffee(d);
check(d.coffee === cof - 1, 'E drinks a coffee charge');
ticks(sim, 40);
check(d.hp === MAX_HP, 'coffee heals +1 heart after the sip');
check(sim.enemies.every((q) => q.stunUntil <= sim.now), 'coffee never stuns enemies');
sim.actCoffee(d);
check(d.coffee === cof - 1, 'coffee refused at full HP');
// camera flash stuns in range only
sim.enemies.forEach((q, i) => { q.stunUntil = 0; q.x = d.x + (i === 0 ? 60 : CAMERA_RADIUS + 200); q.y = d.y - 14; q.nx = Math.floor(q.x / 48); q.ny = Math.floor(q.y / 48); });
sim.actCamera(d);
check(sim.enemies[0].stunUntil > sim.now && sim.enemies[1].stunUntil <= sim.now, 'camera flash stuns enemies inside the radius only');
const ex = sim.enemies[0].x;
ticks(sim, 30);
check(sim.enemies[0].x === ex, 'stunned enemy does not move');
d.invulnUntil = 0; sim.enemies[0].x = d.x; sim.enemies[0].y = d.y - 12; const hp2 = d.hp;
ticks(sim, 1);
check(d.hp === hp2, 'stunned enemy is harmless');
ticks(sim, 100);
check(sim.enemies[0].stunUntil <= sim.now, 'stun wears off (non-lethal, temporary)');
// KO + teammate revive
sim.enemies.forEach((q) => { q.x = 3000; q.y = 3000; q.tx = q.nx = 60; q.ty = q.ny = 60; });
d.hp = 1; d.invulnUntil = 0; d.ko = false;
const q = sim.enemies[0]; q.x = d.x; q.y = d.y - 12;
ticks(sim, 1);
check(d.ko && d.hp === 0, '0 HP -> knocked out (room keeps running)');
q.x = 3000; q.y = 3000;
n.x = d.x + 30; n.y = d.y;
ticks(sim, 45);
check(!d.ko && d.hp === 1, 'teammate standing next to you revives you');
// both KO -> restart
d.ko = true; n.ko = true; d.koUntil = n.koUntil = sim.now + 99999;
ticks(sim, 1);
check(sim.events.some((ev) => ev.k === 'fail'), 'both knocked out -> fail');
ticks(sim, 90);
check(!d.ko && !n.ko && d.hp === MAX_HP, 'level restarts after a fail');
// ice blocks enemies
const sim2 = new LevelSim(LEVEL1, [new Player('a', 't', 'david'), new Player('b', 't', 'nemanja')]);
const en = sim2.enemies[0];
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) sim2.ice[(en.ty + dy) * 20 + en.tx + dx] = 1;
const pos = [en.x, en.y];
ticks(sim2, 120);
check(en.x === pos[0] && en.y === pos[1], 'enemy boxed in by ice is trapped');
// ---------------- boss: Branka
{
  const { LEVELS } = await import('../shared/levels/index.ts');
  const a = new Player('a', 't', 'david'), b = new Player('b', 't', 'nemanja');
  const bs = new LevelSim(LEVELS.level11, [a, b]);
  const boss = bs.boss!;
  check(!!boss && boss.hp === 40, 'level 11 spawns Branka with 40 HP');
  a.hp = b.hp = 99;
  ticks(bs, 30 * 12);
  const ev = (k: string) => bs.events.filter((e) => e.k === k).length;
  check(ev('bossCast') > 0, 'Branka casts attacks');
  check(ev('fbHit') > 0 || boss.fireballs.length > 0, 'fireballs are thrown');
  check(ev('meteorLand') > 0, 'marked meteors land after the delay');
  // camera far away does nothing, close does damage
  bs.events = [];
  a.x = 1 * 48 + 24; a.y = 11 * 48 + 24; a.camReadyAt = 0; bs.actCamera(a);
  check(boss.hp === 40, 'camera from far away does not hurt her');
  a.x = boss.x; a.y = boss.y + 150; a.camReadyAt = 0; a.drinkUntil = 0; a.ko = false; bs.actCamera(a);
  check(boss.hp === 39 && boss.state === 'stunned', 'camera flash up close: -1 HP and stun');
  // shockwave punishes standing next to her
  a.hp = 3; a.invulnUntil = 0; a.ko = false; a.x = boss.x; a.y = boss.y + 120;
  boss.state = 'idle'; boss.nextActionAt = 0; boss.shockReadyAt = 0;
  for (let i = 0; i < 60 && a.hp === 3; i++) { a.x = boss.x; a.y = boss.y + 120; bs.tick(); }
  check(a.hp < 3, 'shockwave hurts players standing close');
  // ice stops fireballs
  bs.events = [];
  const tx = Math.floor(boss.x / 48), ty = 6;
  a.x = b.x = 48 + 24; a.y = b.y = 11 * 48 + 24;
  bs.ice[ty * 20 + tx] = 1;
  boss.fireballs.push({ i: 999, x: boss.x, y: 5 * 48 + 10, vx: 0, vy: 240, born: bs.now });
  ticks(bs, 15);
  check(bs.ice[ty * 20 + tx] === 0 && !boss.fireballs.some((f) => f.i === 999), 'ice block stops a fireball and melts');
  // enrage + death -> level complete
  boss.hp = 2; boss.enraged = false;
  a.camReadyAt = 0; a.ko = false; a.drinkUntil = 0; a.x = boss.x; a.y = boss.y + 150; bs.actCamera(a);
  check(boss.enraged, 'Branka enrages below half HP');
  b.camReadyAt = 0; b.ko = false; b.drinkUntil = 0; b.x = boss.x; b.y = boss.y + 150; bs.actCamera(b);
  check(boss.dead, 'Branka is defeated at 0 HP');
  let done = false;
  for (let i = 0; i < 30 * 5 && !done; i++) done = bs.tick();
  check(done, 'defeating the boss completes the level');
}
console.log(fails ? `\n${fails} FAILED` : '\nSIM RULES PASSED');
process.exit(fails ? 1 : 0);
