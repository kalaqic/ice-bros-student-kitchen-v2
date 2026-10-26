import { loadAll } from './engine/assets.ts';
import { text } from './engine/font.ts';
import { Game } from './engine/Game.ts';
import { Session } from './game/Session.ts';
import { SettingsPanel } from './ui/SettingsPanel.ts';
import { SkillsPanel } from './ui/SkillsPanel.ts';
import { Net } from './net/Net.ts';
import { LevelScene } from './scenes/LevelScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
const session = new Session();

export interface App { game: Game; session: Session; toMenu(err?: string): void; settings(): void; skillsScreen(): void }
const app: App = {
  game, session,
  toMenu(err = '') { session.error = err; game.go(new MenuScene(app)); },
  settings() { game.open(new SettingsPanel(app)); },
  skillsScreen() { game.open(new SkillsPanel(app)); },
};

// ---- scene routing driven by the server ----
session.net.on((m) => {
  switch (m.t) {
    case 'joined':
      session.code = m.code; session.me = m.you; session.error = '';
      Net.save({ code: m.code, token: m.you.token });
      Net.remember(m.code, m.you.token);
      try { history.replaceState(null, '', `?room=${m.code}`); } catch { /* ignore */ }
      break;
    case 'room': {
      const prevPhase = session.phase;
      session.players = m.players; session.phase = m.phase; session.levelId = m.levelId; session.code = m.code;
      session.completed = m.completed; session.skills = m.skills; session.solo = !!m.solo;
      Session.saveProgress(m.completed);
      if (m.phase === 'lobby' && !(game.scene instanceof LobbyScene)) game.go(new LobbyScene(app));
      else if (m.phase !== 'lobby' && prevPhase === 'lobby' && !(game.scene instanceof LevelScene)) game.go(new LevelScene(app));
      break;
    }
    case 'level':
      session.complete = null;
      session.levelId = m.levelId;
      if (!(game.scene instanceof LevelScene) || game.scene.levelId !== m.levelId) game.go(new LevelScene(app));
      break;
    case 'complete':
      session.complete = m.stats;
      break;
    case 'error':
      if (m.msg === 'RESUME_FAILED') { Net.save(null); session.me = null; app.toMenu(''); }
      else { session.error = m.msg; if (!(game.scene instanceof MenuScene)) app.toMenu(m.msg); }
      break;
  }
});
session.net.onReconnect = () => {
  if (session.me && session.code) session.net.send({ t: 'resume', code: session.code, token: session.me.token });
};
setInterval(() => { if (session.net.status === 'open') session.net.ping(); }, 2000);
// handy for debugging from the browser console (debug commands only work with ICEBROS_DEBUG=1 on the server)
(window as unknown as { __net: unknown; __game: unknown }).__net = session.net;
(window as unknown as { __game: unknown }).__game = game;

// ---- boot: load assets with a little loading bar ----
const ctx = game.ctx;
game.scene = {
  update() {},
  render(c) {
    c.fillStyle = '#0b1428'; c.fillRect(0, 0, 1280, 720);
    text(c, 'ICE BROS', 640, 300, { size: 6, color: '#dff3ff', outline: '#16264a' }, 'center');
    c.fillStyle = '#16264a'; c.fillRect(440, 380, 400, 20);
    c.fillStyle = '#8fd0f5'; c.fillRect(444, 384, 392 * loadProgress, 12);
  },
};
let loadProgress = 0;
game.start();
void ctx;
loadAll((f) => { loadProgress = f; }).then(async () => {
  const saved = Net.load();
  if (saved) {
    session.code = saved.code;
    session.me = null;
    try {
      await session.net.connect();
      session.net.send({ t: 'resume', code: saved.code, token: saved.token });
      // provisional identity until the server confirms
      game.go(new MenuScene(app, true), false);
      return;
    } catch { Net.save(null); }
  }
  game.go(new MenuScene(app), false);
}).catch((e) => {
  game.scene = { update() {}, render(c) { text(c, 'GRESKA PRI UCITAVANJU: ' + String(e.message || e), 640, 340, { size: 2, color: '#ff7a6e' }, 'center'); } };
});
