// GTA-style cheat codes, typed in the chat box. Only work in admin mode; otherwise ignored silently.
'use strict';
const WORD_CODES = { MANAMANA: '/fullmana', ETERNALNIGHT: '/infmana', GIMMEALL: '/spawnall', OURROOM: '/room', SHOWMEBONES: '/hitboxes', BEDTIME: '/sleep', DEBUGMENU: '/debug', COMEHOME: '/visit chrispyni' };

const COMMANDS = {
  fullmana: 'Fill mana to max', infmana: 'Toggle infinite mana', mana: '/mana <n> set mana',
  summon: '/summon <prop_id> [x]', dismiss: '/dismiss <prop_id|all>', cast: '/cast <char> <effect_id>',
  mood: '/mood <char> <mood>', say: '/say <char> <text>', act: '/act <char> <json action or *tag*>',
  spawnall: 'Summon every prop', room: 'Go to our room now', sleep: 'Toggle sleep mode', speed: '/speed <x> game speed',
  debug: 'Open/close the DEBUG MENU', hitboxes: 'Toggle debug overlay (hitboxes, states)', visit: '/visit <char> guest visit', leave: '/leave <char> guest leaves', interact: '/interact <char> <wave|hug|kiss> [partner]', play: '/play <char> <anim> play an animation', reload: 'Reload content + mods', resetsave: 'Reset save (mana, moods, props)',
  relay: '/relay <json> inject a fake bot reply', event: '/event <kind> fire an awareness event', devpanel: 'Toggle dev panel',
  admin: '/admin <passphrase> unlock admin for this session', help: 'List cheats',
};

/** Returns {cmd, args, raw} or null if the text is not a cheat. */
function parseCheat(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (WORD_CODES[up]) return parseCheat(WORD_CODES[up]);
  if (!t.startsWith('/')) return null;
  const m = t.slice(1).match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  if (!COMMANDS[cmd]) return null;
  const rest = m[2].trim();
  const args = cmd === 'say' || cmd === 'act' ? (() => { const i = rest.indexOf(' '); return i < 0 ? [rest] : [rest.slice(0, i), rest.slice(i + 1)]; })()
    : cmd === 'relay' ? [rest] : rest ? rest.split(/\s+/) : [];
  return { cmd, args, raw: t };
}
module.exports = { parseCheat, COMMANDS, WORD_CODES };
