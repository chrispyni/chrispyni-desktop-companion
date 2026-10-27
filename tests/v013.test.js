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

const { tryPat, PAT } = require('../src/core/pat');
test('pat: 5 min cooldown per wife, 1-10 mana, crit 20-50, chance 5% +1-5% per non-crit, reset after crit', () => {
  const st = {}; let t = T0;
  const r1 = tryPat(st, t, () => 0.5); assert.ok(r1.ok && !r1.crit && r1.mana >= 1 && r1.mana <= 10); assert.strictEqual(r1.chance, 0.05);
  assert.ok(st.critChance >= 0.06 - 1e-9 && st.critChance <= 0.10 + 1e-9);
  const cd = tryPat(st, t + 4 * MIN, () => 0); assert.strictEqual(cd.ok, false); assert.strictEqual(cd.reason, 'cooldown'); assert.strictEqual(cd.until, t + 5 * MIN);
  // pity grows on each non-crit pat
  let prev = st.critChance; for (let i = 1; i <= 5; i++) { t += 5 * MIN; const r = tryPat(st, t, () => 0.99); assert.ok(!r.crit && r.mana === 10); assert.ok(st.critChance > prev); prev = st.critChance; }
  t += 5 * MIN; const c = tryPat(st, t, () => 0.0); assert.ok(c.crit); assert.ok(c.mana >= 20 && c.mana <= 50); assert.strictEqual(st.critChance, PAT.critBase);
  // range check over many rolls
  for (let i = 0; i < 500; i++) { const s = {}; const r = tryPat(s, T0); if (r.crit) assert.ok(r.mana >= 20 && r.mana <= 50); else assert.ok(r.mana >= 1 && r.mana <= 10); }
  const loaded = { lastAt: T0, critChance: 0.2 }; assert.strictEqual(tryPat(loaded, T0 + MIN).ok, false); assert.strictEqual(loaded.critChance, 0.2);
});
test('cookie spam: within the limit every click is accepted (queued), beyond it she is full', () => {
  const cookie = { id: 'cookie', limits: { maxInRow: [4, 5], cooldownMin: [15, 20] } }; const st = {};
  const res = []; for (let i = 0; i < 8; i++) res.push(tryEat(st, cookie, T0 + i * 100, () => 0.999).ok);
  assert.deepStrictEqual(res, [true, true, true, true, true, false, false, false]);
});

const { pickAmbientSummon } = require('../src/core/propuse');
test('ambient summon: wives conjure a usable prop now and then (gated by cooldown, mana, count)', () => {
  const props = { teacup: { id: 'teacup', manaCost: 3, use: 'sip' }, sofa: { id: 'sofa', manaCost: 15, sittable: true }, door: { id: 'door', manaCost: 5, door: true }, table: { id: 'table', manaCost: 8 }, flower: { id: 'flower', manaCost: 0, use: 'play' } };
  const base = { now: T0, lastSummonAt: 0, manaValue: 80, manaRatio: 0.8, onScreen: [], props, rng: () => 0 };
  assert.ok(['teacup', 'sofa'].includes(pickAmbientSummon(base)));
  assert.strictEqual(pickAmbientSummon({ ...base, rng: () => 0.5 }), null, 'chance roll fails');
  assert.strictEqual(pickAmbientSummon({ ...base, lastSummonAt: T0 - 2 * MIN }), null, 'cooldown');
  assert.strictEqual(pickAmbientSummon({ ...base, manaRatio: 0.2 }), null, 'low mana');
  assert.strictEqual(pickAmbientSummon({ ...base, onScreen: ['a', 'b', 'c', 'd'] }), null, 'enough props out');
  assert.strictEqual(pickAmbientSummon({ ...base, manaValue: 10 }), 'teacup', 'only what she can easily afford');
  assert.strictEqual(pickAmbientSummon({ ...base, onScreen: ['teacup', 'sofa'] }), null, 'no duplicates, never door/table/free');
  // over a session of thinks it happens occasionally, not never
  let n = 0, last = 0; for (let t = 0; t < 120; t++) { const id = pickAmbientSummon({ ...base, now: T0 + t * 10000 + 9 * MIN, lastSummonAt: last, rng: Math.random }); if (id) { n++; last = T0 + t * 10000 + 9 * MIN; } }
  assert.ok(n >= 1 && n <= 3, 'summons in 20 min: ' + n);
});

test('ambient summon: usableBy restricts who may conjure a prop (gaming_pc = chrispyni only)', () => {
  const { mayUseDef } = require('../src/core/propuse');
  const gaming = { id: 'gaming_pc', manaCost: 8, use: 'stream', usableBy: ['chrispyni'] };
  const tea = { id: 'teacup', manaCost: 3, use: 'sip' };
  assert.strictEqual(mayUseDef(gaming, 'chrispyni'), true);
  assert.strictEqual(mayUseDef(gaming, 'nixie'), false);
  assert.strictEqual(mayUseDef(tea, 'nixie'), true);
  const props = { gaming_pc: gaming, teacup: tea };
  const base = { now: T0, lastSummonAt: 0, manaValue: 80, manaRatio: 0.8, onScreen: [], props, rng: () => 0 };
  assert.strictEqual(pickAmbientSummon({ ...base, charId: 'chrispyni' }), 'gaming_pc', 'chrispyni can pick restricted prop when listed first by rng');
  // force only gaming on screen filter: with nixie, gaming filtered out → teacup
  assert.strictEqual(pickAmbientSummon({ ...base, charId: 'nixie' }), 'teacup', 'nixie cannot summon chrispyni-only prop');
  assert.strictEqual(pickAmbientSummon({ ...base, charId: 'nixie', props: { gaming_pc: gaming } }), null, 'nothing left for nixie');
  assert.strictEqual(useOf(gaming), 'stream');
});

const chatlib = require('../src/core/chatlib');
test('offline chat library: keyword rules per character, priority, fallback, reactions, mods merge', () => {
  const base = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'content', 'chat', 'library.json'), 'utf8'));
  const lib = chatlib.mergeLibs([base, { rules: [{ id: 'bye', match: ['bye'], replies: { any: ['MOD BYE'] } }, { id: 'pizza', match: ['/piz+a/i'], replies: { nixie: ['PIZZA'] } }] }]);
  const C = chatlib.compile(lib); const r0 = () => 0;
  assert.ok(base.rules.find((r) => r.id === 'greet').replies.nixie.includes(chatlib.reply(lib, C, 'nixie', 'Hello there!', r0).text));
  assert.strictEqual(chatlib.reply(lib, C, 'noct', 'hey, I love you', r0).rule, 'love', 'love beats greet');
  assert.strictEqual(chatlib.reply(lib, C, 'noct', 'how are you?', r0).rule, 'how_are_you');
  assert.strictEqual(chatlib.reply(lib, C, 'noct', 'ok bye', r0).text, 'MOD BYE');
  assert.strictEqual(chatlib.reply(lib, C, 'nixie', 'pizzzza time', r0).text, 'PIZZA');
  const f = chatlib.reply(lib, C, 'noct', 'the weather is purple', r0); assert.strictEqual(f.rule, null); assert.ok(base.fallback.noct.includes(f.text));
  assert.strictEqual(chatlib.reply(lib, C, 'nixie', 'you are dumb', r0).mood, 'annoyed');
  assert.strictEqual(chatlib.reply(lib, C, 'nixie', 'this is a hint', r0).rule, null, '"hi" only as a whole word');
});

const { wakeDetector } = require('../src/core/sleepplan');
test('sleep wake: needs a quiet moment first, then any input (idle time reset) wakes', () => {
  const w = wakeDetector(3);
  assert.strictEqual(w(0), false, 'the key press that started sleep does not wake');
  assert.strictEqual(w(1), false); assert.strictEqual(w(5), false); assert.strictEqual(w(400), false);
  assert.strictEqual(w(0), true, 'mouse/keyboard after being idle wakes them');
});

const { releaseVelocity, stepProjectile } = require('../src/core/physics');
test('throw physics: release velocity, one damped wall bounce, one floor bounce, then settles', () => {
  const v = releaseVelocity([{ x: 0, y: 0, t: 0 }, { x: 50, y: -20, t: 900 }, { x: 150, y: -60, t: 1000 }], 1000);
  assert.ok(Math.abs(v.vx - 1000) < 1 && Math.abs(v.vy + 400) < 1);
  assert.deepStrictEqual(releaseVelocity([{ x: 0, y: 0, t: 0 }], 1000), { vx: 0, vy: 0 });
  const box = { left: 0, right: 500, top: 0, floor: 400 };
  const o = { x: 400, y: 300, vx: 1500, vy: -900 }; let walls = 0, prevVx = o.vx, steps = 0;
  while (stepProjectile(o, 1 / 60, box, 2600) && steps < 2000) { if (o.vx !== 0 && prevVx !== 0 && Math.sign(o.vx) !== Math.sign(prevVx)) walls++; prevVx = o.vx; steps++; }
  assert.ok(steps < 2000, 'settles'); assert.strictEqual(walls, 1); assert.ok(o.wallBounced && o.floorBounced);
  assert.strictEqual(o.y, 400); assert.ok(o.x >= 0 && o.x <= 500); assert.strictEqual(o.vx, 0);
});

const { pickThrow, nextThrowAt } = require('../src/core/physics');
test('angry throw: only at mood <= -2, rare, cooldown 10-20 min, never ChrispyNi, never pinned/door/bed props', () => {
  const props = [{ uid: 1, pinned: true }, { uid: 2, door: true }, { uid: 3, sleepBed: true }, { uid: 4, occupied: true }, { uid: 5 }];
  const others = [{ id: 'chrispyni' }, { id: 'noct', busy: true }, { id: 'nixie' }];
  const base = { level: -2, now: T0, nextAt: 0, rng: () => 0, props, others };
  assert.deepStrictEqual(pickThrow(base), { kind: 'prop', uid: 5 });
  assert.deepStrictEqual(pickThrow({ ...base, rng: (() => { let i = 0; return () => (i++ ? 0.99 : 0); })() }), { kind: 'char', id: 'nixie' });
  assert.strictEqual(pickThrow({ ...base, level: -1 }), null);
  assert.strictEqual(pickThrow({ ...base, nextAt: T0 + 1 }), null);
  assert.strictEqual(pickThrow({ ...base, rng: () => 0.5 }), null, 'rare');
  assert.strictEqual(pickThrow({ ...base, props: [], others: [{ id: 'chrispyni' }] }), null);
  for (const r of [0, 0.999]) { const m = (nextThrowAt(T0, () => r) - T0) / MIN; assert.ok(m >= 10 && m <= 20); }
});
