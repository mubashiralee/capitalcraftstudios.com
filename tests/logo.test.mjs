// Checks on the logo: the letter outlines are sound, and every copy of the
// logo in the site is the current drawing.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CEE, LOGO, placeCee, placeLogo } from '../js/logo.js';
import { LOGO_BOX, PAGES_WITH_LOGO, faviconSvg, headerLogo, logoPath, logoSvg, placePath, stampHeader } from '../tools/logo.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Every point named in a path made of M, L, H, V, Q and Z, as [x, y] pairs (H and V carry the other coordinate on). */
function pointsOf(d) {
  const points = [];
  let x = 0;
  let y = 0;
  for (const [, command, rest] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    assert.ok('MLHVQZ'.includes(command), `unexpected path command ${command}`);
    const numbers = rest.trim() === '' ? [] : rest.trim().split(/[\s,]+/).map(Number);
    assert.ok(numbers.every(Number.isFinite), `bad number in "${command}${rest}"`);
    if (command === 'H') for (const value of numbers) points.push([(x = value), y]);
    else if (command === 'V') for (const value of numbers) points.push([x, (y = value)]);
    else for (let i = 0; i < numbers.length; i += 2) points.push([(x = numbers[i]), (y = numbers[i + 1])]);
  }
  return points;
}
const boxOf = (points) => ({
  left: Math.min(...points.map(([x]) => x)),
  right: Math.max(...points.map(([x]) => x)),
  top: Math.min(...points.map(([, y]) => y)),
  bottom: Math.max(...points.map(([, y]) => y)),
});

test('the bold C is one closed outline, and its stated box is its real extent', () => {
  assert.ok(CEE.d.startsWith('M') && CEE.d.endsWith('Z'));
  assert.equal(CEE.d.match(/M/g).length, 1, 'the C should be a single outline');
  assert.deepEqual(boxOf(pointsOf(CEE.d)), { ...CEE.box });
});

test('placeCee centres the C where asked, at the height asked', () => {
  for (const [height, x, y] of [[100, 0, 0], [38, 32, 32], [0.9, -3, 7.5]]) {
    const { scale, dx, dy } = placeCee(height, x, y);
    const box = boxOf(pointsOf(CEE.d).map(([px, py]) => [px * scale + dx, py * scale + dy]));
    assert.ok(Math.abs(box.bottom - box.top - height) < 1e-9, 'height');
    assert.ok(Math.abs((box.left + box.right) / 2 - x) < 1e-9, 'centred across');
    assert.ok(Math.abs((box.top + box.bottom) / 2 - y) < 1e-9, 'centred up and down');
  }
  assert.throws(() => placeCee(0), RangeError);
  assert.throws(() => placeCee(Number.NaN), RangeError);
});

test('the full logo states how far it reaches from its middle, so that it can be set inside a circle', () => {
  assert.equal(LOGO.d, logoPath());
  assert.deepEqual({ ...LOGO.box }, { ...LOGO_BOX });
  const middle = [LOGO.box.width / 2, LOGO.box.height / 2];
  const far = Math.max(...pointsOf(LOGO.d).map(([x, y]) => Math.hypot(x - middle[0], y - middle[1])));
  assert.ok(far <= LOGO.reach, `a point lies ${far} from the middle, past the stated reach of ${LOGO.reach}`);
  assert.ok(LOGO.reach - far < 8, `the stated reach of ${LOGO.reach} is slack: nothing lies past ${far}`);
});

test('placeLogo sets the whole logo inside the circle asked for, with its middle on the circle\'s middle', () => {
  for (const [radius, x, y] of [[100, 0, 0], [215, 512, 512], [0.8, -3, 7.5]]) {
    const { scale, dx, dy } = placeLogo(radius, x, y);
    const placed = pointsOf(LOGO.d).map(([px, py]) => [px * scale + dx, py * scale + dy]);
    const far = Math.max(...placed.map(([px, py]) => Math.hypot(px - x, py - y)));
    assert.ok(far <= radius * (1 + 1e-9), `the logo reaches ${far}, outside a circle of ${radius}`);
    assert.ok(far > 0.99 * radius, `the logo only reaches ${far} in a circle of ${radius}`);
    const box = boxOf(placed);
    assert.ok(Math.abs((box.left + box.right) / 2 - x) < 0.004 * radius, 'centred across');
    assert.ok(Math.abs((box.top + box.bottom) / 2 - y) < 0.004 * radius, 'centred up and down');
  }
  assert.throws(() => placeLogo(0), RangeError);
  assert.throws(() => placeLogo(Number.NaN), RangeError);
});

test('placePath moves and scales every kind of step, and refuses a step it does not know', () => {
  assert.equal(placePath('M10 20L30 40H50V60Q70 80 90 100Z', 2, 1, -1), 'M21 39L61 79H101V119Q141 159 181 199Z');
  assert.equal(placePath('M-10 -20Z', 0.5, 0, 0), 'M-5 -10Z');
  assert.throws(() => placePath('M0 0C1 1 2 2 3 3Z', 1, 0, 0), /does not know/);
  assert.throws(() => placePath('M0 0l5 5Z', 1, 0, 0), /does not know/);
});

test('the full logo fills its box: the large C at the left, the two words stacked to its right', () => {
  const d = logoPath();
  const outlines = d.split(/(?=M)/);
  // C + a p i t a l + r a f t, with the counters of a, p, a, a and the dot of the i: 11 letters, 16 outlines.
  assert.equal(outlines.length, 16);
  const box = boxOf(pointsOf(d));
  assert.ok(box.left >= 0 && box.left <= 2, `left edge at ${box.left}`);
  assert.ok(box.top >= 0 && box.top <= 4, `top edge at ${box.top}`);
  assert.ok(box.right <= LOGO_BOX.width && box.right >= LOGO_BOX.width - 8, `right edge at ${box.right} of ${LOGO_BOX.width}`);
  assert.ok(box.bottom <= LOGO_BOX.height && box.bottom >= LOGO_BOX.height - 4, `bottom edge at ${box.bottom} of ${LOGO_BOX.height}`);

  // The large C is the first outline and the tallest thing in the logo: it spans both lines of letters.
  const cee = boxOf(pointsOf(outlines[0]));
  assert.ok(cee.bottom - cee.top > 0.97 * LOGO_BOX.height);
  // Nothing else starts until the C's opening: the words sit in its mouth, not on top of it.
  const words = boxOf(pointsOf(outlines.slice(1).join('')));
  assert.ok(words.left > cee.right, `the words start at ${words.left}, inside the C that ends at ${cee.right}`);
  assert.ok(words.left - cee.right < 0.03 * LOGO_BOX.width, 'the words have drifted away from the C');
});

test('every copy of the logo in the site is the current drawing', () => {
  assert.equal(read('img/logo.svg'), logoSvg(), 'img/logo.svg is stale: run node tools/make-logo.mjs');
  assert.equal(read('favicon.svg'), faviconSvg(), 'favicon.svg is stale: run node tools/make-logo.mjs');
  assert.ok(PAGES_WITH_LOGO.length >= 1);
  for (const page of PAGES_WITH_LOGO) {
    const html = read(page);
    assert.equal(stampHeader(html), html, `${page} carries an old logo: run node tools/make-logo.mjs`);
    assert.ok(html.includes(headerLogo()), `${page} does not carry the logo`);
  }
});

test('each logo file states its own size, in the proportions of its drawing', () => {
  // A drawing with a viewBox and no size opens at whatever size the program showing it falls back to.
  for (const [name, svg] of [['img/logo.svg', logoSvg()], ['favicon.svg', faviconSvg()]]) {
    const open = svg.match(/<svg[^>]*>/)[0];
    const size = (attribute) => Number(open.match(new RegExp(`\\s${attribute}="([\\d.]+)"`))?.[1]);
    const [, , boxWidth, boxHeight] = open.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const width = size('width');
    const height = size('height');
    assert.ok(width > 0 && height > 0, `${name} does not state its width and height`);
    assert.ok(Math.abs(width / height - boxWidth / boxHeight) < 0.005, `${name} states ${width} by ${height}, not the shape of its drawing`);
  }
});

test('the logo files are plain drawings: no scripts, no links out, nothing loaded from elsewhere', () => {
  for (const svg of [logoSvg(), faviconSvg(), headerLogo()]) {
    assert.ok(!/<script|href=|url\(|<image|<foreignObject|\son\w+=/i.test(svg), 'the logo markup reaches outside itself');
  }
});
