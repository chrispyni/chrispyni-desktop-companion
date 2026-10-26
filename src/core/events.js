// Weighted / rare event system driven by content/events/*.json
'use strict';
class EventSystem {
  constructor(defs = {}, rng = Math.random) { this.rng = rng; this.last = {}; this.setDefs(defs); }
  setDefs(defs) { this.defs = Object.values(defs || {}).filter((e) => e && e.id && Array.isArray(e.steps)); }
  ok(e, ctx, now) {
    if (e.enabled === false) return false;
    if (e.cooldownSec && this.last[e.id] && now - this.last[e.id] < e.cooldownSec * 1000) return false;
    const c = e.conditions || {};
    if (c.timeOfDay && !c.timeOfDay.includes(ctx.timeOfDay)) return false;
    if (c.minMana != null && (ctx.mana ?? 0) < c.minMana) return false;
    if (c.maxMana != null && (ctx.mana ?? 0) > c.maxMana) return false;
    if (c.moods) for (const [ch, ms] of Object.entries(c.moods)) if (!ms.includes((ctx.moods || {})[ch])) return false;
    if (c.app && c.app !== ctx.appCategory) return false;
    return true;
  }
  /** on: trigger name. force: skip chance roll (debug). Returns the chosen event or null. */
  check(on, ctx = {}, now = Date.now(), force = false) {
    const pass = this.defs.filter((e) => (e.on || 'tick') === on && this.ok(e, ctx, now) && (force || this.rng() < (e.chance ?? 1)));
    if (!pass.length) return null;
    const total = pass.reduce((s, e) => s + (e.weight ?? 1), 0);
    let r = this.rng() * total;
    for (const e of pass) { r -= e.weight ?? 1; if (r <= 0) { this.last[e.id] = now; return e; } }
    const e = pass[pass.length - 1]; this.last[e.id] = now; return e;
  }
  get(id) { return this.defs.find((e) => e.id === id); }
}
module.exports = { EventSystem };
