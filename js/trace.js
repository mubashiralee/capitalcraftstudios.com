// Small films: the ornaments on the sheets below the plate are drawn in front
// of the reader when their part of the page arrives.
//
// The plate at the top of the page is drawn as a film of ten lines
// (js/film.js). The ornaments further down (the band of lines at the head of
// each sheet, the rosettes beside the services, the floor under the Money
// Tycoon phones) are each a few lines too, and each gets a short film of its
// own: its lines are drawn one after another, in time, starting when the
// ornament comes into the window. When it has left the window, or another
// sheet has covered its sheet, it is wiped, so that it is made afresh the next
// time the reader comes to it.
//
// Pure numbers, no page. js/tracer.js measures the page and moves the lines;
// tests/trace.test.mjs checks these sums.

/** Each line starts this much of the film after the one before, when there are few enough lines for that. */
export const LAG = 0.09;

/** An ornament arrives once its top edge is above this share of the window's height. */
export const ARRIVE = 0.88;

/** However many lines there are, the last one starts no later than this, so each has at least two fifths of the film. */
const LAST_START = 0.6;

function real(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a real number, not ${value}`);
  return value;
}

/** A pen that sets off gently, travels at very nearly one speed, and stops gently. Half done at half time. */
const pen = (t) => t + 0.8 * (t * t * (3 - 2 * t) - t);

/**
 * How much of each line is drawn at a moment of the film.
 * @param {number} moment  0 as the film starts, 1 as it ends (before and after, the lines stay as they are)
 * @param {number} count   how many lines the ornament has
 * @returns {number[]} for each line, in the order they are drawn, the share of it that is drawn: 0 to 1
 */
export function sharesAt(moment, count) {
  real(moment, 'the moment');
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`an ornament has a whole number of lines, one or more, not ${count}`);
  const lag = count > 1 ? Math.min(LAG, LAST_START / (count - 1)) : 0;
  const span = 1 - lag * (count - 1); // how much of the film one line takes
  return Array.from({ length: count }, (_, line) => {
    const t = (moment - line * lag) / span;
    return t <= 0 ? 0 : t >= 1 ? 1 : pen(t);
  });
}

/**
 * Is an ornament there, in front of the reader?
 * @param {{ top: number, bottom: number }} box  where it lies in the window, in pixels from the window's top
 * @param {number} viewport  the window's height
 * @param {{ covered?: boolean, was?: boolean }} [how]  whether another sheet covers its sheet, and whether it was there a moment ago
 */
export function present({ top, bottom }, viewport, { covered = false, was = false } = {}) {
  real(top, 'the top');
  real(bottom, 'the bottom');
  if (bottom < top) throw new RangeError(`a box's bottom (${bottom}) cannot be above its top (${top})`);
  if (!(real(viewport, 'the window height') > 0)) throw new RangeError(`the window height must be more than 0, not ${viewport}`);
  if (covered) return false;
  const showing = top < viewport && bottom > 0;
  // It has to come well in before it counts as there; once there, it stays while any of it shows.
  return was ? showing : showing && top < ARRIVE * viewport;
}

/**
 * Move a film on.
 * @param {number} moment    where the film is, 0 to 1
 * @param {boolean} here     whether its ornament is there (see `present`)
 * @param {number} ms        the time that has passed, in milliseconds
 * @param {number} duration  how long the whole film takes, in milliseconds
 * @returns {number} where the film is now: further on, or back at 0 if the ornament is away
 */
export function advance(moment, here, ms, duration) {
  real(moment, 'the moment');
  if (!(real(ms, 'the time passed') >= 0)) throw new RangeError(`time does not run backwards: ${ms}`);
  if (!(real(duration, 'the duration') > 0)) throw new RangeError(`a film must take some time, not ${duration}`);
  return here ? Math.min(1, moment + ms / duration) : 0;
}
