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
module.exports = { useOf, idleExpired, USE_DEFAULTS };
