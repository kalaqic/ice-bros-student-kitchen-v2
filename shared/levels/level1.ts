import { buildLevel } from '../level.ts';
import { ENEMIES } from '../enemies.ts';

export const LEVEL1 = buildLevel({
  id: 'level1', number: 1, stage: 1, name: 'STUDENTSKA KUHINJA', subtitle: 'STUDENT SURVIVAL', theme: 'kitchen',
  intro: 'SKUPITE SVU HRANU, PA OBOJICA NA IZLAZ! ZAROBI SLOP LEDOM.',
  map: [
    '#########EE#########',
    '#FFK.pn.C....C..zSS#',
    '#c......C....C.....#',
    '#..TT.......b..TT..#',
    '#.......CCCC.....m.#',
    '#.L.....C..C.....A.#',
    '#s....p.C1nC.......#',
    '#.......CGGC.......#',
    '#..TT.z.......3TT..#',
    '#.cTT..........TT..#',
    '#.....CC.k..CC...b.#',
    '#..D...2..m..sk.N..#',
    '####################',
  ],
}, (t) => ENEMIES[t].speed);
