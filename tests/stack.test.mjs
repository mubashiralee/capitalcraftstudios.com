// Checks on the stack of sheets: where each sheet lies at a scroll position,
// and how far the next one has covered it.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layStack, nextStop, recede, showOf, stackAt, startOf, travelled } from '../js/stack.js';

function testDice(seed = 1) {
  let state = seed >>> 0;
  return (sides) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * sides);
  };
}

/** A made-up page: a first sheet of any height, then sheets at least a window and a lip tall. */
function anyStack(dice) {
  const viewport = 400 + dice(800);
  const lip = dice(48);
  const count = 2 + dice(8);
  const heights = [viewport + dice(300)];
  for (let i = 1; i < count; i += 1) heights.push(viewport + lip + (dice(3) === 0 ? 0 : dice(1600)));
  return { heights, viewport, lip, start: dice(3) === 0 ? dice(200) : 0 };
}

test('a worked example: three sheets in a window 900 tall, with a lip of 32', () => {
  const lay = layStack({ heights: [900, 1000, 932], viewport: 900, lip: 32 });
  assert.deepEqual(lay.natural, [0, 900, 1900]);
  // The first sheet docks flush. A sheet taller than the window docks with its foot on the
  // window's foot; a sheet that just fits docks with only its lip above the window.
  assert.deepEqual(lay.dock, [0, -100, -32]);

  const at = (scroll) => stackAt(lay, scroll);
  assert.deepEqual(at(0), { tops: [0, 900, 1900], covers: [0, 0, 0], front: 0 });
  assert.deepEqual(at(450), { tops: [0, 450, 1450], covers: [0.5, 0, 0], front: 1 });
  assert.deepEqual(at(900), { tops: [0, 0, 1000], covers: [1, 0, 0], front: 1 });
  // The second sheet is 100 taller than the window: it scrolls that far, then holds.
  assert.deepEqual(at(1000), { tops: [0, -100, 900], covers: [1, 0, 0], front: 1 });
  assert.deepEqual(at(1450), { tops: [0, -100, 450], covers: [1, 0.5, 0], front: 2 });
  assert.deepEqual(at(1932), { tops: [0, -100, -32], covers: [1, 1, 0], front: 2 });
  assert.deepEqual(at(5000), { tops: [0, -100, -32], covers: [1, 1, 0], front: 2 });

  assert.equal(startOf(lay, 0), 0);
  assert.equal(startOf(lay, 1), 932);
  assert.equal(startOf(lay, 2), 1932);
});

test('a sheet shorter than the window still docks with its lip out of sight', () => {
  const lay = layStack({ heights: [900, 600, 932], viewport: 900, lip: 32 });
  assert.deepEqual(lay.dock, [0, -32, -32]);
  assert.deepEqual(stackAt(lay, 2000).tops, [0, -32, -32]);
});

test('a page that begins below the top of the document is measured from where it begins', () => {
  const lay = layStack({ heights: [900, 932], viewport: 900, lip: 32, start: 120 });
  assert.deepEqual(lay.natural, [120, 1020]);
  assert.deepEqual(stackAt(lay, 0).tops, [120, 1020]);
  assert.equal(startOf(lay, 1), 1052);
});

test('scrolling down only ever covers more: nothing uncovers, and the sheet in front never goes back', () => {
  const dice = testDice(7);
  for (let round = 0; round < 60; round += 1) {
    const page = anyStack(dice);
    const lay = layStack(page);
    const end = lay.natural.at(-1) + page.heights.at(-1);
    let before = stackAt(lay, -50);
    for (let scroll = -40; scroll <= end + 200; scroll += 7) {
      const now = stackAt(lay, scroll);
      now.covers.forEach((cover, index) => {
        assert.ok(cover >= 0 && cover <= 1, `cover ${cover}`);
        assert.ok(cover >= before.covers[index], `sheet ${index} uncovered between ${scroll - 7} and ${scroll}`);
        assert.ok(now.tops[index] >= lay.dock[index], `sheet ${index} sits above where it docks`);
        assert.ok(now.tops[index] <= before.tops[index], `sheet ${index} moved back down`);
      });
      assert.equal(now.covers.at(-1), 0, 'nothing comes after the last sheet to cover it');
      assert.ok(now.front >= before.front, 'the sheet in front went back');
      before = now;
    }
    assert.equal(before.front, page.heights.length - 1, 'the last sheet ends in front');
  }
});

test('going to a sheet lands with it docked: everything before it covered, nothing of it covered', () => {
  const dice = testDice(21);
  for (let round = 0; round < 60; round += 1) {
    const page = anyStack(dice);
    const lay = layStack(page);
    page.heights.forEach((height, index) => {
      const { tops, covers, front } = stackAt(lay, startOf(lay, index));
      // The first sheet opens at the top of the document; every other opens with its lip above the window.
      assert.equal(tops[index], index === 0 ? page.start : 0 - page.lip, `sheet ${index} is not at the top`);
      for (let earlier = 0; earlier < index; earlier += 1) assert.equal(covers[earlier], 1, `sheet ${earlier} still shows behind sheet ${index}`);
      assert.equal(covers[index], 0, `sheet ${index} arrives already covered`);
      assert.equal(front, index);
    });
  }
});

test('showing a point in a sheet puts it in the window with nothing over it', () => {
  const dice = testDice(33);
  for (let round = 0; round < 60; round += 1) {
    const page = anyStack(dice);
    const lay = layStack(page);
    page.heights.forEach((height, index) => {
      // Nothing in a sheet lies in its lip: that strip is above the window whenever the sheet is docked.
      const first = index === 0 ? 0 : page.lip;
      for (const offset of [first, first + 60, height / 2, height - 80, height - 1]) {
        for (const lead of [0, 96, page.viewport / 3]) {
          const scroll = showOf(lay, index, offset, lead);
          const { tops, covers } = stackAt(lay, scroll);
          const where = tops[index] + offset; // down the window
          assert.equal(covers[index], 0, `sheet ${index} is covered at the scroll that should show it`);
          assert.ok(where >= -1e-9 && where <= page.viewport + 1e-9, `the point ${offset} down sheet ${index} lands at ${where} in a window of ${page.viewport}`);
          for (let earlier = 0; earlier < index; earlier += 1) assert.equal(covers[earlier], 1);
          // It sits at the lead asked for whenever the sheet can scroll that far.
          const free = scroll > startOf(lay, index) && scroll < lay.natural[index] + height - page.viewport;
          if (free) assert.ok(Math.abs(where - lead) < 1e-9, `the point should sit ${lead} down the window, not ${where}`);
        }
      }
    });
  }
});

test('the next arrow goes to the sheet after the one on show, then the foot of the page, then back to the top', () => {
  const lay = layStack({ heights: [900, 1000, 932], viewport: 900, lip: 32 });
  const end = 2400; // the page runs on below the last sheet (the footer)
  assert.equal(nextStop(lay, 0, end), 932);
  assert.equal(nextStop(lay, 500, end), 932); // part-way: the sheet coming in
  assert.equal(nextStop(lay, 932, end), 1932);
  assert.equal(nextStop(lay, 1000, end), 1932); // part-way down a tall sheet: the next sheet, not the rest of this one
  assert.equal(nextStop(lay, 1932, end), 2400);
  assert.equal(nextStop(lay, 2400, end), 0);
  assert.equal(nextStop(lay, 2399.5, end), 0, 'half a pixel short of the foot is the foot');
  assert.equal(nextStop(lay, 931.5, end), 1932, 'half a pixel short of a sheet is that sheet');
  // With nothing below the last sheet, the last sheet is the end.
  assert.equal(nextStop(lay, 1932, 1932), 0);
  assert.throws(() => nextStop(lay, Number.NaN, end), RangeError);
  assert.throws(() => nextStop(lay, 0, Number.NaN), RangeError);
});

test('pressing the next arrow over and over visits every sheet in order, once, then returns to the top', () => {
  const dice = testDice(45);
  for (let round = 0; round < 60; round += 1) {
    const page = anyStack(dice);
    const lay = layStack(page);
    const foot = dice(3) === 0 ? 0 : 40 + dice(900);
    const end = lay.natural.at(-1) + page.heights.at(-1) - page.viewport + foot;
    let scroll = 0;
    for (let index = 1; index < page.heights.length; index += 1) {
      scroll = nextStop(lay, scroll, end);
      assert.equal(scroll, startOf(lay, index), `press ${index} should open sheet ${index}`);
      assert.equal(stackAt(lay, scroll).front, index);
    }
    if (end > scroll + 1) {
      scroll = nextStop(lay, scroll, end);
      assert.equal(scroll, end, 'after the last sheet comes the foot of the page');
    }
    assert.equal(nextStop(lay, scroll, end), 0, 'from the end the arrow goes back to the top');
  }
});

test('a worked example: how much of each sheet\'s stretch of the page has been read', () => {
  const lay = layStack({ heights: [900, 1000, 932], viewport: 900, lip: 32 });
  const end = 2400;
  // The stretches run 0 to 932, 932 to 1932, and 1932 to the end of the page at 2400.
  assert.deepEqual(travelled(lay, 0, end), [0, 0, 0]);
  assert.deepEqual(travelled(lay, 466, end), [0.5, 0, 0]);
  assert.deepEqual(travelled(lay, 932, end), [1, 0, 0]);
  assert.deepEqual(travelled(lay, 1182, end), [1, 0.25, 0]);
  assert.deepEqual(travelled(lay, 2166, end), [1, 1, 0.5]);
  assert.deepEqual(travelled(lay, 2400, end), [1, 1, 1]);
  // Past either end of the page (a rubber-band scroll) it reads nothing, or all of it.
  assert.deepEqual(travelled(lay, -80, end), [0, 0, 0]);
  assert.deepEqual(travelled(lay, 2460, end), [1, 1, 1]);
  // With nothing below the last sheet its stretch has no length: it is read once it opens.
  assert.deepEqual(travelled(lay, 1931, 1932), [1, 0.999, 0]);
  assert.deepEqual(travelled(lay, 1932, 1932), [1, 1, 1]);
  assert.throws(() => travelled(lay, Number.NaN, end), RangeError);
  assert.throws(() => travelled(lay, 0, Number.NaN), RangeError);
});

test('reading fills the stretches in order: each is full before the next begins, and scrolling down never empties one', () => {
  const dice = testDice(57);
  for (let round = 0; round < 60; round += 1) {
    const page = anyStack(dice);
    const lay = layStack(page);
    const foot = dice(3) === 0 ? 0 : 40 + dice(900);
    const end = lay.natural.at(-1) + page.heights.at(-1) - page.viewport + foot;
    let before = travelled(lay, -10, end);
    assert.ok(before.every((part) => part === 0), 'something is read before the page is scrolled');
    for (let scroll = 0; scroll <= end + 30; scroll += 13) {
      const now = travelled(lay, scroll, end);
      assert.equal(now.length, page.heights.length);
      now.forEach((part, index) => {
        assert.ok(part >= 0 && part <= 1, `part ${part}`);
        assert.ok(part >= before[index], `stretch ${index} emptied between ${scroll - 13} and ${scroll}`);
        if (index > 0 && part > 0) assert.equal(now[index - 1], 1, `stretch ${index} began before stretch ${index - 1} was full`);
      });
      // The stretch being read runs from the opening of its sheet to the opening of the next.
      const reading = now.findIndex((part) => part < 1);
      if (reading > 0) assert.ok(scroll >= startOf(lay, reading), `stretch ${reading} is being read at ${scroll}, before its sheet opens`);
      if (reading >= 0 && reading + 1 < page.heights.length) assert.ok(scroll < startOf(lay, reading + 1), `stretch ${reading} is still unread at ${scroll}, after the next sheet opened`);
      before = now;
    }
    assert.ok(travelled(lay, end, end).every((part) => part === 1), 'at the end of the page everything is read');
    // The arrow and the ring agree: the stop the arrow goes to next is where the stretch being read ends.
    for (let index = 0; index < page.heights.length - 1; index += 1) {
      const opens = startOf(lay, index + 1);
      assert.equal(travelled(lay, opens, end)[index], 1);
      // (A last sheet with nothing below it is read the moment it opens.)
      const after = index + 2 < page.heights.length ? startOf(lay, index + 2) : end;
      assert.equal(travelled(lay, opens, end)[index + 1], after > opens ? 0 : 1);
      assert.equal(nextStop(lay, opens - 2, end), opens);
    }
  }
});

test('a covered sheet shrinks back and darkens, steadily, and never past its limits', () => {
  assert.deepEqual(recede(0), { scale: 1, shade: 0 });
  let before = recede(0);
  for (let cover = 0.01; cover <= 1.0001; cover += 0.01) {
    const now = recede(cover);
    assert.ok(now.scale < before.scale && now.shade > before.shade, `at ${cover}`);
    before = now;
  }
  assert.ok(before.scale > 0.9 && before.scale < 0.97, `a covered sheet ends at ${before.scale} of its size`);
  assert.ok(before.shade > 0.5 && before.shade < 0.8, `a covered sheet ends ${before.shade} dark`);
  assert.deepEqual(recede(7), recede(1));
  assert.deepEqual(recede(-3), recede(0));
  assert.throws(() => recede(Number.NaN), RangeError);
});

test('a stack needs sheets, a window and real numbers', () => {
  assert.throws(() => layStack({ heights: [], viewport: 900, lip: 32 }), RangeError);
  assert.throws(() => layStack({ heights: [900], viewport: 0, lip: 32 }), RangeError);
  assert.throws(() => layStack({ heights: [900, Number.NaN], viewport: 900, lip: 32 }), RangeError);
  assert.throws(() => layStack({ heights: [900], viewport: 900, lip: -1 }), RangeError);
  const lay = layStack({ heights: [900, 932], viewport: 900, lip: 32 });
  assert.throws(() => startOf(lay, 2), RangeError);
  assert.throws(() => showOf(lay, -1, 0), RangeError);
});
