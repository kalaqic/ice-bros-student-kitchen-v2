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

## Kontrole

| Taster | Akcija |
|---|---|
| **WASD** (ili strelice) | kretanje (i u lobiju) |
| **SPACE** | napravi liniju leda u pravcu gledanja / razbij led ispred sebe |
| **E** | popij kafu → +1 srce (ograničen broj kafa, pokupi nove šolje u nivou) |
| **F** | foto-blic: omami neprijatelje u krugu oko tebe (~2.7s), cooldown 6s |
| **1–4** | emote (ĆAO!, AJMO!, GG, HAHA) |
| **R** / Enter | READY u lobiju |
| **M** | zvuk on/off |

Isprekidani kvadrat ispred tvog lika pokazuje gde će SPACE napraviti (beli) ili razbiti (crveni) led.

## Pravila Nivoa 1 — Studentska kuhinja

* **Hrana:** plavi krug = Davidova (protein, kreatin, meal prep), crno-beli = Nemanjina (pica, burger, sok), zlatni = zajednička (nudle).
  Pogrešna hrana ostaje na mapi, lik kaže *"BLJAK. GDE SU MAKROI?"* / *"BLJAK. GDE JE BURGER?"* i kratko je usporen.
* **Co-op zagonetka:** David drži svoj **coding terminal** (KOD), Nemanja svoju **arkadu**. Kad su oba aktivirana, otvara se magacin u sredini (unutra su nudle i kafa).
* **Zdravlje:** 3 srca. Dodir neprijatelja = −1 srce, kratka neranjivost i odbacivanje. Na 0 srca si **KO** — saigrač stane pored tebe i podigne te (ili ustaješ sam posle 10s). Ako obojica padnu, nivo se restartuje.
* **Kafa** leči (ne napada). **Foto-blic** je jedino omamljivanje (ne ubija). **Led** blokira neprijatelje — možeš ih i zazidati.
* Kad je sva hrana skupljena, otvaraju se vrata gore. **Obojica** moraju da uđu → **LEVEL COMPLETE** → nazad u lobi ili ponovo.

**Pokretanje bez npm-a:** `npm run build` pravi i `server/dist/server.mjs` (server sa svim zavisnostima u jednom fajlu), pa igra radi samo sa `node server/dist/server.mjs`, ili duplim klikom na **`POKRENI ICE BROS.command`** na Macu.

## Kampanja (11 nivoa)

1 Studentska kuhinja · 2 Menza · 3 Hodnik doma · 4 Biblioteka · 5 Vešeraj · 6 Soba 404 · 7 Laboratorija · 8 Arhiva · 9 Teretana · 10 Gaming soba · **11 Kancelarija: BOSS BRANKA**

Pređeni nivo otključava sledeći (otključavanje važi za sobu). U lobiju strelicama `<` `>` biraš nivo, a posle pobede dugme vodi pravo na sledeći.

**Branka, šefica haosa:** stoji gore na sredini i jedino je **foto-blic (F)** povređuje (−1 HP, ima 40 HP i kratko je omami). Da bi je uslikao, moraš blizu, a to je rizično:
* **Vatrena kugla:** gađa direktno jednog od vas. Ledeni blok je zaustavlja (i istopi se), pa led služi kao štit.
* **Ruke gore:** po podu se pojave crvene oznake, a posle ~2s na njih padne vatra. Skloni se sa oznake.
* **Udarni talas:** ako stojiš preblizu, digne talas oko sebe.
* **Ispod pola HP-a pobesni:** brže baca, tri kugle odjednom, više oznaka.

Šolje kafe u uglovima su za lečenje. Kad joj HP padne na 0, nivo je pređen.

`ICEBROS_UNLOCK_ALL=1 npm start` otključava sve nivoe (za testiranje).

Ako neko izgubi vezu usred nivoa, igra se pauzira do 45s. Refresh ili ponovo otvoren link vraća igrača na njegovo mesto.

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
  LevelSim.ts      simulacija nivoa: kretanje, led, hrana, neprijatelji, HP, kafa, blic, stanice, izlaz
shared/            kod koji koriste i server i klijent
  physics.ts       isto kretanje/kolizija na serveru i u predikciji klijenta
  levels/          podaci nivoa (mapa kao ASCII, itemi, neprijatelji, stanice)
  bosses.ts        podaci za buduće boss-ove (Nemanjin tata, Profesor)
  levels/campaign.ts  nivoi 2-11 (stvari, neprijatelji i spawn upisani pravo u ASCII mapu)
server/src/Boss.ts  Branka: vatrene kugle, oznake + vatra sa neba, udarni talas, bes
  protocol.ts      tipovi poruka
tools/             asset pipeline (python) + testovi
```

**Mreža:** server tick 30 Hz je jedini izvor istine (pozicije, neprijatelji, led, hrana, HP, cooldown-i, stanice, vrata, završetak). Klijent šalje samo *ulaze* (`dx/dy ∈ {-1,0,1}` sa sekvencom) i akcije (`ice/coffee/camera`) — nikad koordinate. Svoj lik klijent predviđa istim `shared/physics.ts` kodom i usklađuje sa serverom; drugi igrač i neprijatelji se interpoliraju (~100ms). Snapshot je mali JSON; lista leda se šalje samo kad se promeni.

**Zašto nije Phaser/Vite:** okruženje u kome je igra pravljena nije imalo pristup npm registry-ju, pa je napravljen mali namenski canvas engine (bez zavisnosti) da bi sve moglo da se testira sa dva prava browsera. Renderer je odvojen od logike (`shared/` + `server/`), pa se kasnije može zameniti Phaser-om bez diranja multiplayera.

### Dodavanje sadržaja

* **Novi nivo:** kopiraj `shared/levels/level1.ts`, izmeni ASCII mapu (legenda u `shared/level.ts`), registruj u `shared/levels/index.ts`. Server validira mapu pri startu.
* **Asimetrične zagonetke:** `stations` u definiciji nivoa vezuju slovo na mapi za ulogu (`L` = Davidov terminal, `A` = Nemanjina arkada); kad su sve aktivne, otvaraju se sva `G` polja. Nove vrste (mini-igre, timed terminal…) dodaju se u `LevelSim.tickStations`.
* **Boss-ovi:** `shared/bosses.ts` već ima Nemanjinog tatu ("SVE SE MOZE KAD SE HOCE", "NEMANJA NADJI POSAO", "A NEMANJA KAKO DAVID MOZE") i Profesora ("KOJA JE MARZA PRIHVATLJIVA NA TRZISTU", "TRZISNI NACRT 8. POGLAVLJE") kao podatke: faze, napadi, citati.
* **Zvuk:** svi efekti su trenutno sintetizovani (`client/src/engine/audio.ts`). Za pravi fajl dodaj ga u `assets/runtime/sfx/` i upiši ime u `SAMPLE_FILES`.

### Asseti

Originali iz `assets/` se ne menjaju. `npm run assets` (python3 + pillow, numpy, scipy) ponovo pravi `assets/runtime/`:
* `tools/extract_sprites.py` — iseca idle/walk/coffee/victory frejmove i iteme iz `david_sheet.png` i `nemanja_sheet.png` (Nemanjinom sheetu uklanja crnu pozadinu), logo/ice blok/šolju/nudle iz concept arta, portrete za HUD.
* `tools/make_tiles.py` — pixel-art pločice kuhinje, neprijatelji (buđ, jogurt, prljavi sudovi), srca, kamera — u paleti concept arta.

* `tools/extract_sprites_v2.py` — bolje animacije iz `david_nemanja_sheet.png` (idle, walk za lobi, run za nivo, slikanje kamerom, flash efekat) i `ice_shot.png` (bacanje leda, ICE BLAST projektil, ICE BLOCK CREATE). Hodanje/trčanje koristi originalni walk ciklus iz prvih sheetova. `celebration.png` daje slavlje na kraju nivoa, a `koncked_down.png` padanje, ležanje (traženje pomoći), scenu podizanja saigrača i bro handshake posle revive-a (`assets/runtime/duo/`). Primeri omamljenih neprijatelja iz sheeta se namerno ne koriste: svaki neprijatelj dobija zvezdice iznad glave.

`assets/concept_art_ref.png` je kopija `concept art.png` (bez razmaka u imenu, za skripte).

---

## Testovi

```bash
npm run verify               # typecheck + pravila simulacije + build
npm test                     # deterministički testovi pravila (HP, kafa, blic, KO/revive, led, restart)

# sa pokrenutim serverom:
npm start &  npm run test:net                         # 2 bota: soba, join, auto-uloga, puna soba, sync, led, cooldown, pauza/resume
ICEBROS_PEACEFUL=1 npm start &  npm run test:playthrough   # 2 bota prelaze ceo Nivo 1 (pogrešna hrana, stanice, kapija, izlaz, complete)
```

`ICEBROS_DEBUG=1 npm start` uključuje dev komande iz browser konzole: `__net.send({t:'debug', cmd:'collectAll' | 'hurt' | 'stations' | 'toExit'})`.

Stari prototip (`game.mjs`, `index.html`) je premešten u `legacy/` radi reference.
