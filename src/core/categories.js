// Character categories for debug UI / labels. Separate from gameplay role (wife/guest).
'use strict';

const BUILTIN = ['Main', 'Wife', 'Friends'];

/** Category string for a character def (or {id, category, role}). Mods may set any custom string. */
function categoryOf(def) {
  if (!def) return 'Friends';
  if (typeof def.category === 'string' && def.category.trim()) return def.category.trim();
  // Legacy fallbacks if category omitted
  if (def.id === 'chrispyni') return 'Main';
  if (def.id === 'nixie' || def.id === 'noct') return 'Wife';
  return 'Friends';
}

/** Debug/UI label: only the Wife category gets a "(wife)" tag. */
function categoryTag(def) {
  return categoryOf(def) === 'Wife' ? 'wife' : null;
}

function labeledName(def, name) {
  const n = name || def.name || def.id;
  const tag = categoryTag(def);
  return tag ? `${n} (${tag})` : n;
}

/**
 * Group character defs/ids by category. Built-ins Main → Wife → Friends first (even if empty),
 * then other custom categories alphabetically. Within a group, stable by id.
 * characters: { id: def } map.
 * Returns [{ category, items: def[] }]
 */
function groupByCategory(characters, opts = {}) {
  const includeEmpty = opts.includeEmpty !== false;
  const map = new Map();
  for (const cat of BUILTIN) map.set(cat, []);
  for (const def of Object.values(characters || {})) {
    if (!def || def.remove) continue;
    const cat = categoryOf(def);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(def);
  }
  for (const list of map.values()) list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const customs = [...map.keys()].filter((k) => !BUILTIN.includes(k)).sort((a, b) => a.localeCompare(b));
  const order = [...BUILTIN, ...customs];
  const out = [];
  for (const cat of order) {
    const items = map.get(cat) || [];
    if (!items.length && (!includeEmpty || !BUILTIN.includes(cat))) continue;
    out.push({ category: cat, items });
  }
  return out;
}

module.exports = { BUILTIN, categoryOf, categoryTag, labeledName, groupByCategory };
