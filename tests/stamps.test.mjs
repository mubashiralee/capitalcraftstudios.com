// Checks on the still plate: the drawing that stands in for the live plate
// when WebGL is unavailable.
// Run with: node --test tests/
//
// The owner's brief for the seal (15 November 2026): "I want it to be
// photorealistally added. Something like laser printing it on a stone." The
// live plate draws that stone in js/plate.js, and drops it onto the finished
// plate (js/drop.js). A still drawing shows the same object at rest: a disc of
// black stone, the light of the room on its polish, and the full logo pale
// where a laser frosted it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLATE, deriveEdition } from '../js/edition.js';
import { LOGO } from '../js/logo.js';
import { BAND_LINES, MARK_BOX, bandMarkup, rosetteMarkup, stillPlateMarkup, turntableMarkup } from '../js/stamps.js';

const SERIALS = ['CC26-KQX-418207', 'CC26-ABC-000001', 'CC26-ZZZ-999999'];

/** How light a colour is, 0 (black) to 1 (white), by the WCAG formula. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

/** The three parts of the seal, in the order they are drawn, with what follows them. */
function sealOf(markup) {
  const found = markup.match(
    /<circle class="still__seal" fill="(#[0-9a-f]{6})" stroke="(#[0-9a-f]{6})" stroke-width="[\d.]+" r="([\d.]+)"\/>(<path class="still__sheen"[^>]*\/>)(<path class="still__mark"[^>]*\/>)(.*)$/s,
  );
  assert.ok(found, 'the still plate has a seal: a stone, then the light on it, then the mark');
  const [, stone, edge, radius, sheen, mark, after] = found;
  return { stone, edge, radius: Number(radius), sheen, mark, after };
}

test('the still plate ends with its seal: a disc of dark stone the size of the live one, with the full logo pale on it', () => {
  for (const serial of SERIALS) {
    const seal = sealOf(stillPlateMarkup(deriveEdition(serial)));

    // The drawing is 100 units to the plate's radius.
    assert.equal(seal.radius, PLATE.seal * 100, `${serial}: the stone is the seal's size`);
    assert.ok(luminance(seal.stone) < 0.02, `${serial}: the stone is nearly black, not ${seal.stone}`);
    assert.ok(luminance(seal.edge) > luminance(seal.stone), `${serial}: the stone's edge catches more light than its face`);

    const fill = seal.mark.match(/ fill="(#[0-9a-f]{6})"/);
    assert.ok(fill, `${serial}: the mark has a colour of its own`);
    assert.ok(contrast(fill[1], seal.stone) >= 7, `${serial}: the mark reads on the stone (${contrast(fill[1], seal.stone).toFixed(1)} to 1)`);
    assert.ok(seal.mark.includes(` d="${LOGO.d}"`), `${serial}: the mark is the full logo`);

    // Nothing is drawn over the seal.
    assert.equal(seal.after, '</svg>', `${serial}: the seal is the last thing drawn`);
  }
});

test('the light on the stone lies above the mark and does not cut through its letters', () => {
  const seal = sealOf(stillPlateMarkup(deriveEdition(SERIALS[0])));
  const { radius } = seal;

  // The light is the part of the disc above a chord: from one point on the edge, round the top, to another.
  const path = seal.sheen.match(/ d="M(-?[\d.]+) (-?[\d.]+)A([\d.]+) ([\d.]+) 0 0 1 (-?[\d.]+) (-?[\d.]+)Z"/);
  assert.ok(path, `the light is one arc closed by its chord, not ${seal.sheen}`);
  const [x1, y1, rx, ry, x2, y2] = path.slice(1).map(Number);
  assert.equal(rx, radius);
  assert.equal(ry, radius);
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    assert.ok(Math.abs(Math.hypot(x, y) - radius) < 0.12, `the chord ends on the stone's edge, not at ${x}, ${y}`);
    assert.ok(y < 0, 'the chord ends in the upper half of the stone (y grows downwards)');
  }
  assert.ok(x1 < 0 && x2 > 0, 'the arc runs from the left of the stone, over its top, to the right');

  // The mark's box, in the drawing's units (js/stamps.js keeps it as shares of the seal's radius).
  const top = -MARK_BOX.halfHeight * radius;
  const chordAt = (x) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  for (const x of [-MARK_BOX.halfWidth * radius, 0, MARK_BOX.halfWidth * radius]) {
    assert.ok(chordAt(x) < top, `at x = ${x.toFixed(1)} the light stops at ${chordAt(x).toFixed(2)}, above the mark's top edge (${top.toFixed(2)})`);
  }

  // It is a wash of light, not a patch of paint.
  const opacity = seal.sheen.match(/ fill-opacity="([\d.]+)"/);
  assert.ok(opacity && Number(opacity[1]) > 0 && Number(opacity[1]) <= 0.15, 'the light is faint');
});

// ---- Ornaments the page draws in front of the reader (js/tracer.js) ----
// The owner's brief (15 November 2026): "each pattern on the other screens
// should be made live when scrolled on that page."

/** The lines of a drawing that the page may draw, as the text of their tags. */
const tracedLines = (markup) => [...markup.matchAll(/<path class="[^"]* trace"[^>]*>/g)].map(([tag]) => tag);

test('every ornament on the sheets is made of lines the page can draw: each 1 long, one unbroken stroke, in a drawing dashed 1 on and 2 off', () => {
  const stamp = { waves: 9, strands: 12, phase: 1.3 };
  const ornaments = {
    band: { markup: bandMarkup(stamp, 900, 38), lines: BAND_LINES },
    rosette: { markup: rosetteMarkup(stamp), lines: 2 + stamp.strands + 4 }, // two rings, the outer weave, the inner weave of four
    floor: { markup: turntableMarkup(stamp, { feet: 3, reach: 0.6 }), lines: 3 + 10 + 8 }, // three rings, a weave of ten at most, a weave of eight
  };
  for (const [name, { markup, lines }] of Object.entries(ornaments)) {
    const traced = tracedLines(markup);
    assert.equal(traced.length, lines, `the ${name} has ${lines} lines to draw`);
    for (const tag of traced) {
      assert.ok(tag.includes(' pathLength="1"'), `${name}: a line to draw is 1 long: ${tag.slice(0, 80)}`);
      const d = tag.match(/ d="([^"]*)"/)[1];
      assert.equal(d.match(/M/g).length, 1, `${name}: a line to draw is one stroke, pen down once`);
    }
    // A dash of 1 draws the whole line. The gap after it is longer than the line, so a line slid a
    // shade over 1 out of sight (to hide its round end) does not let the next dash peep in at its far end.
    assert.equal(markup.match(/stroke-dasharray="[^"]*"/g).length, 1, `${name}: the dash is set once, for all its lines`);
    assert.ok(markup.includes('stroke-dasharray="1 2"'), `${name}: dashed 1 on, 2 off`);
    assert.ok(markup.indexOf('stroke-dasharray="1 2"') < markup.indexOf(' trace"'), `${name}: the dash is set before the lines it applies to`);
  }
});

test('the still plate is not drawn by the tracer: none of its lines are marked for it', () => {
  assert.equal(tracedLines(stillPlateMarkup(deriveEdition(SERIALS[0]))).length, 0);
});
