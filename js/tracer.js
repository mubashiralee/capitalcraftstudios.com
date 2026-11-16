// Draws the ornaments on the sheets in front of the reader: the band of lines
// at the head of each sheet, the rosettes, the floor under the phones.
//
// The arithmetic is in js/trace.js. This file measures where each ornament
// lies in the window, runs its small film while it is there, and wipes it once
// it has gone, so that it is drawn afresh on every visit to its sheet.
//
// An ornament's lines are the paths in it that carry the class "trace". Each
// has a length of 1 (pathLength) and one dash as long as itself, so a line is
// drawn by sliding that dash along it. Until this file takes hold of them the
// lines are simply there, fully drawn: that is what a reader sees if the
// drawing cannot start.

import { reduceMotion } from './motion.js';
import { advance, present, sharesAt } from './trace.js';

/** The longest step of time one frame may stand for, in milliseconds: a film does not leap after a stall. */
const LONGEST_FRAME = 50;

/**
 * @param {object} how
 * @param {() => number} how.pace  how fast the page lives just now: 1 runs each film in its own duration
 * @returns {{ add: (el: Element, film: { duration: number, pens?: boolean }) => void, relay: () => void, redraw: (el: Element) => void }}
 *   `add` puts an ornament in the tracer's care; call `relay` after drawing any of them anew, or
 *   `redraw` after putting a new drawing in one of them, to have that one drawn from its first line.
 */
export function startTracer({ pace }) {
  const items = [];
  let frame = 0;
  let looking = 0;
  let last = 0;

  /** Find an ornament's lines as they are now, and give each its pen if the ornament has pens. */
  function gather(item) {
    item.lines = [...item.el.querySelectorAll('.trace')];
    item.lengths = item.pens ? item.lines.map((line) => line.getTotalLength()) : [];
    for (const old of item.el.querySelectorAll('.trace__pen')) old.remove(); // the lines may be the ones we had
    item.nibs = [];
    if (item.pens && item.lines.length > 0) {
      const drawing = item.lines[0].ownerSVGElement;
      item.nibs = item.lines.map(() => {
        const nib = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        nib.setAttribute('class', 'trace__pen');
        nib.setAttribute('r', '2.3');
        nib.setAttribute('visibility', 'hidden');
        drawing.append(nib);
        return nib;
      });
    }
    item.shown = -1;
  }

  /** Dress an ornament for where its film is. */
  function show(item) {
    const moment = reduceMotion.matches ? 1 : item.moment;
    if (moment === item.shown || item.lines.length === 0) return;
    item.shown = moment;
    sharesAt(moment, item.lines.length).forEach((share, index) => {
      // A shade over 1 keeps the round end of an undrawn line off the page.
      item.lines[index].setAttribute('stroke-dashoffset', ((1 - share) * 1.004).toFixed(4));
      const nib = item.nibs[index];
      if (!nib) return;
      const writing = share > 0 && share < 1;
      nib.setAttribute('visibility', writing ? 'visible' : 'hidden');
      if (writing) {
        const at = item.lines[index].getPointAtLength(share * item.lengths[index]);
        nib.setAttribute('cx', at.x.toFixed(1));
        nib.setAttribute('cy', at.y.toFixed(1));
      }
    });
  }

  /** See which ornaments are in front of the reader now. */
  function look() {
    const viewport = window.innerHeight;
    // Measure them all first, then change the page: the browser lays the page out once.
    const boxes = items.map((item) => item.el.getBoundingClientRect());
    items.forEach((item, index) => {
      const { top, bottom, width } = boxes[index];
      const covered = item.sheet !== null && item.sheet.hasAttribute('data-covered');
      // An ornament with no size is not on the page at all (its part of the page is not shown).
      item.here = width > 0 && present({ top, bottom }, viewport, { covered, was: item.here });
      if (!item.here && item.moment !== 0) {
        item.moment = 0;
        show(item);
      }
    });
    run();
  }

  function tick(now) {
    frame = 0;
    const ms = Math.min(LONGEST_FRAME, Math.max(0, now - last)) * pace();
    last = now;
    for (const item of items) {
      if (!item.here || item.moment >= 1) continue;
      item.moment = advance(item.moment, true, ms, item.duration);
      show(item);
    }
    run();
  }

  /** Keep the frames coming while any film is running. */
  function run() {
    if (frame || reduceMotion.matches || document.hidden) return;
    if (!items.some((item) => item.here && item.moment < 1)) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const lookSoon = () => {
    if (looking) return;
    looking = requestAnimationFrame(() => {
      looking = 0;
      look();
    });
  };

  window.addEventListener('scroll', lookSoon, { passive: true });
  window.addEventListener('resize', lookSoon);
  document.addEventListener('visibilitychange', lookSoon);
  reduceMotion.addEventListener('change', () => {
    for (const item of items) {
      item.shown = -1;
      show(item);
    }
    lookSoon();
  });

  return {
    add(el, { duration, pens = false }) {
      if (!(duration > 0)) throw new RangeError(`an ornament's film must take some time, not ${duration}`);
      const sheet = el.closest('.sheet');
      const item = { el, sheet, duration, pens, lines: [], lengths: [], nibs: [], moment: 0, here: false, shown: -1 };
      items.push(item);
      // js/sheets.js says when another sheet has covered this one, or has come off it again.
      if (sheet && !items.some((other) => other !== item && other.sheet === sheet)) sheet.addEventListener('sheetcover', lookSoon);
      gather(item);
      show(item);
      lookSoon();
    },

    relay() {
      for (const item of items) {
        gather(item);
        show(item);
      }
      lookSoon();
    },

    redraw(el) {
      const item = items.find((each) => each.el === el);
      if (!item) throw new RangeError('That ornament is not in the tracer\'s care.');
      gather(item);
      item.moment = 0;
      show(item);
      lookSoon();
    },
  };
}
