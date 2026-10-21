/** Questions children ask in DRPD. a = index of the correct answer. */
export interface Question { s: 'MATEMATIKA' | 'ISTORIJA' | 'SLOVENSKI' | 'HEMIJA'; q: string; o: [string, string, string]; a: number }

export const QUESTIONS: Question[] = [
  { s: 'MATEMATIKA', q: 'KOLIKO JE 7 X 8?', o: ['54', '56', '64'], a: 1 },
  { s: 'MATEMATIKA', q: 'KOLIKO JE 144 / 12?', o: ['12', '14', '11'], a: 0 },
  { s: 'MATEMATIKA', q: 'KOLIKO JE 15 + 27?', o: ['32', '43', '42'], a: 2 },
  { s: 'MATEMATIKA', q: 'KOLIKO STRANICA IMA SESTOUGAO?', o: ['5', '6', '8'], a: 1 },
  { s: 'MATEMATIKA', q: 'KOLIKO JE 9 NA KVADRAT?', o: ['81', '18', '99'], a: 0 },
  { s: 'ISTORIJA', q: 'KADA JE PAO BERLINSKI ZID?', o: ['1989', '1991', '1945'], a: 0 },
  { s: 'ISTORIJA', q: 'KO JE BIO PRVI COVEK NA MESECU?', o: ['GAGARIN', 'ARMSTRONG', 'TESLA'], a: 1 },
  { s: 'ISTORIJA', q: 'KADA JE POCEO PRVI SVETSKI RAT?', o: ['1914', '1918', '1939'], a: 0 },
  { s: 'ISTORIJA', q: 'KO JE IZUMEO NAIZMENICNU STRUJU?', o: ['EDISON', 'TESLA', 'PUPIN'], a: 1 },
  { s: 'SLOVENSKI', q: 'KAKO SE NA SLOVENACKOM KAZE HVALA?', o: ['HVALA', 'DANKE', 'GRAZIE'], a: 0 },
  { s: 'SLOVENSKI', q: 'STA ZNACI SLOVENACKO "KRUH"?', o: ['HLEB', 'KRAVA', 'KRUG'], a: 0 },
  { s: 'SLOVENSKI', q: 'STA ZNACI "ZAJTRK"?', o: ['VECERA', 'DORUCAK', 'RUCAK'], a: 1 },
  { s: 'SLOVENSKI', q: 'GLAVNI GRAD SLOVENIJE JE?', o: ['MARIBOR', 'KOPER', 'LJUBLJANA'], a: 2 },
  { s: 'SLOVENSKI', q: 'STA ZNACI "VODA"?', o: ['VODA', 'VATRA', 'VAZDUH'], a: 0 },
  { s: 'HEMIJA', q: 'HEMIJSKA FORMULA VODE JE?', o: ['CO2', 'H2O', 'O2'], a: 1 },
  { s: 'HEMIJA', q: 'KOJI GAS UDISEMO DA BISMO ZIVELI?', o: ['KISEONIK', 'HELIJUM', 'AZOT'], a: 0 },
  { s: 'HEMIJA', q: 'SIMBOL ZLATA JE?', o: ['GO', 'AU', 'AG'], a: 1 },
  { s: 'HEMIJA', q: 'NA KOLIKO STEPENI KLJUCA VODA?', o: ['90', '100', '120'], a: 1 },
];
export const QUIZ_SURE = 'JESI LI SIGURAN DA JE TO TACAN ODGOVOR?';
