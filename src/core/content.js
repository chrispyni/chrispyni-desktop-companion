// Data-driven content loader. Base content + mods (each mod can add or override anything).
'use strict';
const fs = require('fs');
const path = require('path');

const KINDS = ['characters', 'props', 'effects', 'rooms', 'lines'];

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }

function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

// Resolve every "*.png" style file field to an absolute path relative to the JSON file.
const FILE_KEYS = ['sheet', 'image', 'background', 'overlay', 'icon', 'sound', 'music'];
function resolveFiles(obj, dir) {
  for (const k of FILE_KEYS) {
    if (typeof obj[k] === 'string' && obj[k] && !path.isAbsolute(obj[k])) obj[k] = path.join(dir, obj[k]);
  }
  return obj;
}

/** Load one content root (base "content" dir or a mod dir). Returns partial content. */
function loadRoot(root, source) {
  const out = { characters: {}, props: {}, effects: {}, rooms: {}, lines: {}, plugins: [] };
  if (!fs.existsSync(root)) return out;
  // characters/<id>/character.json , rooms/<id>/room.json
  for (const [kind, file] of [['characters', 'character.json'], ['rooms', 'room.json']]) {
    const d = path.join(root, kind);
    if (!fs.existsSync(d)) continue;
    for (const id of fs.readdirSync(d)) {
      const f = path.join(d, id, file);
      if (fs.existsSync(f)) {
        try { const j = resolveFiles(readJSON(f), path.dirname(f)); j.id = j.id || id; j._source = source; out[kind][j.id] = j; }
        catch (e) { out._errors = (out._errors || []).concat(`${f}: ${e.message}`); }
      }
    }
  }
  // props/*.json, effects/*.json (one file may hold one object or {items:[...]})
  for (const kind of ['props', 'effects']) {
    const d = path.join(root, kind);
    if (!fs.existsSync(d)) continue;
    for (const fn of fs.readdirSync(d).filter((x) => x.endsWith('.json'))) {
      const f = path.join(d, fn);
      try {
        const j = readJSON(f);
        for (const it of Array.isArray(j.items) ? j.items : [j]) {
          resolveFiles(it, d); it._source = source; out[kind][it.id || fn.replace(/\.json$/, '')] = it;
        }
      } catch (e) { out._errors = (out._errors || []).concat(`${f}: ${e.message}`); }
    }
  }
  // lines/<charId>.json : { "<trigger>": ["line", ...] | {"<mood>": [...], "any": [...]} }
  const ld = path.join(root, 'lines');
  if (fs.existsSync(ld)) {
    for (const fn of fs.readdirSync(ld).filter((x) => x.endsWith('.json'))) {
      try { out.lines[fn.replace(/\.json$/, '')] = readJSON(path.join(ld, fn)); }
      catch (e) { out._errors = (out._errors || []).concat(`${fn}: ${e.message}`); }
    }
  }
  const pd = path.join(root, 'plugins');
  if (fs.existsSync(pd)) out.plugins = fs.readdirSync(pd).filter((x) => x.endsWith('.js')).map((x) => path.join(pd, x));
  return out;
}

// Line banks merge: arrays concatenate (mods ADD lines) unless the mod file has "_replace": true.
function mergeLines(base, add) {
  if (add && add._replace) { const c = { ...add }; delete c._replace; return c; }
  const out = { ...base };
  for (const [k, v] of Object.entries(add || {})) {
    if (Array.isArray(v)) out[k] = (Array.isArray(out[k]) ? out[k] : []).concat(v);
    else if (isObj(v)) out[k] = mergeLines(isObj(out[k]) ? out[k] : (Array.isArray(out[k]) ? { any: out[k] } : {}), v);
    else out[k] = v;
  }
  return out;
}

/** List mods in the given mod dirs, sorted by "priority" (low first, higher overrides). */
function listMods(modDirs) {
  const mods = [];
  for (const md of modDirs) {
    if (!md || !fs.existsSync(md)) continue;
    for (const name of fs.readdirSync(md)) {
      const dir = path.join(md, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      let meta = { id: name, name, priority: 100, enabled: true };
      const mf = path.join(dir, 'mod.json');
      if (fs.existsSync(mf)) { try { meta = { ...meta, ...readJSON(mf) }; } catch (e) { meta.error = e.message; } }
      if (name.startsWith('_') || name.startsWith('.')) meta.enabled = false; // "_disabled" convention
      mods.push({ ...meta, dir });
    }
  }
  return mods.sort((a, b) => (a.priority - b.priority) || a.id.localeCompare(b.id));
}

/** Full load: base content, then each enabled mod on top. Character/prop/effect/room JSON deep-merges. */
function loadContent(baseDir, modDirs = [], opts = {}) {
  const disabled = new Set(opts.disabledMods || []);
  const result = { characters: {}, props: {}, effects: {}, rooms: {}, lines: {}, plugins: [], mods: [], errors: [] };
  const apply = (part) => {
    for (const k of ['characters', 'props', 'effects', 'rooms']) {
      for (const [id, v] of Object.entries(part[k])) {
        if (v.remove) { delete result[k][id]; continue; }      // mods can delete: {"id":"x","remove":true}
        result[k][id] = result[k][id] ? deepMerge(result[k][id], v) : v;
      }
    }
    for (const [id, v] of Object.entries(part.lines)) result.lines[id] = mergeLines(result.lines[id] || {}, v);
    result.plugins.push(...part.plugins);
    result.errors.push(...(part._errors || []));
  };
  apply(loadRoot(baseDir, 'base'));
  for (const m of listMods(modDirs)) {
    const on = m.enabled !== false && !disabled.has(m.id);
    result.mods.push({ id: m.id, name: m.name, version: m.version, enabled: on, dir: m.dir, description: m.description });
    if (on) apply(loadRoot(m.dir, m.id));
  }
  return result;
}

module.exports = { loadContent, loadRoot, listMods, deepMerge, mergeLines, KINDS };
