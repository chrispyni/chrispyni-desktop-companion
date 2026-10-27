// Secret "horny" mood: unlocked by voluntary sleep-together (not AFK/auto sleep, not mana-room rest).
'use strict';

const DEFAULTS = {
  unlockAfter: 3,          // voluntary sleep-togethers before it can trigger
  chanceMin: 0.05,
  chanceMax: 0.10,
  manaMul: 2,
};

function freshHornyState() {
  return { sleepTogetherCount: 0, unlocked: false, active: false, activeUntil: 0 };
}

function noteVoluntarySleepTogether(state, opts = {}) {
  const s = state || freshHornyState();
  s.sleepTogetherCount = (s.sleepTogetherCount || 0) + 1;
  const need = opts.unlockAfter ?? DEFAULTS.unlockAfter;
  if (s.sleepTogetherCount >= need) s.unlocked = true;
  return s;
}

/** Roll on wake from voluntary sleep-together. Returns true if mood activates. */
function rollHornyOnWake(state, rng = Math.random, opts = {}) {
  const s = state || freshHornyState();
  if (!s.unlocked || s.active) return false;
  const lo = opts.chanceMin ?? DEFAULTS.chanceMin;
  const hi = opts.chanceMax ?? DEFAULTS.chanceMax;
  const p = lo + rng() * Math.max(0, hi - lo);
  if (rng() >= p) return false;
  s.active = true;
  s.activeUntil = Date.now() + (opts.durationMs ?? 30 * 60 * 1000);
  return true;
}

function clearHorny(state, now = Date.now()) {
  const s = state || freshHornyState();
  if (s.activeUntil && now > s.activeUntil) s.active = false;
  return s;
}

function isHorny(state, now = Date.now()) {
  const s = clearHorny(state, now);
  return !!(s && s.active);
}

module.exports = { DEFAULTS, freshHornyState, noteVoluntarySleepTogether, rollHornyOnWake, clearHorny, isHorny };
