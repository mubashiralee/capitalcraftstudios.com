// The seal's stone is dropped onto the finished plate.
// Run with: node --test tests/
//
// The owner's brief, 15 November 2026: "someone drops it from above and it
// wobbles and circles and then falls into place at the very end", "it is
// dropped at the very end ... when the pattern is done", and then, of the first
// drop, which was drawn by hand: "Physics of the drop needs to be improved".
//
// So js/drop.js no longer draws the drop: it works it out. A stone disc is let
// go above a sheet of paper and followed, a twelve-thousandth of a second at a
// time, under gravity, the paper's push and its friction. These tests hold that
// working-out to what is known of such things: a thing let go falls as the
// square of the time; nothing gains energy from being dropped; paper is solid;
// and a disc wobbling down on its rim goes round faster the less it leans, at
// the rate worked out for Euler's disk.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { STONE, TAKES, WORLD, castDrop, judge, letGo, lifted, silhouette } from '../js/drop.js';
import { PLATE, deriveEdition } from '../js/edition.js';
import { CAMERA_DISTANCE, TILT } from '../js/plate.js';

const TAU = 2 * Math.PI;
const RELEASE = Object.freeze({ lean: [0, -0.2], spin: 9, tumble: [3, -2], drift: [0.04, -0.03] });

/** The way the stone's face looks, from a moment of a fall's track. */
function faceOf(track, index) {
  const at = index * 7;
  const [qw, qx, qy, qz] = [track[at + 3], track[at + 4], track[at + 5], track[at + 6]];
  return [2 * (qx * qz + qw * qy), 2 * (qy * qz - qw * qx), 1 - 2 * (qx * qx + qy * qy)];
}

/** A pose's three axes, as three vectors. */
const axesOf = (pose) => [0, 1, 2].map((column) => [pose.axes[3 * column], pose.axes[3 * column + 1], pose.axes[3 * column + 2]]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How far round, in turns, the stone's lean goes between two moments of a drop (the way it goes is the sign). */
function circled(drop, from, to, step = 1 / 480) {
  let turns = 0;
  let last = null;
  for (let time = from; time <= to; time += step) {
    const [, , face] = axesOf(drop.at(time));
    if (Math.hypot(face[0], face[1]) < 0.03) continue;
    const way = Math.atan2(face[1], face[0]);
    if (last !== null) {
      let turned = way - last;
      turned -= TAU * Math.round(turned / TAU);
      turns += turned / TAU;
    }
    last = way;
  }
  return turns;
}

const deals = [
  { take: 0, turn: 0, way: 1 },
  { take: 0.37, turn: 0.6, way: -1 },
  { take: 0.71, turn: -0.8, way: 1 },
  { take: 0.999, turn: 0.25, way: -1 },
];

test('the stone is the seal itself: as wide as its seat, and thin', () => {
  assert.equal(STONE.radius, PLATE.seal);
  assert.ok(STONE.thick > 0.02 && STONE.thick < 0.05, `the stone is ${STONE.thick} thick`);
});

test('let go, it falls as anything falls: from rest, as the square of the time, and drifts the way it was going', () => {
  const fall = letGo(RELEASE);
  assert.ok(fall.landed > 0.5 && fall.landed < 0.9, `it lands after ${fall.landed.toFixed(3)} seconds`);
  const { height, gravity } = WORLD;
  let checked = 0;
  for (let index = 0; index * fall.every < fall.landed; index += 1) {
    const time = index * fall.every;
    const at = index * 7;
    assert.ok(Math.abs(fall.track[at + 2] - (height - 0.5 * gravity * time * time)) < 1e-3, `at ${time.toFixed(3)} it is ${fall.track[at + 2]} high`);
    assert.ok(Math.abs(fall.track[at] - RELEASE.drift[0] * time) < 1e-9 && Math.abs(fall.track[at + 1] - RELEASE.drift[1] * time) < 1e-9);
    checked += 1;
  }
  assert.ok(checked > 100, 'the fall was watched all the way down');
  // It lands when its lowest point reaches the paper, and not before.
  const index = Math.floor(fall.landed / fall.every);
  const face = faceOf(fall.track, index);
  const lowest = fall.track[index * 7 + 2] - (STONE.thick / 2) * Math.abs(face[2]) - STONE.radius * Math.hypot(face[0], face[1]);
  assert.ok(lowest > -1e-3 && lowest < 0.04, `one moment before it lands, its lowest point is ${lowest} above the paper`);
});

test('nothing is gained by being dropped: the stone\'s energy only ever runs down', () => {
  for (const release of [RELEASE, ...TAKES]) {
    const { energy, count } = letGo(release, { ...WORLD, audit: true });
    // What it starts with: its height, and the little it was given by the hand that let it go.
    const across = STONE.radius ** 2 / 4 + STONE.thick ** 2 / 12;
    const about = STONE.radius ** 2 / 2;
    const given = 0.5 * (release.drift[0] ** 2 + release.drift[1] ** 2) + 0.5 * (across * (release.tumble[0] ** 2 + release.tumble[1] ** 2) + about * release.spin ** 2);
    assert.ok(Math.abs(energy[0] - (WORLD.gravity * WORLD.height + given)) < 1e-9, `it starts with ${energy[0]}`);
    let least = energy[0];
    for (let index = 1; index < count; index += 1) {
      // Some slack while it is driven into the paper: the sums are done in steps, and a step is not infinitely short.
      assert.ok(energy[index] <= least * 1.05 + 0.01, `at moment ${index} its energy is ${energy[index]}, more than the ${least} it had`);
      least = Math.min(least, energy[index]);
    }
    // At rest, all that is left is the height of its own middle above the paper.
    assert.ok(Math.abs(energy[count - 1] - WORLD.gravity * (STONE.thick / 2)) < 1e-3, `it ends with ${energy[count - 1]}`);
  }
});

test('paper is solid: the stone never sinks into it by more than a hair', () => {
  for (const release of [RELEASE, ...TAKES]) {
    const fall = letGo(release);
    assert.ok(fall.deepest > 0, 'it did touch the paper');
    assert.ok(fall.deepest < 0.004, `its rim went ${fall.deepest} into the paper`);
  }
});

test('whatever way up it is let go, it ends lying on the paper, not through it', () => {
  // Thrown down hard on its edge, or upside down: both rims bear on the paper.
  for (const release of [
    { lean: [0.9, 0.3], spin: 2, tumble: [6, -9], drift: [0, 0] },
    { lean: [0, 0], spin: 0, tumble: [14, 0], drift: [0.2, 0] },
    { lean: [-0.5, 0.5], spin: -25, tumble: [-8, 11], drift: [0, -0.3] },
  ]) {
    const fall = letGo(release, { ...WORLD, longest: 12 });
    assert.ok(fall.rested > 0, 'it comes to rest');
    assert.ok(fall.deepest < 0.006, `it went ${fall.deepest} into the paper`);
    const last = (fall.count - 1) * 7;
    const face = faceOf(fall.track, fall.count - 1);
    assert.ok(Math.abs(Math.abs(face[2]) - 1) < 1e-4, 'it lies flat, one face or the other up');
    assert.ok(Math.abs(fall.track[last + 2] - STONE.thick / 2) < 1e-4, `its middle rests ${fall.track[last + 2]} above the paper`);
  }
});

test('once down it wobbles round on its rim as a spun coin does: the less it leans, the faster its lean goes round (Euler\'s disk)', () => {
  // A disc rolling round on its rim, leaning by an angle a, goes round at a rate W
  // with W^2 sin(a) = 4 g / radius. Nothing in js/drop.js says so: it has to come
  // out of the forces. Each take is checked over the heart of its wobble.
  for (const release of TAKES) {
    const fall = letGo(release);
    const from = Math.ceil((fall.landed + 0.45) / fall.every);
    let turned = 0;
    let owed = 0;
    let last = null;
    let first = 0;
    let latest = 0;
    for (let index = from; index < fall.count; index += 1) {
      const face = faceOf(fall.track, index);
      const lean = Math.hypot(face[0], face[1]);
      if (lean < 0.05) break; // too flat to tell which way it leans
      const way = Math.atan2(face[1], face[0]);
      if (last !== null) {
        let step = way - last;
        step -= TAU * Math.round(step / TAU);
        turned += step;
        owed += Math.sqrt((4 * WORLD.gravity) / (STONE.radius * lean)) * fall.every;
        latest = lean;
      } else first = lean;
      last = way;
    }
    assert.ok(Math.abs(turned) > 3 * TAU, `the wobble went round ${(Math.abs(turned) / TAU).toFixed(1)} times while it was watched`);
    assert.ok(latest < first, 'and it leaned less at the end than at the start');
    const ratio = Math.abs(turned) / owed;
    assert.ok(ratio > 0.8 && ratio < 1.2, `it went round ${ratio.toFixed(2)} times as fast as Euler's disk does`);
  }
});

test('every take in the book is a drop worth watching: a clack, a long wobble round, and stillness', () => {
  assert.ok(TAKES.length >= 12, `there are ${TAKES.length} takes`);
  const seen = new Set();
  for (const release of TAKES) {
    seen.add(JSON.stringify(release));
    const told = judge(letGo(release));
    const where = JSON.stringify(release);
    // Never near going over, in the air or on the paper: its face is always the side that shows.
    assert.ok(told.tipped > 0.65, `${where}: the least its face looks up is ${told.tipped.toFixed(2)}`);
    assert.ok(told.rest > 1.6 && told.rest < 2.4, `${where}: it is still ${told.rest.toFixed(2)} seconds after it lands`);
    assert.ok(told.wobble > 1, `${where}: it wobbles for ${told.wobble.toFixed(2)} seconds`);
    assert.ok(Math.abs(told.turns) >= 6.5, `${where}: its lean goes round ${told.turns.toFixed(1)} times`);
    assert.ok(told.oneWay > 0.97, `${where}: it goes round one way (${told.oneWay.toFixed(2)})`);
    assert.ok(told.rock < 0.3, `${where}: it wobbles round rather than rocking to and fro (${told.rock.toFixed(2)})`);
    assert.ok(told.bounce < 0.08, `${where}: it does not leap back up (${told.bounce.toFixed(3)})`);
    // Once down it rears up by something between a quarter and a half of a right angle: a blow, not a tap and not a tumble.
    assert.ok(told.peak > 0.45 && told.peak < 0.7, `${where}: it rears up to a lean of ${told.peak.toFixed(2)}`);
    assert.ok(told.strays < 0.3, `${where}: it ends ${told.strays.toFixed(2)} from where it landed`);
    assert.ok(told.rest - told.hush < 0.4, `${where}: once flat it is soon still`);
  }
  assert.equal(seen.size, TAKES.length, 'no take is in the book twice');
});

test('a take is sturdy: let go a hair differently, it is still much the same drop', () => {
  // The arithmetic is the same in every browser, so a take is the same drop
  // everywhere. This is the margin: were some engine to round one sum another
  // way, the drop would still be a good one.
  for (const release of TAKES) {
    const told = judge(letGo(release));
    for (const hair of [1e-9, -1e-9, 1e-6, -1e-6]) {
      const near = judge(letGo({
        lean: [release.lean[0] + hair, release.lean[1] - hair],
        spin: release.spin + hair,
        tumble: [release.tumble[0] - hair, release.tumble[1] + hair],
        drift: release.drift,
      }));
      const where = `${JSON.stringify(release)} nudged by ${hair}`;
      assert.ok(near.tipped > 0.65 && near.rest > 1.6 && near.rest < 2.4, `${where}: still lands and settles`);
      assert.ok(Math.abs(near.turns - told.turns) < 0.5, `${where}: goes round ${near.turns.toFixed(1)} times, not ${told.turns.toFixed(1)}`);
      assert.ok(Math.abs(near.rest - told.rest) < 0.05, `${where}: still in ${near.rest.toFixed(2)}, not ${told.rest.toFixed(2)}`);
    }
  }
});

test('before it is let go there is no stone; it comes into view as it starts to fall', () => {
  for (const deal of deals) {
    const drop = castDrop(deal);
    assert.equal(drop.at(-5).present, 0);
    assert.equal(drop.at(0).present, 0);
    assert.ok(drop.at(0.03).present > 0 && drop.at(0.03).present < 1);
    assert.equal(drop.at(0.2).present, 1);
    assert.ok(drop.at(0.01).z > 2, `it is let go ${drop.at(0.01).z.toFixed(2)} above the paper: well above the plate`);
    assert.ok(drop.lands > 0.5 && drop.lands < 0.9 && drop.rests > drop.lands + 1.6 && drop.rests < drop.lands + 2.5);
  }
});

test('it falls into place at the very end: flat, square in its seat, the mark upright, to the last decimal', () => {
  for (const deal of deals) {
    const drop = castDrop(deal);
    for (const time of [drop.rests, drop.rests + 0.3, drop.rests + 60, Infinity]) {
      const pose = drop.at(time);
      assert.deepEqual([pose.present, pose.x, pose.y, pose.z], [1, 0, 0, 0], `at ${time} the stone is in its seat`);
      assert.deepEqual([...pose.axes], [1, 0, 0, 0, 1, 0, 0, 0, 1], 'and stands square to the plate, its mark upright');
    }
    // It was already as good as there: no snap at the end.
    const nearly = drop.at(drop.rests - 0.004);
    assert.ok(Math.hypot(nearly.x, nearly.y, nearly.z) < 1e-3, `a moment before, it is ${Math.hypot(nearly.x, nearly.y, nearly.z)} from its seat`);
    nearly.axes.forEach((value, index) => assert.ok(Math.abs(value - [1, 0, 0, 0, 1, 0, 0, 0, 1][index]) < 2e-3));
    // And it had to come there from somewhere else.
    const landing = drop.at(drop.lands);
    assert.ok(Math.hypot(landing.x, landing.y) > 0.02, `it lands ${Math.hypot(landing.x, landing.y).toFixed(3)} from its seat`);
  }
});

test('nothing about it jumps, from the moment it is let go to the moment it is still', () => {
  for (const deal of deals) {
    const drop = castDrop(deal);
    const step = 1 / 2400;
    let before = drop.at(step);
    for (let time = 2 * step; time < drop.rests + 0.05; time += step) {
      const pose = drop.at(time);
      assert.ok(Math.hypot(pose.x - before.x, pose.y - before.y, pose.z - before.z) < 0.006, `it jumps at ${time.toFixed(4)}`);
      for (let index = 0; index < 9; index += 1) {
        assert.ok(Math.abs(pose.axes[index] - before.axes[index]) < 0.05, `it jumps round at ${time.toFixed(4)}`);
      }
      before = pose;
    }
  }
});

test('its axes are always a true turn of the plate\'s: square to one another, of length one, right-handed', () => {
  for (const deal of deals) {
    const drop = castDrop(deal);
    for (let time = 0.05; time < drop.rests; time += 0.0371) {
      const [right, up, face] = axesOf(drop.at(time));
      for (const [a, b, want] of [[right, right, 1], [up, up, 1], [face, face, 1], [right, up, 0], [right, face, 0], [up, face, 0]]) {
        assert.ok(Math.abs(dot(a, b) - want) < 1e-6, `at ${time.toFixed(3)} the axes are not square`);
      }
      const cross = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
      assert.ok(Math.hypot(cross[0] - face[0], cross[1] - face[1], cross[2] - face[2]) < 1e-6);
    }
  }
});

test('the stone is always on or above the paper, wherever its drop has it', () => {
  for (const deal of deals) {
    const drop = castDrop(deal);
    for (let time = 0.01; time < drop.rests + 0.1; time += 1 / 600) {
      const pose = drop.at(time);
      const [, , face] = axesOf(pose);
      // pose.z is the middle of its underside; its lowest point is the low side of a rim.
      const lowest = pose.z + Math.min(0, STONE.thick * face[2]) - STONE.radius * Math.hypot(face[0], face[1]);
      assert.ok(lowest > -0.004, `at ${time.toFixed(3)} its lowest point is ${lowest} under the paper`);
    }
  }
});

test('it circles the way the plate turns, and a plate that turns the other way gets the mirror image', () => {
  for (const take of [0, 0.3, 0.6, 0.95]) {
    const one = castDrop({ take, turn: 0.4, way: 1 });
    const other = castDrop({ take, turn: -0.4, way: -1 });
    assert.ok(circled(one, one.lands + 0.3, one.rests) > 5, 'this way round ...');
    assert.ok(circled(other, other.lands + 0.3, other.rests) < -5, '... and that');
    for (const time of [0.2, one.lands + 0.1, one.lands + 0.6, one.rests - 0.3]) {
      const here = one.at(time);
      const there = other.at(time);
      assert.ok(Math.abs(here.x + there.x) < 1e-9 && Math.abs(here.y - there.y) < 1e-9 && Math.abs(here.z - there.z) < 1e-9, 'left for right');
      const [, , face] = axesOf(here);
      const [, , mirrored] = axesOf(there);
      assert.ok(Math.abs(face[0] + mirrored[0]) < 1e-6 && Math.abs(face[1] - mirrored[1]) < 1e-6 && Math.abs(face[2] - mirrored[2]) < 1e-6);
    }
  }
});

test('each edition turns its take to an angle of its own: the same drop, seen from round the side', () => {
  const straight = castDrop({ take: 0.5, turn: 0, way: 1 });
  const turned = castDrop({ take: 0.5, turn: 0.7, way: 1 });
  const [cos, sin] = [Math.cos(0.7), Math.sin(0.7)];
  for (const time of [0.1, straight.lands, straight.lands + 0.2, straight.lands + 0.9, straight.rests - 0.2]) {
    const a = straight.at(time);
    const b = turned.at(time);
    assert.ok(Math.abs(b.x - (cos * a.x - sin * a.y)) < 1e-9 && Math.abs(b.y - (sin * a.x + cos * a.y)) < 1e-9 && Math.abs(b.z - a.z) < 1e-9);
    const [, , face] = axesOf(a);
    const [, , faceTurned] = axesOf(b);
    assert.ok(Math.abs(faceTurned[0] - (cos * face[0] - sin * face[1])) < 1e-6 && Math.abs(faceTurned[1] - (sin * face[0] + cos * face[1])) < 1e-6);
  }
  assert.equal(turned.rests, straight.rests);
});

test('the same edition always gets the same drop, and the book is dealt from end to end', () => {
  const again = castDrop(deals[1]);
  const first = castDrop(deals[1]);
  for (const time of [0.3, 0.9, 1.4, 2.1]) assert.deepEqual(first.at(time), again.at(time));

  // Two takes may come to rest in the same frame, so they are told apart by how the stone
  // lies a second after it is let go, in the thick of its wobble.
  const seen = new Set();
  for (let index = 0; index < TAKES.length; index += 1) {
    seen.add(Array.from(castDrop({ take: (index + 0.5) / TAKES.length, turn: 0, way: 1 }).at(1).axes).join());
  }
  assert.equal(seen.size, TAKES.length, 'each share of the book is a take of its own');

  let dealt = new Set();
  for (let number = 0; number < 400; number += 1) {
    const { drop, spin } = deriveEdition(`CC26-KQX-${String(100000 + number * 977).slice(0, 6)}`);
    assert.ok(drop.take >= 0 && drop.take < 1, `take ${drop.take}`);
    assert.ok(Math.abs(drop.turn) <= 0.9, `turn ${drop.turn}`);
    dealt.add(Math.floor(drop.take * TAKES.length));
    assert.ok(spin === 1 || spin === -1);
  }
  assert.equal(dealt.size, TAKES.length, 'four hundred editions between them use every take');
});

test('until it is still there is no flash of light; then the light crosses it once', () => {
  const drop = castDrop(deals[0]);
  assert.equal(drop.at(drop.lands).glint, 0);
  assert.equal(drop.at(drop.rests - 0.01).glint, 0);
  assert.equal(drop.at(drop.rests).glint, 0);
  const half = drop.at(drop.rests + 0.35).glint;
  assert.ok(half > 0.4 && half < 0.6, `half way through, the light is ${half} of the way across`);
  assert.equal(drop.at(drop.rests + 0.75).glint, 1);
  assert.equal(drop.at(Infinity).glint, 1);
});

test('taken away again, it rises off the paper where it lies and is gone', () => {
  const drop = castDrop(deals[2]);
  for (const time of [drop.lands + 0.5, Infinity]) {
    const pose = drop.at(time);
    assert.deepEqual(lifted(pose, 0), pose);
    let before = pose;
    for (const share of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const up = lifted(pose, share);
      assert.ok(up.z > before.z, 'it only goes up');
      assert.deepEqual([up.x, up.y, [...up.axes]], [pose.x, pose.y, [...pose.axes]], 'straight up, turned as it was');
      assert.ok(up.present <= before.present);
      before = up;
    }
    assert.ok(lifted(pose, 0.4).present === pose.present, 'it is whole for the first part of the lift');
    assert.equal(lifted(pose, 1).present, 0);
    assert.ok(lifted(pose, 1).z > 2, 'by then it is high above the plate');
    assert.equal(lifted(pose, 7).present, 0);
  }
});

// ---- Where it shows on the page ----
//
// On a phone the page's words stand above the plate, and the stone falls past
// them. The owner's page was photographed frame by frame: let go from 2.6 plate
// radii up, the stone came into being in mid-air under the page's header, and
// then fell behind the headline and the buttons. So it is let go from higher,
// beyond the top of every page, and js/main.js draws it again in front of the
// words, cut to its own outline: silhouette() is that outline.

/**
 * Where a point over the plate shows on the screen, in plate radii from the
 * plate's middle, x to the right and y up: the camera of js/plate.js, laid
 * back by `tilt`.
 */
function onScreen(tilt) {
  const sin = Math.sin(tilt);
  const cos = Math.cos(tilt);
  return (x, y, z) => {
    const scale = CAMERA_DISTANCE / (CAMERA_DISTANCE - (z * cos - y * sin)); // nearer the eye, larger
    return [x * scale, (y * cos + z * sin) * scale];
  };
}

test('it is let go beyond the top of the page, on a phone as on a desk, so it always comes in over the page\'s edge', () => {
  // How far above the plate's middle the page's top edge is, in plate radii, on the pages that show
  // most above their plate. Measured on the page itself: 1.24 at 1440 x 900 and 1.26 at 1280 x 720
  // (the wide layout); 3.11 at 390 x 844, 2.76 at 820 x 1180 and 3.60 at 360 x 640 (the narrow one).
  const TOP = { wide: 1.3, narrow: 3.65 };
  for (let index = 0; index < TAKES.length; index += 1) {
    for (const way of [-1, 1]) {
      for (const turn of [-0.9, 0, 0.9]) {
        const letGoAt = castDrop({ take: (index + 0.5) / TAKES.length, turn, way }).at(0);
        for (const layout of ['wide', 'narrow']) {
          const corners = silhouette(letGoAt, onScreen(TILT[layout]));
          assert.ok(corners.length >= 4, `an outline of ${corners.length} corners is no outline`);
          const lowest = Math.min(...corners.map(([, y]) => y));
          assert.ok(lowest > TOP[layout],
            `take ${index}, way ${way}, turn ${turn}: on a ${layout} page its lowest edge is only ${lowest} radii up as it is let go`);
        }
      }
    }
  }
});

test('its outline as something sees it: from above a circle that just holds it, from the side a slab', () => {
  const lying = castDrop(deals[0]).at(Infinity);
  const above = silhouette(lying, (x, y) => [x, y]);
  assert.equal(above.length, 32, 'a corner for each of its thirty-two sides');
  above.forEach(([x, y], index) => {
    const [nextX, nextY] = above[(index + 1) % above.length];
    assert.ok(Math.abs(Math.hypot(x, y) - STONE.radius / Math.cos(Math.PI / 32)) < 1e-9, 'its corners stand just outside the stone');
    assert.ok(Math.abs(Math.hypot((x + nextX) / 2, (y + nextY) / 2) - STONE.radius) < 1e-9, 'and its sides touch the stone\'s rim');
  });

  const side = silhouette(lying, (x, y, z) => [x, z]);
  assert.equal(side.length, 4, 'a slab has four corners');
  const across = side.map(([x]) => x);
  const up = side.map(([, z]) => z);
  assert.ok(Math.abs(Math.min(...across) + STONE.radius) < 1e-9 && Math.abs(Math.max(...across) - STONE.radius) < 1e-9, `it is ${across} across`);
  assert.ok(Math.abs(Math.min(...up)) < 1e-9 && Math.abs(Math.max(...up) - STONE.thick) < 1e-9, `and stands ${up}`);
});

test('its outline goes once round, never turns inward, and holds every point of the stone', () => {
  const drop = castDrop(deals[2]);
  for (const layout of ['wide', 'narrow']) {
    const project = onScreen(TILT[layout]);
    for (const time of [0, 0.3, 0.7, drop.lands + 0.05, drop.lands + 0.5, drop.rests]) {
      const pose = drop.at(time);
      const corners = silhouette(pose, project);
      assert.ok(corners.length >= 4, `${corners.length} corners at ${time}s`);
      const turnAt = (index) => {
        const [a, b, c] = [0, 1, 2].map((step) => corners[(index + step) % corners.length]);
        return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      };
      const way = Math.sign(turnAt(0));
      assert.notEqual(way, 0);
      for (let index = 0; index < corners.length; index += 1) {
        assert.equal(Math.sign(turnAt(index)), way, `corner ${index} at ${time}s turns the other way`);
      }

      const [e1, e2, face] = axesOf(pose);
      for (const lift of [0, STONE.thick]) {
        for (let step = 0; step < 180; step += 1) {
          const angle = (step / 180) * TAU;
          const [c, s] = [STONE.radius * Math.cos(angle), STONE.radius * Math.sin(angle)];
          const [px, py] = project(
            pose.x + e1[0] * c + e2[0] * s + face[0] * lift,
            pose.y + e1[1] * c + e2[1] * s + face[1] * lift,
            pose.z + e1[2] * c + e2[2] * s + face[2] * lift,
          );
          corners.forEach((from, index) => {
            const to = corners[(index + 1) % corners.length];
            const side = (to[0] - from[0]) * (py - from[1]) - (to[1] - from[1]) * (px - from[0]);
            assert.ok(side * way > -1e-9, `at ${time}s a point of its rim lies ${side * way} outside its outline`);
          });
        }
      }
    }
  }
});

test('a drop that goes wrong is said out loud, and the stone is simply set in its seat', () => {
  const said = [];
  const loud = console.error;
  console.error = (...words) => said.push(words.join(' '));
  let drop;
  try {
    drop = castDrop(deals[0], { ...WORLD, longest: 0.9 }); // too short a time for any stone to come to rest
  } finally {
    console.error = loud;
  }
  assert.equal(said.length, 1);
  assert.match(said[0], /did not come to rest/);
  assert.equal(drop.at(0).present, 0);
  const pose = drop.at(drop.rests + 1);
  assert.deepEqual([pose.present, pose.x, pose.y, pose.z, pose.glint], [1, 0, 0, 0, 1]);
  assert.deepEqual([...pose.axes], [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  for (let time = 0.01; time < 1; time += 0.05) {
    const set = drop.at(time);
    assert.deepEqual([set.x, set.y, set.z], [0, 0, 0], 'it does not move: it is only brought into view');
  }
});

test('what is not a number, or not a deal, is refused', () => {
  const drop = castDrop(deals[0]);
  assert.throws(() => drop.at(NaN), RangeError);
  assert.throws(() => drop.at('1'), RangeError);
  assert.throws(() => castDrop({ take: 1, turn: 0, way: 1 }), RangeError);
  assert.throws(() => castDrop({ take: -0.1, turn: 0, way: 1 }), RangeError);
  assert.throws(() => castDrop({ take: 0.5, turn: Infinity, way: 1 }), RangeError);
  assert.throws(() => castDrop({ take: 0.5, turn: 0, way: 0 }), RangeError);
  assert.throws(() => lifted(drop.at(1), NaN), RangeError);
  assert.throws(() => letGo({ lean: [0.9, 0.9], spin: 0, tumble: [0, 0], drift: [0, 0] }), RangeError);
});
