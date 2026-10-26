// Classifies what the user typed: 'tiny' (1-2 chars), 'gibberish' (keyboard mash), or 'normal'. Latin + Cyrillic.
'use strict';
const VOWELS = /[aeiouyаеёиоуыэюя]/i;
const LETTER = /[a-zа-яё]/i;
const COMMON = new Set(('i a an the you me my we us is are am be do no yes ok okay hi hey hello love sleep mana what why how who where when good bad sad lol omg hmm hm brb gg wp afk ty np idk xd ну хм ага ого лол pls please thanks thank ' +
  'и а в на не я ты мы вы он она да нет ок привет пока люблю спать как что где кто почему спасибо хорошо плохо').split(/\s+/));
function analyze(text) {
  const t = String(text || '').trim().toLowerCase();
  const letters = [...t].filter((c) => LETTER.test(c));
  const words = t.split(/[^a-zа-яё']+/i).filter(Boolean);
  return { t, letters, words };
}
/** Heuristic keyboard-mash detector. */
function isGibberish(text) {
  const { t, letters, words } = analyze(text);
  if (!letters.length) return /^[^\s\w]*$/.test(t) ? false : t.replace(/\s/g, '').length >= 3 && !/\d/.test(t);
  if (words.some((w) => COMMON.has(w))) return false;
  if (letters.length < 3) return false;
  const vowels = letters.filter((c) => VOWELS.test(c)).length / letters.length;
  const diversity = new Set(letters).size / letters.length;
  const repeat = /(.)\1{3,}/.test(t);                           // aaaa, ffff
  const consRun = /[^aeiouyаеёиоуыэюя\s\d\W]{5,}/i.test(t);     // sdfghj, вплдж
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'йцукенгшщзхъ', 'фывапролджэ', 'ячсмитьбю'];
  const rowMash = letters.length >= 4 && rows.some((r) => { for (let i = 0; i + 4 <= r.length; i++) { const k = r.slice(i, i + 4); if (t.includes(k) || t.includes([...k].reverse().join(''))) return true; } return false; });
  let score = 0;
  if (rowMash) score += 2;
  if (letters.length >= 5) { if (vowels < 0.2) score += 1; }
  if (repeat) score += 2;
  if (consRun) score += 2;
  if (letters.length >= 6 && diversity < 0.3) score += 2;
  if (vowels === 0 && letters.length >= 4) score += 1;
  return score >= 2;
}
function classifyChat(text) {
  const t = String(text || '').trim();
  if ([...t].length <= 2) return 'tiny';
  return isGibberish(t) ? 'gibberish' : 'normal';
}
/** How many wives answer a normal message: usually one, sometimes both. */
function repliers(count, rng = Math.random, bothChance = 0.25) { return count > 1 && rng() < bothChance ? count : Math.min(1, count); }
module.exports = { classifyChat, isGibberish, repliers };
