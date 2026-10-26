// Turns bot / offline-brain replies into actions the characters perform.
// Accepts: JSON {speaker,text,mood,actions:[...]}, text tags like "*summons a teacup*",
// and bracket tags like "[summon:teacup]" or "[cast:void_burst]".
'use strict';

const ACTION_TYPES = ['say', 'walk_to', 'sit', 'sleep', 'wake', 'emote', 'summon', 'dismiss', 'cast',
  'change_mood', 'go_to_room', 'ask_mana', 'wait', 'face', 'jump', 'lay', 'run_to', 'interact', 'visit', 'leave'];

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9а-яё_ ]+/gi, ' ').replace(/\s+/g, ' ').trim(); }

/** Build a lookup from human words to ids: id, "name", and "aliases" of each prop/effect/room. */
function buildIndex(content = {}) {
  const idx = { props: [], effects: [], rooms: [] };
  for (const k of Object.keys(idx)) {
    for (const [id, v] of Object.entries(content[k] || {})) {
      const words = new Set([norm(id), norm(id.replace(/_/g, ' ')), norm(v.name)]);
      for (const a of v.aliases || []) words.add(norm(a));
      for (const w of words) if (w) idx[k].push([w, id]);
    }
    idx[k].sort((a, b) => b[0].length - a[0].length); // longest match first
  }
  return idx;
}

function findIn(list, phrase) {
  const p = ' ' + norm(phrase) + ' ';
  for (const [w, id] of list) if (p.includes(' ' + w + ' ') || p.includes(' ' + w + 's ')) return id;
  return null;
}

// Verb patterns for *star tags*. Each returns an action or null.
const VERBS = [
  [/\b(summon|conjure|materiali[sz]e|spawn|pull|produce|create)s?\b/, (t, I) => { const id = findIn(I.props, t); return id ? { type: 'summon', item: id } : null; }],
  [/\b(dismiss|banish|vanish|unsummon|unmake|remove)(es|s)?\b/, (t, I) => ({ type: 'dismiss', item: /\b(all|everything)\b/.test(t) ? 'all' : (findIn(I.props, t) || 'last') })],
  [/\b(cast|channel|weave)s?\b/, (t, I) => ({ type: 'cast', effect: findIn(I.effects, t) || null })],
  [/\b(sits?|sitting|plops?)\b/, (t, I) => ({ type: 'sit', on: findIn(I.props, t) || null })],
  [/\b(hugs?|cuddles?|squeezes?)\b/, () => ({ type: 'interact', kind: 'hug', with: 'chrispyni' })],
  [/\b(kiss(es)?|pecks?|smooch(es)?)\b/, () => ({ type: 'interact', kind: 'kiss', with: 'chrispyni' })],
  [/\b(waves?)\b/, () => ({ type: 'emote', anim: 'wave' })],
  [/\b(lies? down|lays? down|flops? on)\b/, (t, I) => ({ type: 'lay', on: findIn(I.props, t) || null })],
  [/\b(sleeps?|falls? asleep|naps?|dozes?)\b/, () => ({ type: 'sleep' })],
  [/\b(wakes? up|stretches)\b/, () => ({ type: 'wake' })],
  [/\b(walks?|wanders?|strolls?|struts?|runs?|goes|moves?)\b.*\b(left|right|center|centre|middle|you|chrispy|her)\b/, (t) => {
    const m = t.match(/\b(left|right|center|centre|middle|you|chrispy|her)\b/); const w = m[1];
    return { type: 'walk_to', target: w === 'centre' || w === 'middle' ? 'center' : (w === 'you' || w === 'her' ? 'chrispy' : w) };
  }],
  [/\b(our room|bedroom|to bed together|mana replenish)/, () => ({ type: 'go_to_room', room: 'our_room' })],
  [/\b(pouts?|huffs?|sulks?)\b/, () => ({ type: 'emote', anim: 'pout', mood: 'pouty' })],
  [/\b(giggles?|laughs?|beams?|cheers?|bounces?|twirls?|grins?)\b/, () => ({ type: 'emote', anim: 'happy' })],
  [/\b(jumps?|hops?)\b/, () => ({ type: 'jump' })],
  [/\b(smirks?)\b/, () => ({ type: 'emote', anim: 'idle', mood: 'smug' })],
];

function parseStarTag(tag, I) {
  const t = norm(tag);
  const out = [];
  for (const [re, fn] of VERBS) {
    if (re.test(t)) { const a = fn(t, I); if (a) { out.push(a); if (a.type === 'summon' || a.type === 'dismiss') break; } }
  }
  return out.slice(0, 2);
}

function parseBracket(body) {
  // [summon:teacup] [walk_to:left] [mood:smug] [cast:void_burst] [say:hi]
  const [k, ...rest] = body.split(':'); const v = rest.join(':').trim(); const key = norm(k).replace(/ /g, '_');
  const map = { summon: 'item', dismiss: 'item', cast: 'effect', walk_to: 'target', run_to: 'target', lay: 'on', interact: 'kind', visit: 'guest', emote: 'anim', go_to_room: 'room', sit: 'on', say: 'text', wait: 'sec' };
  if (key === 'mood' || key === 'change_mood') return { type: 'change_mood', mood: v };
  if (!ACTION_TYPES.includes(key)) return null;
  const a = { type: key }; if (map[key] && v) a[map[key]] = key === 'wait' ? Number(v) : v; return a;
}

/** Normalize one action object from JSON (lenient: {summon:"teacup"} also works). */
function normalizeAction(a) {
  if (typeof a === 'string') return parseBracket(a.replace(/^\[|\]$/g, ''));
  if (!a || typeof a !== 'object') return null;
  if (!a.type) { const k = Object.keys(a).find((x) => ACTION_TYPES.includes(x) || x === 'mood'); if (!k) return null; return parseBracket(`${k}:${a[k]}`); }
  const type = String(a.type).toLowerCase(); if (!ACTION_TYPES.includes(type) && type !== 'mood') return null;
  return { ...a, type: type === 'mood' ? 'change_mood' : type };
}

/** Extract actions from a text; returns {text (tags removed), actions}. */
function parseText(text, content) {
  const I = content && content._index ? content._index : buildIndex(content);
  const actions = [];
  let clean = String(text || '').replace(/\[([a-z_]+:[^\]]*|sit|sleep|wake|ask_mana|jump)\]/gi, (_, b) => { const a = parseBracket(b); if (a) actions.push(a); return ''; });
  clean = clean.replace(/\*([^*\n]{1,120})\*/g, (_, tag) => { actions.push(...parseStarTag(tag, I)); return ''; });
  return { text: clean.replace(/\s{2,}/g, ' ').trim(), actions };
}

/**
 * Parse any reply payload into a list of {speaker, text, mood, actions}.
 * Accepts: {replies:[...]}, [...], {speaker,...}, {who,...}, legacy {nixie:{text,mood}, noct:"..."} or plain text.
 */
function parseReply(payload, content, defaultSpeaker = 'nixie') {
  let p = payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = { speaker: defaultSpeaker, text: p }; } }
  const list = [];
  const push = (o, sp) => {
    if (typeof o === 'string') o = { text: o };
    if (!o || typeof o !== 'object') return;
    const speaker = String(o.speaker || o.who || o.character || sp || defaultSpeaker).toLowerCase();
    const parsed = parseText(o.text || '', content);
    const acts = (Array.isArray(o.actions) ? o.actions : []).map(normalizeAction).filter(Boolean);
    list.push({ speaker, text: parsed.text, mood: o.mood ? String(o.mood).toLowerCase() : null, actions: [...acts, ...parsed.actions], replyTo: o.replyTo || null });
  };
  if (Array.isArray(p)) p.forEach((o) => push(o));
  else if (p && Array.isArray(p.replies)) p.replies.forEach((o) => push(o));
  else if (p && (p.speaker || p.who || p.text || p.actions)) push(p);
  else if (p && typeof p === 'object') {
    for (const [k, v] of Object.entries(p)) if (!['v', 'id', 'type', 'replyTo', 'ts'].includes(k)) push(v, k);
  }
  return list.filter((r) => r.text || r.actions.length || r.mood);
}

module.exports = { parseReply, parseText, normalizeAction, buildIndex, ACTION_TYPES };
