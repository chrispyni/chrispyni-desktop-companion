'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadContent } = require('../src/core/content');
const { buildDebugMenuModel, presentDebugTargets, assertPresentHavePanels, GLOBAL_SECTIONS } = require('../src/core/debugmenu');

test('debug menu model: nested Category → Avatar; globals separate', () => {
  const c = loadContent(path.join(__dirname, '..', 'content'));
  const model = buildDebugMenuModel(c.characters, ['chrispyni', 'nixie']);
  assert.ok(GLOBAL_SECTIONS.length >= 5);
  assert.deepStrictEqual(model.globals, GLOBAL_SECTIONS);
  assert.deepStrictEqual(model.categories.map((g) => g.category), ['Main', 'Wives', 'Friends']);
  const main = model.categories.find((g) => g.category === 'Main');
  assert.deepStrictEqual(main.avatars.map((a) => a.id), ['chrispyni']);
  assert.strictEqual(main.avatars[0].present, true);
  const wives = model.categories.find((g) => g.category === 'Wives');
  assert.deepStrictEqual(wives.avatars.map((a) => a.id), ['nixie', 'noct']);
  assert.strictEqual(wives.avatars.find((a) => a.id === 'nixie').present, true);
  assert.strictEqual(wives.avatars.find((a) => a.id === 'noct').present, false);
  assert.strictEqual(model.categories.find((g) => g.category === 'Friends').avatars.length, 0);
});

test('every character on screen (guests included) gets a present panel slot', () => {
  const chars = {
    chrispyni: { id: 'chrispyni', name: 'ChrispyNi', category: 'Main' },
    nixie: { id: 'nixie', name: 'Nixie', category: 'Wives' },
    noct: { id: 'noct', name: 'Noct', category: 'Wives' },
    bob: { id: 'bob', name: 'Bob', category: 'Stream Team' },
  };
  // Simulate on-screen map: ChrispyNi + guest Nixie + mod guest Bob
  const onScreen = {
    chrispyni: { id: 'chrispyni', hidden: false },
    nixie: { id: 'nixie', role: 'guest', hidden: false },
    bob: { id: 'bob', role: 'guest', hidden: false },
  };
  const present = presentDebugTargets(onScreen);
  assert.deepStrictEqual(present, ['bob', 'chrispyni', 'nixie']);
  const model = buildDebugMenuModel(chars, present);
  const check = assertPresentHavePanels(model, present);
  assert.strictEqual(check.ok, true, 'missing panels: ' + check.missing);
  // Wives category must expose Nixie's panel when she is present (the old empty-Wives bug)
  const wives = model.categories.find((g) => g.category === 'Wives');
  assert.ok(wives.avatars.some((a) => a.id === 'nixie' && a.present));
  // custom mod category nests the same way
  const mod = model.categories.find((g) => g.category === 'Stream Team');
  assert.ok(mod && mod.avatars[0].id === 'bob' && mod.avatars[0].present);
});

test('hidden characters are not present debug targets', () => {
  assert.deepStrictEqual(presentDebugTargets({
    a: { id: 'a', hidden: true },
    b: { id: 'b', hidden: false, fadeOut: true },
    c: { id: 'c', hidden: false },
  }), ['c']);
});
