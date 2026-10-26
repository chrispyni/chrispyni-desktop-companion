// Project Wives - Electron main process: windows, tray, hotkeys, awareness, relay, updates, hot reload.
'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, powerMonitor, shell, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { NtfyRelay } = require('./core/relay');
const { classifyApp } = require('./core/awareness');
const { deepMerge } = require('./core/content');

const DEV_ROOT = path.join(__dirname, '..');
const APP_ROOT = app.isPackaged ? process.resourcesPath : DEV_ROOT;
const USER_DIR = process.env.PW_USER_DIR || path.join(app.getPath('appData'), 'Project Wives');
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || '';
const PKG = require('../package.json');
fs.mkdirSync(path.join(USER_DIR, 'mods'), { recursive: true });

const LOG = path.join(USER_DIR, 'project-wives.log');
function log(...a) { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); try { fs.appendFileSync(LOG, s + '\n'); } catch {} }

// ---------- config ----------
let cfg;
function loadConfig() {
  const def = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config.example.json'), 'utf8'));
  const p = path.join(USER_DIR, 'config.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(def, null, 2));
  let user = {};
  try { user = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { log('config.json invalid: ' + e.message); }
  cfg = deepMerge(def, user);
  return cfg;
}
function saveConfig() {
  const p = path.join(USER_DIR, 'config.json');
  let user = {}; try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  user.awareness = cfg.awareness; user.relay = cfg.relay; user.debug = cfg.debug;
  fs.writeFileSync(p, JSON.stringify(user, null, 2));
}
loadConfig();

function contentDirs() {
  return {
    base: path.join(APP_ROOT, 'content'),
    mods: [path.join(APP_ROOT, 'mods'), path.join(USER_DIR, 'mods'), PORTABLE_DIR && path.join(PORTABLE_DIR, 'mods')].filter(Boolean),
    plugins: [path.join(APP_ROOT, 'plugins'), path.join(USER_DIR, 'plugins')],
    user: USER_DIR, appRoot: APP_ROOT,
  };
}

// ---------- windows ----------
let overlay, roomWin, tray;
const send = (ch, data) => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send(ch, data); };

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  const b = process.env.PW_SIZE ? { x: 0, y: 0, width: +process.env.PW_SIZE.split('x')[0], height: +process.env.PW_SIZE.split('x')[1] } : d.bounds;
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: true, show: false, backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.webContents.on('console-message', (_e, _l, m) => { if (/error|fail/i.test(m)) log('[overlay]', m); });
}

function openRoom(roomId = 'our_room') {
  if (roomWin && !roomWin.isDestroyed()) { roomWin.focus(); return; }
  const d = screen.getPrimaryDisplay().workArea;
  const w = Math.min(960, d.width), h = Math.round(w * 9 / 16);
  roomWin = new BrowserWindow({ width: w, height: h, x: d.x + Math.round((d.width - w) / 2), y: d.y + Math.round((d.height - h) / 2),
    frame: false, resizable: true, alwaysOnTop: true, backgroundColor: '#000000', title: 'Our Room',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  roomWin.setAlwaysOnTop(true, 'screen-saver', 1);
  roomWin.once('ready-to-show', () => { roomWin.show(); roomWin.moveTop(); roomWin.focus(); });
  roomWin.loadFile(path.join(__dirname, 'renderer', 'room.html'), { query: { room: roomId } });
  roomWin.webContents.on('console-message', (_e, _l, m) => log('[room]', m));
  send('room', { open: true, room: roomId });
  roomWin.on('closed', () => { roomWin = null; send('room', { open: false, room: roomId }); });
}

// ---------- IPC ----------
let capture = false;
ipcMain.on('set-capture', (_e, on) => {
  if (!overlay || on === capture) return; capture = on;
  overlay.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('focus-overlay', () => { if (overlay) { overlay.setIgnoreMouseEvents(false); capture = true; overlay.focus(); } });
ipcMain.on('blur-overlay', () => { if (overlay) overlay.blur(); });
ipcMain.on('open-room', (_e, id) => openRoom(id));
ipcMain.on('close-room', () => { if (roomWin) roomWin.close(); });
ipcMain.on('mana', (_e, m) => { if (roomWin && !roomWin.isDestroyed()) roomWin.webContents.send('mana', m); });
ipcMain.on('relay-send', (_e, msg) => relay.send(msg));
ipcMain.on('set-sleep', (_e, on) => { sleepManual = on; buildTray(); });
ipcMain.on('log', (_e, m) => log('[renderer]', m));
ipcMain.on('open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('init', () => ({
  cfg, dirs: contentDirs(), version: PKG.version, platform: process.platform,
  identity: { username: os.userInfo().username, hostname: os.hostname() },
  workArea: screen.getPrimaryDisplay().workArea, bounds: screen.getPrimaryDisplay().bounds,
  screenshot: process.env.PW_SCREENSHOT || '', demo: !!process.env.PW_DEMO,
}));
ipcMain.handle('capture', async (_e, which, file) => {
  const w = which === 'room' ? roomWin : overlay; if (!w) return false;
  const img = await w.webContents.capturePage(); fs.writeFileSync(file, img.toPNG()); return true;
});
ipcMain.on('quit', () => app.quit());

// ---------- tray ----------
let sleepManual = false;
function toggle(key) { cfg.awareness[key] = !cfg.awareness[key]; saveConfig(); send('config', cfg); buildTray(); }
function buildTray() {
  if (!tray) return;
  const a = cfg.awareness;
  const menu = Menu.buildFromTemplate([
    { label: `Project Wives ${PKG.version}`, enabled: false },
    { label: 'Talk to them…', accelerator: cfg.hotkeys.chat, click: () => send('cmd', { cmd: 'chat' }) },
    { label: 'Sleep together (sleep mode)', type: 'checkbox', checked: sleepManual, click: () => { sleepManual = !sleepManual; send('cmd', { cmd: 'sleep', on: sleepManual }); buildTray(); } },
    { label: 'Go to our room (mana)', click: () => send('cmd', { cmd: 'room' }) },
    { label: 'Invite ChrispyNi (guest)', click: () => send('cmd', { cmd: 'visit', guest: 'chrispyni' }) },
    { label: 'Debug menu', accelerator: cfg.hotkeys.debug, click: () => send('cmd', { cmd: 'debugmenu' }) },
    { type: 'separator' },
    { label: 'Awareness', submenu: [
      { label: 'Active window / app', type: 'checkbox', checked: a.activeWindow, click: () => toggle('activeWindow') },
      { label: 'Idle time (AFK)', type: 'checkbox', checked: a.idle, click: () => toggle('idle') },
      { label: 'Time of day', type: 'checkbox', checked: a.timeOfDay, click: () => toggle('timeOfDay') },
      { label: 'Media title', type: 'checkbox', checked: a.media, click: () => toggle('media') },
      { label: 'Screen capture (stub, off)', type: 'checkbox', checked: a.screenCapture, click: () => toggle('screenCapture') },
      { label: 'Microphone (stub, off)', type: 'checkbox', checked: a.microphone, click: () => toggle('microphone') },
    ] },
    { label: 'Relay to the real Nixie & Noct', type: 'checkbox', checked: !!cfg.relay.enabled, click: () => { cfg.relay.enabled = !cfg.relay.enabled; saveConfig(); relay.cfg = cfg.relay; send('config', cfg); buildTray(); } },
    { label: 'Settings / folders', submenu: [
      { label: 'Open config.json', click: () => shell.openPath(path.join(USER_DIR, 'config.json')) },
      { label: 'Open my mods folder', click: () => shell.openPath(path.join(USER_DIR, 'mods')) },
      { label: 'Open built-in content', click: () => shell.openPath(path.join(APP_ROOT, 'content')) },
      { label: 'Open sprite templates', click: () => shell.openPath(path.join(APP_ROOT, 'templates')) },
      { label: 'Open log', click: () => shell.openPath(LOG) },
      { label: 'Reload config + content', click: () => { loadConfig(); relay.cfg = cfg.relay; send('config', cfg); send('content-changed'); buildTray(); } },
    ] },
    { label: updateInfo ? `Update available: ${updateInfo.version}` : 'Check for updates', click: () => updateInfo && updateInfo.download ? shell.openExternal(updateInfo.download) : checkUpdate(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu); tray.setToolTip('Project Wives - Nixie & Noct');
}

// ---------- awareness ----------
let lastApp = '', awTimer, winWatcher = null, latestWin = null;
// Windows: a tiny read-only PowerShell watcher (no native modules needed). Elsewhere: xdotool if present.
function startWinWatcher() {
  if (winWatcher || !cfg.awareness.activeWindow) return;
  const { spawn } = require('child_process');
  try {
    if (process.platform === 'win32') {
      const ps1 = path.join(__dirname, 'win-awareness.ps1').replace('app.asar', 'app.asar.unpacked');
      winWatcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1, '-Seconds', String(Math.max(2, cfg.awareness.pollSeconds || 5))], { windowsHide: true });
      let buf = '';
      winWatcher.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { latestWin = JSON.parse(l); } catch {} } });
      winWatcher.on('exit', () => { winWatcher = null; });
    }
  } catch (e) { log('window watcher failed: ' + e.message); }
}
async function getActiveWindow() {
  if (process.platform === 'win32') { startWinWatcher(); return latestWin; }
  try {
    const { execFileSync } = require('child_process');
    const title = execFileSync('xdotool', ['getactivewindow', 'getwindowname'], { timeout: 1000 }).toString().trim();
    return { title, owner: '', process: '' };
  } catch { return null; }
}
function mediaFromTitle(t = '') {
  let m;
  if ((m = t.match(/^(.*?) - YouTube/))) return { source: 'YouTube', title: m[1] };
  if ((m = t.match(/^(.*?) - Twitch/))) return { source: 'Twitch', title: m[1] };
  if ((m = t.match(/^(.+ - .+)$/)) && /spotify/i.test(t)) return { source: 'Spotify', title: m[1] };
  return null;
}
async function pollAwareness() {
  const a = cfg.awareness;
  try {
    if (a.activeWindow) {
      const w = await getActiveWindow();
      if (w) {
        const info = { title: w.title || '', owner: w.owner || '', process: w.process || '' };
        const key = info.owner + '|' + info.title;
        if (key !== lastApp && !/project wives|electron/i.test(info.owner || '')) {
          lastApp = key;
          const category = classifyApp(info, Object.keys(a.categories || {}).length ? { ...require('./core/awareness').DEFAULT_CATEGORIES, ...a.categories } : undefined);
          const media = a.media ? mediaFromTitle(info.title) : null;
          send('awareness', { kind: 'app', ...info, category, media });
        }
      }
    }
    if (a.idle) {
      const idle = powerMonitor.getSystemIdleTime();
      send('awareness', { kind: 'idle', seconds: idle, state: powerMonitor.getSystemIdleState(60) });
    }
  } catch (e) { log('awareness error: ' + e.message); }
}

// ---------- relay ----------
const relay = new NtfyRelay(cfg.relay, globalThis.fetch, log);
let relayTimer;
async function pollRelay() {
  if (relay.enabled) { const r = await relay.poll(); if (r.length) send('relay-replies', r); }
  send('relay-status', { enabled: relay.enabled, lastOk: relay.lastOk, lastError: relay.lastError });
  relayTimer = setTimeout(pollRelay, Math.max(2, cfg.relay.pollSeconds || 5) * 1000);
}

// ---------- updates ----------
let updateInfo = null;
function cmpVer(a, b) {
  const pa = String(a).split(/[.-]/), pb = String(b).split(/[.-]/);
  for (let i = 0; i < 3; i++) { const d = (parseInt(pa[i]) || 0) - (parseInt(pb[i]) || 0); if (d) return d; }
  return 0;
}
async function checkUpdate(manual) {
  const u = cfg.update && cfg.update.url; if (!u) { if (manual) send('toast', 'No update URL set (config.json > update.url). Check the Drive Releases folder.'); return; }
  try {
    const j = /^https?:/.test(u) ? await (await fetch(u)).json() : JSON.parse(fs.readFileSync(u, 'utf8'));
    if (cmpVer(j.version, PKG.version) > 0) { updateInfo = j; send('toast', `Update ${j.version} available! Tray > Update.`); buildTray(); }
    else if (manual) send('toast', `You're up to date (${PKG.version}).`);
  } catch (e) { log('update check failed: ' + e.message); if (manual) send('toast', 'Update check failed: ' + e.message); }
}

// ---------- hot reload ----------
function watchContent() {
  const d = contentDirs(); let t;
  for (const dir of [d.base, ...d.mods, ...d.plugins]) {
    if (!fs.existsSync(dir)) continue;
    try { fs.watch(dir, { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => send('content-changed'), 600); }); }
    catch (e) { log('watch failed (hot reload off for ' + dir + '): ' + e.message); }
  }
}

// ---------- app ----------
if (!app.requestSingleInstanceLock() && !process.env.PW_SCREENSHOT) app.quit();
app.whenReady().then(() => {
  createOverlay();
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'tray.png'));
    tray = new Tray(icon); buildTray();
    tray.on('click', () => send('cmd', { cmd: 'chat' }));
  } catch (e) { log('tray failed: ' + e.message); }
  const reg = (acc, fn) => { try { if (acc) globalShortcut.register(acc, fn); } catch (e) { log('hotkey ' + acc + ' failed'); } };
  reg(cfg.hotkeys.chat, () => send('cmd', { cmd: 'chat' }));
  reg(cfg.hotkeys.debug, () => send('cmd', { cmd: 'debugmenu' }));
  reg(cfg.hotkeys.sleep, () => { sleepManual = !sleepManual; send('cmd', { cmd: 'sleep', on: sleepManual }); buildTray(); });
  powerMonitor.on('lock-screen', () => send('awareness', { kind: 'lock' }));
  powerMonitor.on('unlock-screen', () => send('awareness', { kind: 'unlock' }));
  powerMonitor.on('suspend', () => send('awareness', { kind: 'suspend' }));
  powerMonitor.on('resume', () => send('awareness', { kind: 'resume' }));
  awTimer = setInterval(pollAwareness, Math.max(2, cfg.awareness.pollSeconds || 5) * 1000);
  setTimeout(pollRelay, 3000);
  watchContent();
  if (cfg.update.checkOnStart) setTimeout(() => checkUpdate(false), 8000);
  screen.on('display-metrics-changed', () => send('workarea', screen.getPrimaryDisplay().workArea));
  log(`started ${PKG.version} root=${APP_ROOT} user=${USER_DIR}`);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (winWatcher) winWatcher.kill(); });
app.on('window-all-closed', () => app.quit());
module.exports = { openRoom };
