#!/usr/bin/env node
// Build one edition: node tools/dist-edition.js chrispyni|wives
'use strict';
const fs = require('fs'); const path = require('path'); const { spawnSync } = require('child_process');
const { EDITIONS } = require('../src/core/edition');
const edName = process.argv[2] || 'chrispyni';
const ed = EDITIONS[edName]; if (!ed) { console.error('Unknown edition', edName); process.exit(1); }
const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const bak = JSON.stringify(pkg, null, 2) + '\n';
pkg.productName = ed.productName;
pkg.description = ed.description;
pkg.build = pkg.build || {};
pkg.build.appId = ed.appId;
pkg.build.productName = ed.productName;
pkg.build.artifactName = ed.artifactPrefix + '-${version}-win.${ext}';
if (pkg.build.nsis) { pkg.build.nsis.artifactName = ed.artifactPrefix + '-${version}-setup.${ext}'; pkg.build.nsis.shortcutName = ed.productName; }
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'edition.json'), JSON.stringify({ id: ed.id }, null, 2) + '\n');
console.log('Building edition', ed.id, '→', ed.productName);
const env = { ...process.env, PW_EDITION: ed.id };
const r = spawnSync('npx', ['electron-builder', '--win', '7z', 'zip', '--x64'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
// wrap archives in single top-level folder named ed.folderName
const dist = path.join(root, 'dist');
const ver = pkg.version;
const zBin = path.join(root, 'node_modules', '7zip-bin', 'linux', 'x64', '7za');
const unpack = path.join(dist, 'win-unpacked');
if (fs.existsSync(unpack)) {
  const pk = path.join(dist, '_pk_' + ed.id); fs.rmSync(pk, { recursive: true, force: true }); fs.mkdirSync(pk);
  const dest = path.join(pk, ed.folderName);
  // copy
  spawnSync('cp', ['-a', unpack, dest], { stdio: 'inherit' });
  // ensure edition.json inside
  fs.writeFileSync(path.join(dest, 'edition.json'), JSON.stringify({ id: ed.id }, null, 2) + '\n');
  for (const ext of ['zip', '7z']) {
    const out = path.join(dist, `${ed.artifactPrefix}-${ver}-win.${ext}`);
    fs.rmSync(out, { force: true });
    const args = ext === 'zip' ? ['a', '-tzip', '-mx=7', out, ed.folderName] : ['a', '-t7z', '-mx=9', out, ed.folderName];
    spawnSync(zBin, args, { cwd: pk, stdio: 'inherit' });
    console.log('packed', out);
  }
  fs.rmSync(pk, { recursive: true, force: true });
}
fs.writeFileSync(pkgPath, bak);   // restore package.json so the tree stays on the public edition defaults
fs.writeFileSync(path.join(root, 'edition.json'), JSON.stringify({ id: 'chrispyni' }, null, 2) + '\n');
process.exit(r.status || 0);
