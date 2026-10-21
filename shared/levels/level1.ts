import { buildLevel } from '../level.ts';
import { ENEMIES } from '../enemies.ts';

export const LEVEL1 = buildLevel({
  id: 'level1', number: 1, stage: 1, name: 'STUDENTSKA KUHINJA', subtitle: 'STUDENT SURVIVAL', theme: 'kitchen',
  intro: 'SKUPITE SVU HRANU, PA OBOJICA NA IZLAZ! ZAROBI SLOP LEDOM.',
  map: [
    '#########EE#########',
    '#FFK.zn.C....C..mSS#',
    '#p......C....C.....#',
    '#..TT.......b..TT..#',
    '#.......CCCC.....s.#',
    '#.L.....C..C.....A.#',
    '#s....c.C1nC.......#',
    '#.......CGGC.......#',
    '#..TT.b.......3TT..#',
    '#.mTT..........TTp.#',
    '#.....CC.k..CC...z.#',
    '#..D...2..n..ck.N..#',
    '####################',
  ],
}, (t) => ENEMIES[t].speed);
