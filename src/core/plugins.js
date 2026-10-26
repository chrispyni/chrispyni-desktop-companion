// Tiny plugin hook system. A plugin is a JS file exporting  function(api) { ... }  or {name, setup(api)}.
// Plugins live in /plugins, in /mods/<mod>/plugins, or in the user mods folder.
'use strict';
class Hooks {
  constructor(log = console.log) { this.handlers = {}; this.log = log; }
  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn); }
  emit(ev, data) {
    let res = [];
    for (const fn of [...(this.handlers[ev] || []), ...(this.handlers['*'] || [])]) {
      try { const r = fn(data, ev); if (r !== undefined) res.push(r); } catch (e) { this.log(`plugin error on ${ev}: ${e.message}`); }
    }
    return res;
  }
  clear() { this.handlers = {}; }
}

function loadPlugins(files, api, log = console.log) {
  const loaded = [];
  for (const f of files) {
    try {
      delete require.cache[require.resolve(f)];
      const m = require(f);
      const setup = typeof m === 'function' ? m : m && m.setup;
      if (!setup) { log(`plugin ${f}: no setup()`); continue; }
      setup(api);
      loaded.push(m.name || require('path').basename(f));
    } catch (e) { log(`plugin ${f} failed: ${e.message}`); }
  }
  return loaded;
}
module.exports = { Hooks, loadPlugins };
