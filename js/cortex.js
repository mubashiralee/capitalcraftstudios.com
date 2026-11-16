// The Orchestration Hub's brain as numbers: the shape it is drawn as, where its
// regions sit, the path a signal takes between them, and where a job is at any
// moment of its life on the floor (js/floor.js). Nothing here touches the page,
// so the same code runs in the browser (js/hub.js draws it) and in Node
// (tests/cortex.test.mjs).
//
// The anatomy is the Hub's own: its Cortex view draws the orchestration as a
// brain made of this point cloud. Two hemispheres with folds and a dark fissure
// between them, temporal lobes, a cerebellum with its folia, and a brainstem.
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

// The hemispheres: ellipsoids either side of the midline.
const HEMI = Object.freeze({ offset: 0.37, wide: 0.36, tall: 0.5, deep: 0.86, lift: -0.1 });

/** The folds of the cortex: how far a point stands out from the smooth shell, from -1.6 to 1.6. */
export function fold(x, y, z) {
  return Math.sin(x * 14 + 1.7) * Math.sin(y * 16 + 0.3) * Math.sin(z * 12 + 2.2) + 0.6 * Math.sin(x * 23 + y * 19 + z * 7 + 0.4);
}

/** A point on one hemisphere (`side` -1 left, 1 right) in direction `d`, `reach` of the way out (1 is the surface). */
export function surface(side, d, reach = 1) {
  const x = side * HEMI.offset + d[0] * HEMI.wide * reach;
  let y = HEMI.lift + d[1] * HEMI.tall * reach;
  const z = d[2] * HEMI.deep * reach;
  if (y > 0.2) y = 0.2 + (y - 0.2) * 0.35; // the underside is flattened
  return [x, y, z];
}

/** Parts of the brain, for colouring and for the folds' pattern. */
export const PART = Object.freeze({ cortex: 0, cerebellum: 1, stem: 2 });

/**
 * The brain as a cloud of points.
 * @returns {{ count: number, at: Float32Array, normal: Float32Array, fold: Float32Array, part: Uint8Array }}
 *   `at` and `normal` hold x, y, z for each point in turn.
 */
export function buildCortex(random = seeded(42)) {
  const at = [];
  const normal = [];
  const folds = [];
  const part = [];
  const push = (point, d, height, kind) => {
    at.push(...point);
    normal.push(...d);
    folds.push(height);
    part.push(kind);
  };

  for (let i = 0; i < 3000; i += 1) {
    const d = direction(random);
    const side = random() < 0.5 ? -1 : 1;
    // The inner wall of each hemisphere stays mostly dark: the fissure between them.
    if (d[0] * side < -0.5 && random() < 0.85) continue;
    const height = fold(side * HEMI.offset + d[0] * HEMI.wide, d[1], d[2]);
    push(surface(side, d, 1 + 0.035 * height), d, height, PART.cortex);
  }
  for (let i = 0; i < 520; i += 1) {
    const d = direction(random);
    const side = random() < 0.5 ? -1 : 1;
    if (d[0] * side < -0.2) continue;
    const height = fold(d[0] * 3, d[1] * 3, d[2] * 3);
    const reach = 1 + 0.04 * height;
    push([side * 0.5 + d[0] * 0.22 * reach, 0.2 + d[1] * 0.15 * reach, -0.14 + d[2] * 0.4 * reach], d, height, PART.cortex);
  }
  for (let i = 0; i < 620; i += 1) {
    const d = direction(random);
    if (d[2] < -0.3 && d[1] < 0.2) continue;
    const y = 0.33 + d[1] * 0.17;
    push([d[0] * 0.48, y, 0.6 + d[2] * 0.26], d, Math.sin(y * 95), PART.cerebellum);
  }
  for (let i = 0; i < 360; i += 1) {
    const down = random();
    const angle = random() * TAU;
    const radius = 0.115 - down * 0.03;
    push(
      [Math.cos(angle) * radius, 0.22 + down * 0.78, 0.28 + Math.sin(angle) * radius + down * 0.06],
      [Math.cos(angle), 0, Math.sin(angle)],
      Math.sin(down * 40),
      PART.stem,
    );
  }
  return { count: folds.length, at: new Float32Array(at), normal: new Float32Array(normal), fold: new Float32Array(folds), part: new Uint8Array(part) };
}

// Where each stage lives: a lobe, on alternate hemispheres, so a job crosses the midline as it goes.
const LOBES = Object.freeze([
  { stage: 'Queue', side: -1, d: [0.45, -0.32, -0.83] }, // frontal
  { stage: 'Build', side: 1, d: [0.42, -0.86, 0.32] }, // parietal
  { stage: 'Audit', side: -1, d: [0.96, 0.22, -0.18] }, // temporal
  { stage: 'Merge', side: 1, d: [0.36, -0.22, 0.9] }, // occipital
]);

const normalise = (v) => {
  const length = Math.hypot(...v);
  return v.map((part) => part / length);
};

/**
 * The places a job passes: the orchestrator at the centre (index -1), then a
 * region for each stage, in order. `you` is the person a release waits for,
 * above the brain.
 */
export const ORCHESTRATOR = Object.freeze([0, -0.02, 0.06]);
export const YOU = Object.freeze([0, -0.9, 0.02]);
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
