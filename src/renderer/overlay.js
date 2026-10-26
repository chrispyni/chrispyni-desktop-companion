// Project Wives overlay: the desktop world where Nixie & Noct live.
'use strict';
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { loadContent } = require('../core/content');
const { Mana } = require('../core/mana');
const { MoodState, animForMood } = require('../core/mood');
const { OfflineBrain } = require('../core/brain');
const { parseReply, parseText, buildIndex } = require('../core/actions');
const { parseCheat, COMMANDS } = require('../core/cheats');
const { checkPassphrase, isAdminByIdentity } = require('../core/admin');
const { buildMessage } = require('../core/relay');
const { timeOfDay, isSleepHour } = require('../core/awareness');
const { EventSystem } = require('../core/events');
const { Hooks, loadPlugins } = require('../core/plugins');

const $ = (id) => document.getElementById(id);
const cv = $('world'); const g = cv.getContext('2d');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let INIT, cfg, content, brain, mana, events, hooks = new Hooks((m) => ipcRenderer.send('log', m));
let ground = 0, W = 0, H = 0, speed = 1, debugDraw = false, infinite = false;
const images = {};
const chars = {};          // id -> Char
const props = [];          // {uid,id,def,x,y,t}
const fx = [];             // {id,def,x,y,t}
let uidSeq = 1, sleepMode = false, sleepManual = false, roomOpen = false, adminSession = false;
let relayStatus = { enabled: false }, pendingChat = null, lastEventSent = 0;
const aw = { app: null, category: null, idleSec: 0, idleLongFired: false, tod: null, lastReact: {}, stream: false };
let SAVE_PATH = '';

// ---------------- assets ----------------
function img(p) {
  if (!p) return null;
  if (images[p]) return images[p];
  const im = new Image(); im.src = 'file:///' + p.replace(/\\/g, '/') + '?v=' + Date.now(); images[p] = im; return im;
}

function loadAll() {
  for (const k of Object.keys(images)) delete images[k];
  content = loadContent(INIT.dirs.base, INIT.dirs.mods, { disabledMods: cfg.disabledMods });
  content._index = buildIndex(content);
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
  const files = [...content.plugins];
  for (const d of INIT.dirs.plugins) if (fs.existsSync(d)) files.push(...fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f)));
  const loaded = loadPlugins(files, pluginApi(), (m) => ipcRenderer.send('log', m));
  hooks.emit('content_loaded', { content });
  if (debugOpen) buildDebug();
  return loaded;
}

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
  }
  get scale() { return (this.def.scale || 2) * (cfg.scale / 2 || 1); }
  get fw() { return this.def.frame.w; } get fh() { return this.def.frame.h; }
  bbox() {
    const s = this.scale, ax = this.def.anchor.x * s, ay = this.def.anchor.y * s;
    return { x: this.x - ax + 10 * s, y: this.y - ay + 4 * s, w: this.fw * s - 20 * s, h: this.fh * s - 4 * s };
  }
  play(anim, holdSec = 0, loop = false) {
    if (!this.def.animations[anim]) anim = 'idle';
    if (this.anim !== anim) { this.anim = anim; this.t = 0; }
    if (holdSec) this.holdUntil = performance.now() + holdSec * 1000;
    if (loop) this.loopAnim = anim;
  }
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
const charName = (id) => (content.characters[id] || {}).name || id;

// --------------- talking via brain -------------
function vars(ch) {
  const others = wives().filter((c) => c !== ch);
  return { user: cfg.user, app: aw.app ? (aw.app.owner || aw.app.title) : '', title: aw.app && aw.app.media ? aw.app.media.title : '',
    time: aw.tod || timeOfDay(), other: others.length ? charName(others[0].id) : '', name: charName(ch.id) };
}
function speak(ch, trigger, extra = {}) {
  if (!ch) return false;
  const line = brain.pick(ch.def.personality.lines || ch.id, trigger, ch.mood.current, { ...vars(ch), ...extra });
  if (!line) return false;
  const p = parseText(line, content);
  ch.enqueue([{ type: 'say', text: p.text }, ...p.actions]);
  return true;
}

// ---------------- actions ----------------
function resolveX(ch, target) {
  if (typeof target === 'number') return target;
  const t = String(target || '').toLowerCase();
  if (t === 'left') return W * 0.1; if (t === 'right') return W * 0.9; if (t === 'center') return W / 2;
  if (/^\d+$/.test(t)) return +t;
  if (chars[t] && chars[t] !== ch) return chars[t].x + (chars[t].x > ch.x ? -40 : 40);
  if (t === 'chrispy' || t === 'you') return chars.chrispyni ? chars.chrispyni.x - 40 : clamp(lastMouse.x, 40, W - 40);
  const p = nearestProp(ch.x, t); if (p) return p.x;
  return rnd(W * 0.1, W * 0.9);
}
function nearestProp(x, idOrFlag) {
  let best = null, bd = 1e9;
  for (const p of props) {
    const ok = idOrFlag === 'sittable' ? p.def.sittable : idOrFlag === 'layable' ? p.def.layable : p.id === idOrFlag;
    if (ok && Math.abs(p.x - x) < bd) { bd = Math.abs(p.x - x); best = p; }
  }
  return best;
}
function costOk(ch, cost, what) {
  if (infinite || mana.spend(cost)) { saveSoon(); return true; }
  ch.mood.react('summon_fail'); speak(ch, 'summon_fail') || ch.say('Not enough mana…');
  hooks.emit('mana_denied', { char: ch.id, what, cost });
  return false;
}
function spawnFx(id, x, y, scale) {
  const def = content.effects[id]; if (!def) return;
  fx.push({ id, def, x, y, t: 0, scale: scale || def.scale || 2 });
}
function summon(ch, id, x) {
  const def = content.props[id]; if (!def) { ch && ch.say(`(no prop "${id}")`); return null; }
  if (ch && !costOk(ch, def.manaCost || 0, id)) return null;
  const px = x != null ? x : clamp((ch ? ch.x : W / 2) + (ch ? ch.facing : 1) * rnd(50, 90), 40, W - 40);
  const p = { uid: uidSeq++, id, def, x: px, y: ground - (def.float || 0) * 2, t: 0, born: Date.now() };
  props.push(p); spawnFx(def.spawnEffect || 'spawn_sparkle', p.x, p.y - def.frame.h);
  hooks.emit('summon', { char: ch && ch.id, prop: id }); saveSoon();
  return p;
}
function dismiss(item) {
  const list = item === 'all' ? props.slice() : item === 'last' ? props.slice(-1) : props.filter((p) => p.id === item).slice(-1);
  for (const p of list) { spawnFx('void_burst', p.x, p.y - p.def.frame.h); props.splice(props.indexOf(p), 1); for (const c of Object.values(chars)) if (c.seat === p) standUp(c); }
  saveSoon();
}
function standUp(c) { c.seat = null; c.state = 'idle'; c.y = ground; c.loopAnim = null; c.play('idle'); }

function interactionAllowed(def, a, b) {
  if (!def) return false;
  for (const [x, y] of def.forbidPairs || []) if ((a === x && b === y) || (a === y && b === x)) return false;
  if (def.requires && a !== def.requires && b !== def.requires) return false;
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
      ch.target = clamp(resolveX(ch, a.target ?? a.x), 30, W - 30); ch.state = a.type === 'run_to' || a.run ? 'run' : 'walk'; return false;
    }
    case 'sit': case 'lay': {
      const flag = a.type === 'sit' ? 'sittable' : 'layable';
      const p = a.on && a.on !== 'floor' ? (nearestProp(ch.x, a.on) || (a.summon !== false && content.props[a.on] && summon(ch, a.on))) : nearestProp(ch.x, flag);
      if (p && Math.abs(p.x - ch.x) > 8) { ch.queue.unshift(a); ch.target = p.x; ch.state = 'walk'; return false; }
      ch.seat = p || null; ch.state = a.type; ch.play(a.type, 0, true);
      if (p) { ch.x = p.x + (countOn(p) - 1) * 20; ch.y = ground - (p.def.seatY ?? (a.type === 'lay' ? 12 : 8)) * (cfg.scale || 2); }
      ch.holdUntil = now + (a.sec || rnd(8, 20)) * 1000; return true;
    }
    case 'sleep': ch.state = 'sleep'; ch.play(ch.seat && ch.seat.def.layable ? 'lay' : 'sleep', 0, true); ch.holdUntil = now + (a.sec || 30) * 1000; return true;
    case 'wake': if (ch.seat) standUp(ch); ch.state = 'idle'; ch.loopAnim = null; ch.play('happy', 1.2); speak(ch, 'wake'); return true;
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
    case 'go_to_room': goToRoom(a.room); return true;
    case 'ask_mana': askMana(ch); return true;
    case 'wait': ch.waitUntil = now + (a.sec || 1) * 1000; return false;
    case 'interact': return startInteract(ch, a);
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
    // partner absent (e.g. ChrispyNi not visiting): direct it at her, the user, through the screen
    ch.play(def.anim, def.durationSec || 2); speak(ch, def.lines || a.kind);
    if (def.effect) spawnFx(def.effect, ch.x, ch.y - ch.fh * ch.scale);
    return true;
  }
  const dist = (def.distance || 30) * (ch.scale / 2);
  if (Math.abs(partner.x - ch.x) > dist + 4) {
    ch.queue.unshift({ ...a, with: partner.id });
    if (ch.seat) standUp(ch);
    ch.target = partner.x + (partner.x > ch.x ? -dist : dist); ch.state = 'walk'; return false;
  }
  if (partner.waitUntil && partner.waitUntil > performance.now() + 50) { ch.queue.unshift({ ...a, with: partner.id }); ch.waitUntil = partner.waitUntil + 200; return false; }
  if (partner.seat) standUp(partner);
  ch.facing = partner.x > ch.x ? 1 : -1; partner.facing = -ch.facing;
  ch.play(def.anim, def.durationSec); partner.play(def.partnerAnim || def.anim, def.durationSec);
  partner.queue = []; partner.current = null; partner.waitUntil = performance.now() + def.durationSec * 1000; partner.state = 'idle'; partner.target = null;
  ch.waitUntil = performance.now() + def.durationSec * 1000;
  speak(ch, def.lines || a.kind);
  if (Math.random() < 0.6) setTimeout(() => speak(partner, def.lines || a.kind), 900);
  if (def.effect) setTimeout(() => spawnFx(def.effect, (ch.x + partner.x) / 2, ch.y - ch.fh * ch.scale * 0.8), 400);
  ch.mood.react('room'); hooks.emit('interact', { kind: a.kind, a: ch.id, b: partner.id });
  return false;
}

function visit(gid) {
  if (chars[gid]) return;
  const fromLeft = Math.random() < 0.5;
  const c = addChar(gid, fromLeft ? -30 : W + 30, 'guest'); if (!c) return;
  c.enqueue([{ type: 'walk_to', target: rnd(W * 0.3, W * 0.7) }]);
  speak(c, 'visit') || c.enqueue([{ type: 'say', text: 'Hi, my queens.' }]);
  c.leaveAt = performance.now() + (cfg.guestVisitMinutes || 3) * 60000;
  for (const w of wives()) { w.mood.react('back'); if (Math.random() < 0.7) w.enqueue([{ type: 'interact', kind: pick(['wave', 'hug']), with: gid }]); }
  hooks.emit('visit', { guest: gid });
}
function leave(c) { speak(c, 'leave'); c.leaving = true; c.queue.push({ type: 'walk_to', target: c.x < W / 2 ? -60 : W + 60 }); }

function goToRoom(room = 'our_room') {
  if (roomOpen) return;
  for (const c of wives()) { c.mood.react('room'); }
  speak(chars.nixie, 'room_enter');
  setTimeout(() => ipcRenderer.send('open-room', room), 800);
}
let lastAsk = 0;
function askMana(ch) {
  lastAsk = Date.now();
  speak(ch, 'ask_mana') || ch.say('Mana, please?');
  if (ch.bubble) ch.bubble.button = { label: '💜 Give mana (our room)', fn: () => goToRoom() };
  if (ch.bubble) ch.bubble.until += 15000;
}

// ---------------- simulation ----------------
function think(ch, now) {
  // autonomous behavior when queue is empty
  const m = ch.mood.current;
  if (ch.role === 'guest' && ch.leaveAt && now > ch.leaveAt && !ch.leaving) { leave(ch); return; }
  if (sleepMode) { if (ch.state !== 'sleep' && ch.state !== 'lay') ch.enqueue([nearestProp(ch.x, 'layable') ? { type: 'lay' } : { type: 'sleep', sec: 600 }]); return; }
  const tk = (ch.def.personality.talkativeness || 0.5) * (cfg.talkativeness ?? 1);
  const r = Math.random();
  if (r < 0.32 * tk) { speak(ch, 'idle'); }
  else if (r < 0.62) { ch.enqueue([{ type: 'walk_to', target: clamp(ch.x + rnd(-300, 300), 40, W - 40) }]); }
  else if (r < 0.72 && nearestProp(ch.x, 'sittable')) { ch.enqueue([{ type: 'sit' }]); }
  else if (r < 0.78) { const o = Object.values(chars).find((c) => c !== ch); if (o) ch.enqueue([{ type: 'interact', kind: o.id === 'chrispyni' ? pick(['hug', 'kiss', 'wave']) : 'wave', with: o.id }]); }
  else { const an = animForMood(m, ch.def.moodAnims); ch.play(an, rnd(2, 5)); }
  ch.nextThink = now + rnd(5000, 14000) / speed;
}

function update(dt) {
  const now = performance.now();
  for (const ch of Object.values(chars)) {
    ch.t += dt;
    ch.mood.tick(dt);
    if (ch.bubble && now > ch.bubble.until) ch.bubble = null;
    if (ch.dragging || ch.hidden) continue;
    // gravity
    const baseY = ch.seat ? ch.y : ground;
    if (ch.y < baseY || ch.vy) { ch.vy += 900 * dt; ch.y += ch.vy * dt; if (ch.y >= baseY) { ch.y = baseY; ch.vy = 0; } }
    if (!ch.seat && ch.y > ground) ch.y = ground;
    // movement
    if (ch.target != null) {
      const sp = (ch.def.walkSpeed || 45) * (ch.state === 'run' ? 2.4 : 1) * speed * (ch.scale / 2) * 2.2;
      const d = ch.target - ch.x; ch.facing = d > 0 ? 1 : -1;
      if (Math.abs(d) <= sp * dt) { ch.x = ch.target; ch.target = null; ch.state = 'idle'; }
      else { ch.x += Math.sign(d) * sp * dt; ch.anim !== (ch.state === 'run' ? 'run' : 'walk') && ch.play(ch.state === 'run' ? 'run' : 'walk'); }
      if (ch.target == null && ch.leaving && (ch.x < -40 || ch.x > W + 40)) { delete chars[ch.id]; continue; }
      if (ch.target != null) continue;
    }
    if (ch.waitUntil && now < ch.waitUntil) continue;
    ch.waitUntil = 0;
    if (ch.queue.length) { const a = ch.queue.shift(); ch.current = a; startAction(ch, a); continue; }
    if ((ch.state === 'sit' || ch.state === 'lay' || ch.state === 'sleep') && now < ch.holdUntil) continue;
    if ((ch.state === 'sit' || ch.state === 'lay' || ch.state === 'sleep') && !sleepMode) standUp(ch);
    if (now > ch.holdUntil && ch.anim !== 'idle' && !ch.loopAnim && ch.state === 'idle') ch.play(animForMood(ch.mood.current, ch.def.moodAnims) === 'sleep' ? 'idle' : 'idle');
    if (ch.loopAnim && ch.state === 'idle' && !ch.seat) ch.play(ch.loopAnim);
    if (now > ch.nextThink && !ch.loopAnim) { think(ch, now); if (!ch.nextThink || ch.nextThink < now) ch.nextThink = now + rnd(5000, 12000); }
  }
  for (const p of props) p.t += dt;
  for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.t += dt; if (!e.def.loop && e.t * e.def.fps >= e.def.frames) fx.splice(i, 1); }
  // props expire
  for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (p.def.lifetimeSec && Date.now() - p.born > p.def.lifetimeSec * 1000 && !countOn(p) && !p.pinned) props.splice(i, 1); }
  // mana
  mana.tick(dt * speed, roomOpen ? 'room' : sleepMode ? 'sleep' : 'awake');
  if (mana.low && !roomOpen && Date.now() - lastAsk > (cfg.mana.askEveryMin || 6) * 60000) {
    const w = pick(wives()); if (w) { w.mood.react('low_mana'); askMana(w); }
  }
}

// ---------------- rendering ----------------
function drawSprite(im, sx, sy, sw, sh, dx, dy, scale, flip) {
  if (!im || !im.complete || !im.naturalWidth) return;
  g.save(); g.translate(Math.round(dx), Math.round(dy));
  if (flip) { g.scale(-1, 1); }
  g.drawImage(im, sx, sy, sw, sh, flip ? -sw * scale : 0, 0, sw * scale, sh * scale); g.restore();
}
function frameOf(anim, t) { return Math.floor(t * (anim.fps || 6) * speed) % Math.max(1, anim.frames); }

function drawBubble(ch) {
  const b = ch.bubble; const st = ch.def.bubble || {};
  g.font = '13px "Segoe UI", sans-serif';
  const maxW = 220, words = b.text.split(' '); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  const bw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 16;
  const bh = lines.length * 16 + 10 + (b.button ? 24 : 0);
  const top = ch.y - ch.def.anchor.y * ch.scale - 10 - bh;
  const x = clamp(ch.x - bw / 2, 4, W - bw - 4), y = Math.max(4, top);
  g.fillStyle = st.bg || '#fff'; g.strokeStyle = st.border || '#000'; g.lineWidth = 2;
  roundRect(x, y, bw, bh, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(ch.x - 6, y + bh); g.lineTo(ch.x, y + bh + 8); g.lineTo(ch.x + 6, y + bh); g.fill();
  g.fillStyle = st.text || '#000'; lines.forEach((l, i) => g.fillText(l, x + 8, y + 18 + i * 16));
  b.rect = { x, y, w: bw, h: bh };
  if (b.button) {
    const by = y + bh - 26; g.fillStyle = '#6a2fa8'; roundRect(x + 6, by, bw - 12, 20, 6); g.fill();
    g.fillStyle = '#fff'; g.fillText(b.button.label, x + 12, by + 15); b.button.rect = { x: x + 6, y: by, w: bw - 12, h: 20 };
  }
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function render() {
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  // props
  for (const p of props) {
    const d = p.def, s = 2 * (cfg.scale / 2 || 1), f = Math.floor(p.t * (d.fps || 1)) % (d.frames || 1);
    const bob = d.float ? Math.sin(p.t * 2) * 3 : 0;
    drawSprite(img(d.image), f * d.frame.w, 0, d.frame.w, d.frame.h, p.x - d.anchor.x * s, p.y - d.anchor.y * s + bob, s, false);
    if (debugDraw) { g.strokeStyle = '#0f0'; g.strokeRect(p.x - d.anchor.x * s, p.y - d.anchor.y * s, d.frame.w * s, d.frame.h * s); }
  }
  // characters, sorted so the one in front (lower y) draws last
  const list = Object.values(chars).sort((a, b) => a.y - b.y);
  for (const ch of list) {
    if (ch.hidden) continue;
    const a = ch.def.animations[ch.anim] || ch.def.animations.idle; const f = frameOf(a, ch.t); const s = ch.scale;
    // soft shadow
    if (!ch.seat) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(ch.x, ground - 1, 12 * s, 3 * s, 0, 0, 7); g.fill(); }
    const dx = ch.facing < 0 ? ch.x + ch.def.anchor.x * s : ch.x - ch.def.anchor.x * s;
    drawSprite(img(ch.def.sheet), f * ch.fw, a.row * ch.fh, ch.fw, ch.fh, dx, ch.y - ch.def.anchor.y * s, s, ch.facing < 0);
    if (debugDraw) {
      const bb = ch.bbox(); g.strokeStyle = '#f0f'; g.strokeRect(bb.x, bb.y, bb.w, bb.h);
      g.fillStyle = '#ff0'; g.font = '11px monospace';
      g.fillText(`${ch.id} ${ch.state}/${ch.anim}#${f} mood:${ch.mood.current} q:${ch.queue.length}`, bb.x - 20, bb.y - 4);
      g.fillStyle = '#f00'; g.fillRect(ch.x - 2, ch.y - 2, 4, 4);
    }
  }
  for (const e of fx) {
    const d = e.def, f = Math.min(d.frames - 1, Math.floor(e.t * d.fps)) % d.frames;
    drawSprite(img(d.image), f * d.frame.w, 0, d.frame.w, d.frame.h, e.x - d.anchor.x * e.scale, e.y - d.anchor.y * e.scale, e.scale, false);
  }
  for (const ch of list) if (ch.bubble && !ch.hidden) drawBubble(ch);
  if (debugDraw) { g.strokeStyle = 'rgba(255,0,0,.6)'; g.beginPath(); g.moveTo(0, ground); g.lineTo(W, ground); g.stroke(); g.fillStyle = '#ff0'; g.fillText(`ground=${ground} mana=${mana.value.toFixed(1)} sleep=${sleepMode} room=${roomOpen} relay=${relayStatus.enabled} speed=${speed}`, 10, ground - 6); }
  // mana bar
  const mb = $('mana'); const anchor = wives()[0];
  mb.style.left = clamp((anchor ? anchor.x : W - 200) - 75, 4, W - 160) + 'px'; mb.style.top = (ground + 4 > H - 16 ? ground - 18 : ground + 4) + 'px';
  $('manaFill').style.width = (mana.ratio * 100) + '%';
  $('manaText').textContent = infinite ? '∞ mana' : `mana ${Math.floor(mana.value)}/${mana.max}`;
  mb.classList.toggle('low', mana.low && !infinite);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try { update(dt); render(); } catch (e) { console.error('loop error', e); }
  requestAnimationFrame(loop);
}

// ---------------- mouse: click-through except sprites/UI ----------------
const lastMouse = { x: 0, y: 0 }; let capturing = false, drag = null;
function hitChar(x, y) { for (const ch of Object.values(chars).sort((a, b) => b.y - a.y)) { const b = ch.bbox(); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return ch; } return null; }
function hitBubbleBtn(x, y) { for (const ch of Object.values(chars)) { const r = ch.bubble && ch.bubble.button && ch.bubble.button.rect; if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return ch.bubble.button; } return null; }
function overUI(e) { return !!(e.target && e.target.closest && e.target.closest('.ui')); }
function setCapture(on) { if (on !== capturing) { capturing = on; ipcRenderer.send('set-capture', on); } }
window.addEventListener('mousemove', (e) => {
  lastMouse.x = e.clientX; lastMouse.y = e.clientY;
  if (drag) { drag.ch.x = e.clientX - drag.ox; drag.ch.y = Math.min(ground, e.clientY - drag.oy); if (Math.abs(e.clientX - drag.sx) > 4) drag.moved = true; return; }
  const chatOpen = !$('chat').classList.contains('hidden');
  setCapture(chatOpen || debugOpen || overUI(e) || !!hitChar(e.clientX, e.clientY) || !!hitBubbleBtn(e.clientX, e.clientY));
});
window.addEventListener('mousedown', (e) => {
  const btn = hitBubbleBtn(e.clientX, e.clientY); if (btn) { btn.fn(); return; }
  const ch = hitChar(e.clientX, e.clientY); if (!ch || e.button !== 0) return;
  drag = { ch, ox: e.clientX - ch.x, oy: e.clientY - ch.y, sx: e.clientX, moved: false };
  ch.dragging = true; if (ch.seat) standUp(ch); ch.target = null;
});
window.addEventListener('mouseup', () => {
  if (!drag) return; const ch = drag.ch; ch.dragging = false; ch.vy = 0;
  if (drag.moved) { speak(ch, 'dropped'); hooks.emit('dragged', { char: ch.id }); }
  else { ch.mood.react('poked'); speak(ch, 'poked'); ch.play('happy', 1); for (const o of wives()) if (o !== ch) o.mood.react('other_got_attention'); hooks.emit('poked', { char: ch.id }); }
  drag = null;
});
window.addEventListener('dblclick', (e) => { if (hitChar(e.clientX, e.clientY)) openChat(); });
$('mana').addEventListener('click', () => { if (mana.low) goToRoom(); else toast(`Mana ${Math.floor(mana.value)}/${mana.max}. Click when low to go to our room.`); });

// ---------------- chat ----------------
function chatLog(who, text) {
  const d = document.createElement('div');
  if (who === 'sys') { d.className = 'sys'; d.textContent = text; }
  else { const b = document.createElement('b'); b.className = who; b.textContent = (who === 'you' ? cfg.user : charName(who)) + ': '; d.append(b, document.createTextNode(text)); }
  $('chatLog').append(d); while ($('chatLog').children.length > 60) $('chatLog').firstChild.remove();
  $('chatLog').scrollTop = 1e9;
}
function openChat() {
  const c = $('chat'); c.classList.remove('hidden');
  const anchor = wives()[0];
  c.style.left = clamp((anchor ? anchor.x : W / 2) - 210, 4, W - 430) + 'px';
  c.style.top = Math.max(4, ground - 330) + 'px';
  ipcRenderer.send('focus-overlay'); setCapture(true); setTimeout(() => $('chatInput').focus(), 50);
}
function closeChat() { $('chat').classList.add('hidden'); ipcRenderer.send('blur-overlay'); setCapture(false); }
$('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault(); const t = $('chatInput').value.trim(); $('chatInput').value = ''; if (!t) return;
  handleChat(t);
});
function isAdmin() { return !cfg.adminGateEnabled || adminSession || isAdminByIdentity(cfg.admin, INIT.identity); }
function handleChat(t) {
  const cheat = parseCheat(t);
  if (cheat) {
    if (cheat.cmd === 'admin') { adminSession = checkPassphrase(cheat.args[0], cfg.admin && cfg.admin.passphrase) || adminSession; if (adminSession) chatLog('sys', 'admin unlocked'); return; }
    if (isAdmin()) { runCheat(cheat); return; }
    return; // non-admins: silently nothing (only when adminGateEnabled)
  }
  chatLog('you', t);
  for (const w of wives()) w.mood.react('chat');
  hooks.emit('chat', { text: t });
  const ws = wives();
  if (relayStatus.enabled && cfg.relay.enabled) {
    ipcRenderer.send('relay-send', buildMessage('chat', { text: t, user: cfg.user }, stateSnapshot()));
    for (const w of ws) w.bubble = { text: '…', until: performance.now() + 4000 };
    clearTimeout(pendingChat && pendingChat.timer);
    pendingChat = { text: t, timer: setTimeout(() => offlineChat(t, true), (cfg.relay.timeoutSec || 25) * 1000) };
  } else offlineChat(t, false);
}
function offlineChat(t, timedOut) {
  pendingChat = null;
  const ws = wives(); if (!ws.length) return;
  const first = ws.find((c) => c.id === 'nixie') || ws[0];
  const reply = brain.replyToChat(first.def.personality.lines || first.id, t, first.mood.current, vars(first));
  if (reply) { const p = parseText(reply, content); first.enqueue([{ type: 'say', text: p.text }, ...p.actions]); }
  const second = ws.find((c) => c !== first);
  if (second && Math.random() < 0.6) setTimeout(() => {
    const r2 = brain.replyToChat(second.def.personality.lines || second.id, t, second.mood.current, vars(second));
    if (r2) { const p = parseText(r2, content); second.enqueue([{ type: 'say', text: p.text }, ...p.actions]); }
  }, 1500);
  if (timedOut) $('chatStatus').textContent = 'relay: no answer yet - offline brain replied (the real ones may still answer)';
}

// ---------------- relay replies ----------------
function applyReplies(payloads) {
  for (const p of payloads) {
    const list = parseReply(p, content, 'nixie');
    if (list.length && pendingChat) { clearTimeout(pendingChat.timer); pendingChat = null; }
    list.forEach((r, i) => {
      let ch = chars[r.speaker];
      if (!ch && content.characters[r.speaker] && r.speaker === 'chrispyni') { visit('chrispyni'); ch = chars[r.speaker]; }
      if (!ch) return;
      if (ch.bubble && ch.bubble.text === '…') ch.bubble = null;
      if (r.mood) ch.mood.set(r.mood, 180);
      setTimeout(() => ch.enqueue([r.text ? { type: 'say', text: r.text } : null, ...r.actions]), i * 1200);
    });
    hooks.emit('relay_reply', { payload: p, parsed: list });
  }
  for (const w of wives()) if (w.bubble && w.bubble.text === '…') w.bubble = null;
}
function stateSnapshot() {
  return { mana: Math.round(mana.value), manaMax: mana.max, sleep: sleepMode, room: roomOpen, timeOfDay: aw.tod || timeOfDay(),
    app: aw.app ? { title: aw.app.title, owner: aw.app.owner, category: aw.category, media: aw.app.media } : null, idleSec: aw.idleSec,
    characters: Object.fromEntries(Object.values(chars).map((c) => [c.id, { mood: c.mood.current, state: c.state, x: Math.round(c.x / W * 100) }])),
    props: props.map((p) => p.id), version: INIT.version };
}
function sendEvent(kind, data = {}) {
  hooks.emit('event', { kind, ...data });
  if (!cfg.relay.enabled || !cfg.relay.sendEvents) return;
  if (Date.now() - lastEventSent < (cfg.relay.eventMinIntervalSec || 60) * 1000 && kind !== 'room' && kind !== 'sleep') return;
  lastEventSent = Date.now();
  ipcRenderer.send('relay-send', buildMessage('event', { event: { kind, ...data } }, stateSnapshot()));
}

// ---------------- awareness ----------------
function trigger(on, extra = {}) {
  const ctx = { timeOfDay: aw.tod || timeOfDay(), mana: mana.value, appCategory: aw.category, moods: Object.fromEntries(Object.values(chars).map((c) => [c.id, c.mood.current])) };
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
function canReact(key) { const t = aw.lastReact[key] || 0; if (Date.now() - t < (cfg.awareness.reactCooldownSec || 120) * 1000) return false; aw.lastReact[key] = Date.now(); return true; }
function onAwareness(a) {
  hooks.emit('awareness', a);
  if (a.kind === 'app') {
    const changed = a.category !== aw.category; aw.app = a; aw.category = a.category; aw.stream = a.category === 'stream';
    for (const c of wives()) c.mood.react('app:' + a.category);
    if (changed && a.category !== 'other' && canReact('app:' + a.category)) {
      const w = pick(wives()); if (w) speak(w, 'app_' + a.category);
      sendEvent('app', { category: a.category, title: a.title, owner: a.owner });
      trigger('app:' + a.category);
    } else if (a.media && canReact('media:' + a.media.title)) { const w = pick(wives()); if (w) speak(w, 'media', { title: a.media.title }); }
  }
  if (a.kind === 'idle') {
    aw.idleSec = a.seconds;
    const longS = (cfg.awareness.idleLongMinutes || 5) * 60;
    if (a.seconds > longS && !aw.idleLongFired) { aw.idleLongFired = true; for (const c of wives()) c.mood.react('idle_long'); trigger('idle_long') || speak(pick(wives()), 'idle_long'); sendEvent('afk', { seconds: a.seconds }); }
    if (a.seconds < 10 && aw.idleLongFired) { aw.idleLongFired = false; for (const c of wives()) c.mood.react('back'); speak(pick(wives()), 'back'); trigger('back'); if (sleepMode && !sleepManual) setSleep(false); sendEvent('back'); }
    const night = cfg.sleep.autoAtNight && isSleepHour(new Date(), cfg.sleep.hours);
    const idleMin = a.seconds / 60;
    if (!sleepMode && (idleMin > cfg.sleep.idleMinutes || (night && idleMin > cfg.sleep.nightIdleMinutes))) setSleep(true);
  }
  if (a.kind === 'lock' || a.kind === 'suspend') { if (!sleepMode) setSleep(true); }
  if (a.kind === 'unlock' || a.kind === 'resume') { if (sleepMode && !sleepManual) setSleep(false); }
}
function setSleep(on, manual = false) {
  if (on === sleepMode) return; sleepMode = on; if (manual) sleepManual = on;
  if (on) { trigger('sleep'); for (const c of wives()) { c.queue = []; c.target = null; c.nextThink = 0; } speak(chars.noct || wives()[0], 'sleep'); sendEvent('sleep'); }
  else { for (const c of Object.values(chars)) if (c.state === 'sleep' || c.state === 'lay') c.enqueue([{ type: 'wake' }]); }
  hooks.emit('sleep', { on });
}
setInterval(() => {   // time of day + tick events
  const tod = timeOfDay();
  if (cfg.awareness.timeOfDay && tod !== aw.tod) { const first = aw.tod == null; aw.tod = tod; if (!first) { for (const c of wives()) c.mood.react(tod); speak(pick(wives()), tod); } }
  if (!sleepMode && !roomOpen) trigger('tick');
  hooks.emit('tick', { tod });
}, ((content && content.events && content.events.checkSec) || 60) * 1000);

// ---------------- cheats ----------------
function charArg(a) { const id = String(a || '').toLowerCase(); return chars[id] || Object.values(chars).find((c) => c.def.name.toLowerCase() === id) || null; }
function runCheat(c) {
  const [a0, a1] = c.args; const ch0 = charArg(a0);
  const ok = (m) => { chatLog('sys', '✔ ' + m); toast(m); };
  switch (c.cmd) {
    case 'help': chatLog('sys', Object.entries(COMMANDS).map(([k, v]) => `/${k} - ${v}`).join(' | ') + ' | word codes: MANAMANA ETERNALNIGHT GIMMEALL OURROOM SHOWMEBONES BEDTIME DEBUGMENU'); break;
    case 'fullmana': mana.fill(); ok('mana full'); break;
    case 'infmana': infinite = !infinite; mana.infinite = infinite; ok('infinite mana ' + (infinite ? 'ON' : 'OFF')); break;
    case 'mana': mana.value = clamp(+a0 || 0, 0, mana.max); ok('mana = ' + mana.value); break;
    case 'summon': { const p = summon(null, a0, a1 ? +a1 : undefined); p ? ok('summoned ' + a0) : ok('unknown prop ' + a0); break; }
    case 'dismiss': dismiss(a0 || 'all'); ok('dismissed'); break;
    case 'cast': { const ch = ch0 || wives()[0]; ch.enqueue([{ type: 'cast', effect: ch0 ? a1 : a0 }]); break; }
    case 'mood': if (ch0) { ch0.mood.set(a1, 300); ok(`${ch0.id} mood ${a1}`); } break;
    case 'say': if (ch0) ch0.enqueue([{ type: 'say', text: a1 || '' }]); break;
    case 'act': if (ch0) { let acts; try { const j = JSON.parse(a1); acts = (Array.isArray(j) ? j : [j]); acts = parseReply({ speaker: ch0.id, actions: acts }, content)[0]?.actions || []; } catch { const p = parseText(a1, content); acts = [p.text ? { type: 'say', text: p.text } : null, ...p.actions]; } ch0.enqueue(acts); } break;
    case 'spawnall': Object.keys(content.props).forEach((id, i) => summon(null, id, 60 + i * ((W - 120) / Math.max(1, Object.keys(content.props).length - 1)))); ok('all props'); break;
    case 'room': ipcRenderer.send('open-room', a0 || 'our_room'); break;
    case 'sleep': setSleep(!sleepMode, true); ok('sleep ' + sleepMode); break;
    case 'speed': speed = clamp(+a0 || 1, 0.1, 10); ok('speed x' + speed); break;
    case 'hitboxes': debugDraw = !debugDraw; ok('debug overlay ' + debugDraw); break;
    case 'debug': case 'devpanel': case 'debugmenu': toggleDebug(); break;
    case 'leave': { const g2 = chars[a0 || 'chrispyni']; if (g2) leave(g2); break; }
    case 'interact': if (ch0) ch0.enqueue([{ type: 'interact', kind: a1, with: c.args[2] }]); break;
    case 'play': if (ch0) { ch0.queue = []; ch0.play(a1, 3); } break;
    case 'reload': loadAll(); ok('content reloaded'); break;
    case 'resetsave': try { fs.unlinkSync(SAVE_PATH); } catch {} mana.fill(); props.length = 0; for (const ch of Object.values(chars)) ch.mood = new MoodState(ch.def.personality); ok('save reset'); break;
    case 'relay': try { applyReplies([JSON.parse(c.args[0])]); } catch { applyReplies([c.args[0]]); } break;
    case 'event': { const ev = events.get(a0); if (ev) runEvent(ev); else onAwareness({ kind: 'app', category: a0, title: 'test', owner: 'test' }); break; }
    case 'visit': visit(a0 || 'chrispyni'); break;
    default: hooks.emit('cheat:' + c.cmd, { args: c.args, chars, api: pluginApi() }); break;
  }
}

// ---------------- debug menu (auto-built from content) ----------------
let debugOpen = false;
function toggleDebug() { debugOpen = !debugOpen; $('debug').classList.toggle('hidden', !debugOpen); if (debugOpen) { buildDebug(); ipcRenderer.send('focus-overlay'); setCapture(true); } else setCapture(false); }
function btn(label, fn, cls) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.onclick = (e) => { e.stopPropagation(); fn(b); }; return b; }
function section(root, title) { const h = document.createElement('h3'); h.textContent = title; root.append(h); const d = document.createElement('div'); root.append(d); return d; }
function buildDebug() {
  const root = $('debug'); root.innerHTML = '';
  root.append(btn('✕ close', toggleDebug, 'close'));
  const t = document.createElement('b'); t.textContent = `DEBUG MENU · v${INIT.version} · mods: ${content.mods.map((m) => m.id + (m.enabled ? '' : '(off)')).join(', ') || 'none'}`; root.append(t);
  // Mana
  let s = section(root, 'Mana');
  s.append(btn('Fill', () => mana.fill()), btn('+10', () => mana.add(10)), btn('-10', () => mana.add(-10)), btn('Empty', () => { mana.value = 0; }),
    btn('∞ toggle', (b) => { infinite = !infinite; mana.infinite = infinite; b.classList.toggle('on', infinite); }, infinite ? 'on' : ''),
    btn('Ask for mana', () => askMana(pick(wives()))));
  // World
  s = section(root, 'World');
  s.append(btn('Hitboxes', (b) => { debugDraw = !debugDraw; b.classList.toggle('on', debugDraw); }, debugDraw ? 'on' : ''),
    btn('Sleep mode', () => setSleep(!sleepMode, true)), btn('Speed x1', () => { speed = 1; }), btn('x3', () => { speed = 3; }), btn('x0.3', () => { speed = 0.3; }),
    btn('Reload content', () => loadAll()), btn('Reset save', () => runCheat({ cmd: 'resetsave', args: [] })), btn('Open chat', openChat),
    btn('Dismiss all props', () => dismiss('all')), btn('Spawn all props', () => runCheat({ cmd: 'spawnall', args: [] })));
  for (const id of Object.keys(content.characters)) if (!chars[id]) s.append(btn(`Invite ${charName(id)}`, () => visit(id)));
  for (const c of Object.values(chars)) if (c.role === 'guest') s.append(btn(`${charName(c.id)} leaves`, () => leave(c)));
  // Rooms
  s = section(root, 'Rooms');
  for (const r of Object.values(content.rooms)) s.append(btn(`Go to ${r.name || r.id}`, () => ipcRenderer.send('open-room', r.id)));
  // Rare / weighted events
  s = section(root, 'Events (forced, ignores chance & cooldown)');
  for (const ev of Object.values(content.events)) if (ev && ev.steps) s.append(btn(`${ev.name || ev.id} [${ev.on || 'tick'} ${Math.round((ev.chance ?? 1) * 100)}%]`, () => runEvent(ev)));
  for (const cat of ['game', 'video', 'art', 'stream', 'chat', 'code']) s.append(btn(`aware: ${cat}`, () => { aw.lastReact = {}; onAwareness({ kind: 'app', category: cat, title: `test ${cat}`, owner: cat }); }));
  s.append(btn('aware: AFK', () => onAwareness({ kind: 'idle', seconds: 9999 })), btn('aware: back', () => { aw.idleLongFired = true; onAwareness({ kind: 'idle', seconds: 1 }); }));
  // Props
  s = section(root, 'Summon prop (costs mana unless ∞; debug = free)');
  for (const p of Object.values(content.props)) s.append(btn(`${p.name || p.id} (${p.manaCost || 0})`, () => summon(null, p.id)));
  // Per character
  for (const ch of Object.values(chars)) {
    const d = section(root, `${charName(ch.id)} (${ch.role}) - mood ${ch.mood.current}`);
    const h = (txt) => { const e = document.createElement('h4'); e.textContent = txt; d.append(e); };
    h('Animations (click = play, ⟳ = loop)');
    for (const an of Object.keys(ch.def.animations)) {
      d.append(btn(an, () => { ch.queue = []; ch.target = null; ch.loopAnim = null; ch.play(an, 3); }), btn('⟳', () => { ch.queue = []; ch.target = null; ch.loopAnim = ch.loopAnim === an ? null : an; ch.play(an); }));
    }
    h('Moods');
    const sel = document.createElement('select');
    for (const m of ch.mood.moods) { const o = document.createElement('option'); o.value = o.textContent = m; if (m === ch.mood.current) o.selected = true; sel.append(o); }
    sel.onchange = () => ch.mood.set(sel.value, 300); d.append(sel);
    h('Interactions');
    for (const it of Object.values(content.interactions)) {
      for (const o of Object.values(chars)) if (o !== ch && interactionAllowed(it, ch.id, o.id)) d.append(btn(`${it.name || it.id} → ${charName(o.id)}`, () => ch.enqueue([{ type: 'interact', kind: it.id, with: o.id }])));
      if (it.requires && !chars[it.requires] && ch.id !== it.requires) d.append(btn(`${it.name || it.id} → you (screen)`, () => ch.enqueue([{ type: 'interact', kind: it.id, with: it.requires }])));
    }
    h('Furniture');
    for (const p of Object.values(content.props)) {
      if (p.sittable) d.append(btn(`sit on ${p.id}`, () => { ch.queue = []; ch.enqueue([{ type: 'sit', on: p.id, summon: true }]); }));
      if (p.layable) d.append(btn(`lay on ${p.id}`, () => { ch.queue = []; ch.enqueue([{ type: 'lay', on: p.id, summon: true }]); }));
    }
    d.append(btn('sit on floor', () => ch.enqueue([{ type: 'sit', on: 'floor' }])), btn('lay on floor', () => ch.enqueue([{ type: 'lay', on: 'floor' }])), btn('stand up', () => standUp(ch)));
    h('Cast effect');
    for (const e of Object.values(content.effects)) d.append(btn(e.id, () => ch.enqueue([{ type: 'cast', effect: e.id }])));
    h('Move / talk');
    d.append(btn('walk left', () => ch.enqueue([{ type: 'walk_to', target: 'left' }])), btn('run right', () => ch.enqueue([{ type: 'run_to', target: 'right' }])),
      btn('jump', () => ch.enqueue([{ type: 'jump' }])), btn('idle line', () => speak(ch, 'idle')), btn('ask mana', () => askMana(ch)));
  }
}

// ---------------- toast / save ----------------
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 4000); }
let saveT;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 2000); }
function save() {
  try {
    fs.writeFileSync(SAVE_PATH, JSON.stringify({ v: 1, mana: mana.toJSON(), moods: Object.fromEntries(Object.values(chars).map((c) => [c.id, c.mood.toJSON()])),
      props: props.map((p) => ({ id: p.id, x: p.x / W, born: p.born })), savedAt: Date.now() }, null, 1));
  } catch (e) { console.error('save failed ' + e.message); }
}
function loadSave() {
  try {
    const s = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    if (s.mana) mana.value = clamp(s.mana.value, 0, mana.max);
    // offline time regenerates mana (slow, or sleep-rate if it was night)
    if (s.savedAt) mana.tick(Math.min(8 * 3600, (Date.now() - s.savedAt) / 1000), 'awake');
    for (const [id, m] of Object.entries(s.moods || {})) if (chars[id]) chars[id].mood.load(m);
    for (const p of s.props || []) if (content.props[p.id]) { const q = summon(null, p.id, p.x * W); if (q) q.born = p.born; }
    fx.length = 0;
  } catch {}
}
setInterval(save, 30000);

// ---------------- plugin API ----------------
function pluginApi() {
  return {
    version: INIT.version, on: (ev, fn) => hooks.on(ev, fn), log: (m) => ipcRenderer.send('log', '[plugin] ' + m),
    get content() { return content; }, get chars() { return chars; }, get mana() { return mana; }, get config() { return cfg; },
    say: (id, text) => chars[id] && chars[id].enqueue([{ type: 'say', text }]),
    act: (id, actions) => chars[id] && chars[id].enqueue(actions), speak: (id, trig) => speak(chars[id], trig),
    summon: (id, x) => summon(null, id, x), spawnEffect: spawnFx, toast, trigger, sendEvent,
    awareness: (ev) => onAwareness(ev), registerCheat: (name, desc, fn) => { COMMANDS[name] = desc; hooks.on('cheat:' + name, fn); },
    goToRoom, visit, setSleep,
  };
}

// ---------------- IPC from main ----------------
ipcRenderer.on('cmd', (_e, c) => {
  if (c.cmd === 'chat') { $('chat').classList.contains('hidden') ? openChat() : closeChat(); }
  if (c.cmd === 'sleep') setSleep(c.on, true);
  if (c.cmd === 'room') goToRoom();
  if (c.cmd === 'visit') visit(c.guest);
  if (c.cmd === 'debugmenu') toggleDebug();
});
ipcRenderer.on('awareness', (_e, a) => onAwareness(a));
ipcRenderer.on('relay-replies', (_e, r) => applyReplies(r));
ipcRenderer.on('relay-status', (_e, s) => { relayStatus = s; $('chatStatus').textContent = s.enabled ? (s.lastError ? `relay error: ${s.lastError}` : 'relay: connected to the real Nixie & Noct (replies can take a while)') : 'offline brain (relay off - tray > Relay)'; });
ipcRenderer.on('content-changed', () => { loadAll(); toast('Content reloaded'); });
ipcRenderer.on('config', (_e, c) => { cfg = c; });
ipcRenderer.on('toast', (_e, m) => toast(m));
ipcRenderer.on('workarea', (_e, wa) => { ground = wa.y + wa.height - INIT.bounds.y - (cfg.groundOffset || 0); });
ipcRenderer.on('room', (_e, r) => {
  roomOpen = r.open;
  for (const c of wives()) { c.hidden = r.open; }
  if (r.open) sendEvent('room', { room: r.room });
  else { for (const c of wives()) { c.mood.react('room'); } speak(chars.nixie, 'room_done'); saveSoon(); }
});
setInterval(() => ipcRenderer.send('mana', { value: mana.value, max: mana.max }), 500);

// ---------------- boot ----------------
(async function boot() {
  INIT = await ipcRenderer.invoke('init'); cfg = INIT.cfg;
  SAVE_PATH = path.join(INIT.dirs.user, 'save.json');
  W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
  const wa = INIT.workArea; ground = Math.min(H, wa.y + wa.height - INIT.bounds.y) - (cfg.groundOffset || 0);
  window.addEventListener('resize', () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; });
  mana = new Mana(cfg.mana);
  loadAll();
  const ids = (cfg.characters || ['nixie', 'noct']).filter((id) => content.characters[id]);
  ids.forEach((id, i) => addChar(id, W * (0.62 + i * 0.12), 'wife'));
  loadSave();
  aw.tod = timeOfDay();
  setTimeout(() => { speak(chars.nixie, 'greet'); setTimeout(() => speak(chars.noct, 'greet'), 2500); }, 1500);
  hooks.emit('ready', {});
  requestAnimationFrame(loop);
  if (INIT.demo || INIT.screenshot) demo();
})();

// test / screenshot scenario (PW_DEMO=1 or PW_SCREENSHOT=<dir>)
async function demo() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name, which = 'overlay') => { if (INIT.screenshot) await ipcRenderer.invoke('capture', which, path.join(INIT.screenshot, name)); };
  infinite = true; mana.infinite = true;
  const n = chars.nixie, o = chars.noct;
  summon(null, 'sofa', W * 0.45); summon(null, 'bed', W * 0.8); summon(null, 'table', W * 0.3); summon(null, 'teacup', W * 0.3); summon(null, 'candles', W * 0.36); summon(null, 'light_orb', W * 0.55);
  n.x = W * 0.42; o.x = W * 0.62; n.nextThink = o.nextThink = 1e12;
  n.say('Ta-da~ I summoned furniture! Sit with me, my queen~'); o.say('...Comfortable.');
  await sleep(1500); await shot('01_overlay_say.png');
  n.enqueue([{ type: 'sit', on: 'sofa' }]); o.enqueue([{ type: 'lay', on: 'bed' }]);
  await sleep(5000); debugDraw = true; await sleep(300); await shot('02_sit_lay_debug.png'); debugDraw = false;
  visit('chrispyni'); const c = chars.chrispyni; c.x = W * 0.5; c.queue = []; c.nextThink = 1e12;
  standUp(n); standUp(o); n.x = W * 0.43; o.x = W * 0.6;
  n.enqueue([{ type: 'interact', kind: 'hug', with: 'chrispyni' }]); o.enqueue([{ type: 'interact', kind: 'kiss', with: 'chrispyni' }]);
  await sleep(4000);
  await shot('03_hug_kiss_guest.png');
  toggleDebug(); await sleep(500); await shot('04_debug_menu.png'); toggleDebug();
  mana.infinite = infinite = false; mana.value = 12; askMana(n); await sleep(800); await shot('05_low_mana_ask.png');
  ipcRenderer.send('open-room', 'our_room'); await sleep(2500); await shot('06_room.png', 'room'); await sleep(6000); await shot('07_room_fade.png', 'room');
  if (INIT.screenshot) { save(); ipcRenderer.send('quit'); }
}
