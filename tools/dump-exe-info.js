// Prints the Windows exe's version strings + icon count (resource dump), e.g. node tools/dump-exe-info.js "dist/win-unpacked/Project Wives.exe"
const fs = require('fs'); const PE = require('pe-library'); const R = require('resedit');
const exe = PE.NtExecutable.from(fs.readFileSync(process.argv[2]), { ignoreCert: true }); const res = PE.NtExecutableResource.from(exe);
for (const vi of R.Resource.VersionInfo.fromEntries(res.entries)) for (const l of vi.getAllLanguagesForStringValues()) console.log(vi.getStringValues(l));
console.log('icon groups:', R.Resource.IconGroupEntry.fromEntries(res.entries).map((g) => g.icons.length + ' sizes'));
