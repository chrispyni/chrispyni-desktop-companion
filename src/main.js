// Project Wives - Electron main process: windows, tray, hotkeys, awareness, relay, updates, hot reload.
'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, powerMonitor, shell, nativeImage, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { NtfyRelay } = require('./core/relay');
const { classifyApp } = require('./core/awareness');
const { deepMerge } = require('./core/content');

// ---------- self-contained layout: EVERYTHING lives next to the exe (like a game) ----------
//  ProjectWives/  Project Wives.exe  content/  mods/  plugins/  templates/  data/  logs/  cache/
const DEV_ROOT = path.join(__dirname, '..');
const APP_ROOT = process.env.PW_ROOT || (app.isPackaged ? path.dirname(process.execPath) : DEV_ROOT);
const DATA_DIR = path.join(APP_ROOT, 'data');     // config.json, save.json
const LOG_DIR = path.join(APP_ROOT, 'logs');
const CACHE_DIR = path.join(APP_ROOT, 'cache');   // Chromium profile, GPU/code cache, temp
const USER_DIR = DATA_DIR;
const PKG = require('../package.json');
app.setName('Project Wives');
if (process.platform === 'win32') app.setAppUserModelId('com.chrispyni.projectwives');

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

const LOG = path.join(LOG_DIR, 'project-wives.log');
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
  return cfg;
}
function saveConfig() {
  const p = path.join(USER_DIR, 'config.json');
  let user = {}; try { user = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  user.awareness = cfg.awareness; user.relay = cfg.relay; user.debug = cfg.debug;
  fs.writeFileSync(p, JSON.stringify(user, null, 2));
}
try { loadConfig(); } catch (e) { cfg = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "config.example.json"), "utf8")); }

function contentDirs() {
  return {
    base: path.join(APP_ROOT, 'content'),
    mods: [path.join(APP_ROOT, 'mods')],
    plugins: [path.join(APP_ROOT, 'plugins')],
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
  roomWin.setAlwaysOnTop(true, 'screen-saver', 1);
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
ipcMain.on('focus-overlay', () => { if (overlay) overlay.focus(); });
ipcMain.on('blur-overlay', () => { if (overlay) overlay.blur(); });
ipcMain.on('open-room', (_e, id, who) => openRoom(id, who));
ipcMain.on('close-room', () => { if (roomWin) roomWin.close(); });
ipcMain.on('mana', (_e, m) => { if (roomWin && !roomWin.isDestroyed()) roomWin.webContents.send('mana', m); });
ipcMain.on('relay-send', (_e, msg) => relay.send(msg));
ipcMain.on('set-sleep', (_e, on) => { sleepManual = on; buildTray(); });
ipcMain.on('log', (_e, m) => log('[renderer]', m));
ipcMain.on('open-path', (_e, p) => shell.openPath(p));
ipcMain.handle('init', () => ({
  cfg, dirs: contentDirs(), version: PKG.version, platform: process.platform,
  identity: { username: os.userInfo().username, hostname: os.hostname() },
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
    { label: 'Relay to the real Nixie & Noct', type: 'checkbox', checked: !!cfg.relay.enabled, click: () => { cfg.relay.enabled = !cfg.relay.enabled; saveConfig(); relay.cfg = cfg.relay; send('config', cfg); buildTray(); } },
    { label: 'Open config.json', click: () => shell.openPath(path.join(USER_DIR, 'config.json')) },
    { label: 'Open app folder', click: () => shell.openPath(APP_ROOT) },
    { label: 'Open mods folder', click: () => shell.openPath(path.join(APP_ROOT, 'mods')) },
    { label: 'Open content folder', click: () => shell.openPath(path.join(APP_ROOT, 'content')) },
    { label: 'Open log', click: () => shell.openPath(LOG) },
    { label: 'Reload config + content', click: () => { loadConfig(); relay.cfg = cfg.relay; send('config', cfg); send('content-changed'); buildTray(); } },
  ];
  const menu = Menu.buildFromTemplate([
    { label: 'Talk', accelerator: cfg.hotkeys.chat, click: () => send('cmd', { cmd: 'chat' }) },
    { label: 'Go to room', click: () => send('cmd', { cmd: 'room' }) },
    ...(debugMode ? [{ label: 'Debug', submenu: debugItems }] : []),
    { label: updateInfo ? `About (update ${updateInfo.version}!)` : 'About', click: openAbout },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu); tray.setToolTip('Project Wives - Nixie & Noct');
}

let debugMode = false, aboutWin = null;
ipcMain.on('debug-mode', (_e, on) => { debugMode = !!on; buildTray(); });
function openAbout() {
  if (aboutWin && !aboutWin.isDestroyed()) { aboutWin.focus(); return; }
  const icon = path.join(__dirname, 'renderer', 'icon.png');
  aboutWin = new BrowserWindow({ width: 340, height: 330, resizable: false, minimizable: false, maximizable: false, title: 'About Project Wives', autoHideMenuBar: true, backgroundColor: '#1b1230',
    icon: fs.existsSync(icon) ? icon : undefined, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  aboutWin.setMenu(null);
  aboutWin.loadFile(path.join(__dirname, 'renderer', 'about.html'), { query: { v: PKG.version, icon: fs.existsSync(icon) ? 'file:///' + icon.replace(/\\/g, '/') : '' } });
  aboutWin.on('closed', () => { aboutWin = null; });
}
ipcMain.on('about-check', async (e) => {
  const reply = (m) => { try { e.sender.send('about-status', m); } catch {} };
  try { const info = await findUpdate(); if (!info) return reply(`You're up to date (${PKG.version}).`); updateInfo = info; buildTray(); reply(`Update ${info.version} available!`); askUpdate(info); }
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

// ---------- relay ----------
const relay = new NtfyRelay(cfg.relay, globalThis.fetch, log);
let relayTimer;
async function pollRelay() {
  if (relay.enabled) { const r = await relay.poll(); if (r.length) send('relay-replies', r); }
  send('relay-status', { enabled: relay.enabled, lastOk: relay.lastOk, lastError: relay.lastError });
  relayTimer = setTimeout(pollRelay, Math.max(2, cfg.relay.pollSeconds || 5) * 1000);
}

// ---------- updates (everything stays in the app folder) ----------
const UPD = require('./core/updater');
let updateInfo = null, updateBusy = false, updateAnnounced = false;
const updateDismissed = new Set();          // Cancel = not again for this version during this session
const GH_API = 'https://api.github.com/repos/chrispyni/project-wives/releases?per_page=10';
async function getJSON(u) {
  if (!/^https?:/.test(u)) return JSON.parse(fs.readFileSync(u, 'utf8'));
  const r = await fetch(u, { headers: { 'User-Agent': 'ProjectWives-Updater', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
}
async function findUpdate() {
  const api = process.env.PW_UPDATE_API || (cfg.update && cfg.update.githubApi) || GH_API;
  try { const info = UPD.pickRelease(await getJSON(api), PKG.version, { prerelease: !!(cfg.update && cfg.update.channel === 'prerelease') }); if (info) return info; return null; }
  catch (e) {
    log('github update check failed: ' + e.message);
    const u = cfg.update && cfg.update.url; if (!u) throw e;             // fall back to version.json
    const j = await getJSON(u);
    return UPD.cmpVer(j.version, PKG.version) > 0 ? { version: j.version, notes: j.notes || '', page: j.download, asset: j.zip ? { name: path.basename(j.zip), url: j.zip, size: j.size, digest: j.sha256 ? 'sha256:' + j.sha256 : null } : null } : null;
  }
}
async function checkUpdate(manual) {
  try {
    const info = await findUpdate();
    if (!info) { if (manual) send('toast', `You're up to date (${PKG.version}).`); return; }
    updateInfo = info; buildTray();
    if (updateDismissed.has(info.version) || (updateAnnounced && !manual)) return;
    updateAnnounced = true;
    send('update-available', { version: info.version });            // Nixie or Noct announces it
    setTimeout(() => askUpdate(info), manual ? 300 : 3500);
  } catch (e) { log('update check failed: ' + e.message); if (manual) send('toast', 'Update check failed: ' + e.message); }
}
async function askUpdate(info) {
  if (updateBusy) return;
  const auto = process.env.PW_UPDATE_AUTO;   // tests only: 'update' | 'cancel'
  const r = auto ? { response: auto === 'update' ? 0 : 1 } : await dialog.showMessageBox({
    type: 'info', title: 'Project Wives update', message: `Project Wives ${info.version} is available`, noLink: true,
    detail: `You have ${PKG.version}.\n\nUpdate downloads it into this folder, keeps your saves (data), mods, plugins and any content you edited, backs up replaced files to backup\\, then restarts.`,
    buttons: ['Update', 'Cancel'], defaultId: 0, cancelId: 1,
  });
  if (r.response !== 0) { updateDismissed.add(info.version); send('update-cancelled'); return; }
  doUpdate(info).catch((e) => { updateBusy = false; log('update failed: ' + e.stack); dialog.showErrorBox('Update failed', e.message + '\n\nNothing was changed. You can download it manually from the Releases page.'); });
}
async function doUpdate(info) {
  if (!info.asset || !info.asset.url) { shell.openExternal(info.page || 'https://github.com/chrispyni/project-wives/releases'); return; }
  updateBusy = true; send('toast', `Downloading ${info.version}…`);
  const dir = path.join(CACHE_DIR, 'update'); fs.mkdirSync(dir, { recursive: true });
  let buf;
  if (/^https?:/.test(info.asset.url)) { const r = await fetch(info.asset.url, { headers: { 'User-Agent': 'ProjectWives-Updater' } }); if (!r.ok) throw new Error('download HTTP ' + r.status); buf = Buffer.from(await r.arrayBuffer()); }
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
    const ps1 = path.join(dir, 'apply-update.ps1'); fs.writeFileSync(ps1, UPD.swapScript(staging, APP_ROOT, process.pid));
    const { spawn } = require('child_process');
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1], { detached: true, stdio: 'ignore', windowsHide: true, cwd: APP_ROOT }).unref();
    process.noAsar = false; app.quit();
  } else {   // dev / test: apply in place (no locked files), then report
    UPD.applyStaged(staging, APP_ROOT); process.noAsar = false; send('toast', `Updated to ${info.version} (restart to use it).`); log('update applied in place (non-Windows/dev)');
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
    require('electron').dialog.showErrorBox('Project Wives - folder is read-only',
      `Project Wives keeps everything (saves, config, mods, logs) inside its own folder:\n${APP_ROOT}\n\nWindows does not allow writing there (${writable.code || writable.message}).\nPlease move or install the Project Wives folder somewhere you can write, e.g. D:\\Games\\ProjectWives or your Desktop/Documents - not C:\\Program Files.`);
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
  setTimeout(pollRelay, 3000);
  watchContent();
  if (cfg.update.checkOnStart !== false) setTimeout(() => checkUpdate(false), process.env.PW_UPDATE_TEST ? 2500 : 8000);
  screen.on('display-metrics-changed', () => { const d = screen.getPrimaryDisplay(); if (overlay) overlay.setBounds(d.bounds); send('workarea', { workArea: d.workArea, bounds: d.bounds, scale: d.scaleFactor }); });
  log(`started ${PKG.version} root=${APP_ROOT} data=${DATA_DIR} userData=${app.getPath('userData')}`);
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); if (winWatcher) winWatcher.kill(); });
app.on('window-all-closed', () => app.quit());
module.exports = { openRoom };
