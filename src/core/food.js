// Per-character, per-food eating limits: a few in a row, then "I'm full" and a randomized cooldown.
'use strict';
const FOOD_DEFAULTS = { maxInRow: [4, 5], cooldownMin: [15, 20], streakResetMin: 30 };
const pickRange = (r, rng) => (Array.isArray(r) ? r[0] + rng() * (r[1] - r[0]) : r);
/** state: { [foodId]: { streak, limit, lastAt, cooldownUntil } } (saved per character). */
function tryEat(state, food, now = Date.now(), rng = Math.random) {
  const o = { ...FOOD_DEFAULTS, ...(food.limits || {}) };
  const s = state[food.id] || (state[food.id] = { streak: 0, limit: 0, lastAt: 0, cooldownUntil: 0 });
  if (now < s.cooldownUntil) return { ok: false, reason: 'cooldown', until: s.cooldownUntil };
  if (s.cooldownUntil && now >= s.cooldownUntil) { s.cooldownUntil = 0; s.streak = 0; }
  if (now - s.lastAt > o.streakResetMin * 60000) s.streak = 0;
  if (!s.streak) s.limit = Math.round(pickRange(o.maxInRow, rng));
  if (s.streak >= s.limit) {
    s.cooldownUntil = now + pickRange(o.cooldownMin, rng) * 60000; s.streak = 0;
    return { ok: false, reason: 'full', until: s.cooldownUntil };
  }
  s.streak++; s.lastAt = now; return { ok: true, streak: s.streak, limit: s.limit };
}
module.exports = { tryEat, FOOD_DEFAULTS };
