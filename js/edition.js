// The "one of one" edition system.
//
// A serial such as CC26-KQX-418207 names one plate out of 13,824,000,000.
// Everything about a plate is worked out from its serial and nothing else, so
// the same serial draws the same plate on every device. Pure logic: no DOM,
// no WebGL. It runs in the browser and under `node --test`.

const TAU = Math.PI * 2;

/** Serial letters. I and O are left out because they read as 1 and 0. */
export const SERIAL_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** How many editions one series (one year) holds. */
export const EDITION_COUNT = SERIAL_LETTERS.length ** 3 * 1_000_000;

const SERIAL_SHAPE = /^CC(\d{2})([A-HJ-NP-Z]{3})(\d{6})$/;

/**
 * Where each ring of the medallion sits, in plate units (1 = medallion radius).
 * The renderer reads the same numbers, so the two can never disagree.
 */
export const PLATE = deepFreeze({
  seal: 0.225, // wide enough to carry the full logo
  sealRing: 0.242,
  inscription: { inner: 0.248, outer: 0.296 },
  inner: { inner: 0.308, outer: 0.5 },
  braidA: { radius: 0.54, half: 0.024 },
  edition: { inner: 0.578, outer: 0.62 },
  outer: { inner: 0.63, outer: 0.905 },
  braidB: { radius: 0.945, half: 0.026 },
  rim: 1,
  orbits: [1.17, 1.43, 1.76, 2.16, 2.62],
});

/**
 * Ink pairs. Each plate is printed in two inks that blend across it, the way
 * banknotes are ("iris printing"). Curated so that every pair works on the
 * pale paper and next to the black text.
 */
export const INK_PAIRS = deepFreeze([
  { name: 'emerald and ink blue', a: '#0b5d45', b: '#1d2f7a' },
  { name: 'oxblood and aubergine', a: '#7a1f2b', b: '#3a1d5c' },
  { name: 'prussian blue and teal', a: '#12355b', b: '#0e6b66' },
  { name: 'sepia and olive', a: '#5a3a1e', b: '#4a5a1c' },
  { name: 'violet and rose', a: '#3b2a8c', b: '#8c2a5a' },
  { name: 'graphite and emerald', a: '#1e2a2a', b: '#0b6b4a' },
  { name: 'navy and burgundy', a: '#142a5c', b: '#6b1f3a' },
  { name: 'forest and bronze', a: '#1f4a2a', b: '#7a5a1a' },
]);

// ---------------------------------------------------------------------------
// Serials
// ---------------------------------------------------------------------------

/**
 * Mint a new serial.
 * @param {{ randomInt: (sides: number) => number, year: number }} dice
 *   `randomInt(n)` must return a whole number from 0 to n - 1.
 */
export function mintSerial({ randomInt, year }) {
  if (!Number.isInteger(year)) throw new RangeError(`mintSerial needs a whole year, got ${year}`);

  const roll = (sides) => {
    const value = randomInt(sides);
    if (!Number.isInteger(value) || value < 0 || value >= sides) {
      throw new RangeError(`randomInt(${sides}) returned ${String(value)}; expected a whole number from 0 to ${sides - 1}`);
    }
    return value;
  };

  let letters = '';
  for (let i = 0; i < 3; i += 1) letters += SERIAL_LETTERS[roll(SERIAL_LETTERS.length)];
  const digits = String(roll(1_000_000)).padStart(6, '0');
  const series = String(((year % 100) + 100) % 100).padStart(2, '0');
  return `CC${series}-${letters}-${digits}`;
}

/** A fair whole number from 0 to sides - 1, from the platform's secure random source. */
export function secureRandomInt(sides) {
  if (!Number.isInteger(sides) || sides < 1 || sides > 0x1_0000_0000) {
    throw new RangeError(`secureRandomInt needs a whole number of sides from 1 to 2^32, got ${sides}`);
  }
  // Throw away the top slice of the 32-bit range that would favour low numbers.
  const limit = Math.floor(0x1_0000_0000 / sides) * sides;
  const box = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(box);
  } while (box[0] >= limit);
  return box[0] % sides;
}

/**
 * Read a serial the way a person might type or paste it.
 * @returns {string | null} the canonical form (CC26-KQX-418207), or null.
 */
export function parseSerial(text) {
  if (typeof text !== 'string' || text.length > 64) return null;
  const compact = text.trim().toUpperCase().replace(/[\s_-]+/g, '');
  const match = SERIAL_SHAPE.exec(compact);
  return match ? `CC${match[1]}-${match[2]}-${match[3]}` : null;
}

/** The three parts of a serial, for display. */
export function serialParts(serial) {
  const canonical = parseSerial(serial);
  if (!canonical) throw new RangeError(`Not an edition serial: ${describe(serial)}`);
  const [series, letters, digits] = canonical.split('-');
  return { series, letters, digits };
}

/** The serial as printed on the page: CC26 KQX 418207. */
export function formatSerial(serial) {
  const { series, letters, digits } = serialParts(serial);
  return `${series} ${letters} ${digits}`;
}

/**
 * Do two editions look alike at a glance? They do if they are printed in the
 * same pair of inks, or carry the same pairing of patterns in their two bands.
 */
function looksAlike(serial, other) {
  const a = deriveEdition(serial);
  const b = deriveEdition(other);
  return a.ink.pair === b.ink.pair || (a.inner.kind === b.inner.kind && a.outer.kind === b.outer.kind);
}

/** How many serials mintUnlike will try. About three in four pass, so this is never reached with fair dice. */
const MINT_TRIES = 16;

/**
 * Mint a serial whose plate does not look like the last one shown: other
 * inks, and another pairing of patterns.
 * @param {{ last: unknown, mint: () => string }} visit  `last` is the serial shown before, if any
 */
export function mintUnlike({ last, mint }) {
  const before = parseSerial(last);
  let serial = mint();
  for (let tries = 1; before && tries < MINT_TRIES && looksAlike(serial, before); tries += 1) serial = mint();
  return serial;
}

/**
 * Which edition does this visit get?
 *
 * The policy today: a valid serial in the link wins (so a shared link shows
 * exactly what was shared), unless the page is being refreshed with that
 * edition already on show. Every other visit mints a fresh one that does not
 * look like the last. To make an edition "stick" to a returning visitor
 * instead, this is the one place to change, together with its test.
 *
 * @param {{ link: unknown, mint: () => string, last?: unknown, reload?: boolean }} visit
 *   `last` is the serial this browser showed last; `reload` says the page is being refreshed.
 * @returns {{ serial: string, origin: 'link' | 'visit' }}
 */
export function chooseSerial({ link, mint, last = null, reload = false }) {
  const shared = parseSerial(link);
  if (shared && !(reload && shared === parseSerial(last))) return { serial: shared, origin: 'link' };
  return { serial: mintUnlike({ last, mint }), origin: 'visit' };
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/**
 * Hash a serial (and an optional stream name) into four 32-bit seeds.
 * cyrb128, public domain, by bryc.
 */
export function seedsFromSerial(serial, stream = '') {
  const text = stream ? `${serial}/${stream}` : String(serial);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * A repeatable random stream: the same seeds always give the same numbers,
 * each from 0 up to (not including) 1. sfc32, public domain, by Chris Doty-Humphrey.
 */
export function createRandom(seeds) {
  let [a, b, c, d] = seeds;
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i += 1) next(); // let the state mix before anyone reads it
  return next;
}

const between = (random, low, high) => low + (high - low) * random();
const whole = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const pick = (random, list) => list[Math.floor(random() * list.length)];
const turn = (random) => random() * TAU;
const wrapTurn = (angle) => ((angle % TAU) + TAU) % TAU;

// ---------------------------------------------------------------------------
// Drawing a plate from a serial
// ---------------------------------------------------------------------------

const BAND_KINDS = ['rings', 'rays', 'weave'];

const BAND_RANGE = {
  inner: { lines: [8, 12], lobes: [4, 11], waves: [5, 12] },
  outer: { lines: [11, 17], lobes: [6, 16], waves: [8, 20] },
};

/**
 * Work out every parameter of the plate that a serial names.
 * @returns a frozen, plain object: safe to share, safe to JSON.stringify.
 */
export function deriveEdition(input) {
  const serial = parseSerial(input);
  if (!serial) throw new RangeError(`Not an edition serial: ${describe(input)}`);

  // One named stream per feature: adding a feature later cannot shift the
  // dice of the features that already exist.
  const stream = (name) => createRandom(seedsFromSerial(serial, name));

  const kinds = stream('kinds');
  const innerKind = pick(kinds, BAND_KINDS);
  const outerKind = pick(kinds, BAND_KINDS.filter((kind) => kind !== innerKind));

  const spin = stream('spin')() < 0.5 ? -1 : 1;
  const orbits = drawOrbits(stream('orbits'));

  return deepFreeze({
    serial,
    ink: drawInk(stream('ink')),
    inner: drawBand(stream('inner'), innerKind, 'inner'),
    outer: drawBand(stream('outer'), outerKind, 'outer'),
    braids: [drawBraid(stream('braid-a'), 20, 40), drawBraid(stream('braid-b'), 36, 72)],
    orbits,
    bodies: drawBodies(stream('bodies'), orbits),
    seal: drawSeal(stream('seal')),
    drop: drawDrop(stream('drop')),
    stamps: drawStamps(stream('stamps')),
    spin,
    fibres: seedsFromSerial(serial, 'fibres')[0],
  });
}

function drawInk(random) {
  const pair = whole(random, 0, INK_PAIRS.length - 1);
  const flip = random() < 0.5;
  const { a, b } = INK_PAIRS[pair];
  return {
    pair,
    a: hexToRgb(flip ? b : a),
    b: hexToRgb(flip ? a : b),
    angle: turn(random),
  };
}

function drawBand(random, kind, where) {
  const { inner, outer } = PLATE[where];
  const band = { kind, radius: (inner + outer) / 2, width: outer - inner };
  const limits = BAND_RANGE[where];
  if (kind === 'rings') return { ...band, families: drawRings(random, limits) };
  if (kind === 'rays') return { ...band, families: drawRays(random, band) };
  return { ...band, weave: drawWeave(random, band, limits) };
}

/** Nested wavy rings, twisted one way, crossed by the same rings twisted the other. */
function drawRings(random, limits) {
  const rings = whole(random, limits.lines[0], limits.lines[1]);
  const lobes = whole(random, limits.lobes[0], limits.lobes[1]);
  const twist = between(random, 0.3, 1.5) * (random() < 0.5 ? -1 : 1);
  // How far a ring may swing, as a share of the band's width. The cap keeps
  // every ring a single clean curve (see the "folds over itself" test).
  const sway = Math.min(between(random, 0.09, 0.26), 0.9 / (Math.PI + Math.abs(twist)));
  const amp = sway * rings;
  const phase = turn(random);

  const style = random();
  let second;
  if (style < 0.55) {
    second = { lobes, amp, phase }; // mirror image: an even lattice
  } else if (style < 0.8 && lobes * 2 <= 22) {
    second = { lobes: lobes * 2, amp: amp / 2, phase: turn(random) }; // an octave up
  } else {
    second = { lobes: lobes + 1, amp, phase: turn(random) }; // one lobe more: a slow beat
  }

  return [
    { rings, rays: 0, lobes, amp, twist, phase },
    { rings, rays: 0, lobes: second.lobes, amp: second.amp, twist: -twist, phase: second.phase },
  ];
}

/** Leaning rays crossed by their mirror image: the sunburst lattice of a watch dial. */
function drawRays(random, band) {
  const spacing = between(random, 0.03, 0.046); // plate units between rays, mid-band
  const wanted = Math.round((TAU * band.radius) / spacing / 4) * 4;
  const lean = between(random, 0.5, 1.15); // tangent of the angle the rays cross the band at
  const { rays, rings } = laceable(wanted, (lean * wanted * band.width) / (TAU * band.radius));
  const ripples = pick(random, [0, 1, 1, 2, 3]);
  const amp = ripples === 0 ? 0 : between(random, 0.25, 0.9);
  const twist = Math.PI * ripples;
  const phase = turn(random);
  return [
    { rings, rays, lobes: 0, amp, twist, phase },
    { rings: -rings, rays, lobes: 0, amp, twist, phase: wrapTurn(phase + Math.PI) },
  ];
}

/**
 * The ray count and lean nearest to the ones asked for that two pens can lace
 * without lifting (js/film.js draws them that way). A pen goes out along one
 * ray and back along its mirror image, moving on `2 * rings` rays each time.
 * That visits every other ray, and so needs exactly two pens, only when
 * `rings` is a whole odd number sharing no factor with half the ray count.
 */
function laceable(rays, lean) {
  const sharesNoFactor = (a, b) => (b === 0 ? a === 1 : sharesNoFactor(b, a % b));
  const nearestOdd = 2 * Math.round((lean - 1) / 2) + 1;
  let best = null;
  for (const count of [rays, rays + 4, rays - 4, rays + 8, rays - 8]) {
    if (count < 24) continue;
    for (const rings of [nearestOdd, nearestOdd + 2, nearestOdd - 2, nearestOdd + 4, nearestOdd - 4]) {
      if (rings < 1 || !sharesNoFactor(rings, count / 2)) continue;
      const change = Math.abs(rings - lean) / lean + Math.abs(count - rays) / rays;
      if (!best || change < best.change) best = { rays: count, rings, change };
    }
  }
  if (!best) throw new RangeError(`No lace near ${rays} rays leaning ${lean}`);
  return best;
}

/** Many strands of one sine wave, each a step out of phase: the classic woven rosette. */
function drawWeave(random, band, limits) {
  const waves = whole(random, limits.waves[0], limits.waves[1]);

  const shape = random();
  let scallops = 0;
  if (shape >= 0.45) scallops = shape < 0.75 || waves * 2 > 30 ? waves : waves * 2;
  const depth = scallops === 0 ? 0 : between(random, 0.08, 0.26);

  // Pick the strand count that lands on a readable line density.
  const density = between(random, 50, 72); // lines per plate unit, mid-band
  const across = 2 / (band.width * (1 - depth));
  const around = waves / band.radius;
  const strands = Math.max(6, Math.round((density * TAU) / Math.sqrt(across * across + around * around) / 2) * 2);

  return { waves, strands, scallops, depth, phase: turn(random) };
}

function drawBraid(random, fewest, most) {
  return {
    waves: whole(random, fewest, most),
    strands: pick(random, [2, 3, 3, 4, 5]),
    phase: turn(random),
  };
}

function drawOrbits(random) {
  return PLATE.orbits.map((nominal) => {
    const radius = nominal * (1 + between(random, -0.02, 0.02));
    const lobes = pick(random, [0, 2, 3, 4, 5, 6]);
    const amp = lobes === 0 ? 0 : between(random, 0.006, 0.028);
    return { radius, lobes, amp, phase: turn(random) };
  });
}

/** One body per orbit. Outer bodies take longer to go round, as planets do. */
function drawBodies(random, orbits) {
  const start = turn(random);
  const goldenAngle = 2.399963229728653;
  return orbits.map((orbit, index) => ({
    orbit: index,
    angle: wrapTurn(start + index * goldenAngle + between(random, -0.35, 0.35)),
    period: 90 * orbit.radius * Math.sqrt(orbit.radius) * between(random, 0.9, 1.1), // seconds
  }));
}

function drawSeal(random) {
  return { teeth: pick(random, [36, 40, 48, 56, 64, 72]), hue: random() };
}

/** Three small rosettes, one for each service on the page. */
/**
 * How the seal's stone is dropped onto this plate (js/drop.js): which of the
 * takes in its book (as a share of the way through the book, so that this file
 * need not know how many there are), and the angle the whole drop is turned to.
 * The angle keeps within half a right angle or so of the reader: the stone
 * falls showing its face.
 */
function drawDrop(random) {
  return { take: random(), turn: (random() - 0.5) * 1.8 };
}

function drawStamps(random) {
  return [0, 1, 2].map(() => stampFrom(random));
}

/** One small rosette. The page strikes a new one when a rosette is pressed (js/rosettes.js). */
export function stampFrom(random) {
  return {
    waves: whole(random, 5, 12),
    strands: whole(random, 4, 8) * 2,
    phase: turn(random),
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function describe(value) {
  return typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : `a ${value === null ? 'null' : typeof value}`;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
