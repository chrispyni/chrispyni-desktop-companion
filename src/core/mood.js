// Per-character moods that drift over time and react to events.
'use strict';
const DEFAULT_MOODS = ['happy', 'pouty', 'sleepy', 'jealous', 'smug', 'calm', 'bored', 'playful', 'loving'];

class MoodState {
  /**
   * @param {object} profile character.json "personality": { moods:[], baseMood, drift:{mood:weight}, reactions:{event:{mood:delta}} }
   */
  constructor(profile = {}, rng = Math.random) {
    this.rng = rng;
    this.moods = profile.moods || DEFAULT_MOODS;
    this.base = profile.drift || Object.fromEntries(this.moods.map((m) => [m, 1]));
    this.reactions = profile.reactions || {};
    this.levels = Object.fromEntries(this.moods.map((m) => [m, this.base[m] ?? 0.5]));
    this.current = profile.baseMood || this.moods[0];
    this.levels[this.current] = (this.levels[this.current] || 0) + 2;
    this.lockedUntil = 0;
  }
  /** Slowly pull levels toward base weights, add noise, re-pick the dominant mood. dt seconds. */
  tick(dt, now = Date.now()) {
    const k = Math.min(1, dt / 120);
    for (const m of this.moods) {
      const b = this.base[m] ?? 0.5;
      this.levels[m] += (b - this.levels[m]) * k + (this.rng() - 0.5) * 0.08 * Math.sqrt(dt);
      if (this.levels[m] < 0) this.levels[m] = 0;
    }
    if (now >= this.lockedUntil) this._pick();
    return this.current;
  }
  _pick() {
    let best = this.current, bv = -1;
    for (const m of this.moods) if (this.levels[m] > bv) { bv = this.levels[m]; best = m; }
    const changed = best !== this.current; this.current = best; return changed;
  }
  /** React to an event name (e.g. "app:game", "chat", "ignored", "summon", "room", "low_mana"). */
  react(event) {
    const r = this.reactions[event];
    if (!r) return false;
    for (const [m, d] of Object.entries(r)) if (m in this.levels) this.levels[m] = Math.max(0, this.levels[m] + d);
    return this._pick();
  }
  /** Force a mood (from bot reply or cheat). Holds for `holdSec`. */
  set(mood, holdSec = 90, now = Date.now()) {
    if (!mood) return false;
    if (!(mood in this.levels)) { this.moods.push(mood); this.levels[mood] = 0; }
    const top = Math.max(...Object.values(this.levels));
    this.levels[mood] = top + 1.5; this.current = mood; this.lockedUntil = now + holdSec * 1000; return true;
  }
  toJSON() { return { current: this.current, levels: this.levels }; }
  load(j) { if (j && j.levels) { Object.assign(this.levels, j.levels); this.current = j.current || this.current; } }
}

// Mood -> animation used while idle (character.json "moodAnims" can override).
const MOOD_ANIM = { happy: 'happy', playful: 'happy', loving: 'happy', pouty: 'pout', jealous: 'pout', sleepy: 'sleep', bored: 'sit', smug: 'idle', calm: 'idle' };
function animForMood(mood, overrides = {}) { return overrides[mood] || MOOD_ANIM[mood] || 'idle'; }

module.exports = { MoodState, DEFAULT_MOODS, animForMood };
