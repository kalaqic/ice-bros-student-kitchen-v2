import { Audio } from './audio.ts';
import { Input } from './input.ts';
import { UI } from './ui.ts';

export const W = 1280;
export const H = 720;

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
}

/** Owns the canvas, fixed logical resolution (1280x720, letterboxed), loop and scene switching. */
export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly input: Input;
  readonly audio = new Audio();
  readonly ui: UI;
  scene: Scene | null = null;
  private k = 1;
  private last = performance.now();
  time = 0;
  shake = 0;
  private fade = { a: 0, dir: 0, then: null as null | (() => void) };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input = new Input(canvas, (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H };
    });
    this.ui = new UI(this.input, () => this.audio.play('click'));
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.k = this.canvas.width / W;
  }

  go(scene: Scene, fade = true) {
    const swap = () => { this.scene?.exit?.(); this.scene = scene; scene.enter?.(); };
    if (!fade || !this.scene) { swap(); return; }
    this.fade = { a: 0, dir: 1, then: () => { swap(); this.fade.dir = -1; } };
  }

  start() {
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private step(dt: number) {
    if (this.input.wasPressed('KeyM') && !(document.activeElement instanceof HTMLInputElement)) this.audio.toggleMute();
    this.scene?.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b1428';
    ctx.fillRect(0, 0, W, H);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 30);
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.ui.begin();
    this.scene?.render(ctx);
    this.ui.end();
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    if (this.fade.dir !== 0) {
      this.fade.a += this.fade.dir * dt * 4;
      if (this.fade.a >= 1 && this.fade.dir > 0) { this.fade.a = 1; const t = this.fade.then; this.fade.then = null; t?.(); }
      if (this.fade.a <= 0 && this.fade.dir < 0) { this.fade.a = 0; this.fade.dir = 0; }
      ctx.fillStyle = `rgba(11,20,40,${this.fade.a})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.input.endFrame();
  }
}
