// Where each body on the hero's orbits sits (js/site.config.js lists them).
//
// The edition gives every orbit one starting angle and one speed (js/edition.js).
// An orbit may carry more than one body: they share its speed and are spaced
// evenly round it, so they never catch each other up or bunch together.
// Pure numbers, no page: js/main.js turns these into places on the screen.

/**
 * @param {{ orbit: number }[]} bodies  in the order they are listed
 * @param {number} orbits  how many orbits the plate has
 * @returns {{ orbit: number, share: number }[]}  for each body, its orbit and how far round
 *   from that orbit's starting angle it rides, as a share of a whole turn (0 to under 1)
 */
export function seatBodies(bodies, orbits) {
  const riders = Array.from({ length: orbits }, () => []);
  bodies.forEach((body, index) => {
    if (!Number.isInteger(body.orbit) || body.orbit < 0 || body.orbit >= orbits) {
      throw new RangeError(`body ${index} rides orbit ${body.orbit}; the plate has orbits 0 to ${orbits - 1}`);
    }
    riders[body.orbit].push(index);
  });
  const seats = new Array(bodies.length);
  for (const [orbit, on] of riders.entries()) {
    on.forEach((index, place) => {
      seats[index] = { orbit, share: place / on.length };
    });
  }
  return seats;
}

/**
 * How a body is drawn, in pixels at full size (css/site.css draws it to the same numbers, and
 * tests/bodies.test.mjs holds the two together): `dot` is half the room its jewel or ring takes,
 * bezel and all; `arm` is how far from the middle of the dot its name begins; `tall` is half the
 * height of a name.
 */
export const BODY = Object.freeze({ dot: 12, arm: 18, tall: 13 });

/**
 * The room a body keeps, in pixels. Its jewel keeps `jewel` clear of the words it passes (across,
 * and above and below). Its name is words itself, and words crowd words, so it keeps the wider
 * `name`. Two bodies keep `apart` from each other, jewel from jewel and name from either. `spare` is how much more than all of
 * that a body needs before it comes back, or before its name changes side: a body right on the
 * line would otherwise flicker as the plate leans.
 */
export const ROOM = Object.freeze({
  jewel: Object.freeze({ across: 14, down: 8 }),
  name: Object.freeze({ across: 22, down: 16 }),
  apart: 8,
  spare: 10,
});

/** Is box `a` closer to box `b` than this much room across, and this much up and down? */
const near = (a, b, across, down) => a.right + across > b.left && a.left - across < b.right && a.bottom + down > b.top && a.top - down < b.bottom;

/** Does the box lie wholly on the stage, this far in from every edge? */
const within = (box, stage, inset) => box.left >= stage.left + inset && box.right <= stage.right - inset && box.top >= stage.top + inset && box.bottom <= stage.bottom - inset;

/** The smallest box that holds both: everywhere a box passes on its way from one to the other. */
const spanning = (a, b) => ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) });

/** The box a body's jewel or ring takes. */
function dotBox(body) {
  const reach = BODY.dot * body.size;
  return { left: body.x - reach, right: body.x + reach, top: body.y - reach, bottom: body.y + reach };
}

/** The box a body's name takes on that side of it. */
function nameBox(body, side) {
  const from = BODY.arm * body.size;
  const to = (BODY.arm + body.label) * body.size;
  const tall = BODY.tall * body.size;
  return side === 'right'
    ? { left: body.x + from, right: body.x + to, top: body.y - tall, bottom: body.y + tall }
    : { left: body.x - to, right: body.x - from, top: body.y - tall, bottom: body.y + tall };
}

/**
 * Which bodies show this frame, and which side each carries its name on.
 *
 * A jewel shows wherever it is whole on the stage, clear of the words, and clear of the jewels
 * listed before it: two never ride one on top of the other, and the later listed makes way.
 *
 * Its name is a second question. It comes out on the right, its home, when it fits there; on the
 * left when only that side has room (near the right edge of a window, mostly); and nowhere when
 * neither has, so the jewel rides on alone. A name fits where it is on the stage, clear of the
 * words, clear of every other jewel that shows, and clear of the other names. A name that is out
 * keeps its side for as long as it fits there, and it keeps its place: a new name comes out only
 * clear of the names that are out, whichever body they belong to. The order of the list settles
 * it only between two names that are out and meet, or two that are new: the first listed has it.
 *
 * Nothing comes out for a moment. A body that is hidden, or a name that is, comes out only if it
 * will stay clear all the way through the places in `soon`, the next few seconds of its orbit
 * (the way between two places is taken as the box that holds both, so a corner it would graze
 * counts); one that is out stays out for as long as it truly fits. Bodies on different orbits pass
 * each other, so that holds between bodies too. A hidden jewel waits while one listed before it is
 * about to pass. A hidden name waits while its own jewel is about to go (a name goes when its jewel
 * goes), and while any other jewel, or any name already placed, is about to cross where it would
 * lie. A jewel that is hidden now may be out by the time it passes, so it counts as well, but only
 * where it could be out: not behind the words, and not off the stage.
 *
 * @param {{ x: number, y: number, size: number, label: number,
 *           was?: { shown: boolean, side: 'right' | 'left' | null },
 *           soon?: { x: number, y: number, size: number }[] }[]} bodies
 *   where each rides (pixels on the stage), how much perspective enlarges it there, how wide its
 *   name is at full size (0 when names are not shown), what this said of it last frame, and
 *   the places it will ride through in the next few seconds, nearest first
 * @param {{ stage: Box, words: Box[], room: typeof ROOM }} scene  `stage` is the part of the hero
 *   a body may be in; `words` are its lines of words and its controls, as measured
 * @returns {{ shown: boolean, side: 'right' | 'left' | null }[]}
 */
export function showBodies(bodies, { stage, words, room }) {
  /** Is the box on the stage and clear of the words, keeping this room and this much to spare? */
  const fits = (box, keep, spare) => within(box, stage, spare) && !words.some((each) => near(box, each, keep.across + spare, keep.down + spare));
  /** Every box a thing will be in: where the body is now, then at each of its places in `soon`. */
  const wayOf = (body, boxAt) => [body, ...(body.soon ?? [])].map(boxAt);
  /** Will it still fit all the way along? The way between two places is taken as the box that holds both. */
  const staysClear = (way, keep) => way.slice(1).every((box, step) => fits(spanning(way[step], box), keep, 0));
  /**
   * Will two things keep apart all the way along? Each is taken at the same moments, for as far
   * ahead as both ways are given. `counts` leaves out the steps at which the other cannot be in the way.
   */
  const staysApart = (way, other, counts = () => true) =>
    way.slice(1).every((box, step) => step + 1 >= other.length || !counts(step) || !near(spanning(way[step], box), spanning(other[step], other[step + 1]), room.apart, room.apart));

  const jewels = bodies.map((body) => wayOf(body, dotBox)); // the first box of each is where the jewel is now
  const placed = [];
  /**
   * Could that jewel be out during this step of its way? Only where it fits at one end of the step
   * or the other: behind the words or off the stage it is hidden, and nothing has to keep clear of it.
   */
  const mayShow = (each) => (step) => fits(jewels[each][step], room.jewel, 0) || fits(jewels[each][step + 1], room.jewel, 0);
  /**
   * Will this jewel stay out all the way along: clear of the words, and of every jewel listed
   * before it? Those do not make way for it.
   */
  const jewelStays = (index) => staysClear(jewels[index], room.jewel) && jewels.slice(0, index).every((earlier, each) => staysApart(jewels[index], earlier, mayShow(each)));

  bodies.forEach((body, index) => {
    const stays = Boolean(body.was?.shown); // a body that is out stays out up to the line
    const spare = stays ? 0 : room.spare;
    const apart = room.apart + spare;
    const shown =
      fits(jewels[index][0], room.jewel, spare) &&
      !placed.some((other, earlier) => other.shown && near(jewels[index][0], jewels[earlier][0], apart, apart)) &&
      (stays || jewelStays(index));
    placed.push({ shown, side: null });
  });

  const names = []; // the way of each name placed so far
  const nameWay = (body, side) => wayOf(body, (at) => nameBox({ ...at, label: body.label }, side));
  /** Does the name fit there now: on the stage, and this much clear of the words, of every other jewel that shows, and of the names placed so far? */
  const nameFits = (way, index, spare) =>
    fits(way[0], room.name, spare) &&
    !jewels.some((other, each) => each !== index && placed[each].shown && near(way[0], other[0], room.apart + spare, room.apart + spare)) &&
    !names.some((name) => near(way[0], name[0], room.apart + spare, room.apart + spare));
  /**
   * Will the name stay out all the way along? Its own jewel must (a name goes when its jewel goes),
   * and it must keep clear of the words, of every other jewel, and of the names placed so far.
   */
  const nameStays = (way, index) =>
    jewelStays(index) && staysClear(way, room.name) && jewels.every((other, each) => each === index || staysApart(way, other, mayShow(each))) && names.every((name) => staysApart(way, name));
  const carries = (body, index) => placed[index].shown && body.label > 0;
  const put = (index, side, way) => {
    placed[index].side = side;
    names.push(way);
  };

  // The names that are out keep their sides first, up to the line. Where two of them meet, the first listed stays.
  bodies.forEach((body, index) => {
    const side = body.was?.side; // only a body that showed had one
    if (!side || !carries(body, index)) return;
    const way = nameWay(body, side);
    if (nameFits(way, index, 0)) put(index, side, way);
  });
  // Then the names that are not out, each on the right, its home, or on the left when only that side
  // has room: wherever it will stay clear of all of those, whichever body they belong to.
  bodies.forEach((body, index) => {
    if (placed[index].side || !carries(body, index)) return;
    for (const side of ['right', 'left']) {
      const way = nameWay(body, side);
      if (nameFits(way, index, room.spare) && nameStays(way, index)) {
        put(index, side, way);
        return;
      }
    }
  });
  return placed;
}

/**
 * A jewel's glint, in hundredths of the jewel's width: `reach` is how far it may lie from where
 * it rests, `lift` is how far above the middle it rests, and `full` is how far off the light
 * must be (in pixels) before the glint is out as far as it goes.
 */
const GLINT = Object.freeze({ reach: 20, lift: 8, full: 160 });

/**
 * Where the glint lies on a jewel: toward the plate's light, so that the jewels and the plate are
 * lit by the one lamp. The lamp hangs over the desk and the desk is seen from the front, so
 * straight under it the glint rests a little above the middle of the stone; from further off it
 * moves out to the light's side and stops short of the jewel's edge.
 *
 * @param {{ x: number, y: number }} at  where the jewel rides
 * @param {{ x: number, y: number }} light  where the light is, in the same pixels
 * @returns {{ x: number, y: number }}  the middle of the glint, in hundredths of the jewel's
 *   width and height from its top left corner; whole numbers, so that the page is restyled only
 *   when the glint has really moved
 */
export function glintToward(at, light) {
  const across = light.x - at.x;
  const down = light.y - at.y;
  const far = Math.hypot(across, down);
  const out = far === 0 ? 0 : (GLINT.reach * Math.min(1, far / GLINT.full)) / far;
  return { x: Math.round(50 + across * out), y: Math.round(50 - GLINT.lift + down * out) };
}
