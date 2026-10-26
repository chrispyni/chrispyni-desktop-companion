// Guest visit chance with soft pity (gacha style). Global for all guests unless a guest defines its own "pity" curve.
'use strict';
const PITY_DEFAULTS = { base: 0.12, perFail: 0.03, max: 0.85, actions: { pat: 0.01, feed: 0.01, ignored: 0.02 } };
class Pity {
  constructor(o = {}) { this.o = { ...PITY_DEFAULTS, ...o, actions: { ...PITY_DEFAULTS.actions, ...(o.actions || {}) } }; this.chance = this.o.base; }
  bump(d) { this.chance = Math.min(this.o.max, Math.max(this.o.base, this.chance + d)); return this.chance; }
  fail() { return this.bump(this.o.perFail); }
  act(kind) { return this.bump(this.o.actions[kind] || 0); }
  reset() { this.chance = this.o.base; return this.chance; }
  /** One check: true = a guest appears (and pity resets). */
  roll(rng = Math.random) { if (rng() < this.chance) { this.reset(); return true; } this.fail(); return false; }
  toJSON() { return { chance: this.chance }; }
  load(j) { if (j && typeof j.chance === 'number') this.chance = Math.min(this.o.max, Math.max(this.o.base, j.chance)); }
}
module.exports = { Pity, PITY_DEFAULTS };
