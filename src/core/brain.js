// OFFLINE local brain: personality-driven line banks so the wives are alive without the relay.
'use strict';

function fill(t, vars) { return String(t).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); }

class OfflineBrain {
  /** lines: { <charId>: { <trigger>: [..] | {<mood>:[..], any:[..]} } } */
  constructor(lines = {}, rng = Math.random) { this.lines = lines; this.rng = rng; this.recent = []; }
  setLines(l) { this.lines = l; }
  bank(charId, trigger, mood) {
    const c = this.lines[charId] || {}; const b = c[trigger];
    if (!b) return [];
    if (Array.isArray(b)) return b;
    return [...(b[mood] || []), ...(b.any || [])];
  }
  /** Pick a line (avoids the last few repeats). Returns null when nothing fits. */
  pick(charId, trigger, mood, vars = {}) {
    let pool = this.bank(charId, trigger, mood);
    if (!pool.length) return null;
    const fresh = pool.filter((l) => !this.recent.includes(l));
    if (fresh.length) pool = fresh;
    const line = pool[Math.floor(this.rng() * pool.length)];
    this.recent.push(line); if (this.recent.length > 12) this.recent.shift();
    return fill(line, vars);
  }
  /** Very small keyword "understanding" for chat while offline. */
  chatTrigger(text) {
    const t = String(text).toLowerCase();
    const rules = [
      [/\b(love you|ily|i love|люблю)\b/, 'chat_love'], [/\b(hi|hello|hey|morning|привет)\b/, 'chat_hello'],
      [/\b(tired|sleepy|sleep|bed|night|спать)\b/, 'chat_sleep'], [/\b(mana|energy)\b/, 'chat_mana'],
      [/\b(sad|bad day|upset|cry|грустно)\b/, 'chat_sad'], [/\b(stream|live|chat|viewers)\b/, 'chat_stream'],
      [/\b(game|play|wow|raid)\b/, 'chat_game'], [/\?\s*$/, 'chat_question'],
    ];
    for (const [re, tr] of rules) if (re.test(t)) return tr;
    return 'chat_any';
  }
  replyToChat(charId, text, mood, vars = {}) {
    return this.pick(charId, this.chatTrigger(text), mood, vars) || this.pick(charId, 'chat_any', mood, vars);
  }
}
module.exports = { OfflineBrain, fill };
