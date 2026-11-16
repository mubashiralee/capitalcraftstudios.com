// Checks on the film: the plate is drawn by ten pens, and no pen ever lifts.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INK_PAIRS, deriveEdition, mintSerial } from '../js/edition.js';
import { KIND, LINE, LINE_COUNT, inkRamp, near, planFilm, walk } from '../js/film.js';

const TAU = Math.PI * 2;

function testDice(seed = 1) {
  let state = seed >>> 0;
  return (sides) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * sides);
  };
}

function manySerials(count, seed = 11) {
  const randomInt = testDice(seed);
  return Array.from({ length: count }, () => mintSerial({ randomInt, year: 2026 }));
}

const editions = manySerials(36).map((serial) => deriveEdition(serial));
const toXY = ({ radius, at }) => [radius * Math.cos((at - 0.5) * TAU), radius * Math.sin((at - 0.5) * TAU)];
const names = Object.keys(LINE);

test('the editions under test cover every way a band is drawn, in both bands', () => {
  const seen = new Set();
  for (const edition of editions) {
    planFilm(edition).bands.forEach((band, index) => seen.add(`${index}:${band.kind}`));
  }
  for (const kind of Object.values(KIND)) {
    assert.ok(seen.has(`0:${kind}`) && seen.has(`1:${kind}`), `no edition here draws kind ${kind} in both bands`);
  }
});

test('the film has ten lines, each in an ink of its own', () => {
  for (const edition of editions) {
    const { lines } = planFilm(edition);
    assert.equal(lines.length, LINE_COUNT);
    assert.equal(LINE_COUNT, 10);
    assert.equal(new Set(lines.map((line) => line.ink)).size, 10, 'two lines share an ink');
    for (const [index, line] of lines.entries()) {
      const where = `${edition.serial} ${names[index]}`;
      assert.ok(line.ink >= 0 && line.ink <= 1, `${where}: ink ${line.ink}`);
      assert.ok(Number.isFinite(line.turns) && line.turns >= 1, `${where}: ${line.turns} turns`);
      assert.ok(line.start >= 0 && line.duration > 0, `${where}: timing`);
    }
  }
});

test('no pen ever lifts: every line is unbroken from end to end', () => {
  const stride = 1 / 4000; // of a turn
  // The fastest a pen legitimately moves is about 20 plate units a turn (the
  // crossings of a tight weave). A step much longer than that is a jump.
  const longest = 0.012;
  for (const edition of editions) {
    const plan = planFilm(edition);
    for (let line = 0; line < LINE_COUNT; line += 1) {
      const steps = Math.ceil(plan.lines[line].turns / stride);
      let before = toXY(walk(plan, edition, line, 0));
      for (let step = 1; step <= steps; step += 1) {
        const turns = Math.min(plan.lines[line].turns, step * stride);
        const here = toXY(walk(plan, edition, line, turns));
        const moved = Math.hypot(here[0] - before[0], here[1] - before[1]);
        assert.ok(
          moved < longest,
          `${edition.serial}: the ${names[line]} pen jumps ${moved.toFixed(4)} plate units at ${turns.toFixed(4)} turns`,
        );
        before = here;
      }
    }
  }
});

test('from any point on a line, the shader works out how far along the line it is', () => {
  const dice = testDice(5);
  for (const edition of editions) {
    const plan = planFilm(edition);
    for (let line = 0; line < LINE_COUNT; line += 1) {
      const length = plan.lines[line].turns;
      for (let sample = 0; sample < 160; sample += 1) {
        const turns = ((dice(1_000_000) + 0.5) / 1_000_000) * length;
        const point = walk(plan, edition, line, turns);
        const hits = near(plan, edition, point.radius, point.at).filter((hit) => hit.line === line);
        const exact = hits.find((hit) => Math.abs(hit.gap) < 1e-6 && Math.abs(hit.turns - turns) < 1e-6);
        assert.ok(
          exact,
          `${edition.serial}: ${names[line]} at ${turns.toFixed(5)} turns was read as ` +
            `${hits.map((hit) => `${hit.turns.toFixed(5)} (off by ${hit.gap.toExponential(1)})`).join(', ') || 'nothing'}`,
        );
      }
    }
  }
});

test('the two pens that share a band turn opposite ways, and so do neighbours', () => {
  for (const edition of editions) {
    const plan = planFilm(edition);
    for (const band of plan.bands) {
      assert.equal(band.lines[0].way, -band.lines[1].way);
      assert.equal(Math.abs(band.lines[0].way), 1);
    }
    assert.equal(plan.orbits.way, edition.spin);
  }
});

// The owner's brief for the seal, 15 November 2026: "it is dropped at the very
// end. The reason is the laser engraving is taking away attention from the
// beautiful patterns we have made. So it falls at the very end when the
// pattern is done." Then, of the first drop: "Physics of the drop needs to be
// improved". A stone takes as long to fall as it takes, so the drop is no
// longer a share of the film: js/main.js lets the stone go when the film ends,
// and js/drop.js works out its fall in seconds.
test('the film is the lines and nothing else: it ends as the last line does, and has no part for the seal\'s stone', () => {
  for (const edition of editions) {
    const plan = planFilm(edition);
    const last = Math.max(...plan.lines.map((line) => line.start + line.duration));
    assert.ok(Math.abs(last - 1) < 1e-9, `the last line is done at ${last} of the film`);
    assert.equal('drop' in plan, false, 'the stone keeps its own time');
  }
});

test('the lines are drawn from the outside in, a few at a time, and the whole film fits in its time', () => {
  for (const edition of editions) {
    const plan = planFilm(edition);
    const { lines } = plan;
    assert.equal(lines[0].start, 0);
    for (let line = 1; line < LINE_COUNT; line += 1) {
      assert.ok(lines[line].start > lines[line - 1].start, `${names[line]} sets off before ${names[line - 1]}`);
    }
    const last = Math.max(...lines.map((line) => line.start + line.duration));
    assert.ok(last <= 1 + 1e-9, `the lines run on to ${last}, past the end of the film`);

    for (let tick = 1; tick < 200; tick += 1) {
      const now = (tick / 200) * last;
      const working = lines.filter((line) => now >= line.start && now <= line.start + line.duration).length;
      assert.ok(working >= 1, `${edition.serial}: no pen is drawing at ${now.toFixed(3)}`);
      assert.ok(working <= 4, `${edition.serial}: ${working} pens at once at ${now.toFixed(3)}`);
    }

    // The lettering is typed within the film.
    for (const [start, length] of Object.values(plan.typed)) {
      assert.ok(start > 0 && start + length <= 1, 'lettering is typed outside the film');
    }
  }
});

// A colour as the eye weighs it (OKLCH), worked out here on its own, not with
// the code under test: how light, how strong, and where round the colour wheel.
function seen([red, green, blue]) {
  const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [red, green, blue].map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const green_red = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const blue_yellow = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    strength: Math.hypot(green_red, blue_yellow),
    hue: ((Math.atan2(blue_yellow, green_red) * 360) / TAU + 360) % 360, // degrees round the wheel
  };
}
/** Degrees from one hue to another, the short way round: -180..180. */
const hueTurn = (from, to) => ((to - from + 540) % 360) - 180;

test('the five inks are a family: an even fan of hues, all of one weight, that a screen can show', () => {
  for (const edition of editions) {
    const ramp = inkRamp(edition.ink.a, edition.ink.b);
    const where = `${edition.serial} (${INK_PAIRS[edition.ink.pair].name})`;
    assert.equal(ramp.length, 5);
    for (const ink of ramp) {
      assert.equal(ink.length, 3);
      for (const channel of ink) assert.ok(channel >= 0 && channel <= 1, `${where}: ink channel ${channel}`);
    }
    const inks = ramp.map(seen);

    // Told apart: each ink is a clear step round the colour wheel from the last,
    // always the same way. Not a rainbow: the whole fan is well short of half the wheel.
    const steps = inks.slice(1).map((ink, index) => hueTurn(inks[index].hue, ink.hue));
    for (const step of steps) {
      assert.equal(Math.sign(step), Math.sign(steps[0]), `${where}: the fan doubles back (${steps.map(Math.round)})`);
      assert.ok(Math.abs(step) >= 26, `${where}: two inks are too alike, ${Math.abs(step).toFixed(1)} degrees apart`);
      assert.ok(Math.abs(step) <= 40, `${where}: two inks are too far apart, ${Math.abs(step).toFixed(1)} degrees`);
    }

    // Nothing sticks out: all five are the same weight on the paper, and none is a grey.
    const lightest = Math.max(...inks.map((ink) => ink.lightness));
    const darkest = Math.min(...inks.map((ink) => ink.lightness));
    assert.ok(lightest - darkest <= 0.06, `${where}: lightness runs from ${darkest.toFixed(2)} to ${lightest.toFixed(2)}`);
    assert.ok(darkest >= 0.36 && lightest <= 0.5, `${where}: lightness ${darkest.toFixed(2)} to ${lightest.toFixed(2)}`);
    for (const ink of inks) assert.ok(ink.strength >= 0.05, `${where}: an ink is nearly grey (${ink.strength.toFixed(3)})`);

    // Every ink must stay dark enough to read as a hairline on pale paper.
    for (const [red, green, blue] of ramp) {
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      assert.ok(luma < 0.42, `${where}: an ink is too pale (${luma.toFixed(2)})`);
    }

    // The fan is built round the edition's own two inks: both lie inside it.
    const span = hueTurn(inks[0].hue, inks[2].hue) + hueTurn(inks[2].hue, inks[4].hue);
    for (const own of [edition.ink.a, edition.ink.b].map(seen)) {
      if (own.strength < 0.03) continue; // a grey has no hue to place
      const into = hueTurn(inks[0].hue, own.hue) / span;
      assert.ok(into > -0.02 && into < 1.02, `${where}: an ink of the edition lies outside its fan (${into.toFixed(2)})`);
    }
  }
});

test('every line can be told from the others, and above all from the lines beside it', () => {
  for (const edition of editions.slice(0, 6)) {
    const { lines } = planFilm(edition);
    const ink = (name) => lines[LINE[name]].ink;
    const sorted = lines.map((line) => line.ink).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(sorted[i] - sorted[i - 1] >= 0.1, `two lines are ${(sorted[i] - sorted[i - 1]).toFixed(2)} apart in ink`);
    }
    // The two lines woven through one band are the most different of all.
    assert.ok(Math.abs(ink('outerA') - ink('outerB')) >= 0.5);
    assert.ok(Math.abs(ink('innerA') - ink('innerB')) >= 0.5);
    // Lines that lie next to each other on the plate, from the rim in.
    const beside = [
      ['orbits', 'rim'], ['rim', 'braidB'], ['braidB', 'outerB'], ['outerA', 'editionRing'],
      ['editionRing', 'braidA'], ['braidA', 'innerB'], ['innerA', 'sealRing'],
    ];
    for (const [one, other] of beside) {
      assert.ok(Math.abs(ink(one) - ink(other)) >= 0.3, `${one} and ${other} lie side by side in nearly the same ink`);
    }
  }
});

test('the same edition always gets the same film', () => {
  for (const edition of editions.slice(0, 8)) {
    assert.deepEqual(planFilm(edition), planFilm(edition));
    const flat = JSON.stringify(planFilm(edition));
    assert.ok(!/null|NaN/.test(flat), `${edition.serial}: the plan has a hole in it`);
  }
});
