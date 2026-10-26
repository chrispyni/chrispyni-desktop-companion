// Example plugin. Plugins are plain JS files: module.exports = { name, setup(api) }.
// Drop new ones in /plugins, %APPDATA%/Project Wives/plugins, or /mods/<mod>/plugins. Hot-reloads with content.
module.exports = {
  name: 'example-hello',
  setup(api) {
    // React to any hook: ready, tick, chat, awareness, summon, interact, poked, dragged, sleep, visit, rare_event, relay_reply, action, event
    api.on('poked', ({ char }) => { if (Math.random() < 0.1) api.spawnEffect('hearts', api.chars[char].x, api.chars[char].y - 120); });
    // Add your own cheat code: type /pat nixie
    api.registerCheat('pat', '/pat <char> head pats', ({ args }) => {
      const id = (args[0] || 'nixie').toLowerCase();
      api.act(id, [{ type: 'emote', anim: 'happy', sec: 2 }, { type: 'say', text: id === 'noct' ? '...Again.' : 'Hehe~ more pats!' }]);
      if (api.chars[id]) api.spawnEffect('hearts', api.chars[id].x, api.chars[id].y - 120);
    });
  },
};
