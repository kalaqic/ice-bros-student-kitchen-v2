# ICE BROS — Online co-op za Davida i Nemanju

Originalna 2-player online browser igra (inspirisana *osećajem* klasičnih ice-arcade igara, bez kopiranja tuđih asseta).
Dva igrača, dva računara, jedna soba. Pravite i razbijate led, skupljate hranu, kafom se lečite, foto-blicom omamljujete neprijatelje i zajedno izlazite iz Studentske kuhinje.

---

## Brzi start (lokalno)

Potrebno: **Node.js 18+**.

```bash
npm install
npm run build      # pravi client/dist
npm start          # server + igra na http://localhost:2567
```

Otvori `http://localhost:2567` u dva prozora/taba (ili na dva računara, vidi dole), izaberi lika → **CREATE ROOM** → drugi igrač **JOIN ROOM** i unese kod (ili otvori link iz dugmeta *KOPIRAJ LINK*).

Dev mod (auto rebuild klijenta + restart servera):

```bash
npm run dev        # http://localhost:2567
```

`PORT` env promenljiva menja port (`PORT=10000 npm start`).

### Igranje sa dva računara

* **Ista mreža (LAN):** pokreni server na jednom računaru, drugi otvara `http://<IP-tog-racunara>:2567`.
* **Preko interneta:** deploy (Render, ispod) ili privremeni tunel, npr. `npx localtunnel --port 2567` / `ngrok http 2567`. WebSocket ide na isti host (`/ws`), pa radi i preko https.

### Deploy na Render

Repo već ima `render.yaml`. Na render.com: **New → Blueprint** → izaberi repo. Ručno:
* Build command: `npm install && npm run build`
* Start command: `npm start`
* Health check: `/health`

Bilo koji Node host koji podržava WebSockets radi isto (Railway, Fly.io, VPS…). Jedan proces servira i igru i multiplayer.

---

## Kontrole (podrazumevane — sve se menjaju u PODESAVANJA)

| Taster | Akcija |
|---|---|
| **W A S D** | kretanje (i u lobiju) |
| **SPACE** | LED: napravi liniju leda u pravcu gledanja / razbij led ispred sebe |
| **E** | KAFA: +1 srce (kad se otključa) |
| **F** | KAMERA: blic u konusu ispred tebe (kad se otključa) |
| **Q** | INTERAKCIJA: počni / prekini zadatak pored stanice |
| **ESC** | pauza meni (NASTAVI / PODESAVANJA / VESTINE / NAZAD U LOBI) — igra online i dalje teče |
| **1–6** | emote; dok te dete nešto pita, **1–3** su odgovori (ili klik) |
| **R** / Enter | READY u lobiju |
| **M** | brzo utišavanje svega (ako M nije dodeljen nekoj akciji) |

### Podešavanja (dugme u meniju, lobiju i ESC meniju)
* **KONTROLE:** klikni na taster pored akcije → pritisni novi taster. Ako je taster već zauzet, pojavi se upozorenje (*"TASTER F VEC KORISTI: KAMERA"*) i promena se odbija; brojevi 1–6 su rezervisani za emote/odgovore. **RESET NA PODRAZUMEVANO** vraća WASD/SPACE/E/F/Q/ESC. Čuva se u `localStorage` (`icebros.bindings`), a sva igra čita tastere iz tog sistema (`client/src/engine/bindings.ts`).
* **ZVUK:** klizači za muziku i efekte + UTISAJ za svaki posebno. Čuva se u `icebros.audio`. Muzika kreće tek posle prvog klika/tastera (browser ne dozvoljava autoplay).

### Muzika
Ubaci pesme u **`assets/audio/`** i restartuj server (server ih sam pokupi pri startu, bez build-a). Imena po slotu:
`menu.mp3`, `lobby.mp3`, `stage1.mp3` … `stage4.mp3`, `boss.mp3`, a **`music.mp3`** važi za sve što nema svoj fajl. Radi i `.ogg/.wav/.m4a`. Dok nema nijednog fajla svira ugrađena chiptune melodija (u podešavanjima piše šta trenutno svira).

---

## Progresija i veštine

Napredak se čuva u browseru (`icebros.progress`) i šalje serveru pri ulasku u sobu; soba spaja napredak oba igrača, pa veštine važe za **obojicu**. Pređen nivo otključava sledeći; pobeda nad bosom završava stage i daje nagradu (ekran **SKILL UNLOCKED**). Pregled: dugme **VESTINE**.

| Veština | Kako se dobija | Šta radi |
|---|---|---|
| **LED** | od početka | pravi/razbija ledene zidove, zarobljava i drobi neprijatelje |
| **KAFA** | Stage 1 (boss Studentska hrana) | +1 srce, nema prelečenja, ograničen broj šolja + cooldown, ne omamljuje |
| **KAMERA** | Stage 2 (boss Sonja Kukman) | blic u konusu ispred tebe; neprijatelji omamljeni (bliže = duže), bosovi primaju štetu: daleko 0 / srednje 1 / izbliza 3 (kritično). Cooldown 6s |
| **STRPLJENJE** (pasivno) | Stage 3 (boss Branka) | zadaci ~35% brže, podizanje saigrača ~35% brže |

Zaključana veština se ne može koristiti (server je odbija, HUD piše *ZAKLJUCANO — POSLE STAGE X*). Kad ponovo igraš raniji stage, otključane veštine su dostupne.

Brzina zadatka = `osnovna × afinitet lika × strpljenje` (`shared/tasks.ts`):
* **David:** matematika 1.5×, istorija 1.4×, slovenački 0.8×
* **Nemanja:** slovenački 1.5×, matematika 0.85×, hemija 1.15×
Obojica mogu da rade svaki školski zadatak; KOD je samo Davidov (laptop), ARKADA samo Nemanjina (slušalice + džojstik).

## Kampanja: 4 stagea, 15 nivoa

**Stage 1 — STUDENTSKA KUHINJA** (Kuhinja · Menza · **boss STUDENTSKA HRANA**). Samo led. Slop neprijatelji: kad ih zazidaš ledom smrznu se, a kad razbiješ led pored njih — smrvljeni (vraćaju se posle 15s). Boss je ogromni slop: pljuje mast, sos koji usporava, nudle, ostavlja blato na podu i priziva slopove. Zazidaj je ledom (5+ blokova oko nje) dok se ne smrzne, pa razbij taj led → šteta. Nagrada: **KAFA**.

**Stage 2 — EKONOMSKA SKOLA** (Biblioteka · Učionica 12 · Arhiva · **boss SONJA KUKMAN**). Neprijatelji imaju kamere: sporiji su, ali posle crvene isprekidane linije (upozorenje) bljesnu i omame te. Sonja se pobeđuje rešavanjem ISPITA na klupama (Q), uz izbegavanje blica, tornada papira, F-ocena i bačenih testova. Nagrada: **KAMERA**. Na ponovnom igranju školski neprijatelji su "navikli na blic": omamljenje traje samo 40%, a elitni prefekt je potpuno imun.

**Stage 3 — DRPD** (Hodnik · Igraonica · Učionica · **boss BRANKA**). Deca nisu neprijatelji: trče, blokiraju put i prilaze da pitaju pitanje (matematika, istorija, slovenački, hemija). Tačan odgovor → dete je srećno i više ne smeta. Pogrešan → vraća se istom igraču: *"JESI LI SIGURAN DA JE TO TACAN ODGOVOR?"*. Slikanje ili zazidavanje deteta = kazna (−1 srce). Odrasli radnici su pravi neprijatelji. Zadaci (Q) otvaraju rešetke/izlaz. Branka ostaje kao ranije (vatrene kugle, oznake na podu, udarni talas), sad sa kamerom po daljini. Nagrada: **STRPLJENJE**.

**Stage 4 — ZIVOT.EXE** *(skola je bila tutorijal)* (Poreska uprava · Banka · Opština · **finalni boss THE COLLECTOR**). Sve veštine zajedno, protiv kombinacija:
* **Poreznik** baca račune · **Birokrata** zaključava nasumičnu veštinu (*"FALI VAM JEDAN PAPIR!"*) · **Bankar** baca novac koji daje **DUG** (sporiji si, cooldown duži) · **Stanodavac** baca ključeve · **Regruter** juri (dash) · **Osiguranje** baca polise koje usporavaju · **Službenik** razbija tvoj led i pišti zviždaljkom.
* **THE COLLECTOR**: TAX / RENT / INTEREST / FEE / LATE FEE / SERVICE FEE računi, kiša novca, dug koji navodi, udarac oko sebe. Šteta samo kamerom — izdaleka 0, izbliza kritično, pa moraš rizikovati.

Težina raste kroz mehanike, ne kroz HP: s1 led, s2 omamljivanje + timing, s3 prioriteti + deca + afiniteti, s4 sve odjednom.

`ICEBROS_UNLOCK_ALL=1 npm start` otključava sve (za testiranje). Ako neko izgubi vezu usred nivoa, igra se pauzira do 45s; refresh/link vraća igrača na mesto.

---

## Arhitektura

```
assets/            originali (NE menjaju se) + assets/runtime/ (izvedeni sprite-ovi koje igra učitava)
client/            browser klijent (TypeScript, canvas renderer, esbuild bundle)
  src/engine/      game loop, skaliranje, input, pixel font, UI paneli, čestice, synth zvuk
  src/game/        prikaz likova (animacije), client prediction + interpolacija, sesija
  src/scenes/      MenuScene, LobbyScene (hodanje po snowy_lobby.png), LevelScene (+HUD)
  src/net/         WebSocket + auto-reconnect + resume tokeni
server/src/        autoritativni Node server (http + ws)
  Room.ts          sobe, kodovi, ready, faze, reconnect, slanje snapshot-a
  LevelSim.ts      simulacija nivoa: kretanje, led, hrana, neprijatelji (sposobnosti iz podataka), projektili, zone na podu,
                   veštine (kapija canUse), kamera-konus, zadaci + afiniteti, deca + kviz, dug/omamljenje/zaključavanje, izlaz
  Boss.ts          Studentska hrana, Sonja Kukman, Branka, The Collector (zajednička osnova: HP, bes, šteta od slike)
shared/            kod koji koriste i server i klijent
  physics.ts       isto kretanje/kolizija na serveru i u predikciji klijenta
  levels/          podaci nivoa (mapa kao ASCII, itemi, neprijatelji, stanice)
  skills.ts        veštine + kad se otključavaju (skillsFor), strpljenje
  stages.ts        4 stagea: ime, neprijatelji (1-6 u mapi), nagrada, muzika, izgled
  tasks.ts         tipovi zadataka (taskAnimationType coding/gaming/studying) + AFINITETI likova
  enemies.ts       neprijatelji kao podaci: brzina, sposobnosti (flash/throw/lock/icebreak/dash/whistle), otpor na kameru
  camera.ts        konus kamere, daljine, kvalitet slike
  quiz.ts          pitanja dece
  bosses.ts        imena bosova + šteta od slike po daljini
  levels/          level1.ts + campaign.ts (nivoi 2-15), index.ts (redosled, otključavanje)
  protocol.ts      tipovi poruka
tools/             asset pipeline (python) + testovi
```

**Mreža:** server tick 30 Hz je jedini izvor istine (pozicije, neprijatelji, led, hrana, HP, cooldown-i, stanice, vrata, završetak). Klijent šalje samo *ulaze* (`dx/dy ∈ {-1,0,1}` sa sekvencom) i akcije (`ice/coffee/camera`) — nikad koordinate. Svoj lik klijent predviđa istim `shared/physics.ts` kodom i usklađuje sa serverom; drugi igrač i neprijatelji se interpoliraju (~100ms). Snapshot je mali JSON; lista leda se šalje samo kad se promeni.

**Zašto nije Phaser/Vite:** okruženje u kome je igra pravljena nije imalo pristup npm registry-ju, pa je napravljen mali namenski canvas engine (bez zavisnosti) da bi sve moglo da se testira sa dva prava browsera. Renderer je odvojen od logike (`shared/` + `server/`), pa se kasnije može zameniti Phaser-om bez diranja multiplayera.

### Dodavanje sadržaja

* **Novi nivo:** kopiraj `shared/levels/level1.ts`, izmeni ASCII mapu (legenda u `shared/level.ts`), registruj u `shared/levels/index.ts`. Server validira mapu pri startu.
* **Zadaci:** slovo na mapi = tip zadatka (`TASK_BY_CODE` u `shared/tasks.ts`: L kod, A arkada, M matematika, Y istorija, V slovenački, Q hemija, U ispit). Novi tip: dodaj ga u `TASKS` sa `anim` (coding/gaming/studying) i po želji afinitete. Kad su svi zadaci gotovi, otvaraju se `G` rešetke (ili izlaz ako nema rešetke).
* **Novi neprijatelj:** jedan unos u `shared/enemies.ts` (sprite ključ, brzina, sposobnosti) + broj 1-6 u `roster`-u stagea.
* **Nova veština / nagrada:** `shared/skills.ts` (`unlockStage`) i `reward` u `shared/stages.ts`.
* **Boss-ovi:** `shared/bosses.ts` već ima Nemanjinog tatu ("SVE SE MOZE KAD SE HOCE", "NEMANJA NADJI POSAO", "A NEMANJA KAKO DAVID MOZE") i Profesora ("KOJA JE MARZA PRIHVATLJIVA NA TRZISTU", "TRZISNI NACRT 8. POGLAVLJE") kao podatke: faze, napadi, citati.
* **Zvuk:** efekti su sintetizovani (`client/src/engine/audio.ts`); muzika iz `assets/audio/` (vidi gore), slotovi menu/lobby/stage1-4/boss.

### Asseti

Originali iz `assets/` se ne menjaju. `npm run assets` (python3 + pillow, numpy, scipy) ponovo pravi `assets/runtime/`:
* `tools/extract_sprites.py` — iseca idle/walk/coffee/victory frejmove i iteme iz `david_sheet.png` i `nemanja_sheet.png` (Nemanjinom sheetu uklanja crnu pozadinu), logo/ice blok/šolju/nudle iz concept arta, portrete za HUD.
* `tools/make_tiles.py` — pixel-art pločice kuhinje, neprijatelji (buđ, jogurt, prljavi sudovi), srca, kamera — u paleti concept arta.

* `tools/extract_sprites_v2.py` — bolje animacije iz `david_nemanja_sheet.png` (idle, walk za lobi, run za nivo, slikanje kamerom, flash efekat) i `ice_shot.png` (bacanje leda, ICE BLAST projektil, ICE BLOCK CREATE). Hodanje/trčanje koristi originalni walk ciklus iz prvih sheetova. `celebration.png` daje slavlje na kraju nivoa, a `koncked_down.png` padanje, ležanje (traženje pomoći), scenu podizanja saigrača i bro handshake posle revive-a (`assets/runtime/duo/`). Primeri omamljenih neprijatelja iz sheeta se namerno ne koriste: svaki neprijatelj dobija zvezdice iznad glave.

* `tools/extract_stages.py` — sve za 4 stagea iz sheetova u `assets/` (animacije zadataka David laptop / Nemanja slušalice+džojstik, neprijatelji, bosovi, projektili, efekti, pločice i nameštaj po stageu, pozadine) u `assets/runtime/stage/` + `manifest.json`. Klijent učitava po ključu iz manifesta; ako neki ključ fali, crta jasan privremeni placeholder (ne menja logiku), pa se novi crtež samo ubaci i ponovo pokrene skripta.

`assets/concept_art_ref.png` je kopija `concept art.png` (bez razmaka u imenu, za skripte).

---

## Testovi

```bash
npm run verify               # typecheck + pravila simulacije + build
npm test                     # 57 testova pravila: progresija, zaključane veštine, kafa, konus kamere, otpor stage 2,
                             # šteta bosu po daljini, afiniteti, strpljenje (zadaci + revive), deca + kviz, led/slop, bosovi, dug/lock

# sa pokrenutim serverom:
npm start &  npm run test:net                         # 2 bota: soba, sync, led, cooldown, pauza/resume, zaključane veštine, spajanje napretka
ICEBROS_PEACEFUL=1 ICEBROS_DEBUG=1 npm start &  npm run test:playthrough   # 2 bota prelaze svih 11 normalnih nivoa (zadaci sa Q, kviz dece, kapije, izlaz)
```

`ICEBROS_DEBUG=1 npm start` uključuje dev komande iz browser konzole: `__net.send({t:'debug', cmd:'collectAll' | 'hurt' | 'ko' | 'stations' | 'toStation' | 'toExit' | 'killAll' | 'nearBoss' | 'bossLow' | 'bossKill' | 'unlockAll' | 'resetProgress'})`.

Stari prototip (`game.mjs`, `index.html`) je premešten u `legacy/` radi reference.
