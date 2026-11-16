// Checks on the small films: the ornaments on the sheets below the plate (the
// band at the head of a sheet, the rosettes, the turntable's floor) are drawn
// in front of the reader, line by line, when their part of the page arrives.
// Run with: node --test tests/
//
// The owner's brief (15 November 2026): "each pattern on the other screens
// should be made live when scrolled on that page."

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ARRIVE, LAG, advance, present, sharesAt } from '../js/trace.js';

const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

test('a worked example: a band of five lines, each starting 0.09 of the film after the one before', () => {
  assert.equal(LAG, 0.09);
  assert.deepEqual(sharesAt(0, 5), [0, 0, 0, 0, 0], 'nothing is drawn as the film starts');
  assert.deepEqual(sharesAt(1, 5), [1, 1, 1, 1, 1], 'everything is drawn as it ends');

  // Each line takes 1 - 4 x 0.09 = 0.64 of the film. Line k starts at 0.09 k.
  const early = sharesAt(0.09, 5);
  assert.ok(early[0] > 0 && early[0] < 0.1, `the first line has just begun: ${early[0]}`);
  assert.deepEqual(early.slice(1), [0, 0, 0, 0], 'the second line is about to start; the rest wait');

  // Halfway through its own time a line is half drawn.
  near(sharesAt(0.32, 5)[0], 0.5, 'the first line at 0.32');
  near(sharesAt(0.09 + 0.32, 5)[1], 0.5, 'the second line at 0.41');
  near(sharesAt(0.36 + 0.32, 5)[4], 0.5, 'the last line at 0.68');

  assert.equal(sharesAt(0.64, 5)[0], 1, 'the first line is done at 0.64');
  assert.ok(sharesAt(0.64, 5)[1] < 1, 'the second is not, yet');
  assert.ok(sharesAt(0.999, 5)[4] < 1, 'the last line ends with the film');
});

test('before the film and after it the lines stay as they are', () => {
  assert.deepEqual(sharesAt(-0.5, 3), [0, 0, 0]);
  assert.deepEqual(sharesAt(7, 3), [1, 1, 1]);
});

test('a line is never ahead of the one before it, and never goes backwards', () => {
  for (const count of [1, 2, 5, 9, 18, 40]) {
    let last = sharesAt(0, count);
    for (let step = 0; step <= 400; step += 1) {
      const now = sharesAt(step / 400, count);
      assert.equal(now.length, count);
      now.forEach((share, index) => {
        assert.ok(share >= 0 && share <= 1, `${count} lines: line ${index} is ${share} drawn`);
        assert.ok(share >= last[index] - 1e-12, `${count} lines: line ${index} went backwards at ${step / 400}`);
        if (index > 0) assert.ok(share <= now[index - 1] + 1e-12, `${count} lines: line ${index} is ahead of line ${index - 1} at ${step / 400}`);
      });
      last = now;
    }
  }
});

test('however many lines an ornament has, each gets at least two fifths of the film to itself', () => {
  for (const count of [1, 2, 5, 9, 18, 40]) {
    // The last line's start: the latest moment at which it is still undrawn.
    let start = 0;
    for (let step = 0; step <= 1000; step += 1) if (sharesAt(step / 1000, count)[count - 1] === 0) start = step / 1000;
    assert.ok(start <= 0.6 + 1e-9, `${count} lines: the last line starts at ${start}`);
    if (count === 1) assert.equal(start, 0, 'a single line has the whole film');
  }
  near(sharesAt(0.5, 1)[0], 0.5, 'a single line at half time');
});

test('an ornament arrives once it has come well into the window, and stays until it has wholly left it', () => {
  assert.equal(ARRIVE, 0.88);
  const viewport = 1000;
  const at = (top, was) => present({ top, bottom: top + 40 }, viewport, { was });

  // Coming up from below: not yet at the foot of the window, there once its top is above 88% of the way down.
  assert.equal(at(1200, false), false, 'below the window');
  assert.equal(at(960, false), false, 'just peeping in at the foot of the window');
  assert.equal(at(879, false), true, 'well in');
  assert.equal(at(300, false), true, 'in the middle of the window');

  // Once there it stays while any of it shows, so a small scroll back does not wipe it.
  assert.equal(at(960, true), true, 'slipping back towards the foot of the window, still showing');
  assert.equal(at(999, true), true, 'its top edge only just showing');
  assert.equal(at(1000, true), false, 'gone below the window');
  assert.equal(at(-39, true), true, 'its last pixel still showing at the top');
  assert.equal(at(-40, true), false, 'gone above the window');
  assert.equal(at(-200, false), false, 'above the window');
});

test('an ornament on a sheet that another sheet has covered is not there, wherever it lies', () => {
  const box = { top: 300, bottom: 340 };
  assert.equal(present(box, 1000, { covered: true, was: true }), false);
  assert.equal(present(box, 1000, { covered: true, was: false }), false);
  assert.equal(present(box, 1000, { covered: false, was: false }), true);
  assert.equal(present(box, 1000), true, 'not covered and not there before, unless told otherwise');
});

test('the film runs while its ornament is there, and starts again from nothing when it has been away', () => {
  assert.equal(advance(0, true, 500, 2000), 0.25);
  assert.equal(advance(0.25, true, 500, 2000), 0.5);
  assert.equal(advance(0.9, true, 500, 2000), 1, 'it stops at its end');
  assert.equal(advance(1, true, 16, 2000), 1);
  assert.equal(advance(0.6, false, 16, 2000), 0, 'away: wiped, to be drawn again on the way back');
  assert.equal(advance(1, false, 16, 2000), 0);
  assert.equal(advance(0, true, 0, 2000), 0, 'no time has passed');
});

test('what is not a number, or makes no sense, is refused', () => {
  assert.throws(() => sharesAt(Number.NaN, 5), RangeError);
  assert.throws(() => sharesAt(0.5, 0), RangeError);
  assert.throws(() => sharesAt(0.5, 2.5), RangeError);
  assert.throws(() => present({ top: Number.NaN, bottom: 10 }, 1000), RangeError);
  assert.throws(() => present({ top: 10, bottom: 5 }, 1000), RangeError, 'a box upside down');
  assert.throws(() => present({ top: 0, bottom: 10 }, 0), RangeError);
  assert.throws(() => advance(Number.NaN, true, 16, 2000), RangeError);
  assert.throws(() => advance(0, true, -1, 2000), RangeError);
  assert.throws(() => advance(0, true, 16, 0), RangeError);
});
