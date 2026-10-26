'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { Affection } = require('../src/core/affection');
const { landingFor } = require('../src/core/physics');
const { spriteRect, wantsCapture, chatShouldClose, inRect } = require('../src/core/hit');
const { sleepPlan } = require('../src/core/sleepplan');
const { Mana } = require('../src/core/mana');
const { classifyChat, repliers } = require('../src/core/chatfilter');
const { loadContent } = require('../src/core/content');
const path = require('path');
const DAY = 86400000, T0 = 1_800_000_000_000;

test('mood: -3 recovers to 0 in ~1.5 days', () => {
  const a = new Affection({}, T0); a.set(-3, T0);
  a.decay(T0 + DAY); assert.ok(Math.abs(a.value - -1) < 1e-6);
  a.decay(T0 + 1.5 * DAY); assert.strictEqual(a.value, 0);
});
test('mood: +3 fades to 0 in ~a week of neglect, paused while active', () => {
  const a = new Affection({}, T0); a.set(3, T0);
  a.decay(T0 + 3.5 * DAY); assert.ok(Math.abs(a.value - (3 - 0.43 * 3.5)) < 1e-6);
  a.decay(T0 + 7 * DAY); assert.ok(a.value < 0.03);
  const b = new Affection({}, T0); b.set(3, T0); b.markActive(T0);
  b.decay(T0 + 20 * 60000); assert.strictEqual(b.value, 3);   // inside the 30 min pause
});
test('mood: decay survives restart via saved timestamps, capped catch-up', () => {
  const a = new Affection({}, T0); a.set(-3, T0); const j = a.toJSON();
  const b = new Affection({}, T0 + DAY); b.load(j, T0 + DAY); assert.ok(Math.abs(b.value - -1) < 1e-6);
  const c = new Affection({}, T0); c.set(3, T0); const k = c.toJSON();
  const d = new Affection({}, T0 + 400 * DAY); d.load(k, T0 + 400 * DAY); assert.strictEqual(d.value, 0);
});
test('mood: events have cooldowns and hourly budgets (no spirals); level is rounded', () => {
  const ev = { faceplant: { delta: -0.6, cooldownSec: 60 }, poke: { delta: -0.5, cooldownSec: 0 } };
  const a = new Affection({ events: ev }, T0);
  a.event('faceplant', T0); a.event('faceplant', T0 + 1000); assert.ok(Math.abs(a.value + 0.6) < 1e-9);
  for (let i = 0; i < 20; i++) a.event('poke', T0 + 2000 + i);
  assert.ok(a.value >= -1.2 - 1e-9, 'hourly negative budget');
  a.set(2.6, T0); assert.strictEqual(a.level, 3); a.set(-0.2, T0); assert.strictEqual(a.level, 0);
});
test('mana: separate pools per wife', () => {
  const n = new Mana({ max: 100 }), o = new Mana({ max: 100 });
  assert.ok(n.spend(30)); assert.strictEqual(n.value, 70); assert.strictEqual(o.value, 100);
  assert.ok(!o.spend(200)); assert.strictEqual(o.value, 100);
});
test('sleep plan: both low -> both, one low -> only her, busy -> nobody', () => {
  assert.deepStrictEqual(sleepPlan([{ id: 'n', ratio: 0.1, low: true }, { id: 'o', ratio: 0.15, low: true }]), ['n', 'o']);
  assert.deepStrictEqual(sleepPlan([{ id: 'n', ratio: 0.9, low: false }, { id: 'o', ratio: 0.1, low: true }]), ['o']);
  assert.deepStrictEqual(sleepPlan([{ id: 'n', ratio: 0.1, low: true }, { id: 'o', ratio: 0.1, low: true }], ['o']), []);
  assert.deepStrictEqual(sleepPlan([{ id: 'n', ratio: 0.5, low: false }]), []);
});
test('fall thresholds', () => {
  assert.strictEqual(landingFor(100, 1000), 'normal');
  assert.strictEqual(landingFor(329, 1000), 'normal');
  assert.strictEqual(landingFor(420, 1000), 'superhero');
  assert.strictEqual(landingFor(500, 1000), 'faceplant');
  assert.strictEqual(landingFor(990, 1000), 'faceplant');
  assert.strictEqual(landingFor(400, 1000, { normalBelow: 0.45 }), 'normal');
});
test('hitbox follows drawn sprite (scale, flip, lift)', () => {
  const base = { x: 500, y: 800, scale: 2, anchor: { x: 24, y: 62 }, frame: { w: 48, h: 64 }, ob: { x: 10, y: 4, w: 28, h: 58 } };
  assert.deepStrictEqual(spriteRect(base), { x: 472, y: 684, w: 56, h: 116 });
  assert.deepStrictEqual(spriteRect({ ...base, facing: -1 }), { x: 472, y: 684, w: 56, h: 116 });
  const asym = { ...base, ob: { x: 4, y: 0, w: 20, h: 64 } };
  assert.strictEqual(spriteRect(asym).x, 460); assert.strictEqual(spriteRect({ ...asym, facing: -1 }).x, 500);
  assert.strictEqual(spriteRect({ ...base, lift: 70 }).y, 614);
  assert.strictEqual(spriteRect({ ...base, scale: 3 }).w, 84);
});
test('click-through: capture only over sprites/UI; chat closes on outside click', () => {
  const sprites = [{ x: 0, y: 0, w: 10, h: 10 }], ui = [{ x: 100, y: 100, w: 50, h: 50 }];
  assert.strictEqual(wantsCapture(5, 5, { sprites }), true);
  assert.strictEqual(wantsCapture(50, 50, { sprites, uiRects: ui }), false);
  assert.strictEqual(wantsCapture(120, 120, { sprites, uiRects: ui }), true);
  assert.strictEqual(wantsCapture(50, 50, { sprites, uiRects: [] }), false, 'closed chat leaves nothing captured');
  assert.strictEqual(wantsCapture(50, 50, { dragging: true }), true);
  assert.strictEqual(chatShouldClose(true, ui[0], 10, 10), true);
  assert.strictEqual(chatShouldClose(true, ui[0], 120, 120), false);
  assert.strictEqual(chatShouldClose(false, ui[0], 10, 10), false);
  assert.ok(inRect({ x: 0, y: 0, w: 1, h: 1 }, 1, 1));
});
test('chat filter: tiny, gibberish (Latin + Cyrillic), normal', () => {
  for (const t of ['k', 'ok', '??', 'hi', 'ы']) assert.strictEqual(classifyChat(t), 'tiny', t);
  for (const t of ['asdfgh', 'sdfsdfsdf', 'jjjjjjj', 'lkjhgf', 'xcvbnm', 'фывапр', 'ыыыыыы', 'щшгнек']) assert.strictEqual(classifyChat(t), 'gibberish', t);
  for (const t of ['hey', 'hello my queens', 'i love you', 'привет как дела', 'what are you doing?', 'hmm', 'brb', 'gg wp', 'strength', 'rhythm', 'кто тут', 'Noct, sleep now']) assert.strictEqual(classifyChat(t), 'normal', t);
});
test('chat: usually one wife replies, sometimes both', () => {
  let both = 0; let r = 0; const rng = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 1000; i++) if (repliers(2, rng) === 2) both++;
  assert.ok(both > 100 && both < 400, String(both)); assert.strictEqual(repliers(1, rng), 1);
});
test('content: rules, new anims, magic interactions load', () => {
  const c = loadContent(path.join(__dirname, '..', 'content'), []);
  assert.ok(c.rules.mood.events.faceplant && c.rules.physics.normalBelow && c.rules.mana.meditation);
  for (const id of ['nixie', 'noct', 'chrispyni']) for (const a of ['fall', 'float', 'superhero_land', 'faceplant', 'getup']) assert.ok(c.characters[id].animations[a], id + a);
  for (const k of ['levitate', 'craft_together', 'lovely_gift', 'lovely_twirl']) assert.ok(c.interactions[k].magic && c.interactions[k].manaCost > 0);
  assert.ok(c.interactions.hug.forbidPairs.some(([a, b]) => a === 'nixie' && b === 'noct'));
});
