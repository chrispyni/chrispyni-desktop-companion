// Sets the Windows exe's version info + icon with resedit (pure JS, no wine), so Task Manager shows "Project Wives".
'use strict';
const fs = require('fs'); const path = require('path');
module.exports = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit'); const PE = require('pe-library');
  const pkg = require('../package.json');
  const exe = path.join(ctx.appOutDir, `${pkg.build.productName}.exe`);
  const exeObj = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = PE.NtExecutableResource.from(exeObj);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  for (const g of groups) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, g.id, g.lang, iconFile.icons.map((i) => i.data));
  if (!groups.length) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, iconFile.icons.map((i) => i.data));
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = vis[0] || ResEdit.Resource.VersionInfo.createEmpty();
  const [ma, mi, pa] = pkg.version.split(/[.-]/).map((x) => parseInt(x) || 0);
  vi.setFileVersion(ma, mi, pa, 0, 1033); vi.setProductVersion(ma, mi, pa, 0, 1033);
  const lang = vi.getAllLanguagesForStringValues()[0] || { lang: 1033, codepage: 1200 };
  vi.setStringValues(lang, {
    FileDescription: 'Project Wives', ProductName: 'Project Wives', CompanyName: 'ChrispyNi',
    InternalName: 'Project Wives', OriginalFilename: 'Project Wives.exe', LegalCopyright: '© ChrispyNi. All rights reserved.',
    FileVersion: pkg.version, ProductVersion: pkg.version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exeObj);
  fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
  console.log('  • resedit: version info + icon set on', path.basename(exe));
};
