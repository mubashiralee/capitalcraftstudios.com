// The folder that is published (tools/make-site.mjs): the pages and what they
// load, and nothing else.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SERVED, makeSite } from '../tools/make-site.mjs';

const SITE = fileURLToPath(new URL('..', import.meta.url)); // not .pathname: that keeps a space as %20

test('the published folder holds the pages and what they load, and no tests, tools or working files', () => {
  const out = mkdtempSync(join(tmpdir(), 'cc-site-'));
  try {
    const files = makeSite(out);
    for (const page of ['index.html', '404.html', 'money-tycoon/privacy-policy/index.html', 'money-tycoon/terms-of-service/index.html', 'js/main.js', 'css/site.css', 'img/share.jpg', 'fonts/OFL.txt', 'robots.txt', 'sitemap.xml']) {
      assert.ok(files.includes(page), `${page} is not published`);
    }
    for (const file of files) {
      assert.ok(SERVED.some((name) => file === name || file.startsWith(`${name}/`)), `${file} should not be published`);
      assert.doesNotMatch(file, /(^|\/)(tests|tools|legal|\.github|\.impeccable|__pycache__)(\/|$)|\.test\.|\.DS_Store/, `${file} should not be published`);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a page that names a file which is not there stops the publishing', () => {
  const out = mkdtempSync(join(tmpdir(), 'cc-site-'));
  const page = join(SITE, 'index.html');
  const good = readFileSync(page, 'utf8');
  try {
    writeFileSync(page, good.replace('href="css/site.css"', 'href="css/missing.css"'));
    assert.throws(() => makeSite(out), /index\.html names css\/missing\.css/);
  } finally {
    writeFileSync(page, good);
    rmSync(out, { recursive: true, force: true });
  }
  assert.equal(readFileSync(page, 'utf8'), good);
  assert.ok(existsSync(page));
});

test('the sitemap lists every page, at the address the page itself gives as its own', () => {
  const sitemap = readFileSync(join(SITE, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((found) => found[1]).sort();
  const own = ['index.html', 'money-tycoon/privacy-policy/index.html', 'money-tycoon/terms-of-service/index.html']
    .map((page) => readFileSync(join(SITE, page), 'utf8').match(/<link rel="canonical" href="([^"]+)">/)[1])
    .sort();
  assert.deepEqual(listed, own);
  assert.match(readFileSync(join(SITE, 'robots.txt'), 'utf8'), /^Sitemap: https:\/\/capitalcraftstudios\.com\/sitemap\.xml$/m);
});
