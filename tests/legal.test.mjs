// Checks on the Money Tycoon legal pages: the privacy policy and the terms of
// service, printed in this site's design.
// Run with: node --test tests/
//
// The owner's brief: the two documents "should also be properly integrated to
// the website and reviewed and re-designed". Redesigned means how they look.
// What they say is a legal text and is not this site's to change, so most of
// these checks are about the words: the printed pages must say exactly what
// the published pages say.
//
// How the pages are made:
//   legal/money-tycoon/source/*.html   saved copies of the published pages
//   tools/import-legal.py              turns a saved copy into data (and proves the words match)
//   legal/money-tycoon/*.json          that data
//   tools/make-legal.mjs               prints the pages from the data
//   money-tycoon/<document>/index.html the printed pages

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import { DOCUMENTS, IN_SITE, legalPage } from '../tools/legal.mjs';

const site = new URL('../', import.meta.url);
const read = (path) => {
  assert.ok(existsSync(new URL(path, site)), `${path} is missing: run node tools/make-legal.mjs`);
  return readFileSync(new URL(path, site), 'utf8');
};
const home = () => read('index.html');
const dataOf = (document) => JSON.parse(read(document.data));

const BLOCKS = ['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'hr'];
const APART = [...BLOCKS, 'br', 'header', 'article', 'section', 'nav'];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', rarr: '→', mdash: '—', ndash: '–' };
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    assert.ok(name in ENTITIES, `this test does not know the entity ${whole}`);
    return ENTITIES[name];
  });
}

/** The text a reader sees in a piece of HTML: blocks and line breaks part words, inline tags do not. */
function textOf(html) {
  const apart = new RegExp(`</?(?:${APART.join('|')})\\b[^>]*>`, 'gi');
  return decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(apart, ' ').replace(/<[^>]+>/g, ''));
}

/** The parts of a printed page that carry the document's own words. */
function wordsRegions(page) {
  const regions = [...page.matchAll(/<!-- words -->([\s\S]*?)<!-- \/words -->/g)].map(([, inside]) => inside);
  assert.ok(regions.length >= 1, 'the page marks where the document\'s own words are');
  return regions.join('\n');
}

/** The data's words, in order, worked out here and not by the tool under test. */
function wordsOfData(nodes) {
  const pieces = [];
  const walk = (node) => {
    if (typeof node === 'string') {
      pieces.push(node);
      return;
    }
    const apart = BLOCKS.includes(node.t) || node.t === 'br';
    if (apart) pieces.push(' ');
    (node.c ?? []).forEach(walk);
    if (apart) pieces.push(' ');
  };
  nodes.forEach(walk);
  return pieces.join('').split(/\s+/).filter(Boolean);
}

/** Every node of the data with this tag. */
function nodesOf(nodes, tag) {
  const found = [];
  const walk = (node) => {
    if (typeof node === 'string') return;
    if (node.t === tag) found.push(node);
    (node.c ?? []).forEach(walk);
  };
  nodes.forEach(walk);
  return found;
}
const plain = (node) => (typeof node === 'string' ? node : (node.c ?? []).map(plain).join(''));

test('there are two documents, each with its data, its saved copy and its printed page', () => {
  assert.deepEqual(DOCUMENTS.map(({ slug }) => slug), ['privacy-policy', 'terms-of-service']);
  for (const document of DOCUMENTS) {
    assert.equal(document.page, `money-tycoon/${document.slug}/index.html`);
    const data = dataOf(document);
    // The published pages are where the apps and the stores send people. Their addresses are not this site's to change.
    assert.equal(data.source, `https://mubashiralee.github.io/moneytycoon.app/${document.slug}`);
    assert.match(data.saved, /^\d{4}-\d{2}-\d{2}$/);
    read(document.source);
    read(document.page);
  }
});

test('each printed page is current: it is what the tool prints from the data today', () => {
  for (const document of DOCUMENTS) {
    assert.equal(read(document.page), legalPage(document, dataOf(document), home()), `${document.page} is stale: run node tools/make-legal.mjs`);
  }
});

test('a printed page says what its data says: every word, in order, nothing added', () => {
  for (const document of DOCUMENTS) {
    const data = dataOf(document);
    const printed = textOf(wordsRegions(read(document.page))).split(/\s+/).filter(Boolean);
    const meant = wordsOfData(data.body);
    assert.equal(meant.length, data.words, `${document.slug}: the data holds as many words as the importer counted`);
    assert.ok(meant.length > 500, `${document.slug}: a legal document, not a stub`);
    assert.deepEqual(printed, meant, `${document.slug}: the printed words differ from the data`);
  }
});

test('a printed page says what the saved copy of the published page says', () => {
  for (const document of DOCUMENTS) {
    const saved = read(document.source);
    const body = saved.slice(saved.indexOf('<body'), saved.lastIndexOf('</body>')).replace(/<style[\s\S]*?<\/style>/gi, '');
    assert.ok(body.length > 5000, `${document.slug}: the saved copy has a body`);
    // Compared with every space taken out: the two are laid out differently, the letters must be the same.
    const squeeze = (html) => textOf(html).replace(/\s+/g, '');
    assert.equal(squeeze(wordsRegions(read(document.page))), squeeze(body), `${document.slug}: the printed page and the saved copy differ`);
  }
});

test('the privacy policy keeps the place the stores link to: #data-deletion is its section on deleting data', () => {
  const page = read('money-tycoon/privacy-policy/index.html');
  assert.equal(page.match(/id="data-deletion"/g).length, 1);
  assert.match(page, /<h2 id="data-deletion">7\. Data deletion and account deletion<\/h2>/);
});

test('the contents list names every section once, in order, and each link lands on its heading', () => {
  for (const document of DOCUMENTS) {
    const page = read(document.page);
    const sections = nodesOf(dataOf(document).body, 'h2').map(plain);
    assert.ok(sections.length >= 12, `${document.slug}: the document has its sections`);

    const list = page.match(/<nav class="legal__contents"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(list, `${document.slug}: the page has a contents list`);
    const links = [...list[1].matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map(([, id, title]) => ({ id, title: decode(title) }));
    assert.deepEqual(links.map(({ title }) => title), sections, `${document.slug}: one link for each section, in the document's order`);

    const ids = [...page.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);
    assert.equal(new Set(ids).size, ids.length, `${document.slug}: no id is used twice`);
    for (const { id, title } of links) {
      assert.match(id, /^[a-z][a-z0-9-]*$/, `${document.slug}: "${title}" has a plain address, not #${id}`);
      const heading = page.match(new RegExp(`<h2 id="${id}">([^<]*)</h2>`));
      assert.ok(heading, `${document.slug}: #${id} is a section heading`);
      assert.equal(decode(heading[1]), title);
    }
  }
});

test('the printed pages keep the site\'s rule: nothing inline, nothing from another company\'s servers', () => {
  const rule = home().match(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/);
  assert.ok(rule, 'the home page states the rule');
  for (const document of DOCUMENTS) {
    const page = read(document.page);
    assert.ok(page.includes(rule[0]), `${document.slug}: states the same rule as the home page`);
    assert.doesNotMatch(page, / style=/, `${document.slug}: no inline styles`);
    assert.doesNotMatch(page, /<style/, `${document.slug}: no style block`);
    assert.doesNotMatch(page, / on[a-z]+=/, `${document.slug}: no inline handlers`);
    const scripts = [...page.matchAll(/<script\b[^>]*>/g)].map(([tag]) => tag);
    assert.ok(scripts.length >= 1);
    for (const tag of scripts) assert.match(tag, / src="\.\.\/\.\.\/js\/[a-z-]+\.js"/, `${document.slug}: ${tag} loads a file of this site`);
    for (const [tag] of page.matchAll(/<(?:link|img|source)\b[^>]*>/g)) {
      const address = tag.match(/ (?:href|src)="([^"]*)"/)[1];
      if (/rel="canonical"/.test(tag)) {
        assert.equal(address, `https://capitalcraftstudios.com/money-tycoon/${document.slug}/`);
      } else {
        assert.match(address, /^\.\.\/\.\.\//, `${document.slug}: ${tag} loads a file of this site`);
      }
    }
  }
});

test('every link in a document goes where the published page sends it, except to its sister document, which is on this site', () => {
  assert.deepEqual(IN_SITE, {
    'https://mubashiralee.github.io/moneytycoon.app/privacy-policy': '../privacy-policy/',
    'https://mubashiralee.github.io/moneytycoon.app/terms-of-service': '../terms-of-service/',
  });
  let moved = 0;
  for (const document of DOCUMENTS) {
    const meant = nodesOf(dataOf(document).body, 'a').map(({ href }) => {
      if (href in IN_SITE) moved += 1;
      return IN_SITE[href] ?? href;
    });
    const tags = [...wordsRegions(read(document.page)).matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
    assert.deepEqual(tags.map((tag) => decode(tag.match(/ href="([^"]*)"/)[1])), meant, `${document.slug}: the links, in order`);
    for (const tag of tags) {
      const outside = / href="https:/.test(tag);
      assert.equal(/ rel="noopener"/.test(tag), outside, `${document.slug}: ${tag} is ${outside ? '' : 'not '}a link to another site`);
      assert.doesNotMatch(tag, / href="(?!https:\/\/|mailto:capitalcraftgames@gmail\.com|\.\.\/)/, `${document.slug}: ${tag} goes somewhere unexpected`);
    }
  }
  assert.ok(moved >= 1, 'the terms point to the privacy policy, and that link now stays on this site');
});

test('the home page and both documents send readers to this site\'s copies, and carry the same company details', () => {
  const footOf = (html) => html.match(/<footer class="foot">[\s\S]*?<\/footer>/)[0];
  const foot = footOf(home());
  assert.match(foot, /<a href="money-tycoon\/privacy-policy\/">Money Tycoon privacy policy<\/a>/);
  assert.match(foot, /<a href="money-tycoon\/terms-of-service\/">Money Tycoon terms of service<\/a>/);
  assert.doesNotMatch(home(), /mubashiralee\.github\.io/, 'the home page no longer sends readers to the old copies');

  for (const document of DOCUMENTS) {
    const page = read(document.page);
    const theirs = footOf(page);
    assert.equal(
      theirs,
      foot.replaceAll('href="money-tycoon/', 'href="../'),
      `${document.slug}: the footer is the home page's, with its links re-aimed for this folder`,
    );
    // The two documents link to each other at the head of the page; the one you are on says so.
    const sister = DOCUMENTS.find((other) => other !== document);
    assert.match(page, new RegExp(`<a href="\\.\\./${document.slug}/" aria-current="page">${document.name}</a>`));
    assert.match(page, new RegExp(`<a href="\\.\\./${sister.slug}/">${sister.name}</a>`));
    assert.match(page, /<a class="brand" href="\.\.\/\.\.\/"/, `${document.slug}: the logo leads home`);
  }
});

test('the printer escapes what it prints, and refuses content it does not know instead of dropping it', () => {
  const [document] = DOCUMENTS;
  const sheet = (body) => ({ source: 'https://example.test/x', saved: '2026-11-15', pageTitle: 'x', words: 0, body });
  const heading = { t: 'h1', c: ['A & B'] };
  const section = { t: 'h2', c: ['1. <One>'] };

  const page = legalPage(document, sheet([heading, section, { t: 'p', c: ['if a < b & b > c, say "so"'] }]), home());
  assert.ok(page.includes('<h1>A &amp; B</h1>'));
  assert.ok(page.includes('if a &lt; b &amp; b &gt; c, say "so"'));
  assert.ok(page.includes('<h2 id="one">1. &lt;One&gt;</h2>'), 'a heading\'s address is made from its words, without its number');

  assert.throws(() => legalPage(document, sheet([heading, section, { t: 'marquee', c: ['x'] }]), home()), /marquee/);
  assert.throws(() => legalPage(document, sheet([heading, section, { t: 'p', cls: 'flashing', c: ['x'] }]), home()), /flashing/);
  assert.throws(() => legalPage(document, sheet([heading, section, { t: 'a', href: 'javascript:alert(1)', c: ['x'] }]), home()), /javascript/);
  assert.throws(() => legalPage(document, sheet([section]), home()), /h1/, 'a document starts with its title');
  assert.throws(
    () => legalPage(document, sheet([heading, section, { t: 'h2', c: ['2. One'] }]), home()),
    /one/,
    'two sections may not share an address',
  );
});
