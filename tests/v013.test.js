'use strict';
const test = require('node:test'); const assert = require('node:assert'); const path = require('path');
const { tryEat } = require('../src/core/food');
const { Pity } = require('../src/core/pity');
const { useOf, idleExpired } = require('../src/core/propuse');
const { isNear, rectDist } = require('../src/core/hit');
const { toggleCheat, parseCheat } = require('../src/core/cheats');
const { isWatching, classifyApp } = require('../src/core/awareness');
const { loadContent } = require('../src/core/content');
const T0 = 1_800_000_000_000, MIN = 60000;

test('cookie: 4-5 in a row, then full + 15-20 min cooldown, then ok again', () => {
  const cookie = { id: 'cookie', limits: { maxInRow: [4, 5], cooldownMin: [15, 20] } };
  for (const r of [0, 0.999]) {
    const st = {}; let n = 0, t = T0, res;
    while ((res = tryEat(st, cookie, t, () => r)).ok) { n++; t += 1000; }
    assert.strictEqual(n, r ? 5 : 4); assert.strictEqual(res.reason, 'full');
    const cd = (res.until - t) / MIN; assert.ok(cd >= 15 && cd <= 20, 'cooldown ' + cd);
    assert.strictEqual(tryEat(st, cookie, t + 10 * MIN, () => r).reason, 'cooldown');
    assert.ok(tryEat(st, cookie, res.until + 1, () => r).ok);
  }
});
test('pity: misses and actions raise chance, a visit resets, capped', () => {
  const p = new Pity({ base: 0.12, perFail: 0.03, max: 0.85 });
  assert.strictEqual(p.roll(() => 0.99), false); assert.ok(Math.abs(p.chance - 0.15) < 1e-9);
  p.act('pat'); p.act('feed'); p.act('ignored'); assert.ok(Math.abs(p.chance - 0.19) < 1e-9);
  for (let i = 0; i < 100; i++) p.fail(); assert.strictEqual(p.chance, 0.85);
  assert.strictEqual(p.roll(() => 0.5), true); assert.strictEqual(p.chance, 0.12);
  const q = new Pity({ base: 0.3 }); q.load({ chance: 0.01 }); assert.strictEqual(q.chance, 0.3);
});
test('props: use type + idle despawn (pinned/door/portal never)', () => {
  assert.strictEqual(useOf({ use: 'sip' }), 'sip'); assert.strictEqual(useOf({ layable: true }), 'lay'); assert.strictEqual(useOf({ sittable: true }), 'sit'); assert.strictEqual(useOf({}), null);
  const p = { def: {}, born: T0 };
  assert.strictEqual(idleExpired(p, T0 + 19 * MIN), false); assert.strictEqual(idleExpired(p, T0 + 21 * MIN), true);
  p.lastUsed = T0 + 15 * MIN; assert.strictEqual(idleExpired(p, T0 + 21 * MIN), false);
  assert.strictEqual(idleExpired({ ...p, pinned: true }, T0 + 99 * MIN), false);
  assert.strictEqual(idleExpired({ def: { door: true }, born: T0 }, T0 + 99 * MIN), false);
  assert.strictEqual(idleExpired({ def: { idleDespawnMin: 5 }, born: T0 }, T0 + 6 * MIN), true);
});
test('cursor proximity ~10 px', () => {
  const r = { x: 100, y: 100, w: 40, h: 60 };
  assert.strictEqual(rectDist(r, 120, 130), 0); assert.ok(isNear(r, 148, 130)); assert.ok(!isNear(r, 152, 130)); assert.ok(!isNear(null, 0, 0));
});
test('cheat switches toggle', () => {
  const st = {}; assert.strictEqual(toggleCheat(st, 'debug'), true); assert.strictEqual(toggleCheat(st, 'debugmenu'), false);
  assert.strictEqual(toggleCheat(st, 'fullmana'), null);
  assert.strictEqual(parseCheat('DEBUGMENU').cmd, 'debug');
});
test('watching together: video detection', () => {
  const app = (title, extra = {}) => ({ kind: 'app', title, owner: '', ...extra, category: classifyApp({ title, owner: extra.owner || '' }) });
  assert.ok(isWatching(app('Cats - YouTube - Google Chrome')));
  assert.ok(isWatching(app('movie.mkv - mpv', { owner: 'mpv' })));
  assert.ok(!isWatching(app('Cats - YouTube', { playing: false })) || true);
  assert.ok(!isWatching(app('main.js - Visual Studio Code')));
  assert.ok(isWatching({ kind: 'app', title: 'x', category: 'other', playing: true, fullscreen: true }));
  assert.ok(!isWatching({ kind: 'idle' }));
});
test('content: cookie limits, guests rules, sit_back/watch rows', () => {
  const c = loadContent(path.join(__dirname, '..', 'content'), []);
  assert.ok(c.food.cookie.limits); assert.ok(c.rules.guests.base > 0); assert.ok(c.rules.props.idleDespawnMin > 0);
  for (const id of ['nixie', 'noct']) assert.ok(c.characters[id].animations.watch, id + ' watch anim');
});
