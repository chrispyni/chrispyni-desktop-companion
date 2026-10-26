// Hidden mood meter ("affection"), -3..+3. Internally a float; shown as a rounded level.
// Negative recovers toward 0 over time; positive fades toward 0 only through neglect
// (paused while you're actively interacting). Small steps, cooldowns and caps: never a chore.
'use strict';
const DAY = 86400000;
const DEFAULTS = {
  min: -3, max: 3,
  negRecoverPerDay: 2,        // -3 -> 0 in ~1.5 days
  posDecayPerDay: 0.43,       // +3 -> 0 in ~1 week
  activePauseMin: 30,         // positive decay paused this long after an interaction
  maxCatchUpDays: 14,         // offline time applied at most this much
  negBudgetPerHour: 1.2,      // total negative change allowed per hour (no punishing spirals)
  posBudgetPerHour: 1.5,
  events: {},                 // key -> { delta, cooldownSec } (content/rules/mood.json)
};
class Affection {
  constructor(opts = {}, now = Date.now()) {
    this.o = { ...DEFAULTS, ...opts, events: { ...DEFAULTS.events, ...(opts.events || {}) } };
    this.value = 0; this.lastTs = now; this.lastActive = 0; this.cool = {}; this.budget = { t: now, neg: 0, pos: 0 };
  }
  get level() { const v = Math.round(this.value); return v === 0 ? 0 : v; }   // avoid -0
  clamp(v) { return Math.max(this.o.min, Math.min(this.o.max, v)); }
  /** Apply time passing up to `now` (works across restarts: lastTs/lastActive are saved). */
  decay(now = Date.now()) {
    const cap = this.o.maxCatchUpDays * DAY;
    const from = Math.max(this.lastTs, now - cap);
    const dt = Math.max(0, now - from);
    if (this.value < 0) this.value = Math.min(0, this.value + this.o.negRecoverPerDay * dt / DAY);
    else if (this.value > 0) {
      const pauseEnd = this.lastActive + this.o.activePauseMin * 60000;
      const effFrom = Math.max(from, Math.min(now, pauseEnd));
      const pdt = Math.max(0, now - effFrom);
      this.value = Math.max(0, this.value - this.o.posDecayPerDay * pdt / DAY);
    }
    this.lastTs = now; return this.value;
  }
  markActive(now = Date.now()) { this.lastActive = now; }
  /** Raw change, limited by the hourly budgets. Returns the delta actually applied. */
  add(delta, now = Date.now()) {
    this.decay(now);
    if (now - this.budget.t > 3600000) this.budget = { t: now, neg: 0, pos: 0 };
    if (delta < 0) { const room = Math.max(0, this.o.negBudgetPerHour - this.budget.neg); delta = -Math.min(-delta, room); this.budget.neg += -delta; }
    else if (delta > 0) { const room = Math.max(0, this.o.posBudgetPerHour - this.budget.pos); delta = Math.min(delta, room); this.budget.pos += delta; }
    const before = this.value; this.value = this.clamp(this.value + delta); return this.value - before;
  }
  /** Named event from content/rules/mood.json, with its own cooldown. */
  event(key, now = Date.now()) {
    const e = this.o.events[key]; if (!e) return 0;
    if (e.active !== false && e.delta > 0) this.markActive(now);
    const cd = (e.cooldownSec || 0) * 1000;
    if (cd && this.cool[key] && now - this.cool[key] < cd) return 0;
    this.cool[key] = now; return this.add(e.delta, now);
  }
  set(v, now = Date.now()) { this.decay(now); this.value = this.clamp(Number(v) || 0); }
  toJSON() { return { value: Math.round(this.value * 1000) / 1000, lastTs: this.lastTs, lastActive: this.lastActive }; }
  load(j, now = Date.now()) {
    if (!j) return; this.value = this.clamp(Number(j.value) || 0); this.lastTs = j.lastTs || now; this.lastActive = j.lastActive || 0; this.decay(now);
  }
}
module.exports = { Affection, AFFECTION_DEFAULTS: DEFAULTS };
