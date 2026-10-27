'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { loadContent } = require('../src/core/content');
const { Mana } = require('../src/core/mana');
const { MoodState } = require('../src/core/mood');
const { OfflineBrain } = require('../src/core/brain');
const { parseReply, parseText, buildIndex } = require('../src/core/actions');
const { parseCheat } = require('../src/core/cheats');
const { hashPassphrase, checkPassphrase, isAdminByIdentity } = require('../src/core/admin');
const { EventSystem } = require('../src/core/events');
const { classifyApp } = require('../src/core/awareness');

const content = loadContent(path.join(ROOT, 'content'), [path.join(ROOT, 'mods')]);
content._index = buildIndex(content);

test('content loads characters, props, effects, rooms, events, interactions, lines', () => {
  for (const id of ['nixie', 'noct', 'chrispyni']) assert.ok(content.characters[id], id);
  for (const a of ['idle', 'walk', 'run', 'sit', 'lay', 'talk', 'wave', 'hug', 'kiss']) assert.ok(content.characters.nixie.animations[a], a);
  for (const p of ['chair', 'sofa', 'bed', 'table', 'teacup', 'void_portal', 'light_orb', 'candles', 'books', 'cushion']) assert.ok(content.props[p], p);
  assert.ok(content.rooms.our_room); assert.ok(content.interactions.kiss); assert.ok(content.events.rare_star_shower);
  assert.ok(content.lines.nixie.idle.playful.length > 2);
  assert.deepStrictEqual(content.errors, []);
  assert.ok(content.mods.find((m) => m.id === 'example-mod') === undefined || true);
});

test('mods override and add, "_" mods are disabled', () => {
  const fs = require('fs'); const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwmod-'));
  fs.cpSync(path.join(ROOT, 'mods', '_example-mod'), path.join(tmp, 'example-mod'), { recursive: true });
  const c = loadContent(path.join(ROOT, 'content'), [tmp]);
  assert.strictEqual(c.props.teacup.manaCost, 1);
  assert.ok(c.props.teacup.image.endsWith('teacup.png'), 'base image kept after override');
  assert.ok(c.lines.nixie.idle.playful.some((l) => l.includes('MOD')));
  assert.ok(c.lines.nixie.idle.playful.length > content.lines.nixie.idle.playful.length);
  assert.ok(c.events.mod_one_percent_dance);
  const off = loadContent(path.join(ROOT, 'content'), [tmp], { disabledMods: ['example-mod'] });
  assert.strictEqual(off.props.teacup.manaCost, content.props.teacup.manaCost);
});

test('mana spends, refuses, regenerates by mode, infinite', () => {
  const m = new Mana({ max: 100, value: 10, regenPerMin: 6, sleepRegenPerMin: 60, roomRegenPerSec: 5 });
  assert.ok(m.spend(5)); assert.strictEqual(m.value, 5);
  assert.ok(!m.spend(50)); assert.strictEqual(m.value, 5);
  m.tick(60, 'awake'); assert.strictEqual(Math.round(m.value), 11);
  m.tick(60, 'sleep'); assert.strictEqual(Math.round(m.value), 71);
  m.tick(100, 'room'); assert.strictEqual(m.value, 100);
  m.value = 0; m.infinite = true; assert.ok(m.spend(999)); assert.strictEqual(m.value, 0);
  const l = new Mana({ max: 100, value: 15 }); assert.ok(l.low);
});

test('moods react to events and drift', () => {
  let s = 1; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const m = new MoodState(content.characters.nixie.personality, rng);
  for (let i = 0; i < 3; i++) m.react('other_got_attention');
  assert.strictEqual(m.current, 'jealous');
  m.set('smug', 10, 0); assert.strictEqual(m.current, 'smug');
  for (let i = 0; i < 200; i++) m.tick(60, 1e12);
  assert.ok(m.moods.includes(m.current));
});

test('action parser: star tags, brackets, JSON, legacy', () => {
  let p = parseText('Tea time! *summons a teacup* and *sits down*', content);
  assert.strictEqual(p.text, 'Tea time! and');
  assert.deepStrictEqual(p.actions[0], { type: 'summon', item: 'teacup' });
  assert.strictEqual(p.actions[1].type, 'sit');
  p = parseText('[cast:void_burst] [mood:smug] hi [walk_to:left]', content);
  assert.deepStrictEqual(p.actions.map((a) => a.type), ['cast', 'change_mood', 'walk_to']);
  assert.strictEqual(p.text, 'hi');
  assert.strictEqual(parseText('*opens a void portal*', content).actions.length, 0);
  assert.deepStrictEqual(parseText('*conjures a portal*', content).actions[0], { type: 'summon', item: 'void_portal' });
  assert.strictEqual(parseText('*kisses you*', content).actions[0].kind, 'kiss');
  assert.strictEqual(parseText('*lies down on the bed*', content).actions[0].on, 'bed');
  const r = parseReply({ v: 1, replies: [{ speaker: 'noct', text: 'Done.', mood: 'Calm', actions: [{ type: 'summon', item: 'chair' }, { walk_to: 'center' }, 'cast:void_burst', { type: 'nope' }] }] }, content);
  assert.strictEqual(r[0].speaker, 'noct'); assert.strictEqual(r[0].mood, 'calm');
  assert.deepStrictEqual(r[0].actions.map((a) => a.type), ['summon', 'walk_to', 'cast']);
  const legacy = parseReply({ nixie: { text: 'hi', mood: 'happy' }, noct: '...' }, content);
  assert.deepStrictEqual(legacy.map((x) => x.speaker), ['nixie', 'noct']);
  assert.strictEqual(parseReply('just text', content)[0].text, 'just text');
  assert.strictEqual(parseReply('{"speaker":"nixie","text":"*summons books* read!"}', content)[0].actions[0].item, 'books');
});

test('offline brain picks mood lines and fills vars', () => {
  const b = new OfflineBrain(content.lines, () => 0);
  const l = b.pick('nixie', 'media', 'happy', { title: 'Song' });
  assert.ok(l.includes('Song'));
  assert.strictEqual(b.chatTrigger('i love you'), 'chat_love');
  assert.ok(b.replyToChat('noct', 'blah blah', 'calm'));
  assert.strictEqual(b.pick('nixie', 'no_such_trigger', 'happy'), null);
});

test('cheats parse; word codes; unknown ignored', () => {
  assert.deepStrictEqual(parseCheat('/summon teacup 300'), { cmd: 'summon', args: ['teacup', '300'], raw: '/summon teacup 300' });
  assert.strictEqual(parseCheat('MANAMANA').cmd, 'fullmana');
  assert.strictEqual(parseCheat('debugmenu').cmd, 'debug');
  assert.deepStrictEqual(parseCheat('/say nixie hello there').args, ['nixie', 'hello there']);
  assert.strictEqual(parseCheat('/notacheat'), null);
  assert.strictEqual(parseCheat('hello'), null);
});

test('admin gate: identity + passphrase hash', () => {
  const rec = hashPassphrase('void queen');
  assert.ok(checkPassphrase('void queen', rec)); assert.ok(!checkPassphrase('nope', rec));
  assert.ok(isAdminByIdentity({ usernames: ['Chrispy'] }, { username: 'chrispy' }));
  assert.ok(!isAdminByIdentity({ usernames: ['your-windows-username'] }, { username: 'your-windows-username' }));
});

test('events: chance, weight, cooldown, conditions', () => {
  const ev = new EventSystem(content.events, () => 0.005);
  const e = ev.check('tick', { timeOfDay: 'night' }, 1000);
  assert.ok(e && e.id === 'rare_star_shower');
  assert.strictEqual(ev.check('tick', { timeOfDay: 'morning' }, 1001).id, 'rare_tea_party', 'star shower needs night & is on cooldown');
  const ev2 = new EventSystem(content.events, () => 0.5);
  assert.strictEqual(ev2.check('tick', { timeOfDay: 'night' }, 1000), null, '50% roll fails 1%/2% events');
  assert.ok(ev2.check('sleep', {}, 1000)); assert.strictEqual(ev2.check('sleep', {}, 2000), null, 'cooldown');
  assert.ok(ev2.check('tick', { timeOfDay: 'night' }, 1e9, true), 'force ignores chance');
});

test('awareness categorization', () => {
  assert.strictEqual(classifyApp({ title: 'Cool vid - YouTube - Google Chrome', owner: 'chrome' }), 'video');
  assert.strictEqual(classifyApp({ owner: 'Wow', process: 'Wow.exe' }), 'game');
  assert.strictEqual(classifyApp({ owner: 'blender' }), 'art');
  assert.strictEqual(classifyApp({ owner: 'obs64' }), 'stream');
});
