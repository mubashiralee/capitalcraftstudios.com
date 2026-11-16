// Locks for the "one of one" edition system.
//
// A serial is a promise: the same serial must draw the same plate on every
// device, today and after later code changes, because people share links to it.
// These tests are that promise written down.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EDITION_COUNT,
  INK_PAIRS,
  SERIAL_LETTERS,
  chooseSerial,
  createRandom,
  deriveEdition,
  formatSerial,
  mintSerial,
  mintUnlike,
  parseSerial,
  secureRandomInt,
  seedsFromSerial,
  serialParts,
} from '../js/edition.js';

const TAU = Math.PI * 2;

/** A small deterministic die so the tests never depend on real randomness. */
function testDice(seed = 1) {
  let state = seed >>> 0;
  return (sides) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * sides);
  };
}

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

function manySerials(count, seed = 7) {
  const randomInt = testDice(seed);
  return Array.from({ length: count }, () => mintSerial({ randomInt, year: 2026 }));
}

/** Every number anywhere inside an edition, with the path that reaches it. */
function numbersIn(value, path = 'edition', found = []) {
  if (typeof value === 'number') found.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => numbersIn(item, `${path}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) numbersIn(item, `${path}.${key}`, found);
  }
  return found;
}

test('there are 24 x 24 x 24 x 1,000,000 editions in a series', () => {
  assert.equal(SERIAL_LETTERS.length, 24);
  assert.equal(new Set(SERIAL_LETTERS).size, 24);
  assert.ok(!SERIAL_LETTERS.includes('I'), 'I is left out: it reads as 1');
  assert.ok(!SERIAL_LETTERS.includes('O'), 'O is left out: it reads as 0');
  assert.equal(EDITION_COUNT, 13_824_000_000);
});

test('mintSerial rolls three letters, then one six-digit number', () => {
  const asked = [];
  const lowest = mintSerial({ randomInt: (sides) => (asked.push(sides), 0), year: 2026 });
  assert.equal(lowest, 'CC26-AAA-000000');
  assert.deepEqual(asked, [24, 24, 24, 1_000_000]);

  const highest = mintSerial({ randomInt: (sides) => sides - 1, year: 2026 });
  assert.equal(highest, 'CC26-ZZZ-999999');
});

test('mintSerial names the series after the year', () => {
  const zero = () => 0;
  assert.equal(mintSerial({ randomInt: zero, year: 2031 }), 'CC31-AAA-000000');
  assert.equal(mintSerial({ randomInt: zero, year: 2105 }), 'CC05-AAA-000000');
});

test('mintSerial refuses dice that roll outside their range', () => {
  for (const bad of [(sides) => sides, () => -1, () => 0.5, () => Number.NaN, () => '3']) {
    assert.throws(() => mintSerial({ randomInt: bad, year: 2026 }), RangeError);
  }
});

test('secureRandomInt stays in range, covers it, and rejects nonsense', () => {
  const seen = new Set();
  for (let i = 0; i < 4000; i += 1) {
    const value = secureRandomInt(24);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 24, `rolled ${value}`);
    seen.add(value);
  }
  assert.equal(seen.size, 24, 'a 24-sided die rolled 4,000 times should show every face');
  assert.equal(secureRandomInt(1), 0);
  for (const bad of [0, -3, 2.5, Number.NaN, 2 ** 33, '24']) {
    assert.throws(() => secureRandomInt(bad), RangeError);
  }
  // The real die feeds the real mint.
  assert.match(mintSerial({ randomInt: secureRandomInt, year: 2026 }), /^CC26-[A-HJ-NP-Z]{3}-\d{6}$/);
});

test('parseSerial accepts the ways people type and paste a serial', () => {
  const canonical = 'CC26-KQX-418207';
  for (const typed of [
    'CC26-KQX-418207',
    'cc26-kqx-418207',
    'CC26 KQX 418207',
    'CC26KQX418207',
    '  cc26 kqx-418207  ',
    'CC26_KQX_418207',
  ]) {
    assert.equal(parseSerial(typed), canonical, `typed as ${JSON.stringify(typed)}`);
  }
});

test('parseSerial turns anything else away', () => {
  for (const wrong of [
    '',
    'CC26-KQX-41820', // five digits
    'CC26-KQX-4182077', // seven digits
    'CC26-KQ-418207', // two letters
    'CC26-KQXX-418207', // four letters
    'CC26-KIX-418207', // I is not in the alphabet
    'CC26-KOX-418207', // O is not in the alphabet
    'CD26-KQX-418207', // wrong series mark
    'CC2-KQX-418207', // one-digit year
    'CC26-KQX-418207<script>',
    'CC26-KQX-４１８２０７', // full-width digits
    'CC26-KQX-418207 CC26-KQX-418207',
    null,
    undefined,
    418207,
    {},
    ['CC26-KQX-418207'],
  ]) {
    assert.equal(parseSerial(wrong), null, `should reject ${JSON.stringify(wrong)}`);
  }
});

test('formatSerial and parseSerial undo each other', () => {
  assert.equal(formatSerial('CC26-KQX-418207'), 'CC26 KQX 418207');
  for (const serial of manySerials(300)) {
    assert.match(serial, /^CC26-[A-HJ-NP-Z]{3}-\d{6}$/);
    assert.equal(parseSerial(formatSerial(serial)), serial);
  }
  assert.throws(() => formatSerial('nonsense'), RangeError);
});

test('serialParts splits a serial for display', () => {
  assert.deepEqual(serialParts('CC26-KQX-418207'), {
    series: 'CC26',
    letters: 'KQX',
    digits: '418207',
  });
  assert.throws(() => serialParts('nonsense'), RangeError);
});

test('chooseSerial: a valid link wins, anything else mints a fresh one', () => {
  const mint = () => 'CC26-AAA-000001';
  assert.deepEqual(chooseSerial({ link: 'cc26 kqx 418207', mint }), {
    serial: 'CC26-KQX-418207',
    origin: 'link',
  });
  assert.deepEqual(chooseSerial({ link: null, mint }), { serial: 'CC26-AAA-000001', origin: 'visit' });
  assert.deepEqual(chooseSerial({ link: 'garbage', mint }), {
    serial: 'CC26-AAA-000001',
    origin: 'visit',
  });
});

test('chooseSerial: refreshing the page never shows the same edition twice, even one that came by link', () => {
  const mint = () => 'CC26-AAA-000001';
  const link = 'CC26-KQX-418207';
  // Opening the link shows it, whatever was shown before; so does going back to it.
  assert.equal(chooseSerial({ link, mint, last: 'CC26-BBB-000002' }).origin, 'link');
  assert.equal(chooseSerial({ link, mint, last: link, reload: false }).origin, 'link');
  // A refresh of a link that has not been shown yet still shows it.
  assert.equal(chooseSerial({ link, mint, last: 'CC26-BBB-000002', reload: true }).origin, 'link');
  // A refresh of the edition on show draws another.
  assert.deepEqual(chooseSerial({ link, mint, last: 'cc26 kqx 418207', reload: true }), {
    serial: 'CC26-AAA-000001',
    origin: 'visit',
  });
});

const lookOf = (serial) => {
  const { ink, inner, outer } = deriveEdition(serial);
  return { inks: ink.pair, patterns: `${inner.kind} in ${outer.kind}` };
};

test('a fresh edition never looks like the one before it: other inks, and another pairing of patterns', () => {
  const dice = testDice(11);
  const mint = () => mintSerial({ randomInt: dice, year: 2026 });
  let last = mint();
  for (let round = 0; round < 400; round += 1) {
    const next = mintUnlike({ last, mint });
    assert.notEqual(next, last);
    assert.notEqual(lookOf(next).inks, lookOf(last).inks, `${last} then ${next}: the same pair of inks`);
    assert.notEqual(lookOf(next).patterns, lookOf(last).patterns, `${last} then ${next}: the same patterns`);
    last = next;
  }
  // The same holds for the edition a visit opens with.
  for (let round = 0; round < 100; round += 1) {
    const { serial } = chooseSerial({ link: null, mint, last });
    assert.notEqual(lookOf(serial).inks, lookOf(last).inks);
    assert.notEqual(lookOf(serial).patterns, lookOf(last).patterns);
    last = serial;
  }
});

test('minting always ends: with nothing to differ from it mints once, and a stuck mint is given up on', () => {
  let calls = 0;
  const stuck = () => {
    calls += 1;
    return 'CC26-AAA-000001';
  };
  assert.equal(mintUnlike({ last: null, mint: stuck }), 'CC26-AAA-000001');
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(mintUnlike({ last: 'not a serial', mint: stuck }), 'CC26-AAA-000001');
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(mintUnlike({ last: 'CC26-AAA-000001', mint: stuck }), 'CC26-AAA-000001');
  assert.ok(calls > 1 && calls <= 16, `a stuck mint was tried ${calls} times`);
});

test('the seed of a serial never changes (golden)', () => {
  // Recorded from the first implementation. If this fails, every link anyone
  // has ever shared now draws a different plate. Do not "fix" the numbers.
  assert.deepEqual(seedsFromSerial('CC26-KQX-418207'), GOLDEN.seeds);
});

test('the random stream of a seed never changes (golden) and stays in [0, 1)', () => {
  const random = createRandom(seedsFromSerial('CC26-KQX-418207'));
  assert.deepEqual([random(), random(), random()], GOLDEN.stream);

  let sum = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
    sum += value;
  }
  const mean = sum / 20_000;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `stream is lopsided: mean ${mean}`);
});

test('the same serial always draws the same plate', () => {
  for (const serial of manySerials(50)) {
    assert.deepEqual(deriveEdition(serial), deriveEdition(serial));
  }
  const edition = deriveEdition('CC26-KQX-418207');
  assert.equal(edition.serial, 'CC26-KQX-418207');
  assert.ok(Object.isFrozen(edition) && Object.isFrozen(edition.orbits), 'editions are read-only');
  assert.deepEqual(deriveEdition('cc26 kqx 418207'), edition, 'any accepted spelling draws the same plate');
});

test('deriveEdition refuses a serial that is not one', () => {
  for (const wrong of ['', 'nonsense', 'CC26-KIX-418207', null, undefined]) {
    assert.throws(() => deriveEdition(wrong), RangeError);
  }
});

test('different serials draw different plates', () => {
  const serials = [...new Set(manySerials(600))];
  const plates = new Set(serials.map((serial) => JSON.stringify({ ...deriveEdition(serial), serial: '' })));
  assert.equal(plates.size, serials.length, 'two serials drew an identical plate');

  // Neighbouring serials must not look like neighbours.
  const a = deriveEdition('CC26-KQX-418207');
  const b = deriveEdition('CC26-KQX-418208');
  assert.notDeepEqual({ ...a, serial: '' }, { ...b, serial: '' });
});

test('every plate stays inside what the renderer can draw', () => {
  const kinds = new Set();
  const inkSeen = new Set();

  for (const serial of manySerials(3000)) {
    const edition = deriveEdition(serial);
    const where = (what) => `${serial}: ${what}`;

    for (const [path, value] of numbersIn(edition)) {
      assert.ok(Number.isFinite(value), where(`${path} is ${value}`));
    }

    // Inks
    assert.ok(Number.isInteger(edition.ink.pair), where('ink pair index'));
    assert.ok(edition.ink.pair >= 0 && edition.ink.pair < INK_PAIRS.length, where('ink pair range'));
    inkSeen.add(edition.ink.pair);
    for (const channel of [...edition.ink.a, ...edition.ink.b]) {
      assert.ok(channel >= 0 && channel <= 1, where(`ink channel ${channel}`));
    }
    assert.equal(edition.ink.a.length, 3);
    assert.equal(edition.ink.b.length, 3);
    assert.ok(edition.ink.angle >= 0 && edition.ink.angle < TAU, where('iris angle'));

    // The two rosette bands
    assert.notEqual(edition.inner.kind, edition.outer.kind, where('bands should contrast'));
    for (const [name, band] of [['inner', edition.inner], ['outer', edition.outer]]) {
      kinds.add(band.kind);
      if (band.kind === 'weave') {
        const { waves, strands, scallops, depth, phase } = band.weave;
        assert.ok(Number.isInteger(waves) && waves >= 3, where(`${name} weave waves ${waves}`));
        assert.ok(Number.isInteger(strands) && strands >= 4, where(`${name} weave strands ${strands}`));
        assert.ok(Number.isInteger(scallops) && scallops >= 0, where(`${name} scallops ${scallops}`));
        assert.ok(depth >= 0 && depth <= 0.4, where(`${name} scallop depth ${depth}`));
        assert.ok(phase >= 0 && phase < TAU, where(`${name} weave phase`));
        // Lines per plate unit at the middle of the band: readable, not mush.
        const density = (strands / TAU) * Math.hypot(2 / band.width, waves / band.radius);
        assert.ok(density >= 30 && density <= 100, where(`${name} weave density ${density.toFixed(1)}`));
      } else {
        assert.ok(band.kind === 'rings' || band.kind === 'rays', where(`${name} kind ${band.kind}`));
        assert.equal(band.families.length, 2, where(`${name} needs two crossing families`));
        for (const family of band.families) {
          const { rings, rays, lobes, amp, twist, phase } = family;
          assert.ok(Number.isInteger(rays), where(`${name} rays must be whole or the seam shows`));
          assert.ok(Number.isInteger(lobes) && lobes >= 0, where(`${name} lobes ${lobes}`));
          assert.ok(amp >= 0, where(`${name} amp ${amp}`));
          assert.ok(phase >= 0 && phase < TAU, where(`${name} phase ${phase}`));
          // Each line must stay a single clean curve: the field has to rise
          // steadily across the band, or steadily around it.
          const steadyAcross = Math.abs(rings) > amp * (Math.PI + Math.abs(twist));
          const steadyAround = Math.abs(rays) / TAU > amp * lobes;
          assert.ok(steadyAcross || steadyAround, where(`${name} ${band.kind} family folds over itself`));
          if (band.kind === 'rings') {
            assert.equal(rays, 0, where(`${name} rings have no rays`));
            assert.ok(Number.isInteger(rings) && rings >= 6, where(`${name} ring count ${rings}`));
            assert.ok(rings / band.width <= 100, where(`${name} rings too dense`));
          } else {
            assert.ok(Math.abs(rays) >= 24, where(`${name} ray count ${rays}`));
            assert.ok(Math.abs(rays) / (TAU * band.radius) <= 60, where(`${name} rays too dense`));
            // Two pens lace the rays without lifting (js/film.js). The lace only
            // closes up when the lean is a whole odd number of rays that shares
            // no factor with half the ray count.
            assert.equal(rays % 4, 0, where(`${name} ray count ${rays} is not a multiple of four`));
            const lean = Math.abs(rings);
            assert.ok(Number.isInteger(lean) && lean % 2 === 1, where(`${name} rays lean by ${rings}`));
            assert.equal(gcd(lean, rays / 2), 1, where(`${name}: ${rays} rays leaning ${lean} lace into more than two lines`));
          }
        }
        if (band.kind === 'rays') {
          const [out, back] = band.families;
          assert.ok(out.rings > 0 && back.rings === -out.rings, where(`${name} rays are not mirror images`));
        }
      }
    }

    // The two braided borders
    assert.equal(edition.braids.length, 2);
    for (const braid of edition.braids) {
      assert.ok(Number.isInteger(braid.waves) && braid.waves >= 8, where(`braid waves ${braid.waves}`));
      assert.ok(Number.isInteger(braid.strands) && braid.strands >= 2 && braid.strands <= 6, where('braid strands'));
      assert.ok(braid.phase >= 0 && braid.phase < TAU, where('braid phase'));
    }

    // Orbits: five, outside the rim, never touching each other
    assert.equal(edition.orbits.length, 5);
    edition.orbits.forEach((orbit, i) => {
      assert.ok(Number.isInteger(orbit.lobes) && orbit.lobes >= 0, where(`orbit ${i} lobes`));
      assert.ok(orbit.amp >= 0 && orbit.amp < 0.08, where(`orbit ${i} amp ${orbit.amp}`));
      assert.ok(orbit.phase >= 0 && orbit.phase < TAU, where(`orbit ${i} phase`));
      assert.ok(orbit.radius * (1 - orbit.amp) > 1.06, where(`orbit ${i} cuts into the medallion`));
      if (i > 0) {
        const below = edition.orbits[i - 1];
        const gap = orbit.radius * (1 - orbit.amp) - below.radius * (1 + below.amp);
        assert.ok(gap > 0.08, where(`orbits ${i - 1} and ${i} are ${gap.toFixed(3)} apart`));
      }
    });
    assert.ok(edition.orbits[4].radius * (1 + edition.orbits[4].amp) < 2.9, where('outer orbit too wide'));

    // Bodies: one per orbit, always moving, never racing
    assert.equal(edition.bodies.length, 5);
    assert.deepEqual(edition.bodies.map((body) => body.orbit).sort(), [0, 1, 2, 3, 4], where('one body per orbit'));
    for (const body of edition.bodies) {
      assert.ok(body.angle >= 0 && body.angle < TAU, where('body angle'));
      assert.ok(body.period >= 60 && body.period <= 900, where(`body period ${body.period}s`));
    }

    // The seal
    assert.ok(Number.isInteger(edition.seal.teeth), where('seal teeth'));
    assert.ok(edition.seal.teeth >= 24 && edition.seal.teeth <= 96, where(`seal teeth ${edition.seal.teeth}`));
    assert.ok(edition.seal.hue >= 0 && edition.seal.hue < 1, where('seal hue'));

    // The three small rosettes beside the services
    assert.equal(edition.stamps.length, 3);
    for (const stamp of edition.stamps) {
      assert.ok(Number.isInteger(stamp.waves) && stamp.waves >= 3, where(`stamp waves ${stamp.waves}`));
      assert.ok(Number.isInteger(stamp.strands) && stamp.strands >= 4 && stamp.strands <= 24, where('stamp strands'));
      assert.ok(stamp.phase >= 0 && stamp.phase < TAU, where('stamp phase'));
    }

    assert.ok(edition.spin === 1 || edition.spin === -1, where(`spin ${edition.spin}`));
    assert.ok(Number.isInteger(edition.fibres) && edition.fibres >= 0, where('fibre seed'));
  }

  assert.deepEqual([...kinds].sort(), ['rays', 'rings', 'weave'], 'every band kind should turn up');
  assert.equal(inkSeen.size, INK_PAIRS.length, 'every ink pair should turn up');
});

test('the plate of a known serial never changes (golden)', () => {
  // Same warning as the seed golden: this is what a shared link reproduces.
  const edition = deriveEdition('CC26-KQX-418207');
  assert.equal(JSON.stringify(edition), GOLDEN.plate);
});

// Filled in from the first working implementation, then left alone.
// One change since, made before the site went live (so no shared link drew the
// old plate): on 15 November 2026 the seal was widened to carry the full logo,
// which narrows the inner band. Only the inner band's numbers moved.
const GOLDEN = {
  seeds: [3170553454,1203336375,568024509,1609991821],
  stream: [0.3048645700328052,0.07213532645255327,0.6682987969834358],
  plate: "{\"serial\":\"CC26-KQX-418207\",\"ink\":{\"pair\":2,\"a\":[0.07058823529411765,0.20784313725490197,0.3568627450980392],\"b\":[0.054901960784313725,0.4196078431372549,0.4],\"angle\":1.1543246478320754},\"inner\":{\"kind\":\"rings\",\"radius\":0.404,\"width\":0.192,\"families\":[{\"rings\":11,\"rays\":0,\"lobes\":8,\"amp\":1.587108202993404,\"twist\":-1.4601035029627383,\"phase\":0.8797937000133003},{\"rings\":11,\"rays\":0,\"lobes\":8,\"amp\":1.587108202993404,\"twist\":1.4601035029627383,\"phase\":0.8797937000133003}]},\"outer\":{\"kind\":\"rays\",\"radius\":0.7675000000000001,\"width\":0.275,\"families\":[{\"rings\":7,\"rays\":160,\"lobes\":0,\"amp\":0.7232309223036282,\"twist\":9.42477796076938,\"phase\":1.2807145202947234},{\"rings\":-7,\"rays\":160,\"lobes\":0,\"amp\":0.7232309223036282,\"twist\":9.42477796076938,\"phase\":4.422307173884516}]},\"braids\":[{\"waves\":37,\"strands\":4,\"phase\":4.2863310742770295},{\"waves\":50,\"strands\":2,\"phase\":1.1220981498119358}],\"orbits\":[{\"radius\":1.1535147235474548,\"lobes\":2,\"amp\":0.011305687815416604,\"phase\":2.9670775688388833},{\"radius\":1.4117041943482123,\"lobes\":4,\"amp\":0.026269785658922046,\"phase\":1.343893614586167},{\"radius\":1.7492632426351309,\"lobes\":6,\"amp\":0.015681255135219542,\"phase\":3.5743503573080586},{\"radius\":2.1187118688292803,\"lobes\":6,\"amp\":0.014823186407331377,\"phase\":2.964525695503116},{\"radius\":2.6138747531201694,\"lobes\":6,\"amp\":0.01943616850161925,\"phase\":3.0293785919037073}],\"bodies\":[{\"orbit\":0,\"angle\":5.223168639009433,\"period\":118.06871361633182},{\"orbit\":1,\"angle\":1.471775298258617,\"period\":159.06768002649386},{\"orbit\":2,\"angle\":3.5843235906373003,\"period\":193.07787883337627},{\"orbit\":3,\"angle\":6.09857696850216,\"period\":287.92664544153627},{\"orbit\":4,\"angle\":2.003816876467006,\"period\":343.70095209897806}],\"seal\":{\"teeth\":72,\"hue\":0.5795042961835861},\"drop\":{\"take\":0.8843503003008664,\"turn\":-0.753709273505956},\"stamps\":[{\"waves\":12,\"strands\":12,\"phase\":3.56280692132333},{\"waves\":5,\"strands\":12,\"phase\":6.208890968636461},{\"waves\":9,\"strands\":8,\"phase\":5.921652821797555}],\"spin\":-1,\"fibres\":148919678}",
};
