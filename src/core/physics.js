// Drop/fall rules. Height is a fraction of the work-area height (content/rules/physics.json).
'use strict';
const PHYS_DEFAULTS = { gravity: 2600, normalBelow: 0.33, superheroBelow: 0.5 };
function landingFor(dropPx, workH, o = {}) {
  const r = workH > 0 ? Math.max(0, dropPx) / workH : 0;
  const n = o.normalBelow ?? PHYS_DEFAULTS.normalBelow, s = o.superheroBelow ?? PHYS_DEFAULTS.superheroBelow;
  return r < n ? 'normal' : r < s ? 'superhero' : 'faceplant';
}
/** Release velocity (px/s) from recent drag samples [{x,y,t(ms)}], using the last ~100 ms. Capped. */
function releaseVelocity(samples, now, cap = 2600) {
  const recent = samples.filter((s) => now - s.t <= 120); if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0], b = recent[recent.length - 1], dt = Math.max(1, b.t - a.t) / 1000;
  const c = (v) => Math.max(-cap, Math.min(cap, v));
  return { vx: c((b.x - a.x) / dt), vy: c((b.y - a.y) / dt) };
}
/** One projectile step. o = {x,y,vx,vy,bounced}; box = {left,right,top,floor} (limits for the anchor point).
 *  Gravity pulls down; it bounces ONCE off a side/top wall and ONCE off the floor (damped), then settles.
 *  Returns true while still flying. */
function stepProjectile(o, dt, box, G = PHYS_DEFAULTS.gravity, damp = 0.45) {
  o.vy += G * dt; o.x += o.vx * dt; o.y += o.vy * dt;
  if (o.x < box.left || o.x > box.right) {
    o.x = o.x < box.left ? box.left : box.right;
    if (!o.wallBounced) { o.wallBounced = true; o.vx = -o.vx * damp; } else o.vx = 0;
  }
  if (o.y < box.top) { o.y = box.top; if (!o.topBounced) { o.topBounced = true; o.vy = -o.vy * damp; } else o.vy = 0; }
  if (o.y >= box.floor) {
    o.y = box.floor;
    if (!o.floorBounced && Math.abs(o.vy) > 250) { o.floorBounced = true; o.vy = -o.vy * damp; o.vx *= 0.6; return true; }
    o.vy = 0; o.vx = 0; return false;
  }
  return true;
}
/** Angry tantrum: at mood level <= -2 she may (rarely, with a 10-20 min cooldown) throw a prop or another
 *  character (never ChrispyNi). ctx: { level, now, nextAt, rng, props:[{uid,pinned,door,sleepBed,occupied}], others:[{id,busy}] }
 *  Returns { kind:'prop', uid } | { kind:'char', id } | null. */
const THROW = { maxLevel: -2, chance: 0.05, cooldownMin: [10, 20] };
function pickThrow(ctx) {
  const rng = ctx.rng || Math.random;
  if ((ctx.level ?? 0) > THROW.maxLevel || (ctx.now ?? Date.now()) < (ctx.nextAt || 0) || rng() >= THROW.chance) return null;
  const ps = (ctx.props || []).filter((p) => !p.pinned && !p.door && !p.sleepBed && !p.occupied);
  const cs = (ctx.others || []).filter((c) => c.id !== 'chrispyni' && !c.busy);
  const all = [...ps.map((p) => ({ kind: 'prop', uid: p.uid })), ...cs.map((c) => ({ kind: 'char', id: c.id }))];
  return all.length ? all[Math.floor(rng() * all.length)] : null;
}
function nextThrowAt(now, rng = Math.random) { const [a, b] = THROW.cooldownMin; return now + (a + rng() * (b - a)) * 60000; }
module.exports = { landingFor, PHYS_DEFAULTS, releaseVelocity, stepProjectile, pickThrow, nextThrowAt, THROW };
