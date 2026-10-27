// ChrispyNi Desktop Companion overlay: the desktop world where Nixie & Noct live.
'use strict';
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadContent } = require('../core/content');
const { Mana } = require('../core/mana');
const { MoodState, animForMood } = require('../core/mood');
const { OfflineBrain } = require('../core/brain');
const { parseReply, parseText, buildIndex } = require('../core/actions');
const { parseCheat, COMMANDS, WORD_CODES, toggleCheat } = require('../core/cheats');
const { checkPassphrase, isAdminByIdentity } = require('../core/admin');
const chatlib = require('../core/chatlib');
const { timeOfDay, isSleepHour } = require('../core/awareness');
const { EventSystem } = require('../core/events');
const { Hooks, loadPlugins } = require('../core/plugins');
const { Affection } = require('../core/affection');
const { landingFor, PHYS_DEFAULTS, releaseVelocity, stepProjectile, pickThrow, nextThrowAt } = require('../core/physics');
const { inRect, spriteRect, wantsCapture, chatShouldClose } = require('../core/hit');
const { sleepPlan } = require('../core/sleepplan');
const { classifyChat, repliers } = require('../core/chatfilter');
const { tryEat } = require('../core/food');
const { tryPat } = require('../core/pat');
const { Pity } = require('../core/pity');
const { useOf, idleExpired, pickAmbientSummon } = require('../core/propuse');
const { isNear } = require('../core/hit');
const { isWatching } = require('../core/awareness');

const $ = (id) => document.getElementById(id);
const cv = $('world'); const g = cv.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let INIT, cfg, content, brain, events, hooks = new Hooks((m) => ipcRenderer.send('log', m));
let ground = 0, W = 0, H = 0, DPR = 1, speed = 1, debugDraw = false, infinite = false, showAllMana = false;
const wa = { x: 0, y: 0, w: 0, h: 0 };     // work area in window (CSS px == DIP) coords; characters never leave it
let roomWho = [], lastUserAt = Date.now(), lastChatter = 0, debugMode = false, watching = false, pity = null;
const cheatState = {};
const lastMove = { x: -1, y: -1, at: Date.now() };
const images = {};
const chars = {};          // id -> Char
const props = [];          // {uid,id,def,x,y,t}
const fx = [];             // {id,def,x,y,t}
let uidSeq = 1, sleepMode = false, sleepManual = false, roomOpen = false, adminSession = false;
let chatLib = { rules: [], fallback: {}, reactions: [] }, chatRules = [];
const aw = { app: null, category: null, idleSec: 0, idleLongFired: false, tod: null, lastReact: {}, stream: false };
let SAVE_PATH = '';

// ---------------- assets ----------------
function img(p) {
  if (!p) return null;
  if (images[p]) return images[p];
  const im = new Image();
  try { im.src = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); } catch { im.src = 'file:///' + p.replace(/\\/g, '/') + '?v=' + Date.now(); }
  images[p] = im; return im;
}

function loadAll() {
  for (const k of Object.keys(images)) delete images[k];
  for (const k of Object.keys(obCache)) delete obCache[k];
  content = loadContent(INIT.dirs.base, INIT.dirs.mods, { disabledMods: cfg.disabledMods, editionDir: INIT.dirs.edition, editionId: INIT.dirs.editionId });
  loadChatLibrary();
  content._index = buildIndex(content);
  { const old = pity; pity = new Pity(rules().guests || {}); if (old) pity.load(old.toJSON()); }
  if (content.errors.length) toast('Content errors: ' + content.errors.slice(0, 2).join(' | '));
  brain ? brain.setLines(content.lines) : (brain = new OfflineBrain(content.lines));
  events ? events.setDefs(content.events) : (events = new EventSystem(content.events));
  for (const c of Object.values(content.characters)) img(c.sheet);
  for (const p of Object.values(content.props)) img(p.image);
  for (const e of Object.values(content.effects)) img(e.image);
  // refresh existing characters' defs
  for (const ch of Object.values(chars)) if (content.characters[ch.id]) ch.def = content.characters[ch.id];
  for (const p of props) p.def = content.props[p.id] || p.def;
  // plugins
  hooks.clear();
  // JS plugins are disabled (mods are data-only: JSON + images); nothing from mods/ is ever executed.
  const loaded = [];
  hooks.emit('content_loaded', { content });
  if (debugOpen) buildDebug();
  return loaded;
}

// opaque bounds of one sprite frame (frame px), cached; used for the real hitbox
const obCache = {};
function opaqueBounds(im, sx, sy, fw, fh) {
  if (!im || !im.complete || !im.naturalWidth) return null;
  const k = im.src.length + ':' + im.src.slice(-24) + ':' + sx + ':' + sy;
  if (obCache[k] !== undefined) return obCache[k];
  try {
    const c = document.createElement('canvas'); c.width = fw; c.height = fh; const x = c.getContext('2d');
    x.drawImage(im, sx, sy, fw, fh, 0, 0, fw, fh); const d = x.getImageData(0, 0, fw, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) for (let xx = 0; xx < fw; xx++) if (d[(y * fw + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    obCache[k] = x1 < 0 ? null : { x: Math.max(0, x0 - 1), y: Math.max(0, y0 - 1), w: Math.min(fw, x1 - x0 + 3), h: Math.min(fh, y1 - y0 + 3) };
  } catch { obCache[k] = null; }
  return obCache[k];
}
const rules = () => (content && content.rules) || {};
const medCfg = () => ({ afterMin: 120, cooldownMin: 90, capRatio: 0.5, regenPerMin: 1.5, floorRate: 0.5, summonProp: 'cushion', ...(rules().mana || {}).meditation });
const moodRules = () => rules().mood || {};

// ---------------- characters ----------------
class Char {
  constructor(id, x, role = 'wife') {
    this.id = id; this.def = content.characters[id]; this.role = role;
    this.x = x; this.y = ground; this.vy = 0; this.facing = 1;
    this.anim = 'idle'; this.t = 0; this.loopAnim = null;
    this.state = 'idle'; this.target = null; this.speedMul = 1; this.seat = null; this.holdUntil = 0;
    this.queue = []; this.current = null; this.bubble = null; this.nextThink = performance.now() + rnd(2000, 6000);
    this.mood = new MoodState(this.def.personality || {});
    this.dragging = false; this.leaving = false;
    this.mana = (this.role === 'guest' && !this.def.guestCanAct) ? null : new Mana({ ...cfg.mana, ...(this.def.mana || {}) });
    this.aff = new Affection(moodRules());                                                         // hidden mood meter -3..+3
    this.lift = 0; this.levitate = null; this.falling = null; this.hoverT = 0; this.alpha = 1; this.wriggleUntil = 0; this.hit = null;
  }
  get halfW() { return this.fw * this.scale * 0.3; }
  get scale() { return (this.def.scale || 2) * (cfg.scale / 2 || 1); }
  get fw() { return this.def.frame.w; } get fh() { return this.def.frame.h; }
  /** The exact rect of what is drawn this frame (same numbers render() uses). */
  bbox() {
    const a = this.def.animations[this.anim] || this.def.animations.idle; const f = frameOf(oneShot(this.anim, a), this.t);
    const ob = opaqueBounds(img(this.def.sheet), f * this.fw, a.row * this.fh, this.fw, this.fh);
    return spriteRect({ x: this.drawX(), y: this.y, scale: this.scale, anchor: this.def.anchor, frame: this.def.frame, ob, facing: this.facing, lift: this.lift });
  }
  drawX() { return this.x + (performance.now() < this.wriggleUntil ? Math.sin(performance.now() / 30) * 3 : 0); }
  play(anim, holdSec = 0, loop = false) {
    if (!this.def.animations[anim]) anim = 'idle';
    if (this.anim !== anim) { this.anim = anim; this.t = 0; }
    if (holdSec) this.holdUntil = performance.now() + holdSec * 1000;
    if (loop) this.loopAnim = anim;
  }
  /** Animated '...' bubble: they're chatting/thinking, no text, nothing in the chat log. */
  dots(sec = 3) { this.bubble = { dots: true, text: '', until: performance.now() + sec * 1000 }; }
  question(sec = 2.5) { this.bubble = { q: true, text: '?', until: performance.now() + sec * 1000 }; this.play('idle'); }
  say(text, sec) {
    if (!text) return;
    this.bubble = { text, until: performance.now() + (sec || clamp(2.5 + text.length * 0.06, 3, 12)) * 1000, button: null };
    if (this.state === 'idle' || this.state === 'talk') this.play('talk', Math.min(2.5, text.length * 0.05));
    chatLog(this.id, text);
  }
  enqueue(actions) { for (const a of actions) if (a) this.queue.push(a); }
}

function addChar(id, x, role) {
  if (!content.characters[id]) { toast(`No character "${id}" in content`); return null; }
  const c = new Char(id, x, role); chars[id] = c; return c;
}
const wives = () => Object.values(chars).filter((c) => c.role !== 'guest');
const guestsOn = () => Object.values(chars).filter((c) => c.role === 'guest' && !c.hidden && !c.leaving);
const isChrispyEdition = () => !!(cfg && cfg.edition === 'chrispyni') || !!(INIT && INIT.edition === 'chrispyni');
const clampX = (x, ch) => clamp(x, wa.x + (ch ? ch.halfW : 20), wa.x + wa.w - (ch ? ch.halfW : 20));
const charName = (id) => (content.characters[id] || {}).name || id;

// --------------- talking via brain -------------
function vars(ch) {
  const others = wives().filter((c) => c !== ch);
  return { user: cfg.user, app: aw.app ? (aw.app.owner || aw.app.title) : '', title: aw.app && aw.app.media ? aw.app.media.title : '',
    time: aw.tod || timeOfDay(), other: others.length ? charName(others[0].id) : '', name: charName(ch.id) };
}
/** Ambient (unprompted) talk is only an animated '...' bubble; real text is for replies & important things. */
function ambient(ch, sec) { if (!ch || ch.hidden) return; if (Math.random() < (cfg.talk?.ambientTextChance || 0)) return; ch.dots(sec || rnd(2.5, 4)); }
function speak(ch, trigger, extra = {}) {
  if (!ch) return false;
  if (extra.ambient) { ambient(ch); return true; }
  const line = brain.pick(ch.def.personality.lines || ch.id, trigger, ch.mood.current, { ...vars(ch), ...extra }, ch.aff ? ch.aff.level : 0);
  if (!line) return false;
  const p = parseText(line, content);
  ch.enqueue([{ type: 'say', text: p.text }, ...p.actions]);
  return true;
}

// ---------------- actions ----------------
function resolveX(ch, target) {
  if (typeof target === 'number') return target;
  const t = String(target || '').toLowerCase();
  if (t === 'left') return wa.x + wa.w * 0.1; if (t === 'right') return wa.x + wa.w * 0.9; if (t === 'center') return wa.x + wa.w / 2;
  if (/^\d+$/.test(t)) return +t;
  if (chars[t] && chars[t] !== ch) return chars[t].x + (chars[t].x > ch.x ? -40 : 40);
  if (t === 'chrispy' || t === 'you' || t === 'chrispyni') { ch.seeking = true; return chars.chrispyni ? chars.chrispyni.x - 40 : clamp(lastMouse.x, 40, W - 40); }
  const p = nearestProp(ch.x, t, ch); if (p) return p.x;
  return rnd(wa.x + wa.w * 0.1, wa.x + wa.w * 0.9);
}
/** Who may use a prop: def.usableBy = 'all' (default) | [ids] (may include 'guests' or 'owner'). */
function usableBy(p, ch) {
  const u = p.def.usableBy; if (!ch || u == null || u === 'all') return true;
  const list = [].concat(u);
  return list.includes('all') || list.includes(ch.id) || (ch.role === 'guest' && list.includes('guests')) || (list.includes('owner') && p.owner === ch.id);
}
function nearestProp(x, idOrFlag, ch) {
  let best = null, bd = 1e9;
  for (const p of props) {
    if (p.portal || !usableBy(p, ch)) continue;
    const ok = idOrFlag === 'sittable' ? p.def.sittable : idOrFlag === 'layable' ? p.def.layable : idOrFlag === 'meditate' ? p.def.meditate : p.id === idOrFlag;
    if (ok && Math.abs(p.x - x) < bd) { bd = Math.abs(p.x - x); best = p; }
  }
  return best;
}
function costOk(ch, cost, what) {
  if (!ch || !ch.mana || !cost || infinite || ch.mana.spend(cost)) { saveSoon(); return true; }
  ch.mood.react('summon_fail'); speak(ch, 'summon_fail') || ch.say('Not enough mana…');
  hooks.emit('mana_denied', { char: ch.id, what, cost });
  return false;
}
function spawnFx(id, x, y, scale) {
  const def = content.effects[id]; if (!def) return;
  const e = { id, def, x, y, t: 0, scale: scale || def.scale || 2 }; fx.push(e); return e;
}
function summon(ch, id, x, free = false) {
  const def = content.props[id]; if (!def) { ch && ch.say(`(no prop "${id}")`); return null; }
  if (ch && !free && !costOk(ch, def.manaCost || 0, id)) return null;
  const px = clampX(x != null ? x : ch ? ch.x + (Math.random() < 0.5 ? -1 : 1) * rnd(45, 150) : rnd(wa.x + wa.w * 0.1, wa.x + wa.w * 0.9));
  const p = { uid: uidSeq++, id, def, x: px, y: ground - (def.float || 0) * 2, t: 0, born: Date.now(), pinned: !!def.pinned, owner: def.owner || (ch ? ch.id : null) };
  props.push(p); spawnFx(def.spawnEffect || 'spawn_sparkle', p.x, p.y - def.frame.h);
  hooks.emit('summon', { char: ch && ch.id, prop: id }); saveSoon();
  return p;
}
function dismiss(item) {
  const list = item === 'all' ? props.slice() : item === 'last' ? props.slice(-1) : props.filter((p) => p.id === item).slice(-1);
  for (const p of list) { spawnFx('void_burst', p.x, p.y - p.def.frame.h); props.splice(props.indexOf(p), 1); for (const c of Object.values(chars)) if (c.seat === p) standUp(c); }
  saveSoon();
}
function standUp(c) { if (c.meditating) { c.meditating = null; c.lastMeditate = Date.now(); } c.seat = null; c.state = 'idle'; c.y = ground; c.loopAnim = null; c.play('idle'); }

function interactionAllowed(def, a, b) {
  if (!def) return false;
  for (const [x, y] of def.forbidPairs || []) if ((a === x && b === y) || (a === y && b === x)) return false;
  if (def.requires && a !== def.requires && b !== def.requires) return false;
  if ((def.forbidWith || []).includes(a) || (def.forbidWith || []).includes(b)) return false;
  return true;
}

/** Start executing an action. Returns true when finished instantly. */
function startAction(ch, a) {
  const now = performance.now();
  hooks.emit('action', { char: ch.id, action: a });
  switch (a.type) {
    case 'say': ch.say(a.text, a.sec); ch.waitUntil = now + Math.min(3000, 600 + (a.text || '').length * 40); return false;
    case 'walk_to': case 'run_to': {
      if (ch.seat) standUp(ch);
      ch.target = ch.leaving ? clamp(resolveX(ch, a.target ?? a.x), wa.x + ch.halfW, wa.x + wa.w - ch.halfW) : clampX(resolveX(ch, a.target ?? a.x), ch); ch.state = a.type === 'run_to' || a.run ? 'run' : 'walk'; return false;
    }
    case 'sit': case 'lay': {
      const flag = a.type === 'sit' ? 'sittable' : 'layable';
      const p = a.on && a.on !== 'floor' ? (nearestProp(ch.x, a.on, ch) || (a.summon !== false && content.props[a.on] && summon(ch, a.on))) : nearestProp(ch.x, flag, ch);
      if (p && Math.abs(p.x - ch.x) > 8) { ch.queue.unshift(a); ch.target = p.x; ch.state = 'walk'; return false; }
      ch.seat = p || null; if (p) p.lastUsed = Date.now(); ch.state = a.type; ch.play(a.type, 0, true);
      if (p) { ch.x = p.x + (countOn(p) - 1) * 20; ch.y = ground - (p.def.seatY ?? (a.type === 'lay' ? 12 : 8)) * (cfg.scale || 2); }
      ch.holdUntil = now + (a.sec || rnd(8, 20)) * 1000; return true;
    }
    case 'sleep': ch.state = 'sleep'; ch.play(ch.seat && ch.seat.def.layable ? 'lay' : 'sleep', 0, true); ch.holdUntil = now + (a.sec || 30) * 1000; return true;
    case 'wake': if (ch.seat) standUp(ch); ch.state = 'idle'; ch.loopAnim = null; ch.play('happy', 1.6); ch.waitUntil = now + 1600; if (!speak(ch, 'wake')) ch.bubble = { text: pick(['*yaaawn*~', '*stretches* Mmh…', 'Nnn… morning?']), until: now + 3000 }; return false;
    case 'emote': if (a.mood) ch.mood.set(a.mood, 60); ch.play(a.anim || 'happy', a.sec || 2); ch.waitUntil = now + (a.sec || 2) * 1000; return false;
    case 'jump': ch.vy = -260; ch.play('happy', 0.8); return true;
    case 'face': ch.facing = a.dir === 'left' ? -1 : 1; return true;
    case 'change_mood': ch.mood.set(a.mood, a.holdSec || 120); return true;
    case 'summon': ch.play('cast', 0.7); summon(ch, a.item, a.x); ch.waitUntil = now + 700; return false;
    case 'dismiss': ch.play('cast', 0.5); dismiss(a.item || 'last'); return true;
    case 'cast': {
      const id = a.effect || ch.def.castEffect || 'spawn_sparkle'; const def = content.effects[id];
      if (!def) return true;
      if (!costOk(ch, def.manaCost || 0, id)) return true;
      ch.play('cast', 1); setTimeout(() => spawnFx(id, ch.x + ch.facing * 30, ch.y - ch.fh * ch.scale * 0.6), 300);
      ch.waitUntil = now + 1000; return false;
    }
    case 'go_to_room': goToRoom(a.room, [ch.id], { source: 'wife' }); return true;
    case 'enter_door': ch.inDoor = true; ch.alpha = 1; return true;
    case 'meditate': {
      if (!ch.mana || ch.mana.ratio >= medCfg().capRatio) return true;
      let p = nearestProp(ch.x, 'meditate', ch);
      if (!p && !a.summoned) {
        const cid = medCfg().summonProp, cost = (content.props[cid] || {}).manaCost || 0;
        if (content.props[cid] && (infinite || ch.mana.canAfford(cost))) { p = summon(ch, cid); a.summoned = true; }
      }
      if (p && Math.abs(p.x - ch.x) > 8) { ch.queue.unshift(a); ch.target = clampX(p.x, ch); ch.state = 'walk'; return false; }
      ch.seat = p || null; ch.state = 'meditate'; ch.play('sit', 0, true);
      if (p) { ch.x = p.x; ch.y = ground - (p.def.seatY ?? 8) * (cfg.scale || 2); }
      ch.meditating = { rate: p ? 1 : medCfg().floorRate, start: Date.now() };
      ch.holdUntil = now + 6 * 3600 * 1000; spawnFx('levitate_aura', ch.x, ch.y - ch.fh * ch.scale * 0.5);
      hooks.emit('meditate', { char: ch.id, on: p ? p.id : 'floor' }); return true;
    }
    case 'watch': ch.state = 'watch'; ch.facing = 1; ch.play('watch', 0, true); ch.holdUntil = now + 6 * 3600e3; return true;
    case 'use_prop': return useProp(ch, a);
    case 'clean_prop': { const p = props.find((q) => q.uid === a.uid); if (p) { ch.play('cast', 0.8); setTimeout(() => { if (props.includes(p)) { if (Math.random() < 0.3) speak(ch, 'prop_clean', { ambient: true }); deleteProp(p); } }, 600); } ch.waitUntil = now + 900; return false; }
    case 'play': ch.play(a.anim, a.sec || 1.5); ch.waitUntil = now + (a.sec || 1.5) * 1000; return false;
    case 'dots': ch.dots(a.sec || 3); return true;
    case 'ask_mana': askMana(ch); return true;
    case 'wait': ch.waitUntil = now + (a.sec || 1) * 1000; return false;
    case 'interact': return startInteract(ch, a);
    case 'throw_it': {
      const obj = a.kind === 'prop' ? props.find((p) => p.uid === a.uid) : chars[a.id];
      if (!obj || Math.abs(obj.x - ch.x) > 60 || (a.kind === 'char' && (obj.hidden || obj.dragging || obj.seat))) return true;
      const dir = obj.x >= ch.x ? 1 : -1; ch.facing = dir; ch.play('cast', 0.6); ch.waitUntil = now + 600;
      ch.bubble = { text: pick(['HMPH! Take THAT!', 'Out of my way!', 'Grrr…!', 'I SAID I\'M MAD!']), until: now + 3000 };
      const v = { vx: dir * rnd(600, 1100), vy: -rnd(700, 1100) };
      if (a.kind === 'prop') obj.fly = { x: obj.x, y: obj.y, ...v };
      else { obj.queue = []; obj.target = null; obj.current = null; obj.levitate = null; obj.fly = { x: obj.x, y: obj.y, ...v, minY: obj.y, user: false }; obj.play('fall'); if (obj.aff) obj.aff.event('touch_while_angry'); setTimeout(() => speak(obj, 'dropped') || obj.say('Hey!!'), 700); }
      hooks.emit('thrown', { by: ch.id, what: a.kind === 'prop' ? obj.id : obj.id }); return false;
    }
    case 'visit': visit(a.guest || 'chrispyni'); return true;
    case 'leave': { const gch = chars[a.guest || ch.id]; if (gch) leave(gch); return true; }
    default: return true;
  }
}
function countOn(p) { return Object.values(chars).filter((c) => c.seat === p).length; }

function startInteract(ch, a) {
  const def = content.interactions[a.kind]; if (!def) return true;
  let partner = chars[a.with];
  if (!partner || partner === ch) {
    // pick a valid partner
    partner = Object.values(chars).find((c) => c !== ch && interactionAllowed(def, ch.id, c.id));
  }
  if (!partner || !interactionAllowed(def, ch.id, partner.id)) {
    if (def.magic) return true;   // magic needs a partner on screen
    // partner absent (e.g. ChrispyNi not visiting): direct it at her, the user, through the screen
    ch.play(def.anim, def.durationSec || 2); speak(ch, def.lines || a.kind, { ambient: a.ambient });
    if (def.effect) spawnFx(def.effect, ch.x, ch.y - ch.fh * ch.scale);
    return true;
  }
  const dist = (def.distance || 30) * (ch.scale / 2);
  if (Math.abs(partner.x - ch.x) > dist + 4) {
    ch.queue.unshift({ ...a, with: partner.id });
    if (ch.seat) standUp(ch);
    ch.target = clampX(partner.x + (partner.x > ch.x ? -dist : dist), ch); ch.state = 'walk'; return false;
  }
  if (partner.waitUntil && partner.waitUntil > performance.now() + 50) { ch.queue.unshift({ ...a, with: partner.id }); ch.waitUntil = partner.waitUntil + 200; return false; }
  if (def.magic) {   // costs the caster's OWN mana (and the partner's for crafting together)
    if (!infinite && ((def.manaCost && !ch.mana?.canAfford(def.manaCost)) || (def.partnerManaCost && partner.mana && !partner.mana.canAfford(def.partnerManaCost)))) {
      if (!a.ambient) speak(ch, 'summon_fail') || ch.say('Not enough mana…'); return true;
    }
    costOk(ch, def.manaCost || 0, a.kind); if (def.partnerManaCost && partner.mana) costOk(partner, def.partnerManaCost, a.kind);
    ch.lastMagic = Date.now();
  }
  if (partner.seat) standUp(partner);
  ch.facing = partner.x > ch.x ? 1 : -1; partner.facing = -ch.facing;
  ch.play(def.anim, def.durationSec); partner.play(def.partnerAnim || def.anim, def.durationSec);
  partner.queue = []; partner.current = null; partner.waitUntil = performance.now() + def.durationSec * 1000; partner.state = 'idle'; partner.target = null;
  ch.waitUntil = performance.now() + def.durationSec * 1000;
  speak(ch, def.lines || a.kind, { ambient: a.ambient });
  if (def.partnerLines || Math.random() < 0.6) setTimeout(() => speak(partner, def.partnerLines || def.lines || a.kind, { ambient: a.ambient }), 900);
  if (def.levitatePartner) startLevitate(partner, def.levitatePartner);
  if (def.craftItem) setTimeout(() => { const ids = [].concat(def.craftItem).filter((i) => content.props[i]); if (ids.length) summon(null, pick(ids), (ch.x + partner.x) / 2, true); }, def.durationSec * 600);
  if (def.manaGift) for (const c of [ch, partner]) if (c.mana) c.mana.add(def.manaGift);   // hugs & kisses restore a little
  if (def.moodEvent) for (const c of [ch, partner]) c.aff && c.aff.event(def.moodEvent);
  if (def.effect) setTimeout(() => spawnFx(def.effect, (ch.x + partner.x) / 2, ch.y - ch.fh * ch.scale * 0.8), 400);
  if (!def.magic) ch.mood.react('room'); hooks.emit('interact', { kind: a.kind, a: ch.id, b: partner.id });
  return false;
}

function visit(gid) {
  if (chars[gid]) return;
  const fromLeft = Math.random() < 0.5;
  const c = addChar(gid, fromLeft ? wa.x + 30 : wa.x + wa.w - 30, 'guest'); if (!c) return;
  c.x = clampX(c.x, c); c.alpha = 0; c.fadeIn = false; c.waitUntil = performance.now() + 900;
  portal(c.x, 2600); setTimeout(() => { c.fadeIn = true; }, 700);      // a void portal opens at the edge, she steps out, it closes
  c.enqueue([{ type: 'walk_to', target: rnd(wa.x + wa.w * 0.3, wa.x + wa.w * 0.7) }]);
  speak(c, 'visit') || c.enqueue([{ type: 'say', text: 'Hi, my queens.' }]);
  c.leaveAt = performance.now() + (cfg.guestVisitMinutes || 3) * 60000;
  for (const w of wives()) { w.mood.react('back'); if (Math.random() < 0.7) w.enqueue([{ type: 'interact', kind: pick(['wave', 'hug']), with: gid, ambient: true }]); w.aff.event('with_chrispy'); }
  if (!isChrispyEdition() && gid === 'chrispyni' && !noAutoTake && !trip && !roomOpen && wives().some((w) => w.mana && w.mana.ratio < 0.6) && Math.random() < 0.3) setTimeout(chrispyTakes, 500);
  hooks.emit('visit', { guest: gid });
}
function leave(c) { speak(c, 'leave'); c.leaving = true; c.queue.push({ type: 'walk_to', target: c.x < wa.x + wa.w / 2 ? wa.x : wa.x + wa.w }); }   // walks to the edge, steps into a void portal
/** Void portal (guests only): opens at x, closes after ms. */
function portal(x, ms) {
  const def = content.props.void_portal; if (!def) return null;
  const p = { uid: uidSeq++, id: 'void_portal', def, x, y: ground, t: 0, born: Date.now(), pinned: true, portal: true };
  props.push(p); spawnFx('void_burst', x, ground - def.frame.h);
  setTimeout(() => { const i = props.indexOf(p); if (i >= 0) { props.splice(i, 1); spawnFx('void_burst', x, ground - def.frame.h); } }, ms);
  return p;
}

// Wives leave the desktop ONLY through a Door prop: walk to it, step in, room scene, come back out, door vanishes.
let trip = null, noAutoTake = false;
function goToRoom(room = 'our_room', who, opts = {}) {
  if (roomOpen || trip) return false;
  who = (who && who.length ? who : wives().map((c) => c.id)).filter((id) => chars[id] && !chars[id].hidden);
  if (!who.length) return false;
  const lead = chars[who[0]];
  let door = props.find((p) => p.def.door && who.every((id) => usableBy(p, chars[id])));
  if (!door) {
    if (opts.source === 'wife') {          // she summons it herself (costs her mana)
      door = summon(lead, 'door', clampX(lead.x + (lead.x < wa.x + wa.w / 2 ? 90 : -90)));
      if (!door) return false;
      speak(lead, 'door_summon');
    } else door = summon(null, 'door', clampX(lead.x + (lead.x < wa.x + wa.w / 2 ? 90 : -90)), true);   // you (or Chrispy) opened it
  }
  if (!door) return false;
  door.pinned = true;
  trip = { room, who, door, phase: 'walk', started: Date.now() };
  for (const id of who) {
    const c = chars[id]; if (c.seat) standUp(c);
    c.queue = [{ type: 'walk_to', target: door.x + (who.indexOf(id) - (who.length - 1) / 2) * 6 }, { type: 'enter_door' }];
    c.current = null; c.target = null; c.waitUntil = 0; c.levitate = null; c.lift = 0; c.mood.react('room');
  }
  if (opts.source !== 'wife') speak(lead, 'room_enter');
  hooks.emit('door', { who, source: opts.source || 'user' });
  return true;
}
function tripTick() {
  if (!trip || trip.phase !== 'walk') return;
  const cs = trip.who.map((id) => chars[id]).filter(Boolean);
  if (cs.length && cs.every((c) => c.hidden)) { trip.phase = 'room'; roomWho = trip.who; ipcRenderer.send('open-room', trip.room, trip.who); }
  else if (Date.now() - trip.started > 60000) { for (const c of cs) { c.inDoor = false; c.hidden = false; c.alpha = 1; } trip = null; }   // safety
}
function tripReturn() {
  if (!trip) return;
  const d = trip.door, who = trip.who; trip = null;
  who.forEach((id, i) => { const c = chars[id]; if (!c) return; c.inDoor = false; c.hidden = false; c.alpha = 0; c.fadeIn = true; c.x = clampX(d.x + (i - (who.length - 1) / 2) * 30, c); c.y = ground; c.queue = []; c.waitUntil = performance.now() + 600 + i * 300; });
  setTimeout(() => { const i = props.indexOf(d); if (i >= 0) { spawnFx('spawn_sparkle', d.x, d.y - d.def.frame.h / 2); props.splice(i, 1); } }, 2500);
}
/** ChrispyNi comes through her portal to take her wives to our room for a moment. */
function chrispyTakes() {
  if (roomOpen || trip) return;
  if (!chars.chrispyni) visit('chrispyni');
  const c = chars.chrispyni; if (!c) return;
  c.leaveAt = performance.now() + 10 * 60000;
  setTimeout(() => { if (!chars.chrispyni) return; speak(chars.chrispyni, 'take_wives') || chars.chrispyni.say('Come, my queens~'); setTimeout(() => goToRoom('our_room', [...wives().map((w) => w.id), 'chrispyni'], { source: 'guest' }), 1800); }, 3500);
}
function confirmReplenish(ch) {
  const plan = currentPlan(); const who = plan.length > 1 || (plan.length && plan[0] === ch.id) ? plan : [ch.id];
  if (ch.mana && ch.mana.ratio >= 0.5 && !infinite) { speak(ch, 'mana_fine') || ch.say("I'm fine~", 3); return; }   // only offered below 50%
  ch.bubble = { text: 'Replenish mana?', until: performance.now() + 12000, button: { label: who.length > 1 ? '💜 Rest together' : '💜 Open the door', fn: () => { ch.bubble = null; goToRoom('our_room', who, { source: 'user' }); } } };
}
function currentPlan() { return sleepPlan(wives().map((c) => ({ id: c.id, ratio: c.mana.ratio, low: c.mana.low && !infinite })), roomOpen ? roomWho : []); }
let lastAsk = 0;
let firstAskAt = 0;
function askMana(ch, plan) {
  lastAsk = Date.now(); if (!firstAskAt) firstAskAt = lastAsk;
  plan = plan && plan.length ? plan : [ch.id];
  speak(ch, 'ask_mana') || ch.say('Mana, please?');
  const label = plan.length > 1 ? '💜 Rest together (our room)' : `💜 Rest with ${charName(plan[0])} (our room)`;
  if (ch.bubble) ch.bubble.button = { label, fn: () => goToRoom('our_room', plan, { source: 'user' }) };
  if (ch.bubble) ch.bubble.until += 15000;
}

function startLevitate(ch, o = {}) {
  if (ch.seat) standUp(ch);
  const now = performance.now();
  ch.levitate = { start: now, until: now + (o.sec || 3) * 1000, h: o.height || 60, twirl: !!o.twirl };
  ch.queue = []; ch.target = null; ch.waitUntil = ch.levitate.until + 300; ch.play('float', o.sec || 3);
}
function dropFrom(ch, fraction) {   // debug: lift her to a height and let go
  if (ch.seat) standUp(ch); ch.queue = []; ch.target = null; ch.levitate = null; ch.lift = 0;
  ch.y = clamp(ground - fraction * wa.h, wa.y + ch.fh * ch.scale, ground); ch.vy = 0; ch.falling = { startY: ch.y, user: true };
}
function land(ch) {
  const f = ch.falling; ch.falling = null; if (!f) return;
  const kind = landingFor(ground - f.startY, wa.h, rules().physics || PHYS_DEFAULTS);
  hooks.emit('landed', { char: ch.id, kind });
  if (sleepMode) setSleep(false);                       // being dropped wakes them
  if (kind === 'normal') { ch.play('idle'); if (f.user && Math.random() < 0.3) speak(ch, 'dropped'); return; }
  ch.queue = []; ch.target = null;
  if (kind === 'superhero') {
    ch.play('superhero_land', 1.1); ch.waitUntil = performance.now() + 1100;
    spawnFx('spawn_sparkle', ch.x, ground - 6); ch.aff && ch.aff.event('superhero_land');
    setTimeout(() => speak(ch, 'land_superhero'), 400);
  } else {
    ch.play('faceplant', 1.8); ch.waitUntil = performance.now() + 1800;
    spawnFx('dizzy_stars', ch.x + ch.facing * 16, ground - 20); ch.aff && ch.aff.event('faceplant'); ch.mood.react('summon_fail');
    ch.queue.push({ type: 'play', anim: 'getup', sec: 1.2 });
    setTimeout(() => speak(ch, 'faceplant'), 900);
  }
}

// ---------------- simulation ----------------
function usablePropFor(ch) {
  const ok = props.filter((p) => useOf(p.def) && !p.portal && !p.def.door && canUse(p, ch) && !countOn(p));
  return ok.length ? pick(ok) : null;
}
function canUse(p, ch) { const u = p.def.usableBy; return !u || u === 'all' || (Array.isArray(u) && u.includes(ch.id)); }
/** sit/lay reuse the seat actions; sip/read/light/play: walk over, do the thing for a bit. */
function useProp(ch, a) {
  const p = props.find((q) => q.uid === a.uid); if (!p) return true;
  const use = useOf(p.def); p.lastUsed = Date.now();
  if (use === 'sit' || use === 'lay') { ch.queue.unshift({ type: use }); return true; }
  if (Math.abs(ch.x - p.x) > 24) { ch.queue.unshift({ type: 'walk_to', target: p.x + (ch.x < p.x ? -22 : 22) }, a); return true; }
  ch.facing = p.x >= ch.x ? 1 : -1;
  const [lo, hi] = (rules().props || {}).useSec || [6, 14];
  const anim = { sip: 'happy', read: 'talk', light: 'cast', play: 'happy' }[use] || 'idle';
  ch.play(anim, rnd(lo, hi), true); ch.waitUntil = performance.now() + rnd(lo, hi) * 1000;
  if (use === 'light') spawnFx('sparkle', p.x, p.y - 20);
  if (Math.random() < 0.1) speak(ch, 'prop_use', { ambient: true }); else if (Math.random() < 0.3) ch.dots(2);
  return true;
}
/** Unused for a while: whoever made it comes and dismisses it (50% back); ownerless props just fade. */
function cleanupProps() {
  const now = Date.now();
  for (const p of props.slice()) {
    if (countOn(p) || p.cleaning || !idleExpired(p, now, rules().props || {})) continue;
    const o = p.owner && chars[p.owner];
    if (o && o.mana && !o.hidden && o.state !== 'watch' && !o.seat) { p.cleaning = true; o.enqueue([{ type: 'walk_to', target: p.x + (o.x < p.x ? -26 : 26) }, { type: 'clean_prop', uid: p.uid }]); }
    else if (!o) props.splice(props.indexOf(p), 1);
  }
}
/** Soft-pity guest check (rules/guests.json). */
function pityFor(gid) { const d = content.characters[gid]; return d && d.pity ? (d._pity || (d._pity = new Pity(d.pity))) : pity; }
let lastGuestCheck = Date.now();
function guestCheck() {
  const G = rules().guests || {}; if (Date.now() - lastGuestCheck < (G.checkMin ?? 20) * 60000) return; lastGuestCheck = Date.now();
  if (roomOpen || sleepMode || trip) return;   // multiple guests allowed (e.g. both wives visiting ChrispyNi)
  if (Date.now() - lastUserAt > ((cfg.talk || {}).userIgnoredMin ?? 3) * 60000) pity.act('ignored');
  const pool = (cfg.guests && cfg.guests.length) ? cfg.guests : Object.keys(content.characters).filter((id) => content.characters[id].role === 'guest');
  const gid = pick(pool.filter((id) => content.characters[id] && !content.characters[id].noVisit && !chars[id]));
  if (!gid) return; const pp = pityFor(gid);
  if (pp.roll()) { if (pp !== pity) pity.reset(); visit(gid); }
  saveSoon();
}
let lastAnySummon = 0, ambSum = null;
function think(ch, now) {
  // autonomous behavior when queue is empty
  const m = ch.mood.current;
  if (ch.role === 'guest' && ch.leaveAt && now > ch.leaveAt && !ch.leaving) { leave(ch); return; }
  if (sleepMode) { if (ch.state !== 'sleep' && ch.state !== 'lay' && ch.role !== 'guest') goToBed(ch); return; }
  const tk = (ch.def.personality.talkativeness || 0.5) * (cfg.talkativeness ?? 1);
  const r = Math.random(), T = cfg.talk || {};
  const ignored = Date.now() - lastUserAt > (T.userIgnoredMin ?? 3) * 60000;
  const other = wives().find((c) => c !== ch && !c.hidden);
  const M = medCfg();
  const canAct = ch.role !== 'guest' || ch.def.guestCanAct;
  if (canAct && !sleepMode && !trip && ch.aff) {      // angry tantrum: rarely throws a prop or the other wife / a guest
    const th = pickThrow({ level: ch.aff.level, now: Date.now(), nextAt: ch.nextThrowAt || 0,
      props: props.map((p) => ({ uid: p.uid, pinned: p.pinned, door: p.def.door, sleepBed: p.sleepBed, occupied: countOn(p) > 0 || !!p.portal })),
      others: Object.values(chars).filter((c) => c !== ch && !c.hidden && !c.leaving).map((c) => ({ id: c.id, busy: c.dragging || !!c.fly || !!c.seat || c.inDoor })) });
    if (th) {
      ch.nextThrowAt = nextThrowAt(Date.now());
      const tx = th.kind === 'prop' ? (props.find((p) => p.uid === th.uid) || {}).x : (chars[th.id] || {}).x;
      if (tx != null) { ch.enqueue([{ type: 'walk_to', target: tx + (ch.x < tx ? -24 : 24) }, { type: 'throw_it', ...th }]); ch.nextThink = now + 8000; return; }
    }
  }
  const guest = (!isChrispyEdition() && ch.role !== 'guest' && visitingChrispy()) || (isChrispyEdition() && ch.role === 'guest' && chars.chrispyni && !chars.chrispyni.hidden && chars.chrispyni);
  if (guest && !trip && ch.state !== 'watch') {      // ChrispyNi is here: stay close, face her, fuss over her
    const d = Math.abs(ch.x - guest.x);
    if (d > 170) ch.enqueue([{ type: 'walk_to', target: nearChrispySpot(ch, guest) }]);
    else if (r < 0.22) ch.enqueue([{ type: 'interact', kind: pick(['hug', 'hug', 'kiss', 'wave']), with: guest.id, ambient: true }]);
    else if (r < 0.42 && Date.now() - (ch.lastGuestTalk || 0) > 25000) { ch.lastGuestTalk = Date.now(); ch.facing = guest.x > ch.x ? 1 : -1; speak(ch, 'to_chrispy') || ch.say(pick(TO_CHRISPY[ch.id] || TO_CHRISPY.nixie)); }
    else if (r < 0.62) ch.enqueue([{ type: 'walk_to', target: nearChrispySpot(ch, guest) }]);
    else { ch.facing = guest.x > ch.x ? 1 : -1; ch.play(animForMood(m, ch.def.moodAnims) === 'sleep' ? 'idle' : 'happy', rnd(1.5, 3)); }
    ch.nextThink = now + rnd(4000, 9000) / speed; return;
  }
  if (canAct && !isChrispyEdition() && !chars.chrispyni && Date.now() - lastUserAt > M.afterMin * 60000 && ch.mana.ratio < M.capRatio && Date.now() - (ch.lastMeditate || 0) > M.cooldownMin * 60000) {
    ch.enqueue([{ type: 'meditate' }]);                 // Chrispy's been away a long while: meditate a little mana back (max 50%)
  }
  else if (canAct && other && ignored && Date.now() - lastChatter > (T.idleChatterEveryMin ?? 4) * 60000 * rnd(0.7, 1.3) && r < 0.5 * tk + 0.2) {
    lastChatter = Date.now(); chatter(ch, other);          // ignored? they chat with EACH OTHER ('...' bubbles only)
  }
  else if (canAct && ch.mana && r < 0.05 && ch.mana.ratio > 0.5 && Date.now() - (ch.lastMagic || 0) > ((rules().mana || {}).ambientMagicCooldownMin || 40) * 60000) {
    const g = chars.chrispyni; const kinds = g ? ['lovely_gift', 'lovely_twirl'] : ['levitate', 'craft_together'];
    const kind = pick(kinds), with_ = g ? g.id : other && other.id;
    if (with_) ch.enqueue([{ type: 'interact', kind, with: with_, ambient: true }]);
  }
  else if (canAct && ch.mana && !watching && ch.state !== 'watch' && (ambSum = pickAmbientSummon({ lastSummonAt: Math.max(ch.lastSummon || 0, lastAnySummon), manaValue: ch.mana.value, manaRatio: ch.mana.ratio, onScreen: props.map((p) => p.id), props: content.props, opts: (rules().props || {}).ambientSummon }))) {
    ch.lastSummon = lastAnySummon = Date.now();                // conjures something to use now and then (costs her mana)
    ch.enqueue([{ type: 'summon', item: ambSum }]);
    setTimeout(() => { const p = props.filter((q) => q.id === ambSum).pop(); if (p && !ch.hidden) ch.enqueue([{ type: 'use_prop', uid: p.uid }]); }, 1200);
  }
  else if (canAct && r < 0.12 + ((rules().props || {}).useChance ?? 0.12) && usablePropFor(ch)) {
    const p = usablePropFor(ch); ch.enqueue([{ type: 'use_prop', uid: p.uid }]);   // use what's lying around
  }
  else if (r < 0.5) { ch.enqueue([{ type: ch.mana && ch.mana.ratio > 0.6 && Math.random() < 0.15 ? 'run_to' : 'walk_to', target: wanderTarget(ch) }]); }
  else if (r < 0.62 && nearestProp(ch.x, 'sittable', ch)) { ch.enqueue([{ type: 'sit' }]); }
  else if (r < 0.68) { const o = Object.values(chars).find((c) => c !== ch && !c.hidden); if (o) ch.enqueue([{ type: 'interact', kind: o.id === 'chrispyni' ? pick(['hug', 'kiss', 'wave']) : 'wave', with: o.id, ambient: true }]); }
  else { const an = animForMood(m, ch.def.moodAnims); ch.play(an, rnd(2, 5)); }
  ch.nextThink = now + rnd(5000, 14000) / speed;
}

// ---- ChrispyNi visiting: the wives keep close to her ----
const TO_CHRISPY = {
  nixie: ['My queen~ you came!', 'Stay a little longer, okay?', 'Look look, I was good today!', 'Ehehe~ I missed you.'],
  noct: ['...You\'re here. Good.', 'Don\'t leave too soon, love.', 'Mm. I saved you a spot.', 'Took you long enough~'],
};
function visitingChrispy() { const g = chars.chrispyni; return g && !g.hidden && !g.leaving && !g.fadeOut ? g : null; }
function nearChrispySpot(ch, g) {   // each wife keeps to her own side of ChrispyNi, within a short radius
  const others = wives().filter((w) => !w.hidden); const side = others.indexOf(ch) % 2 === 0 ? -1 : 1;
  return clampX(g.x + side * rnd(35, 110), ch);
}
/** Random spot across the whole work area; near an edge she heads back toward the middle (edge repulsion). */
function wanderTarget(ch) {
  const gv = ch.role !== 'guest' && visitingChrispy(); if (gv) return nearChrispySpot(ch, gv);
  const rel = (ch.x - wa.x) / Math.max(1, wa.w);
  if (rel < 0.15) return clampX(wa.x + wa.w * rnd(0.3, 0.85), ch);
  if (rel > 0.85) return clampX(wa.x + wa.w * rnd(0.15, 0.7), ch);
  return clampX(Math.random() < 0.6 ? wa.x + wa.w * rnd(0.08, 0.92) : ch.x + rnd(-350, 350), ch);
}
function chatter(a, b) {
  // walk close, face each other, take turns with '...' bubbles (pixel-game style, no text)
  a.enqueue([{ type: 'walk_to', target: b.x + (b.x > a.x ? -60 : 60) }]);
  const turns = 2 + Math.floor(Math.random() * 3);
  let t = 0;
  for (let i = 0; i < turns; i++) {
    const who = i % 2 ? b : a; const s = rnd(1.8, 3);
    setTimeout(() => { if (who.hidden) return; who.facing = (i % 2 ? a : b).x > who.x ? 1 : -1; who.dots(s); who.play(Math.random() < 0.3 ? 'happy' : 'talk', s * 0.8); }, 1500 + t * 1000);
    t += s + 0.4;
  }
  b.nextThink = performance.now() + (t + 3) * 1000; a.nextThink = performance.now() + (t + 3) * 1000;
}

/** Cursor within ~10 px and staying: she stops and looks at it (a couple of times at most while it stays). */
function curiosity(ch, now) {
  // a cursor that hasn't moved (e.g. resting while AFK) never makes her curious; asleep she ignores it entirely
  if (Date.now() - lastMove.at > 8000) { ch.nearSince = 0; if (ch.looking) ch.looking = 0; return; }
  if (sleepMode || ch.role === 'guest' || drag || ch.state === 'watch' || ch.state === 'meditate' || ch.levitate || ch.falling || ch.inDoor) { ch.nearSince = 0; return; }
  const near = isNear(ch.hit, lastMouse.x, lastMouse.y, (rules().cursor || {}).nearPx ?? 10);
  if (!near) { ch.nearSince = 0; if (!isNear(ch.hit, lastMouse.x, lastMouse.y, 120)) { ch.lookCount = 0; ch.nextLook = 0; } if (ch.looking && now > ch.looking) ch.looking = 0; return; }
  if (!ch.nearSince) ch.nearSince = now;
  if (ch.looking) { if (now > ch.looking) { ch.looking = 0; ch.lookCount = (ch.lookCount || 0) + 1; ch.nextLook = now + rnd(25, 50) * 1000; } else { ch.facing = lastMouse.x >= ch.x ? 1 : -1; } return; }
  const maxLooks = (rules().cursor || {}).maxLooks ?? 2;
  if (now - ch.nearSince > 600 && (ch.lookCount || 0) < maxLooks && now > (ch.nextLook || 0)) {
    ch.looking = now + rnd(3, 5) * 1000; ch.target = null; ch.state = ch.seat ? ch.state : 'idle';
    ch.facing = lastMouse.x >= ch.x ? 1 : -1; if (!ch.seat) ch.play('idle', 4);
    if (!ch.lookCount && Math.random() < 0.25) speak(ch, 'curious'); else if (!ch.bubble) ch.question(2.5);
  }
}

function update(dt) {
  const now = performance.now();
  for (const ch of Object.values(chars)) {
    ch.t += dt;
    ch.mood.tick(dt);
    if (ch.bubble && now > ch.bubble.until) ch.bubble = null;
    if (ch.fadeIn) { ch.alpha = Math.min(1, ch.alpha + dt * 2); if (ch.alpha >= 1) ch.fadeIn = false; }
    if (ch.dragging || ch.hidden) continue;
    curiosity(ch, now);
    // levitation (eased up, hover, gentle float down; never above the work area)
    if (ch.levitate) {
      const L = ch.levitate, k = (now - L.start) / (L.until - L.start);
      const maxH = Math.max(0, ch.y - (wa.y + ch.fh * ch.scale));
      const e = k < 0.2 ? k / 0.2 : k > 0.8 ? Math.max(0, (1 - k) / 0.2) : 1;
      ch.lift = Math.min(maxH, L.h * (1 - (1 - e) * (1 - e))) + (k > 0.2 && k < 0.8 ? Math.sin(now / 300) * 3 : 0);
      if (L.twirl) ch.facing = Math.floor(now / 350) % 2 ? 1 : -1;
      if (ch.anim !== 'float') ch.play('float');
      if (k >= 1) { ch.levitate = null; ch.lift = 0; ch.play('idle'); }
      continue;
    }
    // gravity / falls
    const baseY = ch.seat ? ch.y : ground;
    const G = (rules().physics || PHYS_DEFAULTS).gravity || 2600;
    if (ch.fly) {                                        // thrown: projectile with one damped bounce
      const hw = ch.halfW || 16, F = ch.fly;
      const flying = stepProjectile(F, dt * speed, { left: wa.x + hw, right: wa.x + wa.w - hw, top: wa.y + ch.fh * ch.scale, floor: ground }, G);
      ch.x = F.x; ch.y = F.y; F.minY = Math.min(F.minY, F.y); if (F.vx) ch.facing = F.vx > 0 ? 1 : -1;
      if (ch.anim !== 'fall') ch.play('fall');
      if (!flying) { ch.fly = null; ch.vy = 0; ch.falling = { startY: F.minY, user: F.user }; land(ch); }
      continue;
    }
    if (ch.y < baseY || ch.vy) {
      ch.vy += G * dt; ch.y += ch.vy * dt;
      if (ch.falling && ch.anim !== 'fall' && ground - ch.y > 20) ch.play('fall');
      if (ch.y >= baseY) { ch.y = baseY; ch.vy = 0; if (ch.falling) land(ch); }
    }
    if (!ch.seat && ch.y > ground) ch.y = ground;
    if (!ch.leaving) ch.x = clampX(ch.x, ch);
    if (ch.role !== 'guest' && !ch.seat && ch.target == null && !ch.queue.length && !trip) {
      const rel = (ch.x - wa.x) / Math.max(1, wa.w);
      if (rel < 0.08 || rel > 0.92) { ch.edgeT = (ch.edgeT || 0) + dt; if (ch.edgeT > 8) { ch.edgeT = 0; ch.enqueue([{ type: 'walk_to', target: wanderTarget(ch) }]); } } else ch.edgeT = 0;
    }
    // movement
    if (ch.target != null) {
      const sp = (ch.def.walkSpeed || 45) * (ch.state === 'run' ? 2.4 : 1) * speed * (ch.scale / 2) * 2.2;
      const d = ch.target - ch.x; ch.facing = d > 0 ? 1 : -1;
      if (Math.abs(d) <= sp * dt) { ch.x = ch.target; ch.target = null; ch.state = 'idle'; }
      else { ch.x += Math.sign(d) * sp * dt; ch.anim !== (ch.state === 'run' ? 'run' : 'walk') && ch.play(ch.state === 'run' ? 'run' : 'walk'); }
      if (ch.target == null && ch.leaving && !ch.fadeOut) { ch.fadeOut = true; ch.alpha = 1; portal(ch.x, 2200); ch.waitUntil = 0; }
      if (ch.target != null) continue;
    }
    if (ch.fadeOut) { ch.alpha -= dt * 1.2; if (ch.alpha <= 0) { delete chars[ch.id]; } continue; }
    if (ch.inDoor) { ch.alpha -= dt * 2; if (ch.alpha <= 0) { ch.alpha = 0; ch.hidden = true; } continue; }
    if (ch.waitUntil && now < ch.waitUntil) continue;
    ch.waitUntil = 0;
    if (ch.queue.length) { const a = ch.queue.shift(); ch.current = a; startAction(ch, a); continue; }
    if (ch.state === 'meditate' && ch.meditating) continue;
    if (ch.state === 'watch') {
      if (!watching) { standUp(ch); continue; }
      if (Date.now() - lastWatchTalk > rnd(3, 6) * 60000) { lastWatchTalk = Date.now(); Math.random() < 0.15 ? speak(ch, 'watch_comment') : ch.dots(2.5); }
      continue;
    }
    if (sleepMode && (ch.state === 'lay' || ch.state === 'sleep') && !ch.bubble) ch.bubble = { text: pick(['z', 'z Z', 'z z Z']), z: true, until: now + 2200 };
    if (ch.looking && now < ch.looking) continue;
    { const gv = ch.role !== 'guest' && !ch.seat && ch.target == null && visitingChrispy(); if (gv && Math.abs(gv.x - ch.x) > 6) ch.facing = gv.x > ch.x ? 1 : -1; }
    if ((ch.state === 'sit' || ch.state === 'lay' || ch.state === 'sleep') && now < ch.holdUntil) continue;
    if ((ch.state === 'sit' || ch.state === 'lay' || ch.state === 'sleep') && !sleepMode) standUp(ch);
    if (now > ch.holdUntil && ch.anim !== 'idle' && !ch.loopAnim && ch.state === 'idle') ch.play(animForMood(ch.mood.current, ch.def.moodAnims) === 'sleep' ? 'idle' : 'idle');
    if (ch.loopAnim && ch.state === 'idle' && !ch.seat) ch.play(ch.loopAnim);
    if (now > ch.nextThink && !ch.loopAnim) { think(ch, now); if (!ch.nextThink || ch.nextThink < now) ch.nextThink = now + rnd(5000, 12000); }
  }
  for (const p of props) {
    p.t += dt;
    if (p.fly) { const fl = (p.def.float || 0) * 2; const hw = (p.def.frame.w || 32) * (cfg.scale || 2) / 2;
      if (!stepProjectile(p.fly, dt * speed, { left: wa.x + hw, right: wa.x + wa.w - hw, top: wa.y + 20, floor: ground - fl }, (rules().physics || PHYS_DEFAULTS).gravity || 2600)) { p.y = ground - fl; p.x = p.fly.x; p.fly = null; spawnFx('spawn_sparkle', p.x, p.y - 6); }
      else { p.x = p.fly.x; p.y = p.fly.y; } }
  }
  for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.t += dt; if (!e.def.loop && e.t * e.def.fps >= e.def.frames) fx.splice(i, 1); }
  // props expire
  for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (p.def.lifetimeSec && Date.now() - p.born > p.def.lifetimeSec * 1000 && !countOn(p) && !p.pinned) props.splice(i, 1); }
  tripTick();
  if (lastMouse.x !== lastMove.x || lastMouse.y !== lastMove.y) { lastMove.x = lastMouse.x; lastMove.y = lastMouse.y; lastMove.at = Date.now(); }
  // mana: each wife her own pool. Only magic drains it; rest restores it.
  for (const w of wives()) {
    w.mana.tick(dt * speed, w.hidden && roomOpen ? 'room' : sleepMode ? 'sleep' : 'awake');
    if (w.meditating) {
      const M = medCfg(), cap = w.mana.max * M.capRatio;
      if (w.mana.value < cap) w.mana.value = Math.min(cap, w.mana.value + M.regenPerMin / 60 * w.meditating.rate * dt * speed);
      if (w.mana.value >= cap - 0.001) { standUp(w); w.play('happy', 1); }   // stops at 50%; never higher
    }
  }
  for (const c of Object.values(chars)) if (c.aff) c.aff.decay(Date.now());
  const plan = currentPlan();
  if (!plan.length) firstAskAt = 0;
  else if (!roomOpen) {
    const askMin = Math.max(15, cfg.mana.askEveryMin || 20), autoMin = cfg.mana.autoRestAfterMin ?? 10;
    if (firstAskAt && Date.now() - firstAskAt > autoMin * 60000) { firstAskAt = 0; goToRoom('our_room', plan, { source: 'wife' }) || goToRoom('our_room', plan, { source: 'user' }); }   // they go to rest with Chrispy themselves
    else if (Date.now() - lastAsk > askMin * 60000) { const w = chars[plan[0]]; if (w && !w.hidden) { w.mood.react('low_mana'); askMana(w, plan); } }
  }
}

// ---------------- rendering ----------------
function drawSprite(im, sx, sy, sw, sh, dx, dy, scale, flip) {
  if (!im || !im.complete || !im.naturalWidth) return;
  g.save(); g.translate(Math.round(dx), Math.round(dy));
  if (flip) { g.scale(-1, 1); }
  // mirrored around the anchor: with scale(-1,1) the image spans [dx - w, dx] — same rect the hitbox uses (old code drew it one width too far right)
  g.drawImage(im, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale); g.restore();
}
const ONE_SHOT = new Set(['fall', 'superhero_land', 'faceplant', 'getup']);   // play once, hold the last frame
function oneShot(name, a) { return ONE_SHOT.has(name) && a.once === undefined ? { ...a, once: true } : a; }
function frameOf(anim, t) { const n = Math.floor(t * (anim.fps || 6) * speed), m = Math.max(1, anim.frames); return anim.once ? Math.min(n, m - 1) : n % m; }

function bubbleBox(ch, bw, bh) {
  const r0 = ch.hit || ch.bbox(); const r = ch.hoverRect ? { ...r0, y: Math.min(r0.y, ch.hoverRect.y - 4) } : r0;   // always above the mana bar
  const x = clamp(ch.x - bw / 2, wa.x + 4, wa.x + wa.w - bw - 4);
  const y = clamp(r.y - 10 - bh, wa.y + 4, ground - bh - 4);
  return { x, y };
}
function drawBubble(ch) {
  const b = ch.bubble; const st = ch.def.bubble || {};
  g.fillStyle = st.bg || '#fff'; g.strokeStyle = st.border || '#000'; g.lineWidth = 2;
  if (b.dots || b.q) {   // pixel-game style '...' / '?' bubble
    const bw = b.q ? 26 : 40, bh = 22; const { x, y } = bubbleBox(ch, bw, bh);
    roundRect(x, y, bw, bh, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(ch.x - 4, y + bh); g.lineTo(ch.x, y + bh + 6); g.lineTo(ch.x + 4, y + bh); g.fill();
    g.fillStyle = st.text || '#000';
    if (b.q) { g.font = 'bold 15px "Segoe UI", sans-serif'; g.fillText('?', x + 9, y + 16); }
    else { const n = Math.floor(performance.now() / 350) % 4; for (let i = 0; i < 3; i++) if (i < n) g.fillRect(x + 9 + i * 9, y + 10, 4, 4); }
    b.rect = { x, y, w: bw, h: bh }; return;
  }
  g.font = '13px "Segoe UI", sans-serif';
  const maxW = 220, words = b.text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  let bw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 16;
  if (b.button) { g.font = 'bold 12px "Segoe UI", sans-serif'; bw = Math.max(bw, Math.min(260, g.measureText(b.button.label).width + 34 + (b.button2 ? g.measureText(b.button2.label).width + 30 : 0))); g.font = '13px "Segoe UI", sans-serif'; }
  const bh = lines.length * 16 + 10 + (b.button ? 30 : 0);
  const { x, y } = bubbleBox(ch, bw, bh);
  roundRect(x, y, bw, bh, 8); g.fill(); g.stroke();
  const tx = clamp(ch.x, x + 8, x + bw - 8);
  g.beginPath(); g.moveTo(tx - 6, y + bh); g.lineTo(tx, y + bh + 8); g.lineTo(tx + 6, y + bh); g.fill();
  g.fillStyle = st.text || '#000'; lines.forEach((l, i) => g.fillText(l, x + 8, y + 18 + i * 16));
  b.rect = { x, y, w: bw, h: bh };
  if (b.button) {
    const by = y + bh - 30, two = !!b.button2, w1 = two ? Math.round((bw - 18) * 0.62) : bw - 12;
    g.fillStyle = '#6a2fa8'; roundRect(x + 6, by, w1, 24, 6); g.fill();
    g.font = 'bold 12px "Segoe UI", sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(b.button.label, x + 6 + w1 / 2, by + 12, w1 - 12);
    b.button.rect = { x: x + 6, y: by, w: w1, h: 24 };
    if (two) {
      const x2 = x + 12 + w1, w2 = bw - 18 - w1; g.fillStyle = '#3a2a4a'; roundRect(x2, by, w2, 24, 6); g.fill();
      g.fillStyle = '#ddd'; g.fillText(b.button2.label, x2 + w2 / 2, by + 12, w2 - 8); b.button2.rect = { x: x2, y: by, w: w2, h: 24 };
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// hover info: small mana bar (wives) / name + mood (guest) above the head, fades out
function drawHover(ch, now) {
  const age = now - ch.hoverT; const a = showAllMana ? 1 : clamp(1 - (age - 700) / 500, 0, 1);
  if (a <= 0 || ch.hidden) { ch.hoverRect = null; return; }
  const r = ch.hit || ch.bbox(); const bw = 64, x = clamp(ch.x - bw / 2, wa.x + 2, wa.x + wa.w - bw - 2), y = Math.max(wa.y + 2, r.y - 18);
  g.save(); g.globalAlpha = a;
  g.font = 'bold 10px "Segoe UI", sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#000a'; g.fillText(charName(ch.id), ch.x + 1, y - 2); g.fillStyle = '#fff'; g.fillText(charName(ch.id), ch.x, y - 3);
  ch.hoverRect = ch.mana ? { x: x - 2, y: y - 4, w: bw + 4, h: 26 } : null;
  if (ch.mana) {
    g.fillStyle = '#1a1024dd'; roundRect(x, y, bw, 7, 3); g.fill();
    const pal = ch.def.palette || {}; g.fillStyle = ch.mana.low && !infinite ? '#ff5a7a' : (pal.accent || '#b27cff');
    if (ch.mana.ratio > 0) { roundRect(x + 1, y + 1, Math.max(2, (bw - 2) * (infinite ? 1 : ch.mana.ratio)), 5, 2); g.fill(); }
    g.strokeStyle = '#d4a537'; g.lineWidth = 1; roundRect(x, y, bw, 7, 3); g.stroke();
    g.font = '9px "Segoe UI", sans-serif'; g.fillStyle = '#fff'; g.fillText(infinite ? '∞' : `${Math.floor(ch.mana.value)}/${ch.mana.max}${ch.meditating ? ' · meditating' : ''}`, ch.x, y + 17);
  } else { g.font = '9px "Segoe UI", sans-serif'; g.fillStyle = '#ffe08a'; g.fillText(`visiting · ${ch.mood.current}`, ch.x, y + 8); }
  g.restore();
}

/** Pupils follow the cursor while she's curious (data: character.json "eyes"). */
function drawEyes(ch, X, s) {
  const e = ch.def.eyes, ax = ch.def.anchor.x, top = ch.y - ch.lift - ch.def.anchor.y * s;
  const ddx = clamp(Math.round((lastMouse.x - ch.x) / 60), -1, 1) * ch.facing, ddy = clamp(Math.round((lastMouse.y - (top + e.y * s)) / 80), -1, 0);
  for (const ex of e.x) {
    const fx = ch.facing < 0 ? (2 * ax - ex - e.w) : ex;                // mirror the eye column when facing left
    const px = X - ax * s + fx * s, py = top + (e.y - 1) * s;
    g.fillStyle = e.iris; g.fillRect(px, py, e.w * s, e.h * s);
    g.fillStyle = e.white; g.fillRect(px + (ddx > 0 ? 0 : 1) * s, py, s, s);
    g.fillStyle = e.pupil; g.fillRect(px + (ddx * ch.facing > 0 ? 1 : 0) * s, py + (1 + ddy) * s, s, s);
  }
}
function render() {
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const now = performance.now();
  for (const p of props) {
    const d = p.def, s = 2 * (cfg.scale / 2 || 1), f = Math.floor(p.t * (d.fps || 1)) % (d.frames || 1);
    const bob = d.float ? Math.sin(p.t * 2) * 3 : 0;
    drawSprite(img(d.image), f * d.frame.w, 0, d.frame.w, d.frame.h, p.x - d.anchor.x * s, p.y - d.anchor.y * s + bob, s, false);
    if (debugDraw) { g.strokeStyle = '#0f0'; g.strokeRect(p.x - d.anchor.x * s, p.y - d.anchor.y * s, d.frame.w * s, d.frame.h * s); }
  }
  const list = Object.values(chars).sort((a, b) => a.y - b.y);
  for (const ch of list) {
    if (ch.hidden) { ch.hit = null; continue; }
    const a = ch.def.animations[ch.anim] || ch.def.animations.idle; const f = frameOf(oneShot(ch.anim, a), ch.t); const s = ch.scale;
    g.save(); g.globalAlpha = clamp(ch.alpha, 0, 1);
    if (!ch.seat) { const k = clamp(1 - (ground - ch.y + ch.lift) / 400, 0.3, 1); g.fillStyle = `rgba(0,0,0,${0.25 * k})`; g.beginPath(); g.ellipse(ch.x, ground - 1, 12 * s * k, 3 * s * k, 0, 0, 7); g.fill(); }
    const X = ch.drawX();
    const dx = ch.facing < 0 ? X + ch.def.anchor.x * s : X - ch.def.anchor.x * s;
    drawSprite(img(ch.def.sheet), f * ch.fw, a.row * ch.fh, ch.fw, ch.fh, dx, ch.y - ch.lift - ch.def.anchor.y * s, s, ch.facing < 0);
    g.restore();
    if (ch.looking && ch.def.eyes && ch.anim === 'idle') drawEyes(ch, X, s);
    ch.hit = ch.bbox();   // hitbox == what was just drawn (frame opaque bounds, scale, flip, lift, wriggle)
    if (debugDraw) {
      const bb = ch.hit; g.strokeStyle = '#f0f'; g.lineWidth = 1; g.strokeRect(bb.x, bb.y, bb.w, bb.h);
      g.fillStyle = '#ff0'; g.font = '11px monospace';
      g.fillText(`${ch.id} ${ch.state}/${ch.anim}#${f} mood:${ch.mood.current} lvl:${ch.aff.level}(${ch.aff.value.toFixed(2)}) ${ch.mana ? 'mana:' + ch.mana.value.toFixed(1) : ''}`, bb.x - 20, bb.y - 4);
      g.fillStyle = '#f00'; g.fillRect(ch.x - 2, ch.y - 2, 4, 4);
    }
  }
  for (const e of fx) {
    if (e.follow) { e.x = e.follow.x; e.y = e.follow.y - e.follow.lift + e.dy; }
    const d = e.def, f = Math.min(d.frames - 1, Math.floor(e.t * d.fps)) % d.frames;
    drawSprite(img(d.image), f * d.frame.w, 0, d.frame.w, d.frame.h, e.x - d.anchor.x * e.scale, e.y - d.anchor.y * e.scale, e.scale, false);
  }
  drawFoods(now);
  for (const ch of list) drawHover(ch, now);
  for (const ch of list) if (ch.bubble && !ch.hidden) drawBubble(ch);   // bubbles & confirm popups on top of the mana bar
  if (debugDraw) {
    g.strokeStyle = 'rgba(255,0,0,.6)'; g.beginPath(); g.moveTo(0, ground); g.lineTo(W, ground); g.stroke();
    g.strokeStyle = 'rgba(0,255,255,.6)'; g.strokeRect(wa.x + 0.5, wa.y + 0.5, wa.w - 1, wa.h - 1);
    for (const r of uiRects()) { g.strokeStyle = '#0ff'; g.strokeRect(r.x, r.y, r.w, r.h); }
    g.fillStyle = capturing ? '#0f0' : '#f00'; g.beginPath(); g.arc(lastMouse.x, lastMouse.y, 4, 0, 7); g.fill();
    g.fillStyle = '#ff0'; g.font = '11px monospace';
    g.fillText(`ground=${ground} wa=${wa.x},${wa.y},${wa.w}x${wa.h} dpr=${DPR} capture=${capturing} cursor=${Math.round(lastMouse.x)},${Math.round(lastMouse.y)} sleep=${sleepMode} room=${roomOpen}:${roomWho.join('+')} speed=${speed}`, 10, ground - 6);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try { update(dt); render(); } catch (e) { console.error('loop error', e); }
  requestAnimationFrame(loop);
}

// ---------------- mouse: click-through except sprites/UI ----------------
// One source of truth: the overlay captures the mouse ONLY over a drawn sprite, a bubble button or a visible UI box.
const lastMouse = { x: -1, y: -1 }; let capturing = false, drag = null;
function hitChar(x, y) { for (const ch of Object.values(chars).sort((a, b) => b.y - a.y)) { if (ch.hidden) continue; if (inRect(ch.hit || ch.bbox(), x, y)) return ch; } return null; }
function hitBubbleBtn(x, y) { for (const ch of Object.values(chars)) { const b = ch.bubble; if (!b) continue; for (const k of ['button', 'button2']) { const r = b[k] && b[k].rect; if (r && inRect(r, x, y)) return b[k]; } } return null; }
function uiRects() { return [...document.querySelectorAll('.ui')].filter((e) => !e.classList.contains('hidden')).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); }
function setCapture(on) { if (on !== capturing) { capturing = on; ipcRenderer.send('set-capture', on); } }
function evalCapture() {
  const sprites = Object.values(chars).filter((c) => !c.hidden).map((c) => c.hit || c.bbox());
  const btns = Object.values(chars).flatMap((c) => [c.bubble && c.bubble.button && c.bubble.button.rect, c.bubble && c.bubble.button2 && c.bubble.button2.rect, c.hoverRect]).filter(Boolean);
  const pr = props.filter((p) => !p.portal).map(propRect);
  setCapture(wantsCapture(lastMouse.x, lastMouse.y, { sprites: [...sprites, ...btns, ...pr], uiRects: uiRects(), dragging: !!drag }));
  const h = hitChar(lastMouse.x, lastMouse.y); if (h) h.hoverT = performance.now();
}
function onPointer(x, y) {
  lastMouse.x = x; lastMouse.y = y;
  if (drag && drag.prop) {
    const p = drag.prop; p.x = clampX(x - drag.ox); p.y = clamp(y - drag.oy, wa.y + 20, ground - (p.def.float || 0) * 2);
    if (Math.abs(x - drag.sx) > 4 || Math.abs(y - drag.sy) > 4) drag.moved = true;
    drag.samples.push({ x: p.x, y: p.y, t: performance.now() }); if (drag.samples.length > 12) drag.samples.shift();
  } else if (drag) {
    const ch = drag.ch, r = ch.hit || ch.bbox(), topOff = ch.y - r.y;
    ch.x = clampX(x - drag.ox, ch); ch.y = clamp(y - drag.oy, wa.y + topOff, ground);
    drag.samples.push({ x: ch.x, y: ch.y, t: performance.now() }); if (drag.samples.length > 12) drag.samples.shift();
    if (Math.abs(x - drag.sx) > 4 || Math.abs(y - drag.sy) > 4) drag.moved = true;
  }
  evalCapture();
}
window.addEventListener('mousemove', (e) => onPointer(e.clientX, e.clientY));
ipcRenderer.on('cursor', (_e, p) => { if (!drag && !process.env.PW_SCREENSHOT) onPointer(p.x, p.y); });   // polled from main: works even when events are forwarded/missed
setInterval(evalCapture, 250);
function touchedBy(ch) { lastUserAt = Date.now(); for (const w of wives()) w.aff.markActive(); }
window.addEventListener('mousedown', (e) => {
  if (sleepMode) wakeUp('click');
  if (chatShouldClose(chatIsOpen(), chatRect(), e.clientX, e.clientY)) closeChat();
  for (const id of ['ctx', 'info']) { const el = $(id); if (!el.classList.contains('hidden')) { const r = el.getBoundingClientRect(); if (!inRect({ x: r.left, y: r.top, w: r.width, h: r.height }, e.clientX, e.clientY)) el.classList.add('hidden'); } }
  if (e.button === 2) return;
  const btn = hitBubbleBtn(e.clientX, e.clientY); if (btn) { btn.fn(); return; }
  const bar = Object.values(chars).find((c) => c.hoverRect && inRect(c.hoverRect, e.clientX, e.clientY));
  if (bar && e.button === 0) { touchedBy(bar); confirmReplenish(bar); return; }
  const ch = hitChar(e.clientX, e.clientY);
  if (!ch && e.button === 0) {                     // pick up a prop (not doors/portals/beds they're sleeping in)
    const p = hitProp(e.clientX, e.clientY);
    if (p && !p.def.door && !p.sleepBed && !countOn(p)) { p.fly = null; drag = { prop: p, ox: e.clientX - p.x, oy: e.clientY - p.y, sx: e.clientX, sy: e.clientY, moved: false, samples: [] }; touchedBy(null); }
    return;
  }
  if (!ch || e.button !== 0) return;
  touchedBy(ch);
  // angry (<= -2): she won't be picked up — wriggles out with an angry bubble
  if (ch.role !== 'guest' && ch.aff.level <= (moodRules().refusePickupAtOrBelow ?? -2)) {
    ch.wriggleUntil = performance.now() + 600; ch.play('pout', 1.2); ch.aff.event('touch_while_angry');
    if (!ch.lastRefuse || Date.now() - ch.lastRefuse > 6000) { ch.lastRefuse = Date.now(); speak(ch, 'refuse_pickup') || ch.say('No!'); }
    return;
  }
  const nearChrispy = chars.chrispyni && ch !== chars.chrispyni ? Math.abs(ch.x - chars.chrispyni.x) : null;
  drag = { ch, ox: e.clientX - ch.x, oy: e.clientY - ch.y, sx: e.clientX, sy: e.clientY, moved: false, nearChrispy, startX: ch.x, samples: [] };
  if (sleepMode) setSleep(false);
  ch.fly = null; ch.dragging = true; if (ch.seat) standUp(ch); ch.target = null; ch.levitate = null; ch.lift = 0; ch.falling = null; ch.vy = 0;
});
window.addEventListener('mouseup', () => {
  if (drag && drag.prop) {                          // released prop: thrown or dropped
    const p = drag.prop, v = releaseVelocity(drag.samples, performance.now());
    if (drag.moved) { p.fly = { x: p.x, y: p.y, vx: v.vx, vy: v.vy }; p.lastUsed = Date.now(); saveSoon(); }
    drag = null; evalCapture(); return;
  }
  if (!drag) return; const ch = drag.ch; ch.dragging = false; ch.vy = 0;
  if (drag.moved) {
    ch.queue = []; ch.current = null;
    const v = releaseVelocity(drag.samples, performance.now());
    if (Math.hypot(v.vx, v.vy) > 300) { ch.fly = { x: ch.x, y: ch.y, vx: v.vx, vy: v.vy, minY: ch.y, user: true }; ch.play('fall'); }
    else if (ch.y < ground - 2) { ch.falling = { startY: ch.y, user: true }; ch.play('fall'); }
    // pulled away from Chrispy when she wanted / needed to be with her
    const g2 = chars.chrispyni;
    if (g2 && drag.nearChrispy != null && (ch.mana && ch.mana.low || ch.seeking) && drag.nearChrispy < 120 && Math.abs(ch.x - g2.x) > 220) { ch.aff.event('dragged_from_chrispy'); ch.mood.react('ignored'); }
    hooks.emit('dragged', { char: ch.id });
  } else if (ch.role !== 'guest' && ch.aff.level < 0) {
    ch.aff.event('touch_while_angry'); ch.play('pout', 1);
    if (!ch.lastPokeLine || Date.now() - ch.lastPokeLine > 5000) { ch.lastPokeLine = Date.now(); speak(ch, 'angry_touch'); }
  } else {
    ch.mood.react('poked'); if (ch.aff) ch.aff.event('pet'); ch.play('happy', 1);
    if (!ch.lastPokeLine || Date.now() - ch.lastPokeLine > 5000) { ch.lastPokeLine = Date.now(); speak(ch, 'poked'); }
    for (const o of wives()) if (o !== ch) o.mood.react('other_got_attention'); hooks.emit('poked', { char: ch.id });
  }
  ch.seeking = false; drag = null; evalCapture();
});
window.addEventListener('dblclick', (e) => { if (hitChar(e.clientX, e.clientY)) openChat(); });

// ---------------- right-click menus, info, pat & feed ----------------
const foods = []; const pats = [];       // food lying around / being eaten; void-portal pats
function propRect(p) { const d = p.def, s = 2 * (cfg.scale / 2 || 1); return { x: p.x - d.anchor.x * s, y: p.y - d.anchor.y * s, w: d.frame.w * s, h: d.frame.h * s }; }
function hitProp(x, y) { for (let i = props.length - 1; i >= 0; i--) if (!props[i].portal && inRect(propRect(props[i]), x, y)) return props[i]; return null; }
function moodLabel(ch) { const L = moodRules().labels || {}; return L[String(ch.aff.level)] || ['Angry', 'Annoyed', 'Grumpy', 'Neutral', 'Content', 'Happy', 'Very Happy'][ch.aff.level + 3]; }
function closeMenus() { $('ctx').classList.add('hidden'); $('info').classList.add('hidden'); menusChanged(); evalCapture(); }
// Menus/popups close on a click ANYWHERE else (other apps, desktop) or Esc, reported by main's global watcher,
// since the overlay never takes focus (so it never gets a blur).
let menusWatched = false, menuOpenedAt = 0;
function menusOpen() { return ['ctx', 'info'].some((id) => !$(id).classList.contains('hidden')); }
function menusChanged() { const on = menusOpen(); if (on && !menusWatched) menuOpenedAt = performance.now(); if (on !== menusWatched) { menusWatched = on; ipcRenderer.send('menus-open', on); } }
ipcRenderer.on('global-input', (_e, ev) => {
  if (!menusOpen()) return;
  if (ev.key === 'esc') { closeMenus(); return; }
  if (performance.now() - menuOpenedAt < 300) return;            // the click that opened it
  if (capturing) return;                                          // over our own sprites/UI: the overlay's mousedown handles it
  const inside = ['ctx', 'info'].some((id) => { const el = $(id); if (el.classList.contains('hidden')) return false; const r = el.getBoundingClientRect(); return inRect({ x: r.left, y: r.top, w: r.width, h: r.height }, ev.x, ev.y); });
  if (!inside) closeMenus();
});
setInterval(() => { if (menusWatched !== menusOpen()) menusChanged(); }, 250);
function openMenu(x, y, items) {
  const m = $('ctx'); m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.append(document.createElement('hr')); continue; }
    const d = document.createElement('div'); d.textContent = it.label; if (it.off) d.className = 'off';
    d.onmousedown = (e) => { e.stopPropagation(); if (it.off) return; closeMenus(); it.fn(); };
    m.append(d);
  }
  m.classList.remove('hidden');
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, wa.x + 2, wa.x + wa.w - r.width - 2) + 'px'; m.style.top = clamp(y, wa.y + 2, wa.y + wa.h - r.height - 2) + 'px';
  menusChanged(); evalCapture();
}
function showInfo(ch) {   // name + mood label only (never numbers or hidden values)
  const el = $('info'); el.innerHTML = '';
  const b = document.createElement('b'); b.textContent = charName(ch.id) + (ch.def.title ? ` · ${ch.def.title}` : '');
  const m = document.createElement('div'); m.textContent = 'Mood: ' + (ch.role === 'guest' && !ch.def.guestCanAct ? 'Visiting' : (ch.aff ? moodLabel(ch) : 'Visiting'));
  const x = document.createElement('span'); x.className = 'x'; x.textContent = '✕'; x.onmousedown = (e) => { e.stopPropagation(); closeMenus(); };
  el.append(x, b, m); el.classList.remove('hidden');
  const r = ch.hit || ch.bbox(); const er = el.getBoundingClientRect();
  el.style.left = clamp(ch.x - er.width / 2, wa.x + 2, wa.x + wa.w - er.width - 2) + 'px'; el.style.top = clamp(r.y - er.height - 30, wa.y + 2, ground - er.height) + 'px';
  evalCapture();
}
// Menu Hug / Kiss while ChrispyNi visits: she walks over and does it (mana via the interaction's manaGift).
const HAPPY_AFTER = { hug: ['Mmm~ warm…', 'Again later, okay? ♥'], kiss: ['♥ …ehehe~', '*blushes* My queen…'] };
function chrispyAffection(ch, kind) {
  // Wives edition: ChrispyNi visits and hugs a wife. ChrispyNi edition: a present wife hugs ChrispyNi (or vice versa).
  let g, target;
  if (isChrispyEdition()) {
    target = ch.id === 'chrispyni' ? ch : chars.chrispyni;
    g = ch.id === 'chrispyni' ? presentWives()[0] : ch;
  } else { g = visitingChrispy(); target = ch; }
  if (!g || !target || target.hidden || !content.interactions[kind]) return;
  if (g.affBusyUntil && Date.now() < g.affBusyUntil) return;
  const def = content.interactions[kind]; g.affBusyUntil = Date.now() + 8000;
  lastUserAt = Date.now(); target.aff && target.aff.markActive();
  if (target.seat) standUp(target); target.queue = []; target.target = null; target.nextThink = performance.now() + 7000;
  g.queue = []; g.target = null; g.enqueue([{ type: 'interact', kind, with: target.id }]);
  ch = target; // rest of function uses ch as the hugged one
  const t0 = Date.now();
  const after = () => {
    if (Date.now() - t0 > 15000 || !chars[g.id]) return;
    if (g.current && g.current.kind === kind && !g.queue.length && g.target == null) {
      if (ch.aff) ch.aff.event('with_chrispy'); if (ch.mood) ch.mood.react('back');
      setTimeout(() => { if (!ch.hidden) ch.say(pick(HAPPY_AFTER[kind]), 4); g.affBusyUntil = 0; }, (def.durationSec || 2) * 1000 + 200);
    } else setTimeout(after, 200);
  };
  setTimeout(after, 300);
}
function charMenu(ch, x, y) {
  const items = [{ label: 'Info / Stats', fn: () => showInfo(ch) }];
  const canCare = ch.role !== 'guest' || ch.def.guestCanAct || isChrispyEdition();
  if (canCare) {
    items.push('-', { label: 'Pat', fn: () => pat(ch) });
    if (!isChrispyEdition() && visitingChrispy() && ch.role !== 'guest')
      items.push({ label: 'Hug (ChrispyNi)', fn: () => chrispyAffection(ch, 'hug') }, { label: 'Kiss (ChrispyNi)', fn: () => chrispyAffection(ch, 'kiss') });
    if (isChrispyEdition() && ch.id === 'chrispyni' && presentWives().length)
      items.push({ label: 'Hug (wife)', fn: () => chrispyAffection(ch, 'hug') }, { label: 'Kiss (wife)', fn: () => chrispyAffection(ch, 'kiss') });
    for (const f of Object.values(content.food || {})) items.push({ label: `Feed: ${f.name || f.id}`, fn: () => feed(ch, f.id) });
  }
  openMenu(x, y, items);
}
function propMenu(p, x, y) {
  const cost = p.def.manaCost || 0, owner = p.owner && chars[p.owner];
  const refund = Math.floor(cost * ((rules().mana || {}).deleteRefund ?? 0.5));
  openMenu(x, y, [{ label: `${p.def.name || p.id}`, off: true }, { label: owner && owner.mana && refund ? `Delete (+${refund} mana to ${charName(owner.id)})` : 'Delete', fn: () => deleteProp(p) }]);
}
function deleteProp(p) {
  const i = props.indexOf(p); if (i < 0) return;
  const owner = p.owner && chars[p.owner]; const refund = Math.floor((p.def.manaCost || 0) * ((rules().mana || {}).deleteRefund ?? 0.5));
  if (owner && owner.mana && refund) owner.mana.add(refund);
  spawnFx('void_burst', p.x, p.y - p.def.frame.h); props.splice(i, 1);
  for (const c of Object.values(chars)) if (c.seat === p) standUp(c);
  hooks.emit('prop_deleted', { prop: p.id, owner: p.owner, refund }); saveSoon();
}
function careOk(ch, key, cd) { ch.care = ch.care || {}; const t = ch.care[key] || 0; return Date.now() - t > cd * 1000 ? (ch.care[key] = Date.now(), true) : false; }
function patDone(ch, res) {
  ch.play('happy', 1.4); spawnFx('hearts', ch.x, (ch.hit || ch.bbox()).y);
  ch.aff.event('pat'); ch.mood.react('poked');
  if (ch.mana && res && res.mana) ch.mana.add(res.mana);
  if (res && res.crit) {          // critical pat: big sparkles + a special line
    const r = ch.hit || ch.bbox(); spawnFx('spawn_sparkle', ch.x - 14, r.y + 6); spawnFx('spawn_sparkle', ch.x + 14, r.y + 10); spawnFx('hearts', ch.x, r.y - 10, 3);
    speak(ch, 'pat_crit') || ch.say(`✨ CRITICAL PAT! ✨ +${res.mana} mana!`, 5);
    if (ch.bubble) ch.bubble.text = `✨ CRITICAL PAT! ✨ (+${res.mana} mana) ` + (ch.bubble.text.includes('CRITICAL') ? '' : ch.bubble.text);
  } else if (careOk(ch, 'patline', 8)) speak(ch, 'patted');
  saveSoon();
}
const PAT_CD_LINES = ['Mm~ I just got pats. Save some for later~', 'Hehe, greedy~ Pats again in a bit!', '*leans in anyway* ...soon, okay?', 'My head is still warm from the last one~'];
function presentWives() { return guestsOn().filter((c) => c.id === 'nixie' || c.id === 'noct'); }
function pattersFor(ch) {
  if (isChrispyEdition()) {
    if (ch.id === 'chrispyni') return presentWives();
    return wives().filter((w) => w.id === 'chrispyni' && !w.hidden);
  }
  const g = chars.chrispyni; return (g && !g.hidden) ? [g] : [];
}
function pat(ch) {
  if (!ch || ch.hidden) return; lastUserAt = Date.now(); ch.aff.markActive();
  ch.patState = ch.patState || {};
  const res = tryPat(ch.patState);
  if (!res.ok) { ch.play('happy', 0.8); if (careOk(ch, 'patcd', 3)) speak(ch, 'pat_cooldown') || ch.say(pick(PAT_CD_LINES)); return; }
  if (pity) pity.act('pat');
  const helpers = pattersFor(ch);
  if (helpers.length) {
    ch.queue = []; ch.target = null; ch.nextThink = performance.now() + 7000;
    let left = helpers.length;
    const doneOne = () => { if (--left <= 0) patDone(ch, res); };
    for (const h of helpers) {
      h.queue = []; h.enqueue([{ type: 'walk_to', target: ch.x + (h.x > ch.x ? 26 : -26) }, { type: 'play', anim: 'hug', sec: 1.2 }]);
      const wait = () => { if ((h.target == null && !h.queue.length) || !chars[h.id]) { h.facing = ch.x > h.x ? 1 : -1; doneOne(); } else setTimeout(wait, 200); };
      setTimeout(wait, 300);
    }
  } else if (isChrispyEdition() && ch.id === 'chrispyni') {
    ch.queue = []; ch.target = null; ch.waitUntil = performance.now() + 1800;
    const r = ch.hit || ch.bbox();
    const e1 = spawnFx('nixie_hand', ch.x - 14, r.y - 26); if (e1) { e1.follow = ch; e1.dy = r.y - 26 - ch.y; }
    const e2 = spawnFx('noct_hand', ch.x + 14, r.y - 22); if (e2) { e2.follow = ch; e2.dy = r.y - 22 - ch.y; }
    setTimeout(() => patDone(ch, res), 800);
  } else {
    ch.queue = []; ch.target = null; ch.waitUntil = performance.now() + 1600;
    const r = ch.hit || ch.bbox(); const e = spawnFx('chrispy_hand', ch.x, r.y - 26); if (e) { e.follow = ch; e.dy = r.y - 26 - ch.y; }
    setTimeout(() => patDone(ch, res), 700);
  }
}
function feed(ch, foodId = 'cookie') {
  const f = (content.food || {})[foodId]; if (!f || !ch || ch.hidden) return; lastUserAt = Date.now(); ch.aff.markActive();
  ch.foodState = ch.foodState || {};
  const res = tryEat(ch.foodState, f);
  if (!res.ok) { ch.play('pout', 1.2); speak(ch, 'food_full') || ch.say("I'm full!"); saveSoon(); return; }
  if (pity) pity.act('feed');
  ch.feedQueue = ch.feedQueue || [];
  const helpers = pattersFor(ch);   // same cast as pats: wives present feed Chrispy; Chrispy feeds a wife
  const entry = { f, item: null, helperIds: helpers.map((h) => h.id) };
  if (!helpers.length) {
    const fx0 = clampX(ch.x + (Math.random() < 0.5 ? -1 : 1) * rnd(40, 70) + ch.feedQueue.length * 14 * (Math.random() < 0.5 ? -1 : 1));
    entry.item = { def: f, x: fx0, y: ground, ground: true, queued: true }; foods.push(entry.item); spawnFx('spawn_sparkle', fx0, ground - 12);
  }
  ch.feedQueue.push(entry); saveSoon();
  if (!ch.feeding) nextFood(ch);
}
function eatNow(ch, f) {
  ch.queue = []; ch.target = null; ch.play('happy', f.eatSec || 2); ch.waitUntil = performance.now() + (f.eatSec || 2) * 1000;
  foods.push({ def: f, x: ch.x + ch.facing * 10, y: (ch.hit || ch.bbox()).y + ch.fh * ch.scale * 0.45, held: ch, until: performance.now() + (f.eatSec || 2) * 1000 });
  ch.aff.o.events['food:' + f.id] = { delta: f.mood || 0, cooldownSec: f.cooldownSec || 0 };
  ch.aff.event('food:' + f.id);
  if (ch.mana && f.mana) ch.mana.add(f.mana);
  if (!ch.feedQueue.length) setTimeout(() => speak(ch, 'fed'), 600);
  hooks.emit('fed', { char: ch.id, food: f.id });
}
function nextFood(ch) {
  const q = ch.feedQueue || []; const e = q.shift();
  if (!e) { ch.feeding = false; return; }
  ch.feeding = true;
  const done = () => { eatNow(ch, e.f); setTimeout(() => nextFood(ch), ((e.f.eatSec || 2) + 0.4) * 1000); };
  const t0 = Date.now();
  if (ch.hidden) { if (e.item) { const i = foods.indexOf(e.item); if (i >= 0) foods.splice(i, 1); } q.length = 0; ch.feeding = false; return; }
  const helpers = (e.helperIds || []).map((id) => chars[id]).filter((h) => h && !h.hidden);
  if (!e.item && helpers.length) {
    ch.queue = []; ch.target = null;
    let left = helpers.length;
    const oneDone = () => { if (--left <= 0) done(); };
    for (const g of helpers) {
      g.queue = []; g.enqueue([{ type: 'walk_to', target: ch.x + (g.x > ch.x ? 30 : -30) }, { type: 'play', anim: 'hug', sec: 0.8 }]);
      const wait = () => { if ((g.target == null && !g.queue.length) || !chars[g.id] || Date.now() - t0 > 12000) { g.facing = ch.x > g.x ? 1 : -1; oneDone(); } else setTimeout(wait, 200); };
      setTimeout(wait, 300);
    }
    return;
  }
  if (!e.item) { done(); return; }
  ch.queue = [{ type: 'walk_to', target: e.item.x }]; ch.target = null;
  const wait = () => {
    if ((ch.target == null && !ch.queue.length && !ch.dragging) || Date.now() - t0 > 15000) {
      if (Math.abs(ch.x - e.item.x) > 30 && Date.now() - t0 < 15000) { ch.queue = [{ type: 'walk_to', target: e.item.x }]; setTimeout(wait, 300); return; }
      const i = foods.indexOf(e.item); if (i >= 0) foods.splice(i, 1); done();
    } else setTimeout(wait, 150);
  };
  setTimeout(wait, 400);
}
function drawFoods(now) {
  for (let i = foods.length - 1; i >= 0; i--) {
    const it = foods[i], d = it.def, s = 2 * (cfg.scale / 2 || 1);
    if (it.held) { if (now > it.until || it.held.hidden) { foods.splice(i, 1); continue; } it.x = it.held.x + it.held.facing * 10; }
    const k = it.held ? clamp((it.until - now) / ((d.eatSec || 2) * 1000), 0.2, 1) : 1;   // shrinks while eaten
    drawSprite(img(d.image), 0, 0, d.frame.w, d.frame.h, it.x - d.anchor.x * s * k, it.y - d.anchor.y * s * k, s * k, false);
  }
}
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const ch = hitChar(e.clientX, e.clientY); if (ch) { charMenu(ch, e.clientX, e.clientY); return; }
  const p = hitProp(e.clientX, e.clientY); if (p) propMenu(p, e.clientX, e.clientY);
});

// ---------------- chat ----------------
function chatIsOpen() { return !$('chat').classList.contains('hidden'); }
function chatRect() { const r = $('chat').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function chatLog(who, text) {
  const d = document.createElement('div');
  if (who === 'sys') { d.className = 'sys'; d.textContent = text; }
  else { const b = document.createElement('b'); b.className = who; b.textContent = (who === 'you' ? cfg.user : charName(who)) + ': '; d.append(b, document.createTextNode(text)); }
  $('chatLog').append(d); while ($('chatLog').children.length > 60) $('chatLog').firstChild.remove();
  $('chatLog').scrollTop = 1e9;
}
function openChat() {
  const c = $('chat'); c.classList.remove('hidden');
  const anchor = wives().find((w) => !w.hidden);
  c.style.left = clamp((anchor ? anchor.x : W / 2) - 210, wa.x + 4, wa.x + wa.w - 430) + 'px';
  c.style.top = Math.max(wa.y + 4, ground - 330) + 'px';
  ipcRenderer.send('focus-overlay'); setTimeout(() => $('chatInput').focus(), 50); evalCapture();
}
function closeChat() { if (!chatIsOpen()) return; $('chat').classList.add('hidden'); ipcRenderer.send('blur-overlay'); evalCapture(); }
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMenus(); if (chatIsOpen()) closeChat(); else if (debugOpen) toggleDebug(); } });
ipcRenderer.on('overlay-blur', () => { closeChat(); closeMenus(); });     // clicked the desktop / another app: the chat closes
window.addEventListener('blur', () => closeChat());
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault(); const t = $('chatInput').value.trim(); $('chatInput').value = ''; if (!t) return;
  handleChat(t);
});
function isAdmin() { return !cfg.adminGateEnabled || adminSession || !!INIT.adminByIdentity; }
function questionBubbles() { for (const w of wives()) if (!w.hidden) w.question(); }
function handleChat(t) {
  const cheat = parseCheat(t);
  if (cheat) {
    if (cheat.cmd === 'admin') { adminSession = checkPassphrase(cheat.args[0], cfg.admin && cfg.admin.passphrase) || adminSession; if (adminSession) chatLog('sys', 'admin unlocked'); return; }
    if (isAdmin()) { runCheat(cheat); return; }
    return;
  }
  lastUserAt = Date.now(); for (const w of wives()) w.aff.markActive();
  const kind = classifyChat(t);
  if (kind === 'tiny') { questionBubbles(); return; }           // 1-2 chars: just a '?' (not logged)
  if (kind === 'gibberish') {
    if (Math.random() < 0.9) { questionBubbles(); return; }
    const w = pick(wives().filter((c) => !c.hidden)); if (w) { chatLog('you', t); speak(w, 'chat_confused') || w.say('...Are you alright?'); }
    return;
  }
  chatLog('you', t);
  for (const w of wives()) { w.mood.react('chat'); w.aff.event('chat'); }
  hooks.emit('chat', { text: t });
  offlineChat(t);
}
function loadChatLibrary() {   // content/chat/library.json + any mods/*/chat/library.json (offline, moddable)
  const d = INIT.dirs, libs = [];
  const tryRead = (f) => { try { if (fs.existsSync(f)) libs.push(JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''))); } catch (e) { ipcRenderer.send('log', 'chat library ' + f + ': ' + e.message); } };
  tryRead(path.join(d.base, 'chat', 'library.json'));
  if (d.edition) tryRead(path.join(d.edition, 'chat', 'library.json'));
  for (const m of d.mods) { try { for (const x of fs.readdirSync(m)) tryRead(path.join(m, x, 'chat', 'library.json')); } catch {} }
  chatLib = chatlib.mergeLibs(libs); chatRules = chatlib.compile(chatLib);
}
function offlineChat(t) {
  let ws = wives().filter((c) => !c.hidden); if (!ws.length) return;
  // usually one of them answers, sometimes both
  ws = ws.sort(() => Math.random() - 0.5);
  const named = ws.find((c) => new RegExp('\\b' + charName(c.id) + '\\b', 'i').test(t)); if (named) ws = [named, ...ws.filter((c) => c !== named)];
  const n = repliers(ws.length);
  ws.slice(0, n).forEach((w, i) => setTimeout(() => {
    const r = chatlib.reply(chatLib, chatRules, w.id, t);
    if (r.mood) try { w.mood.react('chat:' + r.mood) || w.mood.react(r.mood); } catch {}
    if (r.affection) { w.aff.o.events['chat_rule'] = { delta: r.affection, cooldownSec: 60 }; w.aff.event('chat_rule'); }
    let text = r.text;
    if (!text) text = brain.replyToChat(w.def.personality.lines || w.id, t, w.mood.current, vars(w), w.aff.level);
    if (text) { const p = parseText(text, content); w.enqueue([{ type: 'say', text: p.text }, ...p.actions]); }
  }, i * 1500));
}
function sendEvent(kind, data = {}) { hooks.emit('event', { kind, ...data }); }   // plugins only; nothing leaves this PC

// ---------------- awareness ----------------
function trigger(on, extra = {}) {
  const ctx = { timeOfDay: aw.tod || timeOfDay(), mana: Math.min(...wives().map((w) => w.mana.value), 100), appCategory: aw.category, moods: Object.fromEntries(Object.values(chars).map((c) => [c.id, c.mood.current])) };
  const ev = events.check(on, ctx); if (ev) runEvent(ev);
  return ev;
}
function runEvent(ev) {
  hooks.emit('rare_event', { id: ev.id });
  const ws = wives(); let delay = 0;
  for (const st of ev.steps) {
    let who = st.who; let ch;
    if (who === 'any_wife') ch = pick(ws); else if (who === 'guest') ch = ws[0]; else ch = chars[who] || ws[0];
    if (!ch) continue;
    const a = { ...st }; delete a.who;
    setTimeout(() => ch.enqueue([a]), delay); delay += a.type === 'say' ? 1800 : 600;
  }
}
function canReact(key) { const t = aw.lastReact[key] || 0; if (Date.now() - t < Math.max((cfg.awareness.reactCooldownSec || 120), (cfg.talk?.reactCooldownMin ?? 20) * 60) * 1000) return false; aw.lastReact[key] = Date.now(); return true; }
function setWatching(on) {
  if (on === watching) return; watching = on; hooks.emit('watching', { on });
  const ws = wives().filter((w) => !w.hidden);
  if (on) {
    // nearest bottom side/corner, side by side, backs to us
    ws.forEach((w, i) => {
      const left = (w.x - wa.x) < wa.w / 2; const base = left ? wa.x + wa.w * 0.05 : wa.x + wa.w * 0.95;
      if (w.seat || w.meditating) standUp(w);
      w.queue = [{ type: 'walk_to', target: base + (left ? 1 : -1) * i * 44 }, { type: 'watch' }]; w.target = null; w.waitUntil = 0;
    });
    lastWatchTalk = Date.now();
  } else for (const w of ws) if (w.state === 'watch') { standUp(w); w.play('happy', 1); }
}
let lastWatchTalk = 0;
function onAwareness(a) {
  hooks.emit('awareness', a);
  if (a.kind === 'app') setWatching(isWatching(a));
  if (a.kind === 'app') {
    const changed = a.category !== aw.category; aw.app = a; aw.category = a.category; aw.stream = a.category === 'stream';
    for (const c of wives()) c.mood.react('app:' + a.category);
    if (changed && a.category !== 'other' && canReact('app:' + a.category)) {
      const w = pick(wives()); if (w) speak(w, 'app_' + a.category, { ambient: true });
      sendEvent('app', { category: a.category, title: a.title, owner: a.owner });
      trigger('app:' + a.category);
    } else if (a.media && canReact('media:' + a.media.title)) { const w = pick(wives()); if (w) speak(w, 'media', { title: a.media.title, ambient: true }); }
    if (a.media || a.category === 'video' || a.category === 'stream') for (const c of wives()) c.aff.event('media_together');
  }
  if (a.kind === 'idle') {
    aw.idleSec = a.seconds;
    const longS = (cfg.awareness.idleLongMinutes || 5) * 60;
    if (a.seconds > longS && !aw.idleLongFired) { aw.idleLongFired = true; for (const c of wives()) c.mood.react('idle_long'); trigger('idle_long') || speak(pick(wives()), 'idle_long', { ambient: true }); sendEvent('afk', { seconds: a.seconds }); }
    if (a.seconds < 10 && aw.idleLongFired) { aw.idleLongFired = false; for (const c of wives()) c.mood.react('back'); speak(pick(wives()), 'back', { ambient: true }); trigger('back'); if (sleepMode && !sleepManual) setSleep(false); sendEvent('back'); }
    const night = cfg.sleep.autoAtNight && isSleepHour(new Date(), cfg.sleep.hours);
    const idleMin = a.seconds / 60;
    if (!sleepMode && (idleMin > cfg.sleep.idleMinutes || (night && idleMin > cfg.sleep.nightIdleMinutes))) setSleep(true);
  }
  if (a.kind === 'lock' || a.kind === 'suspend') { if (!sleepMode) setSleep(true); }
  if (a.kind === 'unlock' || a.kind === 'resume') { if (sleepMode && !sleepManual) setSleep(false); }
}
// Sleep: each wife walks to the nearest screen side, a free bed appears there (gone on wake), she lies down; z bubbles.
function sleepBedFor(ch) {
  const left = ch.x < wa.x + wa.w / 2, bx = clampX(left ? wa.x + 70 : wa.x + wa.w - 70, ch);
  let bed = props.find((p) => p.sleepBed && p.side === (left ? 'L' : 'R'));
  if (!bed && content.props.bed) { bed = summon(null, content.props.bed ? 'bed' : 'cushion', bx, true); if (bed) { bed.sleepBed = true; bed.side = left ? 'L' : 'R'; bed.pinned = true; } }
  return bed;
}
function goToBed(ch) {
  if (ch.seat) standUp(ch); ch.queue = []; ch.target = null; ch.looking = 0;
  const bed = sleepBedFor(ch);
  ch.enqueue(bed ? [{ type: 'walk_to', target: bed.x }, { type: 'lay' }] : [{ type: 'sleep', sec: 600 }]);
}
let sleepSince = 0;
function wakeUp(reason) { if (sleepMode && performance.now() - sleepSince > 4000) setSleep(false); }
function setSleep(on, manual = false) {
  if (on === sleepMode) return; sleepMode = on; if (manual) sleepManual = on;
  if (on) { sleepSince = performance.now(); for (const c of wives()) { c.looking = 0; c.nearSince = 0; } }
  ipcRenderer.send('sleeping', on);
  if (on) { trigger('sleep'); for (const c of wives()) { c.queue = []; c.target = null; c.nextThink = 0; } speak(chars.noct || wives()[0], 'sleep', { ambient: true }); sendEvent('sleep'); }
  else {
    sleepManual = false;
    for (const c of Object.values(chars)) { c.queue = []; c.target = null; c.holdUntil = 0; c.waitUntil = 0; c.current = null;
      if (c.state === 'sleep' || c.state === 'lay' || c.seat || c.loopAnim || c.anim === 'sleep' || c.anim === 'lay') { if (c.seat) standUp(c); c.loopAnim = null; c.state = 'idle'; c.enqueue([{ type: 'wake' }]); } if (c.bubble && c.bubble.z) c.bubble = null; }
    setTimeout(() => { for (let i = props.length - 1; i >= 0; i--) if (props[i].sleepBed) { spawnFx('void_burst', props[i].x, props[i].y - props[i].def.frame.h); props.splice(i, 1); } }, 1500);
  }
  hooks.emit('sleep', { on });
}
setInterval(() => {   // time of day + tick events
  const tod = timeOfDay();
  if (cfg.awareness.timeOfDay && tod !== aw.tod) { const first = aw.tod == null; aw.tod = tod; if (!first) { for (const c of wives()) c.mood.react(tod); speak(pick(wives()), tod, { ambient: true }); } }
  if (!sleepMode && !roomOpen) trigger('tick');
  hooks.emit('tick', { tod });
  cleanupProps(); guestCheck();
  if (watching) for (const c of wives()) c.aff.event('media_together');   // watching together
  if (chars.chrispyni) for (const c of wives()) c.aff.event('with_chrispy');
  saveSoon();
}, ((content && content.events && content.events.checkSec) || 60) * 1000);

// ---------------- cheats ----------------
function charArg(a) { const id = String(a || '').toLowerCase(); return chars[id] || Object.values(chars).find((c) => c.def.name.toLowerCase() === id) || null; }
function manaTargets(ch) { return ch ? (ch.mana ? [ch] : []) : wives(); }
function runCheat(c) {
  const [a0, a1] = c.args; const ch0 = charArg(a0);
  const ok = (m) => { chatLog('sys', '✔ ' + m); toast(m); };
  switch (c.cmd) {
    case 'help': chatLog('sys', Object.entries(COMMANDS).map(([k, v]) => `/${k} - ${v}`).join(' | ') + ' | word codes: ' + Object.keys(WORD_CODES).join(' ')); break;
    case 'fullmana': manaTargets(ch0).forEach((w) => w.mana.fill()); ok('mana full'); break;
    case 'infmana': infinite = !infinite; wives().forEach((w) => { w.mana.infinite = infinite; }); ok('infinite mana ' + (infinite ? 'ON' : 'OFF')); break;
    case 'debugmode': setDebugMode(!debugMode); ok('debug mode ' + (debugMode ? 'ON' : 'OFF')); break;
    case 'mana': { const n = ch0 ? +a1 : +a0; manaTargets(ch0).forEach((w) => { w.mana.value = clamp(n || 0, 0, w.mana.max); }); ok(`mana ${ch0 ? ch0.id : 'all'} = ${n || 0}`); break; }
    case 'moodlvl': if (ch0) { ch0.aff.set(+a1); ok(`${ch0.id} hidden mood = ${ch0.aff.level}`); saveSoon(); } break;
    case 'drop': if (ch0) { dropFrom(ch0, clamp(a1 != null ? +a1 : 0.9, 0, 1)); ok(`${ch0.id} dropped from ${Math.round((a1 != null ? +a1 : 0.9) * 100)}%`); } break;
    case 'magic': if (ch0) ch0.enqueue([{ type: 'interact', kind: a1 || 'levitate', with: c.args[2] }]); break;
    case 'meditate': { const w = ch0 || pick(wives()); if (w) { w.queue = []; w.lastMeditate = 0; w.enqueue([{ type: 'meditate' }]); ok(`${w.id} meditates`); } break; }
    case 'rest': { const who = !a0 ? currentPlan() : a0 === 'both' ? wives().map((w) => w.id) : [a0]; goToRoom('our_room', who.length ? who : undefined, { source: 'user' }); break; }
    case 'door': { const w = ch0 || wives()[0]; goToRoom('our_room', [w.id], { source: 'wife' }) || ok('not enough mana for a door'); break; }
    case 'take': chrispyTakes(); break;
    case 'pat': pat(ch0 || pick(wives())); break;
    case 'feed': feed(ch0 || pick(wives()), (ch0 ? a1 : a0) || 'cookie'); break;
    case 'info': if (ch0) showInfo(ch0); break;
    case 'delprop': { const p = props.find((q) => String(q.uid) === String(a0)) || props.filter((q) => q.id === a0).pop() || props[props.length - 1]; if (p) { deleteProp(p); ok('deleted ' + p.id); } break; }
    case 'chatter': { const [a, b] = wives(); if (a && b) chatter(a, b); break; }
    case 'showmana': showAllMana = !showAllMana; ok('always show mana ' + showAllMana); break;
    case 'summon': { const p = summon(null, a0, a1 ? +a1 : undefined); p ? ok('summoned ' + a0) : ok('unknown prop ' + a0); break; }
    case 'dismiss': dismiss(a0 || 'all'); ok('dismissed'); break;
    case 'cast': { const ch = ch0 || wives()[0]; ch.enqueue([{ type: 'cast', effect: ch0 ? a1 : a0 }]); break; }
    case 'mood': if (ch0) { ch0.mood.set(a1, 300); ok(`${ch0.id} mood ${a1}`); } break;
    case 'say': if (ch0) ch0.enqueue([{ type: 'say', text: a1 || '' }]); break;
    case 'act': if (ch0) { let acts; try { const j = JSON.parse(a1); acts = (Array.isArray(j) ? j : [j]); acts = parseReply({ speaker: ch0.id, actions: acts }, content)[0]?.actions || []; } catch { const p = parseText(a1, content); acts = [p.text ? { type: 'say', text: p.text } : null, ...p.actions]; } ch0.enqueue(acts); } break;
    case 'spawnall': Object.keys(content.props).forEach((id, i) => summon(null, id, wa.x + 60 + i * ((wa.w - 120) / Math.max(1, Object.keys(content.props).length - 1)))); ok('all props'); break;
    case 'room': goToRoom(a0 || 'our_room', undefined, { source: 'user' }); break;
    case 'sleep': setSleep(!sleepMode, true); ok('sleep ' + sleepMode); break;
    case 'speed': speed = clamp(+a0 || 1, 0.1, 10); ok('speed x' + speed); break;
    case 'hitboxes': debugDraw = !debugDraw; ok('hitbox view ' + debugDraw); break;
    case 'debug': case 'devpanel': case 'debugmenu': setDebugMode(!debugMode); ok('debug mode ' + (debugMode ? 'ON (tray > Debug)' : 'OFF')); break;
    case 'leave': { const g2 = chars[a0 || 'chrispyni']; if (g2) leave(g2); break; }
    case 'interact': if (ch0) ch0.enqueue([{ type: 'interact', kind: a1, with: c.args[2] }]); break;
    case 'play': if (ch0) { ch0.queue = []; ch0.play(a1, 3); } break;
    case 'reload': loadAll(); ok('content reloaded'); break;
    case 'resetsave': try { fs.unlinkSync(SAVE_PATH); } catch {} wives().forEach((w) => w.mana.fill()); props.length = 0; for (const ch of Object.values(chars)) { ch.mood = new MoodState(ch.def.personality); ch.aff = new Affection(moodRules()); } ok('save reset'); break;
    case 'event': { const ev = events.get(a0); if (ev) runEvent(ev); else onAwareness({ kind: 'app', category: a0, title: 'test', owner: 'test' }); break; }
    case 'visit': visit(a0 || 'chrispyni'); break;
    default: hooks.emit('cheat:' + c.cmd, { args: c.args, chars, api: pluginApi() }); break;
  }
}

// ---------------- debug menu (auto-built from content) ----------------
let debugOpen = false;
/** Debug mode = the DEBUGMENU code. Same code again turns it off. Tray shows the Debug submenu only while it's on. */
function setDebugMode(on) {
  debugMode = !!on; cheatState.debug = debugMode;
  if (debugMode !== debugOpen) toggleDebug();
  if (!debugMode) debugDraw = false;
  ipcRenderer.send('debug-mode', debugMode);
}
function toggleDebug() { debugOpen = !debugOpen; $('debug').classList.toggle('hidden', !debugOpen); if (debugOpen) { buildDebug(); ipcRenderer.send('focus-overlay'); } else ipcRenderer.send('blur-overlay'); evalCapture(); }
function btn(label, fn, cls) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = (e) => { e.stopPropagation(); fn(b); if (debugOpen) setTimeout(refreshDebugMeters, 50); }; return b; }
function section(root, title) { const h = document.createElement('h3'); h.textContent = title; root.append(h); const d = document.createElement('div'); root.append(d); return d; }
function refreshDebugMeters() {
  for (const el of document.querySelectorAll('[data-meter]')) {
    if (el.dataset.meter === '_pity') { el.textContent = `guest visit chance ${(pity.chance * 100).toFixed(1)}% (base ${(pity.o.base * 100).toFixed(0)}%)`; continue; }
    const ch = chars[el.dataset.meter]; if (!ch) continue;
    el.textContent = `hidden mood ${ch.aff.level > 0 ? '+' : ''}${ch.aff.level} (${ch.aff.value.toFixed(2)})` + (ch.mana ? ` · mana ${ch.mana.value.toFixed(1)}/${ch.mana.max}${ch.meditating ? ' · meditating' : ''}` : '');
  }
}
setInterval(() => { if (debugOpen) refreshDebugMeters(); }, 1000);
function buildDebug() {
  const root = $('debug'); root.innerHTML = '';
  root.append(btn('✕ close', toggleDebug, 'close'));
  const t = document.createElement('b'); t.textContent = `DEBUG MENU · v${INIT.version} · mods: ${content.mods.map((m) => m.id + (m.enabled ? '' : '(off)')).join(', ') || 'none'}`; root.append(t);
  let s = section(root, 'Mana (all wives)');
  s.append(btn('Fill all', () => wives().forEach((w) => w.mana.fill())), btn('Empty all', () => wives().forEach((w) => { w.mana.value = 0; })),
    btn('∞ toggle', (b) => { runCheat({ cmd: 'infmana', args: [] }); b.classList.toggle('on', infinite); }, infinite ? 'on' : ''),
    btn('Always show bars', (b) => { showAllMana = !showAllMana; b.classList.toggle('on', showAllMana); }, showAllMana ? 'on' : ''),
    btn('Rest now (plan)', () => runCheat({ cmd: 'rest', args: [] })), btn('Rest both (door)', () => goToRoom('our_room', wives().map((w) => w.id), { source: 'user' })),
    btn('Chrispy takes wives', () => chrispyTakes()));
  s = section(root, 'World');
  s.append(btn('Hitbox view', (b) => { debugDraw = !debugDraw; b.classList.toggle('on', debugDraw); }, debugDraw ? 'on' : ''),
    btn('Sleep mode', () => setSleep(!sleepMode, true)), btn('Speed x1', () => { speed = 1; }), btn('x3', () => { speed = 3; }), btn('x0.3', () => { speed = 0.3; }),
    btn('Wives chatter (…)', () => runCheat({ cmd: 'chatter', args: [] })),
    btn('Reload content', () => loadAll()), btn('Reset save', () => runCheat({ cmd: 'resetsave', args: [] })), btn('Open chat', openChat),
    btn('Dismiss all props', () => dismiss('all')), btn('Spawn all props', () => runCheat({ cmd: 'spawnall', args: [] })));
  for (const id of Object.keys(content.characters)) if (!chars[id]) s.append(btn(`Invite ${charName(id)}`, () => visit(id)));
  for (const c of Object.values(chars)) if (c.role === 'guest') s.append(btn(`${charName(c.id)} leaves`, () => leave(c)));
  s = section(root, 'Rooms');
  for (const r of Object.values(content.rooms)) s.append(btn(`Go to ${r.name || r.id} (door)`, () => goToRoom(r.id, undefined, { source: 'user' })));
  s = section(root, 'Events (forced, ignores chance & cooldown)');
  for (const ev of Object.values(content.events)) if (ev && ev.steps) s.append(btn(`${ev.name || ev.id} [${ev.on || 'tick'} ${Math.round((ev.chance ?? 1) * 100)}%]`, () => runEvent(ev)));
  for (const cat of ['game', 'video', 'art', 'stream', 'chat', 'code']) s.append(btn(`aware: ${cat}`, () => { aw.lastReact = {}; onAwareness({ kind: 'app', category: cat, title: `test ${cat}`, owner: cat }); }));
  s.append(btn('aware: AFK', () => onAwareness({ kind: 'idle', seconds: 9999 })), btn('aware: back', () => { aw.idleLongFired = true; onAwareness({ kind: 'idle', seconds: 1 }); }));
  s = section(root, 'Guest visits (soft pity)');
  { const m = document.createElement('div'); m.dataset.meter = '_pity'; m.style.color = '#ffe08a'; s.append(m); }
  s.append(btn('roll now', () => { lastGuestCheck = 0; guestCheck(); refreshDebugMeters(); }), btn('reset pity', () => { pity.reset(); refreshDebugMeters(); }));
  s.append(btn('watch: start', () => setWatching(true)), btn('watch: stop', () => setWatching(false)));
  s = section(root, 'Summon prop (debug = free)');
  for (const p of Object.values(content.props)) s.append(btn(`${p.name || p.id} (${p.manaCost || 0})${p.usableBy && p.usableBy !== 'all' ? ' [' + [].concat(p.usableBy).join(',') + ']' : ''}${p.owner ? ' ♛' + p.owner : ''}`, () => summon(null, p.id)));
  s = section(root, 'Props on screen (owner · usable by)');
  for (const p of props) { if (p.portal) continue; const e = document.createElement('div'); e.textContent = `${p.id} #${p.uid} · owner ${p.owner || '-'} · usable by ${[].concat(p.def.usableBy || 'all').join(', ')} `; e.append(btn('delete', () => { deleteProp(p); buildDebug(); })); s.append(e); }
  for (const ch of Object.values(chars)) {
    const d = section(root, `${charName(ch.id)} (${ch.role})`);
    const h = (txt) => { const e = document.createElement('h4'); e.textContent = txt; d.append(e); };
    const meter = document.createElement('div'); meter.dataset.meter = ch.id; meter.style.color = '#ffe08a'; d.append(meter);
    h('Hidden mood level (-3 angry … +3 happy)');
    for (let n = -3; n <= 3; n++) d.append(btn((n > 0 ? '+' : '') + n, () => { ch.aff.set(n); saveSoon(); }, ch.aff.level === n ? 'on' : ''));
    d.append(btn('decay +1 day', () => { ch.aff.lastTs -= 86400000; ch.aff.lastActive = 0; ch.aff.decay(Date.now()); }));
    if (ch.mana) {
      h('Mana (her own pool)');
      d.append(btn('Fill', () => ch.mana.fill()), btn('+10', () => ch.mana.add(10)), btn('-10', () => ch.mana.add(-10)), btn('Low (15)', () => { ch.mana.value = 15; }), btn('Empty', () => { ch.mana.value = 0; }),
        btn('Ask for mana', () => askMana(ch, currentPlan())), btn('Rest alone (door)', () => goToRoom('our_room', [ch.id], { source: 'user' })), btn('Summons door herself', () => runCheat({ cmd: 'door', args: [ch.id] })), btn('Click mana bar', () => confirmReplenish(ch)),
        btn('Meditate', () => runCheat({ cmd: 'meditate', args: [ch.id] })), btn('Meditate (floor, 50%)', () => { ch.queue = []; standUp(ch); ch.enqueue([{ type: 'meditate', summoned: true }]); }));
    }
    if (ch.mana) {
      h('Care (right-click menu)');
      d.append(btn('Info', () => showInfo(ch)), btn('Pat', () => pat(ch)));
      for (const f of Object.values(content.food || {})) d.append(btn(`Feed ${f.name || f.id}`, () => feed(ch, f.id)));
    }
    h('Falls (drop from % of screen)');
    for (const f of [0.2, 0.42, 0.9]) d.append(btn(`drop ${Math.round(f * 100)}%`, () => dropFrom(ch, f)));
    h('Animations (click = play, ⟳ = loop)');
    for (const an of Object.keys(ch.def.animations)) {
      d.append(btn(an, () => { ch.queue = []; ch.target = null; ch.loopAnim = null; ch.play(an, 3); }), btn('⟳', () => { ch.queue = []; ch.target = null; ch.loopAnim = ch.loopAnim === an ? null : an; ch.play(an); }));
    }
    h('Moods');
    const sel = document.createElement('select');
    for (const m of ch.mood.moods) { const o = document.createElement('option'); o.value = o.textContent = m; if (m === ch.mood.current) o.selected = true; sel.append(o); }
    sel.onchange = () => ch.mood.set(sel.value, 300); d.append(sel);
    h('Interactions & magic');
    for (const it of Object.values(content.interactions)) {
      for (const o of Object.values(chars)) if (o !== ch && interactionAllowed(it, ch.id, o.id)) d.append(btn(`${it.name || it.id} → ${charName(o.id)}${it.manaCost ? ` (${it.manaCost})` : ''}`, () => ch.enqueue([{ type: 'interact', kind: it.id, with: o.id }])));
      if (!it.magic && it.requires && !chars[it.requires] && ch.id !== it.requires) d.append(btn(`${it.name || it.id} → you (screen)`, () => ch.enqueue([{ type: 'interact', kind: it.id, with: it.requires }])));
    }
    h('Furniture');
    for (const p of Object.values(content.props)) {
      if (!usableBy({ def: p, owner: null }, ch)) continue;
      if (p.sittable) d.append(btn(`sit on ${p.id}`, () => { ch.queue = []; ch.enqueue([{ type: 'sit', on: p.id, summon: true }]); }));
      if (p.layable) d.append(btn(`lay on ${p.id}`, () => { ch.queue = []; ch.enqueue([{ type: 'lay', on: p.id, summon: true }]); }));
    }
    d.append(btn('sit on floor', () => ch.enqueue([{ type: 'sit', on: 'floor' }])), btn('lay on floor', () => ch.enqueue([{ type: 'lay', on: 'floor' }])), btn('stand up', () => standUp(ch)));
    h('Cast effect');
    for (const e of Object.values(content.effects)) d.append(btn(e.id, () => ch.enqueue([{ type: 'cast', effect: e.id }])));
    h('Move / talk');
    d.append(btn('walk left', () => ch.enqueue([{ type: 'walk_to', target: 'left' }])), btn('run right', () => ch.enqueue([{ type: 'run_to', target: 'right' }])),
      btn('jump', () => ch.enqueue([{ type: 'jump' }])), btn('idle line', () => speak(ch, 'idle')), btn('… bubble', () => ch.dots(3)), btn('? bubble', () => ch.question()));
  }
  refreshDebugMeters();
}

// ---------------- toast / save ----------------
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 4000); }
let saveT;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 2000); }
function save() {
  try {
    fs.writeFileSync(SAVE_PATH, JSON.stringify({ v: 2,
      chars: Object.fromEntries(Object.values(chars).filter((c) => c.role !== 'guest').map((c) => [c.id, { mana: c.mana.toJSON(), mood: c.mood.toJSON(), aff: c.aff.toJSON(), lastMeditate: c.lastMeditate || 0, food: c.foodState || {}, pat: c.patState || {} }])),
      pity: pity ? pity.toJSON() : null,
      props: props.filter((p) => !p.sleepBed).map((p) => ({ id: p.id, x: (p.x - wa.x) / wa.w, born: p.born })), lastUserAt, savedAt: Date.now() }, null, 1));
  } catch (e) { console.error('save failed ' + e.message); }
}
function loadSave() {
  try {
    const s = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    const away = s.savedAt ? Math.min(8 * 3600, (Date.now() - s.savedAt) / 1000) : 0;
    for (const w of wives()) {
      const c = (s.chars || {})[w.id];
      if (c) { w.mana.value = clamp(c.mana.value, 0, w.mana.max); w.mood.load(c.mood); w.aff.load(c.aff); w.lastMeditate = c.lastMeditate || 0; w.foodState = c.food || {}; w.patState = c.pat || {}; }
      else if (s.mana) { w.mana.value = clamp(s.mana.value, 0, w.mana.max); if (s.moods && s.moods[w.id]) w.mood.load(s.moods[w.id]); }   // v1 save
      w.mana.tick(away, 'awake');
    }
    if (s.lastUserAt) lastUserAt = s.lastUserAt;
    if (s.pity && pity) pity.load(s.pity);
    for (const p of s.props || []) if (content.props[p.id]) { const q = summon(null, p.id, wa.x + p.x * wa.w, true); if (q) q.born = p.born; }
    fx.length = 0;
  } catch {}
}
setInterval(save, 30000);

// ---------------- plugin API ----------------
function pluginApi() {
  return {
    version: INIT.version, on: (ev, fn) => hooks.on(ev, fn), log: (m) => ipcRenderer.send('log', '[plugin] ' + m),
    get content() { return content; }, get chars() { return chars; }, get config() { return cfg; },
    mana: (id) => chars[id] && chars[id].mana, moodLevel: (id) => chars[id] && chars[id].aff.level,
    say: (id, text) => chars[id] && chars[id].enqueue([{ type: 'say', text }]),
    act: (id, actions) => chars[id] && chars[id].enqueue(actions), speak: (id, trig) => speak(chars[id], trig),
    summon: (id, x) => summon(null, id, x), spawnEffect: spawnFx, toast, trigger, sendEvent,
    awareness: (ev) => onAwareness(ev), registerCheat: (name, desc, fn) => { COMMANDS[name] = desc; hooks.on('cheat:' + name, fn); },
    goToRoom, visit, setSleep,
  };
}

// ---------------- IPC from main ----------------
ipcRenderer.on('cmd', (_e, c) => {
  if (c.cmd === 'chat') { chatIsOpen() ? closeChat() : openChat(); }
  if (c.cmd === 'sleep') setSleep(c.on, true);
  if (c.cmd === 'room') goToRoom('our_room', currentPlan(), { source: 'user' });
  if (c.cmd === 'visit') { lastUserAt = Date.now(); visit(c.guest); }
  if (c.cmd === 'debugmenu' && debugMode) toggleDebug();
  if (c.cmd === 'debugoff') setDebugMode(false);
  if (c.cmd === 'reset-pity' && pity) pity.reset();
});
ipcRenderer.on('awareness', (_e, a) => onAwareness(a));
ipcRenderer.on('user-active', () => wakeUp('input'));   // mouse/keyboard anywhere (system idle time reset)
// Update flow: one wife announces it in her bubble with Update / Later buttons (no native dialogs).
let updWife = null;
ipcRenderer.on('update-available', (_e, u) => {
  const w = pick(wives().filter((c) => !c.hidden)); if (!w) return; updWife = w;
  w.say(`A new version (v${u.version}) is here~ Want me to update?`, 60);
  w.bubble.button = { label: '⬇ Update', fn: () => { w.say(`Updating to v${u.version}… I'll be right back!`, 120); ipcRenderer.send('update-accept'); } };
  w.bubble.button2 = { label: 'Later', fn: () => { w.bubble = null; ipcRenderer.send('update-later'); } };
});
ipcRenderer.on('update-progress', (_e, m) => { const w = (updWife && !updWife.hidden) ? updWife : pick(wives().filter((c) => !c.hidden)); if (w) { w.bubble = { text: m, until: performance.now() + 120000, button: null }; } });
ipcRenderer.on('update-failed', (_e, m) => { const w = pick(wives().filter((c) => !c.hidden)); if (w) w.say(`The update failed… ${m} We're still here though!`, 12); });
ipcRenderer.on('update-done', (_e, u) => { setTimeout(() => { const w = pick(wives().filter((c) => !c.hidden)); if (w) w.say(`Updated to v${u.version}! ✨`, 10); }, 2500); });
ipcRenderer.on('update-cancelled', () => { const w = wives().find((c) => c.bubble && !c.bubble.dots); if (w) w.bubble = null; });
ipcRenderer.on('content-changed', () => { loadAll(); toast('Content reloaded'); });
ipcRenderer.on('config', (_e, c) => { cfg = c; });
ipcRenderer.on('toast', (_e, m) => toast(m));
function setWorkArea(work, bounds) {
  wa.x = work.x - bounds.x; wa.y = work.y - bounds.y; wa.w = Math.min(work.width, W - wa.x); wa.h = Math.min(work.height, H - wa.y);
  ground = wa.y + wa.h - (cfg.groundOffset || 0);
  for (const c of Object.values(chars)) { if (!c.seat) c.y = Math.min(c.y, ground); c.x = clampX(c.x, c); }
}
ipcRenderer.on('workarea', (_e, m) => { resize(); setWorkArea(m.workArea || m, m.bounds || INIT.bounds); });
ipcRenderer.on('room', (_e, r) => {
  roomOpen = r.open; const who = r.who && r.who.length ? r.who : wives().map((c) => c.id);
  for (const id of who) if (chars[id]) { chars[id].hidden = r.open; if (r.open) chars[id].alpha = 0; }
  if (r.open) { roomWho = who; sendEvent('room', { room: r.room, who }); }
  else {
    for (const id of who) { const c = chars[id]; if (!c || c.role === 'guest') continue; c.mood.react('room'); c.aff.event('mana_replenished'); c.x = clampX(c.x, c); c.y = ground; }
    lastUserAt = Date.now(); firstAskAt = 0; roomWho = []; tripReturn();
    speak(chars[who[0]], 'room_done'); saveSoon();
  }
});
setInterval(() => {   // the room shows the resting one(s)' mana; it closes itself when they're all full
  const rs = roomWho.map((id) => chars[id]).filter((c) => c && c.mana);
  const m = rs.length ? rs.reduce((a, c) => (c.mana.ratio < a.mana.ratio ? c : a)) : null;
  ipcRenderer.send('mana', m ? { value: m.mana.value, max: m.mana.max, who: roomWho } : { value: 0, max: 100 });
}, 500);

// ---------------- boot ----------------
function resize() {
  DPR = window.devicePixelRatio || 1; W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
}
(async function boot() {
  INIT = await ipcRenderer.invoke('init'); cfg = INIT.cfg;
  SAVE_PATH = path.join(INIT.dirs.user, 'save.json');
  resize(); setWorkArea(INIT.workArea, INIT.bounds);
  window.addEventListener('resize', () => { resize(); setWorkArea(INIT.workArea, INIT.bounds); });
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', () => resize());
  loadAll();
  const ids = (cfg.characters || ['nixie', 'noct']).filter((id) => content.characters[id]);
  ids.forEach((id, i) => addChar(id, wa.x + wa.w * rnd(0.2 + i * 0.35, 0.4 + i * 0.35), 'wife'));
  loadSave();
  aw.tod = timeOfDay();
  setTimeout(() => { speak(chars.nixie, 'greet'); setTimeout(() => chars.noct && chars.noct.dots(2.5), 2500); }, 1500);
  hooks.emit('ready', {});
  requestAnimationFrame(loop);
  if (INIT.screenshot) ({ v012: demo012, v013: demo013 }[process.env.PW_SCENE] || demo)();
  else if (INIT.demo) demo();
})();

// test / screenshot scenarios (PW_DEMO=1 or PW_SCREENSHOT=<dir> [PW_SCENE=v012])
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, which = 'overlay') => { if (INIT.screenshot) await ipcRenderer.invoke('capture', which, path.join(INIT.screenshot, name)); };
async function demo() {
  infinite = true; wives().forEach((w) => { w.mana.infinite = true; });
  const n = chars.nixie, o = chars.noct; const X = (f) => wa.x + wa.w * f;
  summon(null, 'sofa', X(0.45)); summon(null, 'bed', X(0.8)); summon(null, 'table', X(0.3)); summon(null, 'teacup', X(0.3)); summon(null, 'candles', X(0.36)); summon(null, 'light_orb', X(0.55));
  n.x = X(0.42); o.x = X(0.62); n.nextThink = o.nextThink = 1e12;
  n.say('Ta-da~ I summoned furniture! Sit with me, my queen~'); o.say('...Comfortable.');
  await sleepMs(1500); await shot('01_overlay_say.png');
  n.enqueue([{ type: 'sit', on: 'sofa' }]); o.enqueue([{ type: 'lay', on: 'bed' }]);
  await sleepMs(5000); debugDraw = true; await sleepMs(300); await shot('02_sit_lay_debug.png'); debugDraw = false;
  visit('chrispyni'); const c = chars.chrispyni; c.x = X(0.5); c.queue = []; c.nextThink = 1e12; c.alpha = 1;
  standUp(n); standUp(o); n.x = X(0.43); o.x = X(0.6);
  n.enqueue([{ type: 'interact', kind: 'hug', with: 'chrispyni' }]); o.enqueue([{ type: 'interact', kind: 'kiss', with: 'chrispyni' }]);
  await sleepMs(4000); await shot('03_hug_kiss_guest.png');
  toggleDebug(); await sleepMs(500); await shot('04_debug_menu.png'); toggleDebug();
  infinite = false; wives().forEach((w) => { w.mana.infinite = false; }); n.mana.value = 12; askMana(n, currentPlan()); await sleepMs(800); await shot('05_low_mana_ask.png');
  goToRoom('our_room', currentPlan(), { source: 'user' }); await sleepMs(7000); await shot('06_room.png', 'room'); await sleepMs(6000); await shot('07_room_fade.png', 'room');
  if (INIT.screenshot) { save(); ipcRenderer.send('quit'); }
}
async function demo013() {
  noAutoTake = true;
  const n = chars.nixie, o = chars.noct; const X = (f) => wa.x + wa.w * f;
  for (const w of wives()) { w.nextThink = 1e12; w.queue = []; w.bubble = null; }
  n.x = X(0.4); o.x = X(0.6); n.mana.value = 30; o.mana.value = 90;
  await sleepMs(2200); for (const w of wives()) w.bubble = null;
  // 1. bubble/confirm stacked above the mana bar
  onPointer(n.x, ground - 40); await sleepMs(300); confirmReplenish(n); await sleepMs(300); await shot('v013_01_confirm_above_bar.png');
  n.bubble = null; onPointer(o.x, ground - 40); await sleepMs(300); confirmReplenish(o); await sleepMs(300); await shot('v013_02_mana_fine.png');
  onPointer(5, 5); await sleepMs(1200); for (const w of wives()) w.bubble = null;
  // 2. cookie limit
  for (let i = 0; i < 6; i++) { feed(o, 'cookie'); await sleepMs(250); }
  await sleepMs(300); await shot('v013_03_cookie_full.png'); for (const w of wives()) w.bubble = null;
  // 3. cursor curiosity
  await sleepMs(800); onPointer(n.x + 24, ground - 70); await sleepMs(1200); await shot('v013_04_cursor_curious.png');
  onPointer(5, 5); await sleepMs(800); for (const w of wives()) { w.bubble = null; w.looking = 0; }
  // 4. watching together
  onAwareness({ kind: 'app', title: 'Cats compilation - YouTube - Google Chrome', owner: 'chrome', process: 'chrome.exe', category: 'video', playing: true, fullscreen: true });
  await sleepMs(9000); await shot('v013_05_watching.png');
  onAwareness({ kind: 'app', title: 'main.js - Visual Studio Code', owner: 'Code', process: 'Code.exe', category: 'code', playing: false }); await sleepMs(1200);
  // 5. prop use
  n.x = X(0.4); o.x = X(0.6); summon(null, 'teacup', X(0.47), true); const cup = props[props.length - 1];
  n.queue = []; n.enqueue([{ type: 'use_prop', uid: cup.uid }]); await sleepMs(3500); await shot('v013_06_prop_use.png');
  // 6. debug panel with pity
  setDebugMode(true); await sleepMs(600); await shot('v013_07_debug_pity.png'); setDebugMode(false);
  save(); ipcRenderer.send('quit');
}
async function demo012() {
  noAutoTake = true;
  const n = chars.nixie, o = chars.noct; const X = (f) => wa.x + wa.w * f;
  for (const w of wives()) { w.nextThink = 1e12; w.queue = []; w.bubble = null; }
  n.x = X(0.4); o.x = X(0.6); n.mana.value = 72; o.mana.value = 35;
  await sleepMs(2200); for (const w of wives()) w.bubble = null;
  // hover mana: move the "cursor" over Nixie
  onPointer(n.x, ground - 40); await sleepMs(400); await shot('v012_01_hover_mana.png');
  onPointer(o.x, ground - 50); await sleepMs(400); await shot('v012_02_hover_noct.png');
  onPointer(5, 5); await sleepMs(1500);
  // levitation
  n.enqueue([{ type: 'interact', kind: 'levitate', with: 'noct' }]); await sleepMs(2600); await shot('v012_03_levitate.png');
  await sleepMs(3500); for (const w of wives()) w.bubble = null;
  // falls
  o.x = X(0.7); dropFrom(n, 0.2); await sleepMs(90); await shot('v012_04_falling.png'); await sleepMs(900);
  dropFrom(n, 0.42); await sleepMs(700); await shot('v012_05_superhero_land.png'); await sleepMs(1500);
  dropFrom(o, 0.95); await sleepMs(900); await shot('v012_06_faceplant.png'); await sleepMs(1900); await shot('v012_07_getup.png');
  await sleepMs(1500); for (const w of wives()) w.bubble = null;
  // chatter '...' and '?' bubbles
  chatter(n, o); await sleepMs(3600); await shot('v012_08_chatter_dots.png');
  await sleepMs(4000); handleChat('ok'); await sleepMs(500); await shot('v012_09_question.png');
  // craft & lovely magic with Chrispy
  for (const w of wives()) w.bubble = null;
  n.enqueue([{ type: 'interact', kind: 'craft_together', with: 'noct' }]); await sleepMs(3300); await shot('v012_10_craft.png');
  visit('chrispyni'); const c = chars.chrispyni; c.queue = []; c.x = X(0.5); c.alpha = 1; c.nextThink = 1e12; await sleepMs(1500); c.queue = []; c.target = null; o.x = c.x + 50; n.x = X(0.75);
  o.enqueue([{ type: 'interact', kind: 'lovely_twirl', with: 'chrispyni' }]); await sleepMs(4500); await shot('v012_11_lovely_twirl.png');
  // meditation on the floor (no cushion affordable)
  dismiss('all'); await sleepMs(300); o.mana.value = 2; o.queue = []; o.target = null; o.waitUntil = 0; o.state = 'idle'; o.enqueue([{ type: 'meditate' }]); await sleepMs(1500); onPointer(o.x, ground - 30); await sleepMs(300); await shot('v012_12_meditate.png');
  debugDraw = true; await sleepMs(300); await shot('v012_13_hitbox_view.png'); debugDraw = false;
  standUp(o); leave(chars.chrispyni); await sleepMs(4500); await shot('v012_14_guest_portal_out.png');
  goToRoom('our_room', ['nixie'], { source: 'user' }); await sleepMs(1200); await shot('v012_15_door.png');
  await sleepMs(4000); await shot('v012_16_room_single.png', 'room');
  if (chars.chrispyni) delete chars.chrispyni;
  o.bubble = null; o.x = X(0.3); o.queue = []; o.target = null; await sleepMs(300);
  charMenu(o, o.x + 20, ground - 90); await sleepMs(300); await shot('v012_17_char_menu.png'); closeMenus();
  showInfo(o); await sleepMs(300); await shot('v012_18_info.png'); closeMenus();
  pat(o); await sleepMs(900); await shot('v012_19_portal_pat.png'); await sleepMs(1500);
  feed(o, 'cookie'); await sleepMs(250); await shot('v012_20_feed_spawn.png'); await sleepMs(1600); await shot('v012_21_eating.png');
  const sofa = summon(null, 'sofa', X(0.15), true); sofa.owner = 'noct'; await sleepMs(400); propMenu(sofa, sofa.x, ground - 60); await sleepMs(300); await shot('v012_22_prop_menu.png'); closeMenus();
  save(); ipcRenderer.send('quit');
}
