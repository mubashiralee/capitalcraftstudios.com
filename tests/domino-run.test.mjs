// Checks on the Domino Reactor run: where the dominoes stand and when they fall.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CORE,
  DOMINO,
  FLAT,
  LANE,
  NEVER,
  REST,
  SHORTEST_RUN,
  SPACING,
  TIPPED,
  countFor,
  createSchedule,
  layRun,
  wavePace,
} from '../js/domino-run.js';

const placeOf = (places, index) => ({
  x: places[index * 4],
  y: places[index * 4 + 1],
  cos: places[index * 4 + 2],
  sin: places[index * 4 + 3],
});

test('a run has exactly the dominoes asked for, evenly spaced along it', () => {
  for (const count of [SHORTEST_RUN, 37, 1500, 10000]) {
    const run = layRun({ count });
    assert.equal(run.count, count);
    assert.equal(run.places.length, count * 4);
    let widest = 0;
    let narrowest = Infinity;
    for (let index = 1; index < count; index += 1) {
      const a = placeOf(run.places, index - 1);
      const b = placeOf(run.places, index);
      const gap = Math.hypot(b.x - a.x, b.y - a.y);
      widest = Math.max(widest, gap);
      narrowest = Math.min(narrowest, gap);
    }
    // Straight-line gaps are a little shorter than the gap along a curve.
    assert.ok(widest <= SPACING * 1.02, `count ${count}: widest gap ${widest}`);
    assert.ok(narrowest >= SPACING * 0.9, `count ${count}: narrowest gap ${narrowest}`);
  }
});

test('every domino stands inside the run radius and faces along the run', () => {
  const run = layRun({ count: 1500, phase: 0.7 });
  for (let index = 0; index < run.count; index += 1) {
    const here = placeOf(run.places, index);
    assert.ok(Math.hypot(here.x, here.y) <= run.radius + 1e-3, `domino ${index} is outside the radius`);
    assert.ok(Math.abs(Math.hypot(here.cos, here.sin) - 1) < 1e-4, `domino ${index} has no clear direction`);
    if (index + 1 < run.count) {
      const next = placeOf(run.places, index + 1);
      const ahead = (next.x - here.x) * here.cos + (next.y - here.y) * here.sin;
      assert.ok(ahead > SPACING * 0.8, `domino ${index} does not face the next one`);
    }
  }
});

test('the run starts and ends on the rim, on opposite sides', () => {
  const run = layRun({ count: 1500, phase: 0.3 });
  const first = placeOf(run.places, 0);
  const last = placeOf(run.places, run.count - 1);
  assert.ok(Math.abs(Math.hypot(first.x, first.y) - run.radius) < 0.02);
  assert.ok(Math.abs(Math.hypot(last.x, last.y) - run.radius) < 0.02);
  assert.ok(Math.hypot(first.x + last.x, first.y + last.y) < 0.05, 'the two ends are not opposite each other');
});

test('arms of the spiral never crowd each other', () => {
  const run = layRun({ count: 1500 });
  const clear = DOMINO.width + 0.1; // a domino's width, and a little air
  for (let a = 0; a < run.count; a += 1) {
    const here = placeOf(run.places, a);
    // Neighbours along the run are meant to be close; look further along.
    for (let b = a + 12; b < run.count; b += 1) {
      const there = placeOf(run.places, b);
      const gap = Math.hypot(there.x - here.x, there.y - here.y);
      assert.ok(gap >= clear, `dominoes ${a} and ${b} are ${gap.toFixed(3)} apart`);
    }
  }
  assert.ok(LANE > clear && CORE / 2 > DOMINO.width);
});

test('spin mirrors the run', () => {
  const one = layRun({ count: 400, spin: 1 });
  const other = layRun({ count: 400, spin: -1 });
  for (let index = 0; index < 400; index += 1) {
    const a = placeOf(one.places, index);
    const b = placeOf(other.places, index);
    assert.ok(Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y + b.y) < 1e-4, `domino ${index} is not mirrored`);
  }
});

test('a run too short to get round its turn is refused', () => {
  assert.throws(() => layRun({ count: SHORTEST_RUN - 1 }), RangeError);
  assert.throws(() => layRun({ count: 2 }), RangeError);
  assert.throws(() => layRun({ count: 40.5 }), RangeError);
});

test('a wave starts at a pace the eye can follow and only ever speeds up', () => {
  for (const count of [300, 2500, 10000]) {
    const pace = wavePace(count);
    assert.equal(pace(0), 0);
    let step = pace(1) - pace(0);
    assert.ok(step > 1 / 100 && step < 1 / 50, `count ${count}: first step ${step}`);
    for (let k = 2; k < count; k += Math.ceil(count / 200)) {
      const next = pace(k) - pace(k - 1);
      assert.ok(next > 0 && next <= step + 1e-9, `count ${count}: the wave slowed at ${k}`);
      step = next;
    }
  }
  const whole = wavePace(10000)(9999);
  assert.ok(whole > 11 && whole < 13, `a run of ten thousand takes ${whole} s`);
});

test('pushing the first domino brings the whole run down, in order', () => {
  const count = 2000;
  const schedule = createSchedule(count);
  assert.equal(schedule.fallen(1e6), 0);
  assert.equal(schedule.firstStanding(0), 0);

  assert.equal(schedule.push(0, 5), true);
  for (let index = 1; index < count; index += 1) {
    assert.ok(schedule.falls[index * 4] > schedule.falls[(index - 1) * 4], `domino ${index} falls out of turn`);
  }
  assert.equal(schedule.falls[0], 5);
  assert.ok(schedule.falls[4] > 5 && schedule.falls[4] < 5 + TIPPED, 'the second waits for the first to reach it');

  assert.equal(schedule.fallen(4.9), 0);
  assert.equal(schedule.fallen(5), 1);
  assert.equal(schedule.fallen(schedule.busyUntil), count);
  assert.equal(schedule.firstStanding(schedule.busyUntil), -1);

  // All but the last lean on the next one; the last falls flat.
  assert.ok(Math.abs(schedule.falls[1] - REST) < 1e-6);
  assert.ok(Math.abs(schedule.falls[(count - 1) * 4 + 1] - FLAT) < 1e-6);
  assert.ok(REST > 1 && REST < FLAT);
});

test('a domino that is already falling cannot be pushed again', () => {
  const schedule = createSchedule(100);
  schedule.push(0, 0);
  assert.equal(schedule.push(0, 1), false);
  assert.equal(schedule.push(-1, 1), false);
  assert.equal(schedule.push(100, 1), false);
});

test('a push further along sets off a second wave; whichever arrives first wins', () => {
  const count = 5000;
  const schedule = createSchedule(count);
  schedule.push(0, 0);
  const before = Float32Array.from(schedule.falls);
  const where = 3000;
  // Just ahead of the first wave, which by now is far faster than a wave setting off.
  const when = before[where * 4] - 0.6;
  assert.ok(when > 0);

  assert.equal(schedule.push(where, when), true);
  assert.equal(schedule.falls[where * 4], Math.fround(when)); // times are kept as 32-bit numbers for the GPU
  let merged = false;
  for (let index = 0; index < count; index += 1) {
    const now = schedule.falls[index * 4];
    const was = before[index * 4];
    assert.ok(now <= was, `domino ${index} now falls later than it would have`);
    if (index < where) assert.equal(now, was);
    if (index > where && now === was) merged = true;
    if (merged) assert.equal(now, was, `domino ${index}: the waves merged and then parted again`);
  }
  assert.ok(merged, 'the faster first wave never caught the second');
});

test('a second wave with a long enough head start reaches the end on its own', () => {
  const count = 5000;
  const schedule = createSchedule(count);
  schedule.push(0, 0);
  const before = Float32Array.from(schedule.falls);
  schedule.push(3000, 1.5);
  for (let index = 3000; index < count; index += 1) {
    assert.ok(schedule.falls[index * 4] < before[index * 4], `domino ${index} was left to the first wave`);
  }
});

test('a wave stops where it meets dominoes that are already down', () => {
  const count = 600;
  const schedule = createSchedule(count);
  schedule.push(400, 0); // the far end comes down first
  const settled = schedule.busyUntil;
  assert.equal(schedule.fallen(settled), 200);
  assert.equal(schedule.firstStanding(settled), 0);

  schedule.push(0, settled + 1);
  assert.equal(schedule.fallen(schedule.busyUntil), count);
  assert.ok(schedule.falls[400 * 4] === 0, 'the dominoes that were down keep their times');
});

test('setting them up again makes every domino stand', () => {
  const schedule = createSchedule(300);
  schedule.push(0, 0);
  schedule.standAll();
  assert.equal(schedule.fallen(1e6), 0);
  assert.equal(schedule.falls[0], NEVER);
  assert.equal(schedule.busyUntil, -Infinity);
});

test('the nearest standing domino is found, and fallen ones are passed over', () => {
  const run = layRun({ count: 800 });
  const schedule = createSchedule(run.count);
  const target = placeOf(run.places, 250);
  assert.equal(schedule.nearestStanding(run.places, target.x + 0.05, target.y, 0, 1), 250);
  assert.equal(schedule.nearestStanding(run.places, 500, 500, 0, 1), -1);

  schedule.push(250, 0);
  const later = schedule.busyUntil + 1;
  const found = schedule.nearestStanding(run.places, target.x, target.y, later, 3);
  assert.ok(found >= 0 && found < 250, `found ${found}, which should be a domino still standing`);
});

test('the number of dominoes follows the size of the stage', () => {
  assert.equal(countFor(700, 9), 10000);
  assert.equal(countFor(120, 12), 1200);
  const phone = countFor(358, 12);
  assert.ok(phone > 1500 && phone < 2500, `a phone gets ${phone}`);
  assert.ok(countFor(500, 9) > countFor(400, 9));
});
