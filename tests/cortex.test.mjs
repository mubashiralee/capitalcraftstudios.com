// The Orchestration Hub's brain as numbers (js/cortex.js): its shape, its
// regions, the paths between them, and where a job of the floor is drawn.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CROSSING,
  DECISION,
  MIDDLE,
  ORCHESTRATOR,
  PART,
  REGIONS,
  WAVE_SECONDS,
  VERDICTS,
  YOU,
  along,
  buildCortex,
  centreOf,
  createAccounts,
  facing,
  placeOf,
  pointOf,
  project,
  regionOfPoints,
  spot,
  waveAt,
} from '../js/cortex.js';
import { GATE, STAGES, createFloor } from '../js/floor.js';

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const brain = buildCortex();

test('the brain is the same cloud every time, with all its parts', () => {
  const again = buildCortex();
  assert.equal(again.count, brain.count);
  assert.deepEqual([...again.at.slice(0, 30)], [...brain.at.slice(0, 30)]);
  assert.ok(brain.count > 3300 && brain.count < 4600, `${brain.count} points`);
  const counts = [0, 0, 0];
  for (const part of brain.part) counts[part] += 1;
  assert.ok(counts[PART.cortex] > 2500, `cortex ${counts[PART.cortex]}`);
  assert.ok(counts[PART.cerebellum] > 300, `cerebellum ${counts[PART.cerebellum]}`);
  assert.equal(counts[PART.stem], 360);
  for (let i = 0; i < brain.count * 3; i += 1) assert.ok(Number.isFinite(brain.at[i]) && Math.abs(brain.at[i]) < 1.2, `coordinate ${i}: ${brain.at[i]}`);
});

test('the two hemispheres are mirror images in size, with a dark fissure between them', () => {
  let left = 0;
  let right = 0;
  let midline = 0;
  for (let i = 0; i < brain.count; i += 1) {
    if (brain.part[i] !== PART.cortex) continue;
    const x = brain.at[i * 3];
    if (x < 0) left += 1;
    else right += 1;
    if (Math.abs(x) < 0.05 && brain.at[i * 3 + 1] < -0.2) midline += 1; // along the top, between the hemispheres
  }
  assert.ok(Math.abs(left - right) / (left + right) < 0.06, `left ${left}, right ${right}`);
  assert.ok(midline < 40, `${midline} points lie in the fissure`);
});

test('each stage has its own region on the surface, on alternate sides, in the floor\'s order', () => {
  assert.deepEqual(REGIONS.map((region) => region.stage), [...STAGES]);
  REGIONS.forEach((region, i) => {
    assert.equal(Math.sign(region.centre[0]), i % 2 ? 1 : -1, `${region.stage} is on the wrong side`);
    assert.ok(gap(region.centre, MIDDLE) > 0.45, `${region.stage} is not out on the surface`);
    for (const other of REGIONS.slice(i + 1)) assert.ok(gap(region.centre, other.centre) > 2 * region.radius, `${region.stage} overlaps ${other.stage}`);
  });
  assert.equal(centreOf(-1), ORCHESTRATOR);
  assert.throws(() => centreOf(4), RangeError);
  assert.ok(YOU[1] < Math.min(...REGIONS.map((region) => region.centre[1])) - 0.2, 'the person is above the brain');
});

test('every region lights a patch of the brain, and no point belongs to two', () => {
  const owner = regionOfPoints(brain);
  const lit = [0, 0, 0, 0];
  for (const r of owner) if (r >= 0) lit[r] += 1;
  for (const [r, count] of lit.entries()) assert.ok(count > 25 && count < 600, `${STAGES[r]} lights ${count} points`);
});

test('a job keeps its own spot in a region, close to the middle of it', () => {
  for (let place = 0; place < 4; place += 1) {
    const spots = [1, 2, 3, 4, 5].map((id) => spot(place, id));
    assert.deepEqual(spot(place, 3), spots[2], 'the same job, the same spot');
    for (const each of spots) assert.ok(gap(each, REGIONS[place].centre) < REGIONS[place].radius + 0.05);
    assert.ok(new Set(spots.map((each) => each.join())).size === 5, 'two jobs share a spot');
  }
  assert.equal(spot(-1, 9), ORCHESTRATOR);
});

test('a signal\'s path starts and ends where it should, and bows out from the middle of the brain', () => {
  const a = REGIONS[0].centre;
  const b = REGIONS[1].centre;
  assert.ok(gap(along(a, b, 0), a) < 1e-9);
  assert.ok(gap(along(a, b, 1), b) < 1e-9);
  const halfway = along(a, b, 0.5);
  const straight = a.map((part, i) => (part + b[i]) / 2);
  assert.ok(gap(halfway, MIDDLE) > gap(straight, MIDDLE) + 0.05, 'the path cuts through the brain');
});

test('a job of every kind moves smoothly through the brain: no jump from one frame to the next', () => {
  for (const kind of ['Feature', 'Release']) {
    let last = null;
    for (let at = 0; at < STAGES.length; at += 0.001) {
      const now = pointOf({ id: 7, at, kind, waiting: false });
      if (last) assert.ok(gap(now, last) < 0.02, `${kind} jumps ${gap(now, last).toFixed(3)} at ${at.toFixed(3)}`);
      last = now;
    }
  }
});

test('the orchestrator sends each job out, and it crosses to each region in turn', () => {
  const job = (at) => placeOf({ id: 1, at, kind: 'Fix', waiting: false });
  assert.deepEqual(job(0), { from: -1, to: 0, t: 0, fade: 0 });
  assert.deepEqual(job(0.5), { from: 0, to: 0, t: 0, fade: 0 });
  const crossing = job(1 + 1 - CROSSING / 2);
  assert.deepEqual([crossing.from, crossing.to], [1, 2]);
  assert.ok(Math.abs(crossing.t - 0.5) < 1e-9);
  assert.equal(job(3.2).from, 3);
  assert.ok(job(3.99).fade > 0.9, 'a merged job goes out');
});

test('a release waits halfway along the path into the merge, and goes on from there once approved', () => {
  const waiting = placeOf({ id: 2, at: GATE, kind: 'Release', waiting: true });
  assert.deepEqual(waiting, { from: GATE - 1, to: GATE, t: 0.5, fade: 0 });
  const approved = placeOf({ id: 2, at: GATE, kind: 'Release', waiting: false });
  assert.deepEqual(approved, waiting, 'it does not move at the moment it is approved');
  assert.ok(placeOf({ id: 2, at: GATE + CROSSING / 2, kind: 'Release', waiting: false }).t > 0.5);
  // Any other kind of job crosses the whole way without stopping.
  assert.deepEqual(placeOf({ id: 3, at: GATE, kind: 'Fix', waiting: false }), { from: GATE, to: GATE, t: 0, fade: 0 });
});

test('the floor\'s waiting release is drawn at the gate for as long as it waits', () => {
  const floor = createFloor({ lanes: 5, random: () => 0.5 });
  for (let i = 0; i < 600 && !floor.waiting; i += 1) floor.step(1 / 30);
  assert.ok(floor.waiting, 'no release came to the gate');
  const at = pointOf(floor.waiting);
  for (let i = 0; i < 300; i += 1) floor.step(1 / 30);
  assert.deepEqual(pointOf(floor.waiting), at);
});

test('the wave of a merged release grows out and fades, then is gone', () => {
  assert.equal(waveAt(-0.1), null);
  assert.equal(waveAt(WAVE_SECONDS), null);
  let last = waveAt(0);
  assert.equal(last.radius, 0);
  assert.equal(last.strength, 1);
  for (let age = 0.1; age < WAVE_SECONDS; age += 0.1) {
    const now = waveAt(age);
    assert.ok(now.radius > last.radius && now.strength < last.strength, `at ${age.toFixed(1)} s`);
    last = now;
  }
  assert.ok(last.radius > 2, 'the wave never crosses the whole brain');
});

test('a point is drawn larger near the viewer than far away, and a whole turn brings it back', () => {
  const view = { yaw: 0, pitch: 0, scale: 100, x: 200, y: 150 };
  const front = project(0, 0, -0.8, view);
  const back = project(0, 0, 0.8, view);
  assert.ok(front[2] > 1 && back[2] < 1);
  assert.deepEqual(project(0, 0, 0, view), [200, 150, 1, 0]);
  const turned = project(0.3, -0.2, 0.5, { ...view, yaw: Math.PI * 2 });
  project(0.3, -0.2, 0.5, view).forEach((part, i) => assert.ok(Math.abs(part - turned[i]) < 1e-9));
  // Turned a quarter, a point on the right comes round to the front, and one on the left goes behind.
  assert.ok(project(0.5, 0, 0, { ...view, yaw: Math.PI / 2 })[3] < -0.4);
  assert.ok(project(-0.5, 0, 0, { ...view, yaw: Math.PI / 2 })[3] > 0.4);
});

test('the rim of the brain is where the surface turns side-on', () => {
  const view = { yaw: 0, pitch: 0 };
  assert.ok(Math.abs(facing(0, 0, 1, view) - 1) < 1e-12, 'facing the viewer');
  assert.ok(facing(1, 0, 0, view) < 1e-12, 'side-on');
  assert.ok(Math.abs(facing(1, 0, 0, { yaw: Math.PI / 2, pitch: 0 }) - 1) < 1e-12, 'turned to face');
});

test('the decision model sits on the path from Build to Audit, and can send a build three ways', () => {
  const build = REGIONS[1].centre;
  const audit = REGIONS[2].centre;
  assert.ok(gap(DECISION, along(build, audit, 0.5)) < 1e-12);
  assert.deepEqual(VERDICTS.map((each) => each.verdict), ['pass', 'fix', 'ask']);
  assert.deepEqual(VERDICTS.map((each) => each.to), [2, 1, 'you']);
});

test('work draws on one account until it is full, then the next one takes over', () => {
  const accounts = createAccounts({ count: 3 });
  assert.equal(accounts.active, 0);
  for (let i = 0; i < 4; i += 1) assert.equal(accounts.draw(0.25), 0);
  assert.deepEqual(accounts.full, [true, false, false]);
  assert.equal(accounts.active, 1, 'the second account took over');
  assert.equal(accounts.draw(0.1), 1);
  assert.deepEqual(accounts.levels.map((level) => Math.round(level * 100)), [100, 10, 0]);
  assert.throws(() => accounts.draw(0), RangeError);
});

test('a full account refills with time and is used again once it is low enough', () => {
  const accounts = createAccounts({ count: 2, refill: 0.1, reopen: 0.35 });
  accounts.draw(1);
  accounts.draw(1);
  assert.equal(accounts.active, -1, 'every account is full');
  assert.equal(accounts.draw(0.1), -1, 'nothing can be drawn');
  accounts.step(6); // down to 0.4: still closed
  assert.equal(accounts.active, -1);
  accounts.step(1); // 0.3: open again
  assert.deepEqual(accounts.full, [false, false]);
  assert.equal(accounts.active, 0);
  assert.ok(Math.abs(accounts.levels[0] - 0.3) < 1e-9);
});

test('with the floor running, the work never stops for want of an account', () => {
  const accounts = createAccounts();
  const floor = createFloor({ lanes: 5, random: () => 0.37 });
  const seen = new Set();
  let switches = 0;
  let last = accounts.active;
  for (let frame = 0; frame < 60 * 180; frame += 1) {
    floor.step(1 / 60);
    accounts.step(1 / 60);
    if (floor.waiting) floor.approve(floor.waiting.id);
    for (const job of floor.jobs) {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      assert.notEqual(accounts.draw(0.06 * job.tier), -1, `job ${job.id} found every account full`);
    }
    if (accounts.active !== last) switches += 1;
    last = accounts.active;
  }
  assert.ok(switches >= 6, `the accounts changed hands only ${switches} times in three minutes`);
});
