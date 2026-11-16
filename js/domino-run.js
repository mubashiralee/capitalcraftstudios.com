// The Domino Reactor run as numbers: where each domino stands, and when each
// one falls. Nothing here touches the page, so the same code runs in the
// browser (js/dominoes.js draws it) and in Node (tests/domino-run.test.mjs).
//
// Lengths are in domino heights: a domino is 1 tall.

const TAU = Math.PI * 2;

export const DOMINO = Object.freeze({ width: 0.5, thickness: 0.14, height: 1 });

export const SPACING = 0.4; // from one domino to the next along the run
export const LANE = 0.78; // between neighbouring arms of the spiral
export const CORE = 1.9; // how close to the middle the run comes before it turns round

/** The fewest dominoes that reach round the S-shaped turn in the middle at the proper spacing. */
export const SHORTEST_RUN = Math.ceil((Math.PI * CORE) / SPACING) + 1;

/** How far a fallen domino leans (from upright) once it rests on the next one. */
export const REST = Math.acos(DOMINO.thickness / SPACING);
/** The last domino has nothing to rest on: it falls flat. */
export const FLAT = Math.PI / 2;
/** How far a domino has tipped when it touches the next one. */
const TOUCH = Math.asin((SPACING - DOMINO.thickness) / DOMINO.height);

export const STRUCK = 0.16; // seconds a struck domino takes to come to rest
export const TIPPED = 0.42; // seconds for the one a finger pushes
export const LAST = 0.3; // seconds for the last one to fall flat

const OPENING = 80; // dominoes a second when a wave sets off
const SHORTEST = 6; // seconds a very short run takes end to end
const LONGEST = 12; // seconds a run of ten thousand takes

/** A time later than any the page will reach: "this domino has not been told to fall". */
export const NEVER = 1e9;

// How a domino moves once it starts. Read by the shader in js/dominoes.js.
const AS_STRUCK = 0; // fast at first (it was hit), slowing as it leans on the next
const AS_DROPPED = 1; // slow at first, speeding up (it tips under its own weight)

/** How far out a run of `count` dominoes reaches: where its first and last dominoes stand. */
export function radiusOf(count) {
  const length = (count - 1) * SPACING;
  const turn = Math.PI * CORE; // the S-shaped turn is two half circles of radius CORE / 2
  return Math.sqrt(CORE * CORE + (Math.max(0, length - turn) * LANE) / Math.PI);
}

/**
 * Lay a run of `count` dominoes in a double spiral: in to the middle along one
 * arm, round an S-shaped turn, and out again between the turns of the first.
 *
 * @param {{ count: number, spin?: 1 | -1, phase?: number }} run
 *   `spin` is which way the spiral winds; `phase` is the angle it starts from.
 * @returns {{ count: number, radius: number, places: Float32Array }}
 *   `places` holds four numbers per domino: x, y, and the direction it faces
 *   (and will fall) as a cosine and a sine. `radius` is how far out the run reaches.
 */
export function layRun({ count, spin = 1, phase = 0 }) {
  if (!Number.isInteger(count) || count < SHORTEST_RUN) {
    throw new RangeError(`A run needs at least ${SHORTEST_RUN} dominoes to get round its turn; asked for ${count}.`);
  }
  const outer = radiusOf(count);
  const sweep = ((outer - CORE) * Math.PI) / LANE; // radians the inward arm turns through
  const radiusAt = (angle) => outer - (LANE / Math.PI) * angle;

  // The run as a fine polyline.
  const fine = 0.05;
  const xs = [];
  const ys = [];
  const add = (x, y) => {
    xs.push(x);
    ys.push(y);
  };
  const arm = (angle, side) => {
    const radius = radiusAt(angle);
    add(side * radius * Math.cos(phase + spin * angle), side * radius * Math.sin(phase + spin * angle));
  };

  for (let angle = 0; angle < sweep; angle += fine / radiusAt(angle)) arm(angle, 1);
  const end = phase + spin * sweep; // where the inward arm stops
  const half = CORE / 2;
  const steps = Math.ceil((Math.PI * half) / fine);
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI;
    add(half * (Math.cos(end) + Math.cos(end + spin * a)), half * (Math.sin(end) + Math.sin(end + spin * a)));
  }
  for (let i = 1; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI;
    add(half * (Math.cos(end - spin * a) - Math.cos(end)), half * (Math.sin(end - spin * a) - Math.sin(end)));
  }
  // The outward arm is the inward arm turned half way round, walked backwards.
  for (let angle = sweep; angle > 0; angle -= fine / radiusAt(angle)) arm(angle, -1);
  arm(0, -1);

  // Walk the polyline, setting a domino down every `gap`.
  let total = 0;
  for (let i = 1; i < xs.length; i += 1) total += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  const gap = total / (count - 1);
  const places = new Float32Array(count * 4);
  let segment = 1;
  let before = 0; // length of the run up to the start of this segment
  let span = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]);
  for (let k = 0; k < count; k += 1) {
    const at = Math.min(k * gap, total);
    while (segment < xs.length - 1 && before + span < at) {
      before += span;
      segment += 1;
      span = Math.hypot(xs[segment] - xs[segment - 1], ys[segment] - ys[segment - 1]);
    }
    const along = span > 0 ? Math.min(1, (at - before) / span) : 0;
    const dx = xs[segment] - xs[segment - 1];
    const dy = ys[segment] - ys[segment - 1];
    places[k * 4] = xs[segment - 1] + dx * along;
    places[k * 4 + 1] = ys[segment - 1] + dy * along;
    places[k * 4 + 2] = dx / span;
    places[k * 4 + 3] = dy / span;
  }
  return { count, radius: outer, places };
}

/**
 * How long after a wave sets off it reaches the domino `steps` places on.
 * A wave starts at a pace the eye can follow and keeps gathering speed, so a
 * run of any length is over in seconds: this is a chain reaction, after all.
 *
 * @param {number} count how many dominoes the whole run has
 * @returns {(steps: number) => number} seconds
 */
export function wavePace(count) {
  const whole = SHORTEST + (LONGEST - SHORTEST) * Math.min(1, count / 10000);
  const need = (whole * OPENING) / count; // ln(1 + surge) / surge must come to this
  if (need >= 1) return (steps) => steps / OPENING; // short enough to run at one pace
  let low = 0;
  let high = 1e6;
  for (let i = 0; i < 60; i += 1) {
    const surge = (low + high) / 2;
    if (Math.log1p(surge) / surge > need) low = surge;
    else high = surge;
  }
  const surge = (low + high) / 2;
  const scale = whole / Math.log1p(surge);
  return (steps) => scale * Math.log1p((surge * steps) / count);
}

/**
 * Who falls when. Each domino has a time it starts to fall (NEVER while it
 * stands); pushing one sets off a wave that writes the times of those after it.
 *
 * @param {number} count
 */
export function createSchedule(count) {
  const pace = wavePace(count);
  // Four numbers per domino, in the form the shader wants: when it starts to
  // fall, how far it falls, how long that takes, and how it moves (see AS_*).
  const falls = new Float32Array(count * 4);
  let busyUntil = -Infinity;

  const set = (index, start, hand) => {
    const last = index === count - 1;
    const base = index * 4;
    falls[base] = start;
    falls[base + 1] = last ? FLAT : REST;
    falls[base + 2] = last ? LAST : hand ? TIPPED : STRUCK;
    falls[base + 3] = last || hand ? AS_DROPPED : AS_STRUCK;
    busyUntil = Math.max(busyUntil, start + falls[base + 2]);
  };

  const standAll = () => {
    for (let index = 0; index < count; index += 1) {
      set(index, NEVER, false);
    }
    busyUntil = -Infinity;
  };
  standAll();

  return {
    count,
    falls,
    standAll,

    /** The time by which every domino told to fall so far has come to rest. */
    get busyUntil() {
      return busyUntil;
    },

    /** True while domino `index` has not started to fall at time `now`. */
    standing: (index, now) => falls[index * 4] > now,

    /**
     * Push domino `index` over at time `now`. It tips, strikes the next, and
     * the wave runs on until the end of the run or until it meets dominoes
     * that another wave will reach (or has reached) first.
     * @returns {boolean} false if that domino was already falling or down.
     */
    push(index, now) {
      if (!(index >= 0 && index < count) || falls[index * 4] <= now) return false;
      set(index, now, true);
      const strike = now + TIPPED * Math.sqrt(TOUCH / REST); // when the pushed one reaches the next
      for (let next = index + 1; next < count; next += 1) {
        const when = strike + pace(next - index - 1);
        if (when >= falls[next * 4]) break;
        set(next, when, false);
      }
      return true;
    },

    /** How many dominoes have started to fall by time `now`. */
    fallen(now) {
      let down = 0;
      for (let index = 0; index < count; index += 1) {
        if (falls[index * 4] <= now) down += 1;
      }
      return down;
    },

    /** The first domino along the run that is still standing at `now`, or -1. */
    firstStanding(now) {
      for (let index = 0; index < count; index += 1) {
        if (falls[index * 4] > now) return index;
      }
      return -1;
    },

    /**
     * The standing domino nearest to the point (x, y) on the floor, if one is
     * within `reach` of it; otherwise -1.
     * @param {Float32Array} places as returned by layRun
     */
    nearestStanding(places, x, y, now, reach) {
      let best = -1;
      let bestGap = reach * reach;
      for (let index = 0; index < count; index += 1) {
        if (falls[index * 4] <= now) continue;
        const dx = places[index * 4] - x;
        const dy = places[index * 4 + 1] - y;
        const gap = dx * dx + dy * dy;
        if (gap < bestGap) {
          bestGap = gap;
          best = index;
        }
      }
      return best;
    },
  };
}

/** How many dominoes suit a stage `width` CSS pixels wide, each standing `grain` pixels tall. */
export function countFor(width, grain, { fewest = 1200, most = 10000 } = {}) {
  const radius = (0.46 * width) / grain;
  const fits = Math.round((Math.PI * radius * radius) / (SPACING * LANE));
  return Math.min(most, Math.max(fewest, fits));
}

export { TAU };
