// Awareness classification (pure): turns raw window/app info into events the wives react to.
'use strict';
const DEFAULT_CATEGORIES = {
  game: ['wow\\.exe', 'world of warcraft', 'steam', 'epicgames', 'league of legends', 'valorant', 'minecraft', 'baldur', 'elden ring', 'genshin', 'ffxiv'],
  video: ['youtube', 'twitch\\.tv', 'netflix', 'crunchyroll', 'vlc', 'mpc-hc'],
  art: ['blender', 'photoshop', 'aseprite', 'clip studio', 'krita', 'piskel', 'vroid', 'unity', 'live2d', 'vtube studio'],
  stream: ['obs', 'streamlabs', 'vtube studio', 'twitch dashboard'],
  chat: ['discord', 'telegram', 'slack'],
  code: ['visual studio code', 'code\\.exe', 'cursor'],
  browser: ['chrome', 'firefox', 'msedge', 'opera'],
};
function classifyApp(info = {}, cats = DEFAULT_CATEGORIES) {
  const hay = `${info.title || ''} ${info.owner || ''} ${info.process || ''}`.toLowerCase();
  for (const [cat, pats] of Object.entries(cats)) if (pats.some((p) => new RegExp(p, 'i').test(hay))) return cat;
  return 'other';
}
function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'late_night' : h < 11 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';
}
function isSleepHour(d = new Date(), range = [1, 8]) {
  const h = d.getHours(); const [a, b] = range; return a <= b ? h >= a && h < b : h >= a || h < b;
}
module.exports = { classifyApp, timeOfDay, isSleepHour, DEFAULT_CATEGORIES };
