// Pats: per-wife 5 min cooldown, 1-10 mana, crit 20-50 mana. Crit chance starts at 5%, grows by a random
// 1-5% after each non-crit pat and resets to 5% after a crit. State is saved per wife in data/save.json.
'use strict';
const PAT = { cooldownMs: 5 * 60000, mana: [1, 10], critMana: [20, 50], critBase: 0.05, critStep: [0.01, 0.05] };
const ri = (a, b, rng) => a + Math.floor(rng() * (b - a + 1));
/** state: { lastAt, critChance }. Returns { ok:false, reason:'cooldown', until } or { ok:true, mana, crit, chance }. */
function tryPat(state, now = Date.now(), rng = Math.random, o = PAT) {
  if (typeof state.critChance !== 'number' || !(state.critChance >= o.critBase)) state.critChance = o.critBase;
  if (state.lastAt && now - state.lastAt < o.cooldownMs) return { ok: false, reason: 'cooldown', until: state.lastAt + o.cooldownMs };
  state.lastAt = now;
  const chance = Math.min(1, state.critChance);
  const crit = rng() < chance;
  const mana = crit ? ri(o.critMana[0], o.critMana[1], rng) : ri(o.mana[0], o.mana[1], rng);
  state.critChance = crit ? o.critBase : Math.min(1, state.critChance + o.critStep[0] + rng() * (o.critStep[1] - o.critStep[0]));
  return { ok: true, mana, crit, chance };
}
module.exports = { tryPat, PAT };
