// The Domino Reactor camera: one film camera on a crane, and the film it
// shoots. Nothing here touches the page or the graphics card, so the same code
// runs in the browser (js/dominoes.js) and in Node (tests/domino-camera.test.mjs).
//
// The film has one rule: the camera is pointed at the dominoes that are
// falling. It waits close behind the first domino. At the push, time slows,
// and the camera's head follows the wave away down the row. Then the crane
// draws back and rises until the whole run is in the picture; as it does, the
// head lets the wave go, a little at a time, and turns to the middle of the
// run, and time gathers speed as it lets go. From there the camera watches
// the wave lap the spiral, rises over it as the laps come faster, closes in
// as the wave closes on the middle, draws back as it runs out again, and
// comes to rest over the fallen run.
//
// It never chases. The crane only moves out, up and slowly round; it is the
// head that turns to follow. And the head never has to turn faster than a
// picture can be read: where following the wave would take more than that,
// the film slows the run's clock instead (see `pace`). While the crane draws
// back the wave stays near the middle of the picture; the head lets it go
// only as the whole run comes in.
//
// Lengths are in domino heights, as in js/domino-run.js. A real domino stands
// about 48 millimetres tall, and the lens is worked out at that scale: this is
// a full-frame camera photographing a table top. So how much of the picture is
// sharp follows from where the camera is, as it does in a photograph: close
// behind one domino only a few are sharp, and from high above they all are.

import { SPACING, STRUCK, TAU } from './domino-run.js';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (from, to, share) => from + (to - from) * share;
const smooth = (from, to, value) => {
  const share = clamp((value - from) / (to - from), 0, 1);
  return share * share * (3 - 2 * share);
};

export const DOMINO_MM = 48; // how tall a real domino stands
export const FRAME_MM = 24; // how tall the film frame is

// ---------------------------------------------------------------------------
// A little matrix arithmetic (4 by 4, in the column order WebGL expects)
// ---------------------------------------------------------------------------

export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

export function perspective(field, aspect, near, far) {
  const f = 1 / Math.tan(field / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** A view with no perspective, as a far-off lamp sees things: a box of the given half sizes. */
export function orthographic(halfWidth, halfHeight, near, far) {
  const out = new Float32Array(16);
  out[0] = 1 / halfWidth;
  out[5] = 1 / halfHeight;
  out[10] = -2 / (far - near);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

/**
 * A camera at `eye` that looks the opposite way to `back` (a direction of any
 * length), with the floor's "up" (z) kept upright. `back` must not point
 * straight up or down.
 */
export function lookAlong(eye, back) {
  const zl = Math.hypot(back[0], back[1], back[2]);
  const zx = back[0] / zl;
  const zy = back[1] / zl;
  const zz = back[2] / zl;
  // x = up cross z, with up = (0, 0, 1)
  const xl = Math.hypot(zy, zx);
  const xx = -zy / xl;
  const xy = zx / xl;
  // y = z cross x
  const yx = -zz * xy;
  const yy = zz * xx;
  const yz = zx * xy - zy * xx;
  return Float32Array.of(
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    0, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  );
}

/** A camera at `eye` looking at `target`. */
export const lookAt = (eye, target) => lookAlong(eye, [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);

/** The inverse of a matrix, or null if it has none. */
export function invert(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  const k = 1 / det;
  return Float32Array.of(
    (a11 * b11 - a12 * b10 + a13 * b09) * k,
    (a02 * b10 - a01 * b11 - a03 * b09) * k,
    (a31 * b05 - a32 * b04 + a33 * b03) * k,
    (a22 * b04 - a21 * b05 - a23 * b03) * k,
    (a12 * b08 - a10 * b11 - a13 * b07) * k,
    (a00 * b11 - a02 * b08 + a03 * b07) * k,
    (a32 * b02 - a30 * b05 - a33 * b01) * k,
    (a20 * b05 - a22 * b02 + a23 * b01) * k,
    (a10 * b10 - a11 * b08 + a13 * b06) * k,
    (a01 * b08 - a00 * b10 - a03 * b06) * k,
    (a30 * b04 - a31 * b02 + a33 * b00) * k,
    (a21 * b02 - a20 * b04 - a23 * b00) * k,
    (a11 * b07 - a10 * b09 - a12 * b06) * k,
    (a00 * b09 - a01 * b07 + a02 * b06) * k,
    (a31 * b01 - a30 * b03 - a32 * b00) * k,
    (a20 * b03 - a21 * b01 + a22 * b00) * k,
  );
}

/** Where the matrix puts a point, after the perspective divide. The fourth number is positive for a point in front of the camera. */
export function through(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    w,
  ];
}

// ---------------------------------------------------------------------------
// The lens
// ---------------------------------------------------------------------------

/** Radians the lens sees from top to bottom, for a focal length in millimetres. */
export const fieldOf = (focal) => 2 * Math.atan(FRAME_MM / 2 / focal);

/**
 * How soft things out of focus are. A point `distance` away is drawn as a
 * disc whose radius, as a share of the picture's height, is
 * `blurOf(lens) * |distance - focus| / distance`.
 *
 * @param {{ focal: number, stop: number, focus: number }} lens
 *   `focal` in millimetres, `stop` the f-number, `focus` the distance that is
 *   sharp, in domino heights.
 */
export function blurOf({ focal, stop, focus }) {
  const length = focal / DOMINO_MM; // the focal length, in domino heights
  if (!(focus > length)) {
    throw new RangeError(`A ${focal} mm lens cannot focus as near as ${focus} domino heights.`);
  }
  const frame = FRAME_MM / DOMINO_MM;
  return (length * length) / (stop * (focus - length)) / frame / 2;
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Shot
 * @property {number[]} eye where the camera is
 * @property {number[]} look what it points at, and is focused on
 * @property {number} focal the lens, in millimetres
 * @property {number} stop the f-number
 * @property {number} lift how far the picture is shifted up, in half picture heights (a shift lens)
 */

/**
 * What the camera sees.
 *
 * @param {Shot} shot
 * @param {{ aspect: number, reach: number }} frame
 *   `aspect` is the picture's width over its height; `reach` is how far from
 *   the middle of the floor there is anything to see.
 * @returns {{ matrix: Float32Array, eye: number[], near: number, far: number, focus: number }}
 *   `focus` is how far away the thing the camera looks at is.
 */
export function viewOf({ eye, look, focal, lift = 0 }, { aspect, reach }) {
  const back = [eye[0] - look[0], eye[1] - look[1], eye[2] - look[2]];
  // Nothing is nearer the lens than the tops of the dominoes under it, or
  // (when it stands outside the floor) than the floor's edge.
  const outside = Math.hypot(eye[0], eye[1]) - reach;
  const near = Math.max(0.2, 0.6 * Math.max(eye[2] - 1.1, outside));
  const far = Math.hypot(eye[0], eye[1], eye[2]) + reach * 1.05 + 2;
  const matrix = multiply(perspective(fieldOf(focal), aspect, near, far), lookAlong(eye, back));
  if (lift) {
    for (let column = 0; column < 4; column += 1) {
      matrix[column * 4 + 1] += lift * matrix[column * 4 + 3];
    }
  }
  return { matrix, eye, near, far, focus: Math.hypot(back[0], back[1], back[2]) };
}

/**
 * Where a ray through the picture meets a level above the floor.
 *
 * @param {Float32Array} matrix the camera
 * @param {number} x across the picture, -1 (left) to 1
 * @param {number} y up the picture, -1 (bottom) to 1
 * @param {number} height the level, in domino heights
 * @returns {{ x: number, y: number } | null} null if the ray never comes down to that level
 */
export function landingOf(matrix, x, y, height) {
  const inverse = invert(matrix);
  if (!inverse) return null;
  const near = through(inverse, x, y, -1);
  const far = through(inverse, x, y, 1);
  const drop = far[2] - near[2];
  if (Math.abs(drop) < 1e-9) return null;
  const along = (height - near[2]) / drop;
  if (along < 0) return null;
  return { x: near[0] + (far[0] - near[0]) * along, y: near[1] + (far[1] - near[1]) * along };
}

const MID = 0.5; // the height the camera looks at when it looks at dominoes: half way up one
const FLOOR = 0.35; // the height the crane turns about, and the camera looks at when it takes in the whole run
const SIDE = 0.9; // how much of the picture's half width the whole floor may fill
const TALL = 1.76; // and how much of its height (of 2)

/**
 * How far back a camera must stand, looking down at the middle of the floor
 * from `pitch` radians, for the whole floor and the dominoes on it to be in
 * the picture; and how far to shift the lens to centre them.
 *
 * @param {{ pitch: number, focal: number, radius: number, reach: number, aspect: number }} scene
 *   `radius` is how far out the dominoes stand; `reach` is the floor's radius.
 * @returns {{ distance: number, lift: number }}
 */
export function wholeFloor({ pitch, focal, radius, reach, aspect }) {
  const rims = [[reach, 0], [radius + 0.4, 1]];
  const measure = (distance) => {
    const eye = [0, -distance * Math.cos(pitch), FLOOR + distance * Math.sin(pitch)];
    const { matrix } = viewOf({ eye, look: [0, 0, FLOOR], focal }, { aspect, reach });
    let side = 0;
    let low = Infinity;
    let high = -Infinity;
    let behind = false;
    for (let step = 0; step < 96; step += 1) {
      const angle = (step / 96) * TAU;
      for (const [rim, z] of rims) {
        const [x, y, , w] = through(matrix, rim * Math.cos(angle), rim * Math.sin(angle), z);
        if (w <= 0) behind = true;
        side = Math.max(side, Math.abs(x));
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    }
    return { fits: !behind && side <= SIDE && high - low <= TALL, low, high };
  };
  let near = reach * 0.5;
  let far = reach * 80;
  for (let step = 0; step < 40; step += 1) {
    const middle = (near + far) / 2;
    if (measure(middle).fits) far = middle;
    else near = middle;
  }
  const { low, high } = measure(far);
  return { distance: far, lift: -(low + high) / 2 };
}

// ---------------------------------------------------------------------------
// Where the dominoes are falling
// ---------------------------------------------------------------------------

const WAVES = 8; // the most waves the camera follows at once
const HELD = 64; // the most dominoes it checks are in the picture
const STRIDE = 8; // dominoes over which it reads how fast a wave is about to go
const HALFWAY = STRUCK * 0.45; // seconds into its fall at which a struck domino is the one to look at

/**
 * Where the waves are: the places where falling dominoes meet standing ones.
 *
 * @param {Float32Array} falls four numbers per domino, as js/domino-run.js
 *   keeps them: the first is when that domino starts to fall
 * @param {Float32Array} places four numbers per domino: the first two are where it stands
 * @param {number} now
 * @returns {{ x: number, y: number, fronts: number[][], speed: number, laps: number } | null}
 *   `fronts`: where the front of each wave is, on its way from the last
 *   domino to start falling to the next. `x`, `y`: where to look, which is a
 *   little behind the front, at the dominoes that are half way down (the
 *   middle of those places, when there is more than one wave). `speed`: how
 *   fast the fastest wave is about to go, in domino heights a second of the
 *   run's clock (a domino that has been pushed and is tipping towards the next
 *   already counts as the wave it is about to set off). `laps`: how many
 *   times a second that wave goes round the middle of the run. Null when no
 *   wave is running.
 */
export function wavesAt(falls, places, now) {
  const count = falls.length / 4;
  const fronts = [];
  let found = 0;
  let sumX = 0;
  let sumY = 0;
  let speed = 0;
  let laps = 0;
  for (let index = 0; index < count - 1; index += 1) {
    const start = falls[index * 4];
    const next = falls[index * 4 + 4];
    if (start > now || next <= now) continue; // not where falling dominoes meet standing ones
    const share = (now - start) / (next - start);
    const x = mix(places[index * 4], places[index * 4 + 4], share);
    const y = mix(places[index * 4 + 1], places[index * 4 + 5], share);
    if (fronts.length < WAVES) fronts.push([x, y]);

    // Back along this wave to the domino that began to fall HALFWAY ago (or to the one that set the wave off).
    const then = now - HALFWAY;
    let at = index;
    while (at > 0 && falls[at * 4] > then && falls[at * 4 - 4] <= falls[at * 4]) at -= 1;
    const along = clamp((then - falls[at * 4]) / (falls[at * 4 + 4] - falls[at * 4]), 0, 1);
    found += 1;
    sumX += mix(places[at * 4], places[at * 4 + 4], along);
    sumY += mix(places[at * 4 + 1], places[at * 4 + 5], along);

    // How fast it is about to go: over the dominoes after the next one, where there are some.
    const steps = Math.min(STRIDE, count - 2 - index);
    const took = steps > 0 ? falls[(index + 1 + steps) * 4] - next : 0;
    const going = took > 0 ? (steps * SPACING) / took : SPACING / (next - start);
    if (going >= speed) {
      speed = going;
      laps = going / (TAU * Math.max(Math.hypot(x, y), 1.5));
    }
  }
  if (!found) return null;
  return { x: sumX / found, y: sumY / found, fronts, speed, laps };
}

/**
 * Which dominoes are on their way down at `now`, or will start to fall within
 * `soon` seconds of the run's clock: at most HELD of them, spread evenly.
 *
 * @param {Float32Array} falls as js/domino-run.js keeps them: the first of a
 *   domino's four numbers is when it starts to fall, and the third how long that takes
 * @returns {number[]} which dominoes, counted along the run
 */
export function fallingAt(falls, now, soon = 0) {
  const count = falls.length / 4;
  const counts = (index) => {
    const since = now - falls[index * 4];
    return since >= -soon && since <= falls[index * 4 + 2];
  };
  let found = 0;
  for (let index = 0; index < count; index += 1) {
    if (counts(index)) found += 1;
  }
  const stride = Math.max(1, Math.ceil(found / HELD));
  const held = [];
  let met = 0;
  for (let index = 0; index < count; index += 1) {
    if (!counts(index)) continue;
    if (met % stride === 0) held.push(index);
    met += 1;
  }
  return held;
}

// ---------------------------------------------------------------------------
// How it moves
// ---------------------------------------------------------------------------

/**
 * A critically damped spring, worked out exactly: it follows its target
 * smoothly, never overshoots, and cannot blow up however long a frame takes.
 */
export class Glide {
  constructor(value = 0, stiffness = 100) {
    this.value = value;
    this.velocity = 0;
    this.rate = Math.sqrt(stiffness);
  }

  /**
   * @param {number} target where to be
   * @param {number} dt seconds since the last step
   * @param {number} [speed] how fast the target itself is moving, where that
   *   is known: the spring then keeps up with it, instead of trailing behind
   */
  step(target, dt, speed = 0) {
    const gap = this.value - (target - speed * dt); // from where the target was when this step began
    const closing = this.velocity - speed;
    const pull = closing + this.rate * gap;
    const fade = Math.exp(-this.rate * dt);
    this.value = target + (gap + pull * dt) * fade;
    this.velocity = speed + (closing - pull * this.rate * dt) * fade;
    return this.value;
  }

  snap(value) {
    this.value = value;
    this.velocity = 0;
  }

  /** True once it has all but arrived, so a loop can stop asking. */
  settled(target, slack = 0.001) {
    return Math.abs(target - this.value) < slack && Math.abs(this.velocity) < slack;
  }
}

/** The equal of `angle` that is nearest to `from`: the short way round. */
export const nearestTurn = (angle, from) => from + Math.atan2(Math.sin(angle - from), Math.cos(angle - from));

/** A point turned about the middle of the floor. */
const turned = ([x, y, z], angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z];
};

// ---------------------------------------------------------------------------
// The film
// ---------------------------------------------------------------------------

const LENS = 60; // millimetres: one lens for the whole film
const SAFE = 0.86; // how much of the picture's half width or height the falling dominoes may fill
const EDGE = 0.96; // and how far from its middle the front of a wave may ever come
// At rest: domino heights behind the first domino, outside the run and above
// the middle of a domino; and the f-number.
const REST = { back: 7.4, out: 4.6, up: 2.7, stop: 8 };
const LOW = 0.6; // radians the camera looks down from when it has drawn back to see the whole run
const HIGH = 1.02; // and once the wave is a whirl, which is watched from above
const END = 0.66; // and over the fallen run
const NEAR = 45; // how close to the middle of the run the camera comes when it watches from above
const RISING = { slow: 0.45, fast: 1.3 }; // laps a second between which the camera goes from LOW to HIGH
// How the film opens. For `hold` seconds after the push the crane stays where
// it is, close to the wave. Then it draws back until the whole run is in the
// picture, taking as long as lets the picture shrink at `zoom` (the change in
// the logarithm of its scale each second, on average), and never less than
// `least` seconds. The head stays on the wave for most of that: how far from
// the middle of the picture it lets the wave go is the share of the draw-back
// that is done, raised to the power `lets`.
const OPENING = { hold: 1, zoom: 0.62, least: 4, lets: 3 };
// The f-number: at rest, close to the first domino, the lens is open enough to
// soften what is behind it; as the crane draws back it is stopped down, so that
// a picture with half the run in it is sharp from front to back; and it opens
// again once the whole run is so far off that it is all in focus anyway.
const STOPS = { down: 16, by: 0.3, open: 4, from: 0.6 };
// The head follows the wave only as fast as a picture can be read: what it
// looks at never moves faster than this many domino heights a second. A wave
// faster than that has to be let go, or slowed.
const STEADY = 9;
const SLOWEST = 0.2; // the slowest the film ever runs the run's clock, as a share of real time
const AHEAD = 1.1; // seconds ahead of the waves that the crane keeps in the picture, once the head has let them go
const KEEPS_UP = { most: 16, soon: 25 }; // the head keeps up with what it looks at: up to this many domino heights a second, and this briskly
const ORBIT = 0.07; // radians a second the crane drifts round the run while it falls
const ARRIVE = { turn: 0.55, back: 1.14 }; // how the film opens: radians round from where the crane rests, and times further off than the whole run needs
const LOOK = { low: 0.1, high: 1.45 }; // radians the camera may look down from, however a visitor tilts it
const BRISK = { crane: 9, head: 60, letting: 6, slowing: 200, gathering: 30, home: 5, drift: 3 }; // how briskly each part moves (the stiffness of its spring)

/** The angle to lay a run from (js/domino-run.js, `phase`) so that the crane rests at the front of the stage. */
export const restPhase = (radius, spin) => -Math.PI / 2 + spin * Math.atan(REST.back / (radius + REST.out));

/**
 * The film camera for one run.
 *
 * @param {{ places: Float32Array, radius: number, reach: number, aspect: number, spin: 1 | -1 }} scene
 *   `places` as js/domino-run.js lays them; `radius` is how far out the
 *   dominoes stand and `reach` the floor's radius; `aspect` is the picture's
 *   width over its height; `spin` is the way the run winds.
 */
export function createFilm({ places, radius, reach, aspect: shape, spin }) {
  let aspect = shape;
  const half = Math.tan(fieldOf(LENS) / 2); // half the picture's height, for a thing one length away
  let offsets = { turn: 0, tilt: 0, swing: 0 }; // how a visitor has turned the camera

  // The crane stands on a bearing round the run (0 is the front of the stage,
  // as a visitor faces it) and reaches out and up from the middle of the
  // floor: `rise` radians up, and `range` out (kept as a logarithm, so that
  // drawing back is as smooth far off as close to).
  const craneOf = (out, height) => ({
    rise: Math.atan2(height - FLOOR, out),
    range: Math.log(Math.hypot(out, height - FLOOR)),
  });

  /** Where that crane holds the camera. */
  const heldAt = ({ rise, range }, bearing) => {
    const far = Math.exp(range);
    return turned([0, -far * Math.cos(rise), FLOOR + far * Math.sin(rise)], bearing);
  };

  /** Where the camera is, on that crane, when it points at `look`. */
  const eyeOf = (crane, bearing, look) => {
    const eye = heldAt(crane, bearing);
    if (!offsets.tilt && !offsets.swing) return eye;
    // A visitor's tilt and swing turn the camera about what it looks at, as a tripod head does about its subject.
    const back = [eye[0] - look[0], eye[1] - look[1], eye[2] - look[2]];
    const gap = Math.hypot(back[0], back[1], back[2]);
    const up = Math.asin(back[2] / gap);
    const higher = clamp(up + offsets.tilt, Math.min(LOOK.low, up), Math.max(LOOK.high, up));
    const round = Math.atan2(back[0], -back[1]) + offsets.swing;
    return [
      look[0] + gap * Math.cos(higher) * Math.sin(round),
      look[1] - gap * Math.cos(higher) * Math.cos(round),
      look[2] + gap * Math.sin(higher),
    ];
  };

  // At rest it is close behind the first domino, to its outer side, looking along the row.
  const first = [places[0], places[1]];
  const out = Math.hypot(first[0], first[1]);
  const stood = [
    first[0] - REST.back * places[2] + (REST.out * first[0]) / out,
    first[1] - REST.back * places[3] + (REST.out * first[1]) / out,
  ];
  const home = Math.atan2(stood[0], -stood[1]);
  const close = craneOf(Math.hypot(stood[0], stood[1]), MID + REST.up);
  const rest = { ...close, look: turned([first[0], first[1], MID], -home), lift: 0, stop: Math.log(REST.stop) };
  const nearest = Math.hypot(REST.back, REST.out, REST.up); // how far it rests from the domino it looks at

  // Where else the crane goes, for this shape of picture: over the fallen
  // run; back, with the whole run in the picture; and above it, far and near.
  let whole = null;
  let wide = null;
  let above = null;
  let over = null;
  let drawing = 0; // seconds the crane takes to draw back from the first domino to the whole run
  const reframe = (next) => {
    aspect = next;
    const fitted = (pitch) => wholeFloor({ pitch, focal: LENS, radius, reach, aspect });
    const end = fitted(END);
    whole = { rise: END, range: Math.log(end.distance), look: [0, 0, FLOOR], lift: end.lift, stop: Math.log(STOPS.open) };
    wide = { rise: LOW, range: Math.log(fitted(LOW).distance) };
    above = { rise: HIGH, range: Math.log(fitted(HIGH).distance) };
    over = { rise: HIGH, range: Math.min(Math.log(NEAR), above.range) };
    drawing = Math.max(OPENING.least, (wide.range - Math.log(nearest)) / OPENING.zoom);
  };
  reframe(shape);

  // Where the crane is when it has drawn back by `back` (0: as close as it
  // comes; 1: the whole run is in the picture) and risen by `up` (0 to 1).
  const craneAt = (back, up) => ({
    rise: mix(mix(close.rise, wide.rise, back), mix(over.rise, above.rise, back), up),
    range: mix(mix(close.range, wide.range, back), mix(over.range, above.range, back), up),
  });

  /**
   * A test of whether a domino standing at (x, y) is in the picture of a
   * camera at `eye` pointed at `look`: within `share` of the picture's half
   * width and half height of its middle.
   */
  const inPicture = (eye, look, share) => {
    let fx = look[0] - eye[0];
    let fy = look[1] - eye[1];
    let fz = look[2] - eye[2];
    const gap = Math.hypot(fx, fy, fz);
    fx /= gap;
    fy /= gap;
    fz /= gap;
    const flat = Math.max(Math.hypot(fx, fy), 1e-6);
    const rx = fy / flat; // across the picture
    const ry = -fx / flat;
    const ux = ry * fz; // and up it
    const uy = -rx * fz;
    const uz = rx * fy - ry * fx;
    const wideBy = share * half * aspect;
    const tallBy = share * half;
    return (x, y) => {
      const dx = x - eye[0];
      const dy = y - eye[1];
      const dz = MID - eye[2];
      const deep = dx * fx + dy * fy + dz * fz;
      return deep >= 0.5 && Math.abs(dx * rx + dy * ry) <= wideBy * deep && Math.abs(dx * ux + dy * uy + dz * uz) <= tallBy * deep;
    };
  };

  /**
   * How little the head can follow the waves, with the crane where it is, and
   * still have the front of each within `share` of the picture: 1 looks
   * straight at them, 0 at the middle of the run.
   */
  const leastFollow = (crane, bearing, waves, share) => {
    const holds = (follow) => {
      const look = [waves.x * follow, waves.y * follow, MID];
      const inside = inPicture(eyeOf(crane, bearing, look), look, share);
      return waves.fronts.every(([x, y]) => inside(x, y));
    };
    if (holds(0)) return 0;
    if (!holds(1)) return 1;
    let low = 0;
    let high = 1;
    for (let step = 0; step < 12; step += 1) {
      const middle = (low + high) / 2;
      if (holds(middle)) high = middle;
      else low = middle;
    }
    return high;
  };

  /** How far the crane must draw back for those dominoes to be in the picture: as little as will do. */
  const drawnBack = (up, bearing, look, held) => {
    const sees = (back) => {
      const inside = inPicture(eyeOf(craneAt(back, up), bearing, look), look, SAFE);
      return held.every((index) => inside(places[index * 4], places[index * 4 + 1]));
    };
    if (sees(0)) return 0;
    let near = 0;
    let far = 1;
    for (let step = 0; step < 10; step += 1) {
      const middle = (near + far) / 2;
      if (sees(middle)) far = middle;
      else near = middle;
    }
    return far;
  };

  const rise = new Glide(rest.rise, BRISK.crane);
  const range = new Glide(rest.range, BRISK.crane);
  const aim = rest.look.map((part) => new Glide(part, BRISK.head));
  const lift = new Glide(0, BRISK.crane);
  const stop = new Glide(rest.stop, BRISK.crane);
  const orbit = new Glide(0, BRISK.home); // radians the crane has drifted round from where it rests
  const drift = new Glide(0, BRISK.drift); // radians a second it is drifting
  const tempo = new Glide(1, BRISK.slowing); // how fast the film runs the run's clock
  const hold = new Glide(1, BRISK.letting); // how far the head is following the waves: 1 looks straight at them, 0 at the middle of the run
  let last = null; // the last place a wave was seen
  let rolling = false; // a film is being shot: dominoes are falling
  let since = 0; // seconds since the push that started it
  let needed = 0; // how far back the falling dominoes last needed the crane
  let quickest = 0; // the fastest this film has yet been free to run the clock: once it has gathered speed it does not slow again
  let pace = 1;
  let aimed = null; // what the head was last told to look at, and for which part of the film
  const heading = [0, 0, 0]; // how fast that is moving

  /** Where the camera should be while the dominoes fall. Sets the film's pace as it goes. */
  function following(falls, now, bearing, dt, still) {
    const waves = wavesAt(falls, places, now) ?? last;
    if (!waves) {
      pace = 1;
      return rest; // nothing is falling that has anywhere to go
    }
    last = waves;

    // How far the film's opening has got: the share of the crane's draw-back that is done.
    const opened = still ? 1 : smooth(OPENING.hold, OPENING.hold + drawing, since);

    // The head lets go of the waves only as far as the crane, where it really
    // is, still has them in the picture (and, while the crane is drawing back,
    // near the middle of it); and the film runs the run's clock only as fast
    // as lets the head keep up.
    const least = leastFollow({ rise: rise.value, range: range.value }, bearing, waves, EDGE * opened ** OPENING.lets);
    // It lets go gently, and takes hold again at once: a wave is never let out of the picture.
    if (still || least >= hold.value) hold.snap(least);
    else hold.step(least, dt);
    const follow = clamp(hold.value, 0, 1);
    const free = clamp(STEADY / Math.max(follow * waves.speed, 1e-9), SLOWEST, 1);
    // Once the crane has drawn back and the film has gathered speed, it does not slow again.
    quickest = opened < 1 ? free : Math.max(quickest, free);
    // Time slows sharply, for the first domino's strike, and gathers speed gently.
    tempo.rate = Math.sqrt(quickest > tempo.value ? BRISK.gathering : BRISK.slowing);
    pace = still ? 1 : clamp(tempo.step(quickest, dt), SLOWEST, 1);
    const look = [waves.x * follow, waves.y * follow, MID];

    // What the head does not follow, the crane has to have in the picture before it gets there.
    const held = fallingAt(falls, now, AHEAD * Math.min(pace, quickest) * (1 - follow));
    const up = smooth(RISING.slow, RISING.fast, waves.laps * pace);
    if (held.length) needed = drawnBack(up, bearing, look, held);
    // The picture's scale goes as the square root of how far the crane has
    // drawn back, more or less: squaring keeps the change in it even. Once it
    // has the whole run in the picture it keeps it there, until the wave is a
    // whirl watched from above: then it comes as close as the whirl allows.
    const back = Math.max(needed, mix(opened * opened, needed, up));
    return {
      ...craneAt(back, up),
      look: turned(look, -bearing),
      lift: 0,
      stop: rest.stop + Math.log(STOPS.down / REST.stop) * smooth(0, STOPS.by, back) + Math.log(STOPS.open / STOPS.down) * smooth(STOPS.from, 1, back),
    };
  }

  return {
    /** The picture has a new shape (its width over its height). */
    reframe,

    /** Open the film: put the camera high and wide at once, so that its first move is down to the first domino. */
    establish() {
      rise.snap(whole.rise);
      range.snap(whole.range + Math.log(ARRIVE.back));
      aim.forEach((glide, part) => glide.snap(whole.look[part]));
      lift.snap(whole.lift);
      stop.snap(whole.stop);
      orbit.snap(-ARRIVE.turn * spin);
      drift.snap(0);
    },

    /**
     * Move the camera on.
     *
     * @param {{
     *   mode: 'standing' | 'falling' | 'down' | 'rising', falls: Float32Array, now: number, dt: number,
     *   turn?: number, tilt?: number, swing?: number, still?: boolean,
     * }} moment
     *   `falls` and `now` as js/domino-run.js keeps them; `dt` is real seconds
     *   since the last step. `turn` is how far a visitor has turned the crane
     *   round the run; `tilt` and `swing` turn the camera about what it looks
     *   at (up and over it, and round it). `still` cuts straight to where the
     *   camera should be, and leaves the run's clock alone.
     * @returns {boolean} true while the camera has further to go
     */
    step({ mode, falls, now, dt, turn = 0, tilt = 0, swing = 0, still = false }) {
      offsets = { turn, tilt, swing };
      if (mode === 'falling') {
        if (rolling) {
          since += dt;
        } else {
          rolling = true;
          since = 0;
          needed = 0;
          quickest = 0;
          tempo.snap(1);
          hold.snap(1);
        }
      } else {
        rolling = false;
        pace = 1;
        last = null;
      }

      if (mode === 'falling' || mode === 'down') {
        // The crane drifts the way the wave goes in, and stops once the run is down.
        const going = mode === 'falling' && !still ? ORBIT : 0;
        if (still) drift.snap(going);
        else drift.step(going, dt);
        orbit.value += spin * drift.value * dt;
        orbit.velocity = spin * drift.value;
      } else {
        // Standing, or being set up again: back to where it rests, the short way round.
        drift.snap(0);
        orbit.value = nearestTurn(orbit.value, 0);
        if (still || orbit.settled(0, 0.0004)) orbit.snap(0);
        else orbit.step(0, dt);
      }

      const bearing = home + orbit.value + turn;
      let goal = mode === 'falling' ? following(falls, now, bearing, dt, still) : mode === 'down' ? whole : rest;
      if (still && mode === 'falling') {
        // A cut has no crane to wait for: the head goes by where the crane is going, not where it was.
        rise.snap(goal.rise);
        range.snap(goal.range);
        goal = following(falls, now, bearing, 0, still);
      }

      // How fast what the head looks at is moving. The head keeps up with it:
      // a spring alone would trail behind a wave, and let it out of the picture.
      const moved = aimed?.mode === mode && dt > 0 ? goal.look.map((to, part) => (to - aimed.look[part]) / dt) : [0, 0, 0];
      const rush = Math.hypot(moved[0], moved[1], moved[2]);
      const eased = 1 - Math.exp(-dt * KEEPS_UP.soon);
      heading.forEach((was, part) => {
        const now = rush > KEEPS_UP.most ? (moved[part] * KEEPS_UP.most) / rush : moved[part];
        heading[part] = still ? 0 : was + (now - was) * eased;
      });
      aimed = { mode, look: goal.look };

      let moving = mode === 'falling' || Math.abs(drift.value) > 0.0005 || (mode !== 'down' && orbit.value !== 0);
      const parts = [
        [rise, goal.rise, 0.0002, 0],
        [range, goal.range, 0.0002, 0],
        [aim[0], goal.look[0], 0.002, heading[0]],
        [aim[1], goal.look[1], 0.002, heading[1]],
        [aim[2], goal.look[2], 0.002, heading[2]],
        [lift, goal.lift, 0.0002, 0],
        [stop, goal.stop, 0.002, 0],
      ];
      for (const [glide, to, slack, speed] of parts) {
        if (still || (glide.settled(to, slack) && Math.abs(speed) < slack)) {
          glide.snap(to);
        } else {
          glide.step(to, dt, speed);
          moving = true;
        }
      }
      return moving;
    },

    /**
     * How fast the run's clock should go just now, as a share of real time.
     * The film slows the run while its camera is close to a wave, so that the
     * head can stay on it.
     */
    get pace() {
      return pace;
    },

    /** How far a visitor can tilt the camera just now before it stops, in radians: [down, up]. */
    get tilts() {
      const bearing = home + orbit.value + offsets.turn;
      const look = turned(aim.map((glide) => glide.value), bearing);
      const eye = heldAt({ rise: rise.value, range: range.value }, bearing);
      const up = Math.asin((eye[2] - look[2]) / Math.hypot(eye[0] - look[0], eye[1] - look[1], eye[2] - look[2]));
      return [Math.min(0, LOOK.low - up), Math.max(0, LOOK.high - up)];
    },

    /** @returns {Shot} where the camera is now, and what it looks at */
    get shot() {
      const bearing = home + orbit.value + offsets.turn;
      const look = turned(aim.map((glide) => glide.value), bearing);
      const eye = eyeOf({ rise: rise.value, range: range.value }, bearing, look);
      return { eye, look, focal: LENS, stop: Math.exp(stop.value), lift: lift.value };
    },
  };
}
