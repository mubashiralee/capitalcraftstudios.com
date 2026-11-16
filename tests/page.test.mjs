// Checks on the page's own files that need no browser.
// Run with: node --test tests/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The body of the first `@media (...)` block whose condition contains `condition`. */
function mediaBlock(css, condition) {
  const start = css.indexOf(`@media ${condition}`);
  assert.ok(start >= 0, `no @media ${condition} block`);
  let depth = 0;
  for (let at = css.indexOf('{', start); at < css.length; at += 1) {
    if (css[at] === '{') depth += 1;
    if (css[at] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, at + 1);
  }
  throw new Error(`the @media ${condition} block never closes`);
}

/** Every class name `script` gives to an element it makes. */
function classesMadeBy(script) {
  const given = /(?:className = |setAttribute\('class', |class: )'([^']+)'/g;
  return [...new Set([...script.matchAll(given)].flatMap(([, names]) => names.split(/\s+/)))];
}

test('the classes js/sheets.js gives to what it makes are its own: the page\'s markup uses none of them', () => {
  // 15 November 2026: the next arrow was first given the class "next", which the
  // Studio sheet's "Next" paragraph already had. That paragraph's rules (a row,
  // with padding above it) pushed the arrow low and left in its circle, and the
  // arrow's rules reached the paragraph.
  const made = classesMadeBy(read('js/sheets.js'));
  for (const expected of ['onward', 'onward__dial', 'onward__arrow', 'sheet__shade', 'dock__mark']) {
    assert.ok(made.includes(expected), `js/sheets.js no longer makes anything with the class "${expected}": this check has lost sight of it`);
  }
  const html = read('index.html');
  const inMarkup = new Set([...html.matchAll(/\sclass="([^"]+)"/g)].flatMap(([, names]) => names.split(/\s+/)));
  assert.ok(inMarkup.has('next') && inMarkup.has('sheet'), 'this check is not reading the page\'s class names');
  const css = read('css/site.css');
  for (const name of made) {
    assert.ok(!inMarkup.has(name), `js/sheets.js makes an element with the class "${name}", which index.html already uses for something else`);
    assert.ok(new RegExp(`\\.${name}(?![\\w-])`).test(css), `nothing in css/site.css styles the class "${name}" that js/sheets.js gives out`);
  }
});

test('with reduced motion nothing transitions at all, so a size read straight after a change is the final size', () => {
  // The stack of sheets measures itself the moment it is switched on. A blanket
  // "transition-duration: 0.01ms" makes every property a transition, however
  // short, and a measurement taken in that instant reads the old value: dock
  // links then landed a lip short of each sheet (15 November 2026).
  const reduced = mediaBlock(read('css/site.css'), '(prefers-reduced-motion: reduce)');
  assert.match(reduced, /transition-duration:\s*0s\s*!important/);
  assert.match(reduced, /transition-delay:\s*0s\s*!important/);
  assert.doesNotMatch(reduced, /transition-duration:\s*0?\.\d+m?s/);
});
