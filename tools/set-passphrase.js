#!/usr/bin/env node
// Sets the admin passphrase (stores only a salted scrypt hash) in your config.json.
// Usage: node tools/set-passphrase.js "my secret"  [path/to/config.json]
// Default config path: %APPDATA%/Project Wives/config.json (Windows) or ~/.config/Project Wives/config.json
const fs = require('fs'); const os = require('os'); const path = require('path');
const { hashPassphrase } = require('../src/core/admin');
const pass = process.argv[2]; if (!pass) { console.error('usage: set-passphrase "<passphrase>" [config.json]'); process.exit(1); }
const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : path.join(os.homedir(), '.config'));
const p = process.argv[3] || path.join(appData, 'Project Wives', 'config.json');
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
cfg.admin = cfg.admin || {}; cfg.admin.passphrase = hashPassphrase(pass);
fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
console.log('passphrase hash saved to ' + p + ' (set "adminGateEnabled": true to require admin for cheats)');
