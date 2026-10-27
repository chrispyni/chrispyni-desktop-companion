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
/** Wake detector from the system idle time (seconds since the last mouse/keyboard input anywhere).
 *  Arms once the user has been idle >= armSec, then fires on the first fresh input. */
function wakeDetector(armSec = 3) { let armed = false; return (idleSec) => { if (idleSec >= armSec) { armed = true; return false; } return armed; }; }
module.exports = { sleepPlan, wakeDetector };
