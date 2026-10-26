// Self-update, fully inside the app folder. Finds the newest GitHub release, downloads the -win.zip,
// verifies it, stages only the files that should change (keeps data/, mods/, plugins/ and any content/ files
// you edited), backs up what it overwrites to backup/<old-version>-<time>/, then a tiny script swaps them in.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/), pb = String(b).replace(/^v/, '').split(/[.-]/);
  for (let i = 0; i < 3; i++) { const d = (parseInt(pa[i]) || 0) - (parseInt(pb[i]) || 0); if (d) return d; }
  return 0;
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** GitHub /releases JSON (array) -> newest release with a -win.zip asset, newer than `current`, else null. */
function pickRelease(list, current, opts = {}) {
  // pre-releases are only offered on the opt-in "prerelease" channel (config update.channel)
  const rels = (Array.isArray(list) ? list : [list]).filter((r) => r && !r.draft && r.tag_name && (!r.prerelease || opts.prerelease));
  let best = null;
  for (const r of rels) {
    const asset = (r.assets || []).find((a) => /-win\.zip$/i.test(a.name));
    if (!asset) continue;
    const v = r.tag_name.replace(/^v/, '');
    if (cmpVer(v, current) > 0 && (!best || cmpVer(v, best.version) > 0)) {
      best = { version: v, notes: String(r.body || '').slice(0, 600), page: r.html_url, asset: { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || null } };
    }
  }
  return best;
}

/** Minimal ZIP reader (stored + deflate), enough for electron-builder zips. */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), usize = buf.readUInt32LE(off + 24);
    const nl = buf.readUInt16LE(off + 28), xl = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nl).toString('utf8').replace(/\\/g, '/');
    off += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;
    if (name.split('/').includes('..') || path.isAbsolute(name)) throw new Error('unsafe path in zip: ' + name);
    const dstart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.slice(dstart, dstart + csize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error('unsupported zip method ' + method);
    if (data.length !== usize) throw new Error('size mismatch in ' + name);
    out.push({ name, data });
  }
  // strip a single shared top folder (e.g. "ProjectWives/...")
  const tops = new Set(out.map((e) => e.name.split('/')[0]));
  if (tops.size === 1 && out.every((e) => e.name.includes('/'))) { const t = [...tops][0] + '/'; for (const e of out) e.name = e.name.slice(t.length); }
  return out;
}

const EXE = 'Project Wives.exe';
/** Checks the download: size, sha256 digest (when GitHub gives one), zip integrity, expected files and version. */
function verify(buf, info) {
  if (info.asset.size && buf.length !== info.asset.size) throw new Error(`download size ${buf.length} != ${info.asset.size}`);
  if (info.asset.digest) { const [alg, hex] = String(info.asset.digest).split(':'); if (alg === 'sha256' && hex && sha256(buf) !== hex.toLowerCase()) throw new Error('sha256 mismatch'); }
  const entries = unzip(buf);
  const names = new Set(entries.map((e) => e.name));
  for (const req of [EXE, 'resources/app.asar', 'version.json']) if (!names.has(req)) throw new Error('release zip is missing ' + req);
  const vj = JSON.parse(entries.find((e) => e.name === 'version.json').data.toString('utf8'));
  if (cmpVer(vj.version, info.version) !== 0) throw new Error(`zip says ${vj.version}, expected ${info.version}`);
  return entries;
}

const NEVER = /^(data|logs|cache|backup)\//;
const ADD_ONLY = /^(mods|plugins)\//;
/** Decide what to write. manifest = sha256 of every shipped content/ file of the INSTALLED version. */
function planUpdate(appRoot, entries, manifest = {}) {
  const write = [], kept = [];
  for (const e of entries) {
    const p = e.name; if (NEVER.test(p)) continue;
    const dst = path.join(appRoot, p); const exists = fs.existsSync(dst);
    if (ADD_ONLY.test(p) && exists) { kept.push(p); continue; }
    if (/^content\//.test(p) && exists) {
      const cur = sha256(fs.readFileSync(dst));
      if (cur === sha256(e.data)) continue;                         // already identical
      if (!manifest[p] || manifest[p] !== cur) { kept.push(p); continue; }   // you changed it (or unknown): keep yours
    }
    write.push(e);
  }
  return { write, kept };
}

/** Back up every file that will be overwritten, then stage the new files. Returns paths. */
function stage(appRoot, plan, oldVersion, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = path.join(appRoot, 'backup', `${oldVersion}-${stamp}`);
  const staging = path.join(appRoot, 'cache', 'update', 'staging');
  fs.rmSync(staging, { recursive: true, force: true });
  for (const e of plan.write) {
    const dst = path.join(appRoot, e.name);
    if (fs.existsSync(dst)) { const b = path.join(backup, e.name); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(dst, b); }
    const s = path.join(staging, e.name); fs.mkdirSync(path.dirname(s), { recursive: true }); fs.writeFileSync(s, e.data);
  }
  return { backup, staging };
}
/** Copy staged files over the app folder (used by the swap script on non-Windows and by tests). */
function applyStaged(staging, appRoot) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
  for (const f of walk(staging)) { const rel = path.relative(staging, f); const dst = path.join(appRoot, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(f, dst); }
  fs.rmSync(staging, { recursive: true, force: true });
}
/** Windows swap script: wait for the app to exit, copy staged files over, relaunch. */
function swapScript(staging, appRoot, pid) {
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  return [
    '$ErrorActionPreference = "Stop"',
    `try { Wait-Process -Id ${Number(pid)} -Timeout 60 -ErrorAction SilentlyContinue } catch {}`,
    'Start-Sleep -Milliseconds 700',
    `$src = ${q(staging)}; $dst = ${q(appRoot)}`,
    'try {',
    '  Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {',
    '    $rel = $_.FullName.Substring($src.Length).TrimStart("\\")',
    '    $t = Join-Path $dst $rel; New-Item -ItemType Directory -Force -Path (Split-Path $t) | Out-Null',
    '    Copy-Item -LiteralPath $_.FullName -Destination $t -Force }',
    '  Remove-Item -LiteralPath $src -Recurse -Force',
    `  Add-Content -LiteralPath (Join-Path $dst 'logs\\update.log') -Value "$(Get-Date -Format o) update applied"`,
    '} catch { Add-Content -LiteralPath (Join-Path $dst "logs\\update.log") -Value "$(Get-Date -Format o) update FAILED: $_ (backup folder has the old files)" }',
    `Start-Process -FilePath (Join-Path $dst ${q(EXE)}) -WorkingDirectory $dst`,
  ].join('\r\n');
}
module.exports = { cmpVer, pickRelease, unzip, verify, planUpdate, stage, applyStaged, swapScript, sha256, EXE };
