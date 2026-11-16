// A wheel that can be turned by hand (js/wheel.js): the numbers behind the
// rosettes beside the services, which can be dragged round, flung and brushed
// past.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stampFrom } from '../js/edition.js';
import { WHEEL, createWheel, sweep } from '../js/wheel.js';

const TAU = Math.PI * 2;
const near = (actual, expected, slack, what) =>
  assert.ok(Math.abs(actual - expected) <= slack, `${what ?? 'value'}: ${actual} is not within ${slack} of ${expected}`);

/** Let a free wheel run until it stops; returns how long it took, in seconds. */
function coast(wheel, frame) {
  let seconds = 0;
  while (wheel.step(frame)) {
    seconds += frame;
    assert.ok(seconds < 60, 'the wheel never came to rest');
  }
  return seconds;
}

/** Turn a held wheel at a steady `speed` (radians a second) for `seconds`. */
function turnByHand(wheel, speed, seconds, frame = 1 / 60) {
  let at = 0;
  wheel.grab(at);
  for (let time = frame; time <= seconds + 1e-9; time += frame) {
    at += speed * frame;
    wheel.drag(at, frame);
  }
}

test('the shortest way round from one angle to another, across the seam at half a turn too', () => {
  near(sweep(0, 1), 1, 1e-12);
  near(sweep(1, 0), -1, 1e-12);
  near(sweep(3.1, -3.1), TAU - 6.2, 1e-12, 'over the seam, forwards');
  near(sweep(-3.1, 3.1), 6.2 - TAU, 1e-12, 'over the seam, backwards');
  near(sweep(0.5, 0.5 + 3 * TAU), 0, 1e-9, 'whole turns are no turn');
  for (const [from, to] of [[0, 2], [2, -2], [-3, 3], [0.1, 6.2]]) {
    const turned = sweep(from, to);
    assert.ok(turned > -Math.PI - 1e-12 && turned <= Math.PI + 1e-12, `${from} to ${to} went ${turned}`);
  }
});

test('a new wheel is at rest, and stays there', () => {
  const wheel = createWheel();
  assert.deepEqual([wheel.angle, wheel.speed, wheel.held], [0, 0, false]);
  assert.equal(wheel.step(1 / 60), false);
  assert.equal(wheel.angle, 0);
});

test('a held wheel goes exactly where the hand goes, and nowhere by itself', () => {
  const wheel = createWheel();
  wheel.grab(3.0);
  assert.equal(wheel.held, true);
  wheel.drag(3.1, 1 / 60);
  near(wheel.angle, 0.1, 1e-12);
  wheel.drag(-3.1, 1 / 60); // the hand crosses the seam: a short step on, not most of a turn back
  near(wheel.angle, 0.1 + (TAU - 6.2), 1e-12);
  const held = wheel.angle;
  assert.equal(wheel.step(0.5), false, 'a held wheel is not coasting');
  assert.equal(wheel.angle, held);
});

test('a hand that has not taken hold cannot drag the wheel, and letting go of nothing does nothing', () => {
  const wheel = createWheel();
  wheel.drag(1, 1 / 60);
  wheel.release();
  assert.deepEqual([wheel.angle, wheel.speed, wheel.held], [0, 0, false]);
  turnByHand(wheel, 3, 0.3);
  wheel.release();
  const speed = wheel.speed;
  wheel.drag(2, 1 / 60); // the hand has let go
  wheel.release();
  assert.equal(wheel.speed, speed);
});

test('let go while turning, the wheel carries on at the speed of the hand', () => {
  for (const speed of [2, -3.5]) {
    const wheel = createWheel();
    turnByHand(wheel, speed, 0.5);
    wheel.release();
    assert.equal(wheel.held, false);
    near(wheel.speed, speed, Math.abs(speed) * 0.02, 'speed on letting go');
  }
});

test('a hand that stopped before letting go leaves the wheel at rest', () => {
  const wheel = createWheel();
  turnByHand(wheel, 4, 0.5);
  const at = wheel.angle;
  wheel.release(0.5); // half a second after its last move
  assert.equal(wheel.speed, 0);
  assert.equal(wheel.step(1 / 60), false);
  assert.equal(wheel.angle, at);
});

test('a free wheel slows by friction and stops for good; how far it runs does not depend on the frame rate', () => {
  const ran = [1 / 30, 1 / 60, 1 / 120].map((frame) => {
    const wheel = createWheel();
    turnByHand(wheel, 3, 0.5);
    wheel.release();
    const from = wheel.angle;
    const speed = wheel.speed;
    const seconds = coast(wheel, frame);
    assert.equal(wheel.speed, 0, 'it stops exactly');
    assert.ok(seconds > 1.5 && seconds < 8, `it ran for ${seconds} s`);
    // Friction takes the speed down by 1/e every WHEEL.coast seconds, so the whole run is speed x coast.
    near(wheel.angle - from, speed * WHEEL.coast, Math.abs(speed) * WHEEL.coast * 0.02, `the run at ${Math.round(1 / frame)} frames a second`);
    return wheel.angle - from;
  });
  near(ran[0], ran[2], 0.02, '30 against 120 frames a second');
});

test('a fling can only be so fast', () => {
  const wheel = createWheel();
  turnByHand(wheel, 400, 0.2, 1 / 240);
  wheel.release();
  assert.equal(wheel.speed, WHEEL.fastest);
  const back = createWheel();
  turnByHand(back, -400, 0.2, 1 / 240);
  back.release();
  assert.equal(back.speed, -WHEEL.fastest);
});

test('taking hold of a spinning wheel stops it', () => {
  const wheel = createWheel();
  turnByHand(wheel, 5, 0.4);
  wheel.release();
  wheel.step(1 / 60);
  wheel.grab(1);
  assert.equal(wheel.speed, 0);
  const at = wheel.angle;
  wheel.step(1 / 60);
  assert.equal(wheel.angle, at);
});

test('a pointer brushing past pulls the wheel towards its own speed, and never beyond it', () => {
  const wheel = createWheel();
  const frame = 1 / 60;
  const speeds = [];
  for (let i = 0; i < 40; i += 1) {
    wheel.brush(2 * frame, frame); // the pointer goes round at 2 radians a second
    speeds.push(wheel.speed);
  }
  assert.ok(speeds[0] > 0 && speeds[0] < 1, `one brush gave ${speeds[0]}`);
  for (let i = 1; i < speeds.length; i += 1) assert.ok(speeds[i] >= speeds[i - 1] && speeds[i] <= 2 + 1e-9, `brush ${i}: ${speeds[i]}`);
  near(speeds.at(-1), 2, 0.01, 'after two thirds of a second of brushing');
  assert.equal(wheel.step(frame), true, 'and then it coasts');
});

test('brushing pulls as hard at any pointer rate, and cannot turn a wheel that is held', () => {
  const after = (rate) => {
    const wheel = createWheel();
    for (let i = 0; i < rate / 10; i += 1) wheel.brush(3 / rate, 1 / rate); // a tenth of a second at 3 radians a second
    return wheel.speed;
  };
  near(after(60), after(240), 0.01, '60 against 240 pointer events a second');

  const held = createWheel();
  held.grab(0);
  held.brush(1, 1 / 60);
  assert.equal(held.speed, 0);
  assert.equal(held.angle, 0);

  const wild = createWheel();
  wild.brush(50, 1 / 60); // a pointer whipping round next to the middle
  assert.equal(wild.speed, WHEEL.fastest);
  wild.brush(1, 0); // two events in the same instant say nothing about speed
  assert.equal(wild.speed, WHEEL.fastest);
});

test('a rosette struck by hand is one the edition could have drawn', () => {
  let state = 7;
  const random = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const seen = { waves: new Set(), strands: new Set() };
  for (let i = 0; i < 400; i += 1) {
    const stamp = stampFrom(random);
    assert.deepEqual(Object.keys(stamp), ['waves', 'strands', 'phase']);
    assert.ok(Number.isInteger(stamp.waves) && stamp.waves >= 5 && stamp.waves <= 12, `waves ${stamp.waves}`);
    assert.ok(stamp.strands % 2 === 0 && stamp.strands >= 8 && stamp.strands <= 16, `strands ${stamp.strands}`);
    assert.ok(stamp.phase >= 0 && stamp.phase < TAU, `phase ${stamp.phase}`);
    seen.waves.add(stamp.waves);
    seen.strands.add(stamp.strands);
  }
  assert.equal(seen.waves.size, 8, 'every count of waves from 5 to 12 turns up');
  assert.equal(seen.strands.size, 5, 'every even count of strands from 8 to 16 turns up');
});
