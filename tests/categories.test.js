'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadContent } = require('../src/core/content');
const { BUILTIN, categoryOf, categoryTag, labeledName, groupByCategory } = require('../src/core/categories');

test('builtin order is Main, Wives, Friends', () => {
  assert.deepStrictEqual(BUILTIN, ['Main', 'Wives', 'Friends']);
});

test('chrispyni edition: categories + only Wives gets (wife) tag', () => {
  const c = loadContent(path.join(__dirname, '..', 'content'));
  assert.strictEqual(categoryOf(c.characters.chrispyni), 'Main');
  assert.strictEqual(categoryOf(c.characters.nixie), 'Wives');
  assert.strictEqual(categoryOf(c.characters.noct), 'Wives');
  assert.strictEqual(categoryTag(c.characters.chrispyni), null);
  assert.strictEqual(categoryTag(c.characters.nixie), 'wife');
  assert.strictEqual(labeledName(c.characters.chrispyni, 'ChrispyNi'), 'ChrispyNi');
  assert.ok(labeledName(c.characters.nixie, 'Nixie').includes('(wife)'));
});

test('groupByCategory: builtins first (incl. empty Friends), customs after; legacy Wife→Wives', () => {
  const chars = {
    chrispyni: { id: 'chrispyni', name: 'ChrispyNi', category: 'Main' },
    nixie: { id: 'nixie', name: 'Nixie', category: 'Wives' },
    noct: { id: 'noct', name: 'Noct', category: 'Wife' }, // legacy spelling
    bob: { id: 'bob', name: 'Bob', category: 'My Mod' },
  };
  const g = groupByCategory(chars);
  assert.deepStrictEqual(g.map((x) => x.category), ['Main', 'Wives', 'Friends', 'My Mod']);
  assert.strictEqual(g.find((x) => x.category === 'Friends').items.length, 0);
  assert.deepStrictEqual(g.find((x) => x.category === 'Wives').items.map((d) => d.id), ['nixie', 'noct']);
  assert.deepStrictEqual(g.find((x) => x.category === 'My Mod').items.map((d) => d.id), ['bob']);
});

test('mod custom category from character.json is respected', () => {
  assert.strictEqual(categoryOf({ id: 'x', category: 'Stream Team' }), 'Stream Team');
  assert.strictEqual(categoryTag({ id: 'x', category: 'Stream Team' }), null);
});
