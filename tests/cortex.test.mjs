// The Orchestration Hub's brain as numbers (js/cortex.js): its shape, its
// regions, the paths between them, and where a job of the floor is drawn.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BAND,
  CROSSING,
  DECISION,
  DESK,
  FIGURE,
  LOOK,
  MIDDLE,
  ORCHESTRATOR,
  PART,
  PLATE,
  REGIONS,
  TAU,
  WAVE_SECONDS,
  VERDICTS,
  along,
  approach,
  bandAt,
  buildCortex,
  centreOf,
  createAccounts,
  facing,
  frameFor,
  onDesk,
  placeOf,
  pointOf,
  project,
  regionOfPoints,
  seatOf,
  seeded,
  spot,
  turning,
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

test('the cortex is folded: most of it stands on the crests, and the grooves between them hold few points', () => {
  let cortex = 0;
  let crest = 0;
  let groove = 0;
  for (let i = 0; i < brain.count; i += 1) {
    assert.ok(brain.fold[i] >= 0 && brain.fold[i] <= 1, `point ${i} is ${brain.fold[i]} of the way up its fold`);
    if (brain.part[i] !== PART.cortex) continue;
    cortex += 1;
    if (brain.fold[i] > 0.9) crest += 1;
    if (brain.fold[i] < 0.3) groove += 1;
  }
  // Drawn brighter the higher it stands, this is what makes the folds: broad lit crests, thin dark lines between.
  assert.ok(crest / cortex > 0.5, `${crest} of ${cortex} points stand on a crest`);
  assert.ok(groove / cortex > 0.01 && groove / cortex < 0.2, `${groove} of ${cortex} points lie in a groove`);
});

test('a denser cloud is the same brain with more points', () => {
  const dense = buildCortex(seeded(42), 4);
  assert.ok(dense.count > brain.count * 3.6 && dense.count < brain.count * 4.4, `${dense.count} points against ${brain.count}`);
  const share = (cloud, kind) => cloud.part.reduce((sum, part) => sum + (part === kind ? 1 : 0), 0) / cloud.count;
  for (const kind of Object.values(PART)) {
    assert.ok(Math.abs(share(dense, kind) - share(brain, kind)) < 0.03, `part ${kind}: ${share(dense, kind).toFixed(3)} against ${share(brain, kind).toFixed(3)}`);
  }
  assert.equal(dense.part.reduce((sum, part) => sum + (part === PART.stem ? 1 : 0), 0), 360 * 4);
  for (let i = 0; i < dense.count * 3; i += 1) assert.ok(Math.abs(dense.at[i]) < 1.2, `coordinate ${i}: ${dense.at[i]}`);
  for (const none of [0, -1, Number.NaN]) assert.throws(() => buildCortex(seeded(42), none), RangeError);
});

test('every point knows which way its surface faces, and has a number of its own', () => {
  const middles = { [PART.cerebellum]: [0, 0.33, 0.6] };
  let seen = 0;
  const owns = new Set();
  for (let i = 0; i < brain.count; i += 1) {
    const at = [brain.at[i * 3], brain.at[i * 3 + 1], brain.at[i * 3 + 2]];
    const normal = [brain.normal[i * 3], brain.normal[i * 3 + 1], brain.normal[i * 3 + 2]];
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-4, `the normal of point ${i} is ${Math.hypot(...normal)} long`);
    assert.ok(brain.own[i] >= 0 && brain.own[i] < 1, `point ${i} has ${brain.own[i]} for its own number`);
    owns.add(brain.own[i]);
    // Lit from one side, a point whose surface faced inward would be bright where it should be dark.
    const middle = middles[brain.part[i]];
    if (!middle) continue;
    seen += 1;
    const out = at.map((part, k) => part - middle[k]);
    assert.ok(out[0] * normal[0] + out[1] * normal[1] + out[2] * normal[2] > 0, `point ${i} of the cerebellum faces inward`);
  }
  assert.ok(seen > 300, 'the cerebellum was looked at');
  assert.ok(owns.size > brain.count * 0.99, 'the points share their numbers');
  // The top of the brain faces up, and its flanks face out to their own side.
  let top = 0;
  let flank = 0;
  for (let i = 0; i < brain.count; i += 1) {
    if (brain.part[i] !== PART.cortex) continue;
    const [x, y] = [brain.at[i * 3], brain.at[i * 3 + 1]];
    if (y < -0.5) {
      top += 1;
      assert.ok(brain.normal[i * 3 + 1] < -0.5, `a point on the crown faces ${brain.normal[i * 3 + 1]} up`);
    }
    if (Math.abs(x) > 0.66 && y < 0) {
      flank += 1;
      assert.equal(Math.sign(brain.normal[i * 3]), Math.sign(x), 'a point on the flank faces across the brain');
    }
  }
  assert.ok(top > 20 && flank > 20, `crown ${top}, flank ${flank}`);
});

test('no point of the hemispheres is buried in a temporal lobe: what cannot be seen is not drawn', () => {
  // The temporal lobes: under each hemisphere, towards the front.
  let buried = 0;
  for (let i = 0; i < brain.count; i += 1) {
    if (brain.part[i] !== PART.cortex) continue;
    const [x, y, z] = [brain.at[i * 3], brain.at[i * 3 + 1], brain.at[i * 3 + 2]];
    const within = Math.hypot((Math.abs(x) - 0.5) / 0.22, (y - 0.2) / 0.15, (z + 0.14) / 0.4);
    if (within < 0.6) buried += 1;
  }
  assert.equal(buried, 0);
});

test('the brainstem is short, and tucked under the brain: it does not hang down like a stalk', () => {
  let lowest = -Infinity;
  for (let i = 0; i < brain.count; i += 1) if (brain.part[i] === PART.stem) lowest = Math.max(lowest, brain.at[i * 3 + 1]);
  assert.ok(lowest > 0.5 && lowest < 0.7, `the stem ends at ${lowest}`);
});

test('the desk lies under the whole brain, and the accounts sit along its near rim', () => {
  let lowest = -Infinity;
  for (let i = 0; i < brain.count; i += 1) lowest = Math.max(lowest, brain.at[i * 3 + 1]);
  assert.ok(DESK.y > lowest, `the brain reaches down to ${lowest}, the desk is at ${DESK.y}`);
  assert.ok(DESK.y - lowest < 0.2, 'the desk is a long way under the brain');
  const seats = [0, 1, 2].map((each) => onDesk(seatOf(each, 3)));
  for (const seat of seats) {
    assert.equal(seat[1], DESK.y);
    assert.ok(Math.abs(Math.hypot(seat[0], seat[2]) - DESK.radius) < 1e-12, 'a seat is off the rim');
    assert.ok(seat[2] < -DESK.radius * 0.7, 'a seat is not on the near side');
  }
  assert.ok(Math.abs(seats[1][0]) < 1e-12 && seats[1][2] < seats[0][2], 'the middle seat is the nearest');
  assert.ok(Math.abs(seats[0][0] + seats[2][0]) < 1e-12 && seats[0][0] < 0, 'the outer seats mirror each other');
  assert.ok(seats[2][0] - seats[1][0] > 0.3, 'the seats are too close to tell apart');
  assert.equal(seatOf(0, 1), 0, 'one account sits in the middle');
});

test('the desk is engraved with a band of strands that weave, each closing on itself, all inside its rim', () => {
  assert.ok(BAND.inner > 0.5 && BAND.outer < 1, 'the band is not on the outer part of the desk');
  assert.ok(Number.isInteger(BAND.lobes) && BAND.lobes >= 5);
  for (let strand = 0; strand < BAND.strands; strand += 1) {
    let least = Infinity;
    let most = -Infinity;
    for (let step = 0; step <= 720; step += 1) {
      const out = bandAt(strand, (step / 720) * Math.PI * 2);
      least = Math.min(least, out);
      most = Math.max(most, out);
    }
    assert.ok(least >= BAND.inner - 1e-9 && most <= BAND.outer + 1e-9, `strand ${strand} runs from ${least} to ${most}`);
    assert.ok(most - least > (BAND.outer - BAND.inner) * 0.9, `strand ${strand} does not cross the band`);
    assert.ok(Math.abs(bandAt(strand, 0) - bandAt(strand, Math.PI * 2)) < 1e-9, `strand ${strand} does not close on itself`);
    assert.ok(Math.abs(bandAt(strand, 1.3, 0.4) - bandAt(strand, 1.3)) > 1e-3, 'the band cannot be made to drift');
  }
  // No two strands lie on each other, and between them they cross: that is what makes it a weave.
  for (let strand = 1; strand < BAND.strands; strand += 1) {
    let apart = 0;
    let crossings = 0;
    let before = 0;
    for (let step = 0; step <= 720; step += 1) {
      const gap = bandAt(strand, (step / 720) * Math.PI * 2) - bandAt(0, (step / 720) * Math.PI * 2);
      apart = Math.max(apart, Math.abs(gap));
      if (step > 0 && gap * before < 0) crossings += 1;
      before = gap || before;
    }
    assert.ok(apart > 0.02, `strand ${strand} lies on the first`);
    assert.ok(crossings >= BAND.lobes, `strand ${strand} crosses the first ${crossings} times`);
  }
});

test('the brain is looked at from a little above, so the desk under it is seen as a desk', () => {
  assert.ok(LOOK.pitch > 0.1 && LOOK.pitch < 0.5, `the eye is ${LOOK.pitch} radians above level`);
  const view = { ...LOOK, yaw: 0, scale: 1, x: 0, y: 0 };
  const near = project(...onDesk(0), view);
  const far = project(...onDesk(Math.PI), view);
  assert.ok(near[1] > far[1] + 0.3, 'the near rim of the desk is not below the far rim: the desk is seen edge on');
  assert.ok(far[1] > project(...MIDDLE, view)[1], 'the desk is not under the brain');
  // A desk is wider than what stands on it: turned any way, the brain never overhangs its sides.
  let widest = 0;
  for (let turn = 0; turn < 24; turn += 1) {
    const turned = { ...view, yaw: (turn / 24) * Math.PI * 2 };
    for (let i = 0; i < brain.count; i += 1) widest = Math.max(widest, Math.abs(project(brain.at[i * 3], brain.at[i * 3 + 1], brain.at[i * 3 + 2], turned)[0]));
  }
  const side = Math.max(...Array.from({ length: 96 }, (_, step) => project(...onDesk((step / 96) * Math.PI * 2), view)[0]));
  assert.ok(side > widest * 1.05, `the desk reaches ${side} to the side and the brain ${widest}`);
});

test('the figure fits its frame: the brain, turned any way, and the whole desk are inside it, and it is as large as that allows', () => {
  const P = [0, 0, 0, 0];
  for (const [width, height] of [[755, 535], [640, 420], [358, 390], [900, 300], [300, 900]]) {
    const frame = frameFor(width, height);
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    const take = (x, y, z, view) => {
      project(x, y, z, view, P);
      left = Math.min(left, P[0]);
      right = Math.max(right, P[0]);
      top = Math.min(top, P[1]);
      bottom = Math.max(bottom, P[1]);
    };
    for (let turn = 0; turn < 24; turn += 1) {
      const view = { ...LOOK, ...frame, yaw: (turn / 24) * Math.PI * 2 };
      for (let i = 0; i < brain.count; i += 1) take(brain.at[i * 3], brain.at[i * 3 + 1], brain.at[i * 3 + 2], view);
    }
    for (let step = 0; step < 96; step += 1) take(...onDesk((step / 96) * Math.PI * 2), { ...LOOK, ...frame, yaw: 0 });
    const what = `in a frame ${width} by ${height}`;
    assert.ok(left >= 0 && right <= width, `${what} the figure runs from ${left} to ${right} across`);
    assert.ok(top >= 0 && bottom <= height, `${what} the figure runs from ${top} to ${bottom} down`);
    // As large as fits, with a little air: one way or the other it all but fills the frame.
    const filled = Math.max((right - left) / width, (bottom - top) / height);
    assert.ok(filled > 0.86, `${what} the figure fills only ${filled} of it`);
    // And it stands in the middle of the frame, from side to side.
    assert.ok(Math.abs((left + right) / 2 - width / 2) < width * 0.03, `${what} the figure is off to one side`);
    assert.ok(Math.abs((top + bottom) / 2 - height / 2) < height * 0.06, `${what} the figure is too high or too low`);
  }
  assert.ok(FIGURE.side > 0 && FIGURE.up > 0 && FIGURE.down > 0);
  assert.throws(() => frameFor(0, 100), /no room/);
});

test('a release nears the gate as it goes, is there while it waits, and nothing else nears it at all', () => {
  const floor = createFloor({ lanes: 5, random: () => 0.5 });
  let last = 0;
  let seen = 0;
  for (let i = 0; i < 600 && !floor.waiting; i += 1) {
    floor.step(1 / 30);
    const release = floor.jobs.find((job) => job.kind === 'Release');
    if (!release) continue;
    const now = approach(release);
    assert.ok(now >= last && now >= 0 && now <= 1, `${now} after ${last}`);
    last = now;
    seen += 1;
  }
  assert.ok(seen > 10, 'no release was followed');
  assert.equal(approach(floor.waiting), 1);
  assert.equal(approach({ id: 1, at: 0, kind: 'Release', waiting: false }), 0);
  assert.ok(Math.abs(approach({ id: 1, at: GATE / 2, kind: 'Release', waiting: false }) - 0.5) < 1e-12);
  assert.equal(approach({ id: 1, at: GATE + 0.5, kind: 'Release', waiting: false }), 1, 'an approved release has passed the gate');
  for (const job of floor.jobs) if (job.kind !== 'Release') assert.equal(approach(job), 0);
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

test('the turn handed to the graphics card is the turn every other point is given', () => {
  // js/hub-cloud.js turns the cloud on the GPU with these nine numbers; jobs, names and the desk are
  // turned by `project`. If the two disagreed, the lights would drift off the brain as it turned.
  const random = seeded(7);
  for (let n = 0; n < 200; n += 1) {
    const view = { yaw: random() * 12 - 6, pitch: random() * 2 - 1, scale: 1, x: 0, y: 0 };
    const p = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
    const [sx, sy, near, depth] = project(...p, view);
    const rows = turning(view);
    assert.equal(rows.length, 9);
    const turned = [0, 1, 2].map((row) => rows[row * 3] * p[0] + rows[row * 3 + 1] * p[1] + rows[row * 3 + 2] * p[2]);
    assert.ok(Math.abs(turned[0] * near - sx) < 1e-6 && Math.abs(turned[1] * near - sy) < 1e-6, `across and down differ at yaw ${view.yaw}, pitch ${view.pitch}`);
    assert.ok(Math.abs(turned[2] - depth) < 1e-6, 'away differs');
    // The same turn says which way a surface faces.
    const length = Math.hypot(...p);
    const normal = p.map((part) => part / length);
    const away = rows[6] * normal[0] + rows[7] * normal[1] + rows[8] * normal[2];
    assert.ok(Math.abs(Math.abs(away) - facing(...normal, view)) < 1e-6, 'facing differs');
  }
  const kept = new Float32Array(9);
  assert.equal(turning({ yaw: 0.3, pitch: 0.1 }, kept), kept, 'it fills the array it is given');
});

test('the names stand clear of the brain: no point of it, turned any way, is outside the plate they keep off', () => {
  const cortex = buildCortex(undefined, 2);
  const P = [0, 0, 0, 0];
  let worst = 0;
  for (let turn = 0; turn < 36; turn += 1) {
    const view = { yaw: (turn / 36) * TAU, pitch: LOOK.pitch, scale: 1, x: 0, y: 0 };
    for (let i = 0; i < cortex.count; i += 1) {
      project(cortex.at[i * 3], cortex.at[i * 3 + 1], cortex.at[i * 3 + 2], view, P);
      worst = Math.max(worst, Math.hypot(P[0] / PLATE.across, (P[1] - PLATE.low) / PLATE.down));
    }
  }
  assert.ok(worst < 1, `a point of the brain is ${worst} of the way out to the plate's edge`);
  // And not so large that a name is pushed off the brain it names.
  assert.ok(worst > 0.9, `the plate is loose: the brain reaches only ${worst} of the way to its edge`);
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
