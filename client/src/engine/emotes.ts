import { DEFAULT_EMOTES, cleanEmote } from '../../../shared/emotes.ts';

const STORE = 'icebros.emotes';

/** this browser's 6 emote texts (localStorage) */
export class EmoteStore {
  private list = [...DEFAULT_EMOTES];
  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (Array.isArray(raw)) raw.slice(0, 6).forEach((t, i) => { const c = cleanEmote(t).trim(); if (c) this.list[i] = c; });
    } catch { /* ignore */ }
  }
  get(i: number) { return this.list[i] ?? DEFAULT_EMOTES[i] ?? '!'; }
  all() { return [...this.list]; }
  set(i: number, text: string) {
    const c = cleanEmote(text).trim();
    this.list[i] = c || DEFAULT_EMOTES[i];
    this.save();
  }
  reset() { this.list = [...DEFAULT_EMOTES]; this.save(); }
  private save() { try { localStorage.setItem(STORE, JSON.stringify(this.list)); } catch { /* ignore */ } }
}
export const emotes = new EmoteStore();
