'use strict';
const test = require('node:test'); const assert = require('node:assert');
const path = require('path');
const { loadContent } = require('../src/core/content');
const { EDITIONS, editionDir } = require('../src/core/edition');
const { BUILTIN, categoryOf, categoryTag, labeledName, groupByCategory } = require('../src/core/categories');

test('builtin order is Main, Wife, Friends', () => {
  assert.deepStrictEqual(BUILTIN, ['Main', 'Wife', 'Friends']);
});

test('chrispyni edition: categories + only Wife gets (wife) tag', () => {
  const root = path.join(__dirname, '..');
  const ed = editionDir(root, EDITIONS.chrispyni);
  const c = loadContent(path.join(root, 'content'), [], { editionDir: ed, editionId: 'chrispyni' });
  assert.strictEqual(categoryOf(c.characters.chrispyni), 'Main');
  assert.strictEqual(categoryOf(c.characters.nixie), 'Wife');
  assert.strictEqual(categoryOf(c.characters.noct), 'Wife');
  assert.strictEqual(categoryTag(c.characters.chrispyni), null);
  assert.strictEqual(categoryTag(c.characters.nixie), 'wife');
  assert.strictEqual(labeledName(c.characters.chrispyni), 'ChrispyNi');
  assert.strictEqual(labeledName(c.characters.nixie), 'Nixie (wife)');
  assert.ok(!/\(wife\)/i.test(labeledName(c.characters.chrispyni)));
});

test('groupByCategory keeps empty Friends and sorts customs after builtins', () => {
  const chars = {
    chrispyni: { id: 'chrispyni', name: 'ChrispyNi', category: 'Main' },
    nixie: { id: 'nixie', name: 'Nixie', category: 'Wife' },
    noct: { id: 'noct', name: 'Noct', category: 'Wife' },
    bob: { id: 'bob', name: 'Bob', category: 'My Mod' },
  };
  const g = groupByCategory(chars);
  assert.deepStrictEqual(g.map((x) => x.category), ['Main', 'Wife', 'Friends', 'My Mod']);
  assert.strictEqual(g.find((x) => x.category === 'Friends').items.length, 0);
  assert.deepStrictEqual(g.find((x) => x.category === 'Wife').items.map((d) => d.id), ['nixie', 'noct']);
  assert.deepStrictEqual(g.find((x) => x.category === 'My Mod').items.map((d) => d.id), ['bob']);
});

test('mod custom category from character.json is respected', () => {
  assert.strictEqual(categoryOf({ id: 'x', category: 'Stream Team' }), 'Stream Team');
  assert.strictEqual(categoryTag({ id: 'x', category: 'Stream Team' }), null);
});
