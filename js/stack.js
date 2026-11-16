// The page as a stack of sheets: where each sheet lies at a scroll position.
//
// Every section of the page is a sheet. A sheet scrolls up into the window
// like any block, then holds there (CSS position: sticky does the holding)
// while the next sheet slides over it. This file is the arithmetic of that
// stack, with no page in it, so it can be checked on its own
// (tests/stack.test.mjs). js/sheets.js measures the real sheets, asks this
// file where things are, and dresses the page to match.
//
// All lengths are CSS pixels. "Down the window" means measured from the top
// edge of the window, so 0 is the top edge and `viewport` is the bottom edge.

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * How near counts as there, in pixels. What a browser says of a page is rounded: how tall the page
 * is, how tall the window is and how far the page has scrolled, each in its own way. With the page
 * zoomed those do not agree: Safari at 115% has a page at its foot read as 2 px short of its end.
 * Zoomed far out, one pixel of the screen is several of the page's. And the place worked out for
 * a sheet is out by up to half a pixel for every sheet above it, since each height is given as a
 * whole number. So no place on the page is compared to the pixel: within this much of it is there.
 */
export const NEAR = 8;

function real(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a real number, not ${value}`);
  return value;
}

/**
 * Lay the stack out once, for a given window.
 * @param {object} page
 * @param {number[]} page.heights  the height of each sheet, first to last
 * @param {number} page.viewport   the height of the window
 * @param {number} page.lip        how far a docked sheet stands above the window, so that its rounded top corners are out of sight
 * @param {number} [page.start]    how far down the document the first sheet begins
 * @returns {{heights: number[], viewport: number, lip: number, start: number, natural: number[], dock: number[]}}
 *   natural: where each sheet's top would be in the document with no holding;
 *   dock: how far down the window each sheet's top rests once it holds (never below 0).
 */
export function layStack({ heights, viewport, lip, start = 0 }) {
  if (!Array.isArray(heights) || heights.length === 0) throw new RangeError('a stack needs at least one sheet');
  if (!(real(viewport, 'the window height') > 0)) throw new RangeError(`the window height must be more than 0, not ${viewport}`);
  if (real(lip, 'the lip') < 0) throw new RangeError(`the lip cannot be negative: ${lip}`);
  if (real(start, 'the start') < 0) throw new RangeError(`the start cannot be negative: ${start}`);

  const natural = [];
  const dock = [];
  let top = start;
  heights.forEach((height, index) => {
    if (!(real(height, `the height of sheet ${index}`) > 0)) throw new RangeError(`sheet ${index} has no height: ${height}`);
    natural.push(top);
    // A sheet rests with its lip above the window. One taller than the window keeps
    // scrolling until its foot reaches the window's foot, and rests there instead.
    // (The "+ 0" turns a negative zero into a plain zero.)
    dock.push(Math.min(index === 0 ? 0 : -lip, viewport - height) + 0);
    top += height;
  });
  return Object.freeze({ heights: Object.freeze([...heights]), viewport, lip, start, natural: Object.freeze(natural), dock: Object.freeze(dock) });
}

/**
 * The stack at one scroll position.
 * @returns {{tops: number[], covers: number[], front: number}}
 *   tops: how far down the window each sheet's top is;
 *   covers: how much of the window the following sheet has taken from each sheet, 0 (none) to 1 (all of it);
 *   front: the sheet the reader is looking at (the last one whose top has passed the middle of the window).
 */
export function stackAt(lay, scroll) {
  real(scroll, 'the scroll position');
  const tops = lay.natural.map((natural, index) => Math.max(natural - scroll, lay.dock[index]) + 0);
  const covers = tops.map((_, index) => (index + 1 < tops.length ? clamp((lay.viewport - tops[index + 1]) / lay.viewport, 0, 1) : 0));
  let front = 0;
  for (let index = 1; index < tops.length; index += 1) {
    if (tops[index] <= lay.viewport / 2) front = index;
  }
  return { tops, covers, front };
}

/**
 * Which sheets are out of sight: the sheet after each has risen over it, far enough that its
 * round corners are above the window too. Whatever moves on a sheet out of sight can rest.
 * @param {number[]} tops  how far down the window each sheet's top is, from `stackAt`
 * @returns {boolean[]} one for each sheet; the last is never out of sight
 */
export function outOfSight(lay, tops) {
  // All but risen is risen (see NEAR): what is left of a corner is a sliver a pixel or two wide.
  // But never while the next sheet's top is still in the window, with a strip of this one above it.
  const risen = Math.min(NEAR - lay.lip, 0);
  return tops.map((_, index) => index + 1 < tops.length && tops[index + 1] <= risen);
}

function known(lay, index) {
  if (!Number.isInteger(index) || index < 0 || index >= lay.heights.length) {
    throw new RangeError(`there is no sheet ${index} in a stack of ${lay.heights.length}`);
  }
  return index;
}

/** The last scroll position at which nothing has begun to cover a sheet: its foot is on the window's foot. */
function holdOf(lay, index) {
  return lay.natural[index] + lay.heights[index] - lay.viewport;
}

/**
 * The scroll position that opens a sheet: it has just docked, every sheet
 * before it is covered, and nothing covers it. The first sheet opens at the
 * top of the document.
 */
export function startOf(lay, index) {
  return known(lay, index) === 0 ? 0 : lay.natural[index] + lay.lip;
}

/**
 * The scroll position that shows one point of a sheet.
 * @param {number} offset  how far down its sheet the point is
 * @param {number} [lead]  how far down the window the point should sit, when the sheet can scroll that far
 * @returns {number} a position at which the sheet is docked and uncovered, and the point is in the window
 *   (given that the point lies below the sheet's lip, as everything in a sheet does)
 */
export function showOf(lay, index, offset, lead = 0) {
  known(lay, index);
  real(offset, 'the offset');
  real(lead, 'the lead');
  const wanted = lay.natural[index] + offset - lead;
  // The earliest position wins if a sheet is too short to hold at all.
  return Math.max(startOf(lay, index), Math.min(holdOf(lay, index), wanted));
}

/**
 * Where the "next" arrow goes from a scroll position: the opening of the first
 * sheet still ahead, then the foot of the page, then back to the top.
 * @param {number} end  the furthest the page can scroll
 * @returns {number} the scroll position to go to (0 means back to the top)
 */
export function nextStop(lay, scroll, end) {
  real(scroll, 'the scroll position');
  // A stop all but reached is reached (see NEAR). Were it not, a page at its foot that reads as a
  // little short of its end would be sent to its foot for ever, and never back to the top.
  return stopsOf(lay, end).find((stop) => stop > scroll + NEAR) ?? 0;
}

/** The scroll positions the "next" arrow stops at: the opening of each sheet, then the end of the page. */
function stopsOf(lay, end) {
  real(end, 'the end of the page');
  const stops = lay.heights.map((_, index) => startOf(lay, index));
  stops.push(Math.max(end, stops.at(-1)));
  return stops;
}

/**
 * How much of each sheet's stretch of the page has been read, 0 to 1 each. A
 * sheet's stretch runs from its opening to the opening of the next sheet, and
 * the last runs to the end of the page: from one stop of the "next" arrow to
 * the stop after it, so the ring round the arrow fills one arc for each press.
 * @param {number} end  the furthest the page can scroll
 * @returns {number[]} one share for each sheet, first to last
 */
export function travelled(lay, scroll, end) {
  real(scroll, 'the scroll position');
  const stops = stopsOf(lay, end);
  return lay.heights.map((_, index) => {
    const length = stops[index + 1] - stops[index];
    // A stretch with no length (nothing lies below the last sheet) is read as soon as its sheet opens.
    if (length <= 0) return scroll >= stops[index] ? 1 : 0;
    return clamp((scroll - stops[index]) / length, 0, 1);
  });
}

/** How far a sheet has shrunk back, and how dark it has gone, once the next sheet has taken `cover` of the window. */
export function recede(cover) {
  const taken = clamp(real(cover, 'the cover'), 0, 1);
  return { scale: 1 - 0.055 * taken, shade: 0.64 * taken ** 1.25 };
}
