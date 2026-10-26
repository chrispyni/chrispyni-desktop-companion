// Who goes to sleep in our room with Chrispy? Both if both are low; otherwise only the lowest one, one at a time.
'use strict';
function sleepPlan(wives, busy = []) {
  // wives: [{id, ratio, low}], busy: ids already resting
  if (busy.length) return [];
  const low = wives.filter((w) => w.low);
  if (!low.length) return [];
  if (low.length === wives.length) return wives.map((w) => w.id);
  return [low.sort((a, b) => a.ratio - b.ratio)[0].id];
}
module.exports = { sleepPlan };
