// The Domino Reactor camera (js/domino-camera.js) and the designs a visitor
// can choose (js/domino-designs.js): the lens, the film the camera shoots of a
// run, how a visitor turns it, and the page's buttons for the designs.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DOMINO_MM,
  FRAME_MM,
  Glide,
  blurOf,
  createFilm,
  fallingAt,
  fieldOf,
  invert,
  landingOf,
  lookAt,
  multiply,
  nearestTurn,
  orthographic,
  restPhase,
  through,
  viewOf,
  wavesAt,
  wholeFloor,
} from '../js/domino-camera.js';
import { DESIGNS, PATTERN, designOf } from '../js/domino-designs.js';
import { SPACING, STRUCK, createSchedule, layRun, radiusOf } from '../js/domino-run.js';
import { KEY } from '../js/domino-shaders.js';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const near = (actual, expected, slack, what) =>
  assert.ok(Math.abs(actual - expected) <= slack, `${what}: ${actual} is not within ${slack} of ${expected}`);

const LENS = 60; // millimetres: the film's one lens
const FRAME = 1 / 60; // seconds
const HALF = Math.tan(fieldOf(LENS) / 2);

// Runs of the sizes the page lays: the largest on a laptop (wound each way), a
// small laptop's, a phone's two, and a very wide window's.
const STAGES = [
  { count: 10000, aspect: 1.35, spin: 1 },
  { count: 10000, aspect: 1.35, spin: -1 },
  { count: 1800, aspect: 1.25, spin: 1 },
  { count: 3200, aspect: 0.8, spin: -1 },
  { count: 1200, aspect: 0.8, spin: 1 },
  { count: 10000, aspect: 2.2, spin: 1 },
];
const named = ({ count, aspect, spin }) => `${count} dominoes, shape ${aspect}, wound ${spin > 0 ? 'the usual way' : 'the other way'}`;

/** A run, the film camera for it, and who falls when. The camera has had two seconds to come to rest. */
function stageOf({ count, aspect, spin = 1 }) {
  const run = laid(count, spin);
  const reach = run.radius + 2;
  const film = createFilm({ places: run.places, radius: run.radius, reach, aspect, spin });
  const schedule = createSchedule(count);
  for (let frame = 0; frame < 120; frame += 1) film.step({ mode: 'standing', falls: schedule.falls, now: 0, dt: FRAME });
  return { run, reach, aspect, film, schedule, frame: { aspect, reach } };
}

const runs = new Map();
function laid(count, spin) {
  const key = `${count}/${spin}`;
  if (!runs.has(key)) runs.set(key, layRun({ count, spin, phase: restPhase(radiusOf(count), spin) }));
  return runs.get(key);
}

/** Where a point is in the camera's picture: across and up (-1 to 1), and how far off. */
function seen(view, x, y, z = 0.5) {
  const [across, up, , deep] = through(view.matrix, x, y, z);
  return { across, up, deep, off: deep > 0 ? Math.max(Math.abs(across), Math.abs(up)) : Infinity };
}

/**
 * Shoot the film of a run, as the page does: the run's clock goes at the
 * film's pace, and the camera is moved on once a frame.
 *
 * @param {ReturnType<typeof stageOf>} stage
 * @param {{ pushes?: number[][], after?: number }} [how]
 *   `pushes`: which domino is pushed, and at what time on the run's clock;
 *   `after`: seconds to keep filming once the run is down.
 * @returns {object[]} one record per frame
 */
function shoot(stage, { pushes = [[0, 0]], after = 0 } = {}) {
  const { run, film, schedule, frame } = stage;
  const waiting = [...pushes].sort((a, b) => a[1] - b[1]);
  const frames = [];
  let clock = 0;
  let real = 0;
  let downFor = 0;
  let mode = 'standing';
  let before = null;
  while (downFor <= after) {
    while (waiting.length && waiting[0][1] <= clock) {
      schedule.push(waiting.shift()[0], clock);
      mode = 'falling';
    }
    if (mode === 'falling') {
      clock += FRAME * film.pace;
      if (clock >= schedule.busyUntil && !waiting.length) mode = 'down';
    } else {
      downFor += FRAME;
    }
    film.step({ mode, falls: schedule.falls, now: clock, dt: FRAME });
    const shot = film.shot;
    const view = viewOf(shot, frame);
    const aim = [0, 1, 2].map((part) => (shot.look[part] - shot.eye[part]) / view.focus);
    const record = {
      real,
      clock,
      mode,
      pace: film.pace,
      shot,
      view,
      waves: mode === 'falling' ? wavesAt(schedule.falls, run.places, clock) : null,
      pan: 0, // radians a second the camera is turning
      zoom: 0, // how fast the distance to what it looks at is changing: the change in its logarithm each second
      glide: 0, // domino heights a second that what it looks at is moving
    };
    if (before) {
      record.pan = Math.acos(Math.min(1, aim[0] * before.aim[0] + aim[1] * before.aim[1] + aim[2] * before.aim[2])) / FRAME;
      record.zoom = Math.abs(Math.log(view.focus / before.view.focus)) / FRAME;
      record.glide = Math.hypot(...[0, 1, 2].map((part) => shot.look[part] - before.shot.look[part])) / FRAME;
    }
    record.aim = aim;
    frames.push(record);
    before = record;
    real += FRAME;
    assert.ok(real < 60, 'the film never ends');
  }
  return frames;
}

const films = new Map();
/** The film of one push of the first domino on a stage, shot once and kept. */
function filmOf(spec) {
  const key = JSON.stringify(spec);
  if (!films.has(key)) {
    const stage = stageOf(spec);
    films.set(key, { stage, frames: shoot(stage, { after: 4 }) });
  }
  return films.get(key);
}

// ---------------------------------------------------------------------------
// The lens and the picture
// ---------------------------------------------------------------------------

test('the lens: the field it sees follows from its focal length', () => {
  near(fieldOf(56), 0.4224, 0.0005, 'a 56 mm lens');
  near(fieldOf(FRAME_MM / 2), Math.PI / 2, 1e-9, 'a lens as long as half the frame sees a right angle');
  assert.ok(fieldOf(35) > fieldOf(85), 'a short lens sees more than a long one');
});

test('the lens: what is in focus is sharp, and blur grows with distance from it, with a wider stop and with a longer lens', () => {
  const lens = { focal: 70, stop: 2.8, focus: 5 };
  const soft = (other, distance) => (blurOf(other) * Math.abs(distance - other.focus)) / distance;
  assert.equal(soft(lens, 5), 0);
  assert.ok(soft(lens, 6) > 0 && soft(lens, 8) > soft(lens, 6), 'further behind the focus is softer');
  assert.ok(soft(lens, 3) > soft(lens, 4), 'and so is nearer in front of it');
  assert.ok(blurOf({ ...lens, stop: 1.4 }) > blurOf(lens), 'a wider stop blurs more');
  assert.ok(blurOf({ ...lens, focal: 100 }) > blurOf(lens), 'a longer lens blurs more');
  // By hand: f = 70/48, blur = f * f / (2.8 * (5 - f)) / (24/48) / 2.
  const length = 70 / DOMINO_MM;
  near(blurOf(lens), (length * length) / (2.8 * (5 - length)), 1e-12, 'the worked example');
  assert.throws(() => blurOf({ focal: 70, stop: 2.8, focus: 1 }), RangeError, 'nearer than the lens can focus');
});

test('matrices: a matrix times its inverse changes nothing, and a camera puts what it looks at in the middle', () => {
  const shot = { eye: [22, -31, 19], look: [3, -2, 0.4], focal: 56 };
  const view = viewOf(shot, { aspect: 1.3, reach: 20 });
  const same = multiply(view.matrix, invert(view.matrix));
  for (let at = 0; at < 16; at += 1) near(same[at], at % 5 === 0 ? 1 : 0, 1e-4, `entry ${at}`);
  const [x, y, , w] = through(view.matrix, 3, -2, 0.4);
  near(x, 0, 1e-5, 'across');
  near(y, 0, 1e-5, 'up');
  assert.ok(w > 0, 'in front of the camera');
  near(view.focus, Math.hypot(19, 29, 18.6), 1e-9, 'and is focused on it');
  // A shift lens moves the whole picture up without turning the camera.
  const lifted = viewOf({ ...shot, lift: 0.25 }, { aspect: 1.3, reach: 20 });
  const moved = through(lifted.matrix, 3, -2, 0.4);
  near(moved[0], 0, 1e-5, 'a lifted picture: across');
  near(moved[1], 0.25, 1e-5, 'a lifted picture: up');
  assert.equal(invert(new Float32Array(16)), null, 'a matrix of noughts has no inverse');
});

test('matrices: a far-off lamp sees a box, with no perspective', () => {
  const lamp = multiply(orthographic(10, 5, 1, 21), lookAt([0, -11, 0], [0, 0, 0]));
  const [x, y, z] = through(lamp, 10, 0, 5);
  near(x, 1, 1e-6, 'the right edge');
  near(y, 1, 1e-6, 'the top edge');
  near(z, 0, 1e-6, 'half way through the box');
  near(through(lamp, 10, 9, 5)[0], 1, 1e-6, 'and distance does not shrink it');
});

test('the key lamp is a direction, high over the shoulder of a camera at the front of the stage', () => {
  near(Math.hypot(...KEY), 1, 1e-9, 'a direction has length one');
  assert.ok(KEY[2] > 0.8, `the lamp is ${KEY[2]} up: it has to light the faces over the tops of their neighbours`);
  assert.ok(KEY[1] < 0, 'the lamp is behind the run, as the camera at rest sees it: the faces it looks at would be dark');
});

test('a ray through the picture lands where the camera sees that point, and one that looks up lands nowhere', () => {
  const view = viewOf({ eye: [4, -30, 12], look: [1, 2, 0.5], focal: LENS }, { aspect: 1.35, reach: 20 });
  const landed = landingOf(view.matrix, 0.3, -0.2, 0.4);
  assert.ok(landed, 'the ray meets the floor');
  const back = through(view.matrix, landed.x, landed.y, 0.4);
  near(back[0], 0.3, 1e-3, 'across');
  near(back[1], -0.2, 1e-3, 'up');
  const level = viewOf({ eye: [0, -30, 2], look: [0, 0, 2], focal: LENS }, { aspect: 1.35, reach: 20 });
  assert.equal(landingOf(level.matrix, 0, 0.9, 0.4), null, 'a ray that looks up never comes down');
});

test('wholeFloor finds how far back holds the whole floor, filling the picture with it, from any height', () => {
  for (const { radius, aspect } of [{ radius: 11, aspect: 1.25 }, { radius: 22, aspect: 1.35 }, { radius: 31.6, aspect: 1.35 }, { radius: 31.6, aspect: 0.8 }]) {
    const reach = radius + 2;
    for (const pitch of [0.6, 0.66, 1.02]) {
      const { distance, lift } = wholeFloor({ pitch, focal: LENS, radius, reach, aspect });
      const eye = [0, -distance * Math.cos(pitch), 0.35 + distance * Math.sin(pitch)];
      const { matrix } = viewOf({ eye, look: [0, 0, 0.35], focal: LENS, lift }, { aspect, reach });
      let side = 0;
      let low = Infinity;
      let high = -Infinity;
      for (let step = 0; step < 360; step += 1) {
        const angle = (step / 360) * Math.PI * 2;
        for (const [rim, z] of [[reach, 0], [radius + 0.4, 1]]) {
          const [x, y, , w] = through(matrix, rim * Math.cos(angle), rim * Math.sin(angle), z);
          assert.ok(w > 0, 'part of the floor is behind the camera');
          side = Math.max(side, Math.abs(x));
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
      }
      const what = `radius ${radius}, shape ${aspect}, from ${pitch} radians up`;
      assert.ok(side <= 0.901 && high - low <= 1.761, `${what}: the floor spills out (${side} wide, ${high - low} tall)`);
      assert.ok(side > 0.89 || high - low > 1.75, `${what}: the floor is small in the picture (${side} wide, ${high - low} tall)`);
      near(low + high, 0, 0.002, `${what}: centred top to bottom`);
    }
  }
});

// ---------------------------------------------------------------------------
// Where the dominoes are falling
// ---------------------------------------------------------------------------

test('wavesAt: no wave while the run stands, one from a push, at the domino that was pushed', () => {
  const run = laid(1800, 1);
  const schedule = createSchedule(1800);
  assert.equal(wavesAt(schedule.falls, run.places, 0), null, 'nothing has been pushed');
  schedule.push(0, 0);
  const waves = wavesAt(schedule.falls, run.places, 0.01);
  assert.equal(waves.fronts.length, 1);
  near(Math.hypot(waves.fronts[0][0] - run.places[0], waves.fronts[0][1] - run.places[1]), 0, SPACING, 'the front has not left the first domino');
  near(Math.hypot(waves.x - run.places[0], waves.y - run.places[1]), 0, 1e-6, 'and that is where to look');
  // A wave sets off at 80 dominoes a second, 0.4 apart: 32 domino heights a second, gathering speed.
  assert.ok(waves.speed >= 32 && waves.speed < 34, `the wave is about to go at ${waves.speed}`);
  near(waves.laps, waves.speed / (2 * Math.PI * run.radius), 0.002, 'laps a second, round a run of this radius');
});

test('wavesAt: the front is between the last domino to start falling and the next, and the place to look is just behind it', () => {
  const run = laid(1800, 1);
  const schedule = createSchedule(1800);
  schedule.push(0, 0);
  for (const now of [0.4, 1, 2.5, 4]) {
    const waves = wavesAt(schedule.falls, run.places, now);
    const last = schedule.fallen(now) - 1;
    const [x, y] = waves.fronts[0];
    const along = (index) => [run.places[index * 4], run.places[index * 4 + 1]];
    const [ax, ay] = along(last);
    const [bx, by] = along(last + 1);
    near(Math.hypot(x - ax, y - ay) + Math.hypot(x - bx, y - by), Math.hypot(bx - ax, by - ay), 1e-4, `at ${now} s: the front is on the way from domino ${last} to the next`);
    // The place to look: the domino nearest it began to fall about half a fall ago.
    let nearest = 0;
    for (let index = 0; index <= last; index += 1) {
      if (Math.hypot(waves.x - along(index)[0], waves.y - along(index)[1]) < Math.hypot(waves.x - along(nearest)[0], waves.y - along(nearest)[1])) nearest = index;
    }
    near(now - schedule.falls[nearest * 4], STRUCK * 0.45, 0.02, `at ${now} s: the domino looked at has been falling for`);
    assert.ok(nearest < last, 'which is behind the front');
  }
});

test('wavesAt: two pushes make two fronts, looked at half way between; a run whose last domino has gone has none', () => {
  const run = laid(1800, 1);
  const schedule = createSchedule(1800);
  schedule.push(0, 0);
  schedule.push(900, 0);
  const waves = wavesAt(schedule.falls, run.places, 0.5);
  assert.equal(waves.fronts.length, 2);
  const one = createSchedule(1800);
  one.push(0, 0);
  const other = createSchedule(1800);
  other.push(900, 0);
  const first = wavesAt(one.falls, run.places, 0.5);
  const second = wavesAt(other.falls, run.places, 0.5);
  near(waves.x, (first.x + second.x) / 2, 1e-6, 'across');
  near(waves.y, (first.y + second.y) / 2, 1e-6, 'along');
  const end = schedule.falls[1799 * 4];
  assert.ok(wavesAt(schedule.falls, run.places, end - 0.001), 'a wave is still running just before the last domino goes');
  assert.equal(wavesAt(schedule.falls, run.places, end + 0.001), null, 'and none once it has');
});

test('fallingAt: the dominoes on their way down, and those about to be, never more than 64 of them', () => {
  const schedule = createSchedule(10000);
  assert.deepEqual(fallingAt(schedule.falls, 0), [], 'a standing run');
  schedule.push(0, 0);
  for (const [now, soon] of [[0.1, 0], [3, 0], [3, 1.1], [11, 1.1]]) {
    const held = fallingAt(schedule.falls, now, soon);
    assert.ok(held.length > 0 && held.length <= 64, `at ${now} s, ${soon} s ahead: ${held.length} dominoes`);
    for (const index of held) {
      const since = now - schedule.falls[index * 4];
      assert.ok(since >= -soon - 1e-6 && since <= schedule.falls[index * 4 + 2] + 1e-6, `domino ${index} began to fall ${since} s ago`);
    }
    // From the first on its way down to the last that will go in time: spread over them all.
    const first = held[0];
    const reaches = held[held.length - 1];
    assert.ok(schedule.falls[first * 4] <= now && now - schedule.falls[first * 4] <= schedule.falls[first * 4 + 2] + 1e-6, 'it starts with one that is falling');
    let lastInTime = first;
    for (let index = first; index < 10000 && schedule.falls[index * 4] <= now + soon; index += 1) lastInTime = index;
    assert.ok(lastInTime - reaches < Math.max(2, (lastInTime - first) / 32), `it stops at domino ${reaches}, but ${lastInTime} will go in time`);
  }
});

// ---------------------------------------------------------------------------
// How it moves
// ---------------------------------------------------------------------------

test('the glide arrives without overshooting, however long a frame takes', () => {
  for (const dt of [1 / 120, 1 / 60, 0.05, 0.5]) {
    const glide = new Glide(0, 49);
    let last = 0;
    for (let frame = 0; frame < Math.ceil(4 / dt); frame += 1) {
      const now = glide.step(10, dt);
      assert.ok(now >= last - 1e-9 && now <= 10 + 1e-9, `dt ${dt}: went from ${last} to ${now}`);
      last = now;
    }
    near(last, 10, 0.01, `dt ${dt}: after four seconds`);
    assert.ok(glide.settled(10, 0.02));
  }
  // One long step lands where many short ones do.
  const one = new Glide(2, 30);
  const many = new Glide(2, 30);
  one.step(5, 0.4);
  for (let frame = 0; frame < 400; frame += 1) many.step(5, 0.001);
  near(one.value, many.value, 1e-9, 'the same place');
  near(one.velocity, many.velocity, 1e-9, 'at the same speed');
  near(nearestTurn(0.1, 6.2), 0.1 + Math.PI * 2, 1e-12, 'the nearest equal of an angle');
});

test('a glide told how fast its target moves keeps up with it; one that is not trails behind', () => {
  const told = new Glide(0, 60);
  const untold = new Glide(0, 60);
  const speed = 9; // the target's, a second
  let target = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    target += speed * FRAME;
    told.step(target, FRAME, speed);
    untold.step(target, FRAME);
  }
  near(told.value, target, 1e-6, 'told the speed, it is on the target');
  near(told.velocity, speed, 1e-6, 'and moving with it');
  // A critically damped spring trails a steadily moving target by twice its speed over its rate;
  // here the target moves in steps, a frame at a time, which takes half a frame's travel off that.
  near(target - untold.value, (2 * speed) / Math.sqrt(60) - (speed * FRAME) / 2, 0.001, 'left to itself it is behind by');
});

// ---------------------------------------------------------------------------
// The film
// ---------------------------------------------------------------------------

test('at rest the camera is at the front of the stage, close behind the first domino, which fills a good part of the picture', () => {
  for (const spec of STAGES) {
    const { run, film, frame } = stageOf(spec);
    const shot = film.shot;
    const view = viewOf(shot, frame);
    const what = named(spec);
    const [x, y, ahead, across] = run.places;
    near(Math.atan2(shot.eye[0], -shot.eye[1]), 0, 0.02, `${what}: the crane's bearing from the front of the stage`);
    const first = seen(view, x, y);
    assert.ok(first.off < 0.02, `${what}: the first domino is at ${first.across}, ${first.up} in the picture`);
    const tall = 1 / (2 * first.deep * HALF);
    assert.ok(tall > 0.2 && tall < 0.4, `${what}: the first domino is ${tall} of the picture's height`);
    near(view.focus, Math.hypot(shot.eye[0] - x, shot.eye[1] - y, shot.eye[2] - 0.5), 1e-6, `${what}: focused on the first domino`);
    assert.ok((shot.eye[0] - x) * ahead + (shot.eye[1] - y) * across < -5, `${what}: the camera is not behind the first domino`);
    assert.ok(Math.hypot(shot.eye[0], shot.eye[1]) > run.radius + 2, `${what}: the camera is not outside the floor`);
    assert.ok(shot.eye[2] > 2 && shot.eye[2] < 5, `${what}: the camera is ${shot.eye[2]} up`);
    assert.equal(shot.focal, LENS);
    near(shot.stop, 8, 1e-6, `${what}: the stop`);
    assert.equal(film.pace, 1, `${what}: nothing is falling, so the run's clock is left alone`);
  }
});

test('the two ways a run can wind give films that are mirror images', () => {
  const one = filmOf(STAGES[0]).frames;
  const other = filmOf(STAGES[1]).frames;
  assert.equal(one.length, other.length, 'the same length');
  for (let at = 0; at < one.length; at += 30) {
    near(one[at].shot.eye[0], -other[at].shot.eye[0], 1e-3, `frame ${at}: across`);
    near(one[at].shot.eye[1], other[at].shot.eye[1], 1e-3, `frame ${at}: along`);
    near(one[at].shot.look[0], -other[at].shot.look[0], 1e-3, `frame ${at}: what it looks at`);
  }
});

test('the camera is pointed at the falling dominoes: the front of the wave is in the picture in every frame of every film', () => {
  for (const spec of STAGES) {
    const { stage, frames } = filmOf(spec);
    const what = named(spec);
    let worst = 0;
    for (const record of frames) {
      if (!record.waves) continue;
      for (const [x, y] of record.waves.fronts) {
        const front = seen(record.view, x, y);
        assert.ok(front.off <= 0.97, `${what}, ${record.real.toFixed(2)} s: the front is at ${front.across}, ${front.up} in the picture`);
        assert.ok(front.deep > record.view.near && front.deep < record.view.far, `${what}, ${record.real.toFixed(2)} s: the lens cuts the front off (${front.deep} away)`);
        worst = Math.max(worst, front.off);
      }
      assert.ok(record.shot.eye[2] > 1.5, `${what}: the camera is ${record.shot.eye[2]} up, among the dominoes`);
    }
    assert.ok(worst > 0.5, `${what}: the wave never left the middle of the picture (${worst}), so the camera never drew back from it`);
    assert.ok(stage.run.count > 0);
  }
});

test('while the camera draws back from the first domino, the wave stays near the middle of the picture', () => {
  for (const spec of STAGES) {
    const { frames } = filmOf(spec);
    const what = named(spec);
    for (const record of frames) {
      if (!record.waves || record.real > 3) continue;
      const front = seen(record.view, ...record.waves.fronts[0]);
      assert.ok(front.off <= 0.6, `${what}, ${record.real.toFixed(2)} s: the front is at ${front.across}, ${front.up}: the camera is looking somewhere else`);
    }
  }
  // The head lets the wave go more slowly than the crane draws back: five seconds in,
  // the wave is still well inside the picture (on a phone's small run, where the
  // crane has less far to go, it is on its way out by then).
  for (const [stage, within] of [[STAGES[0], 0.45], [STAGES[2], 0.7], [STAGES[4], 0.82], [STAGES[5], 0.48]]) {
    for (const record of filmOf(stage).frames) {
      if (!record.waves || record.real > 5) continue;
      const front = seen(record.view, ...record.waves.fronts[0]);
      assert.ok(front.off <= within, `${named(stage)}, ${record.real.toFixed(2)} s: the front is at ${front.across}, ${front.up}`);
    }
  }
  for (const record of filmOf(STAGES[5]).frames) {
    if (!record.waves || record.real > 4) continue;
    const front = seen(record.view, ...record.waves.fronts[0]);
    assert.ok(front.off <= 0.33, `a very wide picture, ${record.real.toFixed(2)} s: the front is at ${front.across}, ${front.up}`);
  }
});

test('the film opens close and slow: the dominoes are big in the picture, and what the camera looks at moves no faster than can be read', () => {
  for (const spec of STAGES) {
    const { frames } = filmOf(spec);
    const what = named(spec);
    const opening = frames.filter((record) => record.waves && record.real <= 2.5);
    for (const record of opening) {
      // Half a spacing a frame is where a row of dominoes starts to strobe: 12 domino heights a second.
      assert.ok(record.glide <= 12, `${what}, ${record.real.toFixed(2)} s: what the camera looks at is moving at ${record.glide}`);
    }
    const early = frames.find((record) => record.real >= 0.6);
    const front = seen(early.view, ...early.waves.fronts[0]);
    assert.ok(1 / (2 * front.deep * HALF) > 0.15, `${what}: 0.6 s in, a domino at the front is ${1 / (2 * front.deep * HALF)} of the picture's height`);
    assert.ok(early.pace < 0.4, `${what}: 0.6 s in, the run's clock goes at ${early.pace} of real time`);
  }
});

test('the run slows for the opening, never below a fifth of real time, and then gathers speed for good', () => {
  for (const spec of STAGES) {
    const { frames } = filmOf(spec);
    const what = named(spec);
    const falling = frames.filter((record) => record.mode === 'falling');
    near(falling[0].pace, 1, 0.05, `${what}: at the push the clock is going at`);
    assert.ok(falling.every((record) => record.pace >= 0.2 - 1e-9 && record.pace <= 1), `${what}: the pace left the range a fifth to one`);
    const full = falling.findIndex((record, at) => at > 30 && record.pace >= 0.99);
    assert.ok(full > 0, `${what}: the run never comes back to its own speed`);
    assert.ok(falling[full].real > 3 && falling[full].real < 8, `${what}: it is back at its own speed ${falling[full].real} s in`);
    for (const record of falling.slice(full)) {
      assert.ok(record.pace >= 0.9, `${what}, ${record.real.toFixed(2)} s: the clock slowed again, to ${record.pace}`);
    }
    assert.ok(frames.filter((record) => record.mode === 'down').every((record) => record.pace === 1), `${what}: the run is down, and the clock is still slowed`);
    const took = falling[falling.length - 1].real;
    assert.ok(took > 9 && took < 19, `${what}: the film takes ${took} s`);
  }
});

test('the camera never whips round or lurches: its turn and its zoom stay slow all through the fall', () => {
  for (const spec of STAGES) {
    const { frames } = filmOf(spec);
    const what = named(spec);
    for (const record of frames) {
      if (record.mode !== 'falling') continue;
      const degrees = (record.pan * 180) / Math.PI;
      assert.ok(degrees <= 35, `${what}, ${record.real.toFixed(2)} s: the camera is turning at ${degrees} degrees a second`);
      assert.ok(record.zoom <= 1.3, `${what}, ${record.real.toFixed(2)} s: the picture's scale is changing at ${record.zoom} a second`);
    }
  }
});

test('once the camera has drawn back it has the whole run in the picture, and keeps it there while the wave laps the outside', () => {
  const { stage, frames } = filmOf(STAGES[0]);
  const falling = frames.filter((record) => record.mode === 'falling');
  const full = falling.findIndex((record, at) => at > 30 && record.pace >= 0.99);
  // For the next two and a half seconds the wave is still on its first laps.
  for (const record of falling.slice(full + 30, full + 180)) {
    let worst = 0;
    for (let index = 0; index < stage.run.count; index += 25) {
      worst = Math.max(worst, seen(record.view, stage.run.places[index * 4], stage.run.places[index * 4 + 1]).off);
    }
    assert.ok(worst <= 1, `${record.real.toFixed(2)} s: part of the run is out of the picture (${worst})`);
    assert.ok(worst > 0.8, `${record.real.toFixed(2)} s: the run is small in the picture (${worst})`);
  }
});

test('as the wave closes on the middle the camera is above it and comes in close; as it runs out again the camera draws back', () => {
  const { stage, frames } = filmOf(STAGES[0]);
  const falling = frames.filter((record) => record.mode === 'falling');
  const down = (record) => Math.asin((record.shot.eye[2] - record.shot.look[2]) / record.view.focus);
  const wide = falling.find((record, at) => at > 30 && record.pace >= 0.99);
  const closest = falling.reduce((best, record) => (record.real > wide.real && record.view.focus < best.view.focus ? record : best), wide);
  assert.ok(closest.view.focus < wide.view.focus * 0.75, `the camera only comes in from ${wide.view.focus} to ${closest.view.focus}`);
  assert.ok(down(closest) > 0.95, `at its closest it looks down from ${down(closest)} radians: that is not from above`);
  assert.ok(down(wide) < 0.7, `when it first has the whole run it looks down from ${down(wide)} radians`);
  // At its closest the wave is inside the middle half of the run.
  const [x, y] = closest.waves.fronts[0];
  assert.ok(Math.hypot(x, y) < stage.run.radius * 0.6, `the wave is ${Math.hypot(x, y)} out when the camera is closest`);
  const last = falling[falling.length - 1];
  assert.ok(last.view.focus > closest.view.focus * 1.3, `by the end it has drawn back from ${closest.view.focus} only to ${last.view.focus}`);
});

test('when the run is down the camera settles over the whole of it', () => {
  for (const spec of STAGES) {
    const { stage, frames } = filmOf(spec);
    const what = named(spec);
    const last = frames[frames.length - 1];
    assert.equal(last.mode, 'down');
    let side = 0;
    let low = Infinity;
    let high = -Infinity;
    for (let step = 0; step < 360; step += 1) {
      const angle = (step / 360) * Math.PI * 2;
      for (const [rim, z] of [[stage.reach, 0], [stage.run.radius + 0.4, 1]]) {
        const spot = seen(last.view, rim * Math.cos(angle), rim * Math.sin(angle), z);
        side = Math.max(side, Math.abs(spot.across));
        low = Math.min(low, spot.up);
        high = Math.max(high, spot.up);
      }
    }
    assert.ok(side <= 0.91 && high - low <= 1.78, `${what}: the fallen run spills out of the picture (${side} wide, ${high - low} tall)`);
    assert.ok(side > 0.88 || high - low > 1.73, `${what}: the fallen run is small in the picture (${side} wide, ${high - low} tall)`);
    near(low + high, 0, 0.02, `${what}: centred top to bottom`);
    assert.ok(last.pan < 0.01 && last.zoom < 0.01, `${what}: four seconds after the last domino the camera is still moving`);
    // Not from straight above, where fallen dominoes are flat tiles: from the side, where they are a relief.
    near(Math.asin((last.shot.eye[2] - last.shot.look[2]) / last.view.focus), 0.66, 0.03, `${what}: radians it looks down from`);
  }
});

test('a second push in the middle of a run: the camera takes in both waves', () => {
  const stage = stageOf(STAGES[0]);
  const frames = shoot(stage, { pushes: [[0, 0], [6000, 1.5]] });
  const second = frames.find((record) => record.waves && record.waves.fronts.length === 2);
  assert.ok(second, 'there were never two waves');
  for (const record of frames) {
    if (!record.waves || record.real < second.real + 1.5) continue;
    for (const [x, y] of record.waves.fronts) {
      const front = seen(record.view, x, y);
      assert.ok(front.off <= 1, `${record.real.toFixed(2)} s: a front is at ${front.across}, ${front.up}`);
    }
  }
});

test('a push far from where the camera waits: it turns to that wave, slows the run for it, and keeps it in the picture', () => {
  const stage = stageOf(STAGES[0]);
  const frames = shoot(stage, { pushes: [[3000, 0]] });
  const falling = frames.filter((record) => record.waves);
  for (const record of falling) {
    if (record.real < 1.5) continue;
    const front = seen(record.view, ...record.waves.fronts[0]);
    assert.ok(front.off <= 0.97, `${record.real.toFixed(2)} s: the front is at ${front.across}, ${front.up}`);
  }
  assert.ok(falling[40].pace < 0.5, `0.7 s in the clock goes at ${falling[40].pace}`);
});

test('a push at the rim late on, while the camera is close over the middle: the film does not drop back into slow motion', () => {
  for (const [spec, pushes] of [[STAGES[0], [[0, 0], [9900, 10.5]]], [STAGES[2], [[0, 0], [1790, 6]]]]) {
    const frames = shoot(stageOf(spec), { pushes });
    const falling = frames.filter((record) => record.mode === 'falling');
    const full = falling.findIndex((record, at) => at > 30 && record.pace >= 0.99);
    const two = falling.findIndex((record) => record.waves?.fronts.length === 2);
    assert.ok(two > full, `${named(spec)}: the second push came before the film had gathered speed`);
    for (const record of falling.slice(full)) {
      assert.ok(record.pace >= 0.9, `${named(spec)}, ${record.real.toFixed(2)} s: the clock slowed again, to ${record.pace}`);
    }
  }
});

test('however fast a wave runs, the film never slows the clock below a fifth of real time', () => {
  const { run, film, schedule } = stageOf(STAGES[2]);
  // A wave no run of the page's makes: 500 domino heights a second from the first domino on.
  for (let index = 0; index < run.count; index += 1) schedule.falls[index * 4] = (index * SPACING) / 500;
  let clock = 0;
  let slowest = 1;
  for (let frame = 0; frame < 90; frame += 1) {
    clock += FRAME * film.pace;
    film.step({ mode: 'falling', falls: schedule.falls, now: clock, dt: FRAME });
    slowest = Math.min(slowest, film.pace);
  }
  near(slowest, 0.2, 1e-6, 'the slowest the clock went');
});

test('a visitor turns the crane round the run: the picture is the same, from further round', () => {
  const { film, schedule } = stageOf(STAGES[2]);
  const plain = film.shot;
  film.step({ mode: 'standing', falls: schedule.falls, now: 0, dt: FRAME, turn: 1 });
  const turned = film.shot;
  const round = ([x, y, z]) => [x * Math.cos(1) - y * Math.sin(1), x * Math.sin(1) + y * Math.cos(1), z];
  round(plain.eye).forEach((part, at) => near(turned.eye[at], part, 1e-6, `the camera, part ${at}`));
  round(plain.look).forEach((part, at) => near(turned.look[at], part, 1e-6, `what it looks at, part ${at}`));
});

test('a visitor tilts the camera over what it looks at, as far as straight down nearly, and no lower than the tops of the dominoes', () => {
  const { film, schedule } = stageOf(STAGES[2]);
  const down = (shot) => Math.asin((shot.eye[2] - shot.look[2]) / Math.hypot(...[0, 1, 2].map((part) => shot.eye[part] - shot.look[part])));
  const gap = (shot) => Math.hypot(...[0, 1, 2].map((part) => shot.eye[part] - shot.look[part]));
  const plain = film.shot;
  const [lower, higher] = film.tilts;
  near(higher, 1.45 - down(plain), 1e-6, 'room to tilt up');
  near(lower, 0.1 - down(plain), 1e-6, 'room to tilt down');
  const tilted = (tilt, swing = 0) => {
    film.step({ mode: 'standing', falls: schedule.falls, now: 0, dt: FRAME, tilt, swing });
    return film.shot;
  };
  const up = tilted(0.3);
  near(down(up), down(plain) + 0.3, 1e-6, 'tilted up by 0.3');
  near(gap(up), gap(plain), 1e-6, 'at the same distance');
  up.look.forEach((part, at) => near(part, plain.look[at], 1e-9, `looking at the same thing, part ${at}`));
  near(down(tilted(5)), 1.45, 1e-6, 'tilted up as far as it goes');
  near(down(tilted(-5)), 0.1, 1e-6, 'and down as far as it goes');
  const swung = tilted(0, 0.4);
  near(down(swung), down(plain), 1e-6, 'a swing keeps the height');
  near(gap(swung), gap(plain), 1e-6, 'and the distance');
  const bearing = (shot) => Math.atan2(shot.eye[0] - shot.look[0], -(shot.eye[1] - shot.look[1]));
  near(bearing(swung) - bearing(plain), 0.4, 1e-6, 'and goes 0.4 radians round what it looks at');
});

test('a visitor who wants no motion gets cuts: the camera is where it should be at once, and the clock is left alone', () => {
  const stage = stageOf(STAGES[0]);
  const { film, schedule, run, frame } = stage;
  schedule.push(0, 0);
  film.step({ mode: 'falling', falls: schedule.falls, now: 4, dt: FRAME, still: true });
  assert.equal(film.pace, 1);
  const first = film.shot;
  assert.equal(film.step({ mode: 'falling', falls: schedule.falls, now: 4, dt: FRAME, still: true }), true, 'while dominoes fall it asks to be drawn again');
  const again = film.shot;
  film.step({ mode: 'falling', falls: schedule.falls, now: 4, dt: FRAME, still: true });
  const third = film.shot;
  // The very first cut is already the finished picture: nothing is left to settle in the next frame.
  first.eye.forEach((part, at) => near(again.eye[at], part, 1e-4, `a second look, the camera, part ${at}`));
  first.look.forEach((part, at) => near(again.look[at], part, 1e-4, `a second look, what it looks at, part ${at}`));
  again.eye.forEach((part, at) => near(third.eye[at], part, 1e-4, `a third look, the camera, part ${at}`));
  again.look.forEach((part, at) => near(third.look[at], part, 1e-4, `a third look, what it looks at, part ${at}`));
  // It is where the film would have got to in the end: back, with the whole run in the picture.
  const view = viewOf(first, frame);
  let worst = 0;
  for (let index = 0; index < run.count; index += 25) worst = Math.max(worst, seen(view, run.places[index * 4], run.places[index * 4 + 1]).off);
  assert.ok(worst <= 1 && worst > 0.8, `the run reaches ${worst} of the way to the picture's edge`);
  film.step({ mode: 'down', falls: schedule.falls, now: 99, dt: FRAME, still: true });
  assert.equal(film.step({ mode: 'down', falls: schedule.falls, now: 99, dt: FRAME, still: true }), false, 'once the run is down there is nothing more to draw');
});

test('set up again, the camera goes home: back to the first domino, by the short way round', () => {
  const stage = stageOf(STAGES[4]);
  const { film, schedule } = stage;
  const home = film.shot;
  shoot(stage, { after: 1 });
  const away = film.shot;
  assert.ok(Math.hypot(...[0, 1, 2].map((part) => away.eye[part] - home.eye[part])) > 20, 'the film did not take the camera anywhere');
  schedule.standAll();
  let frames = 0;
  let furthest = 0;
  while (film.step({ mode: frames < 90 ? 'rising' : 'standing', falls: schedule.falls, now: 0, dt: FRAME })) {
    frames += 1;
    furthest = Math.max(furthest, Math.abs(Math.atan2(film.shot.eye[0], -film.shot.eye[1])));
    assert.ok(frames < 1200, 'the camera never comes to rest');
  }
  assert.ok(frames > 60, `it was home in ${frames} frames: that is a cut, not a move`);
  assert.ok(furthest < 2, `it went ${furthest} radians round on its way home: the long way`);
  const back = film.shot;
  home.eye.forEach((part, at) => near(back.eye[at], part, 0.02, `the camera, part ${at}`));
  home.look.forEach((part, at) => near(back.look[at], part, 0.02, `what it looks at, part ${at}`));
  assert.equal(film.pace, 1);
});

test('the film opens on the first domino: the camera is already at rest, with no move to make before the push', () => {
  for (const spec of STAGES) {
    const run = laid(spec.count, spec.spin);
    const reach = run.radius + 2;
    const film = createFilm({ places: run.places, radius: run.radius, reach, aspect: spec.aspect, spin: spec.spin });
    const schedule = createSchedule(spec.count);
    const what = named(spec);
    // The owner's picture of the stage as it should first be seen: close behind the first domino.
    assert.equal('establish' in film, false, `${what}: the film still has a way to open high over the whole run`);
    const opening = film.shot;
    const first = seen(viewOf(opening, { aspect: spec.aspect, reach }), run.places[0], run.places[1]);
    assert.ok(first.off < 0.02, `${what}: as the film opens the first domino is at ${first.across}, ${first.up} in the picture`);
    assert.ok(opening.eye[2] < 5, `${what}: it opens ${opening.eye[2]} up`);
    assert.equal(film.step({ mode: 'standing', falls: schedule.falls, now: 0, dt: FRAME }), false, `${what}: the camera had somewhere to go before anything was pushed`);
    const rested = stageOf(spec).film.shot;
    opening.eye.forEach((part, at) => near(part, rested.eye[at], 1e-9, `${what}: the camera, part ${at}`));
    opening.look.forEach((part, at) => near(part, rested.look[at], 1e-9, `${what}: what it looks at, part ${at}`));
  }
});

test('a narrower picture puts the camera further back to hold the whole run', () => {
  const spec = STAGES[0];
  const run = laid(spec.count, spec.spin);
  const film = createFilm({ places: run.places, radius: run.radius, reach: run.radius + 2, aspect: 1.35, spin: 1 });
  const schedule = createSchedule(spec.count);
  const over = () => {
    film.step({ mode: 'down', falls: schedule.falls, now: 99, dt: FRAME, still: true });
    return film.shot;
  };
  const wide = over();
  film.reframe(0.8);
  const narrow = over();
  assert.ok(Math.hypot(...narrow.eye) > Math.hypot(...wide.eye) * 1.3, `a tall picture is taken from ${Math.hypot(...narrow.eye)}, a wide one from ${Math.hypot(...wide.eye)}`);
});

// ---------------------------------------------------------------------------
// The designs
// ---------------------------------------------------------------------------

test('every design says what it is made of, in numbers the shader can use', () => {
  assert.ok(DESIGNS.length >= 5);
  assert.equal(new Set(DESIGNS.map((design) => design.key)).size, DESIGNS.length, 'two designs share a key');
  assert.equal(new Set(DESIGNS.map((design) => design.name)).size, DESIGNS.length, 'two designs share a name');
  for (const design of DESIGNS) {
    for (const colour of [design.body, design.vein, design.mark]) {
      assert.equal(colour.length, 3, design.key);
      for (const part of colour) assert.ok(part >= 0 && part <= 1, `${design.key}: ${colour}`);
    }
    assert.ok(design.pattern in PATTERN, `${design.key}: pattern "${design.pattern}"`);
    for (const share of [design.metal, design.polish, design.markMetal, design.markGlow]) {
      assert.ok(share >= 0 && share <= 1, `${design.key}: ${share}`);
    }
    assert.equal(designOf(design.key), design);
  }
  assert.throws(() => designOf('plastic'), /no domino design called "plastic"/);
});

test('the page has one button for each design, and none for choosing a camera', () => {
  const pressed = (attribute) => [...page.matchAll(new RegExp(`<button[^>]*\\s${attribute}="([^"]+)"[^>]*>`, 'g'))];
  const designs = pressed('data-design');
  assert.deepEqual(designs.map((found) => found[1]), DESIGNS.map((design) => design.key));
  for (const [tag, key] of designs) {
    assert.ok(tag.includes(`aria-label="${designOf(key).name}"`), `the ${key} button is not named: ${tag}`);
    assert.ok(/aria-pressed="(true|false)"/.test(tag), `the ${key} button does not say whether it is chosen`);
  }
  assert.equal(designs.filter(([tag]) => tag.includes('aria-pressed="true"')).length, 1, 'exactly one design starts chosen');
  assert.ok(designs[0][0].includes('aria-pressed="true"'), 'and it is the first');
  // The film has one camera, and it is always on the falling dominoes: there is nothing to choose.
  assert.equal(page.includes('data-shot'), false, 'the page still has camera buttons');
});
