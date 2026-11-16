// The drawing of the "next" arrow: an arrow on the middle of a small dial, and
// round it the page as a ring, cut into one arc for each sheet.
//
// Everything is drawn about the middle of the dial, the point (0, 0), in CSS
// pixels at the size the button is shown. js/sheets.js gives the drawing a box
// that begins at minus half its size, so the middle of the drawing is the
// middle of the button whatever the button's own layout does. This file only
// works the shapes out, so that they can be checked without a page
// (tests/dial.test.mjs).

const TAU = Math.PI * 2;

/**
 * The sizes of the dial.
 *   size:   the button, across
 *   ring:   the radius of the ring, to the middle of its line
 *   inked:  how thick the ring is where the page has been read (its thickest)
 *   gap:    the space between two arcs, measured along the ring
 *   stroke: how thick the arrow's line is
 *   slide:  how far the arrow slides, out and back in, when it is pressed
 */
export const DIAL = Object.freeze({ size: 52, ring: 25, inked: 2, gap: 2.4, stroke: 1.7, slide: 8 });

/** The arrow, pointing down: a shaft and two wings, and the box they fill. */
export const ARROW = Object.freeze({
  d: 'M0 -7V7M-5.5 1.5L0 7L5.5 1.5',
  box: Object.freeze({ left: -5.5, right: 5.5, top: -7, bottom: 7 }),
});

// Three places is a thousandth of a pixel. The "+ 0" turns a negative zero into a plain zero.
const tidy = (value) => Number(value.toFixed(3)) + 0;

/**
 * A ring cut into equal arcs, clockwise from 12 o'clock. The gaps are centred
 * on the cuts, so the first cut is at 12 o'clock itself.
 * @param {number} count   how many arcs
 * @param {number} radius  of the ring
 * @param {number} gap     the space between two arcs, measured along the ring
 * @returns {string[]} one SVG path for each arc, about (0, 0)
 */
export function ringArcs(count, radius, gap) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`a ring needs a whole number of arcs, one or more, not ${count}`);
  if (!(radius > 0)) throw new RangeError(`a ring needs a radius above zero, not ${radius}`);
  if (!(gap >= 0)) throw new RangeError(`the gap between two arcs cannot be ${gap}`);
  if (count * gap >= TAU * radius) throw new RangeError(`${count} gaps of ${gap} leave nothing of a ring ${(TAU * radius).toFixed(1)} round`);

  const at = (angle) => `${tidy(radius * Math.sin(angle))} ${tidy(-radius * Math.cos(angle))}`;
  const arcTo = (angle, large = 0) => `A${radius} ${radius} 0 ${large} 1 ${at(angle)}`;
  // One arc cannot start and end on the same point, so a whole circle is two halves.
  if (count === 1 && gap === 0) return [`M${at(0)}${arcTo(Math.PI)}${arcTo(0)}Z`];

  const share = TAU / count;
  const half = gap / radius / 2;
  return Array.from({ length: count }, (_, index) => {
    const from = index * share + half;
    const to = (index + 1) * share - half;
    return `M${at(from)}${arcTo(to, to - from > Math.PI ? 1 : 0)}`;
  });
}
