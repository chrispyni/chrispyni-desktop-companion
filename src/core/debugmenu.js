// Debug menu structure: nested Category → Avatar → actions. Pure helpers for overlay + tests.
'use strict';
const { groupByCategory, labeledName, categoryOf } = require('./categories');

const GLOBAL_SECTIONS = [
  'Mana (all)',
  'World',
  'Rooms',
  'Events',
  'Guest visits',
  'Summon prop',
  'Props on screen',
];

/**
 * Nested model for the debug menu.
 * presentIds: set/array of character ids currently on screen (guests included).
 * Returns {
 *   globals: string[],
 *   categories: [{ category, avatars: [{ id, name, present, def }] }]
 * }
 * Avatars listed under a category include every known character in that category;
 * `present` marks who is on screen (those must get full per-character actions).
 */
function buildDebugMenuModel(characters, presentIds = [], opts = {}) {
  const present = new Set(Array.isArray(presentIds) ? presentIds : [...presentIds]);
  const groups = groupByCategory(characters || {}, { includeEmpty: opts.includeEmpty !== false });
  const categories = groups.map((g) => ({
    category: g.category,
    avatars: g.items.map((def) => ({
      id: def.id,
      name: labeledName(def, def.name || def.id),
      present: present.has(def.id),
      def,
    })),
  }));
  return { globals: GLOBAL_SECTIONS.slice(), categories };
}

/** Ids that must receive a full per-character debug panel (everyone currently on screen). */
function presentDebugTargets(charsMap) {
  return Object.values(charsMap || {})
    .filter((c) => c && !c.hidden && !c.fadeOut)
    .map((c) => c.id)
    .sort();
}

/** Ensure every present character appears under some category avatar with present=true. */
function assertPresentHavePanels(model, presentIds) {
  const present = new Set(presentIds);
  const covered = new Set();
  for (const g of model.categories) {
    for (const a of g.avatars) if (a.present) covered.add(a.id);
  }
  const missing = [...present].filter((id) => !covered.has(id));
  return { ok: missing.length === 0, missing, covered: [...covered] };
}

module.exports = {
  GLOBAL_SECTIONS,
  buildDebugMenuModel,
  presentDebugTargets,
  assertPresentHavePanels,
  categoryOf,
};
