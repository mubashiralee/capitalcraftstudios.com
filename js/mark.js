// The mark engraved in the seal's stone: the full logo, white on black, on a
// square canvas that spans the seal's face. The plate's shader reads it as a
// picture (js/plate.js); MARK_BOX in js/stamps.js is its box, from the same sizes.
//
// Browser only (it draws on a canvas). The page uses it, and so does
// tools/check-plate.mjs, so that the check looks at the very mark the page shows.

import { LOGO, placeLogo } from './logo.js';
import { MARK_REACH } from './stamps.js';

/**
 * @param {number} size  the canvas's width and height in pixels
 * @returns {HTMLCanvasElement}
 */
export function markCanvas(size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`the mark's canvas needs a whole size in pixels, not ${size}`);
  const mark = document.createElement('canvas');
  mark.width = size;
  mark.height = size;
  const ctx = mark.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const { scale, dx, dy } = placeLogo((MARK_REACH * size) / 2, size / 2, size / 2);
  ctx.setTransform(scale, 0, 0, scale, dx, dy);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(LOGO.d));
  return mark;
}
