// The film of the plate being drawn.
//
// Ten pens draw the whole plate, and each draws one unbroken line: it is set
// down once and never lifts. This file works out, for an edition, what each of
// those ten lines is, where its pen sets off, when, and in which ink.
//
// Pure numbers, no page and no WebGL. js/plate.js hands the plan to the shader;
// tests/film.test.mjs walks every line from end to end to prove it is unbroken,
// and checks that the shader's way of asking "how far along its line is this
// point?" gives the same answer as walking there.
//
// Two measures are used throughout:
//   turns  how far a pen has travelled: once round the plate = 1
//   at     where round the plate a point is: 0..1, with 0.5 at three o'clock,
//          growing anticlockwise. The angle in radians is (at - 0.5) * TAU.

import { PLATE } from './edition.js';

const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const mod = (x, y) => x - y * Math.floor(x / y); // never negative, like the shader's mod()
const ease = (e) => e * e * (3 - 2 * e);
const apart = (a, b) => Math.abs(frac(a - b + 0.5) - 0.5); // how far apart two places round the plate are

/** The ten lines, from the outside in: the order they are drawn in. */
export const LINE = Object.freeze({
  orbits: 0,
  rim: 1,
  braidB: 2,
  outerA: 3,
  outerB: 4,
  editionRing: 5,
  braidA: 6,
  innerA: 7,
  innerB: 8,
  sealRing: 9,
});
export const LINE_COUNT = 10;

/** How a band is drawn. The shader reads the same numbers. */
export const KIND = Object.freeze({ spiral: 0, weave: 1, lace: 2 });

/** Turns a pen takes to step from the first ring of a double rule out to the second. */
export const TIE = 0.06;
/** Turns a pen takes to come down from one orbit to the next. */
export const DESCENT = 0.16;

/** The most pens at work at any moment: more than this and the eye cannot follow them. */
const MOST_PENS = 4;

/**
 * Each line's ink, as a place along the edition's fan of five inks (0 is one
 * end of the fan, 1 the other). The ten are spread evenly, so no two lines
 * share a colour, and dealt out so that lines lying side by side on the plate
 * are far apart in the fan. The two lines woven through one band are furthest
 * apart of all: the band reads as two colours laced together.
 */
const INK = Object.freeze([0, 9, 5, 3, 8, 7, 2, 1, 6, 4].map((place) => place / 9));

/** The plain circles that frame the bands, from the centre out, and the line each belongs to. */
const RULES = Object.freeze([
  { radius: PLATE.sealRing, line: LINE.sealRing, band: -1 },
  { radius: PLATE.inscription.outer + 0.005, line: LINE.innerA, band: 0 },
  { radius: PLATE.inner.inner, line: LINE.innerA, band: 0 },
  { radius: PLATE.inner.outer, line: LINE.innerB, band: 0 },
  { radius: PLATE.edition.inner - 0.004, line: LINE.editionRing, band: -1 },
  { radius: PLATE.edition.outer + 0.004, line: LINE.outerA, band: 1 },
  { radius: PLATE.outer.inner, line: LINE.outerA, band: 1 },
  { radius: PLATE.outer.outer, line: LINE.outerB, band: 1 },
  { radius: PLATE.rim, line: LINE.rim, band: -1 },
]);

// ---------------------------------------------------------------------------
// The three ways a band is made from unbroken lines
// ---------------------------------------------------------------------------

/** How far a line of a family swings from its plain course, in line spacings. */
const sway = (family, rho, at) =>
  family.amp * Math.sin(Math.PI * rho) * Math.cos(family.lobes * (at - 0.5) * TAU + family.twist * rho + family.phase);

// Spiral: one wavy line that leaves the band's inner edge and winds out to its
// outer edge, `rings` turns later. A second, wound the other way, crosses it.

function spiralPoint(family, start, way, turns) {
  const at = frac(start + way * turns);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 48; i += 1) {
    const rho = (low + high) / 2;
    if (family.rings * rho + sway(family, rho, at) < turns) low = rho;
    else high = rho;
  }
  return { rho: (low + high) / 2, at };
}

function spiralTurns(family, start, way, rho, at) {
  const round = frac(way * (at - start));
  const level = family.rings * rho - round + sway(family, rho, at);
  const nearest = Math.floor(level + 0.5);
  const turns = nearest + round;
  if (turns < -1e-3 || turns > family.rings + 1e-3) return null; // past either end of the line
  return { turns, miss: level - nearest };
}

// Weave: strands of one sine wave. With a whole number of waves each strand
// would close on itself and there would be as many lines as strands. Give the
// wave a fraction more (`step` strands' worth per turn) and each strand runs
// on into the next: `step` unbroken lines, each `strands / step` turns long.

function weavePoint(weave, strand, start, way, turns) {
  const along = mod(start + way * turns, weave.strands / weave.step); // turns from the seam
  const angle = (along - 0.5) * TAU;
  const swing = Math.sin(weave.waves * angle + weave.phase + (TAU * strand) / weave.strands);
  return {
    rho: (swing * (1 - weave.depth) + 1 + weave.depth * Math.cos(weave.scallops * angle)) / 2,
    at: frac(along),
  };
}

/** The two strands that pass nearest a point: which line each is, and how far along it. */
function weaveTurns(weave, lines, rho, at) {
  const angle = (at - 0.5) * TAU;
  const swing = (2 * rho - 1 - weave.depth * Math.cos(weave.scallops * angle)) / (1 - weave.depth);
  if (Math.abs(swing) >= 1) return [];
  const perTurn = weave.strands / TAU;
  const phase = weave.waves * angle + weave.phase;
  const arc = Math.asin(swing);
  return [perTurn * (arc - phase), perTurn * (Math.PI - arc - phase)].map((level) => {
    const nearest = Math.floor(level + 0.5);
    const which = mod(nearest, weave.step);
    const lap = (mod(nearest, weave.strands) - which) / weave.step; // times this line has passed the seam
    const { start, way } = lines[which];
    return { which, turns: mod(way * (lap + at - start), weave.strands / weave.step), miss: level - nearest };
  });
}

/** Where a weave line should set off: the trough (or crest) that touches the band's edge nearest `want`. */
function weaveStart(weave, strand, crest, want) {
  const length = weave.strands / weave.step;
  const target = crest ? Math.PI / 2 : -Math.PI / 2;
  const first = (target - weave.phase - (TAU * strand) / weave.strands) / (weave.waves * TAU) + 0.5;
  const gap = 1 / weave.waves;
  let best = null;
  for (let j = Math.ceil(-first / gap); first + j * gap < length; j += 1) {
    const along = first + j * gap;
    const scallop = Math.cos(weave.scallops * (along - 0.5) * TAU);
    const lift = (weave.depth * (1 + (crest ? -scallop : scallop))) / 2; // how far short of the edge it stops
    const cost = lift * 1000 + apart(along, want);
    if (!best || cost < best.cost) best = { along, cost };
  }
  return best.along;
}

// Lace: leaning strokes that cross the band. A pen goes out along one stroke
// and comes back along its mirror image, over and over, lacing round the band
// like thread through eyelets. Two pens share the strokes: the odd ones and
// the even ones.

function laceOf(families) {
  const [out, back] = families;
  const rays = out.rays;
  const lean = out.rings;
  const half = rays / 2;
  let inverse = 0;
  for (let k = 1; k < half; k += 1) {
    if (mod(k * lean, half) === 1) inverse = k;
  }
  const whole = Number.isInteger(lean) && lean > 0 && Number.isInteger(half) && back.rings === -lean && back.rays === rays;
  if (!whole || (inverse === 0 && half !== 1)) {
    throw new RangeError(`This band cannot be laced without lifting the pen: ${rays} rays leaning ${lean}.`);
  }
  // `inverse` undoes multiplying by `lean` when counting round `half`: it turns a stroke's number back into its place in the queue.
  return { out, back, rays, lean, inverse, zigzag: (2 * lean) / rays };
}

/** A point on the lace, `natural` turns from stroke 0 of its line, in the direction the strokes lean. */
function lacePoint(lace, which, natural) {
  const zigzags = mod(natural, lace.lean) / lace.zigzag;
  const pair = Math.floor(zigzags);
  const part = zigzags - pair;
  const stroke = which - 2 * lace.lean * pair;
  if (part < 0.5) {
    const rho = 2 * part;
    return { rho, at: frac((stroke - lace.lean * rho - sway(lace.out, rho, 0)) / lace.rays) };
  }
  const rho = 2 - 2 * part;
  return { rho, at: frac((stroke - 2 * lace.lean + lace.lean * rho - sway(lace.back, rho, 0)) / lace.rays) };
}

function laceTurns(lace, lines, rho, at) {
  return [lace.out, lace.back].map((family, back) => {
    const level = family.rings * rho + lace.rays * at + sway(family, rho, at);
    const nearest = Math.floor(level + 0.5);
    const which = mod(nearest, 2);
    const pair = mod(((which - nearest) / 2) * lace.inverse - back, lace.rays / 2);
    const natural = (pair + (back ? 1 - rho / 2 : rho / 2)) * lace.zigzag;
    const { start, way } = lines[which];
    // The strokes lean clockwise, so a pen going anticlockwise walks the lace backwards.
    return { which, turns: mod(-way * (natural - start), lace.lean), miss: level - nearest };
  });
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const orbitRadius = (orbit, at) => orbit.radius * (1 + orbit.amp * Math.cos(orbit.lobes * (at - 0.5) * TAU + orbit.phase));

function planBand(band, index, spin, want) {
  const lineA = index === 0 ? LINE.innerA : LINE.outerA;
  const lineB = index === 0 ? LINE.innerB : LINE.outerB;
  const wayA = -spin;
  const wayB = spin;
  const plan = { inner: PLATE[index === 0 ? 'inner' : 'outer'].inner, width: band.width };
  let sets; // where line A's pattern sets off, round the plate
  let lands; // where line B's pattern ends

  if (band.kind === 'rings') {
    const [first, second] = band.families;
    plan.kind = KIND.spiral;
    plan.families = band.families;
    plan.turns = first.rings;
    plan.lines = [
      { line: lineA, start: want[lineA], way: wayA },
      { line: lineB, start: want[lineB], way: wayB },
    ];
    sets = want[lineA];
    lands = frac(want[lineB] + wayB * second.rings);
  } else if (band.kind === 'weave') {
    const weave = { ...band.weave, step: 2, waves: band.weave.waves + 2 / band.weave.strands };
    plan.kind = KIND.weave;
    plan.weave = weave;
    plan.turns = weave.strands / 2;
    plan.lines = [
      { line: lineA, start: weaveStart(weave, 0, false, want[lineA]), way: wayA },
      { line: lineB, start: weaveStart(weave, 1, true, want[lineB]), way: wayB },
    ];
    sets = frac(plan.lines[0].start);
    lands = frac(plan.lines[1].start);
  } else {
    const lace = laceOf(band.families);
    plan.kind = KIND.lace;
    plan.lace = lace;
    plan.families = band.families;
    plan.turns = lace.lean;
    // Line A sets off where a stroke meets the band's inner edge; line B where one meets the outer edge.
    const nearest = (which, edge, wanted) => {
      let best = null;
      for (let pair = 0; pair < lace.rays / 2; pair += 1) {
        const at = frac((which - 2 * lace.lean * pair - edge * lace.lean) / lace.rays);
        const cost = apart(at, wanted);
        if (!best || cost < best.cost) best = { pair, at, cost };
      }
      return best;
    };
    const a = nearest(0, 0, want[lineA]);
    const b = nearest(1, 1, want[lineB]);
    plan.lines = [
      { line: lineA, start: a.pair * lace.zigzag, way: wayA },
      { line: lineB, start: (b.pair + 0.5) * lace.zigzag, way: wayB },
    ];
    sets = a.at;
    lands = b.at;
  }

  plan.lines[0].offset = 2 + TIE; // two turns of the double rule, and the step between them, come first
  plan.lines[1].offset = 0;
  return { plan, sets, lands, wayA, wayB, lineA, lineB };
}

function planBraid(braid, where, line, way, want) {
  const weave = { waves: braid.waves + 1 / braid.strands, strands: braid.strands, scallops: 0, depth: 0, phase: braid.phase, step: 1 };
  return {
    weave,
    inner: where.radius - where.half,
    width: 2 * where.half,
    line,
    way,
    start: weaveStart(weave, 0, false, want),
    turns: braid.strands,
  };
}

/**
 * Work out the film for one edition.
 * @returns a plain object. `lines` has ten entries, in the order of LINE.
 */
export function planFilm(edition) {
  const { spin } = edition;
  // Pens set off from places spread round the plate, so no two start side by side.
  const base = edition.ink.angle / TAU;
  const want = Array.from({ length: LINE_COUNT }, (_, line) => frac(base + 0.381966 * line));

  const bands = [planBand(edition.inner, 0, spin, want), planBand(edition.outer, 1, spin, want)];
  const braids = [
    planBraid(edition.braids[0], PLATE.braidA, LINE.braidA, spin, want[LINE.braidA]),
    planBraid(edition.braids[1], PLATE.braidB, LINE.braidB, spin, want[LINE.braidB]),
  ];

  const lone = { [LINE.sealRing]: -spin, [LINE.editionRing]: -spin, [LINE.rim]: -spin };
  const rules = RULES.map((rule, index) => {
    if (rule.band < 0) return { ...rule, start: want[rule.line], way: lone[rule.line], offset: 0 };
    const { sets, lands, wayA, wayB, plan } = bands[rule.band];
    const place = index - (rule.band === 0 ? 1 : 5); // 0, 1: the double rule inside the band; 2: its outer edge
    if (place === 0) return { ...rule, start: frac(sets - wayA * TIE), way: wayA, offset: 0 };
    if (place === 1) return { ...rule, start: sets, way: wayA, offset: 1 + TIE };
    return { ...rule, start: lands, way: wayB, offset: plan.turns };
  });
  const ties = bands.map(({ sets, wayA, lineA }, band) => ({
    from: RULES[band === 0 ? 1 : 5].radius,
    to: RULES[band === 0 ? 2 : 6].radius,
    line: lineA,
    band,
    start: frac(sets - wayA * TIE),
    way: wayA,
    offset: 1,
  }));

  // The orbits: one line that circles the widest orbit, comes down to the next,
  // circles that, and so on in. The four descents run on from each other, so
  // together they read as one inbound path. It is kept to the side of the plate
  // away from the words: centred on three o'clock.
  const lean = (edition.orbits[0].phase / TAU - 0.5) * 0.1;
  const orbits = { start: frac(0.5 + lean - spin * 2 * DESCENT), way: spin, descent: DESCENT };

  const turns = new Array(LINE_COUNT);
  turns[LINE.orbits] = 5 + 4 * DESCENT;
  turns[LINE.rim] = 1;
  turns[LINE.editionRing] = 1;
  turns[LINE.sealRing] = 1;
  turns[LINE.braidA] = braids[0].turns;
  turns[LINE.braidB] = braids[1].turns;
  bands.forEach(({ plan, lineA, lineB }) => {
    turns[lineA] = 2 + TIE + plan.turns;
    turns[lineB] = plan.turns + 1;
  });

  // Timing. A longer line takes longer, but not in proportion, or the long
  // ones would crawl. Each pen sets off part-way through the one before, so a
  // few are always at work; the two that share a band nearly together.
  const takes = turns.map((count) => 0.5 + 0.5 * count ** 0.6);
  const wait = [0, 0.45, 0.4, 0.45, 0.16, 0.5, 0.4, 0.45, 0.16, 0.55];
  const starts = [];
  takes.forEach((_, line) => {
    if (line === 0) {
      starts.push(0);
      return;
    }
    let start = starts[line - 1] + wait[line] * takes[line - 1];
    // Never more than MOST_PENS at work: wait for one to finish if need be.
    const busy = starts.map((from, earlier) => from + takes[earlier]).filter((end) => end > start).sort((a, b) => a - b);
    if (busy.length >= MOST_PENS) start = busy[busy.length - MOST_PENS];
    starts.push(start);
  });
  const whole = Math.max(...takes.map((take, line) => starts[line] + take));
  const scale = 1 / whole; // the film is the lines, and ends as the last of them does

  const lines = turns.map((count, line) => ({
    turns: count,
    start: starts[line] * scale,
    duration: takes[line] * scale,
    ink: INK[line],
  }));

  return {
    lines,
    rules,
    ties,
    bands: bands.map(({ plan }) => plan),
    braids,
    orbits,
    // The lettering is typed round its ring while the line beside it is drawn.
    typed: {
      legend: [lines[LINE.innerA].start, 0.16],
      edition: [lines[LINE.editionRing].start, 0.14],
    },
    ramp: inkRamp(edition.ink.a, edition.ink.b),
  };
}

// ---------------------------------------------------------------------------
// Walking a line, and finding the lines near a point
// ---------------------------------------------------------------------------

/**
 * Where line `line` is after `turns` turns of its pen.
 * @returns {{ radius: number, at: number }} a point on the plate.
 */
export function walk(plan, edition, line, turns) {
  if (line === LINE.orbits) {
    const { start, way, descent } = plan.orbits;
    const lap = Math.min(4, Math.floor(turns / (1 + descent)));
    const into = turns - lap * (1 + descent);
    const at = frac(start + way * (lap * descent + into));
    const here = orbitRadius(edition.orbits[4 - lap], at);
    if (into <= 1 || lap === 4) return { radius: here, at };
    const next = orbitRadius(edition.orbits[3 - lap], at);
    return { radius: here + (next - here) * ease((into - 1) / descent), at };
  }

  if (line === LINE.braidA || line === LINE.braidB) {
    const braid = plan.braids[line === LINE.braidA ? 0 : 1];
    const { rho, at } = weavePoint(braid.weave, 0, braid.start, braid.way, turns);
    return { radius: braid.inner + rho * braid.width, at };
  }

  const onRule = (rule, into) => ({ radius: rule.radius, at: frac(rule.start + rule.way * into) });
  const mine = plan.rules.filter((rule) => rule.line === line);
  if (mine.length === 1 && mine[0].band < 0) return onRule(mine[0], turns);

  const band = plan.bands[line === LINE.innerA || line === LINE.innerB ? 0 : 1];
  const first = line === LINE.innerA || line === LINE.outerA;
  const pattern = (into) => {
    const which = first ? 0 : 1;
    const { start, way } = band.lines[which];
    let point;
    if (band.kind === KIND.spiral) point = spiralPoint(band.families[which], start, way, into);
    else if (band.kind === KIND.weave) point = weavePoint(band.weave, which, start, way, into);
    else point = lacePoint(band.lace, which, start - way * into);
    return { radius: band.inner + point.rho * band.width, at: point.at };
  };

  if (!first) return turns < band.turns ? pattern(turns) : onRule(mine[0], turns - band.turns);
  if (turns < 1) return onRule(mine[0], turns);
  if (turns < 1 + TIE) {
    const tie = plan.ties.find((each) => each.line === line);
    const into = turns - 1;
    return { radius: tie.from + (tie.to - tie.from) * ease(into / TIE), at: frac(tie.start + tie.way * into) };
  }
  if (turns < 2 + TIE) return onRule(mine[1], turns - 1 - TIE);
  return pattern(turns - 2 - TIE);
}

/**
 * Every line that passes near a point, the way the shader finds them.
 * @returns {{ line: number, turns: number, gap: number }[]} `gap` is how far
 *   the point is from that line: plate units for plain curves, line spacings
 *   for the lines of a band.
 */
export function near(plan, edition, radius, at) {
  const found = [];

  if (radius > 1.03) {
    const { start, way, descent } = plan.orbits;
    edition.orbits.forEach((orbit, index) => {
      const lap = 4 - index;
      const round = frac(way * (at - start) - lap * descent);
      const here = orbitRadius(orbit, at);
      found.push({ line: LINE.orbits, turns: lap * (1 + descent) + round, gap: radius - here });
      if (index > 0 && round < descent) {
        const next = orbitRadius(edition.orbits[index - 1], at);
        const path = here + (next - here) * ease(round / descent);
        found.push({ line: LINE.orbits, turns: lap * (1 + descent) + 1 + round, gap: radius - path });
      }
    });
    return found;
  }

  for (const rule of plan.rules) {
    if (Math.abs(radius - rule.radius) < 0.03) {
      found.push({ line: rule.line, turns: rule.offset + frac(rule.way * (at - rule.start)), gap: radius - rule.radius });
    }
  }
  for (const tie of plan.ties) {
    const round = frac(tie.way * (at - tie.start));
    if (round < TIE && radius > tie.from - 0.004 && radius < tie.to + 0.004) {
      const path = tie.from + (tie.to - tie.from) * ease(round / TIE);
      found.push({ line: tie.line, turns: tie.offset + round, gap: radius - path });
    }
  }

  plan.bands.forEach((band) => {
    const rho = (radius - band.inner) / band.width;
    if (rho <= 0 || rho >= 1) return;
    let hits;
    if (band.kind === KIND.spiral) {
      hits = band.families
        .map((family, which) => {
          const hit = spiralTurns(family, band.lines[which].start, band.lines[which].way, rho, at);
          return hit && { ...hit, which };
        })
        .filter(Boolean);
    } else if (band.kind === KIND.weave) {
      hits = weaveTurns(band.weave, band.lines, rho, at);
    } else {
      hits = laceTurns(band.lace, band.lines, rho, at);
    }
    for (const hit of hits) {
      const { line, offset } = band.lines[hit.which];
      found.push({ line, turns: offset + hit.turns, gap: hit.miss });
    }
  });

  for (const braid of plan.braids) {
    const rho = (radius - braid.inner) / braid.width;
    if (rho <= 0 || rho >= 1) continue;
    for (const hit of weaveTurns(braid.weave, [braid], rho, at)) {
      found.push({ line: braid.line, turns: hit.turns, gap: hit.miss });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Inks
// ---------------------------------------------------------------------------

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toScreen = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// OKLab, by Björn Ottosson (public domain): a colour space in which a straight
// line between two colours looks like an even change to the eye.
function toOklab([red, green, blue]) {
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** How light every ink is (OKLab lightness): dark enough for a hairline to read on pale paper. */
const INK_LIGHTNESS = [0.42, 0.46];
/** How strong an ink may be (OKLab chroma). Each is as rich as this, or as rich as a screen can show. */
const INK_STRENGTH = 0.17;
/**
 * How much of the colour wheel the five inks fan across, in turns. Under a
 * third and neighbours are hard to tell apart on a hairline; much over, and
 * the ends are near-opposites that fight.
 */
const INK_FAN = [1 / 3, 5 / 12];

/**
 * The five inks the ten lines are mixed from: a fan of hues centred between
 * the edition's two inks and wide enough to take both in. All five are the
 * same weight (one lightness, each as rich as it can be), so they read as one
 * family in different colours and none stands out from the rest.
 * @param {number[]} first   the edition's first ink, [red, green, blue] 0..1
 * @param {number[]} second  its second
 * @returns {number[][]} five inks, from the first ink's side of the fan to the second's
 */
export function inkRamp(first, second) {
  const [L1, a1, b1] = toOklab(first);
  const [L2, a2, b2] = toOklab(second);
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  // A grey ink has no hue of its own: let it borrow the other's.
  const h1 = c1 < 0.03 ? Math.atan2(b2, a2) : Math.atan2(b1, a1);
  const h2 = c2 < 0.03 ? h1 : Math.atan2(b2, a2);
  const swing = mod(h2 - h1 + Math.PI, TAU) - Math.PI; // from the first ink to the second, the short way round
  const fan = (swing < 0 ? -1 : 1) * TAU * Math.min(INK_FAN[1], Math.max(INK_FAN[0], (1.7 * Math.abs(swing)) / TAU));
  const middle = h1 + swing / 2;
  const lightness = Math.min(INK_LIGHTNESS[1], Math.max(INK_LIGHTNESS[0], (L1 + L2) / 2));
  const shows = (rgb) => rgb.every((channel) => channel >= 0 && channel <= 1);

  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const hue = middle + fan * (t - 0.5);
    const ink = (strength) => fromOklab([lightness, strength * Math.cos(hue), strength * Math.sin(hue)]);
    // The richest this hue can be and still be shown on a screen.
    let low = 0;
    let high = INK_STRENGTH;
    if (!shows(ink(high))) {
      for (let i = 0; i < 24; i += 1) {
        const strength = (low + high) / 2;
        if (shows(ink(strength))) low = strength;
        else high = strength;
      }
      high = low;
    }
    return ink(high).map((channel) => toScreen(Math.min(1, Math.max(0, channel))));
  });
}
