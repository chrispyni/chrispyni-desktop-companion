// Pure geometry used for drawing, hit-testing AND click-through, so they can never disagree.
'use strict';
const inRect = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** Rect of the sprite as drawn: frame opaque bounds (ob, frame px) placed at feet anchor, scale, flip, y-offset (levitation). */
function spriteRect({ x, y, scale, anchor, frame, ob, facing = 1, lift = 0 }) {
  const b = ob || { x: 0, y: 0, w: frame.w, h: frame.h };
  const left = facing < 0 ? x + anchor.x * scale - (b.x + b.w) * scale : x - anchor.x * scale + b.x * scale;
  return { x: left, y: y - lift - anchor.y * scale + b.y * scale, w: b.w * scale, h: b.h * scale };
}
/** Should the overlay capture the mouse at (x,y)? Only over real things; never "everywhere". */
function wantsCapture(x, y, { sprites = [], uiRects = [], dragging = false } = {}) {
  if (dragging) return true;
  return sprites.some((r) => inRect(r, x, y)) || uiRects.some((r) => inRect(r, x, y));
}
/** A click at (x,y) closes the chat when it is open and the click is outside the chat box. */
function chatShouldClose(chatOpen, chatRect, x, y) { return !!chatOpen && !inRect(chatRect, x, y); }
module.exports = { inRect, spriteRect, wantsCapture, chatShouldClose };
