// The bodies on the hero's orbits (js/site.config.js, js/bodies.js): every
// product on the page rides one, each body links to something real, and
// bodies that share an orbit are spaced evenly round it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { BODY, ROOM, glintToward, seatBodies, showBodies } from '../js/bodies.js';
import { PLATE } from '../js/edition.js';
import { SITE } from '../js/site.config.js';

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/site.css', import.meta.url), 'utf8');

test('every product on the page rides an orbit, marked as a jewel', () => {
  const products = [...page.matchAll(/<section class="sheet[^"]*" id="([^"]+)" data-chapter="work"/g)].map((match) => `#${match[1]}`);
  assert.ok(products.length >= 4, `only ${products.length} products found on the page`);
  for (const target of products) {
    const body = SITE.bodies.find((each) => each.target === target);
    assert.ok(body, `${target} has no body on the orbits`);
    assert.ok(body.gem, `${target} rides as a plain ring, not a jewel`);
  }
});

test('each body links to something on the page, and each jewel has its colours', () => {
  for (const body of SITE.bodies) {
    assert.ok(page.includes(`id="${body.target.slice(1)}"`), `${body.label} links to ${body.target}, which is not on the page`);
    if (body.gem) assert.match(css, new RegExp(`\\.body--gem-${body.gem} \\{[^}]*--gem:[^}]*--gem-deep:`), `${body.label}'s jewel has no colours`);
  }
});

test('bodies that share an orbit are spaced evenly round it', () => {
  const seats = seatBodies(SITE.bodies, PLATE.orbits.length);
  assert.equal(seats.length, SITE.bodies.length);
  for (let orbit = 0; orbit < PLATE.orbits.length; orbit += 1) {
    const shares = seats.filter((seat) => seat.orbit === orbit).map((seat) => seat.share);
    // Four ride a quarter turn apart: on the smallest phone that is still about 180 px between them,
    // more than a name is long (16 November 2026, measured with .handoff/checks/orb-sim.mjs).
    assert.ok(shares.length <= 4, `orbit ${orbit} carries ${shares.length} bodies: they would crowd`);
    shares.forEach((share, i) => assert.ok(Math.abs(share - i / shares.length) < 1e-12, `orbit ${orbit}: ${shares}`));
  }
  assert.deepEqual(seatBodies([{ orbit: 1 }, { orbit: 0 }, { orbit: 1 }, { orbit: 1 }], 2), [
    { orbit: 1, share: 0 },
    { orbit: 0, share: 0 },
    { orbit: 1, share: 1 / 3 },
    { orbit: 1, share: 2 / 3 },
  ]);
});

test('the products ride the innermost orbit, and nothing rides beyond the third', () => {
  // The nearer in an orbit is, the more of it lies on the stage. Measured 16 November 2026 with
  // .handoff/checks/orb-sim.mjs (six editions, twenty minutes each): at 1440 x 900 a body on the
  // innermost orbit is in view 82% of the time, on the second 49%, on the third 30%, on the fourth
  // 21% and on the fifth 5%; on a 390 px phone 45%, 9%, 2%, 0% and 0%.
  // With two products on the innermost orbit and two on the second, as it was, 2.61 products were
  // in view at once at 1440 x 900 and 1.12 on the phone, where a quarter of the time there was
  // none at all. With all four on the innermost it is 3.27 and 1.80, and there is never none.
  const innermost = PLATE.orbits.indexOf(Math.min(...PLATE.orbits));
  assert.equal(innermost, 0, 'the orbits are listed from the innermost out');
  for (const body of SITE.bodies) {
    if (body.gem) assert.equal(body.orbit, innermost, `${body.label} is a product: it rides the innermost orbit`);
    assert.ok(body.orbit <= 2, `${body.label} rides orbit ${body.orbit}, which is hardly ever on the stage`);
  }
});

test('a body cannot ride an orbit the plate does not have', () => {
  assert.throws(() => seatBodies([{ orbit: 5 }], 5), RangeError);
  assert.throws(() => seatBodies([{ orbit: -1 }], 5), RangeError);
  assert.throws(() => seatBodies([{}], 5), RangeError);
});

// ---------------------------------------------------------------------------
// Which bodies show, and which side each carries its name on (showBodies)
// ---------------------------------------------------------------------------

/** A stage the size of a laptop's window, with nothing on it. */
const STAGE = { left: 12, top: 58, right: 1428, bottom: 860 };
const scene = (more = {}) => ({ stage: STAGE, words: [], room: ROOM, ...more });
/** A body riding at (x, y) with a name 120 px wide. */
const body = (x, y, more = {}) => ({ x, y, size: 1, label: 120, ...more });
/** The x at which a 120 px name on the right reaches exactly to the stage's right edge. */
const LAST_FIT = STAGE.right - BODY.arm - 120;

const dotBox = (at) => ({ left: at.x - BODY.dot * at.size, right: at.x + BODY.dot * at.size, top: at.y - BODY.dot * at.size, bottom: at.y + BODY.dot * at.size });
const nameBox = (at, side) => {
  const near = BODY.arm * at.size;
  const far = (BODY.arm + at.label) * at.size;
  return { left: side === 'right' ? at.x + near : at.x - far, right: side === 'right' ? at.x + far : at.x - near, top: at.y - BODY.tall * at.size, bottom: at.y + BODY.tall * at.size };
};
const overlap = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

test('a body in the open shows, with its name on its right', () => {
  assert.deepEqual(showBodies([body(700, 400)], scene()), [{ shown: true, side: 'right' }]);
});

test('a body over the words, or closer to them than its room, is not shown', () => {
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  const at = (x, y) => showBodies([body(x, y)], scene({ words }))[0].shown;
  assert.equal(at(300, 400), false, 'in the middle of the words');
  assert.equal(at(500 + BODY.dot + ROOM.jewel.across - 1, 400), false, 'just right of them, inside its room across');
  assert.equal(at(300, 420 + BODY.dot + ROOM.jewel.down - 1), false, 'just below them, inside its room down');
  assert.equal(at(500 + BODY.dot + ROOM.jewel.across + ROOM.spare + 1, 400), true, 'right of them with room to spare');
  assert.equal(at(300, 420 + BODY.dot + ROOM.jewel.down + ROOM.spare + 1), true, 'below them with room to spare');
});

test('a body does not show off the stage, nor with its jewel cut by an edge', () => {
  const at = (x, y) => showBodies([body(x, y)], scene())[0].shown;
  assert.equal(at(-40, 400), false);
  assert.equal(at(STAGE.right - 3, 400), false, 'its jewel would be cut by the right edge');
  assert.equal(at(700, STAGE.top + 3), false, 'under the header');
  assert.equal(at(700, STAGE.bottom + 30), false);
  const inset = BODY.dot + ROOM.spare + 1; // the nearest a jewel may come to an edge when it first shows
  assert.equal(at(STAGE.right - inset, 400), true, 'a whole jewel just inside the right edge');
  assert.equal(at(STAGE.left + inset, 400), true, 'a whole jewel just inside the left edge');
  assert.equal(at(700, STAGE.top + inset), true);
  assert.equal(at(700, STAGE.bottom - inset), true);
});

test('a body whose name would run off the right edge carries it on its left', () => {
  // 16 November 2026: with the name always on the right, a product near the right edge of a
  // 1440 px window was hidden whole (Orchestration Hub was off stage in 13 of 30 looks).
  const [one] = showBodies([body(STAGE.right - 60, 400)], scene());
  assert.deepEqual(one, { shown: true, side: 'left' });
});

test('a name keeps the side it is on for as long as it fits there', () => {
  // 16 November 2026: a name that went back to the right the moment the right had room changed
  // side twice in every turn of its orbit on a 1440 px window (about seven changes a minute on
  // the page). Kept on its side until that side runs out, it changes once.
  const on = (x, was) => showBodies([body(x, 400, { was })], scene())[0];
  const right = { shown: true, side: 'right' };
  const left = { shown: true, side: 'left' };
  assert.equal(on(LAST_FIT - 1, right).side, 'right', 'on the right it stays right while it still fits');
  assert.equal(on(LAST_FIT + 1, right).side, 'left', 'past the line it goes to the left');
  assert.equal(on(LAST_FIT - 1, left).side, 'left', 'on the left it does not hop back the moment the right fits again');
  assert.equal(on(700, left).side, 'left', 'nor when the right has all the room in the world');
  // It leaves the left only when the left runs out: here, at the left edge of the stage.
  const lastOnLeft = STAGE.left + BODY.arm + 120;
  assert.equal(on(lastOnLeft + 1, left).side, 'left');
  assert.equal(on(lastOnLeft - 1, left).side, 'right');
  // A name that is not out yet goes to the right, its home, when both sides have room.
  assert.equal(on(700, { shown: true, side: null }).side, 'right');
  assert.equal(on(700, { shown: false, side: null }).side, 'right');
});

test('a body that was hidden comes back only once it is clear with room to spare', () => {
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  const line = 500 + BODY.dot + ROOM.jewel.across; // the nearest a shown body may be, to the right of the words
  const on = (x, was) => showBodies([body(x, 400, { was })], scene({ words }))[0].shown;
  assert.equal(on(line + 1, { shown: true, side: 'right' }), true, 'a body that is showing stays to the line');
  assert.equal(on(line + 1, { shown: false, side: null }), false, 'a hidden one does not come back on the line');
  assert.equal(on(line + ROOM.spare + 1, { shown: false, side: null }), true);
});

test('a jewel still shows when its name fits on neither side, and a layout without names shows only jewels', () => {
  const phone = { left: 12, top: 58, right: 378, bottom: 800 };
  assert.deepEqual(showBodies([body(195, 400, { label: 220 })], scene({ stage: phone })), [{ shown: true, side: null }]);
  assert.deepEqual(showBodies([body(195, 400, { label: 0 })], scene({ stage: phone })), [{ shown: true, side: null }]);
});

test('a name gives way to another body: it never lies over a jewel or over another name', () => {
  // The first body's name, on its right, would run across the second's jewel: it goes to the left.
  const pair = [body(600, 400), body(700, 400)];
  assert.deepEqual(showBodies(pair, scene()), [{ shown: true, side: 'left' }, { shown: true, side: 'right' }]);

  // Two names that would cross: the body listed first keeps its side, the other makes way.
  // The second rides just far enough below the first for its name to clear the first's jewel,
  // which (a name being taller than a jewel) is still too close to the first's name.
  assert.ok(BODY.tall > BODY.dot, 'this case needs a name to be taller than a jewel');
  const below = 400 + BODY.dot + ROOM.apart + ROOM.spare + BODY.tall + 0.5;
  const crossing = [body(600, 400, { label: 200 }), body(560, below)];
  assert.deepEqual(showBodies(crossing, scene()), [{ shown: true, side: 'right' }, { shown: true, side: 'left' }]);

  // And whatever the bodies do, no name is ever drawn over another body's jewel or name.
  let seed = 20261116;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; // a plain repeatable sequence, so a failure can be run again
    return seed / 4294967296;
  };
  for (let round = 0; round < 400; round += 1) {
    const many = Array.from({ length: 8 }, () => body(200 + random() * 1100, 120 + random() * 650, { label: 50 + Math.floor(random() * 110), size: 0.9 + random() * 0.25 }));
    const placed = showBodies(many, scene());
    placed.forEach((one, i) => {
      if (!one.shown) return;
      placed.forEach((other, j) => {
        if (j <= i || !other.shown) return;
        const a = dotBox(many[i]);
        const b = dotBox(many[j]);
        const apart = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
        assert.ok(apart >= ROOM.apart, `round ${round}: the jewels of bodies ${i} and ${j} are ${apart.toFixed(1)} px apart`);
      });
      if (!one.side) return;
      const mine = nameBox(many[i], one.side);
      placed.forEach((other, j) => {
        if (j === i || !other.shown) return;
        assert.ok(!overlap(mine, dotBox(many[j])), `round ${round}: body ${i}'s name lies over body ${j}'s jewel`);
        if (other.side) assert.ok(!overlap(mine, nameBox(many[j], other.side)), `round ${round}: the names of bodies ${i} and ${j} cross`);
      });
    });
  }
});

test('two bodies never ride one on top of the other: the one listed later gives way', () => {
  // 16 November 2026: on a phone the first two orbits lie 23 px apart on the far side of the
  // plate, so a ring on the second passed almost touching a product on the first, and its box
  // lay over the product's jewel: a finger on the jewel pressed the ring.
  const reach = 2 * BODY.dot + ROOM.apart; // how far apart their middles must be, for their jewels to keep their room
  const pair = (gap, was) => showBodies([body(600, 400, { label: 0 }), body(600 + gap, 400, { label: 0, was })], scene()).map((one) => one.shown);
  assert.deepEqual(pair(4), [true, false], 'one on top of the other: the first listed shows');
  assert.deepEqual(pair(reach - 1), [true, false]);
  assert.deepEqual(pair(reach + ROOM.spare + 1), [true, true], 'apart, with room to spare: both show');
  // The later one, once out, stays out up to the line, and comes back only with room to spare.
  assert.deepEqual(pair(reach + 1, { shown: true, side: null }), [true, true]);
  assert.deepEqual(pair(reach + 1, { shown: false, side: null }), [true, false]);
  // A body that is not showing is in nobody's way.
  const words = [{ left: 560, top: 380, right: 640, bottom: 420 }];
  assert.deepEqual(
    showBodies([body(600, 400, { label: 0 }), body(700, 400, { label: 0 })], scene({ words })).map((one) => one.shown),
    [false, true],
    'the first is over the words and hidden: the second need not make way for it',
  );
  // Above or below is as near as beside.
  assert.deepEqual(showBodies([body(600, 400, { label: 0 }), body(600, 400 + reach - 1, { label: 0 })], scene()).map((one) => one.shown), [true, false]);
});

test('a name keeps further from the words than its jewel does', () => {
  // 16 November 2026: "Websites" rode 16 px above the serial number and read as its caption.
  // A jewel is a small round mark and may pass close; a name is words, and words crowd words.
  assert.ok(ROOM.name.across > ROOM.jewel.across && ROOM.name.down > ROOM.jewel.down);
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  const on = (y, more) => showBodies([body(300, y, more)], scene({ words }))[0];
  // Below the words, far enough for the jewel and not for a name: the jewel rides on alone.
  const close = 420 + BODY.dot + ROOM.jewel.down + ROOM.spare + 1;
  assert.ok(close - BODY.tall < 420 + ROOM.name.down + ROOM.spare, 'this case no longer puts the name inside the room it needs to come out');
  assert.deepEqual(on(close), { shown: true, side: null });
  const clear = 420 + BODY.tall + ROOM.name.down + ROOM.spare + 1;
  assert.deepEqual(on(clear), { shown: true, side: 'right' }, 'with the wider room to spare, it carries its name');
  assert.equal(on(clear - ROOM.spare, { was: { shown: true, side: 'right' } }).side, 'right', 'and keeps it up to the line');
  assert.equal(on(clear - ROOM.spare - 2, { was: { shown: true, side: 'right' } }).side, null);
});

test('a hidden body does not come out for a moment: only where it will still be clear a little later', () => {
  // 16 November 2026: bodies blinked. One came out for about a second between the foot of the
  // hero and the next arrow, another for a second and a half among the lines of the edition.
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  const hidden = { shown: false, side: null };
  const here = { x: 700, y: 400 }; // in the open
  const on = (soon, was = hidden) => showBodies([body(here.x, here.y, { was, soon })], scene({ words }))[0];
  const then = (x, y) => ({ x, y, size: 1 });
  assert.equal(on([then(300, 400)]).shown, false, 'it is about to ride into the words: it stays hidden');
  assert.equal(on([then(STAGE.right + 5, 400)]).shown, false, 'it is about to leave the stage: it stays hidden');
  assert.equal(on([then(720, 400), then(740, 400), then(760, 400)]).shown, true, 'it will still be clear: it comes out');
  // It would clip the corner of the words on the way, and be clear again after: one look ahead is not enough.
  assert.equal(on([then(720, 400), then(505, 400), then(760, 400)]).shown, false, 'in the way at one of the places between: it stays hidden');
  // Clear where it is and clear where it will be, but the way between crosses the corner of the words.
  assert.equal(on([then(300, 330)]).shown, false, 'it would graze the words on the way: it stays hidden');
  assert.equal(on(undefined).shown, true, 'with no word of where it will be, it is judged on where it is');
  // A body that is already showing stays until it really is in the way.
  assert.equal(on([then(300, 400)], { shown: true, side: 'right' }).shown, true);
});

test('a name does not come out for a moment either', () => {
  const hidden = { shown: true, side: null }; // the jewel is showing, without its name
  const on = (soon, was = hidden) => showBodies([body(700, 400, { was, soon })], scene())[0].side;
  const then = (x, y) => ({ x, y, size: 1 });
  // Its name fits on the right now, but would be off the right edge a little later: it goes straight to the left.
  assert.equal(on([then(760, 400), then(STAGE.right - 60, 400)]), 'left');
  assert.equal(on([then(730, 400), then(760, 400)]), 'right');
  // A name already on the right stays there until it really does not fit.
  assert.equal(on([then(STAGE.right - 60, 400)], { shown: true, side: 'right' }), 'right');
});

test('a name does not come out when its jewel is about to go', () => {
  // 16 November 2026: on a phone a name came out about once a minute for under two seconds. The name
  // itself would have gone on fitting, but its jewel left the stage a moment later and took it along.
  const bare = { shown: true, side: null }; // the jewel is showing, without its name
  const then = (x) => ({ x, y: 400, size: 1 });
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  const on = (x, soon, was = bare) => showBodies([body(x, 400, { was, soon })], scene({ words }))[0];
  // Near the right edge its name fits on the left and would go on fitting there, but the jewel is about to leave the stage.
  const edge = STAGE.right - BODY.dot - 20;
  assert.deepEqual(on(edge, [then(edge + 10), then(edge + 30)]), { shown: true, side: null });
  // About to ride over the words: its name, on the right, would stay clear of them, but the jewel will not.
  assert.deepEqual(on(560, [then(530), then(508)]), { shown: true, side: null });
  // A jewel that is staying brings its name out.
  assert.deepEqual(on(edge, [then(edge + 5), then(edge + 10)]), { shown: true, side: 'left' });
  assert.deepEqual(on(560, [then(570), then(580)]), { shown: true, side: 'right' });
  // A name that is already out stays with its jewel to the end.
  assert.deepEqual(on(edge, [then(edge + 10), then(edge + 30)], { shown: true, side: 'left' }), { shown: true, side: 'left' });
});

test('nothing comes out for a moment beside another body that is about to pass', () => {
  // 16 November 2026: the last names seen out for under two seconds were all beside a body on the
  // next orbit that came past a moment later. Bodies on different orbits go round at different speeds.
  const hidden = { shown: false, side: null };
  const bare = { shown: true, side: null };
  const named = { shown: true, side: 'right' };
  const then = (x, y = 400) => ({ x, y, size: 1 });
  // A body listed first is on its way to where a hidden one rides: the hidden one waits.
  // (A jewel is 12 wide each way: at 815 the first lies right over the one that rides at 824.)
  const passing = body(700, 400, { was: named, label: 0, soon: [then(760), then(815)] });
  const waiting = body(820, 400, { was: hidden, label: 0, soon: [then(822), then(824)] });
  assert.equal(showBodies([passing, waiting], scene())[1].shown, false, 'the first will be on top of it: it stays hidden');
  const leaving = body(700, 400, { was: named, label: 0, soon: [then(660), then(620)] });
  assert.equal(showBodies([leaving, waiting], scene())[1].shown, true, 'the first is going the other way: it comes out');
  // The one listed first never waits for one listed after it.
  assert.equal(showBodies([{ ...waiting, was: hidden }, { ...passing, x: 700 }], scene())[0].shown, true);
  // Once out, a body stays until the other really is beside it.
  assert.equal(showBodies([passing, { ...waiting, was: bare }], scene())[1].shown, true);

  // A name would lie on the right, where another jewel is about to ride through: it comes out on the left instead.
  const host = body(700, 400, { was: bare, soon: [then(702), then(704)] });
  const through = body(900, 400, { was: bare, label: 0, soon: [then(860), then(800)] });
  assert.equal(showBodies([host, through], scene())[0].side, 'left');
  const away = body(900, 400, { was: bare, label: 0, soon: [then(930), then(960)] });
  assert.equal(showBodies([host, away], scene())[0].side, 'right', 'the other jewel is going away: the name comes out at home');
  // A name already out stays until the jewel really is beside it.
  assert.equal(showBodies([{ ...host, was: named }, through], scene())[0].side, 'right');
  // A name does not come out beside a jewel that a body listed first is about to push out.
  const pushed = body(820, 400, { was: bare, soon: [then(822), then(824)] });
  assert.deepEqual(showBodies([passing, pushed], scene())[1], { shown: true, side: null });

  // Nor where a name already placed is about to be. The first body carries its name on the left;
  // the second rides up from below it, far from its jewel, and its own name would run into that one.
  const lefty = body(700, 400, { was: { shown: true, side: 'left' }, soon: [then(702), then(704)] });
  const rising = body(500, 460, { was: bare, soon: [then(500, 440), then(500, 420)] });
  assert.deepEqual(showBodies([lefty, rising], scene()).map((each) => each.side), ['left', 'left'], 'the second name comes out on its other side');
  const sinking = body(500, 460, { was: bare, soon: [then(500, 480), then(500, 500)] });
  assert.deepEqual(showBodies([lefty, sinking], scene()).map((each) => each.side), ['left', 'right'], 'going away from it, the name comes out at home');

  // The look ahead goes only as far as both ways are given: of a body with no places ahead, nothing is guessed.
  assert.equal(showBodies([{ ...passing, soon: undefined }, waiting], scene())[1].shown, true);
  assert.equal(showBodies([passing, { ...waiting, soon: undefined }], scene())[1].shown, true);

  // It is the room two bodies keep that counts, and the whole way between two looks.
  const closing = body(700, 400, { was: named, label: 0, soon: [then(750), then(794)] });
  assert.equal(showBodies([closing, waiting], scene())[1].shown, false, 'the first stops 4 px short of it, inside the room two bodies keep');
  const stopping = body(700, 400, { was: named, label: 0, soon: [then(740), then(780)] });
  assert.equal(showBodies([stopping, waiting], scene())[1].shown, true, 'the first stops 18 px short of it');
  const crossing = body(700, 400, { was: named, label: 0, soon: [then(780), then(880)] });
  assert.equal(showBodies([crossing, waiting], scene())[1].shown, false, 'the first goes right over it between two looks');
});

test('a body that is hidden is in the way only where it could come out', () => {
  // A hidden body listed first may be out by the time it passes, and then the later one would have
  // to go. Behind the words it cannot come out, and nothing waits for it. (16 November 2026: taking
  // every hidden body to be in the way cost a 390 px phone a fifth of its names.)
  const hidden = { shown: false, side: null };
  const bare = { shown: true, side: null };
  const then = (x, y = 400) => ({ x, y, size: 1 });
  const ghost = body(700, 400, { was: hidden, label: 0, soon: [then(760), then(815)] });
  const lower = body(820, 430, { was: hidden, label: 0, soon: [then(822, 430), then(824, 430)] });
  const over = (left, right) => [{ left, top: 340, right, bottom: 385 }]; // words just above the first one's way
  const allTheWay = showBodies([ghost, lower], scene({ words: over(640, 900) }));
  assert.deepEqual(allTheWay.map((each) => each.shown), [false, true], 'the first is behind the words all the way: the later one comes out');
  const atFirst = showBodies([ghost, lower], scene({ words: over(640, 730) }));
  assert.deepEqual(atFirst.map((each) => each.shown), [false, false], 'the first comes out from behind the words and passes: the later one waits');

  // The same for a name: it waits for a hidden jewel that could come out where the name would lie.
  const host = body(700, 430, { was: bare, soon: [then(702, 430), then(704, 430)] });
  const coming = body(940, 400, { was: hidden, label: 0, soon: [then(860), then(800)] });
  assert.deepEqual(showBodies([host, coming], scene({ words: over(880, 1000) })), [{ shown: true, side: 'left' }, { shown: false, side: null }], 'it comes out from behind the words beside the name');
  assert.deepEqual(showBodies([host, coming], scene({ words: over(640, 1000) })), [{ shown: true, side: 'right' }, { shown: false, side: null }], 'it stays behind the words: the name comes out at home');

  // A body that is out counts for as long as it is out: this one passes the later one first, and
  // goes behind the words only after.
  const leaving = body(760, 400, { was: bare, label: 0, soon: [then(815), then(870)] });
  assert.deepEqual(showBodies([leaving, lower], scene({ words: over(840, 1000) })).map((each) => each.shown), [true, false], 'it is still out as it passes');
});

test('a hidden body has no name, and is in the way of no name that is out', () => {
  const hidden = { shown: false, side: null };
  const named = { shown: true, side: 'right' };
  // A name goes when its jewel goes, though the name itself would still fit: this jewel is closer
  // to the words than a jewel may be, and its name, further off, is not.
  const words = [{ left: 100, top: 380, right: 500, bottom: 420 }];
  assert.deepEqual(showBodies([body(515, 400, { was: named })], scene({ words })), [{ shown: false, side: null }]);
  // A hidden body is not there: a name that is out lies on over where it rides. (This one is
  // hidden because it is about to leave the stage.)
  const going = body(780, 400, { was: hidden, label: 0, soon: [{ x: 780, y: 200, size: 1 }, { x: 780, y: 30, size: 1 }] });
  assert.deepEqual(showBodies([body(700, 400, { was: named }), going], scene()), [{ shown: true, side: 'right' }, { shown: false, side: null }]);
});

test('a name that is out keeps its place, whichever body it belongs to', () => {
  // 16 November 2026, on a phone: Websites had had its name out for 0.2 s when the Hub, listed
  // before it, put its own name out on top of it, and Websites lost its name again. Every name seen
  // out for under two seconds on a phone went that way. A new name comes out only clear of the names
  // that are out; the order of the list settles it only between two that are out, or two that are new.
  const bare = { shown: true, side: null };
  const onLeft = { shown: true, side: 'left' };
  const onRight = { shown: true, side: 'right' };
  const then = (x, y = 400) => ({ x, y, size: 1 });
  const sides = (bodies) => showBodies(bodies, scene()).map((each) => each.side);
  const first = body(300, 400, { was: bare }); // its name would reach from 318 to 438 on its right
  const second = body(560, 400, { was: onLeft }); // its name lies from 422 to 542
  assert.deepEqual(sides([first, second]), ['left', 'left'], 'the new name goes to its other side: the one that is out stays');
  assert.deepEqual(sides([{ ...first, was: onRight }, second]), ['right', 'right'], 'both are out and meet: the first listed stays, the later one makes way');
  assert.deepEqual(sides([{ ...first, was: undefined }, { ...second, was: undefined }]), ['right', 'right'], 'both are new: the first listed takes its home');

  // A new name looks ahead at the names that are out as well, whichever body they belong to.
  const nearing = body(620, 400, { was: onLeft, soon: [then(590), then(560)] });
  const still = { ...first, soon: [then(300), then(300)] };
  assert.deepEqual(sides([still, nearing]), ['left', 'left'], "the later body's name is on its way to where the new one would lie");
  const parting = body(620, 400, { was: onLeft, soon: [then(650), then(680)] });
  assert.deepEqual(sides([still, parting]), ['right', 'left']);
});

test("a jewel's glint lies on the side the plate's light is on", () => {
  // The plate's light is one lamp (js/main.js: restingLight, and the pointer). A jewel lit from
  // some other side than the plate beside it would be a sticker, not a jewel on the same desk.
  const at = { x: 500, y: 400 };
  const glint = (light) => glintToward(at, light);
  const under = glint({ x: 500, y: 400 });
  // The lamp hangs over the desk and the desk is seen from the front, so even straight under it
  // the glint sits a little above the middle of the stone: dead centre, a stone reads as a lit bulb.
  assert.ok(under.x === 50 && under.y < 50 && under.y >= 38, `straight under the light: ${JSON.stringify(under)}`);
  const left = glint({ x: 100, y: 400 });
  assert.ok(left.x < under.x && left.y === under.y, `light on the left: ${JSON.stringify(left)}`);
  const right = glint({ x: 900, y: 400 });
  assert.equal(right.x - 50, 50 - left.x, 'as far out on the right as on the left');
  const above = glint({ x: 500, y: 0 });
  const below = glint({ x: 500, y: 800 });
  assert.ok(above.y < under.y && above.x === 50, `light above: ${JSON.stringify(above)}`);
  assert.ok(below.y > under.y && below.x === 50, `light below: ${JSON.stringify(below)}`);
  const far = glint({ x: at.x - 4000, y: at.y - 4000 });
  const near = glint({ x: at.x - 200, y: at.y - 200 });
  assert.deepEqual(far, near, 'however far off the light is that way, the glint stops at the same place: it never leaves the jewel');
  assert.ok(far.x < 50 && far.y < 50, `light up and to the left: ${JSON.stringify(far)}`);
  for (const each of [left, right, above, below, far]) {
    assert.ok(each.x >= 20 && each.x <= 80 && each.y >= 20 && each.y <= 80, `the glint keeps inside the jewel: ${JSON.stringify(each)}`);
    assert.ok(Number.isInteger(each.x) && Number.isInteger(each.y), 'whole steps: the page is not restyled for a hair of movement');
  }
});

test('with motion reduced nothing rides on, so nothing looks ahead', () => {
  // 16 November 2026: with motion reduced the page draws one still frame, but each body was still
  // given the places it would ride through next, and stayed hidden for words it would never reach.
  // On a 390 px phone the still frame showed 1.2 products where 1.7 fit, and at 1024 x 768 it showed
  // 2.3 where 2.7 fit (ten editions, .handoff/checks/orb-still.mjs). At rest a body's places ahead
  // are where it is.
  const hidden = { shown: false, side: null };
  const words = [{ left: 800, top: 380, right: 1000, bottom: 420 }];
  const riding = body(700, 400, { was: hidden, label: 0, soon: [{ x: 740, y: 400, size: 1 }, { x: 780, y: 400, size: 1 }] });
  const atRest = { ...riding, soon: [riding, riding].map(({ x, y, size }) => ({ x, y, size })) };
  assert.equal(showBodies([riding], scene({ words }))[0].shown, false, 'riding on into the words, it waits');
  assert.equal(showBodies([atRest], scene({ words }))[0].shown, true, 'at rest it fits where it is, and shows');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const look = reduceMotion\.matches \? 0 : /, 'js/main.js looks ahead along the orbits even when nothing will ride them');
  assert.match(main, /rideAt\(seat, state\.orbit \+ look \* \(step \+ 1\)\)/, 'the places ahead are not taken that far along the orbit');
});

test('the stylesheet draws a body to the numbers the placing works with', () => {
  assert.match(css, new RegExp(`\\.body__label--right \\{[^}]*left: calc\\(50% \\+ ${BODY.arm}px\\)`), 'the name on the right does not begin BODY.arm from the dot');
  assert.match(css, new RegExp(`\\.body__label--left \\{[^}]*right: calc\\(50% \\+ ${BODY.arm}px\\)`), 'the name on the left does not end BODY.arm from the dot');
});

test('the page runs these rules and draws what they decide', () => {
  // Built but never called is not built. Nothing in Node can watch the hero draw, so this holds
  // the three ends together by reading them: the script calls the rules, hands the page what
  // they decided, and the stylesheet acts on it. (.handoff/checks/bodies-live.mjs watches the
  // real page do it.)
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  for (const call of ['seatBodies(', 'showBodies(', 'glintToward(']) assert.ok(main.includes(call), `js/main.js never calls ${call.slice(0, -1)}`);
  assert.match(main, /showBodies\(riders, \{ stage, words: inTheWay, room: ROOM \}\)/, 'the rules are not given the stage, the words and the room');
  assert.match(main, /dataset\.hidden = /, 'whether a body shows never reaches the page');
  assert.match(main, /dataset\.side = /, "the side of a body's name never reaches the page");
  assert.match(css, /\.body\[data-hidden="true"\] \{[^}]*opacity: 0/, 'the stylesheet does not hide a body the rules have hidden');
  assert.match(
    css,
    /\.body\[data-side="right"\] \.body__label--right,\s*\.body\[data-side="left"\] \.body__label--left \{[^}]*opacity: 1/,
    'the stylesheet does not show the name on the side the rules chose',
  );
  assert.match(css, /\.body__label \{[^}]*opacity: 0/, 'a name the rules did not choose would show');
  assert.match(main, /setProperty\('--glint-x'/, "a jewel's glint is never moved");
  assert.match(css, /\.body--gem \.body__dot \{[^}]*var\(--glint-x\) var\(--glint-y\)/, "the stylesheet does not draw a jewel's glint where the script puts it");
});
