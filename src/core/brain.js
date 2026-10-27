// OFFLINE local brain: personality-driven line banks (no network).
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
  /** by_level banks: lines.<char>.by_level.<group>["-3".."3"]. Chat triggers use group "chat". */
  levelBank(charId, trigger, level) {
    if (!level) return [];
    const bl = (this.lines[charId] || {}).by_level || {};
    const grp = bl[trigger] ? trigger : /^chat_/.test(trigger) ? 'chat' : trigger;
    const b = bl[grp]; if (!b) return [];
    return b[String(level)] || (level <= -2 ? b.angry : level >= 2 ? b.happy : null) || [];
  }
  pick(charId, trigger, mood, vars = {}, level = 0) {
    let pool = this.levelBank(charId, trigger, level);
    // angry (<0) always speaks from the level bank; happy uses it most of the time
    if (pool.length && level > 0 && this.rng() > 0.7) pool = [];
    if (!pool.length) pool = this.bank(charId, trigger, mood);
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
  replyToChat(charId, text, mood, vars = {}, level = 0) {
    return this.pick(charId, this.chatTrigger(text), mood, vars, level) || this.pick(charId, 'chat_any', mood, vars, level);
  }
}
module.exports = { OfflineBrain, fill };
