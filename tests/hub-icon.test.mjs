// Checks on the Orchestration Hub's icon: it is the constellation under glass its sheet draws, made small;
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

test('the icon has a node for each stage of a job the sheet names, each a deeper blue than the one before', () => {
  // js/cortex.js names the stages; the icon has a node for each of them and no others.
  assert.deepEqual(HUB_ICON.nodes.map((node) => node.stage).sort(), REGIONS.map((region) => region.stage).sort());
  const inOrder = STAGES.map((stage) => HUB_ICON.nodes.find((node) => node.stage === stage));
  for (let i = 1; i < inOrder.length; i += 1) {
    assert.ok(
      lightness(inOrder[i].fill) < lightness(inOrder[i - 1].fill),
      `${STAGES[i]} (${inOrder[i].fill}) should be deeper than ${STAGES[i - 1]} (${inOrder[i - 1].fill})`,
    );
  }
});

test('a thread runs from the stone to every stage, and no two leave it close together', () => {
  assert.ok(HUB_ICON.nodes.length > 1, 'there are threads to check: with none, this would pass having looked at nothing');
  for (const node of HUB_ICON.nodes) {
    const line = trace(node.thread);
    assert.deepEqual(line[0], [...HUB_ICON.stone], `the thread to ${node.stage} starts at the stone`);
    assert.deepEqual(line.at(-1), [...node.at], `the thread to ${node.stage} ends at its node`);
    // Long enough to be seen between the stone and the node: both are drawn over its ends.
    assert.ok(Math.hypot(node.at[0] - HUB_ICON.stone[0], node.at[1] - HUB_ICON.stone[1]) > 9, `${node.stage} stands on top of the stone`);
  }
  const ways = HUB_ICON.nodes.map((node) => Math.atan2(node.at[1] - HUB_ICON.stone[1], node.at[0] - HUB_ICON.stone[0]));
  const sorted = [...ways].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    const turn = (sorted[(i + 1) % sorted.length] - sorted[i] + Math.PI * 2) % (Math.PI * 2);
    assert.ok(turn > Math.PI / 4, `two threads leave the stone only ${((turn * 180) / Math.PI).toFixed(0)} degrees apart`);
  }
});

test('the whole constellation is under the glass, and it is one constellation', () => {
  const glass = trace(HUB_ICON.glass);
  const lights = [['the stone', HUB_ICON.stone], ...HUB_ICON.nodes.map((node) => [node.stage, node.at]), ...HUB_ICON.stars.map((star, n) => [`small light ${n}`, star])];
  for (const [name, point] of lights) {
    assert.ok(inside(point, glass), `${name} is outside the glass`);
    assert.ok(nearest(point, glass) > 2.5, `${name} is ${nearest(point, glass).toFixed(2)} from the edge of the glass: it would be drawn across it`);
  }
  // No two lights are drawn on top of each other.
  lights.forEach(([name, point], i) => {
    for (const [other, there] of lights.slice(i + 1)) assert.ok(Math.hypot(point[0] - there[0], point[1] - there[1]) > 6, `${name} and ${other} crowd each other`);
  });
  // Every fine thread joins two of the lights, and every small light is on at least two: none hangs loose.
  const ends = HUB_ICON.links.map((link) => trace(link));
  const on = (point) => ends.filter((line) => line.some((end) => end[0] === point[0] && end[1] === point[1])).length;
  assert.ok(ends.length >= HUB_ICON.stars.length, 'there are fine threads to check');
  for (const line of ends) {
    assert.equal(line.length, 2);
    for (const end of line) assert.ok(lights.some(([, point]) => point[0] === end[0] && point[1] === end[1]), `a fine thread ends at ${end}, where there is no light`);
  }
  HUB_ICON.stars.forEach((star, n) => assert.ok(on(star) >= 2, `small light ${n} is on ${on(star)} threads`));
});

test('the glass is one closed dome on a rim seen from above, with the desk under it', () => {
  const glass = trace(HUB_ICON.glass);
  const rim = trace(HUB_ICON.rim);
  const desk = trace(HUB_ICON.desk);
  assert.ok(HUB_ICON.glass.endsWith('Z') && HUB_ICON.desk.endsWith('Z') && !HUB_ICON.rim.endsWith('Z'));
  const box = (points) => ({ left: Math.min(...points.map((p) => p[0])), right: Math.max(...points.map((p) => p[0])), top: Math.min(...points.map((p) => p[1])), bottom: Math.max(...points.map((p) => p[1])) });
  const g = box(glass);
  const d = box(desk);
  // A dome: wider than it is tall, and far taller above its rim than the rim hangs below.
  const level = glass[0][1]; // the outline starts at the left end of the rim
  assert.ok(Math.abs(glass[0][0] - g.left) < 1e-9, 'the outline does not start at the left of the rim');
  assert.ok(g.right - g.left > g.bottom - g.top && level - g.top > 3 * (g.bottom - level), `the glass is ${g.right - g.left} wide, ${level - g.top} over its rim and ${g.bottom - level} under`);
  // The same on both sides.
  const middle = (g.left + g.right) / 2;
  for (const [x, y] of glass) assert.ok(nearest([2 * middle - x, y], glass) < 0.15, `the glass is not the same on both sides at ${x}, ${y}`);
  // The far half of the rim joins the two ends of the near half, and is seen through the glass.
  assert.ok(nearest(rim[0], glass) < 1e-9 && nearest(rim.at(-1), glass) < 1e-9, 'the far half of the rim does not meet the near half');
  for (const point of rim.slice(1, -1)) assert.ok(inside(point, glass), 'the far half of the rim is outside the glass');
  // The desk is under the glass, clear of it, and narrower: the mind floats over it.
  assert.ok(d.top > g.bottom + 2, `the desk starts ${d.top - g.bottom} under the glass`);
  assert.ok(d.left > g.left + 3 && d.right < g.right - 3 && Math.abs((d.left + d.right) / 2 - middle) < 0.1, 'the desk is not under the middle of the glass');
});

test('the picture sits well inside its tile, clear of the corners the page rounds off', () => {
  const room = 8;
  for (const [name, d] of [['glass', HUB_ICON.glass], ['desk', HUB_ICON.desk]]) {
    for (const [x, y] of trace(d)) {
      assert.ok(x >= room && x <= HUB_ICON.size - room && y >= room && y <= HUB_ICON.size - room, `the ${name} comes within ${room} of the tile's edge at ${x.toFixed(1)}, ${y.toFixed(1)}`);
    }
  }
});

test("the icon's colours are the Hub sheet's own", () => {
  const sheet = read('css/site.css').match(/\.sheet--hub \{([^}]*)\}/)[1];
  const token = (name) => sheet.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))[1];
  assert.equal(HUB_ICON.light, token('held'), 'the stone is the colour of a job held for a person');
  assert.ok(HUB_ICON.nodes.some((node) => node.fill === token('calm')), 'a node is the sheet\'s calm blue');
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
  // Safari's engine draws a mask coarsely: an earlier drawing cut with one came out jagged there. Everything is painted instead.
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
