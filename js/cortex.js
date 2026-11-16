// The Orchestration Hub's mind as numbers: the shape it is drawn as, where its
// stages sit, the path a signal takes between them, and where a job is at any
// moment of its life on the floor (js/floor.js). Nothing here touches the page,
// so the same code runs in the browser (js/hub.js draws it) and in Node
// (tests/cortex.test.mjs).
//
// The mind is a constellation under glass: many lights joined by fine threads,
// one for each of the places the work stops at and many more between them, kept
// under one round dome of glass. It floats over a desk: the one desk the whole
// floor is run from. Nothing in it is anatomy. Screen y points down, so "up" is
// negative y; the front of the mind is -z.

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

// The glass the mind is kept under: one round dome. It is an ellipsoid as wide as it is deep
// (`round` is half its width) and `tall` high above its middle, which stands `lift` above the
// middle of the figure. Below its widest it is cut off flat, at `floor`, and ends there in a rim.
export const GLASS = Object.freeze({ round: 0.86, tall: 0.5, lift: -0.1, floor: 0.2 });

/** The point in direction `d` from the middle of the dome, `reach` of the way out (1 is the glass). */
export function inGlass(d, reach = 1, out = [0, 0, 0]) {
  out[0] = d[0] * GLASS.round * reach;
  out[1] = GLASS.lift + d[1] * GLASS.tall * reach;
  out[2] = d[2] * GLASS.round * reach;
  return out;
}

/** How far out from the middle of the dome a point is: 0 at the middle, 1 on the glass. */
export function reachOf(x, y, z) {
  return Math.hypot(x / GLASS.round, (y - GLASS.lift) / GLASS.tall, z / GLASS.round);
}

/** The way straight out through the glass from a point under it. */
function outOf(x, y, z) {
  const out = [x / GLASS.round ** 2, (y - GLASS.lift) / GLASS.tall ** 2, z / GLASS.round ** 2];
  return Math.hypot(...out) > 0 ? normalise(out) : [0, -1, 0];
}

/** How wide the rim is: half the width of the dome where it is cut off. */
export const RIM = GLASS.round * Math.sqrt(1 - ((GLASS.floor - GLASS.lift) / GLASS.tall) ** 2);

/**
 * Whether to keep a try in direction `d` on an ellipsoid, so that the points lie evenly over
 * it. Directions spread evenly over a ball land crowded at the narrow ends of an ellipsoid:
 * a try is kept as often as the patch of glass it stands for is large.
 */
function spreadEvenly(d, wide, tall, deep, random) {
  const patch = Math.hypot(tall * deep * d[0], wide * deep * d[1], wide * tall * d[2]);
  return random() * Math.max(tall * deep, wide * deep, wide * tall) < patch;
}

/**
 * What a point of the cloud is part of. A node is one of the constellation's lights, and a halo
 * the soft glow round it. A thread is the line of light between two nodes. The glass is the fine
 * dust the dome is drawn in, and a mote is a grain of dust adrift under it.
 */
export const PART = Object.freeze({ node: 0, thread: 1, glass: 2, halo: 3, mote: 4 });

/**
 * The plan of the constellation. It is the same however many points draw it: a denser cloud is
 * the same nodes and the same threads, drawn finer.
 */
export const PLAN = Object.freeze({
  seed: 7,
  nodes: 140, // besides the five the work stops at
  apart: 0.12, // no two nodes are nearer than this
  outer: 0.88, // no node is further out than this (1 is the glass)
  above: 0.06, // and every one is at least this far above the rim
  // How sparing the threads are. Two nodes are joined when no third stands between them: in the
  // lens where two balls overlap, each `lune` / 2 times as wide as the two are apart and centred
  // towards one of them. At 1 the lens is the ball between the two, and there are many threads;
  // at 2 it is everything nearer to both than they are to each other, and there are few. At any
  // setting between, every node can be reached from every other.
  lune: 2,
  large: 1.7, // how large the largest node is, against one of the middle size; most are small
  orchestrator: 2.2, // the orchestrator's own node, and each stage's
  stage: 1.7,
});

/**
 * The same plan for a picture too small to show that many nodes apart (a phone): fewer of them,
 * further from each other. Drawn small, the full constellation is a tangle.
 */
export const SPARE = Object.freeze({ ...PLAN, nodes: 62, apart: 0.17 });

/**
 * The signals that run along the threads by themselves. Each thread carries one every `every`
 * seconds, at `speed` units of the mind a second; none sets out in the last `clear` seconds of
 * that time, so that every one has run its thread before the time starts again.
 */
export const PULSE = Object.freeze({ every: 14, speed: 0.32, clear: 2.5 });

// How many points each part gets in a cloud of the plainest density.
const POINTS = Object.freeze({ glass: 2600, rim: 110, mote: 420, thread: 44 }); // tries on the glass, round the rim, adrift; to a unit of thread

const drawnUp = new Map(); // plan -> its constellation, once it has been worked out
/**
 * The constellation of a plan: its nodes and the threads between them, worked out once.
 * @param {typeof PLAN} [plan]
 * @returns {{ nodes: { at: number[], out: number[], size: number, born: number }[], threads: { from: number, to: number, long: number, glow: number, span: number, when: number }[], anchors: number }}
 *   The first `anchors` nodes are the orchestrator's and then each stage's. `born` is when the
 *   growing constellation reaches a node: 0 at the orchestrator, 1 at the node furthest from it
 *   along the threads. A thread's `span` is its length on that scale, and `when` the second its
 *   signal sets out.
 */
export function constellation(plan = PLAN) {
  const known = drawnUp.get(plan);
  if (known) return known;
  const random = seeded(plan.seed);
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // The places the work stops at come first, and are the largest.
  const nodes = [{ at: [...ORCHESTRATOR], size: plan.orchestrator }, ...REGIONS.map((region) => ({ at: [...region.centre], size: plan.stage }))];
  const anchors = nodes.length;
  for (let tries = 0; nodes.length < anchors + plan.nodes; tries += 1) {
    if (tries > 200000) throw new Error(`There is no room under the glass for ${plan.nodes} nodes ${plan.apart} apart.`);
    const at = inGlass(direction(random), plan.outer * Math.cbrt(random()));
    if (at[1] > GLASS.floor - plan.above) continue;
    if (nodes.some((node) => gap(node.at, at) < plan.apart)) continue;
    // A few nodes are large and most are small: a sky has few bright stars.
    nodes.push({ at, size: 0.5 + (plan.large - 0.5) * random() ** 3 });
  }
  for (const node of nodes) node.out = outOf(...node.at);

  const threads = [];
  const share = plan.lune / 2;
  const one = [0, 0, 0];
  const other = [0, 0, 0];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i].at;
      const b = nodes[j].at;
      const long = gap(a, b);
      for (let k = 0; k < 3; k += 1) {
        one[k] = a[k] + (b[k] - a[k]) * share;
        other[k] = b[k] + (a[k] - b[k]) * share;
      }
      const between = nodes.some((node, k) => k !== i && k !== j && gap(node.at, one) < share * long && gap(node.at, other) < share * long);
      // A thread between two large nodes is the brighter.
      // A thread is as bright as the smaller of its two nodes: the few between large nodes stand out from the many between small ones.
      if (!between) threads.push({ from: i, to: j, long, glow: 0.45 + 0.5 * Math.min(nodes[i].size, nodes[j].size) });
    }
  }

  // How far each node is from the orchestrator, along the threads.
  const far = nodes.map(() => Infinity);
  far[0] = 0;
  const reached = new Set();
  while (reached.size < nodes.length) {
    let nearest = -1;
    for (let i = 0; i < nodes.length; i += 1) if (!reached.has(i) && (nearest < 0 || far[i] < far[nearest])) nearest = i;
    if (far[nearest] === Infinity) throw new Error('The constellation is in pieces: a node cannot be reached from the orchestrator.');
    reached.add(nearest);
    for (const thread of threads) {
      if (thread.from === nearest) far[thread.to] = Math.min(far[thread.to], far[nearest] + thread.long);
      else if (thread.to === nearest) far[thread.from] = Math.min(far[thread.from], far[nearest] + thread.long);
    }
  }
  const furthest = Math.max(...far);
  nodes.forEach((node, i) => {
    node.born = far[i] / furthest;
  });
  for (const thread of threads) {
    thread.span = thread.long / furthest;
    thread.when = random() * (PULSE.every - PULSE.clear);
  }

  const drawn = Object.freeze({ nodes: Object.freeze(nodes.map(Object.freeze)), threads: Object.freeze(threads.map(Object.freeze)), anchors });
  drawnUp.set(plan, drawn);
  return drawn;
}

/**
 * The mind as a cloud of points: a constellation under glass.
 * @param {() => number} [random]
 * @param {number} [density] 1 is a cloud light enough to draw on a plain canvas; more is the
 *   same constellation with that many times the points on its glass and along its threads.
 * @param {typeof PLAN} [plan] which constellation: the full one, or `SPARE` for a small picture
 * @returns {{ count: number, at: Float32Array, normal: Float32Array, glow: Float32Array, part: Uint8Array, own: Float32Array, born: Float32Array, thread: Float32Array, plan: typeof PLAN }}
 *   `at` and `normal` hold x, y, z for each point in turn; `normal` is the way out through the
 *   glass there (on the rim, straight down). `glow` is how bright the point is of itself: for a
 *   node and its halo, how large the node is. `own` is a number of its own from 0 up to 1, so
 *   that points can do things each in its own time. `born` is when the growing constellation
 *   reaches the point, from 0 at the orchestrator to 1 at the furthest node; the glass and the
 *   motes are not grown, and have 0. `thread` holds three numbers for each point: the second its
 *   thread's signal sets out (-1 for a point on no thread), how far along the thread the point
 *   lies (0 to 1), and how long the thread is.
 */
export function buildMind(random = seeded(42), density = 1, plan = PLAN) {
  if (!(density > 0)) throw new RangeError(`A cloud needs some points: density ${density}`);
  const { nodes, threads } = constellation(plan);
  const at = [];
  const normal = [];
  const glow = [];
  const part = [];
  const own = [];
  const born = [];
  const thread = [];
  const push = (point, facing, bright, kind, birth = 0, when = -1, along = 0, long = 0) => {
    at.push(point[0], point[1], point[2]);
    normal.push(...normalise(facing));
    glow.push(bright);
    part.push(kind);
    own.push(random());
    born.push(birth);
    thread.push(when, along, long);
  };

  // The glass: fine dust over the dome, down to where it is cut off.
  for (let i = Math.round(POINTS.glass * density); i > 0; i -= 1) {
    const d = direction(random);
    if (!spreadEvenly(d, GLASS.round, GLASS.tall, GLASS.round, random)) continue;
    const point = inGlass(d);
    if (point[1] > GLASS.floor) continue;
    push(point, [d[0] / GLASS.round, d[1] / GLASS.tall, d[2] / GLASS.round], 1, PART.glass);
  }
  // Its rim: a fine ring, where the glass ends.
  for (let i = Math.round(POINTS.rim * density); i > 0; i -= 1) {
    const angle = random() * TAU;
    push([Math.cos(angle) * RIM, GLASS.floor, Math.sin(angle) * RIM], [0, 1, 0], 1, PART.glass);
  }
  // Motes: dust adrift under the glass, between the nodes. Most are faint.
  for (let i = Math.round(POINTS.mote * density); i > 0; i -= 1) {
    const d = direction(random);
    const point = inGlass(d, 0.97 * Math.cbrt(random()));
    if (point[1] > GLASS.floor) continue;
    push(point, d, 0.2 + 0.8 * random() ** 3, PART.mote);
  }

  // The threads: points set evenly along each, so that a thread is a line and never a row of dots.
  const P = [0, 0, 0];
  for (const each of threads) {
    const a = nodes[each.from];
    const b = nodes[each.to];
    const count = Math.max(3, Math.round(each.long * POINTS.thread * density));
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      for (let n = 0; n < 3; n += 1) P[n] = a.at[n] + (b.at[n] - a.at[n]) * t;
      // The growing reaches a point along its thread from whichever end it comes to first.
      const birth = Math.min(a.born + t * each.span, b.born + (1 - t) * each.span);
      push(P, [a.out[0] + (b.out[0] - a.out[0]) * t, a.out[1] + (b.out[1] - a.out[1]) * t, a.out[2] + (b.out[2] - a.out[2]) * t], each.glow, PART.thread, birth, each.when, t, each.long);
    }
  }

  // The nodes: one round light each, as large as the node is, and a soft halo round it. They are
  // the same two points in a cloud of any density.
  for (const node of nodes) {
    push(node.at, node.out, node.size, PART.node, node.born);
    push(node.at, node.out, node.size, PART.halo, node.born);
  }

  return {
    count: glow.length,
    at: new Float32Array(at),
    normal: new Float32Array(normal),
    glow: new Float32Array(glow),
    part: new Uint8Array(part),
    own: new Float32Array(own),
    born: new Float32Array(born),
    thread: new Float32Array(thread),
    plan,
  };
}

// Where each stage lives under the glass: a direction from the middle of the dome, and
// `STAGE_REACH` of the way out to the glass. They are on alternate sides, so a job crosses the
// middle as it goes.
const STAGE_REACH = 0.8;
const STAGES_AT = Object.freeze([
  { stage: 'Queue', d: [-0.54, -0.3, -0.79] }, // to the front, on the left
  { stage: 'Build', d: [0.56, -0.78, 0.29] }, // high, on the right
  { stage: 'Audit', d: [-0.95, 0.25, -0.2] }, // far out to the left, and low
  { stage: 'Merge', d: [0.52, -0.2, 0.83] }, // to the back, on the right
]);

/**
 * The places a job passes: the orchestrator at the centre (index -1), then a
 * region for each stage, in order. The person a release waits for is not in
 * the mind at all: it is whoever is reading the page (js/hub.js).
 */
export const ORCHESTRATOR = Object.freeze([0, -0.02, 0.06]);
export const REGIONS = Object.freeze(
  STAGES_AT.map(({ stage, d }) => {
    const centre = inGlass(normalise(d), STAGE_REACH);
    return Object.freeze({ stage, centre, out: outOf(...centre), radius: 0.15 });
  }),
);

/** The middle of the mind, which signals arc away from. */
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
 * jobs side by side do not hide each other, a little further out from the middle.
 */
export function spot(place, id) {
  if (place === -1) return ORCHESTRATOR;
  const region = REGIONS[place];
  if (!region) throw new RangeError(`There is no place ${place}.`);
  const random = seeded(id * 7919 + place * 104729);
  const [nx, ny, nz] = region.out;
  // Two directions across the way out, at the region.
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
 * that bows out from the middle of the mind, as the Hub's pathways do.
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

/** The point in the mind where a job is, from `placeOf`. */
export function pointOf(job, out = [0, 0, 0]) {
  const { from, to, t } = placeOf(job);
  return along(spot(from, job.id), spot(to, job.id), from === to ? 0 : t, out);
}

/**
 * The wave of light a merged release sends across the mind, `age` seconds
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
 *   `scale` is pixels for one unit of the mind; `x`, `y` where its middle lands.
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

/** Which way the glass faces once turned: 1 straight at the viewer or away, 0 side-on (where its edge glows). */
export function facing(nx, ny, nz, view) {
  const z1 = -nx * Math.sin(view.yaw) + nz * Math.cos(view.yaw);
  return Math.abs(ny * Math.sin(view.pitch) + z1 * Math.cos(view.pitch));
}

/**
 * For each point of the mind, the region it belongs to (-1 for none): lit when that region is
 * busy. The work is done by the constellation: the glass over it and the dust under it are not
 * lit by it, and belong to no region.
 */
export function regionOfPoints(mind) {
  const owner = new Int8Array(mind.count).fill(-1);
  for (let i = 0; i < mind.count; i += 1) {
    if (mind.part && (mind.part[i] === PART.glass || mind.part[i] === PART.mote)) continue;
    let best = -1;
    let bestGap = Infinity;
    REGIONS.forEach((region, r) => {
      const gap = Math.hypot(mind.at[i * 3] - region.centre[0], mind.at[i * 3 + 1] - region.centre[1], mind.at[i * 3 + 2] - region.centre[2]);
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
 * The desk the mind stands over: a disc lying flat under it. The accounts the work runs on sit
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
 * Where the mind is looked at from. The glass is round and looks the same from every side; the
 * turn only says which of the stages are nearest when it is first seen (and, with motion
 * reduced, only ever seen): Build and Merge, with Queue and Audit behind. And from a little above,
 * so that the desk under it is seen as a desk and not as a line.
 */
export const LOOK = Object.freeze({ yaw: 1.15, pitch: 0.24 });

/**
 * How far the whole figure reaches from the middle of the mind, seen from `LOOK`, in units of
 * the mind: to either side (the desk's rim), up (the crown of the mind) and down (the desk's
 * near rim). Each with a little air. tests/cortex.test.mjs checks that nothing is outside them.
 */
export const FIGURE = Object.freeze({ side: 1.12, up: 0.68, down: 1.34 });

/**
 * The mind as its names see it: an ellipse they keep outside of, in units of the mind, its middle
 * `low` below the mind's own (it is above it: the glass stands higher than it hangs). It is a
 * little larger than the glass: tests/cortex.test.mjs checks that no point of the mind, turned
 * any way, is outside it, and that it is not so large that a name is pushed off what it names.
 */
export const PLATE = Object.freeze({ across: 1, down: 0.7, low: -0.12 });

/** How many steps each part of the glass's outline is drawn in. */
const OUTLINE_STEPS = 72;
let outlined = null; // the outline, once it has been worked out

/**
 * The glass as it lies on the screen, seen from the height the mind is looked at from: its
 * outline. The dome is round, so the outline is the same however the mind is turned. Each part
 * is a run of points across and down from where the mind's middle lands, in units of the mind:
 * what `project` gives for a view of scale 1 that is not turned.
 *
 * The eye sees the glass end along one curve on it, where a line from the eye just touches it.
 * Squeeze the glass into a ball and that curve is a circle on the ball, a little to the eye's
 * side of its middle (the eye is near, and sees less than half of it). Below the rim there is
 * no glass, so the foot of that curve is missing, and the outline is closed by the near half of
 * the rim instead; the far half of the rim is seen through the glass.
 *
 * @returns {{ dome: number[][], near: number[][], far: number[][], middle: number[] }}
 *   `dome` runs from where the rim meets the outline on the left, over the crown, to where it
 *   meets it on the right; `near` runs on from there along the near half of the rim, back to
 *   the start, and `far` between the same two points along the far half. `middle` is where the
 *   middle of the glass lands.
 */
export function glassOutline() {
  if (outlined) return outlined;
  const view = { yaw: 0, pitch: LOOK.pitch, scale: 1, x: 0, y: 0 };
  // Where the eye is from the middle of the ball the glass is squeezed into: it stands FOV in
  // front of the mind's middle, as `project` has it.
  const down = (GLASS.lift + FOV * Math.sin(LOOK.pitch)) / GLASS.tall;
  const away = (FOV * Math.cos(LOOK.pitch)) / GLASS.round;
  const far = Math.hypot(down, away);
  const toward = 1 / far; // how far to the eye's side of the ball's middle the circle lies
  const ring = Math.sqrt(1 - toward * toward); // and how large it is
  /** The point of the glass `angle` round that circle: 0 at the viewer's right, a quarter turn at the foot. */
  const onEdge = (angle) => {
    const along = ring * Math.sin(angle);
    return inGlass([ring * Math.cos(angle), (-down * toward + away * along) / far, (-away * toward - down * along) / far]);
  };
  // Where the circle goes below the rim, either side of its foot.
  const cut = Math.asin(((GLASS.floor - GLASS.lift) / GLASS.tall + (down * toward) / far) / ((ring * away) / far));
  const flatten = (point) => {
    const [x, y] = project(point[0], point[1], point[2], view);
    return Object.freeze([x, y]);
  };
  const run = (from, to, at) => Object.freeze(Array.from({ length: OUTLINE_STEPS + 1 }, (_, n) => flatten(at(from + ((to - from) * n) / OUTLINE_STEPS))));
  const right = onEdge(cut); // where the outline meets the rim, on the viewer's right
  const meets = Math.atan2(right[2], right[0]); // and how far round the rim that is
  const onRim = (angle) => [Math.cos(angle) * RIM, GLASS.floor, Math.sin(angle) * RIM];
  outlined = Object.freeze({
    dome: run(Math.PI - cut, TAU + cut, onEdge),
    near: run(meets, -Math.PI - meets, onRim),
    far: run(meets, Math.PI - meets, onRim),
    middle: flatten([0, GLASS.lift, 0]),
  });
  return outlined;
}

/**
 * The view that sets the whole figure, as large as it will go, in a frame `width` by `height`.
 * @returns {{ scale: number, x: number, y: number }} to go with `LOOK` as a view for `project`
 */
export function frameFor(width, height) {
  if (!(width > 0 && height > 0)) throw new RangeError(`There is no room for the mind in a frame ${width} by ${height}.`);
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
