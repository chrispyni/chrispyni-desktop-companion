// Autonomous behavior variety: no single action may repeat forever.
'use strict';

const DEFAULTS = { maxStreak: 2, maxMs: 45000, recentWindow: 4 };

/** @returns {{ last: string|null, streak: number, since: number, recent: string[] }} */
function freshBehaviorState(now = 0) {
  return { last: null, streak: 0, since: now, recent: [] };
}

function noteBehavior(state, kind, now = Date.now(), opts = {}) {
  const s = state || freshBehaviorState(now);
  if (s.last === kind) s.streak += 1;
  else { s.last = kind; s.streak = 1; s.since = now; }
  const win = opts.recentWindow ?? DEFAULTS.recentWindow;
  s.recent = [...(s.recent || []), kind].slice(-win);
  return s;
}

/**
 * True if this kind should be skipped (same action too many times / too long).
 * exempt: user-driven states (watch, sleep, drag, menu, held…).
 */
function isBehaviorBlocked(state, kind, now = Date.now(), opts = {}) {
  if (!kind || opts.exempt) return false;
  const maxStreak = opts.maxStreak ?? DEFAULTS.maxStreak;
  const maxMs = opts.maxMs ?? DEFAULTS.maxMs;
  if (!state || state.last !== kind) return false;
  if (state.streak >= maxStreak) return true;
  if (now - (state.since || 0) >= maxMs) return true;
  return false;
}

/**
 * Pick an unblocked candidate. Prefers kinds not in the recent window so long idle stretches vary.
 */
function pickUnblocked(state, candidates, fallbackKind, now = Date.now(), opts = {}) {
  const list = (candidates || []).filter(Boolean);
  const open = list.filter((k) => !isBehaviorBlocked(state, k, now, opts));
  const pool = open.length ? open : list.filter((k) => k !== state?.last);
  const use = pool.length ? pool : list;
  if (!use.length) return fallbackKind || null;
  const recent = state?.recent || [];
  const fresh = use.filter((k) => !recent.includes(k));
  const prefer = fresh.length ? fresh : use;
  // Keep caller order among the preferred set
  return prefer[0] || fallbackKind || null;
}

module.exports = { DEFAULTS, freshBehaviorState, noteBehavior, isBehaviorBlocked, pickUnblocked };
