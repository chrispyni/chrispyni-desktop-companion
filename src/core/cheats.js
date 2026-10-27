// GTA-style cheat codes, typed in the chat box. Only work in admin mode; otherwise ignored silently.
'use strict';
const WORD_CODES = { MANAMANA: '/fullmana', ETERNALNIGHT: '/infmana', GIMMEALL: '/spawnall', OURROOM: '/room', SHOWMEBONES: '/hitboxes', BEDTIME: '/sleep', DEBUGMENU: '/debug', COMEHOME: '/visit chrispyni', FLOATY: '/magic nixie levitate noct', CRAFTYQUEENS: '/magic noct craft_together nixie', LOVEYOU: '/magic nixie lovely_gift chrispyni', ZENMODE: '/meditate', SPLAT: '/drop noct 0.95', SHOWMANA: '/showmana', KNOCKKNOCK: '/door', TAKEMYWIVES: '/take', HEADPATS: '/pat', COOKIETIME: '/feed' };

const COMMANDS = {
  fullmana: '/fullmana [char] fill mana', infmana: 'Toggle infinite mana', mana: '/mana [char] <n> set mana',
  moodlvl: '/moodlvl <char> <-3..3> set the hidden mood level', drop: '/drop <char> <0..1> drop from a height (fraction of screen)',
  magic: '/magic <char> <levitate|craft_together|lovely_gift|lovely_twirl> [partner]', meditate: '/meditate [char] meditate now',
  rest: '/rest [char|both] rest in our room', door: '/door [char] she summons a door and rests (costs her mana)', take: 'ChrispyNi comes to take her wives to our room',
  pat: '/pat [char] Chrispy pats her', feed: '/feed [char] [food] give her a snack', info: '/info <char> show the info window', delprop: '/delprop [uid|id] delete a prop (refunds part of its mana)',
  chatter: 'Wives chat with each other (… bubbles)', showmana: 'Toggle always-visible mana bars',
  summon: '/summon <prop_id> [x]', dismiss: '/dismiss <prop_id|all>', cast: '/cast <char> <effect_id>',
  mood: '/mood <char> <mood>', say: '/say <char> <text>', act: '/act <char> <json action or *tag*>',
  spawnall: 'Summon every prop', room: 'Go to our room now', sleep: 'Toggle sleep mode', speed: '/speed <x> game speed',
  debug: 'Open/close the DEBUG MENU', hitboxes: 'Toggle debug overlay (hitboxes, states)', visit: '/visit <char> guest visit', leave: '/leave <char> guest leaves', interact: '/interact <char> <wave|hug|kiss> [partner]', play: '/play <char> <anim> play an animation', reload: 'Reload content + mods', resetsave: 'Reset save (mana, moods, props)',
  event: '/event <kind> fire an awareness event', devpanel: 'Toggle dev panel',
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
    : rest ? rest.split(/\s+/) : [];
  return { cmd, args, raw: t };
}
// Cheats that are switches: entering the same code again turns it off.
const TOGGLES = new Set(['infmana', 'hitboxes', 'sleep', 'showmana', 'debug', 'devpanel', 'debugmenu', 'debugmode']);
/** Flip a switch cheat in `state` (an object). Returns the new value, or null if cmd isn't a switch. */
function toggleCheat(state, cmd) { const k = cmd === 'devpanel' || cmd === 'debugmenu' ? 'debug' : cmd; if (!TOGGLES.has(cmd)) return null; state[k] = !state[k]; return state[k]; }
module.exports = { TOGGLES, toggleCheat, parseCheat, COMMANDS, WORD_CODES };
