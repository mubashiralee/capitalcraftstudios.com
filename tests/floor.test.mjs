// The Orchestration Hub's floor as numbers (js/floor.js): jobs moving through
// queue, build, audit and merge, and the one rule the picture is there to show:
// a release never merges until a person approves it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { GATE, STAGES, createFloor } from '../js/floor.js';

const FRAME = 1 / 60;
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the stages the page comes with (before any script runs) are the floor\'s own, in order', () => {
  const stage = page.slice(page.indexOf('data-hub>'), page.indexOf('class="hub__body"'));
  assert.deepEqual([...stage.matchAll(/<li>([^<]+)<\/li>/g)].map((found) => found[1]), [...STAGES]);
});

/** A random number generator that gives the same numbers for the same seed. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run a floor for `seconds`, calling `each` after every frame. */
function run(floor, seconds, each = () => {}) {
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame += 1) {
    floor.step(FRAME);
    each(frame * FRAME);
  }
}

test('a new floor has a job in every lane, none of them past the build', () => {
  const floor = createFloor({ lanes: 5, random: seeded(1) });
  assert.deepEqual(STAGES, ['Queue', 'Build', 'Audit', 'Merge']);
  assert.equal(GATE, 3, 'the gate is at the door of the merge');
  const jobs = floor.jobs;
  assert.deepEqual(jobs.map((job) => job.lane), [0, 1, 2, 3, 4]);
  assert.equal(new Set(jobs.map((job) => job.id)).size, 5, 'two jobs share an id');
  for (const job of jobs) {
    assert.ok(job.at >= 0 && job.at < 2, `the job in lane ${job.lane} starts at ${job.at}`);
    assert.equal(job.waiting, false);
  }
  assert.equal(floor.merged, 0);
  assert.equal(floor.waiting, null);
});

test('jobs only ever move forward, and every lane keeps merging work', () => {
  const floor = createFloor({ lanes: 5, random: seeded(2) });
  const last = new Map();
  run(floor, 60, () => {
    if (floor.waiting) floor.approve(floor.waiting.id);
    for (const job of floor.jobs) {
      assert.ok(job.at >= (last.get(job.id) ?? 0), `job ${job.id} went back from ${last.get(job.id)} to ${job.at}`);
      assert.ok(job.at < STAGES.length, `job ${job.id} is at ${job.at}, past the end of the floor`);
      last.set(job.id, job.at);
    }
  });
  assert.ok(floor.merged >= 25, `only ${floor.merged} jobs merged in a minute`);
  assert.ok(floor.merged <= 50, `${floor.merged} jobs merged in a minute: too fast to follow`);
});

test('a release is on the floor from the start, and reaches the gate within ten seconds', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const floor = createFloor({ lanes: 5, random: seeded(seed) });
    assert.deepEqual(floor.jobs.filter((job) => job.kind === 'Release').map((job) => job.lane), [2], `seed ${seed}: the release starts in the middle lane`);
    let reached = null;
    run(floor, 10, (now) => {
      if (floor.waiting && reached === null) reached = now;
    });
    assert.ok(reached !== null && reached > 2, `seed ${seed}: the release reached the gate at ${reached} s`);
  }
});

test('a release waits at the gate for as long as nobody approves it, while the other lanes carry on', () => {
  const floor = createFloor({ lanes: 5, random: seeded(3) });
  run(floor, 12);
  const held = floor.waiting;
  assert.ok(held, 'no release is waiting');
  assert.equal(held.kind, 'Release');
  assert.equal(held.at, GATE, 'it waits exactly at the gate');
  const before = floor.merged;
  run(floor, 120, () => {
    assert.equal(floor.waiting?.id, held.id, 'the release left the gate, or another job is waiting');
    assert.equal(floor.jobs.find((job) => job.id === held.id).at, GATE);
  });
  assert.ok(floor.merged - before >= 40, `only ${floor.merged - before} other jobs merged in two minutes`);
  // Nothing else on the floor is a release while this one waits.
  assert.equal(floor.jobs.filter((job) => job.kind === 'Release').length, 1);
});

test('only a release ever waits: every other kind of job goes straight through', () => {
  const floor = createFloor({ lanes: 6, random: seeded(4) });
  const kinds = new Set();
  run(floor, 90, () => {
    for (const job of floor.jobs) {
      kinds.add(job.kind);
      if (job.waiting) assert.equal(job.kind, 'Release');
    }
    if (floor.waiting) floor.approve(floor.waiting.id);
  });
  assert.deepEqual([...kinds].sort(), ['Docs', 'Feature', 'Fix', 'Release', 'Tests']);
});

test('approving the waiting release lets it merge; nothing else can be approved, and nothing twice', () => {
  const floor = createFloor({ lanes: 5, random: seeded(5) });
  run(floor, 12);
  const held = floor.waiting;
  const other = floor.jobs.find((job) => job.id !== held.id);
  assert.equal(floor.approve(other.id), false, 'a job that is not waiting was approved');
  assert.equal(floor.approve(9999), false, 'a job that does not exist was approved');
  assert.equal(floor.waiting.id, held.id);

  const merged = floor.merged;
  assert.equal(floor.approve(held.id), true);
  assert.equal(floor.waiting, null);
  assert.equal(floor.approve(held.id), false, 'the same release was approved twice');
  let gone = null;
  run(floor, 3, (now) => {
    if (gone === null && !floor.jobs.some((job) => job.id === held.id)) gone = now;
  });
  assert.ok(gone !== null && gone > 0.3, `the approved release merged after ${gone} s`);
  assert.ok(floor.merged > merged);
});

test('there is never more than one release on the floor, and another comes round after each is merged', () => {
  const floor = createFloor({ lanes: 5, random: seeded(6) });
  const releases = new Set();
  run(floor, 180, () => {
    const now = floor.jobs.filter((job) => job.kind === 'Release');
    assert.ok(now.length <= 1, `${now.length} releases on the floor at once`);
    for (const job of now) releases.add(job.id);
    if (floor.waiting) floor.approve(floor.waiting.id);
  });
  assert.ok(releases.size >= 6, `only ${releases.size} releases in three minutes`);
});

test('a job gets a model to match it: the small one for docs, the large one for features and releases', () => {
  const floor = createFloor({ lanes: 6, random: seeded(7) });
  const tiers = new Map();
  run(floor, 90, () => {
    for (const job of floor.jobs) tiers.set(job.kind, job.tier);
    if (floor.waiting) floor.approve(floor.waiting.id);
  });
  assert.deepEqual(Object.fromEntries([...tiers].sort()), { Docs: 1, Feature: 3, Fix: 2, Release: 3, Tests: 2 });
});

test('an approved release sets off from the gate and is not stopped there again', () => {
  const floor = createFloor({ lanes: 5, random: seeded(9) });
  run(floor, 12);
  const held = floor.waiting;
  floor.approve(held.id);
  floor.step(FRAME);
  const moved = floor.jobs.find((job) => job.id === held.id);
  assert.ok(moved.at > GATE && !moved.waiting, `after a frame the approved release is at ${moved.at}`);
});

test('a frame that takes far too long (a tab left in the background) carries nothing past the gate', () => {
  const floor = createFloor({ lanes: 5, random: seeded(8) });
  for (let step = 0; step < 40; step += 1) floor.step(30);
  const held = floor.waiting;
  assert.ok(held, 'after twenty minutes of long frames no release is waiting');
  assert.equal(held.at, GATE);
  for (const job of floor.jobs) assert.ok(job.at < STAGES.length);
});

test('the same seed gives the same floor, and a different seed a different one', () => {
  const picture = (seed) => {
    const floor = createFloor({ lanes: 5, random: seeded(seed) });
    run(floor, 20);
    return JSON.stringify(floor.jobs);
  };
  assert.equal(picture(11), picture(11));
  assert.notEqual(picture(11), picture(12));
});
