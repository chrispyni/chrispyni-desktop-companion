'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { MIN_GAP, isFree, freeSpot, separationDelta, companionSlot } = require('../src/core/spacing');

test('MIN_GAP is about one sprite width', () => {
  assert.ok(MIN_GAP >= 40 && MIN_GAP <= 48);
});

test('isFree / freeSpot: desired clear stays; blocked picks nearest free', () => {
  const others = [{ id: 'a', x: 100 }, { id: 'b', x: 200 }];
  assert.strictEqual(isFree(150, 'c', others, 48), true);
  assert.strictEqual(isFree(110, 'c', others, 48), false);
  assert.strictEqual(freeSpot(150, 'c', others, { minGap: 48, left: 0, right: 400 }), 150);
  const x = freeSpot(100, 'c', others, { minGap: 48, left: 0, right: 400 });
  assert.ok(Math.abs(x - 100) >= 48 || Math.abs(x - 200) >= 48);
  assert.ok(isFree(x, 'c', others, 48));
  assert.ok(Math.abs(x - 100) < 60); // nearest free near the blocked spot
});

test('freeSpot clamps to bounds', () => {
  const others = [{ id: 'a', x: 50 }];
  const x = freeSpot(50, 'b', others, { minGap: 48, left: 40, right: 60 });
  assert.ok(x >= 40 && x <= 60);
});

test('separationDelta pushes apart; id tie-break on exact overlap', () => {
  assert.strictEqual(separationDelta(100, 'nixie', [{ id: 'noct', x: 100 }], { step: 2 }), -2); // nixie < noct
  assert.strictEqual(separationDelta(100, 'noct', [{ id: 'nixie', x: 100 }], { step: 2 }), 2);
  assert.strictEqual(separationDelta(120, 'a', [{ id: 'b', x: 100 }], { minGap: 48, step: 3 }), 3);
  assert.strictEqual(separationDelta(80, 'a', [{ id: 'b', x: 100 }], { minGap: 48, step: 3 }), -3);
  assert.strictEqual(separationDelta(200, 'a', [{ id: 'b', x: 100 }], { minGap: 48 }), 0);
});

test('companionSlot places guests side by side around anchor', () => {
  assert.strictEqual(companionSlot(300, 0, 48), 300 - 48);
  assert.strictEqual(companionSlot(300, 1, 48), 300 + 48);
  assert.strictEqual(companionSlot(300, 2, 48), 300 - 96);
  const xs = [0, 1, 2].map((i) => companionSlot(300, i, 48));
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
    assert.ok(Math.abs(xs[i] - xs[j]) >= 48);
  }
});

test('three overlapping resolve to side-by-side via freeSpot chain', () => {
  const ids = ['chrispyni', 'nixie', 'noct'];
  const pos = { chrispyni: 200, nixie: 200, noct: 200 };
  for (const id of ids) {
    const others = ids.filter((x) => x !== id).map((x) => ({ id: x, x: pos[x] }));
    pos[id] = freeSpot(200, id, others, { minGap: 48, left: 0, right: 800, preferredSide: id === 'nixie' ? -1 : 1 });
  }
  const vals = Object.values(pos).sort((a, b) => a - b);
  assert.ok(vals[1] - vals[0] >= 48);
  assert.ok(vals[2] - vals[1] >= 48);
});
