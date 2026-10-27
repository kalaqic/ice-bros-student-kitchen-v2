/** Deterministic rule tests on the authoritative simulation (no network). npx tsx tools/sim-test.ts */
import { LevelSim, type Enemy } from '../server/src/LevelSim.ts';
import { Player } from '../server/src/Player.ts';
import { LEVELS, LEVEL_ORDER, completedStages, levelUnlocked } from '../shared/levels/index.ts';
import { MAX_HP, STUN_MS, TILE } from '../shared/constants.ts';
import { CAM_STUN } from '../shared/camera.ts';
import { QUESTIONS } from '../shared/quiz.ts';
import { PATIENCE_TASK_MULT, skillsFor, type SkillId } from '../shared/skills.ts';
import { AFFINITY } from '../shared/tasks.ts';
import { tileCenter } from '../shared/physics.ts';
import type { Dir } from '../shared/types.ts';

let fails = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fails++; };
const ticks = (s: LevelSim, n: number) => { for (let i = 0; i < n; i++) s.tick(); };
const ALL: SkillId[] = ['ice', 'coffee', 'camera', 'patience'];

function mk(levelId: string, skills: SkillId[] = ALL) {
  const d = new Player('d', 't', 'david'), n = new Player('n', 't', 'nemanja');
  const sim = new LevelSim(LEVELS[levelId], [d, n], skills);
  return { sim, d, n };
}
/** remove every enemy from play */
const park = (sim: LevelSim) => sim.enemies.forEach((e) => { e.state = 2; e.respawnAt = Infinity; });
const place = (e: Enemy, x: number, y: number) => { e.state = 0; e.x = x; e.y = y; e.tx = e.nx = Math.floor(x / TILE); e.ty = e.ny = Math.floor(y / TILE); e.stunUntil = 0; e.tele = null; };
const face = (p: Player, f: Dir) => { p.facing = f; };
const firstFree = (sim: LevelSim, minY = 3): [number, number] => {
  for (let ty = sim.rows - 2; ty >= minY; ty--) for (let tx = 2; tx < sim.cols - 6; tx++) {
    let ok = true;
    for (let k = 0; k < 6 && ok; k++) ok = sim.level.map[ty][tx + k] === '.';
    if (ok) return [tx, ty];
  }
  throw new Error('no free strip');
};

// ================================================================ progression data
console.log('--- progression');
check(JSON.stringify(skillsFor([])) === '["ice"]', 'fresh save: only ICE');
check(JSON.stringify(skillsFor([1])) === '["ice","coffee"]', 'stage 1 done -> COFFEE');
check(JSON.stringify(skillsFor([1, 2])) === '["ice","coffee","camera"]', 'stage 2 done -> CAMERA');
check(JSON.stringify(skillsFor([1, 2, 3])) === JSON.stringify(ALL), 'stage 3 done -> PATIENCE');
check(levelUnlocked('level1', []) && !levelUnlocked('menza', []), 'only level 1 is open on a fresh save');
check(levelUnlocked('menza', ['level1']) && !levelUnlocked('boss_hrana', ['level1']), 'completing a level opens exactly the next one');
check(JSON.stringify(completedStages(['level1', 'menza', 'boss_hrana'])) === '[1]', 'beating the stage boss completes the stage');
check(LEVEL_ORDER.length === 27 && LEVEL_ORDER[LEVEL_ORDER.length - 1].id === 'boss_collector', '27 levels, THE COLLECTOR is last');

// ================================================================ locked skills
console.log('--- locked skills (first playthrough of stage 1)');
{
  const { sim, d } = mk('level1', ['ice']);
  ticks(sim, 90);
  d.hp = 1; d.camReadyAt = 0;
  sim.events = [];
  sim.actCoffee(d); sim.actCamera(d);
  const denied = sim.events.filter((e) => e.k === 'denied' && e.why === 'locked').length;
  check(denied === 2 && d.hp === 1, 'COFFEE and CAMERA are refused before they are unlocked');
  check(d.coffee === 0, 'no coffee charges before the skill exists');
  const c = sim.coffee[0];
  if (c) { d.x = tileCenter(c.tx); d.y = tileCenter(c.ty); ticks(sim, 2); check(!c.taken && d.coffee === 0, 'coffee cups cannot be picked up while locked'); }
}

// ================================================================ coffee
console.log('--- coffee');
{
  const { sim, d } = mk('level1');
  park(sim); ticks(sim, 90);
  d.hp = MAX_HP - 1;
  const cof = d.coffee;
  sim.actCoffee(d);
  check(d.coffee === cof - 1, 'E drinks a coffee charge');
  ticks(sim, 40);
  check(d.hp === MAX_HP, 'coffee heals exactly +1 heart');
  sim.actCoffee(d);
  check(d.coffee === cof - 1 && d.hp === MAX_HP, 'no overheal: refused at full HP');
  d.hp = 1; ticks(sim, 40); sim.actCoffee(d); sim.actCoffee(d); ticks(sim, 2);
  check(d.coffee === cof - 2, 'cooldown: a second sip right after is ignored');
  const lv = mk('level1'); const e = lv.sim.enemies[0];
  ticks(lv.sim, 60); lv.d.hp = 2; place(e, lv.d.x + 60, lv.d.y); lv.sim.actCoffee(lv.d);
  check(e.stunUntil <= lv.sim.now, 'coffee never stuns enemies');
}

// ================================================================ camera cone + distance
console.log('--- camera cone');
{
  const { sim, d, n } = mk('biblioteka');
  park(sim); ticks(sim, 90);
  const [tx, ty] = firstFree(sim);
  d.x = tileCenter(tx); d.y = tileCenter(ty); face(d, 0);
  n.x = tileCenter(1); n.y = tileCenter(1);
  const [a, b, c, behind] = [0, 1, 2, 3].map(() => sim.spawnEnemy('runner', 1, 1));
  for (const e of [a, b, c, behind]) e.def = { ...e.def, cameraResist: 1, abilities: [] }; // measure distance quality only
  place(a, d.x + 80, d.y - 14 + 10);   // close
  place(b, d.x + 170, d.y - 14 + 10);  // medium
  place(c, d.x + 250, d.y - 14 + 10);  // far
  place(behind, d.x - 100, d.y - 4);   // behind the camera
  d.camReadyAt = 0; sim.actCamera(d);
  const ms = (e: Enemy) => e.stunUntil - sim.now;
  check(Math.abs(ms(a) - STUN_MS * CAM_STUN[2]) < 2, 'close photo: full stun (PERFECT)');
  check(Math.abs(ms(b) - STUN_MS * CAM_STUN[1]) < 2, 'medium photo: shorter stun (GOOD)');
  check(Math.abs(ms(c) - STUN_MS * CAM_STUN[0]) < 2, 'far photo: shortest stun (WEAK)');
  check(ms(behind) <= 0, 'enemies outside the cone are not stunned');
  const fl = sim.events.find((e) => e.k === 'flash');
  check(!!fl && fl.k === 'flash' && fl.hits.length === 3, 'flash event lists the 3 hits with quality');
  const before = a.stunUntil; sim.actCamera(d);
  check(a.stunUntil === before, 'camera has a cooldown');
  const x0 = a.x; ticks(sim, 20);
  check(a.x === x0, 'stunned enemy does not move');
}

// ================================================================ stage 2 replay resistance
console.log('--- stage-2 enemy camera resistance');
{
  const { sim, d } = mk('boss_sonja');
  ticks(sim, 30);
  const pre = sim.spawnEnemy('prefect', 1, 1), eli = sim.spawnEnemy('elite', 1, 1);
  const [tx, ty] = firstFree(sim);
  d.x = tileCenter(tx); d.y = tileCenter(ty); face(d, 0);
  (sim as unknown as { boss: null }).boss = null;
  place(pre, d.x + 80, d.y - 4); place(eli, d.x + 70, d.y + 6);
  d.camReadyAt = 0; d.stunUntil = 0; sim.actCamera(d);
  check(Math.abs(pre.stunUntil - sim.now - STUN_MS * 0.4) < 2, 'school prefects: stun only 40% of normal');
  check(eli.stunUntil <= sim.now, 'optional elite is immune to the camera');
}

// ================================================================ boss photo damage by distance
console.log('--- boss camera damage');
for (const id of ['boss_branka', 'boss_collector']) {
  const { sim, d } = mk(id);
  const boss = sim.boss!;
  const hp0 = boss.hp;
  const tp = boss.target();
  const shoot = (dist: number) => {
    d.x = tp.x; d.y = tp.y + 14 + dist; face(d, 3); d.camReadyAt = 0; d.ko = false; d.drinkUntil = 0; d.stunUntil = 0;
    const h = boss.hp; sim.actCamera(d); return h - boss.hp;
  };
  check(shoot(250) === 0, `${id}: far photo does 0`);
  check(shoot(160) === 1, `${id}: medium photo does 1`);
  check(shoot(80) === 3, `${id}: close photo is a crit (3)`);
  check(boss.hp === hp0 - 4, `${id}: hp bookkeeping`);
}

// ================================================================ tasks: affinity + patience
console.log('--- tasks, affinity, patience');
function taskTicks(levelId: string, code: string, who: 'd' | 'n', skills: SkillId[]): number {
  const { sim, d, n } = mk(levelId, skills);
  park(sim); ticks(sim, 30);
  const idx = sim.stations.findIndex((s) => s.code === code);
  const s = sim.stations[idx];
  const p = who === 'd' ? d : n;
  p.x = tileCenter(s.tx); p.y = tileCenter(s.ty) + TILE;
  (who === 'd' ? n : d).x = tileCenter(1);
  sim.actInteract(p);
  if (p.task !== idx) return -1;
  let k = 0;
  while (!s.done && k < 3000) { sim.tick(); k++; }
  return k;
}
{
  const dm = taskTicks('drpd_hodnik', 'M', 'd', ['ice', 'coffee', 'camera']);
  const nm = taskTicks('drpd_hodnik', 'M', 'n', ['ice', 'coffee', 'camera']);
  check(dm > 0 && nm > 0, 'both characters can do every school task');
  const ratio = nm / dm;
  const want = AFFINITY.david.math! / AFFINITY.nemanja.math!;
  check(Math.abs(ratio - want) < 0.06, `David is faster at MATH (x${ratio.toFixed(2)}, expected x${want.toFixed(2)})`);
  const ns = taskTicks('drpd_igraonica', 'V', 'n', ['ice', 'coffee', 'camera']);
  const ds = taskTicks('drpd_igraonica', 'V', 'd', ['ice', 'coffee', 'camera']);
  check(ns < ds, 'Nemanja is faster at SLOVENIAN');
  const dmP = taskTicks('drpd_hodnik', 'M', 'd', ALL);
  check(Math.abs(dm / dmP - PATIENCE_TASK_MULT) < 0.05, `PATIENCE speeds tasks up x${(dm / dmP).toFixed(2)} (stacks with affinity)`);
}
{
  const { sim, d, n } = mk('level1');
  park(sim); ticks(sim, 30);
  const iA = sim.stations.findIndex((s) => s.role === 'nemanja');
  const sA = sim.stations[iA];
  d.x = tileCenter(sA.tx); d.y = tileCenter(sA.ty) + TILE;
  sim.actInteract(d);
  check(d.task === -1, 'character-specific station refuses the other player');
  n.x = d.x; n.y = d.y; sim.actInteract(n);
  check(n.task === iA && sim.playerSnap(n).tk === 'gaming', 'Nemanja at the arcade -> gaming animation in snapshot');
  n.inputs.push({ seq: 1, dx: 1, dy: 0 }); sim.tick();
  check(n.task === -1, 'moving away interrupts the task');
}
{
  const revive = (skills: SkillId[]) => {
    const { sim, d, n } = mk('level1', skills);
    park(sim); ticks(sim, 30);
    d.ko = true; d.hp = 0; d.koUntil = 1e9; d.reviveMs = 0;
    n.x = d.x + 30; n.y = d.y;
    let k = 0; while (d.ko && k < 600) { sim.tick(); k++; }
    return k;
  };
  const r0 = revive(['ice', 'coffee', 'camera']), r1 = revive(ALL);
  check(r1 < r0 * 0.75, `PATIENCE revives faster (${r0} -> ${r1} ticks)`);
}

// ================================================================ kids (stage 3)
console.log('--- kids');
{
  const { sim, d, n } = mk('drpd_hodnik');
  ticks(sim, 30);
  for (const e of sim.enemies) if (e.def.hostile) { e.state = 2; e.respawnAt = Infinity; }
  const kids = sim.enemies.filter((e) => e.kid);
  check(kids.length > 0 && kids.every((k) => !k.def.touchDamage), 'kids are non-hostile NPCs');
  for (const k of kids.slice(1)) { k.state = 2; k.respawnAt = Infinity; }
  const kid = kids[0];
  const [tx, ty] = firstFree(sim);
  d.x = tileCenter(tx); d.y = tileCenter(ty); face(d, 0); n.x = tileCenter(1); n.y = tileCenter(1); n.ko = true; n.koUntil = 1e12;
  place(kid, d.x + 90, d.y - 6);
  kid.def = { ...kid.def, speed: 0 }; kid.speed = 0;
  const hp = d.hp; d.camReadyAt = 0; d.invulnUntil = 0; sim.actCamera(d);
  check(d.hp === hp - 1 && sim.events.some((e) => e.k === 'penalty'), 'photographing a kid is penalised (-1 heart)');
  d.hp = 3; d.camReadyAt = 0;
  // quiz flow
  place(kid, d.x + 20, d.y - 6); kid.kid!.nextAskAt = 0; kid.kid!.target = null;
  let k = 0; while (!d.quiz && k < 200) { sim.tick(); k++; }
  check(!!d.quiz, 'a kid walks up and asks a question');
  const q = QUESTIONS[d.quiz!.q];
  sim.answer(d, (q.a + 1) % 3);
  check(!d.quiz && kid.kid!.sure && !kid.kid!.satisfied, 'wrong answer: kid not happy');
  k = 0; while (!d.quiz && k < 300) { sim.tick(); k++; }
  check(!!d.quiz && d.quiz.sure && sim.playerSnap(d).qs === 1, 'kid comes back to the SAME player: "are you sure?"');
  sim.answer(d, q.a);
  check(kid.kid!.satisfied && kid.state === 5, 'correct answer: kid is happy');
  ticks(sim, 30 * 20);
  check(!d.quiz, 'happy kid never bothers you again');
}

// ================================================================ stage 1: ice traps slop, crush
console.log('--- slop + ice');
{
  const { sim, d } = mk('level1', ['ice']);
  ticks(sim, 30);
  const e = sim.enemies.find((q) => q.def.iceCrushable)!;
  for (const q of sim.enemies) if (q !== e) { q.state = 2; q.respawnAt = Infinity; }
  const [fx, fy] = firstFree(sim);
  place(e, tileCenter(fx + 2), tileCenter(fy));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (sim.level.map[fy + dy][fx + 2 + dx] === '.') sim.ice[(fy + dy) * sim.cols + fx + 2 + dx] = 1;
  ticks(sim, 60);
  check(e.state === 1, 'slop boxed in by ice freezes solid');
  d.x = tileCenter(fx); d.y = tileCenter(fy); face(d, 0); d.iceReadyAt = 0;
  sim.actIce(d);
  check((e.state as number) === 2 && sim.events.some((ev) => ev.k === 'crush'), 'breaking the ice crushes the frozen slop');
}

// ================================================================ boss Studentska hrana: ice ring
console.log('--- boss STUDENTSKA HRANA');
{
  const { sim, d, n } = mk('boss_hrana', ['ice']);
  const boss = sim.boss as unknown as { x: number; state: string; hp: number; foot(): { x0: number; x1: number; y0: number; y1: number } } & typeof sim.boss;
  ticks(sim, 5);
  d.hp = n.hp = 99;
  const f = boss.foot();
  const ringTiles: [number, number][] = [];
  for (let x = f.x0 - 1; x <= f.x1 + 1; x++) ringTiles.push([x, f.y1 + 1]);
  for (let y = f.y0; y <= f.y1; y++) { ringTiles.push([f.x0 - 1, y]); ringTiles.push([f.x1 + 1, y]); }
  for (const [x, y] of ringTiles) if (sim.level.map[y][x] === '.') sim.ice[y * sim.cols + x] = 1;
  ticks(sim, 2);
  check(boss.state === 'frozen', 'walling her in with ice freezes her');
  const hp = boss.hp;
  const [bx, by] = [f.x0, f.y1 + 1];
  d.x = tileCenter(bx); d.y = tileCenter(by + 1); face(d, 3); d.iceReadyAt = 0; d.ko = false; d.stunUntil = 0; d.drinkUntil = 0;
  sim.actIce(d);
  check(boss.hp === hp - 1, 'breaking the frozen ring damages her');
  d.camReadyAt = 0; sim.actCamera(d);
  check(boss.hp === hp - 1, 'camera does nothing before it is unlocked');
}

// ================================================================ Sonja: exams
console.log('--- boss SONJA KUKMAN');
{
  const { sim, d } = mk('boss_sonja', ['ice', 'coffee']);
  ticks(sim, 5);
  const boss = sim.boss!;
  const hp = boss.hp;
  const s = sim.stations.find((q) => q.task === 'exam')!;
  s.progress = 0.999; d.x = tileCenter(s.tx); d.y = tileCenter(s.ty) + TILE; d.stunUntil = 0; d.ko = false;
  sim.actInteract(d);
  ticks(sim, 3);
  check(boss.hp === hp - 1, 'finishing an exam desk damages Sonja');
  check(s.done && s.rechargeAt > sim.now, 'exam desk recharges');
}

// ================================================================ stage 4 debuffs
console.log('--- ZIVOT.EXE debuffs');
{
  const { sim, d } = mk('porezna');
  ticks(sim, 30);
  sim.lockSkill(d, 4000);
  const locked = Object.keys(d.locks)[0] as SkillId;
  sim.events = [];
  d.iceReadyAt = 0; d.camReadyAt = 0; d.hp = 2;
  if (locked === 'ice') sim.actIce(d); else if (locked === 'camera') sim.actCamera(d); else sim.actCoffee(d);
  check(sim.events.some((e) => e.k === 'denied' && e.why === 'debuff'), `bureaucrat lock blocks ${locked} ("FALI VAM JEDAN PAPIR")`);
  ticks(sim, 30 * 5);
  check(sim.playerSnap(d).lk.length === 0, 'lock expires');
  sim.applyEffect(d, 'debt', 3000, 0, 0);
  check(sim.playerSnap(d).db === 1, 'money projectile applies DEBT (slower + longer cooldowns)');
  const o = sim.spawnEnemy('official', 2, 2);
  check(o.def.abilities.some((a) => a.kind === 'icebreak'), 'government official can destroy ice');
}

// ================================================================ KO / fail / restart (unchanged rules)
console.log('--- KO + restart');
{
  const { sim, d, n } = mk('level1');
  ticks(sim, 90);
  const e = sim.enemies.find((q) => q.def.touchDamage)!;
  for (const q of sim.enemies) if (q !== e) { q.state = 2; q.respawnAt = Infinity; }
  e.def = { ...e.def, abilities: [] };
  place(e, d.x, d.y - 12);
  ticks(sim, 1);
  check(d.hp === MAX_HP - 1, 'enemy contact removes one heart');
  place(e, d.x, d.y - 12); ticks(sim, 1);
  check(d.hp === MAX_HP - 1, 'brief invulnerability after a hit');
  e.x = 3000; e.y = 3000; e.state = 2; e.respawnAt = Infinity;
  d.ko = true; n.ko = true; d.koUntil = n.koUntil = sim.now + 99999;
  ticks(sim, 1);
  check(sim.events.some((ev) => ev.k === 'fail'), 'both knocked out -> fail');
  ticks(sim, 90);
  check(!d.ko && !n.ko && d.hp === MAX_HP, 'level restarts after a fail');
}

// ================================================================ Branka (original boss kept)
console.log('--- boss BRANKA');
{
  const { sim: bs, d: a, n: b } = mk('boss_branka');
  const boss = bs.boss as unknown as { hp: number; x: number; y: number; state: string; dead: boolean; enraged: boolean; fireballs: unknown[] };
  check(boss.hp === LEVELS.boss_branka.boss!.hp, 'Branka spawns with full HP');
  a.hp = b.hp = 99;
  ticks(bs, 30 * 12);
  const ev = (k: string) => bs.events.filter((e) => e.k === k).length;
  check(ev('bossCast') > 0 || ev('meteorLand') > 0, 'Branka attacks');
  boss.hp = 2;
  let done = false;
  a.camReadyAt = 0; a.ko = false; a.stunUntil = 0; a.drinkUntil = 0; a.x = boss.x; a.y = boss.y + 90; face(a, 3); bs.actCamera(a);
  check(boss.dead, 'Branka is defeated at 0 HP');
  for (let i = 0; i < 30 * 5 && !done; i++) done = bs.tick();
  check(done, 'defeating the boss completes the level');
}

// ================================================================ chasing + mob collisions
console.log('--- chase + bonk');
{
  const { sim, d, n } = mk('level1');
  park(sim); ticks(sim, 5);
  d.hp = n.hp = 99; n.x = tileCenter(1); n.y = tileCenter(11); n.ko = true; n.koUntil = 1e12;
  const e = sim.spawnEnemy('slop_blob', 18, 1);
  e.def = { ...e.def, abilities: [] };
  const dist0 = Math.hypot(e.x - d.x, e.y - d.y);
  let closest = dist0;
  for (let k = 0; k < 30 * 30; k++) { sim.tick(); closest = Math.min(closest, Math.hypot(e.x - d.x, e.y - d.y)); }
  check(closest < 60, `mob chases across the map to the player (${Math.round(dist0)}px -> ${Math.round(closest)}px)`);
}
{
  const { sim, d, n } = mk('level1');
  park(sim); ticks(sim, 5);
  for (const p of [d, n]) { p.hp = 99; }
  const [fx, fy] = firstFree(sim);
  // player to the right; two mobs in a row walking toward each other's tile
  d.x = tileCenter(fx + 5); d.y = tileCenter(fy); n.ko = true; n.koUntil = 1e12;
  const a = sim.spawnEnemy('slop_blob', fx, fy), b = sim.spawnEnemy('slop_blob', fx + 1, fy);
  for (const m of [a, b]) m.def = { ...m.def, abilities: [] };
  b.stunUntil = 0; b.state = 0;
  // b stands still (stunned for a moment is not allowed: make it awake but slow), a runs into it
  b.speed = 0.0001;
  let bonk = false;
  const rnd = Math.random; Math.random = () => 0.5; // no random turns in this test
  for (let k = 0; k < 60 && !bonk; k++) { sim.tick(); bonk = sim.events.some((ev) => ev.k === 'bonk'); }
  Math.random = rnd;
  check(bonk && a.stunUntil > sim.now && b.stunUntil > sim.now, 'two mobs crashing into each other are both knocked out');
  ticks(sim, 30 * 4);
  check(a.stunUntil <= sim.now, 'they wake up again after a few seconds');
}

// ================================================================ exit door + equal food
console.log('--- exit + food');
{
  const { ITEM_OWNER } = await import('../shared/items.ts');
  const normal = LEVEL_ORDER.filter((l) => !l.boss);
  const ok = normal.every((L) => {
    const c = { david: 0, nemanja: 0, both: 0 } as Record<string, number>;
    L.items.forEach((i) => c[ITEM_OWNER[i.kind]]++);
    return c.david === 6 && c.nemanja === 6 && c.both === 2;
  });
  check(ok, 'every level: 6 food for David, 6 for Nemanja, 2 shared');
  const { sim, d, n } = mk('menza');
  park(sim); ticks(sim, 5);
  sim.items.forEach((q) => { q.taken = true; });
  ticks(sim, 2);
  const ex = sim.level.map[0].indexOf('E');
  d.x = tileCenter(ex); d.y = tileCenter(0) + 6;
  ticks(sim, 2);
  check(d.exited && sim.events.some((e) => e.k === 'exited') && sim.playerSnap(d).ex === 1, 'walking into the open exit -> player disappears');
  const hp = d.hp; d.invulnUntil = 0;
  check(!sim.hurt(d, 0, 0) && d.hp === hp, 'an exited player cannot be hurt');
  check(!sim.completed, 'level not done until the teammate also exits');
  n.x = tileCenter(ex + 1); n.y = tileCenter(0) + 6;
  let done = false; for (let k = 0; k < 5 && !done; k++) done = sim.tick();
  check(done, 'second player through the door -> level complete');
}

// ================================================================ solo mode
console.log('--- solo');
{
  const d = new Player('d', 't', 'david');
  const sim = new LevelSim(LEVELS.level1, [d], ALL, true);
  park(sim); ticks(sim, 30);
  const it = sim.items.findIndex((i) => i.kind === 'pizza');
  d.x = tileCenter(sim.items[it].tx); d.y = tileCenter(sim.items[it].ty); ticks(sim, 2);
  check(sim.items[it].taken, "solo: David can pick up Nemanja's food");
  const iA = sim.stations.findIndex((q) => q.role === 'nemanja');
  d.x = tileCenter(sim.stations[iA].tx); d.y = tileCenter(sim.stations[iA].ty) + TILE;
  sim.actInteract(d);
  check(d.task === iA, "solo: David can do Nemanja's arcade task");
  sim.items.forEach((q) => { q.taken = true; }); sim.stations.forEach((q) => { q.done = true; }); sim.gateOpen = true;
  ticks(sim, 2);
  check(sim.exitOpen, 'solo: exit opens');
  const ex = sim.level.map[0].indexOf('E');
  d.x = tileCenter(ex); d.y = tileCenter(0) + 4;
  let done = false; for (let k = 0; k < 5 && !done; k++) done = sim.tick();
  check(done, 'solo: one player at the exit completes the level');
  const s2 = new LevelSim(LEVELS.level1, [new Player('x', 't', 'nemanja')], ALL, true);
  park(s2); ticks(s2, 30); s2.players[0].invulnUntil = 0; s2.players[0].hp = 1;
  s2.hurt(s2.players[0], 0, 0); ticks(s2, 1);
  check(s2.events.some((e) => e.k === 'fail'), 'solo: getting knocked out restarts the level');
  const sb = new LevelSim(LEVELS.boss_branka, [new Player('y', 't', 'david')], ALL, true);
  check(sb.boss!.hp === Math.ceil(LEVELS.boss_branka.boss!.hp * 0.7), `solo: boss has 30% less HP (${sb.boss!.hp})`);
  const co = mk('level1');
  const pz = co.sim.items.findIndex((i) => i.kind === 'pizza');
  co.d.x = tileCenter(co.sim.items[pz].tx); co.d.y = tileCenter(co.sim.items[pz].ty); ticks(co.sim, 2);
  check(!co.sim.items[pz].taken, 'co-op unchanged: David still refuses pizza');
}

console.log(fails ? `\n${fails} FAILED` : '\nSIM RULES PASSED');
process.exit(fails ? 1 : 0);
