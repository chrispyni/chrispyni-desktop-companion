
'use strict';
const test = require('node:test'); const assert = require('node:assert');
const path = require('path'); const fs = require('fs'); const os = require('os');
const { EDITIONS, resolveEdition, editionDir } = require('../src/core/edition');
const { loadContent } = require('../src/core/content');
const chatlib = require('../src/core/chatlib');

test('public edition defaults to chrispyni; product naming', () => {
  const e = resolveEdition('/nope', {});
  assert.strictEqual(e.id, 'chrispyni');
  assert.match(e.productName, /ChrispyNi Desktop Companion/);
  assert.ok(!/Project Wives/i.test(e.productName));
  assert.deepStrictEqual(e.characters, ['chrispyni']);
  assert.deepStrictEqual(e.guests, ['nixie', 'noct']);
});

test('chrispyni edition overlay: roles + chat voice', () => {
  const root = path.join(__dirname, '..');
  const ed = editionDir(root, EDITIONS.chrispyni);
  assert.ok(ed);
  const c = loadContent(path.join(root, 'content'), [], { editionDir: ed, editionId: 'chrispyni' });
  assert.strictEqual(c.characters.chrispyni.role, 'wife');
  assert.strictEqual(c.characters.nixie.role, 'guest');
  assert.strictEqual(c.characters.noct.role, 'guest');
  assert.ok(c.characters.nixie.guestCanAct);
  const lib = JSON.parse(fs.readFileSync(path.join(ed, 'chat', 'library.json'), 'utf8'));
  const C = chatlib.compile(lib);
  const r = chatlib.reply(lib, C, 'chrispyni', 'I love you', () => 0);
  assert.strictEqual(r.rule, 'love');
  assert.match(r.text, /love you|Mine|again/i);
  const g = chatlib.reply(lib, C, 'chrispyni', 'hi there', () => 0);
  assert.ok(/cute one|baby|there you are/i.test(g.text));
});

test('no Project Wives branding left in edition labels', () => {
  for (const e of Object.values(EDITIONS)) {
    assert.ok(!/Project Wives/i.test(e.productName + e.label + e.folderName + e.artifactPrefix));
  }
});
