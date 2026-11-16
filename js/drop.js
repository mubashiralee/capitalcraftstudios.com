// The seal's stone is dropped onto the finished plate.
//
// While the plate's lines are being drawn there is no stone: the patterns have
// the page to themselves. When the last line is done the stone is let go from
// above. Nothing here says how it should move. It is worked out: a disc of
// stone, a sheet of paper, gravity, the paper's push and its friction, followed
// a twelve-thousandth of a second at a time. Let go with a little spin, as a
// hand would, the stone falls, strikes the paper with its rim, rears up, and
// wobbles round and round on its rim the way a spun coin does, leaning less and
// going round faster, until it lies flat.
//
// A hard table has no middle, so where a dropped stone ends up is its own
// affair. But the same drop happens the same way wherever on the table it is
// let go and whichever way the table is turned. So the whole drop is moved,
// after the fact, to end square in the seal's seat with its mark upright: it is
// let go from the one spot above the plate that brings it home.
//
// Not every way of letting a stone go is worth watching: most land dead, some
// go right over. TAKES is the book of those that were tried and kept. An
// edition is dealt one take, an angle to turn it to, and the way round it goes.
//
// Pure numbers, no page and no WebGL: js/main.js keeps the stone's time and
// hands each moment's pose to js/plate.js, which draws it. tests/drop.test.mjs
// holds the working-out to the physics.
//
// Lengths are in plate units (the plate's radius is 1), times in seconds,
// angles in radians. The sums that follow the stone use only + - * / and square
// roots, which every browser rounds the same way: a take is the same drop,
// to the last bit, wherever it is run.

import { PLATE } from './edition.js';

/** The stone: a disc as wide as the seal's seat. */
export const STONE = Object.freeze({ radius: PLATE.seal, thick: 0.03 });

const A = STONE.radius;
const HALF = STONE.thick / 2;
// How hard the stone is to turn, for each unit of its mass: about a line across its face, and about its own axis.
const I1 = (A * A) / 4 + (STONE.thick * STONE.thick) / 12;
const I3 = (A * A) / 2;

/** The world the stone is dropped in. */
export const WORLD = Object.freeze({
  /** How hard things fall. A stone this size falling this slowly is seen at about a third of its true speed. */
  gravity: 12,
  /**
   * How far above the paper the stone's middle is when it is let go: beyond the top of the page
   * on every screen, so that it always comes in over the page's edge (tests/drop.test.mjs works
   * this out for the tallest page, a small phone's).
   */
  height: 3.6,
  /** How long one step of the working-out is. */
  tick: 1 / 12000,
  /** How hard the paper pushes back on a rim that presses into it, for each unit of depth and of the stone's mass. */
  stiff: 1.2e6,
  /** How much of a blow the paper swallows: the push it adds against a rim coming down, for each unit of speed ... */
  damp: 75,
  /** ... and for each unit of speed and of depth. A rim driven deep by a hard blow loses most of it; a rim rolling lightly round loses little. */
  soak: 160000,
  /** How well the paper holds a rim that would slide: the most friction, as a share of the push. */
  grip: 0.6,
  /** A slide slower than this is held less than fully, so that a stone at rest is not shaken by its own friction. */
  creep: 1e-3,
  /** How much slower than that again, the harder the rim is pressed (the steps stay steady). */
  ease: 8,
  /** How often the stone's place is written down. */
  frame: 1 / 240,
  /** After this long a stone that is still moving is given up on. */
  longest: 6,
});

/**
 * The book of takes: ways of letting the stone go that were tried and kept
 * (tests/drop.test.mjs says what a take must do to stay in the book).
 *   lean    the way its face is tipped as it is let go: how far its face's own
 *           "up" leans across the plate (the sine of the lean), x then y
 *   spin    how fast it is turning about its own axis, radians a second
 *   tumble  how fast it is turning about two lines across its face
 *   drift   how fast it is moving across the plate
 */
export const TAKES = Object.freeze([
  { lean: [0, -0.265], spin: 14.059, tumble: [3.897, -4.835], drift: [0.046, -0.088] },
  { lean: [0, -0.344], spin: -11.118, tumble: [-4.596, 3.187], drift: [0.07, -0.061] },
  { lean: [0, -0.258], spin: -14.285, tumble: [-4.424, 4.079], drift: [-0.025, 0.08] },
  { lean: [0, -0.053], spin: 6.002, tumble: [-0.818, -3.749], drift: [-0.066, 0.099] },
  { lean: [0, -0.374], spin: -7.018, tumble: [-4.225, -0.679], drift: [-0.063, -0.011] },
  { lean: [0, -0.084], spin: -6.11, tumble: [1.318, 3.804], drift: [-0.052, -0.015] },
  { lean: [0, -0.393], spin: 7.104, tumble: [-3.905, 2.024], drift: [-0.076, 0.074] },
  { lean: [0, -0.13], spin: -5.109, tumble: [-3.082, -3.508], drift: [-0.061, -0.007] },
  { lean: [0, -0.399], spin: 10.273, tumble: [-4.054, -1.501], drift: [-0.006, -0.065] },
  { lean: [0, -0.049], spin: 5.686, tumble: [-3.831, 0.939], drift: [0.064, -0.079] },
  { lean: [0, -0.353], spin: 8.906, tumble: [4.948, 2.083], drift: [-0.031, -0.084] },
  { lean: [0, -0.368], spin: -6.404, tumble: [-3.683, -3.016], drift: [-0.029, -0.057] },
  { lean: [0, -0.301], spin: 5.255, tumble: [3.056, 0.106], drift: [-0.001, 0.042] },
  { lean: [0, -0.316], spin: 10.386, tumble: [-4.908, -1.189], drift: [0.03, 0.021] },
  { lean: [0, -0.3], spin: -14.117, tumble: [4.214, 4.108], drift: [0.058, -0.028] },
  { lean: [0, -0.255], spin: 6.081, tumble: [4.213, -0.521], drift: [-0.026, 0.031] },
  { lean: [0, -0.265], spin: -5.772, tumble: [-4.088, -1.712], drift: [-0.001, 0.017] },
  { lean: [0, -0.29], spin: -6.887, tumble: [-3.999, 0.122], drift: [-0.096, -0.055] },
  { lean: [0, -0.272], spin: 5.165, tumble: [2.95, 3.027], drift: [0.029, 0.061] },
  { lean: [0, -0.133], spin: 9.954, tumble: [1.625, -4.936], drift: [-0.069, -0.068] },
  { lean: [0, -0.046], spin: -5.263, tumble: [-1.701, -4.097], drift: [0.048, 0.05] },
  { lean: [0, -0.274], spin: -5.706, tumble: [-4.272, -2.648], drift: [0.094, 0.028] },
  { lean: [0, -0.355], spin: 5.931, tumble: [-3.75, 0.01], drift: [-0.067, -0.058] },
  { lean: [0, -0.233], spin: 9.53, tumble: [2.974, -3.507], drift: [0.033, -0.036] },
].map((take) => Object.freeze({ lean: Object.freeze(take.lean), spin: take.spin, tumble: Object.freeze(take.tumble), drift: Object.freeze(take.drift) })));

/** How long before it is still the stone's last tremble is smoothed into stillness. */
const SETTLE = 0.16;
/** How long it takes to come into view as it is let go (out of sight, above the page). */
const APPEAR = 0.1;
/** Once it is still, how long the light takes to cross it. */
const GLINT = 0.7;
/** Taken away again, how high it is lifted, and from what share of the lift it fades. */
const LIFT = Object.freeze({ height: 3.2, fade: 0.45 });

/** How many numbers are written down for each moment: where the stone's middle is (3), and how it is turned (4). */
const TRACK = 7;

// Thirty-two places round a rim: half a step either side of its lowest point, and on round.
// Found with square roots alone (a right angle halved four times).
const RIM = 32;
const RIM_COS = new Float64Array(RIM);
const RIM_SIN = new Float64Array(RIM);
{
  const cos4 = Math.sqrt(0.5);
  const cos8 = Math.sqrt((1 + cos4) / 2);
  const cos16 = Math.sqrt((1 + cos8) / 2);
  const sin16 = Math.sqrt((1 - cos8) / 2);
  let cos = Math.sqrt((1 + cos16) / 2);
  let sin = Math.sqrt((1 - cos16) / 2);
  for (let place = 0; place < RIM; place += 1) {
    RIM_COS[place] = cos;
    RIM_SIN[place] = sin;
    const next = cos * cos16 - sin * sin16;
    sin = sin * cos16 + cos * sin16;
    cos = next;
  }
}

function real(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${name} must be a real number, not ${value}`);
  return value;
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Let the stone go, and follow it until it lies still.
 *
 * @param {{ lean: number[], spin: number, tumble: number[], drift: number[] }} release  how it is let go (see TAKES)
 * @param {object} [world]  the world it falls in (WORLD); `audit: true` also writes down its energy at each moment
 * @returns {{ track: Float64Array, energy: Float64Array | null, count: number, every: number, landed: number, rested: number, deepest: number, tipped: number }}
 *   track    for each moment written down: where the stone's middle is (x, y, z) and how it is turned (a quaternion: w, x, y, z)
 *   count    how many moments were written down, `every` seconds apart
 *   landed   when it first touched the paper (-1: never)
 *   rested   when it was still (-1: it was given up on first)
 *   deepest  the furthest any point of a rim went into the paper
 *   tipped   the least its face ever looked up: 1 flat, 0 on edge, below 0 gone over
 */
export function letGo(release, world = WORLD) {
  const { gravity, height, tick, stiff, damp, soak, grip, creep, ease, frame, longest } = world;
  const { lean, spin, tumble, drift } = release;
  for (const [value, name] of [[lean[0], 'the lean'], [lean[1], 'the lean'], [spin, 'the spin'], [tumble[0], 'the tumble'], [tumble[1], 'the tumble'], [drift[0], 'the drift'], [drift[1], 'the drift']]) real(value, name);
  if (lean[0] * lean[0] + lean[1] * lean[1] >= 1) throw new RangeError(`a face cannot lean by more than a right angle: ${lean}`);

  const every = Math.round(frame / tick);
  const steps = Math.round(longest / tick);
  const room = Math.floor(steps / every) + 2;
  const track = new Float64Array(room * TRACK);
  const energy = world.audit ? new Float64Array(room) : null;

  // How it is turned: its face up, tipped over by `lean`, not twisted.
  let qw = Math.sqrt((1 + Math.sqrt(1 - lean[0] * lean[0] - lean[1] * lean[1])) / 2);
  let qx = -lean[1] / (2 * qw);
  let qy = lean[0] / (2 * qw);
  let qz = 0;
  // Where its middle is, how fast that is moving, and how fast it is turning about its own three axes.
  let cx = 0;
  let cy = 0;
  let cz = height;
  let vx = drift[0];
  let vy = drift[1];
  let vz = 0;
  let w1 = tumble[0];
  let w2 = tumble[1];
  let w3 = spin;

  // The points of the rims that are bearing on the paper at this step.
  const px = new Float64Array(2 * RIM);
  const py = new Float64Array(2 * RIM);
  const pz = new Float64Array(2 * RIM);
  const ux = new Float64Array(2 * RIM);
  const uy = new Float64Array(2 * RIM);
  const push = new Float64Array(2 * RIM);

  let count = 0;
  let landed = -1;
  let rested = -1;
  let quiet = 0;
  let deepest = 0;
  let tipped = 1;
  for (let step = 0; step < steps; step += 1) {
    // The stone's own axes as the plate sees them (e1, e2 across its face; n the way its face looks),
    // and how it is turning, over the plate.
    const xx = qx * qx;
    const yy = qy * qy;
    const zz = qz * qz;
    const xy = qx * qy;
    const xz = qx * qz;
    const yz = qy * qz;
    const wx = qw * qx;
    const wy = qw * qy;
    const wz = qw * qz;
    const e1x = 1 - 2 * (yy + zz);
    const e1y = 2 * (xy + wz);
    const e1z = 2 * (xz - wy);
    const e2x = 2 * (xy - wz);
    const e2y = 1 - 2 * (xx + zz);
    const e2z = 2 * (yz + wx);
    const nx = 2 * (xz + wy);
    const ny = 2 * (yz - wx);
    const nz = 1 - 2 * (xx + yy);
    const ox = w1 * e1x + w2 * e2x + w3 * nx;
    const oy = w1 * e1y + w2 * e2y + w3 * ny;
    const oz = w1 * e1z + w2 * e2z + w3 * nz;
    if (nz < tipped) tipped = nz;

    // What pushes and turns it: its weight, and the paper wherever a rim is in it.
    let fx = 0;
    let fy = 0;
    let fz = -gravity;
    let tx = 0;
    let ty = 0;
    let tz = 0;
    let sprung = 0;
    const slope = Math.sqrt(nx * nx + ny * ny); // the sine of its lean
    if (cz - HALF * Math.abs(nz) - A * slope < 0) {
      // Two lines across the face: one straight down its slope, one level.
      let ax;
      let ay;
      let az;
      let bx;
      let by;
      let bz;
      if (slope > 1e-9) {
        ax = (nz * nx) / slope;
        ay = (nz * ny) / slope;
        az = -slope;
        bx = ny * az - nz * ay;
        by = nz * ax - nx * az;
        bz = nx * ay - ny * ax;
      } else {
        ax = e1x; ay = e1y; az = e1z;
        bx = e2x; by = e2y; bz = e2z;
      }
      let total = 0;
      let held = 0;
      for (let side = -1; side <= 1; side += 2) { // the rim of its underside, then the rim of its face
        const mx = side * HALF * nx;
        const my = side * HALF * ny;
        const mz = side * HALF * nz;
        if (cz + mz - A * slope >= 0) continue; // this rim is clear of the paper
        for (let place = 0; place < RIM; place += 1) {
          const rx = mx + A * (RIM_COS[place] * ax + RIM_SIN[place] * bx);
          const ry = my + A * (RIM_COS[place] * ay + RIM_SIN[place] * by);
          const rz = mz + A * (RIM_COS[place] * az + RIM_SIN[place] * bz);
          const depth = -(cz + rz);
          if (depth <= 0) continue;
          if (depth > deepest) deepest = depth;
          sprung += 0.5 * stiff * depth * depth;
          const sinking = -(vz + ox * ry - oy * rx); // how fast this point of the rim is going down
          const force = depth * (stiff + soak * sinking) + damp * sinking;
          if (force <= 0) continue; // paper pushes; it does not pull
          px[held] = rx;
          py[held] = ry;
          pz[held] = rz;
          ux[held] = vx + oy * rz - oz * ry; // how fast it is sliding across the paper
          uy[held] = vy + oz * rx - ox * rz;
          push[held] = force;
          total += force;
          held += 1;
        }
      }
      if (held > 0) {
        if (landed < 0) landed = step * tick;
        // Friction: against the slide, `grip` times the push, less when it is hardly sliding at all.
        const slow = Math.max(creep, ease * grip * total * tick);
        for (let point = 0; point < held; point += 1) {
          const force = push[point];
          const hold = (grip * force) / Math.sqrt(ux[point] * ux[point] + uy[point] * uy[point] + slow * slow);
          const gx = -hold * ux[point];
          const gy = -hold * uy[point];
          fx += gx;
          fy += gy;
          fz += force;
          tx += py[point] * force - pz[point] * gy;
          ty += pz[point] * gx - px[point] * force;
          tz += px[point] * gy - py[point] * gx;
        }
      }
    }

    if (step % every === 0) {
      const at = count * TRACK;
      track[at] = cx;
      track[at + 1] = cy;
      track[at + 2] = cz;
      track[at + 3] = qw;
      track[at + 4] = qx;
      track[at + 5] = qy;
      track[at + 6] = qz;
      if (energy) {
        // Of moving, of turning, of height, and what is held in the paper it is pressing into.
        energy[count] = 0.5 * (vx * vx + vy * vy + vz * vz) + 0.5 * (I1 * (w1 * w1 + w2 * w2) + I3 * w3 * w3) + gravity * cz + sprung;
      }
      count += 1;
    }

    // One step on: speeds first, then places with the new speeds.
    vx += fx * tick;
    vy += fy * tick;
    vz += fz * tick;
    const t1 = tx * e1x + ty * e1y + tz * e1z;
    const t2 = tx * e2x + ty * e2y + tz * e2z;
    const t3 = tx * nx + ty * ny + tz * nz;
    const next1 = w1 + (tick * ((I1 - I3) * w2 * w3 + t1)) / I1;
    const next2 = w2 + (tick * ((I3 - I1) * w3 * w1 + t2)) / I1;
    w3 += (tick * t3) / I3;
    w1 = next1;
    w2 = next2;
    cx += vx * tick;
    cy += vy * tick;
    cz += vz * tick;
    const dw = -0.5 * (qx * w1 + qy * w2 + qz * w3) * tick;
    const dx = 0.5 * (qw * w1 + qy * w3 - qz * w2) * tick;
    const dy = 0.5 * (qw * w2 + qz * w1 - qx * w3) * tick;
    const dz = 0.5 * (qw * w3 + qx * w2 - qy * w1) * tick;
    qw += dw;
    qx += dx;
    qy += dy;
    qz += dz;
    const size = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
    qw /= size;
    qx /= size;
    qy /= size;
    qz /= size;

    // Still: down, flat, and not moving or turning to speak of, for a twenty-fifth of a second.
    if (landed >= 0 && slope < 1.5e-3 && vx * vx + vy * vy + vz * vz < 4e-6 && w1 * w1 + w2 * w2 + w3 * w3 < 4e-4) {
      quiet += 1;
      if (quiet * tick > 0.04) {
        rested = (step + 1) * tick;
        break;
      }
    } else quiet = 0;
  }
  return { track, energy, count, every: every * tick, landed, rested, deepest, tipped };
}

/**
 * What a fall was like: the numbers a take is judged by.
 *
 * @returns {{ rest: number, wobble: number, hush: number, turns: number, oneWay: number, rock: number, peak: number, bounce: number, strays: number, tipped: number }}
 *   rest    how long after landing it was still (NaN: it never was)
 *   wobble  how long after landing it last leaned by more than four degrees
 *   hush    ... and by more than two thirds of a degree: after this it looks flat
 *   turns   how many times its lean went round (the sign is the way)
 *   oneWay  how much of that going round was the one way: 1 all of it
 *   rock    how much its lean swells and dips as it goes round: 0 a steady wobble like a spun coin's, 1 rocking to and fro through flat
 *   peak    the furthest it leaned once down (as a sine)
 *   bounce  the highest its lowest point came back up off the paper
 *   strays  how far from where it landed it ended
 *   tipped  the least its face ever looked up (see letGo)
 */
export function judge(fall) {
  const { track, count, every, landed, rested } = fall;
  const first = Math.max(0, Math.ceil(landed / every));
  const leans = [];
  let turns = 0;
  let withIt = 0;
  let against = 0;
  let last = 0;
  let seen = false;
  let wobble = 0;
  let hush = 0;
  let bounce = 0;
  for (let index = first; index < count; index += 1) {
    const at = index * TRACK;
    const qw = track[at + 3];
    const qx = track[at + 4];
    const qy = track[at + 5];
    const qz = track[at + 6];
    const nx = 2 * (qx * qz + qw * qy);
    const ny = 2 * (qy * qz - qw * qx);
    const nz = 1 - 2 * (qx * qx + qy * qy);
    const slope = Math.sqrt(nx * nx + ny * ny);
    const since = index * every - landed;
    leans.push(slope);
    if (slope > 0.035) {
      const way = Math.atan2(ny, nx);
      if (seen) {
        let turned = way - last;
        turned -= 2 * Math.PI * Math.round(turned / (2 * Math.PI));
        turns += turned / (2 * Math.PI);
        if (turned > 0) withIt += turned;
        else against -= turned;
      }
      last = way;
      seen = true;
    } else seen = false;
    if (slope > 0.07) wobble = since;
    if (slope > 0.012) hush = since;
    const lowest = track[at + 2] - HALF * Math.abs(nz) - A * slope;
    if (since > 0.02 && lowest > bounce) bounce = lowest;
  }

  // The furthest it leans once it is down, and after that the swells and dips of its lean.
  let peak = 0;
  let peakAt = 0;
  for (let index = Math.round(0.06 / every); index < leans.length; index += 1) {
    if (leans[index] > peak) {
      peak = leans[index];
      peakAt = index;
    }
  }
  let rock = 0;
  let pulses = 0;
  let dip = -1; // the last dip, until the swell after it is found
  for (let index = peakAt + 2; index < leans.length - 2 && pulses < 4 && leans[index] >= 0.03; index += 1) {
    const here = leans[index];
    if (here <= leans[index - 1] && here < leans[index + 1] && here <= leans[index - 2] && here < leans[index + 2]) {
      dip = here;
    } else if (dip >= 0 && here >= leans[index - 1] && here > leans[index + 1] && here >= leans[index - 2] && here > leans[index + 2]) {
      rock += (here - dip) / (here + dip);
      pulses += 1;
      dip = -1;
    }
  }

  const end = (count - 1) * TRACK;
  const start = first * TRACK;
  return {
    rest: rested < 0 ? NaN : rested - landed,
    wobble,
    hush,
    turns,
    oneWay: Math.max(withIt, against) / Math.max(withIt + against, 1e-9),
    rock: pulses > 0 ? rock / pulses : 0,
    peak,
    bounce,
    strays: Math.hypot(track[end] - track[start], track[end + 1] - track[start + 1]),
    tipped: fall.tipped,
  };
}

/** A stone lying in its seat: its underside's middle on the plate's middle, square to the plate. */
const seated = (present, glint) => ({ present, x: 0, y: 0, z: 0, axes: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), glint });

/**
 * The drop an edition is dealt.
 *
 * @param {{ take: number, turn: number, way: 1 | -1 }} deal
 *   take  which take in the book, as a share of the way through it: 0 up to but not 1
 *   turn  the angle the whole drop is turned to, about the plate's middle
 *   way   which way round its wobble goes: 1 anticlockwise seen from above, -1 clockwise
 * @param {object} [world]  the world it falls in (WORLD)
 * @returns {{ lands: number, rests: number, at: (time: number) => Pose }}
 *   lands  how long after it is let go the stone first touches the paper
 *   rests  how long after it is let go it is still
 *   at     where the stone is, `time` seconds after it is let go:
 *     present  0 not there .. 1 wholly there (it comes into view as it is let go)
 *     x, y, z  the middle of its underside: across the plate (its seat is at 0, 0), and above the paper
 *     axes     its own axes as the plate sees them: its right, its up, the way its face looks; nine numbers, in the order a WebGL mat3 is filled
 *     glint    0..1, the light crossing it once it is still
 */
export function castDrop(deal, world = WORLD) {
  const { take, turn, way } = deal;
  real(take, 'the take');
  real(turn, 'the turn');
  if (take < 0 || take >= 1) throw new RangeError(`the take is a share of the way through the book: 0 up to but not 1, not ${take}`);
  if (way !== 1 && way !== -1) throw new RangeError(`the stone goes round one way or the other: 1 or -1, not ${way}`);

  const fall = letGo(TAKES[Math.floor(take * TAKES.length)], world);
  const { track, count, every } = fall;
  if (fall.rested < 0 || fall.tipped < 0.3) {
    // It should not happen: every take in the book is tested. If it does, the plate still gets its seal.
    console.error(`The seal's stone ${fall.rested < 0 ? 'did not come to rest' : 'went over'} (take ${Math.floor(take * TAKES.length)}): it is set in its seat instead of dropped.`);
    return Object.freeze({
      lands: 0,
      rests: 0,
      at(time) {
        if (typeof time !== 'number' || Number.isNaN(time)) throw new RangeError(`the time must be a number, not ${time}`);
        return seated(smooth(time / (4 * APPEAR)), Math.min(1, Math.max(0, time / GLINT)));
      },
    });
  }

  // One more moment, after the last written down: the stone exactly in its seat.
  const rests = count * every;
  const moments = count + 1;
  const path = new Float64Array(moments * TRACK);
  path.set(track.subarray(0, count * TRACK));

  // 1. Turn the stone about its own axis, all through the drop, so that its mark ends upright.
  //    (A disc is the same all the way round: which way its mark points changes nothing of how it moves.)
  const last = (count - 1) * TRACK;
  const twist = Math.sqrt(track[last + 3] * track[last + 3] + track[last + 6] * track[last + 6]);
  const rw = track[last + 3] / twist;
  const rz = -track[last + 6] / twist;
  // 2. The mirror image, if it goes round the other way from the one asked for.
  const mirror = Math.sign(judge(fall).turns) === way ? 1 : -1;
  // 3. Turn the whole drop about the plate's middle, and 4. move it to end on the seat.
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const endX = track[last];
  const endY = track[last + 1];
  for (let index = 0; index < count; index += 1) {
    const at = index * TRACK;
    const x = mirror * (track[at] - endX);
    const y = track[at + 1] - endY;
    path[at] = cos * x - sin * y;
    path[at + 1] = sin * x + cos * y;
    const qw = track[at + 3] * rw - track[at + 6] * rz;
    const qx = track[at + 4] * rw + track[at + 5] * rz;
    const qy = mirror * (track[at + 5] * rw - track[at + 4] * rz);
    const qz = mirror * (track[at + 3] * rz + track[at + 6] * rw);
    path[at + 3] = qw;
    path[at + 4] = cos * qx - sin * qy;
    path[at + 5] = sin * qx + cos * qy;
    path[at + 6] = qz;
  }
  // 5. Smooth its last tremble into stillness: by then it is a hair from flat and from its seat.
  path[count * TRACK + 2] = HALF;
  path[count * TRACK + 3] = 1;
  for (let index = Math.max(0, Math.ceil((rests - SETTLE) / every)); index < count; index += 1) {
    const at = index * TRACK;
    const still = smooth(1 - (rests - index * every) / SETTLE);
    path[at] *= 1 - still;
    path[at + 1] *= 1 - still;
    path[at + 2] += (HALF - path[at + 2]) * still;
    const qw = path[at + 3] + (1 - path[at + 3]) * still;
    const qx = path[at + 4] * (1 - still);
    const qy = path[at + 5] * (1 - still);
    const qz = path[at + 6] * (1 - still);
    const size = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
    path[at + 3] = qw / size;
    path[at + 4] = qx / size;
    path[at + 5] = qy / size;
    path[at + 6] = qz / size;
  }

  return Object.freeze({
    lands: fall.landed,
    rests,
    at(time) {
      if (typeof time !== 'number' || Number.isNaN(time)) throw new RangeError(`the time must be a number, not ${time}`);
      if (time >= rests) return seated(1, Math.min(1, (time - rests) / GLINT));
      // Between the two moments written down either side of this one.
      const along = Math.max(time, 0) / every;
      const before = Math.min(Math.floor(along), moments - 2);
      const share = along - before;
      const a = before * TRACK;
      const b = a + TRACK;
      const near = path[a + 3] * path[b + 3] + path[a + 4] * path[b + 4] + path[a + 5] * path[b + 5] + path[a + 6] * path[b + 6] < 0 ? -1 : 1;
      let qw = path[a + 3] + (near * path[b + 3] - path[a + 3]) * share;
      let qx = path[a + 4] + (near * path[b + 4] - path[a + 4]) * share;
      let qy = path[a + 5] + (near * path[b + 5] - path[a + 5]) * share;
      let qz = path[a + 6] + (near * path[b + 6] - path[a + 6]) * share;
      const size = Math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz);
      qw /= size;
      qx /= size;
      qy /= size;
      qz /= size;
      const nx = 2 * (qx * qz + qw * qy);
      const ny = 2 * (qy * qz - qw * qx);
      const nz = 1 - 2 * (qx * qx + qy * qy);
      return {
        present: smooth(time / APPEAR),
        // The track follows the stone's middle; the plate draws it from the middle of its underside.
        x: path[a] + (path[b] - path[a]) * share - HALF * nx,
        y: path[a + 1] + (path[b + 1] - path[a + 1]) * share - HALF * ny,
        z: path[a + 2] + (path[b + 2] - path[a + 2]) * share - HALF * nz,
        axes: new Float32Array([
          1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy),
          2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx),
          nx, ny, nz,
        ]),
        glint: 0,
      };
    },
  });
}

/**
 * The stone being taken away again, to make room for a new plate: it is lifted
 * straight up from wherever it is, faster and faster, and is gone.
 *
 * @param {Pose} pose   where it is (from a drop's `at`)
 * @param {number} share  0 not lifted .. 1 gone
 */
export function lifted(pose, share) {
  real(share, 'the lift');
  if (share <= 0) return pose;
  const up = Math.min(share, 1);
  return {
    ...pose,
    z: pose.z + LIFT.height * up * up,
    present: pose.present * (1 - smooth((up - LIFT.fade) / (1 - LIFT.fade))),
  };
}

/**
 * The stone's outline as something sees it.
 *
 * Each of its two rims is taken as a thirty-two-sided shape drawn round it, its
 * sides touching the rim: so the outline holds the whole stone, and a hair more
 * at its corners. A picture taken through a lens keeps straight lines straight,
 * so that is as true of the picture as of the stone.
 *
 * @param {Pose} pose  where the stone is (from a drop's `at`)
 * @param {(x: number, y: number, z: number) => [number, number]} project
 *   where on a flat picture a point over the plate shows
 * @returns {[number, number][]}  the corners of its outline in that picture, in order round it
 */
export function silhouette(pose, project) {
  const { x, y, z, axes } = pose;
  const reach = A / RIM_COS[0]; // the corners of a shape whose sides touch the rim stand this far out
  const points = [];
  for (const lift of [0, STONE.thick]) {
    for (let place = 0; place < RIM; place += 1) {
      const c = reach * RIM_COS[place];
      const s = reach * RIM_SIN[place];
      points.push(project(
        x + axes[0] * c + axes[3] * s + axes[6] * lift,
        y + axes[1] * c + axes[4] * s + axes[7] * lift,
        z + axes[2] * c + axes[5] * s + axes[8] * lift,
      ));
    }
  }
  return band(points);
}

/** The tightest band round some points of a flat picture: its corners, in order round it. */
function band(points) {
  const across = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (from, by, to) => (by[0] - from[0]) * (to[1] - from[1]) - (by[1] - from[1]) * (to[0] - from[0]);
  const side = (run) => {
    const kept = [];
    for (const point of run) {
      // A point the band would have to turn back for, or run straight through, is not a corner of it.
      while (kept.length >= 2 && turn(kept[kept.length - 2], kept[kept.length - 1], point) <= 0) kept.pop();
      kept.push(point);
    }
    kept.pop(); // the last point of this side is the first of the other
    return kept;
  };
  return [...side(across), ...side(across.reverse())];
}
