// Shared mana pool (ChrispyNi's mana). Not infinite: summons/casts cost mana.
'use strict';
class Mana {
  constructor(opts = {}) {
    this.max = opts.max ?? 100;
    this.value = Math.min(this.max, opts.value ?? this.max);
    this.regenPerMin = opts.regenPerMin ?? 1;        // awake, slow
    this.sleepRegenPerMin = opts.sleepRegenPerMin ?? 12; // sleeping together
    this.roomRegenPerSec = opts.roomRegenPerSec ?? 4;    // "mana replenishing" in our room
    this.lowThreshold = opts.lowThreshold ?? 0.2;
    this.infinite = false;                             // admin cheat only
  }
  get ratio() { return this.max ? this.value / this.max : 0; }
  get low() { return this.ratio <= this.lowThreshold; }
  canAfford(cost) { return this.infinite || this.value >= cost; }
  spend(cost) {
    cost = Math.max(0, Number(cost) || 0);
    if (this.infinite) return true;
    if (this.value < cost) return false;
    this.value -= cost; return true;
  }
  add(n) { this.value = Math.max(0, Math.min(this.max, this.value + n)); }
  fill() { this.value = this.max; }
  /** dt in seconds. mode: 'awake' | 'sleep' | 'room' */
  tick(dt, mode = 'awake') {
    const rate = mode === 'room' ? this.roomRegenPerSec : mode === 'sleep' ? this.sleepRegenPerMin / 60 : this.regenPerMin / 60;
    this.add(rate * dt);
  }
  toJSON() { return { value: Math.round(this.value * 100) / 100, max: this.max }; }
}
module.exports = { Mana };
