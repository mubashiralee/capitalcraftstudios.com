// Put together the folder that is published: the pages and what they load, and
// nothing else (no tests, no tools, no working files).
//
//   node tools/make-site.mjs <folder to write>
//
// It stops with an error if any page points at a local file that did not make
// it into the folder, so a broken link cannot be published.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Everything the site serves, as paths under the site's folder. */
// CNAME and .nojekyll are for GitHub Pages: the site's domain, and "serve these files as they are".
export const SERVED = Object.freeze(['index.html', '404.html', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'CNAME', '.nojekyll', 'css', 'js', 'fonts', 'img', 'money-tycoon']);

/** Every file under a folder, as paths relative to it. */
function filesUnder(folder, inside = '') {
  return readdirSync(join(folder, inside)).flatMap((name) => {
    const path = join(inside, name);
    return statSync(join(folder, path)).isDirectory() ? filesUnder(folder, path) : [path];
  });
}

/** The local files a page or a script names. Addresses on other sites, and places within a page, are not files. */
function named(file, text) {
  const found = [];
  const add = (address) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(address)) return;
    const path = address.split(/[?#]/)[0];
    if (path === '') return;
    // An address that starts with "/" is counted from the top of the site.
    const at = path.startsWith('/') ? path.slice(1) : join(dirname(file), path);
    found.push(normalize(at.endsWith('/') || at === '' ? join(at, 'index.html') : at));
  };
  if (file.endsWith('.html')) {
    for (const [, address] of text.matchAll(/\s(?:src|href)="([^"]*)"/g)) add(address);
    for (const [, set] of text.matchAll(/\ssrcset="([^"]*)"/g)) for (const part of set.split(',')) add(part.trim().split(/\s+/)[0]);
  } else if (file.endsWith('.js')) {
    for (const [, address] of text.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) add(address);
  } else if (file.endsWith('.css')) {
    for (const [, address] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) if (!address.startsWith('data:')) add(address);
  }
  return found;
}

/**
 * Write the published folder.
 * @returns {string[]} the files written, as paths under `out`
 */
export function makeSite(out) {
  const target = resolve(out);
  if (target === SITE || SITE.startsWith(`${target}/`)) throw new RangeError(`The published folder cannot be the site's own folder or one above it: ${target}`);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of SERVED) {
    if (!existsSync(join(SITE, name))) throw new Error(`The site has no "${name}" to publish.`);
    cpSync(join(SITE, name), join(target, name), { recursive: true });
  }
  const files = filesUnder(target);
  const missing = [];
  for (const file of files) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    for (const wanted of named(file, readFileSync(join(target, file), 'utf8'))) {
      if (!existsSync(join(target, wanted))) missing.push(`${file} names ${wanted}`);
    }
  }
  if (missing.length > 0) throw new Error(`Not published. These files are named but are not in the folder:\n  ${missing.join('\n  ')}`);
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node tools/make-site.mjs <folder to write>');
    process.exit(2);
  }
  const files = makeSite(out);
  console.log(`${files.length} files written to ${relative(process.cwd(), resolve(out)) || '.'}`);
}
