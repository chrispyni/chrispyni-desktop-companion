// Standing spacing: avatars keep ~one sprite width apart when idle (not during hug/kiss).
'use strict';

const MIN_GAP = 48;   // ~frame width (48px); scale is applied by the caller if needed
const SEARCH_STEP = 4;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** True if x is at least minGap from every other character. */
function isFree(x, selfId, others, minGap = MIN_GAP) {
  for (const o of others) {
    if (!o || o.id === selfId || o.x == null) continue;
    if (Math.abs(o.x - x) < minGap) return false;
  }
  return true;
}

/**
 * Nearest free standing X near desiredX that stays ≥ minGap from others, clamped to [left, right].
 * Prefer the side that matches preferredSide (-1 left, +1 right) when both are equally close.
 */
function freeSpot(desiredX, selfId, others, opts = {}) {
  const minGap = opts.minGap ?? MIN_GAP;
  const left = opts.left ?? -Infinity;
  const right = opts.right ?? Infinity;
  const preferredSide = opts.preferredSide || 0;
  const goal = clamp(desiredX, left, right);
  if (isFree(goal, selfId, others, minGap)) return goal;

  const maxR = Math.max(right - left, minGap * 8, 400);
  let best = null, bestDist = Infinity;
  for (let d = SEARCH_STEP; d <= maxR; d += SEARCH_STEP) {
    for (const side of preferredSide >= 0 ? [1, -1] : [-1, 1]) {
      const x = clamp(goal + side * d, left, right);
      if (!isFree(x, selfId, others, minGap)) continue;
      const dist = Math.abs(x - goal);
      if (dist < bestDist) { bestDist = dist; best = x; }
    }
    if (best != null && bestDist <= d) break;
  }
  return best != null ? best : goal;
}

/**
 * If self overlaps someone, return a gentle delta (±step) away from the nearest offender.
 * Otherwise 0. Skips others listed in ignoreIds.
 */
function separationDelta(selfX, selfId, others, opts = {}) {
  const minGap = opts.minGap ?? MIN_GAP;
  const step = opts.step ?? 2;
  let nearest = null, nearestD = Infinity;
  for (const o of others) {
    if (!o || o.id === selfId || o.x == null) continue;
    if (opts.ignoreIds && opts.ignoreIds.has(o.id)) continue;
    const d = Math.abs(o.x - selfX);
    if (d < minGap && d < nearestD) { nearestD = d; nearest = o; }
  }
  if (!nearest) return 0;
  if (nearestD < 0.5) {
    // Exact overlap: break ties by id so they don't both pick the same direction.
    return (selfId < nearest.id ? -1 : 1) * step;
  }
  return (selfX >= nearest.x ? 1 : -1) * step;
}

/** Slot beside an anchor (e.g. ChrispyNi): alternating left/right at minGap, 2*minGap, … */
function companionSlot(anchorX, index, minGap = MIN_GAP) {
  const side = index % 2 === 0 ? -1 : 1;
  const ring = 1 + Math.floor(index / 2);
  return anchorX + side * minGap * ring;
}

module.exports = { MIN_GAP, isFree, freeSpot, separationDelta, companionSlot };
