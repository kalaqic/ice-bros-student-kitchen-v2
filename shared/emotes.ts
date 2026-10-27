/** The 6 emotes (keys 1-6). Each player can rename theirs in PODESAVANJA -> EMOTE; the text travels with the emote. */
export const DEFAULT_EMOTES = ['A U KURAC!', 'GG', 'KOSOVO JE SRBIJA!', 'HAHA', 'LEGENDA!', 'STUDENTI POBEDJUJU!'];
export const EMOTE_MAX = 22;
const MAP: Record<string, string> = { 'Č': 'C', 'Ć': 'C', 'Š': 'S', 'Ž': 'Z', 'Đ': 'DJ', 'č': 'C', 'ć': 'C', 'š': 'S', 'ž': 'Z', 'đ': 'DJ' };
/** uppercase + only characters the pixel font can draw, max EMOTE_MAX chars */
export function cleanEmote(s: unknown): string {
  if (typeof s !== 'string') return '';
  let out = '';
  for (const ch of s) out += MAP[ch] ?? ch.toUpperCase();
  return out.replace(/[^A-Z0-9 .,!?;:'"()%#<>=_*@^~\-+/[\]]/g, '').replace(/\s+/g, ' ').trimStart().slice(0, EMOTE_MAX);
}
