/**
 * Synthesised retro SFX (Web Audio). Swap any entry for a sample later by adding a file to
 * assets/runtime/sfx/<name>.(mp3|ogg) and listing it in SAMPLE_FILES - play() prefers samples.
 */
export type Sfx =
  | 'ice' | 'iceBreak' | 'iceFail' | 'shutter' | 'stun' | 'sip' | 'heal' | 'collect' | 'disgust' | 'hit' | 'ko'
  | 'revive' | 'ready' | 'complete' | 'click' | 'join' | 'gate' | 'exit' | 'station' | 'step' | 'emote' | 'coffeePickup';

const SAMPLE_FILES: Partial<Record<Sfx, string>> = {};

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private samples = new Map<Sfx, AudioBuffer>();
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('icebros.muted') === '1'; } catch { /* ignore */ }
    const unlock = () => { this.ensure(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  private ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      for (const [name, file] of Object.entries(SAMPLE_FILES)) {
        fetch('assets/sfx/' + file).then((r) => r.arrayBuffer()).then((b) => this.ctx!.decodeAudioData(b))
          .then((buf) => this.samples.set(name as Sfx, buf)).catch(() => {});
      }
    } catch { this.ctx = null; }
  }
  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('icebros.muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.5, slideTo?: number, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol = 0.4, hp = 1000, delay = 0) {
    const c = this.ctx!, t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(this.master!); s.start(t);
  }

  play(name: Sfx) {
    if (this.muted) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const buf = this.samples.get(name);
    if (buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.master); s.start(); return; }
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
    }
  }
}
