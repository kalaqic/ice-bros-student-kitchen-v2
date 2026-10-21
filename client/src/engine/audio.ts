/**
 * Synthesised retro SFX (Web Audio). Swap any entry for a sample later by adding a file to
 * assets/runtime/sfx/<name>.(mp3|ogg) and listing it in SAMPLE_FILES - play() prefers samples.
 */
export type Sfx =
  | 'ice' | 'iceBreak' | 'iceFail' | 'shutter' | 'stun' | 'sip' | 'heal' | 'collect' | 'disgust' | 'hit' | 'ko'
  | 'revive' | 'ready' | 'complete' | 'click' | 'join' | 'gate' | 'exit' | 'station' | 'step' | 'emote' | 'coffeePickup'
  | 'unlock' | 'denied' | 'quiz' | 'correct' | 'wrong' | 'telegraph' | 'money' | 'crush' | 'type';

const SAMPLE_FILES: Partial<Record<Sfx, string>> = {};

/** Music slots; any file in assets/audio named after a slot (lobby.mp3, stage1.ogg, boss.mp3 ...) is used for it. */
export type MusicSlot = 'menu' | 'lobby' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'boss';
const SLOT_CANDIDATES: Record<MusicSlot, string[]> = {
  menu: ['menu', 'lobby', 'music'], lobby: ['lobby', 'menu', 'music'],
  stage1: ['stage1', 'stages', 'stage', 'music'], stage2: ['stage2', 'stages', 'stage', 'music'],
  stage3: ['stage3', 'stages', 'stage', 'music'], stage4: ['stage4', 'stages', 'stage', 'music'],
  boss: ['boss', 'stages', 'stage', 'music'],
};

export interface AudioSettings { music: number; sfx: number; musicMuted: boolean; sfxMuted: boolean }
const STORE = 'icebros.audio';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private samples = new Map<Sfx, AudioBuffer>();
  settings: AudioSettings = { music: 0.55, sfx: 0.8, musicMuted: false, sfxMuted: false };
  /** files found in assets/audio (from the build-time index) */
  private files: string[] = [];
  private wantSlot: MusicSlot | null = null;
  private el: HTMLAudioElement | null = null;
  private elFile = '';
  private synth: { slot: MusicSlot; timer: number; step: number; next: number } | null = null;
  /** true after the first user gesture (browsers block autoplay before that) */
  unlocked = false;
  /** what is audible right now - handy for tests/debug */
  playing: { slot: MusicSlot; source: string } | null = null;

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (raw) this.settings = { ...this.settings, ...raw };
      else if (localStorage.getItem('icebros.muted') === '1') { this.settings.musicMuted = true; this.settings.sfxMuted = true; }
    } catch { /* ignore */ }
    fetch('assets/audio/index.json', { cache: 'no-store' }).then((r) => r.json()).then((f: string[]) => { this.files = Array.isArray(f) ? f : []; if (this.unlocked && this.wantSlot) this.startMusic(this.wantSlot, true); }).catch(() => {});
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
      if (this.wantSlot) this.startMusic(this.wantSlot, true);
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  /** legacy single mute flag (M key) */
  get muted() { return this.settings.musicMuted && this.settings.sfxMuted; }
  private ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
      this.applyVolumes();
      for (const [name, file] of Object.entries(SAMPLE_FILES)) {
        fetch('assets/sfx/' + file).then((r) => r.arrayBuffer()).then((b) => this.ctx!.decodeAudioData(b))
          .then((buf) => this.samples.set(name as Sfx, buf)).catch(() => {});
      }
    } catch { this.ctx = null; }
  }
  private save() { try { localStorage.setItem(STORE, JSON.stringify(this.settings)); } catch { /* ignore */ } }
  private applyVolumes() {
    const m = this.settings.musicMuted ? 0 : this.settings.music;
    if (this.sfxGain) this.sfxGain.gain.value = this.settings.sfxMuted ? 0 : this.settings.sfx * 0.35;
    if (this.musicGain) this.musicGain.gain.value = m * 0.22;
    if (this.el) this.el.volume = Math.max(0, Math.min(1, m));
  }
  set(patch: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...patch };
    this.applyVolumes(); this.save();
  }
  toggleMute() {
    const both = !this.muted;
    this.set({ musicMuted: both, sfxMuted: both });
  }

  // ------------------------------------------------------------------ music
  /** request a track; starts immediately if the browser already allowed audio, otherwise on first input */
  music(slot: MusicSlot) {
    if (this.wantSlot === slot && this.playing) return;
    this.wantSlot = slot;
    if (this.unlocked) this.startMusic(slot, false);
  }
  private resolve(slot: MusicSlot): string | null {
    for (const c of SLOT_CANDIDATES[slot]) {
      const f = this.files.find((x) => x.replace(/\.[a-z0-9]+$/i, '').toLowerCase() === c);
      if (f) return f;
    }
    return this.files.find((x) => /^music/i.test(x)) ?? this.files[0] ?? null;
  }
  private startMusic(slot: MusicSlot, force: boolean) {
    this.ensure();
    const file = this.resolve(slot);
    if (file) {
      this.stopSynth();
      if (this.el && this.elFile === file && !force) { this.playing = { slot, source: file }; return; }
      if (this.el && this.elFile === file) { void this.el.play().catch(() => {}); this.playing = { slot, source: file }; return; }
      this.el?.pause();
      const el = new window.Audio('assets/audio/' + file);
      el.loop = true; this.el = el; this.elFile = file;
      this.applyVolumes();
      void el.play().then(() => { this.playing = { slot, source: file }; }).catch(() => {});
      return;
    }
    // no music file yet: built-in chiptune placeholder (same slot names, so a dropped-in file replaces it)
    this.el?.pause(); this.el = null; this.elFile = '';
    if (this.synth?.slot === slot) return;
    this.stopSynth();
    if (!this.ctx) return;
    this.synth = { slot, timer: 0, step: 0, next: this.ctx.currentTime + 0.1 };
    this.synth.timer = window.setInterval(() => this.tickSynth(), 60);
    this.playing = { slot, source: 'synth' };
  }
  private stopSynth() { if (this.synth) { clearInterval(this.synth.timer); this.synth = null; } }

  private tickSynth() {
    const c = this.ctx, s = this.synth;
    if (!c || !s || !this.musicGain) return;
    const SONG: Record<MusicSlot, { bpm: number; root: number; prog: number[]; lead: number[]; wave: OscillatorType }> = {
      menu: { bpm: 96, root: 57, prog: [0, 5, 3, 7], lead: [12, 15, 19, 15, 12, 10, 7, 10], wave: 'triangle' },
      lobby: { bpm: 96, root: 57, prog: [0, 5, 3, 7], lead: [12, 15, 19, 15, 12, 10, 7, 10], wave: 'triangle' },
      stage1: { bpm: 128, root: 52, prog: [0, 0, 5, 7], lead: [12, 14, 15, 19, 15, 14, 12, 7], wave: 'square' },
      stage2: { bpm: 120, root: 55, prog: [0, 8, 3, 10], lead: [7, 12, 15, 12, 10, 12, 15, 17], wave: 'square' },
      stage3: { bpm: 136, root: 60, prog: [0, 5, 7, 5], lead: [12, 16, 19, 24, 19, 16, 12, 16], wave: 'triangle' },
      stage4: { bpm: 112, root: 50, prog: [0, 3, 8, 7], lead: [12, 15, 12, 10, 8, 10, 12, 15], wave: 'sawtooth' },
      boss: { bpm: 150, root: 49, prog: [0, 1, 0, 6], lead: [12, 13, 12, 16, 12, 13, 19, 18], wave: 'square' },
    };
    const song = SONG[s.slot];
    const stepDur = 60 / song.bpm / 2;
    const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    while (s.next < c.currentTime + 0.25) {
      const t = s.next, i = s.step;
      const chord = song.prog[Math.floor(i / 8) % song.prog.length];
      const note = (n: number, dur: number, type: OscillatorType, vol: number) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = hz(n);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.musicGain!); o.start(t); o.stop(t + dur + 0.02);
      };
      if (i % 2 === 0) note(song.root - 12 + chord, stepDur * 1.8, 'triangle', 0.5);
      if (i % 4 !== 3) note(song.root + chord + song.lead[i % 8], stepDur * 0.9, song.wave, 0.16);
      if (i % 4 === 0) { // soft kick
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        o.connect(g).connect(this.musicGain!); o.start(t); o.stop(t + 0.16);
      }
      s.step++; s.next += stepDur;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.5, slideTo?: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxGain!); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol = 0.4, hp = 1000, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(this.sfxGain!); s.start(t);
  }

  play(name: Sfx) {
    if (this.settings.sfxMuted) return;
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const buf = this.samples.get(name);
    if (buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.sfxGain); s.start(); return; }
    switch (name) {
      case 'ice': this.tone(1200, 0.18, 'triangle', 0.25, 2400); this.noise(0.15, 0.12, 4000); break;
      case 'iceBreak': this.noise(0.25, 0.35, 2500); this.tone(900, 0.12, 'square', 0.12, 300); break;
      case 'iceFail': this.tone(220, 0.08, 'square', 0.15); break;
      case 'shutter': this.noise(0.05, 0.5, 3000); this.noise(0.06, 0.4, 2000, 0.07); this.tone(1800, 0.05, 'square', 0.1, undefined, 0.07); break;
      case 'stun': for (let i = 0; i < 3; i++) this.tone(1400 + i * 300, 0.12, 'triangle', 0.15, undefined, 0.1 + i * 0.07); break;
      case 'sip': this.tone(300, 0.15, 'sine', 0.3, 500); this.tone(320, 0.15, 'sine', 0.3, 540, 0.25); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.3, undefined, i * 0.08)); break;
      case 'collect': this.tone(880, 0.08, 'square', 0.2); this.tone(1320, 0.12, 'square', 0.2, undefined, 0.07); break;
      case 'coffeePickup': this.tone(660, 0.08, 'triangle', 0.25); this.tone(990, 0.12, 'triangle', 0.25, undefined, 0.07); break;
      case 'disgust': this.tone(200, 0.35, 'sawtooth', 0.2, 90); break;
      case 'hit': this.noise(0.12, 0.4, 300); this.tone(180, 0.2, 'square', 0.3, 60); break;
      case 'ko': this.tone(400, 0.6, 'square', 0.25, 60); break;
      case 'revive': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.18, undefined, i * 0.07)); break;
      case 'ready': this.tone(660, 0.1, 'square', 0.2); this.tone(880, 0.15, 'square', 0.2, undefined, 0.1); break;
      case 'complete': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.2, undefined, i * 0.12)); break;
      case 'click': this.tone(700, 0.05, 'square', 0.15); break;
      case 'join': this.tone(440, 0.1, 'triangle', 0.25); this.tone(660, 0.15, 'triangle', 0.25, undefined, 0.1); break;
      case 'gate': this.noise(0.4, 0.3, 1500); [300, 400, 600].forEach((f, i) => this.tone(f, 0.2, 'square', 0.15, undefined, i * 0.1)); break;
      case 'exit': [523, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, undefined, i * 0.1)); break;
      case 'station': this.tone(1000, 0.1, 'square', 0.15); this.tone(1500, 0.15, 'square', 0.15, undefined, 0.1); break;
      case 'step': this.noise(0.03, 0.05, 2000); break;
      case 'emote': this.tone(900, 0.07, 'triangle', 0.2, 1200); break;
      case 'unlock': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.28, undefined, i * 0.1)); break;
      case 'denied': this.tone(160, 0.12, 'square', 0.2); this.tone(120, 0.15, 'square', 0.2, undefined, 0.1); break;
      case 'quiz': this.tone(880, 0.08, 'triangle', 0.25); this.tone(660, 0.12, 'triangle', 0.25, undefined, 0.09); break;
      case 'correct': [659, 880, 1175].forEach((f, i) => this.tone(f, 0.14, 'square', 0.2, undefined, i * 0.07)); break;
      case 'wrong': this.tone(300, 0.25, 'sawtooth', 0.2, 150); break;
      case 'telegraph': this.tone(1200, 0.06, 'square', 0.12); this.tone(1200, 0.06, 'square', 0.12, undefined, 0.12); break;
      case 'money': this.noise(0.1, 0.2, 5000); this.tone(1800, 0.06, 'triangle', 0.15, 2400); break;
      case 'crush': this.noise(0.3, 0.4, 900); this.tone(220, 0.2, 'square', 0.25, 80); break;
      case 'type': this.noise(0.02, 0.08, 4000); break;
    }
  }
}
