// The Orchestration Hub's brain as numbers: the shape it is drawn as, where its
// regions sit, the path a signal takes between them, and where a job is at any
// moment of its life on the floor (js/floor.js). Nothing here touches the page,
// so the same code runs in the browser (js/hub.js draws it) and in Node
// (tests/cortex.test.mjs).
//
// The anatomy is the Hub's own: its Cortex view draws the orchestration as a
// brain made of this point cloud. Two hemispheres with winding folds and a dark
// fissure between them, temporal lobes, a cerebellum with its folia, and a short
// brainstem. It stands over a desk: the one desk the whole floor is run from.
// Screen y points down, so "up" is negative y; the front of the brain is -z.

import { GATE, STAGES } from './floor.js';

export const TAU = Math.PI * 2;

/** A random number generator that gives the same numbers for the same seed. */
export function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A direction picked evenly over the sphere. */
function direction(random) {
  const z = random() * 2 - 1;
  const angle = random() * TAU;
  const ring = Math.sqrt(1 - z * z);
  return [ring * Math.cos(angle), z, ring * Math.sin(angle)];
}

const normalise = (v) => {
  const length = Math.hypot(...v);
  return v.map((part) => part / length);
};

// The shells the brain is made of. Each is an ellipsoid: `wide`, `tall` and `deep` are its half
// sizes across, up and front to back.
// The hemispheres stand either side of the midline, and their undersides are pressed flat.
const HEMI = Object.freeze({ offset: 0.37, wide: 0.36, tall: 0.5, deep: 0.86, lift: -0.1, floor: 0.2, flat: 0.35 });
// The temporal lobes: under each hemisphere, towards the front.
const TEMPORAL = Object.freeze({ offset: 0.5, y: 0.2, z: -0.14, wide: 0.22, tall: 0.15, deep: 0.4 });
// The cerebellum: under the back of the brain.
const CEREBELLUM = Object.freeze({ y: 0.33, z: 0.6, wide: 0.48, tall: 0.17, deep: 0.26 });
// The brainstem: a short cone going down from the middle, leaning back a little.
const STEM = Object.freeze({ top: 0.2, long: 0.42, z: 0.24, lean: 0.07, thick: 0.13, thin: 0.075 });

/**
 * How far up the side of a fold a point of the cortex stands: 0 at the bottom of a groove, 1
 * anywhere on a crest. The grooves are where a winding surface (a gyroid, bent out of true so
 * that it never repeats) cuts through the brain, so on its surface they are thin lines that
 * wander, branch and meet, with broad crests between: the look of a cortex.
 */
export function fold(x, y, z) {
  const u = x + 0.05 * Math.sin(y * 7.3 + 1.1) + 0.035 * Math.sin(z * 11.9 + 4);
  const v = y + 0.05 * Math.sin(z * 6.7 + 2.6) + 0.035 * Math.sin(x * 12.7 + 0.8);
  const w = z + 0.05 * Math.sin(x * 7.9 + 5.2) + 0.035 * Math.sin(y * 10.3 + 3.1);
  const winding = Math.sin(u * FOLDS) * Math.cos(v * FOLDS) + Math.sin(v * FOLDS) * Math.cos(w * FOLDS) + Math.sin(w * FOLDS) * Math.cos(u * FOLDS);
  const out = Math.min(1, Math.abs(winding) / GROOVE);
  return out * out * (3 - 2 * out);
}
const FOLDS = 15.5; // how tightly the folds are packed: about eleven across the length of the brain
const GROOVE = 0.46; // how wide a groove is, against the crests either side of it

/**
 * A point on one hemisphere (`side` -1 left, 1 right) in direction `d`, `reach` of the way out
 * (1 is the surface). A brain is widest behind its middle: it narrows to the front, and a
 * little to the back.
 */
export function surface(side, d, reach = 1) {
  const taper = 1 - 0.14 * Math.max(0, -d[2]) ** 2 - 0.05 * Math.max(0, d[2]) ** 2;
  const x = (side * HEMI.offset + d[0] * HEMI.wide * reach) * taper;
  let y = HEMI.lift + d[1] * HEMI.tall * reach;
  const z = d[2] * HEMI.deep * reach;
  if (y > HEMI.floor) y = HEMI.floor + (y - HEMI.floor) * HEMI.flat; // the underside is flattened
  return [x, y, z];
}

/** Whether a point lies inside a hemisphere, by more than a sliver. */
function insideHemisphere(x, y, z) {
  const raised = y > HEMI.floor ? HEMI.floor + (y - HEMI.floor) / HEMI.flat : y; // undo the flattening
  const across = (Math.abs(x) - HEMI.offset) / HEMI.wide;
  return Math.hypot(across, (raised - HEMI.lift) / HEMI.tall, z / HEMI.deep) < 0.94;
}

/** Whether a point lies inside a temporal lobe, by more than a sliver. */
function insideTemporal(x, y, z) {
  return Math.hypot((Math.abs(x) - TEMPORAL.offset) / TEMPORAL.wide, (y - TEMPORAL.y) / TEMPORAL.tall, (z - TEMPORAL.z) / TEMPORAL.deep) < 0.94;
}

/**
 * Whether to keep a try in direction `d` on an ellipsoid, so that the points lie evenly over
 * it. Directions spread evenly over a ball land crowded at the narrow ends of an ellipsoid:
 * a try is kept as often as the patch of surface it stands for is large.
 */
function spreadEvenly(d, wide, tall, deep, random) {
  const patch = Math.hypot(tall * deep * d[0], wide * deep * d[1], wide * tall * d[2]);
  return random() * Math.max(tall * deep, wide * deep, wide * tall) < patch;
}

/** Parts of the brain, for colouring and for the folds' pattern. */
export const PART = Object.freeze({ cortex: 0, cerebellum: 1, stem: 2 });

// How many tries each part gets in a cloud of the plainest density. About half the tries on the
// cortex come to nothing: in a groove, on the wall of the fissure, or buried in another part.
const TRIES = Object.freeze({ hemispheres: 6000, temporal: 1240, cerebellum: 1440, stem: 360 });

/**
 * The brain as a cloud of points.
 * @param {() => number} [random]
 * @param {number} [density] 1 is a cloud light enough to draw point by point on a plain canvas
 *   (about 3,900 points); more is the same brain with that many times the points.
 * @returns {{ count: number, at: Float32Array, normal: Float32Array, fold: Float32Array, part: Uint8Array, own: Float32Array }}
 *   `at` and `normal` hold x, y, z for each point in turn; `normal` is the way its surface faces,
 *   `fold` how far up its fold it stands (0 to 1), and `own` a number of its own from 0 up to 1,
 *   so that points can do things each in its own time.
 */
export function buildCortex(random = seeded(42), density = 1) {
  if (!(density > 0)) throw new RangeError(`A cloud needs some points: density ${density}`);
  const at = [];
  const normal = [];
  const folds = [];
  const part = [];
  const own = [];
  const push = (point, facing, height, kind) => {
    at.push(...point);
    normal.push(...normalise(facing));
    folds.push(height);
    part.push(kind);
    own.push(random());
  };
  const tries = (name) => Math.round(TRIES[name] * density);

  for (let i = tries('hemispheres'); i > 0; i -= 1) {
    const d = direction(random);
    const side = random() < 0.5 ? -1 : 1;
    if (!spreadEvenly(d, HEMI.wide, HEMI.tall, HEMI.deep, random)) continue;
    // The inner wall of each hemisphere stays mostly dark: the fissure between them.
    if (d[0] * side < -0.5 && random() < 0.85) continue;
    const smooth = surface(side, d);
    if (insideTemporal(...smooth)) continue;
    const height = fold(...smooth);
    if (random() > 0.08 + 0.92 * height) continue; // a groove holds few points, so it draws as a dark line
    const under = HEMI.lift + d[1] * HEMI.tall > HEMI.floor;
    push(surface(side, d, 1 - 0.035 * (1 - height)), [d[0] / HEMI.wide, d[1] / (HEMI.tall * (under ? HEMI.flat : 1)), d[2] / HEMI.deep], height, PART.cortex);
  }
  for (let i = tries('temporal'); i > 0; i -= 1) {
    const d = direction(random);
    const side = random() < 0.5 ? -1 : 1;
    if (!spreadEvenly(d, TEMPORAL.wide, TEMPORAL.tall, TEMPORAL.deep, random)) continue;
    const point = (reach) => [side * TEMPORAL.offset + d[0] * TEMPORAL.wide * reach, TEMPORAL.y + d[1] * TEMPORAL.tall * reach, TEMPORAL.z + d[2] * TEMPORAL.deep * reach];
    const smooth = point(1);
    if (insideHemisphere(...smooth)) continue;
    const height = fold(...smooth);
    if (random() > 0.08 + 0.92 * height) continue;
    push(point(1 - 0.05 * (1 - height)), [d[0] / TEMPORAL.wide, d[1] / TEMPORAL.tall, d[2] / TEMPORAL.deep], height, PART.cortex);
  }
  for (let i = tries('cerebellum'); i > 0; i -= 1) {
    const d = direction(random);
    if (!spreadEvenly(d, CEREBELLUM.wide, CEREBELLUM.tall, CEREBELLUM.deep, random)) continue;
    const point = [d[0] * CEREBELLUM.wide, CEREBELLUM.y + d[1] * CEREBELLUM.tall, CEREBELLUM.z + d[2] * CEREBELLUM.deep];
    if (insideHemisphere(...point)) continue;
    // Its folia: fine leaves lying one on another, level from side to side.
    const height = 0.5 + 0.5 * Math.sin(point[1] * 95);
    if (random() > 0.15 + 0.85 * height) continue;
    push(point, [d[0] / CEREBELLUM.wide, d[1] / CEREBELLUM.tall, d[2] / CEREBELLUM.deep], height, PART.cerebellum);
  }
  for (let i = tries('stem'); i > 0; i -= 1) {
    const down = random();
    const angle = random() * TAU;
    const radius = STEM.thick + (STEM.thin - STEM.thick) * down;
    push(
      [Math.cos(angle) * radius, STEM.top + down * STEM.long, STEM.z + Math.sin(angle) * radius + down * STEM.lean],
      [Math.cos(angle), 0, Math.sin(angle)],
      0.6 + 0.25 * Math.sin(down * 30),
      PART.stem,
    );
  }
  return {
    count: folds.length,
    at: new Float32Array(at),
    normal: new Float32Array(normal),
    fold: new Float32Array(folds),
    part: new Uint8Array(part),
    own: new Float32Array(own),
  };
}

// Where each stage lives: a lobe, on alternate hemispheres, so a job crosses the midline as it goes.
const LOBES = Object.freeze([
  { stage: 'Queue', side: -1, d: [0.45, -0.32, -0.83] }, // frontal
  { stage: 'Build', side: 1, d: [0.42, -0.86, 0.32] }, // parietal
  { stage: 'Audit', side: -1, d: [0.96, 0.22, -0.18] }, // temporal
  { stage: 'Merge', side: 1, d: [0.36, -0.22, 0.9] }, // occipital
]);

/**
 * The places a job passes: the orchestrator at the centre (index -1), then a
 * region for each stage, in order. The person a release waits for is not in
 * the brain at all: it is whoever is reading the page (js/hub.js).
 */
export const ORCHESTRATOR = Object.freeze([0, -0.02, 0.06]);
export const REGIONS = Object.freeze(
  LOBES.map(({ stage, side, d }) => {
    const out = normalise([side * d[0], d[1], d[2]]);
    return Object.freeze({ stage, centre: surface(side, out, 0.97), out, radius: 0.15 });
  }),
);

/** The middle of the brain, which signals arc away from. */
export const MIDDLE = Object.freeze([0, -0.05, 0.05]);

/** The point a place stands for: -1 the orchestrator, 0 to 3 a stage's region. */
export function centreOf(place) {
  if (place === -1) return ORCHESTRATOR;
  const region = REGIONS[place];
  if (!region) throw new RangeError(`There is no place ${place}.`);
  return region.centre;
}

/**
 * Where in a region a job sits: near its middle, at a spot of its own so that
 * jobs side by side do not hide each other, raised a little off the surface.
 */
export function spot(place, id) {
  if (place === -1) return ORCHESTRATOR;
  const region = REGIONS[place];
  if (!region) throw new RangeError(`There is no place ${place}.`);
  const random = seeded(id * 7919 + place * 104729);
  const [nx, ny, nz] = region.out;
  // Two directions across the surface at the region.
  let across = [ny, -nx, 0];
  if (Math.hypot(across[0], across[1]) < 0.1) across = [1, 0, 0];
  across = normalise(across);
  const other = [ny * across[2] - nz * across[1], nz * across[0] - nx * across[2], nx * across[1] - ny * across[0]];
  const angle = random() * TAU;
  const out = Math.sqrt(random()) * region.radius;
  const lift = 0.035;
  return region.centre.map((part, i) => part + (across[i] * Math.cos(angle) + other[i] * Math.sin(angle)) * out + region.out[i] * lift);
}

/**
 * A point `t` (0 to 1) along the path a signal takes from `a` to `b`: a curve
 * that bows out from the middle of the brain, as the Hub's pathways do.
 */
export function along(a, b, t, out = [0, 0, 0]) {
  const bow = 1.5;
  const u = 1 - t;
  for (let i = 0; i < 3; i += 1) {
    const middle = (a[i] + b[i]) / 2;
    const control = MIDDLE[i] + (middle - MIDDLE[i]) * bow;
    out[i] = u * u * a[i] + 2 * u * t * control + t * t * b[i];
  }
  return out;
}

/** The part of each stage in which a job crosses to the next place. */
export const CROSSING = 0.3;

/**
 * Where a job on the floor is, as places and how far between them.
 * @param {{ at: number, kind: string, waiting: boolean }} job
 * @returns {{ from: number, to: number, t: number, fade: number }}
 *   `from` and `to` are places (-1 the orchestrator, 0 to 3 the stages'
 *   regions); when they are the same the job sits in that region. `t` is how
 *   far it has gone from one to the other. `fade` runs from 0 to 1 as a merged
 *   job goes out.
 */
export function placeOf(job) {
  const last = STAGES.length - 1;
  const stage = Math.min(last, Math.floor(job.at));
  const part = job.at - stage;
  const settle = 1 - CROSSING;
  const sit = (place, fade = 0) => ({ from: place, to: place, t: 0, fade });
  const cross = (from, to, t) => ({ from, to, t: Math.min(1, Math.max(0, t)), fade: 0 });

  // A release stops halfway along the path into the merge: the gate. Approved, it goes on from there.
  if (job.kind === 'Release') {
    const into = GATE - 1;
    if (job.waiting) return cross(into, GATE, 0.5);
    if (stage === into && part >= settle) return cross(into, GATE, ((part - settle) / CROSSING) * 0.5);
    if (stage === GATE && part < CROSSING) return cross(into, GATE, 0.5 + (part / CROSSING) * 0.5);
  }
  if (stage === 0 && part < CROSSING) return cross(-1, 0, part / CROSSING); // the orchestrator sends it out
  if (stage === last) return sit(last, part >= settle ? (part - settle) / CROSSING : 0);
  if (part >= settle) return cross(stage, stage + 1, (part - settle) / CROSSING);
  return sit(stage);
}

/**
 * How near a release is to the gate: 0 as it joins the queue, 1 once it is there, waiting or
 * let through. Nothing else is ever stopped at the gate, so any other job is 0.
 */
export function approach(job) {
  if (job.kind !== 'Release') return 0;
  return Math.min(1, Math.max(0, job.at / GATE));
}

/** The point in the brain where a job is, from `placeOf`. */
export function pointOf(job, out = [0, 0, 0]) {
  const { from, to, t } = placeOf(job);
  return along(spot(from, job.id), spot(to, job.id), from === to ? 0 : t, out);
}

/**
 * The wave of light a merged release sends across the brain, `age` seconds
 * after it lands: a shell growing out from the merge, sharp at its front.
 * @returns {{ radius: number, strength: number } | null} null once it has gone
 */
export const WAVE_SECONDS = 2.2;
export function waveAt(age) {
  if (!(age >= 0) || age >= WAVE_SECONDS) return null;
  const done = age / WAVE_SECONDS;
  return { radius: (1 - (1 - done) ** 1.7) * 2.4, strength: (1 - done) ** 1.2 };
}

/**
 * Turn and set a point on the screen.
 * @param {{ yaw: number, pitch: number, scale: number, x: number, y: number }} view
 *   `scale` is pixels for one unit of the brain; `x`, `y` where its middle lands.
 * @returns {number[]} screen x, screen y, how much nearer than the middle it looks (1 at the middle), depth (less is nearer)
 */
export const FOV = 3.2;
export function project(px, py, pz, view, out = [0, 0, 0, 0]) {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  const x1 = px * cy + pz * sy;
  const z1 = -px * sy + pz * cy;
  const y2 = py * cp - z1 * sp;
  const z2 = py * sp + z1 * cp;
  const near = FOV / (FOV + z2);
  const k = view.scale * near;
  out[0] = view.x + x1 * k;
  out[1] = view.y + y2 * k;
  out[2] = near;
  out[3] = z2;
  return out;
}

/**
 * The turn a view gives every point, as the nine numbers of a matrix, a row at a time: across,
 * down and away from the viewer. It is the turn `project` makes, for the graphics card, which
 * turns the whole cloud itself (js/hub-cloud.js).
 */
export function turning(view, out = new Float32Array(9)) {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  out[0] = cy;
  out[1] = 0;
  out[2] = sy;
  out[3] = sy * sp;
  out[4] = cp;
  out[5] = -cy * sp;
  out[6] = -sy * cp;
  out[7] = sp;
  out[8] = cy * cp;
  return out;
}

/** Which way a surface faces once turned: 1 straight at the viewer or away, 0 side-on (where the rim glows). */
export function facing(nx, ny, nz, view) {
  const z1 = -nx * Math.sin(view.yaw) + nz * Math.cos(view.yaw);
  return Math.abs(ny * Math.sin(view.pitch) + z1 * Math.cos(view.pitch));
}

/** For each point of the brain, the region it belongs to (-1 for none): lit when that region is busy. */
export function regionOfPoints(brain) {
  const owner = new Int8Array(brain.count).fill(-1);
  for (let i = 0; i < brain.count; i += 1) {
    let best = -1;
    let bestGap = Infinity;
    REGIONS.forEach((region, r) => {
      const gap = Math.hypot(brain.at[i * 3] - region.centre[0], brain.at[i * 3 + 1] - region.centre[1], brain.at[i * 3 + 2] - region.centre[2]);
      if (gap < region.radius * 1.9 && gap < bestGap) {
        best = r;
        bestGap = gap;
      }
    });
    owner[i] = best;
  }
  return owner;
}

/**
 * The decision model: a synapse on the path from Build to Audit. Every
 * finished build passes it, and it decides what happens next.
 */
export const DECISION = Object.freeze(along(REGIONS[1].centre, REGIONS[2].centre, 0.5));

/** What the decision model can decide for a finished build, and which way each sends it. */
export const VERDICTS = Object.freeze([
  { verdict: 'pass', to: 2 }, // on to the audit
  { verdict: 'fix', to: 1 }, // back to be built again
  { verdict: 'ask', to: 'you' }, // a question only a person can answer
]);

/**
 * The desk the brain stands over: a disc lying flat under it. The accounts the work runs on sit
 * along its near rim.
 */
export const DESK = Object.freeze({ y: 0.7, radius: 1.08 });

/**
 * The band engraved round the desk: strands that weave in and out between two rings, as the
 * guilloché on a banknote does. `inner` and `outer` are shares of the desk's radius; each strand
 * swings between them `lobes` times in a turn, and the strands are spread evenly through one swing.
 */
export const BAND = Object.freeze({ inner: 0.74, outer: 0.93, strands: 5, lobes: 9 });

/**
 * How far out strand `strand` of the band runs at `angle` round the desk, as a share of the
 * desk's radius. `drift` slides the whole weave round its rings.
 */
export function bandAt(strand, angle, drift = 0) {
  const middle = (BAND.inner + BAND.outer) / 2;
  const swing = (BAND.outer - BAND.inner) / 2;
  return middle + swing * Math.sin(BAND.lobes * angle + (strand / BAND.strands) * TAU + drift);
}

/**
 * Where the brain is looked at from. Turned well to one side: it is first seen (and, with motion
 * reduced, only ever seen) in three-quarter profile, where its folds and both of its halves read
 * as one brain; nearer head-on the halves stand apart like two things. And from a little above,
 * so that the desk under it is seen as a desk and not as a line.
 */
export const LOOK = Object.freeze({ yaw: 1.15, pitch: 0.24 });

/**
 * How far the whole figure reaches from the middle of the brain, seen from `LOOK`, in units of
 * the brain: to either side (the desk's rim), up (the crown of the brain) and down (the desk's
 * near rim). Each with a little air. tests/cortex.test.mjs checks that nothing is outside them.
 */
export const FIGURE = Object.freeze({ side: 1.12, up: 0.68, down: 1.34 });

/**
 * The brain as its names see it: an ellipse they keep outside of, in units of the brain, its
 * middle `low` below the brain's own. The brain is fuller at its shoulders than an ellipse of its
 * own width and height, so the plate is larger than both: tests/cortex.test.mjs checks that no
 * point of the brain, turned any way, is outside it.
 */
export const PLATE = Object.freeze({ across: 1.06, down: 0.95, low: 0.08 });

/**
 * The view that sets the whole figure, as large as it will go, in a frame `width` by `height`.
 * @returns {{ scale: number, x: number, y: number }} to go with `LOOK` as a view for `project`
 */
export function frameFor(width, height) {
  if (!(width > 0 && height > 0)) throw new RangeError(`There is no room for the brain in a frame ${width} by ${height}.`);
  const scale = Math.min(width / (2 * FIGURE.side), height / (FIGURE.up + FIGURE.down));
  return { scale, x: width / 2, y: height / 2 + ((FIGURE.up - FIGURE.down) / 2) * scale };
}

/** Which way round the desk account `index` of `count` sits: an angle from straight towards the viewer, in radians. */
export function seatOf(index, count, apart = 0.5) {
  return (index - (count - 1) / 2) * apart;
}

/** The point on the desk at `angle` round from straight towards the viewer, `reach` of the way out to its rim. */
export function onDesk(angle, reach = 1, out = [0, 0, 0]) {
  out[0] = Math.sin(angle) * DESK.radius * reach;
  out[1] = DESK.y;
  out[2] = -Math.cos(angle) * DESK.radius * reach;
  return out;
}

/**
 * The accounts the work runs on. Jobs draw on one account until it is full;
 * then the next takes over, while a full one refills with time. The work never
 * stops because one account has run out.
 *
 * @param {{ count?: number, refill?: number, reopen?: number }} [options]
 *   `refill`: how much of a full account comes back each second (1 is all of
 *   it); `reopen`: how low a full account must fall before it is used again.
 */
export function createAccounts({ count = 3, refill = 0.06, reopen = 0.35 } = {}) {
  const levels = new Array(count).fill(0);
  const full = new Array(count).fill(false);
  let active = 0;

  const nextOpen = (from) => {
    for (let step = 1; step <= count; step += 1) {
      const each = (from + step) % count;
      if (!full[each]) return each;
    }
    return -1;
  };

  return {
    get levels() {
      return levels.slice();
    },
    get full() {
      return full.slice();
    },
    /** The account work is drawn from now; -1 when every one is full. */
    get active() {
      return active;
    },
    /** Spend `amount` on the active account. @returns {number} the account it came from, or -1 if none could take it */
    draw(amount) {
      if (!(amount > 0)) throw new RangeError(`A job costs something: ${amount}`);
      if (active === -1) return -1;
      const used = active;
      levels[used] = Math.min(1, levels[used] + amount);
      if (levels[used] >= 1) {
        full[used] = true;
        active = nextOpen(used);
      }
      return used;
    },
    /** Let `seconds` pass: full accounts refill, and open again once low enough. */
    step(seconds) {
      for (let each = 0; each < count; each += 1) {
        if (!full[each]) continue;
        levels[each] = Math.max(0, levels[each] - refill * seconds);
        if (levels[each] <= reopen) {
          full[each] = false;
          if (active === -1) active = each;
        }
      }
    },
  };
}
