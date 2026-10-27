// Per-character mana. Max can grow; horny mood doubles the usable ceiling (200% of max).
'use strict';
class Mana {
  constructor(opts = {}) {
    this.max = Math.max(1, opts.max ?? 100);
    this.value = Math.min(this.ceiling, opts.value ?? this.max);
    this.regenPerMin = opts.regenPerMin ?? 1;
    this.sleepRegenPerMin = opts.sleepRegenPerMin ?? 12;
    this.roomRegenPerSec = opts.roomRegenPerSec ?? 4;
    this.lowThreshold = opts.lowThreshold ?? 0.2;
    this.infinite = false;
    this.mul = opts.mul ?? 1;   // 2 while secret "horny" mood is active
  }
  get ceiling() { return this.max * (this.mul || 1); }
  get ratio() { return this.ceiling ? this.value / this.ceiling : 0; }
  get low() { return this.ratio <= this.lowThreshold; }
  canAfford(cost) { return this.infinite || this.value >= cost; }
  spend(cost) {
    cost = Math.max(0, Number(cost) || 0);
    if (this.infinite) return true;
    if (this.value < cost) return false;
    this.value -= cost; return true;
  }
  add(n) { this.value = Math.max(0, Math.min(this.ceiling, this.value + n)); }
  fill() { this.value = this.ceiling; }
  /** Raise permanent max by n (integer). Value is not auto-filled. */
  growMax(n) {
    const add = Math.max(0, Math.round(Number(n) || 0));
    if (!add) return 0;
    this.max += add;
    if (this.value > this.ceiling) this.value = this.ceiling;
    return add;
  }
  setMul(m) {
    this.mul = Math.max(1, Number(m) || 1);
    if (this.value > this.ceiling) this.value = this.ceiling;
  }
  tick(dt, mode = 'awake') {
    const rate = mode === 'room' ? this.roomRegenPerSec : mode === 'sleep' ? this.sleepRegenPerMin / 60 : this.regenPerMin / 60;
    this.add(rate * dt);
  }
  toJSON() { return { value: Math.round(this.value * 100) / 100, max: this.max }; }
  load(j) {
    if (!j) return;
    if (j.max != null) this.max = Math.max(1, Number(j.max) || this.max);
    if (j.value != null) this.value = Math.max(0, Math.min(this.ceiling, Number(j.value)));
  }
}
/** Random int inclusive. */
function rndInt(a, b, rng = Math.random) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return lo + Math.floor(rng() * (hi - lo + 1));
}
/** Growth amounts (rules may override ranges). */
const GROW = {
  use: [1, 5],
  sleepTogether: [5, 10],
  longAway: [10, 20],
  longAwayHours: 8,
};
function growFromUse(mana, rng = Math.random, range = GROW.use) {
  return mana.growMax(rndInt(range[0], range[1], rng));
}
function growFromSleepTogether(mana, rng = Math.random, range = GROW.sleepTogether) {
  return mana.growMax(rndInt(range[0], range[1], rng));
}
function growFromLongAway(mana, rng = Math.random, range = GROW.longAway) {
  return mana.growMax(rndInt(range[0], range[1], rng));
}
/** True if closedAt → openedAt spans at least hours (system clock). */
function qualifiesLongAway(closedAt, openedAt, hours = GROW.longAwayHours) {
  if (!closedAt || !openedAt) return false;
  return (openedAt - closedAt) >= hours * 3600 * 1000;
}
module.exports = { Mana, GROW, rndInt, growFromUse, growFromSleepTogether, growFromLongAway, qualifiesLongAway };
