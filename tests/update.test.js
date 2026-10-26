'use strict';
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path'); const { execFileSync } = require('child_process');
const U = require('../src/core/updater');

function makeZip(file, files) {   // python's zipfile (deflate) to build a realistic release zip
  const spec = JSON.stringify(files);
  execFileSync('python3', ['-c', `import zipfile,json,sys\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)\nfor k,v in json.loads(sys.argv[2]).items(): z.writestr(k,v)\nz.close()`, file, spec]);
  return fs.readFileSync(file);
}
test('pickRelease: newest prerelease with a -win.zip asset, newer than current', () => {
  const list = [
    { tag_name: 'v0.1.1-alpha', assets: [{ name: 'ProjectWives-0.1.1-alpha-win.zip', browser_download_url: 'u1', size: 1 }] },
    { tag_name: 'v0.1.3-alpha', prerelease: true, assets: [{ name: 'ProjectWives-0.1.3-alpha-win.zip', browser_download_url: 'u3', size: 3, digest: 'sha256:ab' }] },
    { tag_name: 'v0.2.0', draft: true, assets: [{ name: 'x-win.zip' }] },
    { tag_name: 'v0.1.4-alpha', assets: [{ name: 'notes.txt' }] },
  ];
  assert.strictEqual(U.pickRelease(list, '0.1.2-alpha'), null, 'normal users are never offered pre-releases');
  const r = U.pickRelease(list, '0.1.2-alpha', { prerelease: true });
  assert.strictEqual(r.version, '0.1.3-alpha'); assert.strictEqual(r.asset.url, 'u3'); assert.strictEqual(r.asset.digest, 'sha256:ab');
  assert.strictEqual(U.pickRelease(list, '0.1.3-alpha', { prerelease: true }), null);
  assert.strictEqual(U.pickRelease([{ ...list[1], prerelease: false }], '0.1.2-alpha').version, '0.1.3-alpha');
});
test('verify + plan + stage + apply keeps data, mods and your edited content; backs up', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwupd-')); const app = path.join(tmp, 'app');
  const put = (p, v) => { fs.mkdirSync(path.dirname(path.join(app, p)), { recursive: true }); fs.writeFileSync(path.join(app, p), v); };
  put('Project Wives.exe', 'old exe'); put('resources/app.asar', 'old asar'); put('version.json', '{"version":"0.1.2-alpha"}');
  put('content/lines/nixie.json', 'shipped nixie'); put('content/lines/noct.json', 'my edited noct'); put('data/save.json', 'MY SAVE'); put('mods/m/mod.json', 'my mod');
  const manifest = { 'content/lines/nixie.json': U.sha256(Buffer.from('shipped nixie')), 'content/lines/noct.json': U.sha256(Buffer.from('shipped noct')) };
  const zip = makeZip(path.join(tmp, 'r.zip'), { 'Project Wives.exe': 'new exe', 'resources/app.asar': 'new asar', 'version.json': '{"version":"0.1.3-alpha"}',
    'content/lines/nixie.json': 'new nixie', 'content/lines/noct.json': 'new noct', 'content/new.json': 'brand new', 'data/save.json': 'EVIL', 'mods/m/mod.json': 'example' });
  const info = { version: '0.1.3-alpha', asset: { size: zip.length, digest: 'sha256:' + U.sha256(zip) } };
  assert.throws(() => U.verify(zip, { ...info, asset: { ...info.asset, digest: 'sha256:00' } }), /sha256/);
  assert.throws(() => U.verify(zip, { ...info, version: '0.1.4-alpha' }), /expected/);
  assert.throws(() => U.verify(zip, { ...info, asset: { size: 5 } }), /size/);
  const entries = U.verify(zip, info);
  const plan = U.planUpdate(app, entries, manifest);
  assert.deepStrictEqual(plan.kept.sort(), ['content/lines/noct.json', 'mods/m/mod.json']);
  const { backup, staging } = U.stage(app, plan, '0.1.2-alpha');
  assert.strictEqual(fs.readFileSync(path.join(backup, 'Project Wives.exe'), 'utf8'), 'old exe');
  U.applyStaged(staging, app);
  const rd = (p) => fs.readFileSync(path.join(app, p), 'utf8');
  assert.strictEqual(rd('Project Wives.exe'), 'new exe'); assert.strictEqual(rd('content/lines/nixie.json'), 'new nixie');
  assert.strictEqual(rd('content/lines/noct.json'), 'my edited noct'); assert.strictEqual(rd('content/new.json'), 'brand new');
  assert.strictEqual(rd('data/save.json'), 'MY SAVE'); assert.strictEqual(rd('mods/m/mod.json'), 'my mod');
  assert.ok(!fs.existsSync(staging));
  assert.match(U.swapScript(staging, app, 123), /Wait-Process -Id 123/);
});
test('unzip rejects path traversal', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwz-'));
  const z = makeZip(path.join(tmp, 'b.zip'), { '../evil.txt': 'x' });
  assert.throws(() => U.unzip(z), /unsafe/);
});
