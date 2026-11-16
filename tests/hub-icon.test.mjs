// Checks on the Orchestration Hub's icon: it is a mind, with a lobe for each stage its sheet names;
// the file in img/ is the current drawing and will draw; and the Hub's sheet shows it.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { REGIONS } from '../js/cortex.js';
import { STAGES } from '../js/floor.js';
import { HUB_ICON, hubIconSvg } from '../tools/hub-icon.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const FILE = 'img/orchestration-hub-icon.svg';

/** Points along a path made of M, L, C and Z (all absolute), close enough together to measure with. */
function trace(d, steps = 24) {
  const points = [];
  let at = null;
  for (const [, command, rest] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    assert.ok('MLCZ'.includes(command), `unexpected path command ${command}`);
    const n = rest.trim() === '' ? [] : rest.trim().split(/[\s,]+/).map(Number);
    assert.ok(n.every(Number.isFinite), `bad number in "${command}${rest}"`);
    if (command === 'M' || command === 'L') {
      for (let i = 0; i < n.length; i += 2) points.push((at = [n[i], n[i + 1]]));
    } else if (command === 'C') {
      for (let i = 0; i < n.length; i += 6) {
        const [a, b, c, e] = [at, [n[i], n[i + 1]], [n[i + 2], n[i + 3]], [n[i + 4], n[i + 5]]];
        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          const u = 1 - t;
          points.push([0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * e[k]));
        }
        at = e;
      }
    }
  }
  return points;
}

/** Is the point inside the closed outline these points trace? */
function inside([x, y], outline) {
  let within = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [ax, ay] = outline[i];
    const [bx, by] = outline[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) within = !within;
  }
  return within;
}

const nearest = (point, points) => Math.min(...points.map((each) => Math.hypot(each[0] - point[0], each[1] - point[1])));

/** How light a colour written as #rrggbb looks, 0 to 1. */
function lightness(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test('the icon has a lobe for each stage of a job the sheet names, each a deeper blue than the one before', () => {
  // js/cortex.js names the stages; the icon has a lobe for each of them and no others.
  assert.deepEqual(HUB_ICON.lobes.map((lobe) => lobe.stage).sort(), REGIONS.map((region) => region.stage).sort());
  const inOrder = STAGES.map((stage) => HUB_ICON.lobes.find((lobe) => lobe.stage === stage));
  for (let i = 1; i < inOrder.length; i += 1) {
    assert.ok(
      lightness(inOrder[i].fill) < lightness(inOrder[i - 1].fill),
      `${STAGES[i]} (${inOrder[i].fill}) should be deeper than ${STAGES[i - 1]} (${inOrder[i - 1].fill})`,
    );
  }
});

test('every groove runs from the stone to the edge of the brain, so that each lobe stands apart', () => {
  const edge = trace(HUB_ICON.cerebrum);
  assert.ok(inside(HUB_ICON.stone, edge), 'the stone sits in the brain');
  assert.ok(HUB_ICON.lobes.length > 1, 'there are grooves to check: with none, this would pass having looked at nothing');
  for (const lobe of HUB_ICON.lobes) {
    const line = trace(lobe.groove);
    assert.deepEqual(line[0], [...HUB_ICON.stone], `the groove before ${lobe.stage} starts at the stone`);
    const end = line.at(-1);
    // Out past the edge is as good as on it. Short of the edge, the cut (half a groove wide round its end) must still reach.
    assert.ok(
      !inside(end, edge) || nearest(end, edge) < HUB_ICON.groove / 2,
      `the groove before ${lobe.stage} stops ${nearest(end, edge).toFixed(2)} short of the edge: two lobes would run together`,
    );
  }
  // No two grooves leave the stone the same way: each lobe is a real part of the brain, not a sliver.
  const ways = HUB_ICON.lobes.map((lobe) => trace(lobe.groove).at(-1)).map(([x, y]) => Math.atan2(y - HUB_ICON.stone[1], x - HUB_ICON.stone[0]));
  const sorted = [...ways].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    const turn = (sorted[(i + 1) % sorted.length] - sorted[i] + Math.PI * 2) % (Math.PI * 2);
    assert.ok(turn > Math.PI / 4, `two grooves leave the stone only ${((turn * 180) / Math.PI).toFixed(0)} degrees apart`);
  }
});

test('the brain sits well inside its tile, clear of the corners the page rounds off', () => {
  const room = 8;
  for (const [name, d] of [['cerebrum', HUB_ICON.cerebrum], ['cerebellum', HUB_ICON.cerebellum], ['stem', HUB_ICON.stem]]) {
    for (const [x, y] of trace(d)) {
      assert.ok(x >= room && x <= HUB_ICON.size - room && y >= room && y <= HUB_ICON.size - room, `the ${name} comes within ${room} of the tile's edge at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    }
  }
});

test("the icon's colours are the Hub sheet's own", () => {
  const sheet = read('css/site.css').match(/\.sheet--hub \{([^}]*)\}/)[1];
  const token = (name) => sheet.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))[1];
  assert.equal(HUB_ICON.light, token('held'), 'the stone is the colour of a job held for a person');
  assert.ok(HUB_ICON.lobes.some((lobe) => lobe.fill === token('calm')), 'a lobe is the sheet\'s calm blue');
});

test('the file in img/ is the current drawing', () => {
  assert.equal(read(FILE), hubIconSvg(), `${FILE} is stale: run node tools/make-hub-icon.mjs`);
});

test('the file will draw as a picture', () => {
  const svg = hubIconSvg();
  // Shown through <img>, a picture must say what it is, may load nothing else, and runs no script.
  const { size } = HUB_ICON;
  assert.ok(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`), 'it must open as an SVG of its own, with its size and its box');
  assert.doesNotMatch(svg, /<script|<image|<style|\bhref=|\bstyle=/);
  // Safari's engine draws a mask coarsely: grooves cut with one came out jagged there. They are painted instead.
  assert.doesNotMatch(svg, /<mask\b|\bmask=/, 'a mask draws jagged in Safari');
  // Two hyphens in a row inside a comment make the whole file unreadable, and nothing draws.
  const comments = [...svg.matchAll(/<!--([\s\S]*?)-->/g)].map((found) => found[1]);
  assert.ok(comments.length > 0, 'the file says what it shows');
  for (const comment of comments) assert.ok(!comment.includes('--') && !comment.endsWith('-'), `a comment holds two hyphens in a row: ${comment.slice(0, 60)}`);
  // Every tag that opens closes, in order.
  const open = [];
  for (const [, closing, name, , selfClosing] of svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z]+)((?:\s[^<>]*?)?)(\/?)>/g)) {
    if (closing) assert.equal(open.pop(), name, `</${name}> closes nothing`);
    else if (!selfClosing) open.push(name);
  }
  assert.deepEqual(open, [], 'a tag is left open');
  // Every gradient, clip and mask that is asked for is there, and none is there unasked for.
  const made = [...svg.matchAll(/\bid="([^"]+)"/g)].map((found) => found[1]);
  const asked = [...svg.matchAll(/url\(#([^)]+)\)/g)].map((found) => found[1]);
  assert.equal(new Set(made).size, made.length, 'two parts share a name');
  assert.deepEqual([...new Set(asked)].sort(), [...made].sort());
});

test("the Hub's sheet shows the icon", () => {
  const page = read('index.html');
  const head = page.slice(page.indexOf('<div class="hub__head">'), page.indexOf('<h2 id="hub-title">'));
  assert.ok(head.length > 0, 'the Hub sheet has a head above its title');
  assert.match(head, new RegExp(`<img class="slab__icon" src="${FILE}" width="${HUB_ICON.size}" height="${HUB_ICON.size}" alt="">`));
  assert.doesNotMatch(head, /<svg/, 'the old drawing is still in the page');
});
