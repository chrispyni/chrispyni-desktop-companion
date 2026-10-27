// Edition: public build is always "chrispyni" (ChrispyNi Desktop Companion). The private "wives"
// edition (Nixie & Noct as mains) is built only from the private repo's overlay.
'use strict';
const path = require('path');
const fs = require('fs');

const EDITIONS = {
  chrispyni: {
    id: 'chrispyni',
    label: 'ChrispyNi Desktop Companion',
    productName: 'ChrispyNi Desktop Companion',
    folderName: 'ChrispyNi Desktop Companion',
    artifactPrefix: 'ChrispyNi-Desktop-Companion',
    dataDir: 'data',
    appId: 'com.chrispyni.desktopcompanion',
    description: 'Desktop companion: ChrispyNi, with Nixie & Noct as guests · Made with Grok AI',
    characters: ['chrispyni'],
    guests: ['nixie', 'noct'],
    // Public updater: only this edition's zip from the public repo
    assetRe: /^ChrispyNi-Desktop-Companion-(?!Wives).*?-win\.zip$/i,
    updateRepo: 'chrispyni/chrispyni-desktop-companion',
    updateRepoApi: 'https://api.github.com/repos/chrispyni/chrispyni-desktop-companion/releases/latest',
  },
  wives: {
    id: 'wives',
    label: 'ChrispyNi Desktop Companion (Wives)',
    productName: 'ChrispyNi Desktop Companion (Wives)',
    folderName: 'ChrispyNi Desktop Companion (Wives)',
    artifactPrefix: 'ChrispyNi-Desktop-Companion-Wives',
    dataDir: 'data',
    appId: 'com.chrispyni.desktopcompanion.wives',
    description: 'Private: Nixie & Noct as mains, ChrispyNi as guest',
    characters: ['nixie', 'noct'],
    guests: ['chrispyni'],
    assetRe: /^ChrispyNi-Desktop-Companion-Wives-.*-win\.zip$/i,
    // Version number follows the public latest; the zip itself is on the private repo
    updateRepo: 'chrispyni/chrispyni-desktop-companion-private',
    updateRepoApi: 'https://api.github.com/repos/chrispyni/chrispyni-desktop-companion-private/releases',
    versionFromPublicApi: 'https://api.github.com/repos/chrispyni/chrispyni-desktop-companion/releases/latest',
    needsToken: true,
  },
};

function resolveEdition(root, env = process.env) {
  if (env.PW_EDITION && EDITIONS[env.PW_EDITION]) return { ...EDITIONS[env.PW_EDITION] };
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'edition.json'), 'utf8'));
    if (j && EDITIONS[j.id]) return { ...EDITIONS[j.id], ...j };
  } catch {}
  return { ...EDITIONS.chrispyni };
}

function editionDir(repoRoot, ed) {
  if (!ed) return null;
  const d = path.join(repoRoot, 'editions', ed.id);
  return fs.existsSync(d) ? d : null;
}

module.exports = { EDITIONS, resolveEdition, editionDir };
