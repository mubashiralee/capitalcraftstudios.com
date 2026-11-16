// Where things stand round the Hub's mind on the screen: the names of its stages, set out as on
// the plate of a star chart, and the wire that runs from a held release to the page's own button.
//
// Screen numbers only. Nothing here knows the mind's shape (js/cortex.js) or touches the page
// (js/hub.js does both), so the same code runs in Node (tests/callouts.test.mjs).

/** How the names keep clear of the mind and of each other, in pixels unless it says otherwise. */
export const NAMES = Object.freeze({
  pad: 12, // how far a name stands off the edge of the mind
  gap: 6, // the least room between two names
  spare: 8, // the extra room a name wants before it goes back to its own place
  crown: 0.9, // how near the top or the foot of the mind a name may stand, as a share of half its height
  across: 0.12, // how far past the middle a region must go before its name changes sides, as a share of half the mind's width
});

/** A name's seat: its own place beside its region, or moved aside to one side of a name that is in its way. */
export const SEAT = Object.freeze({ home: 0, above: 1, below: 2, left: 3, right: 4 });

const touches = (a, b, room) => a.left < b.right + room && b.left < a.right + room && a.top < b.bottom + room && b.top < a.bottom + room;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** A box moved by as little as keeps it whole inside the room. */
function kept(box, room) {
  const dx = clamp(box.left, room.left, Math.max(room.left, room.right - (box.right - box.left))) - box.left;
  const dy = clamp(box.top, room.top, Math.max(room.top, room.bottom - (box.bottom - box.top))) - box.top;
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}

/**
 * A name's own place: beside the mind, level with its region, as the names on an engraved
 * plate stand in a column either side of the figure. The mind is taken as an ellipse, and the
 * name starts `pad` beyond its edge at that height, so that every corner of the name is clear of it.
 * @param {number} side -1 to the left of the mind, 1 to the right
 */
function homeOf(region, plate, side) {
  const half = plate.tall / 2 / plate.down;
  const level = clamp((region.y - plate.y) / plate.down, -NAMES.crown, NAMES.crown);
  // The mind is widest at its middle: the edge to keep clear of is the one at whichever of the
  // name's top and bottom is nearer that.
  const widest = level > half ? level - half : level < -half ? level + half : 0;
  const edge = plate.across * Math.sqrt(1 - widest * widest);
  // Beyond the edge, or beyond the region itself if that pokes out further.
  const reach = Math.max(edge, (region.x - plate.x) * side) + NAMES.pad;
  const left = side > 0 ? plate.x + reach : plate.x - reach - region.wide;
  const top = plate.y + level * plate.down - plate.tall / 2;
  return { left, top, right: left + region.wide, bottom: top + plate.tall };
}

/** The same box, moved the least it can be to stand `gap` clear of `other` on one side of it. */
function beside(box, other, seat) {
  const room = NAMES.gap + 1e-6; // a hair more, so that rounding never leaves the two touching
  let dx = 0;
  let dy = 0;
  if (seat === SEAT.above) dy = other.top - room - box.bottom;
  else if (seat === SEAT.below) dy = other.bottom + room - box.top;
  else if (seat === SEAT.left) dx = other.left - room - box.right;
  else dx = other.right + room - box.left;
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy, moved: Math.hypot(dx, dy) };
}

/** How far out from the middle of the mind the corner of a box nearest it is: 1 on the mind's edge, less inside it. */
function clearance(box, plate) {
  let least = Infinity;
  for (const x of [box.left, box.right]) for (const y of [box.top, box.bottom]) least = Math.min(least, Math.hypot((x - plate.x) / plate.across, (y - plate.y) / plate.down));
  return least;
}

/**
 * Where each stage's name goes.
 *
 * Each has a place of its own (see `homeOf`) on the side of the mind its region is on, kept
 * whole inside the room there is. Names are seated nearest region first. One whose place would
 * touch a name already seated is moved aside: above, below, left or right of the name in its
 * way, whichever is the least move that does not bring it in over the mind, out of the room or
 * against another name. One with nowhere to stand is not shown.
 *
 * A name does not dither. It changes sides only once its region is well past the middle. It
 * keeps its own place until it truly touches another, and once moved it stays on the side it
 * was moved to, going back to its own place only when there is room to spare.
 *
 * @param {{ x: number, y: number, depth: number, wide: number, was?: { shown: boolean, seat: number, side: number } }[]} regions
 *   where each region is on the screen, how far from the viewer (less is nearer), how wide its
 *   name is, and how the name stood last time
 * @param {{ x: number, y: number, across: number, down: number, tall: number, room: { left: number, top: number, right: number, bottom: number } }} plate
 *   the middle of the mind on the screen and half its size each way, how tall a name is, and
 *   the room the names must stay inside
 * @returns {{ shown: boolean, seat: number, side: number, x: number, y: number, tipX: number, tipY: number }[]}
 *   for each region, in the order given: whether its name is shown, its seat, which side of the
 *   mind it is on (-1 left, 1 right), the top left corner of the name, and the point on it
 *   nearest the region, where its leader ends
 */
export function layNames(regions, plate) {
  const order = regions.map((_, index) => index).sort((a, b) => regions[a].depth - regions[b].depth || a - b);
  const seated = [];
  const names = new Array(regions.length);

  for (const index of order) {
    const region = regions[index];
    const over = (region.x - plate.x) / plate.across; // how far to the right of the middle its region is
    const side = region.was?.side && over * region.was.side > -NAMES.across ? region.was.side : over < 0 ? -1 : 1;
    // A name that has just changed sides has no seat to keep: it starts again.
    const was = region.was?.shown && region.was.side === side ? region.was.seat : -1;
    const home = kept(homeOf(region, plate, side), plate.room);
    const clear = (box, room) => !seated.some((other) => touches(box, other, room));

    let box = null;
    let seat = SEAT.home;
    if (clear(home, was === SEAT.home ? NAMES.gap : NAMES.gap + NAMES.spare)) {
      box = home;
    } else {
      // Moved aside, a name comes no further in over the mind than its own place was: not at all, where there is room.
      const least = Math.min(1, clearance(home, plate)) - 1e-9;
      const sides = [];
      for (const other of seated) {
        if (!touches(home, other, NAMES.gap + NAMES.spare)) continue;
        for (const way of [SEAT.above, SEAT.below, SEAT.left, SEAT.right]) {
          const moved = beside(home, other, way);
          const whole = moved.left >= plate.room.left && moved.right <= plate.room.right && moved.top >= plate.room.top && moved.bottom <= plate.room.bottom;
          if (whole && clearance(moved, plate) >= least && clear(moved, NAMES.gap)) sides.push({ way, moved });
        }
      }
      // The side it was moved to last time, if that still serves; otherwise the least move.
      sides.sort((a, b) => (b.way === was) - (a.way === was) || a.moved.moved - b.moved.moved || a.way - b.way);
      if (sides.length > 0) {
        box = sides[0].moved;
        seat = sides[0].way;
      }
    }

    if (!box) {
      names[index] = { shown: false, seat: SEAT.home, side, x: home.left, y: home.top, tipX: home.left, tipY: home.top };
      continue;
    }
    seated.push(box);
    names[index] = {
      shown: true,
      seat,
      side,
      x: box.left,
      y: box.top,
      tipX: clamp(region.x, box.left, box.right),
      tipY: clamp(region.y, box.top, box.bottom),
    };
  }
  return names;
}

/**
 * The point on the edge of the button that a wire from `from` arrives at, and the way out from
 * the button there. From beside the button the wire comes to the middle of its near end; from
 * above or below, to its top or bottom edge, as nearly under `from` as its round ends allow.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} button
 * @param {{ x: number, y: number }} from
 * @returns {{ x: number, y: number, nx: number, ny: number }}
 */
export function port(button, from) {
  const beside = Math.max(button.left - from.x, from.x - button.right, 0);
  const over = Math.max(button.top - from.y, from.y - button.bottom, 0);
  if (beside >= over) {
    const right = from.x > (button.left + button.right) / 2;
    return { x: right ? button.right : button.left, y: (button.top + button.bottom) / 2, nx: right ? 1 : -1, ny: 0 };
  }
  const round = (button.bottom - button.top) / 2; // its ends are half rounds: keep off them
  const above = from.y < (button.top + button.bottom) / 2;
  return { x: clamp(from.x, button.left + round, button.right - round), y: above ? button.top : button.bottom, nx: 0, ny: above ? -1 : 1 };
}

/**
 * The wire from the gate to the button: a curve that sets off towards the button and comes in to
 * it square on, from outside.
 * @param {{ x: number, y: number }} gate
 * @param {{ x: number, y: number, nx: number, ny: number }} end  from `port`
 * @returns {number[][]} the four points of a cubic Bézier curve: start, two handles, end
 */
export function wire(gate, end) {
  const length = Math.hypot(end.x - gate.x, end.y - gate.y);
  return [
    [gate.x, gate.y],
    [gate.x + (end.x - gate.x) * 0.28, gate.y + (end.y - gate.y) * 0.28],
    [end.x + end.nx * length * 0.45, end.y + end.ny * length * 0.45],
    [end.x, end.y],
  ];
}

/** The point `t` (0 to 1) of the way along a wire. */
export function wireAt(line, t, out = [0, 0]) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  out[0] = a * line[0][0] + b * line[1][0] + c * line[2][0] + d * line[3][0];
  out[1] = a * line[0][1] + b * line[1][1] + c * line[2][1] + d * line[3][1];
  return out;
}

/**
 * Whether a name is under an open card, or closer to it than `air`: it then goes out, and comes
 * back when the card shuts, so that no name is cut in half by a card's edge.
 * @param {{ left: number, top: number, right: number, bottom: number }} name
 * @param {{ left: number, top: number, right: number, bottom: number }} card
 */
export function underCard(name, card, air = NAMES.pad) {
  return name.left < card.right + air && card.left < name.right + air && name.top < card.bottom + air && card.top < name.bottom + air;
}
