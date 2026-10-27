
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

test('chrispyni edition keeps real sprite sheets (no invisible body)', () => {
  const root = path.join(__dirname, '..');
  const ed = editionDir(root, EDITIONS.chrispyni);
  const c = loadContent(path.join(root, 'content'), [], { editionDir: ed, editionId: 'chrispyni' });
  for (const id of ['chrispyni', 'nixie', 'noct']) {
    const sheet = c.characters[id].sheet;
    assert.ok(sheet && fs.existsSync(sheet), id + ' sheet missing: ' + sheet);
    assert.match(sheet.replace(/\\/g, '/'), /content\/characters\//);
  }
});

test('overlay restating sheet.png without a file keeps the base sheet', () => {
  const root = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ed-'));
  const charDir = path.join(tmp, 'characters', 'chrispyni');
  fs.mkdirSync(charDir, { recursive: true });
  fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({
    id: 'chrispyni', role: 'wife', sheet: 'sheet.png'
  }));
  // deliberately NO sheet.png in overlay
  const c = loadContent(path.join(root, 'content'), [], { editionDir: tmp, editionId: 'tmp' });
  assert.ok(fs.existsSync(c.characters.chrispyni.sheet));
  assert.match(c.characters.chrispyni.sheet.replace(/\\/g, '/'), /content\/characters\/chrispyni\/sheet\.png$/);
  assert.strictEqual(c.characters.chrispyni.role, 'wife');
  fs.rmSync(tmp, { recursive: true, force: true });
});
