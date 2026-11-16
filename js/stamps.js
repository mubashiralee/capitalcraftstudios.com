// Small engraved ornaments, drawn as SVG markup: the rosettes beside the
// services, the band of lines at the head of each sheet, the security fibres
// in the paper, and the still plate that stands in when WebGL is unavailable.
//
// Every function takes numbers and returns a string, so the same code runs in
// the browser and in Node (tests/stamps.test.mjs).

import { PLATE, createRandom } from './edition.js';
import { LOGO, placeLogo } from './logo.js';

const TAU = Math.PI * 2;

/** A coordinate to one decimal place, without a trailing ".0". Keeps the markup small. */
const n = (value) => {
  const text = value.toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
};

/** One strand of a woven ring: a sine wave wrapped round a circle. */
function strand({ inner, outer, waves, phase, steps }) {
  const middle = (inner + outer) / 2;
  const half = (outer - inner) / 2;
  let d = '';
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * TAU;
    const radius = middle + half * Math.sin(waves * angle + phase);
    d += `${i === 0 ? 'M' : 'L'}${n(radius * Math.cos(angle))} ${n(radius * Math.sin(angle))}`;
  }
  return `${d}Z`;
}

// A line the page may draw in front of the reader (js/tracer.js): it has a length of 1, so that a
// drawing whose lines are dashed 1 long can draw it by sliding that dash along it. The gap after the
// dash is 2 long: an undrawn line is slid a shade over 1, and a gap of only 1 would let the next dash
// show as a speck at the line's far end.
const TRACED = ' trace" pathLength="1';
const DASH = 'stroke-dasharray="1 2"';

/** A woven ring: `strands` copies of one strand, each a step out of phase. `traced`: see TRACED. */
function weave({ inner, outer, waves, strands, phase = 0, steps, traced = false }) {
  const count = steps ?? Math.max(72, waves * 10);
  let markup = '';
  for (let k = 0; k < strands; k += 1) {
    const d = strand({ inner, outer, waves, phase: phase + (k / strands) * TAU, steps: count });
    markup += `<path class="${k % 2 ? 'ink-b' : 'ink-a'}${traced ? TRACED : ''}" stroke="${k % 2 ? INK_B : INK_A}" d="${d}"/>`;
  }
  return markup;
}

/** A plain ring as a line the page may draw: once round from three o'clock. */
function tracedRing(radius, tone) {
  const r = n(radius);
  return `<path class="ink-${tone}${TRACED}" stroke="${tone === 'a' ? INK_A : INK_B}" d="M${r} 0A${r} ${r} 0 1 1 -${r} 0A${r} ${r} 0 1 1 ${r} 0Z"/>`;
}

// Presentation colours for when the SVG stands alone (as an image file).
// On the page, the .ink-a / .ink-b classes override them with the edition's inks.
const INK_A = '#12355b';
const INK_B = '#0e6b66';

/** How far the logo reaches across the seal, as a share of the seal's radius. The rest is the seal's rim. */
export const MARK_REACH = 0.8;

/** The box the mark fills on the seal's face, as shares of the seal's radius: half its width and half its height. */
export const MARK_BOX = Object.freeze({
  halfWidth: (MARK_REACH * LOGO.box.width) / 2 / LOGO.reach,
  halfHeight: (MARK_REACH * LOGO.box.height) / 2 / LOGO.reach,
});

// The seal is a disc of polished black stone with the logo engraved into it, pale
// where the laser frosted it (the live plate draws the same stone: js/plate.js).
const STONE = '#111112';
const STONE_EDGE = '#2f2f31';
const STONE_MARK = '#d6d4cd';

/** Where the light of the room lies on the stone: the part of the disc above a chord that rises to the right. */
const SHEEN = Object.freeze({ from: 197, to: 325 }); // degrees round the disc, clockwise from three o'clock

/** The seal, centred on 0,0: the stone, the light on its polish, and the full logo engraved in it. */
function sealMarkup(radius) {
  const at = (degrees) => {
    const angle = (degrees * Math.PI) / 180;
    return `${n(radius * Math.cos(angle))} ${n(radius * Math.sin(angle))}`;
  };
  const { scale, dx, dy } = placeLogo(MARK_REACH * radius);
  return (
    `<circle class="still__seal" fill="${STONE}" stroke="${STONE_EDGE}" stroke-width="0.4" r="${n(radius)}"/>` +
    `<path class="still__sheen" fill="#fff" fill-opacity="0.07" stroke="none" d="M${at(SHEEN.from)}A${n(radius)} ${n(radius)} 0 0 1 ${at(SHEEN.to)}Z"/>` +
    `<path class="still__mark" fill="${STONE_MARK}" stroke="none" transform="translate(${n(dx)} ${n(dy)}) scale(${scale.toFixed(5)})" d="${LOGO.d}"/>`
  );
}

/** A small rosette for one service. */
export function rosetteMarkup({ waves, strands, phase }) {
  return (
    `<svg class="rosette" viewBox="-50 -50 100 100" fill="none" stroke-width="0.55" ${DASH} aria-hidden="true" focusable="false">` +
    tracedRing(48.6, 'a') +
    weave({ inner: 21, outer: 45.5, waves, strands, phase, traced: true }) +
    tracedRing(19, 'b') +
    weave({ inner: 9, outer: 17, waves: Math.max(3, Math.round(waves / 2)), strands: 4, phase, traced: true }) +
    '</svg>'
  );
}

/** How many lines a band has: one for each ink of the edition's fan. */
export const BAND_LINES = 5;

// A band's colours when its SVG stands alone. On the page the .band__line--N classes set the edition's inks.
const BAND_INKS = ['#12355b', '#10506d', '#0e6b66', '#256a45', '#55641f'];

/** A smooth line through points: each point steers the curve, which passes midway between neighbours. */
function smooth(points) {
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i];
    const [nextX, nextY] = points[i + 1];
    d += `Q${n(x)} ${n(y)} ${n((x + nextX) / 2)} ${n((y + nextY) / 2)}`;
  }
  const [lastX, lastY] = points[points.length - 1];
  return `${d}L${n(lastX)} ${n(lastY)}`;
}

/**
 * The band at the head of a sheet: five lines that run its whole length
 * without a break, like the ribbon along the edge of a banknote. Each line is
 * a wave; the five run a fifth of a turn apart, so they weave, and the band
 * swells and narrows along its length. Every line has a length of 1
 * (pathLength), so the page can draw it by sliding one dash along it.
 * @param {{ waves: number, phase: number }} spec  one of the edition's stamps
 * @param {number} width   in CSS pixels: the band is drawn at its real size, so its lines keep one weight
 * @param {number} height
 */
export function bandMarkup({ waves, phase }, width, height) {
  if (!(width > 0) || !(height > 0)) throw new RangeError(`a band needs a size, not ${width} by ${height}`);
  const w = Math.round(width);
  const h = Math.round(height);
  const reach = h / 2 - 1.5; // how far a line swings from the middle
  const wave = 52 + (waves % 9) * 5; // the length of one wave
  const swell = wave * (4.5 + (waves % 4)); // the band swells and narrows once in this length
  const step = 5;
  let lines = '';
  for (let line = 0; line < BAND_LINES; line += 1) {
    const points = [];
    for (let x = 0; ; x += step) {
      const at = Math.min(x, w);
      const breadth = reach * (0.56 + 0.44 * Math.cos((TAU * at) / swell + phase));
      points.push([at, h / 2 + breadth * Math.sin((TAU * at) / wave + phase + (line / BAND_LINES) * TAU)]);
      if (at === w) break;
    }
    lines += `<path class="band__line band__line--${line + 1} trace" pathLength="1" stroke="${BAND_INKS[line]}" d="${smooth(points)}"/>`;
  }
  return (
    `<svg class="band__svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke-width="1.15" ` +
    `stroke-linecap="round" ${DASH} aria-hidden="true" focusable="false">${lines}</svg>`
  );
}

/**
 * The disc under the Money Tycoon phones: an engraved turntable, seen from
 * above. `feet` phones stand on it, `reach` of the way out from the middle
 * (0 to 1); a soft shadow is laid under each. The first phone stands at the
 * bottom of the drawing, which is the side nearest the viewer once the disc is
 * laid flat.
 */
export function turntableMarkup({ waves, strands, phase }, { feet, reach }) {
  let strobe = '';
  const marks = 144;
  for (let i = 0; i < marks; i += 1) {
    const angle = (i / marks) * TAU;
    const from = i % 12 === 0 ? 44.4 : 45.8;
    strobe += `M${n(from * Math.cos(angle))} ${n(from * Math.sin(angle))}L${n(47.6 * Math.cos(angle))} ${n(47.6 * Math.sin(angle))}`;
  }
  let shadows = '';
  for (let i = 0; i < feet; i += 1) {
    const angle = TAU / 4 - (i / feet) * TAU;
    shadows += `<circle cx="${n(50 * reach * Math.cos(angle))}" cy="${n(50 * reach * Math.sin(angle))}" r="16" fill="url(#turntable-foot)"/>`;
  }
  return (
    '<svg class="turntable" viewBox="-50 -50 100 100" fill="none" stroke-width="0.34" aria-hidden="true" focusable="false">' +
    '<defs>' +
    '<radialGradient id="turntable-disc"><stop offset="0" stop-color="#2a2314"/><stop offset="0.72" stop-color="#16130d"/><stop offset="1" stop-color="#0c0c0a"/></radialGradient>' +
    '<radialGradient id="turntable-foot"><stop offset="0" stop-color="#000" stop-opacity="0.8"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<circle r="49.7" fill="url(#turntable-disc)"/>' +
    `<circle class="ink-a" stroke="${INK_A}" r="49.2"/>` +
    `<path class="ink-a" stroke="${INK_A}" d="${strobe}"/>` +
    `<g ${DASH}>` +
    tracedRing(43.2, 'a') +
    weave({ inner: 31.5, outer: 42, waves: waves + 6, strands: Math.min(strands, 10), phase, traced: true }) +
    tracedRing(30, 'b') +
    weave({ inner: 12, outer: 28.5, waves, strands: 8, phase, traced: true }) +
    tracedRing(10.4, 'b') +
    '</g>' +
    shadows +
    '</svg>'
  );
}

/**
 * Security fibres: the short coloured threads mixed into banknote paper.
 * Nearly invisible in daylight; they glow under ultraviolet.
 */
export function fibresMarkup(seed, width, height) {
  const random = createRandom([seed >>> 0, (seed ^ 0x9e3779b9) >>> 0, Math.imul(seed, 31) >>> 0, 0x85ebca6b]);
  const count = Math.min(420, Math.round((width * height) / 30000));
  let paths = '';
  for (let i = 0; i < count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const angle = random() * TAU;
    const length = 10 + random() * 16;
    const curl = (random() - 0.5) * 14;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const cx = dx / 2 - Math.sin(angle) * curl;
    const cy = dy / 2 + Math.cos(angle) * curl;
    const tone = 1 + Math.floor(random() * 3);
    paths += `<path class="fibre fibre--${tone}" d="M${n(x)} ${n(y)}q${n(cx)} ${n(cy)} ${n(dx)} ${n(dy)}"/>`;
  }
  return (
    `<svg class="fibres__svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `fill="none" stroke-linecap="round" aria-hidden="true" focusable="false">${paths}</svg>`
  );
}

/**
 * The still plate: the medallion seen face-on, as plain SVG. Simpler than the
 * live plate (its bands are all woven), but drawn from the same edition.
 */
export function stillPlateMarkup(edition, { standalone = false } = {}) {
  const u = 100; // one plate unit, in SVG units
  const [stampA, stampB] = edition.stamps;
  const ring = (radius, width = 0.3, tone = 'a') =>
    `<circle class="ink-${tone}" stroke="${tone === 'a' ? INK_A : INK_B}" stroke-width="${width}" r="${n(radius * u)}"/>`;
  const braid = (spec, at) =>
    weave({
      inner: (at.radius - at.half) * u,
      outer: (at.radius + at.half) * u,
      waves: spec.waves,
      strands: spec.strands,
      phase: spec.phase,
      steps: spec.waves * 10,
    });

  return (
    `<svg class="still" ${standalone ? 'xmlns="http://www.w3.org/2000/svg" ' : ''}viewBox="-104 -104 208 208" ` +
    'fill="none" stroke-width="0.3" aria-hidden="true" focusable="false">' +
    ring(PLATE.rim, 0.8) +
    ring(PLATE.outer.outer) +
    weave({
      inner: PLATE.outer.inner * u,
      outer: PLATE.outer.outer * u,
      waves: stampA.waves + 4,
      strands: stampA.strands * 2,
      phase: stampA.phase,
    }) +
    ring(PLATE.outer.inner) +
    braid(edition.braids[1], PLATE.braidB) +
    braid(edition.braids[0], PLATE.braidA) +
    ring(PLATE.inner.outer, 0.3, 'b') +
    weave({
      inner: PLATE.inner.inner * u,
      outer: PLATE.inner.outer * u,
      waves: stampB.waves,
      strands: stampB.strands * 2,
      phase: stampB.phase,
    }) +
    ring(PLATE.inner.inner, 0.3, 'b') +
    ring(PLATE.sealRing, 0.3, 'b') +
    sealMarkup(PLATE.seal * u) +
    '</svg>'
  );
}
