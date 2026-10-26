// STUB (alpha): screen-capture awareness. Does nothing unless config.awareness.screenCapture = true,
// and even then only logs. A future version could send a low-res frame to the bot on request.
module.exports = { name: 'stub-screen-capture', setup(api) {
  api.on('tick', () => { if (api.config.awareness.screenCapture) api.log('screenCapture is ON but not implemented in alpha (no capture taken)'); });
} };
