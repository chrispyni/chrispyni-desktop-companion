// Drop/fall rules. Height is a fraction of the work-area height (content/rules/physics.json).
'use strict';
const PHYS_DEFAULTS = { gravity: 2600, normalBelow: 0.33, superheroBelow: 0.5 };
function landingFor(dropPx, workH, o = {}) {
  const r = workH > 0 ? Math.max(0, dropPx) / workH : 0;
  const n = o.normalBelow ?? PHYS_DEFAULTS.normalBelow, s = o.superheroBelow ?? PHYS_DEFAULTS.superheroBelow;
  return r < n ? 'normal' : r < s ? 'superhero' : 'faceplant';
}
module.exports = { landingFor, PHYS_DEFAULTS };
