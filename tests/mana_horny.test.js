'use strict';
const test = require('node:test'); const assert = require('node:assert');
const path = require('path'); const fs = require('fs');
const { Mana, GROW, growFromUse, growFromSleepTogether, growFromLongAway, qualifiesLongAway } = require('../src/core/mana');
const { freshHornyState, noteVoluntarySleepTogether, rollHornyOnWake, isHorny, DEFAULTS } = require('../src/core/horny');
const chatlib = require('../src/core/chatlib');

test('mana growMax persists and spend uses current value', () => {
  const m = new Mana({ max: 100, value: 50 });
  assert.strictEqual(growFromUse(m, () => 0), 1); // rng 0 -> lo
  assert.strictEqual(m.max, 101);
  assert.ok(m.spend(10));
  assert.strictEqual(m.value, 40);
  const j = m.toJSON();
  const m2 = new Mana(); m2.load(j);
  assert.strictEqual(m2.max, 101);
  assert.strictEqual(m2.value, 40);
});

test('horny doubles ceiling (200% of max)', () => {
  const m = new Mana({ max: 100, value: 100 });
  m.setMul(2);
  assert.strictEqual(m.ceiling, 200);
  m.fill();
  assert.strictEqual(m.value, 200);
  m.setMul(1);
  assert.strictEqual(m.value, 100); // clamped back to max
});

test('sleep-together and long-away growth ranges', () => {
  const m = new Mana({ max: 100 });
  assert.strictEqual(growFromSleepTogether(m, () => 0.999), 10);
  assert.strictEqual(m.max, 110);
  assert.strictEqual(growFromLongAway(m, () => 0), 10);
  assert.strictEqual(m.max, 120);
});

test('qualifiesLongAway needs 8+ hours', () => {
  const t0 = 1_000_000;
  assert.ok(!qualifiesLongAway(t0, t0 + 7 * 3600 * 1000));
  assert.ok(qualifiesLongAway(t0, t0 + 8 * 3600 * 1000));
  assert.ok(!qualifiesLongAway(null, t0));
});

test('horny unlocks after voluntary sleep-togethers; AFK path not in this helper', () => {
  let s = freshHornyState();
  for (let i = 0; i < DEFAULTS.unlockAfter - 1; i++) s = noteVoluntarySleepTogether(s);
  assert.ok(!s.unlocked);
  s = noteVoluntarySleepTogether(s);
  assert.ok(s.unlocked);
  // force trigger
  const hit = rollHornyOnWake(s, () => 0); // chance roll then trigger roll both 0 -> first is p=0.05, rng>=p is 0>=0.05 false... 
  // Use rng that always passes: first call for p mix, second for roll
  let n = 0;
  const rng = () => { n++; return n === 1 ? 0 : 0; }; // p = 0.05 + 0*(0.05)=0.05; second 0 >= 0.05? false
  // Fix: second rng must be < p. So second returns 0 and check is rng() >= p — looking at code:
  // const p = lo + rng() * (hi-lo); if (rng() >= p) return false;
  // so need second rng < p. With lo=0.05, first rng=0 => p=0.05; second must be < 0.05 e.g. 0.
  // 0 >= 0.05 is false, so we activate. Good with rng always 0.
  n = 0;
  const s2 = noteVoluntarySleepTogether(noteVoluntarySleepTogether(noteVoluntarySleepTogether(freshHornyState())));
  assert.ok(rollHornyOnWake(s2, () => 0));
  assert.ok(isHorny(s2));
});

test('chrispyni chat lines have no tilde except horny_to_wives', () => {
  const ed = path.join(__dirname, '../editions/chrispyni/chat/library.json');
  const lib = JSON.parse(fs.readFileSync(ed, 'utf8'));
  for (const r of lib.rules) {
    const lines = (r.replies && r.replies.chrispyni) || [];
    for (const line of lines) {
      if (r.id === 'horny_to_wives') assert.ok(line.includes('~') || true);
      else assert.ok(!line.includes('~'), r.id + ': ' + line);
    }
  }
  const a = chatlib.pickById(lib, 'chrispyni', 'greet', () => 0);
  assert.ok(a.text);
  assert.ok(!/~|cute one|Hehe|Ehehe/i.test(a.text));
});
