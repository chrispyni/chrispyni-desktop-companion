// "Our room": cozy bedroom scene. The three of them cuddle, fade to dark with hearts & stars; restores mana.
'use strict';
const { ipcRenderer } = require('electron');
const { loadContent } = require('../core/content');
const cv = document.getElementById('c'); const g = cv.getContext('2d');
const roomId = new URLSearchParams(location.search).get('room') || 'our_room';
let content, room, bg, ov, t = 0, mana = { value: 0, max: 100 }, fullAt = 0;
const imgs = {}; const im = (p) => imgs[p] || (imgs[p] = Object.assign(new Image(), { src: 'file:///' + p.replace(/\\/g, '/') }));
const LINES = [['Nixie', 'Our room~ finally. Me first. ...Okay, you in the middle.'], ['Noct', 'Lie down, my love.'], ['Nixie', 'Shh. Cuddles now.'], ['Noct', '...Warm.']];
const parts = Array.from({ length: 40 }, () => ({ x: Math.random() * 320, y: 180 + Math.random() * 180, s: 0.3 + Math.random(), k: Math.random() < 0.5 ? 'h' : 's' }));
function heart(x, y, c) { g.fillStyle = c; [[0,0],[2,0],[-1,1],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[1,3]].forEach(([a,b]) => g.fillRect(Math.round(x+a), Math.round(y+b), 1, 1)); }
(async () => {
  const init = await ipcRenderer.invoke('init');
  content = loadContent(init.dirs.base, init.dirs.mods, { disabledMods: init.cfg.disabledMods });
  room = content.rooms[roomId] || Object.values(content.rooms)[0];
  cv.width = room.size.w; cv.height = room.size.h;
  bg = im(room.background); ov = room.overlay && im(room.overlay);
  let last = performance.now();
  requestAnimationFrame(function f(now) { const dt = (now - last) / 1000; last = now; t += dt; draw(dt); requestAnimationFrame(f); });
})();
ipcRenderer.on('mana', (_e, m) => { mana = m; });
document.getElementById('leave').onclick = () => window.close();
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close(); });
function draw(dt) {
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
  if (bg.complete) g.drawImage(bg, 0, 0);
  for (const rp of room.props || []) {
    const d = content.props[rp.id]; if (!d) continue; const f = Math.floor(t * (d.fps || 1)) % (d.frames || 1);
    g.drawImage(im(d.image), f * d.frame.w, 0, d.frame.w, d.frame.h, rp.x - d.anchor.x, rp.y - d.anchor.y + (d.float ? Math.sin(t * 2) * 2 : 0), d.frame.w, d.frame.h);
  }
  if (ov && ov.complete) { g.save(); g.translate(0, Math.sin(t * 1.5) * 0.5); g.drawImage(ov, 0, 0); g.restore(); }
  // candle glow flicker
  g.fillStyle = `rgba(255,170,80,${0.05 + Math.sin(t * 7) * 0.02})`; g.fillRect(0, 0, cv.width, cv.height);
  const fadeStart = room.fadeAfterSec || 6, fade = Math.min(1, Math.max(0, (t - fadeStart) / 3));
  if (fade > 0) {
    g.fillStyle = `rgba(4,0,10,${fade * 0.93})`; g.fillRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.y -= p.s * 12 * dt; if (p.y < -5) { p.y = cv.height + 5; p.x = Math.random() * cv.width; }
      if (p.k === 'h') heart(p.x, p.y, `rgba(255,111,168,${fade})`); else { g.fillStyle = `rgba(255,236,160,${fade * (0.5 + 0.5 * Math.sin(t * 3 + p.x))})`; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    }
  }
  const li = Math.floor(t / 2.6);
  document.getElementById('txt').textContent = li < LINES.length ? `${LINES[li][0]}: ${LINES[li][1]}` : mana.value >= mana.max ? 'Mana fully restored 💜 (click ✕ or Esc)' : 'mana replenishing…';
  document.getElementById('fill').style.width = (mana.value / mana.max * 100) + '%';
  if (mana.value >= mana.max - 0.01) { if (!fullAt) fullAt = t; if (t - fullAt > 4 && !init_screenshot()) window.close(); }
}
function init_screenshot() { return !!process.env.PW_SCREENSHOT; }
