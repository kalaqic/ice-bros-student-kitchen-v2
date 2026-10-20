/** Keyboard + mouse state in logical (1280x720) coordinates. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  typed: string[] = [];
  mouse = { x: -1, y: -1, down: false, clicked: false };
  pasted: string | null = null;

  constructor(private canvas: HTMLCanvasElement, private toLogical: (cx: number, cy: number) => { x: number; y: number }) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
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
  /** Movement axis from WASD (arrows also work). */
  axis(): { dx: number; dy: number } {
    const dx = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const dy = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    return { dx, dy };
  }
  endFrame() { this.pressed.clear(); this.typed = []; this.mouse.clicked = false; this.pasted = null; }
  setCursor(c: string) { this.canvas.style.cursor = c; }
}
