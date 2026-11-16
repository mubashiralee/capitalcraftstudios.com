// Checks on the drawing of the "next" arrow: the arrow sits on the middle of
// its dial, and the ring round it is cut into one equal arc for each sheet.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARROW, DIAL, ringArcs } from '../js/dial.js';

const TAU = Math.PI * 2;

/** The points an arrow's path names: M and L take pairs, V keeps x and takes y. */
function pointsOf(d) {
  const points = [];
  let x = 0;
  let y = 0;
  for (const [, command, rest] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    assert.ok('MLV'.includes(command), `unexpected path command ${command}`);
    const numbers = rest.trim().split(/[\s,]+/).map(Number);
    assert.ok(numbers.every(Number.isFinite), `bad number in "${command}${rest}"`);
    if (command === 'V') for (const value of numbers) points.push([x, (y = value)]);
    else for (let i = 0; i < numbers.length; i += 2) points.push([(x = numbers[i]), (y = numbers[i + 1])]);
  }
  return points;
}

/** One arc of the ring, read back from its path: where it starts and ends, as angles clockwise from 12 o'clock. */
function readArc(d) {
  const found = d.match(/^M(-?[\d.]+) (-?[\d.]+)A(-?[\d.]+) (-?[\d.]+) 0 ([01]) ([01]) (-?[\d.]+) (-?[\d.]+)$/);
  assert.ok(found, `not a single arc: ${d}`);
  const [x0, y0, rx, ry, large, sweep, x1, y1] = found.slice(1).map(Number);
  const angle = (x, y) => (Math.atan2(x, -y) + TAU) % TAU;
  return { x0, y0, x1, y1, rx, ry, large, sweep, from: angle(x0, y0), to: angle(x1, y1) };
}

test('the arrow is drawn about the middle of the dial, the same on its left as on its right', () => {
  // The owner's report of 15 November 2026: "The arrow you added is not in the center."
  const points = pointsOf(ARROW.d);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  assert.equal(Math.min(...xs) + Math.max(...xs), 0, 'the arrow is not centred across');
  assert.equal(Math.min(...ys) + Math.max(...ys), 0, 'the arrow is not centred up and down');
  // Mirrored left to right it is the same drawing.
  const key = ([x, y]) => `${x + 0},${y}`;
  const drawn = new Set(points.map(key));
  for (const [x, y] of points) assert.ok(drawn.has(key([-x, y])), `the point ${x},${y} has no twin on the other side`);
  // It points down: its lowest point is on the centre line, and its wings end above that.
  const tip = points.find(([, y]) => y === Math.max(...ys));
  assert.equal(tip[0], 0);
  assert.deepEqual(ARROW.box, { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) });
});

test('the arrow, even as it slides out when pressed, stays clear of the ring round it', () => {
  const reach = Math.max(...pointsOf(ARROW.d).map(([x, y]) => Math.hypot(x, y + DIAL.slide)));
  const ringInside = DIAL.ring - DIAL.inked / 2;
  assert.ok(reach + DIAL.stroke / 2 < ringInside - 1, `the sliding arrow reaches ${reach}, the ring begins at ${ringInside}`);
  assert.ok(DIAL.ring + DIAL.inked / 2 <= DIAL.size / 2, 'the ring runs off the button');
});

test('a worked example: a ring of 4 arcs, radius 10, with gaps of 2 along the ring', () => {
  const arcs = ringArcs(4, 10, 2);
  assert.equal(arcs.length, 4);
  // A gap of 2 on a ring of radius 10 is 0.2 radians: 0.1 either side of each quarter.
  const first = readArc(arcs[0]);
  assert.ok(Math.abs(first.from - 0.1) < 1e-3, `the first arc starts ${first.from} round`);
  assert.ok(Math.abs(first.to - (TAU / 4 - 0.1)) < 1e-3, `the first arc ends ${first.to} round`);
  assert.equal(first.sweep, 1, 'the ring runs clockwise');
  assert.equal(first.large, 0);
});

test('a ring is cut into equal arcs, clockwise from the top, each on the circle, with equal gaps between', () => {
  for (const [count, radius, gap] of [[2, 25, 2.4], [5, 25, 2.4], [7, 22.5, 0], [9, 25, 3], [16, 40, 1]]) {
    const arcs = ringArcs(count, radius, gap).map(readArc);
    assert.equal(arcs.length, count);
    const share = TAU / count;
    const half = gap / radius / 2;
    arcs.forEach((arc, index) => {
      assert.ok(Math.abs(Math.hypot(arc.x0, arc.y0) - radius) < 2e-3, 'an arc starts off the circle');
      assert.ok(Math.abs(Math.hypot(arc.x1, arc.y1) - radius) < 2e-3, 'an arc ends off the circle');
      assert.equal(arc.rx, radius);
      assert.equal(arc.ry, radius);
      assert.equal(arc.sweep, 1);
      assert.equal(arc.large, share - 2 * half > Math.PI ? 1 : 0);
      const from = index * share + half;
      const to = (index + 1) * share - half;
      const off = (a, b) => Math.abs(((a - b + Math.PI + TAU) % TAU) - Math.PI);
      assert.ok(off(arc.from, from) < 1e-3, `arc ${index} of ${count} starts at ${arc.from}, not ${from}`);
      assert.ok(off(arc.to, to % TAU) < 1e-3, `arc ${index} of ${count} ends at ${arc.to}, not ${to}`);
    });
  }
});

test('a ring of one arc is a whole circle, and a ring needs a count, a size and room for its gaps', () => {
  const [whole] = ringArcs(1, 10, 0);
  // One arc cannot start and end on the same point, so a whole circle is drawn as two halves.
  assert.match(whole, /^M0 -10A10 10 0 0 1 0 10A10 10 0 0 1 0 -10Z$/);
  assert.throws(() => ringArcs(0, 10, 1), RangeError);
  assert.throws(() => ringArcs(2.5, 10, 1), RangeError);
  assert.throws(() => ringArcs(3, 0, 1), RangeError);
  assert.throws(() => ringArcs(3, 10, -1), RangeError);
  assert.throws(() => ringArcs(3, 10, Number.NaN), RangeError);
  // Three gaps of 21 are longer than the ring itself (about 62.8): there would be nothing left to draw.
  assert.throws(() => ringArcs(3, 10, 21), RangeError);
});
