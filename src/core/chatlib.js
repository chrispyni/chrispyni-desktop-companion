// Offline, rule-based chat (no AI, no network). A moddable library of keyword/phrase rules -> reply presets per
// character, plus mood reactions to certain words and generic fallbacks. Libraries from mods are merged in.
'use strict';
const norm = (s) => ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
function compile(lib) {
  return (lib.rules || []).map((r, i) => ({ ...r, _i: i, _pats: [].concat(r.match || []).map((m) => (m.startsWith('/') ? { re: new RegExp(m.slice(1, m.lastIndexOf('/')), m.slice(m.lastIndexOf('/') + 1) || 'i') } : { w: norm(m) })) }));
}
/** Merge several library objects (base first, then mods): rules with the same id are replaced, others appended. */
function mergeLibs(libs) {
  const out = { rules: [], fallback: {}, reactions: [] }; const byId = new Map();
  for (const l of libs.filter(Boolean)) {
    for (const r of l.rules || []) { if (r.id && byId.has(r.id)) out.rules[byId.get(r.id)] = r; else { if (r.id) byId.set(r.id, out.rules.length); out.rules.push(r); } }
    for (const [k, v] of Object.entries(l.fallback || {})) out.fallback[k] = [...(out.fallback[k] || []), ...v];
    out.reactions.push(...(l.reactions || []));
  }
  return out;
}
const hit = (p, n, raw) => (p.re ? p.re.test(raw) : n.includes(p.w));
/** Best matching rule (highest priority, then most specific pattern) for the text, or null. */
function findRule(compiled, text) {
  const n = norm(text); let best = null, bestScore = -1;
  for (const r of compiled) {
    const m = r._pats.filter((p) => hit(p, n, text)); if (!m.length) continue;
    const score = (r.priority || 0) * 1000 + Math.max(...m.map((p) => (p.w ? p.w.length : 20)));
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}
/** Reply for one character: { text, rule, mood } (mood = reaction to apply, may be null). */
function reply(lib, compiled, charId, text, rng = Math.random) {
  const pick = (a) => (a && a.length ? a[Math.floor(rng() * a.length)] : null);
  const r = findRule(compiled, text);
  const n = norm(text);
  const reaction = (lib.reactions || []).find((x) => [].concat(x.match || []).some((m) => n.includes(norm(m))));
  const lines = r && (r.replies[charId] || r.replies.any);
  const out = pick(lines) || pick((lib.fallback || {})[charId]) || pick((lib.fallback || {}).any) || null;
  return { text: out, rule: r ? r.id : null, mood: (r && r.mood) || (reaction && reaction.mood) || null, affection: (r && r.affection) || (reaction && reaction.affection) || 0 };
}
/** Pick a reply line by rule id (ambient triggers like guest arrive/leave). */
function pickById(lib, charId, ruleId, rng = Math.random) {
  const pick = (a) => (a && a.length ? a[Math.floor(rng() * a.length)] : null);
  const r = (lib.rules || []).find((x) => x.id === ruleId);
  if (!r) return { text: null, rule: null };
  const lines = r.replies && (r.replies[charId] || r.replies.any);
  return { text: pick(lines), rule: r.id };
}
module.exports = { norm, compile, mergeLibs, findRule, reply, pickById };
