// The Orchestration Hub's mind as numbers (js/cortex.js): its shape, its
// stages, the paths between them, and where a job of the floor is drawn.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BAND,
  CROSSING,
  DECISION,
  DESK,
  FIGURE,
  GLASS,
  LOOK,
  MIDDLE,
  ORCHESTRATOR,
  PART,
  PLAN,
  PLATE,
  PULSE,
  REGIONS,
  RIM,
  SPARE,
  TAU,
  WAVE_SECONDS,
  VERDICTS,
  along,
  approach,
  bandAt,
  buildMind,
  centreOf,
  constellation,
  createAccounts,
  facing,
  frameFor,
  glassOutline,
  inGlass,
  onDesk,
  placeOf,
  pointOf,
  project,
  reachOf,
  regionOfPoints,
  seatOf,
  seeded,
  spot,
  turning,
  waveAt,
} from '../js/cortex.js';
import { GATE, STAGES, createFloor } from '../js/floor.js';

const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mind = buildMind();
const { nodes } = constellation();
/** The full constellation, and the sparer one a small picture is given: every rule of the plan holds for both. */
const PLANS = [['the full plan', PLAN], ['the sparer plan', SPARE]];
const countOf = (cloud, kind) => cloud.part.reduce((sum, part) => sum + (part === kind ? 1 : 0), 0);
const pointOfCloud = (cloud, i) => [cloud.at[i * 3], cloud.at[i * 3 + 1], cloud.at[i * 3 + 2]];
/** A grain of the rim: it lies at the foot of the glass, and faces straight down. */
const onRim = (cloud, i) => cloud.part[i] === PART.glass && cloud.normal[i * 3 + 1] === 1;

test('the mind is the same cloud every time, with all its parts', () => {
  const again = buildMind();
  assert.equal(again.count, mind.count);
  assert.deepEqual([...again.at.slice(0, 30)], [...mind.at.slice(0, 30)]);
  assert.deepEqual([...again.at.slice(-30)], [...mind.at.slice(-30)]);
  assert.ok(mind.count > 3000 && mind.count < 4600, `${mind.count} points`);
  assert.equal(countOf(mind, PART.node), nodes.length, 'a node is not drawn as one light');
  assert.equal(countOf(mind, PART.halo), nodes.length, 'a node has not one halo');
  assert.ok(countOf(mind, PART.glass) > 1200, `glass ${countOf(mind, PART.glass)}`);
  assert.ok(countOf(mind, PART.thread) > 1000, `threads ${countOf(mind, PART.thread)}`);
  assert.ok(countOf(mind, PART.mote) > 250, `motes ${countOf(mind, PART.mote)}`);
  assert.equal(Object.values(PART).reduce((sum, kind) => sum + countOf(mind, kind), 0), mind.count, 'a point is part of nothing');
  for (let i = 0; i < mind.count * 3; i += 1) assert.ok(Number.isFinite(mind.at[i]) && Math.abs(mind.at[i]) < 1.2, `coordinate ${i}: ${mind.at[i]}`);
});

test('the glass is one round dome, cut off flat at its rim', () => {
  let dome = 0;
  let rim = 0;
  let widest = 0;
  let deepest = 0;
  let crown = Infinity;
  const quarters = [0, 0, 0, 0];
  for (let i = 0; i < mind.count; i += 1) {
    if (mind.part[i] !== PART.glass) continue;
    const [x, y, z] = pointOfCloud(mind, i);
    assert.ok(y <= GLASS.floor + 1e-6, `a grain of the glass at ${y}, below its rim`);
    if (onRim(mind, i)) {
      rim += 1;
      assert.ok(Math.abs(y - GLASS.floor) < 1e-6 && Math.abs(Math.hypot(x, z) - RIM) < 1e-5, `a grain of the rim at ${x}, ${y}, ${z}`);
      continue;
    }
    dome += 1;
    assert.ok(Math.abs(reachOf(x, y, z) - 1) < 1e-4, `a grain of the dome ${reachOf(x, y, z)} of the way out to it`);
    widest = Math.max(widest, Math.abs(x));
    deepest = Math.max(deepest, Math.abs(z));
    crown = Math.min(crown, y);
    quarters[Math.floor(((Math.atan2(z, x) + Math.PI) / TAU) * 4) % 4] += 1;
  }
  assert.ok(dome > 1000 && rim > 80, `dome ${dome}, rim ${rim}`);
  // Round: as wide as it is deep, and as full on every side. Turned any way it is the same dome,
  // never two halves standing apart.
  assert.ok(Math.abs(widest - GLASS.round) < 0.03 && Math.abs(deepest - GLASS.round) < 0.03, `${widest} wide, ${deepest} deep`);
  for (const [quarter, count] of quarters.entries()) assert.ok(Math.abs(count / dome - 0.25) < 0.04, `quarter ${quarter} of the dome holds ${count} of ${dome} grains`);
  assert.ok(Math.abs(crown - (GLASS.lift - GLASS.tall)) < 0.02, `the crown is at ${crown}`);
  // It is cut off below its widest, so the rim is a little narrower than the dome.
  assert.ok(GLASS.floor > GLASS.lift && RIM < GLASS.round && RIM > GLASS.round * 0.6, `the rim is ${RIM} wide`);
  assert.deepEqual(inGlass([0, -1, 0]), [0, GLASS.lift - GLASS.tall, 0]);
  assert.ok(Math.abs(reachOf(...inGlass([0.6, 0, 0.8], 0.5)) - 0.5) < 1e-12, 'half way out is not half way out');
});

test('every grain of the glass faces out of the dome, and every point has a number of its own', () => {
  const owns = new Set();
  let crown = 0;
  let flank = 0;
  for (let i = 0; i < mind.count; i += 1) {
    const at = pointOfCloud(mind, i);
    const normal = [mind.normal[i * 3], mind.normal[i * 3 + 1], mind.normal[i * 3 + 2]];
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-4, `the normal of point ${i} is ${Math.hypot(...normal)} long`);
    assert.ok(mind.own[i] >= 0 && mind.own[i] < 1, `point ${i} has ${mind.own[i]} for its own number`);
    owns.add(mind.own[i]);
    if (mind.part[i] !== PART.glass || onRim(mind, i)) continue;
    // The edge of the dome is lit by how far a grain is turned from the eye: one facing inward would glow where the glass is clear.
    assert.ok(at[0] * normal[0] + (at[1] - GLASS.lift) * normal[1] + at[2] * normal[2] > 0, `grain ${i} of the glass faces inward`);
    if (at[1] < -0.5) {
      crown += 1;
      assert.ok(normal[1] < -0.5, `a grain on the crown faces ${normal[1]} up`);
    }
    if (Math.abs(at[0]) > 0.75) {
      flank += 1;
      assert.equal(Math.sign(normal[0]), Math.sign(at[0]), 'a grain on the flank faces across the dome');
    }
  }
  assert.ok(crown > 20 && flank > 20, `crown ${crown}, flank ${flank}`);
  assert.ok(owns.size > mind.count * 0.99, 'the points share their numbers');
});

for (const [which, plan] of PLANS) {
  test(`the constellation is one plan: the five places the work stops at, the largest, and many smaller nodes, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    assert.equal(constellation(plan), constellation(plan), 'it is worked out more than once');
    assert.equal(anchors, 1 + REGIONS.length);
    assert.equal(nodes.length, anchors + plan.nodes);
    assert.deepEqual(nodes[0].at, [...ORCHESTRATOR]);
    REGIONS.forEach((region, i) => assert.deepEqual(nodes[i + 1].at, [...region.centre], `${region.stage} has no node of its own`));
    const rest = nodes.slice(anchors);
    for (const node of rest) assert.ok(node.size >= 0.5 && node.size <= plan.large, `a node of size ${node.size}`);
    assert.equal(nodes[0].size, plan.orchestrator);
    for (const node of nodes.slice(1, anchors)) assert.equal(node.size, plan.stage);
    assert.ok(plan.orchestrator > plan.stage && plan.stage >= plan.large, 'a place the work stops at is smaller than a node between them');
    // A sky has few bright stars.
    const bright = rest.filter((node) => node.size > 1.2).length;
    assert.ok(bright > 5 && bright < rest.length / 3, `${bright} of ${rest.length} nodes are large`);
    for (const node of nodes) assert.ok(Math.abs(Math.hypot(...node.out) - 1) < 1e-12, 'a node does not know which way is out');
  });
}

for (const [which, plan] of PLANS) {
  test(`no two nodes crowd each other, and every one is under the glass and over its rim, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    nodes.forEach((node, i) => {
      assert.ok(reachOf(...node.at) <= plan.outer + 1e-9, `node ${i} is ${reachOf(...node.at)} of the way out to the glass`);
      assert.ok(node.at[1] <= GLASS.floor - plan.above + 1e-9, `node ${i} is at ${node.at[1]}, down by the rim`);
      for (const other of nodes.slice(i + 1)) assert.ok(gap(node.at, other.at) >= plan.apart - 1e-9, `node ${i} is ${gap(node.at, other.at)} from another`);
    });
    // And they fill the dome: there are nodes well out on every side of its middle, and high and low in it.
    for (const [axis, sign] of [[0, -1], [0, 1], [2, -1], [2, 1]]) {
      assert.ok(nodes.some((node) => node.at[axis] * sign > GLASS.round * 0.6), `no node is far out along axis ${axis}, ${sign}`);
    }
    assert.ok(nodes.some((node) => node.at[1] < GLASS.lift - GLASS.tall * 0.6) && nodes.some((node) => node.at[1] > GLASS.floor - 0.15), 'the nodes do not fill the height of the dome');
  });
}

for (const [which, plan] of PLANS) {
  test(`the threads join the whole constellation, sparingly, and none runs close by a third node, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    const pairs = new Set();
    const degree = nodes.map(() => 0);
    const next = nodes.map(() => []);
    for (const thread of threads) {
      assert.notEqual(thread.from, thread.to);
      const pair = [thread.from, thread.to].sort((a, b) => a - b).join('-');
      assert.ok(!pairs.has(pair), `nodes ${pair} are joined twice`);
      pairs.add(pair);
      assert.ok(Math.abs(thread.long - gap(nodes[thread.from].at, nodes[thread.to].at)) < 1e-12, 'a thread is not as long as its nodes are apart');
      assert.ok(thread.glow > 0.6 && thread.glow < 1.4, `a thread ${thread.glow} bright`);
      degree[thread.from] += 1;
      degree[thread.to] += 1;
      next[thread.from].push(thread.to);
      next[thread.to].push(thread.from);
    }
    // Every node can be reached from the orchestrator.
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length > 0) {
      for (const other of next[queue.shift()]) {
        if (reached.has(other)) continue;
        reached.add(other);
        queue.push(other);
      }
    }
    assert.equal(reached.size, nodes.length, 'the constellation is in pieces');
    // A thread between two large nodes is brighter than one between two small: the few stand out from the many.
    const least = (thread) => Math.min(nodes[thread.from].size, nodes[thread.to].size);
    const large = threads.filter((thread) => least(thread) > 1);
    const small = threads.filter((thread) => least(thread) < 0.7);
    assert.ok(large.length > 0 && small.length > large.length, `${large.length} threads join large nodes and ${small.length} small ones`);
    assert.ok(Math.min(...large.map((thread) => thread.glow)) > Math.max(...small.map((thread) => thread.glow)) * 1.15, 'a thread between large nodes is no brighter than one between small ones');
    // Sparing: a constellation, not a mesh.
    const mean = (2 * threads.length) / nodes.length;
    assert.ok(mean > 2.2 && mean < 3.6, `${mean} threads to a node`);
    assert.ok(Math.max(...degree) <= 6, `one node has ${Math.max(...degree)} threads`);
    assert.ok(Math.max(...threads.map((thread) => thread.long)) < plan.apart * 3, 'a thread runs a long way across the dome');
    // A line that passes close by a star it does not join looks like a mistake.
    let nearest = Infinity;
    for (const thread of threads) {
      const a = nodes[thread.from].at;
      const b = nodes[thread.to].at;
      nodes.forEach((node, k) => {
        if (k === thread.from || k === thread.to) return;
        const along = Math.min(1, Math.max(0, [0, 1, 2].reduce((sum, n) => sum + (node.at[n] - a[n]) * (b[n] - a[n]), 0) / thread.long ** 2));
        nearest = Math.min(nearest, gap(node.at, [0, 1, 2].map((n) => a[n] + (b[n] - a[n]) * along)));
      });
    }
    assert.ok(nearest > plan.apart * 0.8, `a thread passes ${nearest} from a node it does not join`);
  });
}

for (const [which, plan] of PLANS) {
  test(`the constellation grows out from the orchestrator, along its threads, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    assert.equal(nodes[0].born, 0);
    assert.ok(Math.abs(Math.max(...nodes.map((node) => node.born)) - 1) < 1e-12, 'the furthest node is not the last');
    const measure = threads[0].span / threads[0].long;
    for (const thread of threads) assert.ok(Math.abs(thread.span / thread.long - measure) < 1e-12, 'the threads are not measured alike');
    nodes.forEach((node, i) => {
      if (i === 0) return;
      const through = threads.filter((thread) => thread.from === i || thread.to === i).map((thread) => ({ other: nodes[thread.from === i ? thread.to : thread.from], span: thread.span }));
      // It is reached along one of its threads, from a node reached before it, and by no slower way than the quickest.
      assert.ok(through.some(({ other, span }) => Math.abs(other.born + span - node.born) < 1e-9), `node ${i} is reached along none of its threads`);
      for (const { other, span } of through) assert.ok(node.born <= other.born + span + 1e-9, `node ${i} could have been reached sooner`);
    });
  });
}

for (const [which, plan] of PLANS) {
  test(`a thread is points set in order from one node to the other, each born as the growing reaches it, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    const fine = buildMind(seeded(42), 4, plan);
    let run = -1; // which thread the last point was on
    let last = 0;
    let lead = 0; // how far along its thread the thread's first point lies
    let seen = 0;
    for (let i = 0; i < fine.count; i += 1) {
      const [when, t, long] = [fine.thread[i * 3], fine.thread[i * 3 + 1], fine.thread[i * 3 + 2]];
      if (fine.part[i] !== PART.thread) {
        assert.deepEqual([when, t, long], [-1, 0, 0], `point ${i} is on no thread, and says it is`);
        continue;
      }
      if (run < 0 || Math.abs(when - threads[run].when) > 1e-6 || t < last) {
        if (run >= 0) assert.ok(seen >= 3, `thread ${run} is drawn with ${seen} points`);
        run += 1;
        last = 0;
        seen = 0;
      }
      const thread = threads[run];
      assert.ok(thread, 'there are more threads in the cloud than in the plan');
      const a = nodes[thread.from];
      const b = nodes[thread.to];
      assert.ok(Math.abs(when - thread.when) < 1e-5 && Math.abs(long - thread.long) < 1e-6, `point ${i} is not on thread ${run}`);
      assert.ok(t > last && t < 1, `point ${i} is ${t} along its thread, after ${last}`);
      // Evenly: a thread is one line, and never a row of beads. Every gap is the first one's, and the first point half a gap in.
      if (seen === 0) lead = t;
      else assert.ok(Math.abs(t - last - 2 * lead) < 1e-5, `point ${i} is ${t - last} after the one before it, and the first is ${lead} from its node`);
      assert.ok(gap(pointOfCloud(fine, i), [0, 1, 2].map((n) => a.at[n] + (b.at[n] - a.at[n]) * t)) < 1e-5, `point ${i} is off its thread`);
      // The growing comes along the thread from whichever end it reaches first.
      assert.ok(Math.abs(fine.born[i] - Math.min(a.born + t * thread.span, b.born + (1 - t) * thread.span)) < 1e-5, `point ${i} is born at ${fine.born[i]}`);
      assert.ok(Math.abs(fine.glow[i] - thread.glow) < 1e-6);
      last = t;
      seen += 1;
    }
    assert.equal(run, threads.length - 1, 'a thread of the plan is not in the cloud');
    // A node is born when the growing reaches it; the glass and the motes are not grown at all.
    const first = fine.count - 2 * nodes.length; // the nodes come last: a light, then its halo
    nodes.forEach((node, k) => {
      for (const [i, kind] of [[first + 2 * k, PART.node], [first + 2 * k + 1, PART.halo]]) {
        assert.equal(fine.part[i], kind);
        assert.ok(gap(pointOfCloud(fine, i), node.at) < 1e-6 && Math.abs(fine.born[i] - node.born) < 1e-6 && Math.abs(fine.glow[i] - node.size) < 1e-6, `node ${k} is not drawn as planned`);
      }
    });
    for (let i = 0; i < fine.count; i += 1) if (fine.part[i] === PART.glass || fine.part[i] === PART.mote) assert.equal(fine.born[i], 0);
  });
}

for (const [which, plan] of PLANS) {
  test(`a signal runs every thread in its own time, and has run it before the time starts again, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    assert.ok(PULSE.every > PULSE.clear && PULSE.speed > 0);
    const starts = new Set();
    for (const thread of threads) {
      assert.ok(thread.when >= 0 && thread.when <= PULSE.every - PULSE.clear, `a signal sets out at ${thread.when}`);
      assert.ok(thread.when + thread.long / PULSE.speed < PULSE.every - 0.5, 'a signal is cut off as the time starts again');
      starts.add(Math.floor(thread.when));
    }
    // They are spread through the time: there is no second in which none sets out, and none in which they all do.
    assert.equal(starts.size, Math.ceil(PULSE.every - PULSE.clear), 'the signals set out in bursts');
  });
}

test('a small picture is given a sparer constellation: fewer nodes, further apart, under the same glass', () => {
  assert.ok(SPARE.nodes < PLAN.nodes / 2 && SPARE.apart > PLAN.apart * 1.3, 'the sparer plan is hardly sparer');
  for (const [name, value] of Object.entries(PLAN)) if (name !== 'nodes' && name !== 'apart') assert.equal(SPARE[name], value, `the sparer plan has another ${name}`);
  const full = constellation();
  const spare = constellation(SPARE);
  assert.equal(constellation(PLAN), full, 'the full plan is the one drawn when none is named');
  assert.equal(constellation(SPARE), spare, 'it is worked out more than once');
  assert.ok(spare.threads.length < full.threads.length / 2, `${spare.threads.length} threads against ${full.threads.length}`);
  // A cloud says which plan it was built from, and the glass over it is the same glass.
  const small = buildMind(seeded(42), 1, SPARE);
  assert.equal(small.plan, SPARE);
  assert.equal(mind.plan, PLAN);
  assert.equal(countOf(small, PART.node), spare.nodes.length);
  assert.equal(countOf(small, PART.glass), countOf(mind, PART.glass));
  const glassOf = (cloud) => [...cloud.at.slice(0, 300)];
  assert.deepEqual(glassOf(small), glassOf(mind), 'the glass over the sparer constellation is another glass');
});

test('the outline of the glass is where the glass ends on the screen, however the mind is turned', () => {
  const { dome, near, far, middle } = glassOutline();
  assert.equal(glassOutline(), glassOutline(), 'it is worked out more than once');
  // One closed curve: over the crown from the left of the rim to the right, and back along the near half of the rim.
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
  assert.ok(same(dome.at(-1), near[0]) && same(near.at(-1), dome[0]), 'the outline is not closed');
  assert.ok(same(far[0], near[0]) && same(far.at(-1), near.at(-1)), 'the far half of the rim does not join the near half');
  const crown = dome[(dome.length - 1) / 2];
  assert.ok(Math.abs(crown[0]) < 1e-9 && crown[1] < middle[1] - 0.4, `the crown of the outline is at ${crown}`);
  dome.forEach((point, n) => {
    const mirror = dome[dome.length - 1 - n];
    assert.ok(Math.abs(point[0] + mirror[0]) < 1e-9 && Math.abs(point[1] - mirror[1]) < 1e-9, 'the outline is not the same on both sides');
  });
  assert.ok(dome[0][0] < -0.5 && dome.at(-1)[0] > 0.5, 'the outline does not run from the left to the right');
  // The near half of the rim hangs below the far half: the rim is seen from above.
  const half = (near.length - 1) / 2;
  assert.ok(near[half][1] > far[half][1] + 0.3 && far[half][1] > crown[1], `the rim's near side is at ${near[half][1]} and its far side at ${far[half][1]}`);

  // No grain of the glass is drawn outside the outline, turned any way, and its grains come right up to it.
  const closed = [...dome, ...near.slice(1, -1)];
  const inside = (x, y) => {
    let within = false;
    for (let i = 0, j = closed.length - 1; i < closed.length; j = i, i += 1) {
      const [xi, yi] = closed[i];
      const [xj, yj] = closed[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) within = !within;
    }
    return within;
  };
  const fine = buildMind(seeded(42), 4);
  const reached = dome.map(() => Infinity); // how near a grain comes to each point of the outline
  for (const yaw of [0, 0.9, 2.3, 4.4]) {
    const view = { yaw, pitch: LOOK.pitch, scale: 1, x: 0, y: 0 };
    for (let i = 0; i < fine.count; i += 1) {
      if (fine.part[i] !== PART.glass) continue;
      const [x, y] = project(fine.at[i * 3], fine.at[i * 3 + 1], fine.at[i * 3 + 2], view);
      // Drawn in by a hundredth toward the middle: a grain on the outline itself is not outside it.
      assert.ok(inside(middle[0] + (x - middle[0]) * 0.99, middle[1] + (y - middle[1]) * 0.99), `a grain of the glass is drawn at ${x}, ${y}, outside the outline (turned ${yaw})`);
      dome.forEach((point, n) => {
        reached[n] = Math.min(reached[n], Math.hypot(point[0] - x, point[1] - y));
      });
    }
  }
  assert.ok(Math.max(...reached) < 0.03, `the outline stands ${Math.max(...reached)} off the glass at one place: it is drawn round something larger`);
  // And every node is inside it: the constellation is under the glass on the screen too.
  for (const node of nodes) {
    const [x, y] = project(...node.at, { yaw: 1.3, pitch: LOOK.pitch, scale: 1, x: 0, y: 0 });
    assert.ok(inside(x, y), `a node is drawn at ${x}, ${y}, outside the glass`);
  }
});

test('a denser cloud is the same constellation drawn finer', () => {
  const dense = buildMind(seeded(42), 4);
  assert.equal(countOf(dense, PART.node), nodes.length);
  assert.equal(countOf(dense, PART.halo), nodes.length);
  for (const kind of [PART.glass, PART.thread, PART.mote]) {
    const times = countOf(dense, kind) / countOf(mind, kind);
    assert.ok(times > 3.6 && times < 4.4, `part ${kind}: ${times} times the points`);
  }
  for (let i = 0; i < dense.count * 3; i += 1) assert.ok(Math.abs(dense.at[i]) < 1.2, `coordinate ${i}: ${dense.at[i]}`);
  for (const none of [0, -1, Number.NaN]) assert.throws(() => buildMind(seeded(42), none), RangeError);
});

test('the motes drift under the glass, and most are faint', () => {
  let faint = 0;
  let motes = 0;
  for (let i = 0; i < mind.count; i += 1) {
    if (mind.part[i] !== PART.mote) continue;
    motes += 1;
    const [x, y, z] = pointOfCloud(mind, i);
    assert.ok(reachOf(x, y, z) < 1 && y <= GLASS.floor + 1e-6, `a mote at ${x}, ${y}, ${z} is not under the glass`);
    assert.ok(mind.glow[i] >= 0.2 && mind.glow[i] <= 1, `a mote ${mind.glow[i]} bright`);
    if (mind.glow[i] < 0.5) faint += 1;
  }
  assert.ok(faint > motes * 0.6, `${faint} of ${motes} motes are faint`);
});

test('the desk lies under the whole mind, and the accounts sit along its near rim', () => {
  let lowest = -Infinity;
  for (let i = 0; i < mind.count; i += 1) lowest = Math.max(lowest, mind.at[i * 3 + 1]);
  assert.ok(Math.abs(lowest - GLASS.floor) < 1e-6, `the mind reaches down to ${lowest}, and its rim is at ${GLASS.floor}`);
  // The glass floats over the desk: clear of it, and not so high that the two come apart.
  assert.ok(DESK.y - lowest > 0.3 && DESK.y - lowest < 0.6, `the desk is ${DESK.y - lowest} under the rim of the glass`);
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

test('the mind is looked at from a little above, so the desk under it is seen as a desk', () => {
  assert.ok(LOOK.pitch > 0.1 && LOOK.pitch < 0.5, `the eye is ${LOOK.pitch} radians above level`);
  const view = { ...LOOK, yaw: 0, scale: 1, x: 0, y: 0 };
  const near = project(...onDesk(0), view);
  const far = project(...onDesk(Math.PI), view);
  assert.ok(near[1] > far[1] + 0.3, 'the near rim of the desk is not below the far rim: the desk is seen edge on');
  assert.ok(far[1] > project(...MIDDLE, view)[1], 'the desk is not under the mind');
  // A desk is wider than what stands over it: turned any way, the mind never overhangs its sides.
  let widest = 0;
  for (let turn = 0; turn < 24; turn += 1) {
    const turned = { ...view, yaw: (turn / 24) * Math.PI * 2 };
    for (let i = 0; i < mind.count; i += 1) widest = Math.max(widest, Math.abs(project(mind.at[i * 3], mind.at[i * 3 + 1], mind.at[i * 3 + 2], turned)[0]));
  }
  const side = Math.max(...Array.from({ length: 96 }, (_, step) => project(...onDesk((step / 96) * Math.PI * 2), view)[0]));
  assert.ok(side > widest * 1.05, `the desk reaches ${side} to the side and the mind ${widest}`);
});

test('the figure fits its frame: the mind, turned any way, and the whole desk are inside it, and it is as large as that allows', () => {
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
      for (let i = 0; i < mind.count; i += 1) take(mind.at[i * 3], mind.at[i * 3 + 1], mind.at[i * 3 + 2], view);
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

test('each stage has its own region under the glass, well out from the middle, on alternate sides, in the floor\'s order', () => {
  assert.deepEqual(REGIONS.map((region) => region.stage), [...STAGES]);
  REGIONS.forEach((region, i) => {
    assert.equal(Math.sign(region.centre[0]), i % 2 ? 1 : -1, `${region.stage} is on the wrong side`);
    assert.ok(gap(region.centre, MIDDLE) > 0.45, `${region.stage} is not well out from the middle`);
    // Under the glass with room to spare: a job sits a little out from the middle of its region, and must not be drawn outside the dome.
    assert.ok(reachOf(...region.centre) > 0.7 && reachOf(...region.centre) < 0.86, `${region.stage} is ${reachOf(...region.centre)} of the way out to the glass`);
    assert.ok(region.centre[1] < GLASS.floor - region.radius, `${region.stage} is down by the rim`);
    assert.ok(Math.abs(Math.hypot(...region.out) - 1) < 1e-12 && region.out[0] * region.centre[0] + region.out[2] * region.centre[2] > 0, `${region.stage} does not know which way is out`);
    for (const other of REGIONS.slice(i + 1)) assert.ok(gap(region.centre, other.centre) > 2 * region.radius, `${region.stage} overlaps ${other.stage}`);
  });
  assert.equal(centreOf(-1), ORCHESTRATOR);
  assert.throws(() => centreOf(4), RangeError);
});

for (const [which, plan] of PLANS) {
  test(`every region lights the constellation round its stage, and never the glass over it, ${which}`, () => {
    const { nodes, threads, anchors } = constellation(plan);
    const mind = buildMind(seeded(42), 1, plan);
    const owner = regionOfPoints(mind);
    const lit = [0, 0, 0, 0];
    owner.forEach((r, i) => {
      if (r < 0) return;
      lit[r] += 1;
      assert.ok(mind.part[i] !== PART.glass && mind.part[i] !== PART.mote, `point ${i}, of the glass or adrift under it, is lit by the work`);
      assert.ok(gap(pointOfCloud(mind, i), REGIONS[r].centre) < REGIONS[r].radius * 1.9, `point ${i} is lit by a region it is not in`);
    });
    for (const [r, count] of lit.entries()) assert.ok(count > 25 && count < 600, `${STAGES[r]} lights ${count} points`);
    // Each stage's own node is lit by it, light and halo.
    const first = mind.count - 2 * nodes.length;
    REGIONS.forEach((region, r) => assert.deepEqual([owner[first + 2 * (r + 1)], owner[first + 2 * (r + 1) + 1]], [r, r], `${region.stage}'s own node is not in its region`));
    // A cloud that does not say what its points are part of is lit by where they are alone.
    assert.deepEqual([...regionOfPoints({ count: 2, at: new Float32Array([...REGIONS[2].centre, 0, GLASS.lift - GLASS.tall, 0]) })], [2, -1]);
  });
}

test('a job keeps its own spot in a region, close to the middle of it', () => {
  for (let place = 0; place < 4; place += 1) {
    const spots = [1, 2, 3, 4, 5].map((id) => spot(place, id));
    assert.deepEqual(spot(place, 3), spots[2], 'the same job, the same spot');
    for (const each of spots) assert.ok(gap(each, REGIONS[place].centre) < REGIONS[place].radius + 0.05);
    assert.ok(new Set(spots.map((each) => each.join())).size === 5, 'two jobs share a spot');
  }
  assert.equal(spot(-1, 9), ORCHESTRATOR);
});

test('a signal\'s path starts and ends where it should, and bows out from the middle of the mind', () => {
  const a = REGIONS[0].centre;
  const b = REGIONS[1].centre;
  assert.ok(gap(along(a, b, 0), a) < 1e-9);
  assert.ok(gap(along(a, b, 1), b) < 1e-9);
  const halfway = along(a, b, 0.5);
  const straight = a.map((part, i) => (part + b[i]) / 2);
  assert.ok(gap(halfway, MIDDLE) > gap(straight, MIDDLE) + 0.05, 'the path cuts through the middle of the mind');
});

test('a job of every kind moves smoothly through the mind: no jump from one frame to the next', () => {
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
  assert.ok(last.radius > 2, 'the wave never crosses the whole mind');
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
  // turned by `project`. If the two disagreed, the lights would drift off the mind as it turned.
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

test('the names stand clear of the mind: no point of it, turned any way, is outside the plate they keep off', () => {
  const cortex = buildMind(undefined, 2);
  const P = [0, 0, 0, 0];
  let worst = 0;
  for (let turn = 0; turn < 36; turn += 1) {
    const view = { yaw: (turn / 36) * TAU, pitch: LOOK.pitch, scale: 1, x: 0, y: 0 };
    for (let i = 0; i < cortex.count; i += 1) {
      project(cortex.at[i * 3], cortex.at[i * 3 + 1], cortex.at[i * 3 + 2], view, P);
      worst = Math.max(worst, Math.hypot(P[0] / PLATE.across, (P[1] - PLATE.low) / PLATE.down));
    }
  }
  assert.ok(worst < 1, `a point of the mind is ${worst} of the way out to the plate's edge`);
  // And not so large that a name is pushed off what it names.
  assert.ok(worst > 0.9, `the plate is loose: the mind reaches only ${worst} of the way to its edge`);
});

test('the edge of the glass is where its surface turns side-on', () => {
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
