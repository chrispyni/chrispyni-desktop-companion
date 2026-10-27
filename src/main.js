// ChrispyNi Desktop Companion - Electron main process: windows, tray, hotkeys, awareness, updates, hot reload.
'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, powerMonitor, shell, nativeImage, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyApp } = require('./core/awareness');
const { deepMerge } = require('./core/content');
const { resolveEdition, editionDir } = require('./core/edition');

// ---------- self-contained layout: EVERYTHING lives next to the exe (like a game) ----------
//  ChrispyNi Desktop Companion/  ChrispyNi Desktop Companion.exe  content/  mods/  templates/  data/  logs/  cache/
const DEV_ROOT = path.join(__dirname, '..');
const APP_ROOT = process.env.PW_ROOT || (app.isPackaged ? path.dirname(process.execPath) : DEV_ROOT);
const EDITION = resolveEdition(APP_ROOT);
const DATA_DIR = path.join(APP_ROOT, EDITION.dataDir || 'data');     // config.json, save.json (per edition)
const LOG_DIR = path.join(APP_ROOT, 'logs');
const CACHE_DIR = path.join(APP_ROOT, 'cache');   // Chromium profile, GPU/code cache, temp
const USER_DIR = DATA_DIR;
const PKG = require('../package.json');
app.setName(EDITION.productName || 'ChrispyNi Desktop Companion');
if (process.platform === 'win32') app.setAppUserModelId(EDITION.appId || 'com.chrispyni.desktopcompanion');

function ensureWritable() {
  try {
    for (const d of [DATA_DIR, LOG_DIR, CACHE_DIR, path.join(CACHE_DIR, 'temp'), path.join(APP_ROOT, 'mods')]) fs.mkdirSync(d, { recursive: true });
    const t = path.join(DATA_DIR, '.write-test'); fs.writeFileSync(t, 'ok'); fs.unlinkSync(t);
    return true;
  } catch (e) { return e; }
}
const writable = ensureWritable();
if (writable === true) {
  // Point every Electron/Chromium path into the app folder BEFORE app is ready.
  const TEMP = path.join(CACHE_DIR, 'temp');
  app.setPath('appData', CACHE_DIR);
  app.setPath('userData', path.join(CACHE_DIR, 'chromium'));
  app.setPath('sessionData', path.join(CACHE_DIR, 'chromium'));
  app.setPath('logs', LOG_DIR);
  app.setPath('crashDumps', path.join(LOG_DIR, 'crashes'));
  app.setPath('temp', TEMP);
  app.commandLine.appendSwitch('disk-cache-dir', path.join(CACHE_DIR, 'disk'));
  app.commandLine.appendSwitch('user-data-dir', path.join(CACHE_DIR, 'chromium'));
  process.env.TEMP = process.env.TMP = process.env.TMPDIR = TEMP;   // child processes (PowerShell watcher) use it too
}

const LOG = path.join(LOG_DIR, 'companion.log');
function log(...a) { const s = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(s); if (writable === true) try { fs.appendFileSync(LOG, s + '\n'); } catch {} }

// ---------- config ----------
let cfg;
function loadConfig() {
  const def = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'config.example.json'), 'utf8'));
  const p = path.join(USER_DIR, 'config.json');
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(def, null, 2));
  let user = {};
  try { user = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { log('config.json invalid: ' + e.message); }
  if ((user._v || 1) < (def._v || 1)) {   // older config copies: take the new mana/talk balance, keep everything else
    delete user.mana; delete user.talk; user._v = def._v;
    try { fs.writeFileSync(p, JSON.stringify(user, null, 2)); } catch {}
  }
  cfg = deepMerge(def, user);
  cfg.edition = EDITION.id;
  if (!cfg.characters || !cfg.characters.length) cfg.characters = EDITION.characters.slice();
  if (!cfg.guests || !cfg.guests.length) cfg.guests = (EDITION.guests || []).slice();
  return cfg;
}
function saveConfig() {
  const p = path.join(USER_DIR, 'config.json');
  let user = {}; try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  user.awareness = cfg.awareness; delete user.relay; user.debug = cfg.debug;
  fs.writeFileSync(p, JSON.stringify(user, null, 2));
}
try { loadConfig(); } catch (e) { cfg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "config.example.json"), "utf8")); }

function contentDirs() {
  return {
    base: path.join(APP_ROOT, 'content'),
    edition: editionDir(APP_ROOT, EDITION) || editionDir(DEV_ROOT, EDITION),
    editionId: EDITION.id,
    mods: [path.join(APP_ROOT, 'mods')],
    plugins: [],   // JS plugins are disabled: mods are data-only
    user: USER_DIR, appRoot: APP_ROOT,
  };
}

// ---------- windows ----------
// Hardening: only our local files are ever loaded; no navigation, no popups, no permissions (camera, mic, etc).
function harden(win) {
  const wc = win.webContents;
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('will-redirect', (e) => e.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  wc.session.setPermissionCheckHandler(() => false);
}
const fromOurWindow = (e) => { const u = e.senderFrame && e.senderFrame.url; return !!u && u.startsWith('file:'); };
let overlay, roomWin, tray;
const send = (ch, data) => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send(ch, data); };

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  const b = process.env.PW_SIZE ? { x: 0, y: 0, width: +process.env.PW_SIZE.split('x')[0], height: +process.env.PW_SIZE.split('x')[1] } : d.bounds;
  overlay = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height, transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false,   // never steals focus (fullscreen video stays fullscreen)
    show: false, backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver'); harden(overlay);
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay.showInactive());
  overlay.webContents.setZoomFactor(1);
  overlay.on('blur', () => send('overlay-blur'));
  // Cursor polling (DIP, window-relative): keeps the click-through state right even without mouse events.
  setInterval(() => {
    if (!overlay || overlay.isDestroyed()) return;
    const p = screen.getCursorScreenPoint(), wb = overlay.getBounds();
    send('cursor', { x: p.x - wb.x, y: p.y - wb.y, down: false });
  }, 80);
  overlay.webContents.on('console-message', (_e, _l, m) => { if (/error|fail/i.test(m)) log('[overlay]', m); });
}

function openRoom(roomId = 'our_room', who = ['nixie', 'noct']) {
  if (roomWin && !roomWin.isDestroyed()) { roomWin.focus(); return; }
  const d = screen.getPrimaryDisplay().workArea;
  const w = Math.min(960, d.width), h = Math.round(w * 9 / 16);
  roomWin = new BrowserWindow({ width: w, height: h, x: d.x + Math.round((d.width - w) / 2), y: d.y + Math.round((d.height - h) / 2),
    frame: false, resizable: true, alwaysOnTop: true, backgroundColor: '#000000', title: 'Our Room',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
  roomWin.setAlwaysOnTop(true, 'screen-saver', 1); harden(roomWin);
  roomWin.once('ready-to-show', () => { roomWin.show(); roomWin.moveTop(); roomWin.focus(); });
  roomWin.loadFile(path.join(__dirname, 'renderer', 'room.html'), { query: { room: roomId, who: (who || []).join(',') } });
  roomWin.webContents.on('console-message', (_e, _l, m) => log('[room]', m));
  send('room', { open: true, room: roomId, who });
  roomWin.on('closed', () => { roomWin = null; send('room', { open: false, room: roomId, who }); });
}

// ---------- IPC ----------
let capture = false;
ipcMain.on('set-capture', (_e, on) => {
  if (!overlay || on === capture) return; capture = on;
  overlay.setIgnoreMouseEvents(!on, { forward: true });
});
// Focus for typing only. Mouse capture stays per-region (set-capture), so the desktop behind is never blocked.
// The overlay is focusable ONLY while the chat input / debug panel is open; clicks on sprites, props, menus and
// bubble buttons never activate it, so a fullscreen video in another app keeps fullscreen + focus.
ipcMain.on('focus-overlay', () => { if (!overlay) return; overlay.setFocusable(true); overlay.focus(); });
ipcMain.on('blur-overlay', () => { if (!overlay) return; overlay.blur(); overlay.setFocusable(false); overlay.setAlwaysOnTop(true, 'screen-saver'); });
// Global click / Esc watcher (Windows): lets menus close when you click another app or the desktop,
// without the overlay ever taking focus. Runs only while a menu or popup is open.
let clickWatcher = null;
function startClickWatcher() {
  if (clickWatcher || process.platform !== 'win32') return;
  try {
    const { spawn } = require('child_process');
    const ps1 = path.join(__dirname, 'win-clicks.ps1').replace('app.asar', 'app.asar.unpacked');
    clickWatcher = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1], { windowsHide: true });
    let buf = '';
    clickWatcher.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l || !overlay) continue;
      const p = screen.getCursorScreenPoint(), wb = overlay.getBounds(); send('global-input', { key: l, x: p.x - wb.x, y: p.y - wb.y }); } });
    clickWatcher.on('exit', () => { clickWatcher = null; });
  } catch (e) { log('click watcher failed: ' + e.message); }
}
function stopClickWatcher() { if (clickWatcher) { try { clickWatcher.kill(); } catch {} clickWatcher = null; } }
ipcMain.on('menus-open', (_e, on) => on ? startClickWatcher() : stopClickWatcher());
ipcMain.on('open-room', (e, id, who) => { if (!fromOurWindow(e) || !/^[a-z0-9_-]{1,40}$/i.test(String(id))) return; openRoom(id, (Array.isArray(who) ? who : []).filter((w) => /^[a-z0-9_-]{1,40}$/i.test(String(w))).slice(0, 4)); });
ipcMain.on('close-room', () => { if (roomWin) roomWin.close(); });
ipcMain.on('mana', (_e, m) => { if (roomWin && !roomWin.isDestroyed()) roomWin.webContents.send('mana', m); });
// While they sleep, watch the system idle time (like a monitor's power saving): any mouse move, click or key
// anywhere resets it, and they wake. No hooks, no focus, no key contents.
let sleepWatch = null;
ipcMain.on('sleeping', (_e, on) => {
  clearInterval(sleepWatch); sleepWatch = null;
  if (on) { const woke = require('./core/sleepplan').wakeDetector(3); sleepWatch = setInterval(() => { if (woke(powerMonitor.getSystemIdleTime())) send('user-active'); }, 1000); }
});
ipcMain.on('set-sleep', (_e, on) => { sleepManual = on; buildTray(); });
ipcMain.on('log', (_e, m) => log('[renderer]', m));
ipcMain.handle('init', () => ({
  cfg, dirs: contentDirs(), version: PKG.version, platform: process.platform, edition: EDITION.id, editionLabel: EDITION.label,
  // PC/account names never leave the main process; the renderer only learns yes/no
  adminByIdentity: require('./core/admin').isAdminByIdentity(cfg.admin, { username: os.userInfo().username, hostname: os.hostname() }),
  workArea: screen.getPrimaryDisplay().workArea, bounds: screen.getPrimaryDisplay().bounds, scaleFactor: screen.getPrimaryDisplay().scaleFactor,
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
  const debugItems = [
    { label: 'Debug menu', accelerator: cfg.hotkeys.debug, click: () => send('cmd', { cmd: 'debugmenu' }) },
    { label: 'Sleep together (sleep mode)', type: 'checkbox', checked: sleepManual, click: () => { sleepManual = !sleepManual; send('cmd', { cmd: 'sleep', on: sleepManual }); buildTray(); } },
    { label: 'Invite ChrispyNi (guest)', click: () => send('cmd', { cmd: 'visit', guest: 'chrispyni' }) },
    { label: 'Awareness', submenu: [
      { label: 'Active window / app', type: 'checkbox', checked: a.activeWindow, click: () => toggle('activeWindow') },
      { label: 'Idle time (AFK)', type: 'checkbox', checked: a.idle, click: () => toggle('idle') },
      { label: 'Time of day', type: 'checkbox', checked: a.timeOfDay, click: () => toggle('timeOfDay') },
      { label: 'Media title', type: 'checkbox', checked: a.media, click: () => toggle('media') },
      { label: 'Screen capture (stub, off)', type: 'checkbox', checked: a.screenCapture, click: () => toggle('screenCapture') },
      { label: 'Microphone (stub, off)', type: 'checkbox', checked: a.microphone, click: () => toggle('microphone') },
    ] },
    { label: 'Open config.json', click: () => shell.openPath(path.join(USER_DIR, 'config.json')) },
    { label: 'Open app folder', click: () => shell.openPath(APP_ROOT) },
    { label: 'Open mods folder', click: () => shell.openPath(path.join(APP_ROOT, 'mods')) },
    { label: 'Open content folder', click: () => shell.openPath(path.join(APP_ROOT, 'content')) },
    { label: 'Open log', click: () => shell.openPath(LOG) },
    { label: 'Reload config + content', click: () => { loadConfig(); send('config', cfg); send('content-changed'); buildTray(); } },
  ];
  const menu = Menu.buildFromTemplate([
    { label: 'Talk', accelerator: cfg.hotkeys.chat, click: () => send('cmd', { cmd: 'chat' }) },
    { label: 'Go to room', click: () => send('cmd', { cmd: 'room' }) },
    ...(debugMode ? [{ label: 'Debug', submenu: debugItems }] : []),
    { label: updateInfo ? `About (update ${updateInfo.version}!)` : 'About', click: openAbout },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu); tray.setToolTip(EDITION.label || 'ChrispyNi Desktop Companion');
}

let debugMode = false, aboutWin = null;
ipcMain.on('debug-mode', (_e, on) => { debugMode = !!on; buildTray(); });
function openAbout() {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.focus(); return; }
  const icon = path.join(__dirname, 'renderer', 'icon.png');
  aboutWin = new BrowserWindow({ width: 340, height: 330, resizable: false, minimizable: false, maximizable: false, title: 'About ' + (EDITION.label || 'ChrispyNi Desktop Companion'), autoHideMenuBar: true, backgroundColor: '#1b1230',
    icon: fs.existsSync(icon) ? icon : undefined, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  aboutWin.setMenu(null);
  aboutWin.loadFile(path.join(__dirname, 'renderer', 'about.html'), { query: { v: PKG.version, icon: fs.existsSync(icon) ? 'file:///' + icon.replace(/\\/g, '/') : '' } });
  aboutWin.on('closed', () => { aboutWin = null; });
}
ipcMain.on('about-check', async (e) => {
  const reply = (m) => { try { e.sender.send('about-status', m); } catch {} };
  try { const info = await findUpdate(); if (!info) return reply(`You're up to date (${PKG.version}).`); updateInfo = info; buildTray(); reply(`Update ${info.version} available!`); send('update-available', { version: info.version }); askUpdate(info); }
  catch (err) { reply('Update check failed: ' + err.message); }
});

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
        const info = { title: w.title || '', owner: w.owner || '', process: w.process || '', fullscreen: !!w.fullscreen, playing: w.playing };
        const key = info.owner + '|' + info.title + '|' + info.fullscreen + '|' + info.playing;
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


// ---------- updates (everything stays in the app folder) ----------
const UPD = require('./core/updater');
UPD.setExeName((EDITION.productName || 'ChrispyNi Desktop Companion') + '.exe');
let updateInfo = null, updateBusy = false, updateAnnounced = false;
const updateDismissed = new Set();          // Cancel = not again for this version during this session
const GH_API = EDITION.updateRepoApi || 'https://api.github.com/repos/chrispyni/chrispyni-desktop-companion/releases/latest';
async function findUpdate() {
  const api = process.env.PW_UPDATE_API || (cfg.update && cfg.update.githubApi) || GH_API;
  const token = (cfg.update && cfg.update.githubToken) || process.env.PW_UPDATE_TOKEN || '';
  const headers = { 'User-Agent': 'ChrispyNi-DesktopCompanion-Updater', Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    // Wives (private) edition: version number follows the public latest; zip comes from the private repo.
    let list;
    if (EDITION.versionFromPublicApi) {
      if (!token) { log('private edition update needs update.githubToken in data/config.json'); return null; }
      const pub = await getJSON(EDITION.versionFromPublicApi, headers);
      const want = String(pub.tag_name || '').replace(/^v/, '');
      if (!(UPD.cmpVer(want, PKG.version) > 0)) return null;
      list = await getJSON(api, headers);   // private releases list
      const info = UPD.pickRelease(list, PKG.version, { assetRe: EDITION.assetRe, prefer: EDITION.assetPrefer });
      if (info && UPD.cmpVer(info.version, want) === 0) return info;
      // allow matching tag even if cmp equals want from public
      const tagged = (Array.isArray(list) ? list : [list]).find((r) => r && !r.draft && String(r.tag_name || '').replace(/^v/, '') === want);
      if (tagged) return UPD.pickRelease([tagged], '0', { assetRe: EDITION.assetRe }) || null;
      return null;
    }
    list = await getJSON(api, headers);
    return UPD.pickRelease(list, PKG.version, { assetRe: EDITION.assetRe, prefer: EDITION.assetPrefer });
  } catch (e) {
    log('github update check failed: ' + e.message); throw e;
  }
}
async function getJSON(u, headers) {
  const r = await fetch(u, { headers: headers || { 'User-Agent': 'ChrispyNi-DesktopCompanion-Updater', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + u);
  return r.json();
}
async function checkUpdate(manual) {
  try {
    const info = await findUpdate();
    if (!info) { if (manual) send('toast', `You're up to date (${PKG.version}).`); return; }
    updateInfo = info; buildTray();
    if (updateDismissed.has(info.version) || (updateAnnounced && !manual)) return;
    updateAnnounced = true;
    send('update-available', { version: info.version });            // Nixie or Noct announces it
    askUpdate(info);
  } catch (e) { log('update check failed: ' + e.message); if (manual) send('toast', 'Update check failed: ' + e.message); }
}
let pendingUpdate = null;
async function askUpdate(info) {   // a wife asks in her bubble (Update / Later); no native dialogs
  if (updateBusy) return;
  pendingUpdate = info;
  const auto = process.env.PW_UPDATE_AUTO;   // tests only: 'update' | 'cancel'
  if (auto) return auto === 'update' ? acceptUpdate() : (updateDismissed.add(info.version), send('update-cancelled'));
}
function acceptUpdate() {
  const info = pendingUpdate || updateInfo; if (!info || updateBusy) return;
  doUpdate(info).catch((e) => {
    updateBusy = false; process.noAsar = false; log('update failed: ' + (e.stack || e));
    send('update-failed', e.message || String(e));
  });
}
ipcMain.on('update-accept', acceptUpdate);
ipcMain.on('update-later', () => { if (pendingUpdate) updateDismissed.add(pendingUpdate.version); });
async function doUpdate(info) {
  if (!info.asset || !info.asset.url) { shell.openExternal(/^https:\/\/github\.com\/chrispyni\//.test(info.page || '') ? info.page : ('https://github.com/' + (EDITION.updateRepo || 'chrispyni/chrispyni-desktop-companion') + '/releases')); return; }
  updateBusy = true; send('update-progress', `Downloading v${info.version}…`);
  const dir = path.join(CACHE_DIR, 'update'); fs.mkdirSync(dir, { recursive: true });
  let buf;
  if (/^https?:/.test(info.asset.url)) { const r = await fetch(info.asset.url, { headers: { 'User-Agent': 'ChrispyNiDesktopCompanion-Updater' } }); if (!r.ok) throw new Error('download HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); }
  else buf = fs.readFileSync(info.asset.url);
  fs.writeFileSync(path.join(dir, info.asset.name), buf);
  const entries = UPD.verify(buf, info);
  let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'content-manifest.json'), 'utf8')); } catch {}
  process.noAsar = true;   // treat .asar files as plain files while staging/backing up
  const plan = UPD.planUpdate(APP_ROOT, entries, manifest);
  const { backup, staging } = UPD.stage(APP_ROOT, plan, PKG.version);
  log(`update ${PKG.version} -> ${info.version}: ${plan.write.length} files staged, kept yours: ${plan.kept.join(', ') || 'none'}; backup ${backup}`);
  fs.unlinkSync(path.join(dir, info.asset.name));
  if (process.platform === 'win32' && app.isPackaged) {
    const ps1 = path.join(dir, 'apply-update.ps1'); fs.writeFileSync(ps1, '\uFEFF' + UPD.swapScript(staging, APP_ROOT, process.pid, PKG.version, backup));
    send('update-progress', 'Restarting… see you in a sec!');
    const { spawn } = require('child_process');
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1], { detached: true, stdio: 'ignore', windowsHide: true, cwd: APP_ROOT }).unref();
    process.noAsar = false; setTimeout(() => app.exit(0), 600);
  } else {   // dev / test: apply in place (no locked files), then report
    UPD.applyStaged(staging, APP_ROOT); process.noAsar = false; send('update-done', { version: info.version }); log('update applied in place (non-Windows/dev)');
    if (process.env.PW_UPDATE_TEST) setTimeout(() => app.quit(), 500);
  }
}
ipcMain.on('update-check', () => checkUpdate(true));

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
  if (writable !== true) {
    require('electron').dialog.showErrorBox((EDITION.label || 'ChrispyNi Desktop Companion') + ' - folder is read-only',
      `${EDITION.label || 'ChrispyNi Desktop Companion'} keeps everything (saves, config, mods, logs) inside its own folder:\n${APP_ROOT}\n\nWindows does not allow writing there (${writable.code || writable.message}).\nPlease move the folder somewhere you can write, e.g. D:\\Games\\ChrispyNi or your Desktop/Documents - not C:\\Program Files.`);
    app.quit(); return;
  }
  createOverlay();
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'tray.png'));
    tray = new Tray(icon); buildTray();
    tray.on('click', () => send('cmd', { cmd: 'chat' }));
  } catch (e) { log('tray failed: ' + e.message); }
  const reg = (acc, fn) => { try { if (acc) globalShortcut.register(acc, fn); } catch (e) { log('hotkey ' + acc + ' failed'); } };
  reg(cfg.hotkeys.chat, () => send('cmd', { cmd: 'chat' }));
  reg(cfg.hotkeys.debug, () => { if (debugMode) send('cmd', { cmd: 'debugmenu' }); });
  reg(cfg.hotkeys.sleep, () => { sleepManual = !sleepManual; send('cmd', { cmd: 'sleep', on: sleepManual }); buildTray(); });
  powerMonitor.on('lock-screen', () => send('awareness', { kind: 'lock' }));
  powerMonitor.on('unlock-screen', () => send('awareness', { kind: 'unlock' }));
  powerMonitor.on('suspend', () => send('awareness', { kind: 'suspend' }));
  powerMonitor.on('resume', () => send('awareness', { kind: 'resume' }));
  awTimer = setInterval(pollAwareness, Math.max(2, cfg.awareness.pollSeconds || 5) * 1000);
  watchContent();
  const upArg = process.argv.find((a) => a.startsWith('--updated-from='));
  const failArg = process.argv.find((a) => a.startsWith('--update-failed='));
  if (upArg) { log('restarted after update from ' + upArg.split('=')[1]); setTimeout(() => send('update-done', { version: PKG.version, from: upArg.split('=')[1] }), 3000); }
  if (failArg) setTimeout(() => send('update-failed', 'I could not replace the files (your old version is untouched).'), 3000);
  if (cfg.update.checkOnStart !== false && !upArg) setTimeout(() => checkUpdate(false), process.env.PW_UPDATE_TEST ? 2500 : 8000);
  screen.on('display-metrics-changed', () => { const d = screen.getPrimaryDisplay(); if (overlay) overlay.setBounds(d.bounds); send('workarea', { workArea: d.workArea, bounds: d.bounds, scale: d.scaleFactor }); });
  log(`started ${PKG.version} root=${APP_ROOT} data=${DATA_DIR} userData=${app.getPath('userData')}`);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (winWatcher) winWatcher.kill(); stopClickWatcher(); });
app.on('window-all-closed', () => app.quit());
module.exports = { openRoom };
