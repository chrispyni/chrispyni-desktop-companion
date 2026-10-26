// Writes content-manifest.json (sha256 of every shipped content/ file) so the updater can tell your edits apart.
'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const R = path.join(__dirname, '..'); const out = {};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
for (const f of walk(path.join(R, 'content'))) out[path.relative(R, f).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(path.join(R, 'content-manifest.json'), JSON.stringify(out, null, 1));
console.log('manifest', Object.keys(out).length, 'files');
