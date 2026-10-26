/**
 * Remappable keyboard controls (KeyboardEvent.code values), persisted in localStorage.
 * Gameplay code asks `bindings.code('ice')` / input.isAction('ice') instead of hardcoding keys.
 */
export type ActionKey = 'up' | 'down' | 'left' | 'right' | 'ice' | 'coffee' | 'camera' | 'interact' | 'pause';

export const ACTIONS: { id: ActionKey; label: string; group: 'KRETANJE' | 'VESTINE' | 'OSTALO' }[] = [
  { id: 'up', label: 'GORE', group: 'KRETANJE' },
  { id: 'down', label: 'DOLE', group: 'KRETANJE' },
  { id: 'left', label: 'LEVO', group: 'KRETANJE' },
  { id: 'right', label: 'DESNO', group: 'KRETANJE' },
  { id: 'ice', label: 'LED', group: 'VESTINE' },
  { id: 'coffee', label: 'KAFA', group: 'VESTINE' },
  { id: 'camera', label: 'KAMERA', group: 'VESTINE' },
  { id: 'interact', label: 'INTERAKCIJA', group: 'VESTINE' },
  { id: 'pause', label: 'PAUZA', group: 'OSTALO' },
];

export const DEFAULT_BINDINGS: Record<ActionKey, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  ice: 'Space', coffee: 'KeyE', camera: 'KeyF', interact: 'KeyQ', pause: 'Escape',
};

const STORE = 'icebros.bindings';
/** keys that stay reserved for emotes / quiz answers / browser */
export const RESERVED = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Tab', 'MetaLeft', 'MetaRight']);

export class Bindings {
  private map: Record<ActionKey, string> = { ...DEFAULT_BINDINGS };
  constructor() { this.load(); }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null') as Partial<Record<ActionKey, string>> | null;
      if (raw) for (const a of ACTIONS) if (typeof raw[a.id] === 'string') this.map[a.id] = raw[a.id]!;
      // repair duplicates from a corrupted store
      const seen = new Set<string>();
      for (const a of ACTIONS) { if (seen.has(this.map[a.id])) this.map[a.id] = DEFAULT_BINDINGS[a.id]; seen.add(this.map[a.id]); }
    } catch { /* ignore */ }
  }
  private save() { try { localStorage.setItem(STORE, JSON.stringify(this.map)); } catch { /* ignore */ } }

  code(a: ActionKey) { return this.map[a]; }
  all() { return { ...this.map }; }
  actionFor(code: string): ActionKey | null { return (ACTIONS.find((a) => this.map[a.id] === code)?.id) ?? null; }

  /** returns null on success, or the action that already uses the key */
  set(a: ActionKey, code: string): { ok: true } | { ok: false; conflict: ActionKey | 'reserved' } {
    if (RESERVED.has(code)) return { ok: false, conflict: 'reserved' };
    const other = this.actionFor(code);
    if (other && other !== a) return { ok: false, conflict: other };
    this.map[a] = code;
    this.save();
    return { ok: true };
  }
  reset() { this.map = { ...DEFAULT_BINDINGS }; this.save(); }
}

/** human readable key name for UI */
export function keyLabel(code: string): string {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  const map: Record<string, string> = {
    Space: 'SPACE', Escape: 'ESC', ArrowUp: 'STRELICA ^', ArrowDown: 'STRELICA DOLE', ArrowLeft: 'STRELICA <', ArrowRight: 'STRELICA >',
    ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT',
    Enter: 'ENTER', Backspace: 'BACKSPACE', CapsLock: 'CAPS', Tab: 'TAB', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  };
  return map[code] ?? code.toUpperCase();
}

/** short label for the 4 movement keys: WASD, STRELICE, or the keys joined */
export function moveLabel(): string {
  const c = (['up', 'left', 'down', 'right'] as ActionKey[]).map((a) => bindings.code(a));
  if (c.join() === 'ArrowUp,ArrowLeft,ArrowDown,ArrowRight') return 'STRELICE';
  const l = c.map(keyLabel);
  return l.every((x) => x.length === 1) ? l.join('') : l.join('/');
}

export const bindings = new Bindings();
