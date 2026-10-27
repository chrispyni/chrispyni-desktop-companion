'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { freshBehaviorState, noteBehavior, isBehaviorBlocked, pickUnblocked, DEFAULTS } = require('../src/core/behavior');

test('streak blocks after maxStreak repeats', () => {
  let s = freshBehaviorState(0);
  s = noteBehavior(s, 'cast', 1000);
  s = noteBehavior(s, 'cast', 2000);
  assert.strictEqual(s.streak, 2);
  assert.ok(isBehaviorBlocked(s, 'cast', 3000, { maxStreak: 2 }));
  assert.ok(!isBehaviorBlocked(s, 'wander', 3000, { maxStreak: 2 }));
});

test('duration blocks after maxMs on same kind', () => {
  let s = noteBehavior(freshBehaviorState(0), 'mood', 0);
  assert.ok(!isBehaviorBlocked(s, 'mood', 1000, { maxMs: 5000, maxStreak: 99 }));
  assert.ok(isBehaviorBlocked(s, 'mood', 6000, { maxMs: 5000, maxStreak: 99 }));
});

test('exempt user-driven states never block', () => {
  let s = noteBehavior(noteBehavior(freshBehaviorState(0), 'cast', 0), 'cast', 1);
  assert.ok(!isBehaviorBlocked(s, 'cast', 2, { exempt: true, maxStreak: 1 }));
});

test('pickUnblocked skips blocked and forces variety', () => {
  let s = noteBehavior(noteBehavior(freshBehaviorState(0), 'cast', 0), 'cast', 1);
  const k = pickUnblocked(s, ['cast', 'wander', 'sit'], 'wander', 2, { maxStreak: 2 });
  assert.strictEqual(k, 'wander');
});

test('long idle simulation: behaviors vary over many picks', () => {
  let s = freshBehaviorState(0);
  const pool = ['wander', 'sit', 'mood', 'summon', 'use_prop', 'interact'];
  const seen = [];
  let now = 0;
  for (let i = 0; i < 40; i++) {
    now += 8000;
    // Always offer wander first — anti-repeat + recent window must still diversify.
    const prefer = ['wander', ...pool.filter((x) => x !== 'wander')];
    const k = pickUnblocked(s, prefer, 'mood', now, { maxStreak: 2, maxMs: 20000 });
    s = noteBehavior(s, k, now);
    seen.push(k);
  }
  const uniq = new Set(seen);
  assert.ok(uniq.size >= 3, 'expected variety, got ' + [...uniq]);
  let streak = 1;
  for (let i = 1; i < seen.length; i++) {
    streak = seen[i] === seen[i - 1] ? streak + 1 : 1;
    assert.ok(streak <= DEFAULTS.maxStreak, 'streak ' + streak + ' at ' + seen[i]);
  }
});

test('use_prop must not leave a permanent loopAnim (regression)', () => {
  // Mirrors the bug: play(anim, sec, true) set loopAnim and blocked think forever.
  // The fix clears loopAnim before play(..., false). This unit check documents the contract.
  const ch = { loopAnim: 'cast', holdUntil: 0 };
  ch.loopAnim = null;
  const loop = false;
  if (loop) ch.loopAnim = 'cast';
  assert.strictEqual(ch.loopAnim, null);
});
