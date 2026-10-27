// Prop usage bookkeeping: which idle use a prop offers, and when an unused prop should be cleaned up.
'use strict';
const USE_DEFAULTS = { idleDespawnMin: 20 };
/** What a wife can do with a prop (data: prop.use = "sit" | "lay" | "sip" | "read" | "light" | "play"). */
function useOf(def) { return def.use || (def.layable ? 'lay' : def.sittable ? 'sit' : null); }
/** true when nobody used it for idleDespawnMin (or the prop's own "idleDespawnMin"); pinned/door/portal never. */
function idleExpired(p, now = Date.now(), o = {}) {
  if (p.pinned || p.portal || (p.def && (p.def.door || p.def.idleDespawnMin === 0))) return false;
  const min = (p.def && p.def.idleDespawnMin) ?? o.idleDespawnMin ?? USE_DEFAULTS.idleDespawnMin;
  return now - (p.lastUsed || p.born || now) > min * 60000;
}
const SUMMON_DEFAULTS = { chance: 0.08, cooldownMin: 8, maxOnScreen: 4, minManaRatio: 0.35 };
/** Ambient summoning: should this wife conjure a prop now? Returns a prop id or null.
 *  ctx: { now, lastSummonAt, manaValue, manaRatio, onScreen: [ids], props: {id: def}, rng, opts } */
function pickAmbientSummon(ctx) {
  const o = { ...SUMMON_DEFAULTS, ...(ctx.opts || {}) }, rng = ctx.rng || Math.random, now = ctx.now ?? Date.now();
  if (now - (ctx.lastSummonAt || 0) < o.cooldownMin * 60000) return null;
  if ((ctx.manaRatio ?? 0) < o.minManaRatio) return null;
  const onScreen = ctx.onScreen || [];
  if (onScreen.length >= o.maxOnScreen) return null;
  if (rng() >= o.chance) return null;
  const ok = Object.values(ctx.props || {}).filter((d) => d && useOf(d) && !d.door && !d.owner && (d.manaCost || 0) > 0 && (d.manaCost || 0) <= (ctx.manaValue ?? 0) * 0.5 && !onScreen.includes(d.id));
  return ok.length ? ok[Math.floor(rng() * ok.length)].id : null;
}
module.exports = { useOf, idleExpired, pickAmbientSummon, USE_DEFAULTS, SUMMON_DEFAULTS };
