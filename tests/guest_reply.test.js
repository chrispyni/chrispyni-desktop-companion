'use strict';
const test = require('node:test'); const assert = require('node:assert');
const path = require('path'); const fs = require('fs');
const chatlib = require('../src/core/chatlib');

function loadLibs(...parts) {
  const libs = parts.map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
  return chatlib.mergeLibs(libs);
}

test('pickById returns host arrive/leave lines (wives base library)', () => {
  const lib = loadLibs(path.join(__dirname, '../content/chat/library.json'));
  for (const id of ['nixie', 'noct']) {
    const a = chatlib.pickById(lib, id, 'guest_arrive_reply', () => 0);
    const l = chatlib.pickById(lib, id, 'guest_leave_reply', () => 0);
    assert.ok(a.text && a.text.length > 3, id + ' arrive');
    assert.ok(l.text && l.text.length > 3, id + ' leave');
    assert.strictEqual(a.rule, 'guest_arrive_reply');
    assert.strictEqual(l.rule, 'guest_leave_reply');
  }
});

test('chrispyni edition library: mommy-style host replies for ChrispyNi', () => {
  const base = path.join(__dirname, '../content/chat/library.json');
  const ed = path.join(__dirname, '../editions/chrispyni/chat/library.json');
  const lib = loadLibs(base, ed);
  const a = chatlib.pickById(lib, 'chrispyni', 'guest_arrive_reply', () => 0);
  const l = chatlib.pickById(lib, 'chrispyni', 'guest_leave_reply', () => 0);
  assert.ok(a.text, 'arrive');
  assert.ok(l.text, 'leave');
  assert.match(a.text, /cute one|baby|Missed|portal|Good girl|Come here/i);
  assert.match(l.text, /baby|waiting|Bye|Leaving|Come home|Safe trip|come back|Go on then/i);
});

test('reply() also matches __guest_arrive__ / __guest_leave__ magic phrases', () => {
  const lib = loadLibs(path.join(__dirname, '../editions/chrispyni/chat/library.json'));
  const compiled = chatlib.compile(lib);
  const a = chatlib.reply(lib, compiled, 'chrispyni', '__guest_arrive__', () => 0);
  assert.strictEqual(a.rule, 'guest_arrive_reply');
  assert.ok(a.text);
});
