// STUB (alpha): microphone awareness / voice chat. Off by default; only logs when enabled. Nothing is recorded.
module.exports = { name: 'stub-microphone', setup(api) {
  api.on('ready', () => { if (api.config.awareness.microphone) api.log('microphone is ON but not implemented in alpha (nothing recorded)'); });
} };
