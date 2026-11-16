// Where the names of the Hub's stages stand round its brain, and the wire from a held release to
// the page's button (js/callouts.js).
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NAMES, SEAT, layNames, port, underCard, wire, wireAt } from '../js/callouts.js';
import { MIDDLE, REGIONS, project } from '../js/cortex.js';

// A brain 600 across and 400 down, in the middle of a room with plenty of space round it.
const plate = { x: 500, y: 400, across: 300, down: 200, tall: 20, room: { left: 0, top: 0, right: 1000, bottom: 800 } };
const box = (name, wide) => ({ left: name.x, top: name.y, right: name.x + wide, bottom: name.y + plate.tall });
const touching = (a, b, gap = 0) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
/** How far out from the middle of the brain a point is: 1 on its edge. */
const out = (x, y, on = plate) => Math.hypot((x - on.x) / on.across, (y - on.y) / on.down);

test('a name stands beside the brain, level with its region, on the side its region is on', () => {
  const sides = [
    { region: { x: 350, y: 400 }, side: -1 },
    { region: { x: 650, y: 400 }, side: 1 },
    { region: { x: 480, y: 300 }, side: -1 },
    { region: { x: 560, y: 520 }, side: 1 },
  ];
  for (const { region, side } of sides) {
    const [name] = layNames([{ ...region, depth: 0, wide: 60 }], plate);
    assert.deepEqual([name.shown, name.seat, name.side], [true, SEAT.home, side]);
    assert.ok(Math.abs(name.y + plate.tall / 2 - region.y) < 1e-9, `the name of a region at ${region.x}, ${region.y} is not level with it`);
    if (side < 0) assert.ok(name.x + 60 < region.x, 'the name is not to the left of its region');
    else assert.ok(name.x > region.x, 'the name is not to the right of its region');
    // Its leader ends on the end of the name that faces the region.
    assert.deepEqual([name.tipX, name.tipY], [side < 0 ? name.x + 60 : name.x, region.y]);
  }
  // At the brain's widest the name stands `pad` off its edge, and nearer its top it tucks in with the edge.
  const [wide] = layNames([{ x: 650, y: 400, depth: 0, wide: 60 }], plate);
  assert.ok(Math.abs(wide.x - (plate.x + plate.across + NAMES.pad)) < 1e-9);
  const [high] = layNames([{ x: 650, y: 260, depth: 0, wide: 60 }], plate);
  assert.ok(high.x < wide.x - 40, 'a name near the top stands as far out as one at the middle');
  // Every corner of the name is clear of the brain, wherever the region is.
  for (let turn = 0; turn < Math.PI * 2; turn += 0.05) {
    for (const reach of [0.2, 0.6, 0.95]) {
      const region = { x: plate.x + Math.cos(turn) * plate.across * reach, y: plate.y + Math.sin(turn) * plate.down * reach, depth: 0, wide: 60 };
      const [name] = layNames([region], plate);
      const corners = [[name.x, name.y], [name.x + 60, name.y], [name.x, name.y + plate.tall], [name.x + 60, name.y + plate.tall]];
      for (const [x, y] of corners) assert.ok(out(x, y) > 1, `a region ${reach} of the way out, turned ${turn.toFixed(2)}: a corner of its name is over the brain`);
    }
  }
});

test('a region on the crown, under the foot or out beyond the edge of the brain still gets a name clear of it', () => {
  // On the crown and under the foot the edge falls away fast: the name stops short of the very top and bottom.
  for (const y of [plate.y - plate.down, plate.y + plate.down]) {
    const [name] = layNames([{ x: plate.x + 10, y, depth: 0, wide: 60 }], plate);
    assert.ok(name.shown && Math.abs(name.y + plate.tall / 2 - plate.y) <= plate.down * NAMES.crown + 1e-9, 'the name is level with the very top or foot');
    assert.ok(out(name.x, name.y) > 1 && out(name.x, name.y + plate.tall) > 1, 'the name is over the brain');
  }
  // A region that pokes out past the edge: its name goes beyond it, never back over it.
  const region = { x: plate.x + 340, y: plate.y, depth: 0, wide: 60 };
  const [name] = layNames([region], plate);
  assert.ok(Math.abs(name.x - (region.x + NAMES.pad)) < 1e-9, `the name starts at ${name.x}, its region is at ${region.x}`);
});

test('a name changes sides only once its region is well past the middle of the brain', () => {
  const at = (x, was) => layNames([{ x, y: 400, depth: 0, wide: 60, was }], plate)[0].side;
  const band = plate.across * NAMES.across;
  // With no side yet, it takes the side its region is on.
  assert.equal(at(plate.x - 1), -1);
  assert.equal(at(plate.x + 1), 1);
  // On the left already, it stays there until its region is the whole band to the right, and the same the other way.
  assert.equal(at(plate.x + band - 1, { shown: true, seat: SEAT.home, side: -1 }), -1);
  assert.equal(at(plate.x + band + 1, { shown: true, seat: SEAT.home, side: -1 }), 1);
  assert.equal(at(plate.x - band + 1, { shown: true, seat: SEAT.home, side: 1 }), 1);
  assert.equal(at(plate.x - band - 1, { shown: true, seat: SEAT.home, side: 1 }), -1);
});

test('two regions the same way out: the nearer keeps its own place, and the further is moved aside by the least it can be', () => {
  const near = { x: 640, y: 392, depth: -0.5, wide: 60 };
  const far = { x: 660, y: 398, depth: 0.5, wide: 60 };
  const [own] = layNames([far], plate); // where the further one would stand with nothing in its way
  for (const regions of [[near, far], [far, near]]) {
    const names = layNames(regions, plate);
    const [nearName, farName] = regions[0] === near ? names : [names[1], names[0]];
    assert.deepEqual([nearName.shown, nearName.seat, farName.shown], [true, SEAT.home, true]);
    assert.ok(!touching(box(nearName, 60), box(farName, 60), NAMES.gap), 'the two names touch');
    assert.ok(touching(box(nearName, 60), box(farName, 60), NAMES.gap + 0.01), 'the further name was moved more than it had to be');
    // Straight down from its own place is the least move here: up is further, across is further still,
    // and back towards the middle would put it over the brain.
    assert.equal(farName.seat, SEAT.below);
    assert.equal(farName.x, own.x);
    assert.ok(farName.y > own.y && farName.y - own.y < plate.tall + NAMES.gap);
    assert.deepEqual([farName.tipX, farName.tipY], [farName.x, farName.y], 'its leader ends on the corner of the name nearest its region');
  }
});

test('a name is never moved in over the brain to get out of another\'s way', () => {
  // Two regions high on the right, level with each other. Under the first name would be the least move for the
  // second, but there the brain is wider: it would lie over the edge.
  const near = { x: 500, y: 300, depth: -0.5, wide: 60 };
  const far = { x: 520, y: 300, depth: 0.5, wide: 60 };
  const [nearName, farName] = layNames([near, far], plate);
  assert.deepEqual([nearName.seat, farName.shown, farName.seat], [SEAT.home, true, SEAT.above]);
  const corners = [[farName.x, farName.y], [farName.x + 60, farName.y], [farName.x, farName.y + plate.tall], [farName.x + 60, farName.y + plate.tall]];
  for (const [x, y] of corners) assert.ok(out(x, y) > 1, 'a corner of the moved name is over the brain');
  // The move it did not take: straight down, by less.
  const under = { left: farName.x, top: nearName.y + plate.tall + NAMES.gap, right: farName.x + 60, bottom: nearName.y + 2 * plate.tall + NAMES.gap };
  assert.ok(under.top - nearName.y < nearName.y - farName.y + 1e-3, 'down was not the lesser move: this test proves nothing');
  assert.ok(out(under.left, under.bottom) < 1, 'under the first name is clear of the brain: this test proves nothing');
});

test('a name with nowhere to stand is not shown', () => {
  const near = { x: 640, y: 392, depth: -0.5, wide: 60 };
  const far = { x: 660, y: 398, depth: 0.5, wide: 60 };
  const [alone] = layNames([near], plate);
  // A room with space for one name and no more.
  const tight = { ...plate, room: { left: alone.x - 2, top: alone.y - 2, right: alone.x + 62, bottom: alone.y + plate.tall + 2 } };
  const names = layNames([near, far], tight);
  assert.deepEqual(names.map((name) => name.shown), [true, false]);
  assert.equal(names[0].seat, SEAT.home);
});

test('a name is kept whole inside the room it has, and still clear of the others', () => {
  const tight = { ...plate, room: { left: 180, top: 190, right: 820, bottom: 610 } };
  for (let turn = 0; turn < Math.PI * 2; turn += 0.05) {
    const regions = [0, 1, 2, 3].map((each) => ({
      x: tight.x + Math.cos(turn + each * 1.7) * 150,
      y: tight.y + Math.sin(turn + each * 1.7) * 100,
      depth: Math.sin(turn * 2 + each),
      wide: 60,
    }));
    const names = layNames(regions, tight);
    names.forEach((name, i) => {
      if (!name.shown) return;
      const mine = box(name, 60);
      assert.ok(mine.left >= tight.room.left && mine.right <= tight.room.right && mine.top >= tight.room.top && mine.bottom <= tight.room.bottom, `turned ${turn.toFixed(2)}, name ${i} leaves the room`);
      names.forEach((other, j) => {
        if (j > i && other.shown) assert.ok(!touching(mine, box(other, 60), NAMES.gap - 1e-9), `turned ${turn.toFixed(2)}, names ${i} and ${j} touch`);
      });
    });
  }
});

test('a name keeps its own place until it truly touches another, and once moved goes back only with room to spare', () => {
  // The nearer region's name is at the right of the brain. The further one starts well above it and comes down towards it.
  const near = { x: 650, y: 400, depth: -0.5, wide: 60 };
  const [fixed] = layNames([near], plate);
  const further = (y, was) => ({ x: 650, y, depth: 0.5, wide: 60, was });
  // The heights at which the further name, in its own place, first comes within the spare room, and then touches.
  let spareAt = null;
  let touchAt = null;
  for (let y = 300; y <= 400 && touchAt === null; y += 0.25) {
    const [alone] = layNames([further(y)], plate);
    if (spareAt === null && touching(box(fixed, 60), box(alone, 60), NAMES.gap + NAMES.spare)) spareAt = y;
    if (touching(box(fixed, 60), box(alone, 60), NAMES.gap)) touchAt = y;
  }
  assert.ok(spareAt !== null && touchAt !== null && touchAt > spareAt + 2, `within the spare room from ${spareAt}, touching from ${touchAt}`);
  const between = (spareAt + touchAt) / 2;
  const seatOf = (y, was) => {
    const [first, second] = layNames([near, further(y, was)], plate);
    assert.deepEqual([first.shown, first.seat, second.shown], [true, SEAT.home, true]);
    return second.seat;
  };

  // In its own place already, it stays there through the spare room, right up until it would touch.
  assert.equal(seatOf(between, { shown: true, seat: SEAT.home, side: 1 }), SEAT.home);
  assert.equal(seatOf(touchAt + 1, { shown: true, seat: SEAT.home, side: 1 }), SEAT.above);
  // Moved aside, it stays on that side, and does not come back until there is room to spare.
  assert.equal(seatOf(between, { shown: true, seat: SEAT.above, side: 1 }), SEAT.above);
  assert.equal(seatOf(touchAt + 1, { shown: true, seat: SEAT.above, side: 1 }), SEAT.above);
  assert.equal(seatOf(spareAt - 2, { shown: true, seat: SEAT.above, side: 1 }), SEAT.home);
  // Not shown before, it comes out in its own place only with room to spare.
  assert.equal(seatOf(between), SEAT.above);
  assert.equal(seatOf(spareAt - 2), SEAT.home);
  // It keeps the side it was moved to even when the other side has become the lesser move.
  const low = 400 + (400 - touchAt) - 1; // as far below the fixed name as `touchAt + 1` is above it
  assert.equal(seatOf(low, { shown: true, seat: SEAT.home, side: 1 }), SEAT.below, 'coming from below, it is moved below');
  assert.equal(seatOf(low, { shown: true, seat: SEAT.above, side: 1 }), SEAT.above, 'moved above, it stays above');
  // Having just changed sides it has no seat to keep, and takes the least move like any newcomer.
  assert.equal(seatOf(low, { shown: true, seat: SEAT.above, side: -1 }), SEAT.below, 'a name that has just changed sides kept the seat it had on the other side');
});

test('round a whole turn of the real brain no two names ever touch, each is shown nearly all the time, and none jumps about', () => {
  const widths = [46, 38, 40, 48]; // Queue, Build, Audit, Merge at the size the page sets them
  const tallies = widths.map(() => ({ shown: 0, moved: 0 }));
  let frames = 0;
  for (const [pitch, scale, room] of [
    [0.24, 300, { left: 60, top: 40, right: 940, bottom: 760 }], // a desktop stage
    [0.24, 150, { left: 310, top: 240, right: 690, bottom: 560 }], // a phone's: no room beside the brain
  ]) {
    const view = { yaw: 0, pitch, scale, x: 500, y: 400 };
    const brain = { x: 0, y: 0, across: scale * 0.98, down: scale * 0.7, tall: 20, room };
    let was = widths.map(() => undefined);
    let last = null;
    const P = [0, 0, 0, 0];
    for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.004) {
      view.yaw = yaw;
      project(...MIDDLE, view, P);
      brain.x = P[0];
      brain.y = P[1];
      const regions = REGIONS.map((region, i) => {
        project(...region.centre, view, P);
        return { x: P[0], y: P[1], depth: P[3], wide: widths[i], was: was[i] };
      });
      const names = layNames(regions, brain);
      frames += 1;
      names.forEach((name, i) => {
        if (!name.shown) return;
        tallies[i].shown += 1;
        if (name.seat !== SEAT.home) tallies[i].moved += 1;
        const mine = { left: name.x, top: name.y, right: name.x + widths[i], bottom: name.y + 20 };
        assert.ok(mine.left >= room.left - 1e-9 && mine.right <= room.right + 1e-9 && mine.top >= room.top - 1e-9 && mine.bottom <= room.bottom + 1e-9, `yaw ${yaw.toFixed(3)}: ${REGIONS[i].stage} leaves its room`);
        names.forEach((other, j) => {
          if (j <= i || !other.shown) return;
          const theirs = { left: other.x, top: other.y, right: other.x + widths[j], bottom: other.y + 20 };
          assert.ok(!touching(mine, theirs, NAMES.gap - 1e-9), `yaw ${yaw.toFixed(3)}: ${REGIONS[i].stage} and ${REGIONS[j].stage} touch`);
        });
        // From one frame to the next a name in the same seat moves a little: it never leaps across the brain.
        const before = last?.[i];
        if (before?.shown && before.seat === name.seat && before.side === name.side) {
          assert.ok(Math.hypot(name.x - before.x, name.y - before.y) < scale * 0.05, `yaw ${yaw.toFixed(3)}: ${REGIONS[i].stage} leaps ${Math.hypot(name.x - before.x, name.y - before.y).toFixed(1)}`);
        }
      });
      last = names;
      was = names.map((name) => ({ shown: name.shown, seat: name.seat, side: name.side }));
    }
  }
  tallies.forEach((tally, i) => {
    assert.ok(tally.shown / frames > 0.97, `${REGIONS[i].stage} is shown only ${((tally.shown / frames) * 100).toFixed(1)}% of the time`);
  });
});

test('the wire runs from the gate to the button, and arrives square on to its edge', () => {
  const gate = { x: 900, y: 420 };
  for (const end of [
    { x: 270, y: 700, nx: 1, ny: 0 }, // the button's right edge: the brain is beside it
    { x: 200, y: 560, nx: 0, ny: -1 }, // its top edge: the brain is above it
  ]) {
    const line = wire(gate, end);
    assert.equal(line.length, 4);
    assert.deepEqual(wireAt(line, 0), [gate.x, gate.y]);
    assert.deepEqual(wireAt(line, 1), [end.x, end.y]);
    // The last stretch comes in along the way out of the button, from outside it.
    const [x, y] = wireAt(line, 0.98);
    const along = (x - end.x) * end.nx + (y - end.y) * end.ny;
    const across = Math.abs((x - end.x) * end.ny - (y - end.y) * end.nx);
    assert.ok(along > 0 && across < along * 0.12, `the wire comes in at a slant: ${along.toFixed(1)} out, ${across.toFixed(1)} across`);
    // It never dips behind the edge it arrives at, and never wanders further off than its two ends are apart.
    const length = Math.hypot(gate.x - end.x, gate.y - end.y);
    let last = wireAt(line, 0);
    for (let t = 0.01; t < 1; t += 0.01) {
      const now = wireAt(line, t);
      assert.ok((now[0] - end.x) * end.nx + (now[1] - end.y) * end.ny > 0, `at ${t.toFixed(2)} the wire is behind the button's edge`);
      assert.ok(Math.hypot(now[0] - gate.x, now[1] - gate.y) < length * 1.05, `at ${t.toFixed(2)} the wire wanders off`);
      assert.ok(Math.hypot(now[0] - last[0], now[1] - last[1]) < length * 0.03, 'the wire has a kink in it');
      last = now;
    }
  }
});

test('the wire arrives at the side of the button when the brain is beside it, and at its top when the brain is above', () => {
  const button = { left: 40, top: 700, right: 260, bottom: 750 };
  assert.deepEqual(port(button, { x: 900, y: 450 }), { x: 260, y: 725, nx: 1, ny: 0 });
  assert.deepEqual(port(button, { x: -300, y: 650 }), { x: 40, y: 725, nx: -1, ny: 0 });
  // Above it: the wire comes down onto the top edge, as near under the brain as the button's round ends allow.
  assert.deepEqual(port(button, { x: 150, y: 300 }), { x: 150, y: 700, nx: 0, ny: -1 });
  assert.deepEqual(port(button, { x: 255, y: 300 }), { x: 235, y: 700, nx: 0, ny: -1 });
  assert.deepEqual(port(button, { x: 380, y: 300 }), { x: 235, y: 700, nx: 0, ny: -1 });
  assert.deepEqual(port(button, { x: 150, y: 900 }), { x: 150, y: 750, nx: 0, ny: 1 });
});

test('a name under an open card, or right against it, goes out; one that stands clear of it stays', () => {
  const card = { left: 400, top: 100, right: 664, bottom: 243 };
  const name = (left, top) => ({ left, top, right: left + 52, bottom: top + 20 });
  assert.equal(underCard(name(500, 150), card), true, 'a name in the middle of the card is still shown');
  assert.equal(underCard(name(650, 200), card), true, 'a name cut by the card\'s right edge is still shown');
  assert.equal(underCard(name(664 + NAMES.pad - 1, 200), card), true, 'a name right against the card is still shown');
  assert.equal(underCard(name(380, 90), card), true, 'a name over the card\'s corner is still shown');
  assert.equal(underCard(name(664 + NAMES.pad + 1, 200), card), false, 'a name clear of the card to its right went out');
  assert.equal(underCard(name(500, 243 + NAMES.pad + 1), card), false, 'a name clear of the card below it went out');
  assert.equal(underCard(name(500, 100 - NAMES.pad - 21), card), false, 'a name clear of the card above it went out');
  assert.equal(underCard(name(400 - NAMES.pad - 53, 150), card), false, 'a name clear of the card to its left went out');
});
