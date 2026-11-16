// The bodies on the hero's orbits (js/site.config.js, js/bodies.js): every
// product on the page rides one, each body links to something real, and
// bodies that share an orbit are spaced evenly round it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { seatBodies } from '../js/bodies.js';
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
    assert.ok(shares.length <= 2, `orbit ${orbit} carries ${shares.length} bodies: they would crowd`);
    shares.forEach((share, i) => assert.ok(Math.abs(share - i / shares.length) < 1e-12, `orbit ${orbit}: ${shares}`));
  }
  assert.deepEqual(seatBodies([{ orbit: 1 }, { orbit: 0 }, { orbit: 1 }, { orbit: 1 }], 2), [
    { orbit: 1, share: 0 },
    { orbit: 0, share: 0 },
    { orbit: 1, share: 1 / 3 },
    { orbit: 1, share: 2 / 3 },
  ]);
});

test('a body cannot ride an orbit the plate does not have', () => {
  assert.throws(() => seatBodies([{ orbit: 5 }], 5), RangeError);
  assert.throws(() => seatBodies([{ orbit: -1 }], 5), RangeError);
  assert.throws(() => seatBodies([{}], 5), RangeError);
});
