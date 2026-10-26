// Relay to the REAL Nixie & Noct (the bot), same pattern as the WoW companion:
// the app POSTs events to an "outbox" ntfy topic; the bot posts reply JSON to an "inbox" topic;
// the app polls the inbox. ntfy.sh is free and needs no account (topic name = the secret, keep it long).
'use strict';
const PROTOCOL_VERSION = 1;

function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/** App -> bot message. type: hello | chat | event | state */
function buildMessage(type, body = {}, state = {}) {
  return { v: PROTOCOL_VERSION, id: makeId(), ts: new Date().toISOString(), from: 'project-wives', type, ...body, state };
}

class NtfyRelay {
  /**
   * cfg: { enabled, server:"https://ntfy.sh", outboxTopic, inboxTopic, pollSeconds, token? }
   * fetchImpl injected for tests.
   */
  constructor(cfg = {}, fetchImpl = globalThis.fetch, log = () => {}) {
    this.cfg = cfg; this.fetch = fetchImpl; this.log = log;
    this.since = String(Math.floor(Date.now() / 1000)); this.seen = new Set(); this.lastOk = 0; this.lastError = null;
  }
  get enabled() { return !!(this.cfg.enabled && this.cfg.outboxTopic && this.cfg.inboxTopic); }
  url(topic) { return `${(this.cfg.server || 'https://ntfy.sh').replace(/\/$/, '')}/${encodeURIComponent(topic)}`; }
  headers(extra = {}) {
    const h = { 'User-Agent': 'ProjectWives', ...extra };
    if (this.cfg.token) h.Authorization = `Bearer ${this.cfg.token}`;
    return h;
  }
  async send(msg) {
    if (!this.enabled) return false;
    try {
      const r = await this.fetch(this.url(this.cfg.outboxTopic), { method: 'POST', body: JSON.stringify(msg), headers: this.headers({ 'Content-Type': 'application/json', Title: `PW ${msg.type}` }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this.lastOk = Date.now(); this.lastError = null; return true;
    } catch (e) { this.lastError = e.message; this.log('relay send failed: ' + e.message); return false; }
  }
  /** Returns raw reply payloads (objects or strings) newer than last poll. */
  async poll() {
    if (!this.enabled) return [];
    let raw;
    try {
      const r = await this.fetch(`${this.url(this.cfg.inboxTopic)}/json?poll=1&since=${encodeURIComponent(this.since)}`, { headers: this.headers() });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      raw = await r.text(); this.lastOk = Date.now(); this.lastError = null;
    } catch (e) { this.lastError = e.message; this.log('relay poll failed: ' + e.message); return []; }
    return parseNtfyStream(raw, this);
  }
}

function parseNtfyStream(raw, st) {
  const out = [];
  for (const line of String(raw).split('\n')) {
    if (!line.trim()) continue;
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.event !== 'message' || st.seen.has(ev.id)) continue;
    st.seen.add(ev.id); st.since = ev.id || st.since;
    const m = ev.message || '';
    try { out.push(JSON.parse(m)); } catch { out.push(m); }
  }
  return out;
}

module.exports = { NtfyRelay, buildMessage, parseNtfyStream, PROTOCOL_VERSION };
