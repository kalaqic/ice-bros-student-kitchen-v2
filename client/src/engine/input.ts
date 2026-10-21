import { bindings, type ActionKey } from './bindings.ts';

/** Keyboard + mouse state in logical (1280x720) coordinates. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** first key pressed this frame (used by the rebinding UI) */
  firstPressed: string | null = null;
  typed: string[] = [];
  mouse = { x: -1, y: -1, down: false, clicked: false };
  pasted: string | null = null;
  /** while true, gameplay keys don't reach scenes (e.g. waiting for a new key binding) */
  capture = false;

  constructor(private canvas: HTMLCanvasElement, private toLogical: (cx: number, cy: number) => { x: number; y: number }) {
    window.addEventListener('keydown', (e) => {
      const gameKeys = new Set(Object.values(bindings.all()));
      if (this.capture || gameKeys.has(e.code) || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressed.add(e.code); if (!this.firstPressed) this.firstPressed = e.code; }
      this.down.add(e.code);
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) this.typed.push(e.key);
      if (e.key === 'Backspace') this.typed.push('\b');
      if (e.key === 'Enter') this.typed.push('\n');
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('paste', (e) => { this.pasted = e.clipboardData?.getData('text') ?? null; });
    const move = (e: PointerEvent) => { const p = this.toLogical(e.clientX, e.clientY); this.mouse.x = p.x; this.mouse.y = p.y; };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', (e) => { move(e); this.mouse.down = true; this.mouse.clicked = true; });
    window.addEventListener('pointerup', () => { this.mouse.down = false; });
  }
  isDown(...codes: string[]) { return codes.some((c) => this.down.has(c)); }
  wasPressed(...codes: string[]) { return codes.some((c) => this.pressed.has(c)); }
  /** action helpers read the remappable bindings */
  actionDown(a: ActionKey) { return !this.capture && this.down.has(bindings.code(a)); }
  actionPressed(a: ActionKey) { return !this.capture && this.pressed.has(bindings.code(a)); }
  /** Movement axis from the movement bindings (default WASD). */
  axis(): { dx: number; dy: number } {
    if (this.capture) return { dx: 0, dy: 0 };
    const dx = (this.actionDown('right') ? 1 : 0) - (this.actionDown('left') ? 1 : 0);
    const dy = (this.actionDown('down') ? 1 : 0) - (this.actionDown('up') ? 1 : 0);
    return { dx, dy };
  }
  endFrame() { this.pressed.clear(); this.firstPressed = null; this.typed = []; this.mouse.clicked = false; this.pasted = null; }
  setCursor(c: string) { this.canvas.style.cursor = c; }
}
