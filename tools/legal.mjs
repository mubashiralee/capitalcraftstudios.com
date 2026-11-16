// Prints the Money Tycoon legal documents as pages of this site.
//
// The words are not written here. They come from data that
// tools/import-legal.py makes from saved copies of the published pages, and
// this file only sets them: which heading, which list, which box. It works
// things out and returns text; tools/make-legal.mjs writes the files, and
// tests/legal.test.mjs fails if a printed page says anything the data does
// not, or falls behind it.
//
// Content this file does not know (a new tag, a new kind of box) stops the
// printing. A legal page must not lose a paragraph because a tool skipped it.

import { headerLogo } from './logo.mjs';

/** The documents, in the order they are offered. Paths are relative to the site folder. */
export const DOCUMENTS = Object.freeze(
  [
    {
      slug: 'privacy-policy',
      name: 'Privacy policy',
      description: 'The privacy policy for Money Tycoon, the finance game for iPhone and Android by CapitalCraft Studios.',
    },
    {
      slug: 'terms-of-service',
      name: 'Terms of service',
      description: 'The terms of service for Money Tycoon, the finance game for iPhone and Android by CapitalCraft Studios.',
    },
  ].map((document) =>
    Object.freeze({
      ...document,
      data: `legal/money-tycoon/${document.slug}.json`,
      source: `legal/money-tycoon/source/${document.slug}.html`,
      page: `money-tycoon/${document.slug}/index.html`,
    }),
  ),
);

/**
 * Links that stay on this site. Where a document points at its sister on the
 * old site, the reader is kept here instead; every other link goes where the
 * published page sends it.
 */
export const IN_SITE = Object.freeze({
  'https://mubashiralee.github.io/moneytycoon.app/privacy-policy': '../privacy-policy/',
  'https://mubashiralee.github.io/moneytycoon.app/terms-of-service': '../terms-of-service/',
});

/** The kinds of box the published pages use, and the class each wears here (css/legal.css). */
const BOXES = Object.freeze({
  'effective-date': 'legal__date',
  highlight: 'legal__note',
  summary: 'legal__summary',
  'platform-card': 'legal__platforms',
  'deletion-card': 'legal__card',
  muted: 'legal__aside',
});

const PLAIN = new Set(['h1', 'h3', 'p', 'ul', 'ol', 'li', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'strong', 'em', 'code']);
const INLINE = new Set(['strong', 'em', 'code', 'a', 'br']);

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attribute = (text) => escape(text).replace(/"/g, '&quot;');
const plain = (node) => (typeof node === 'string' ? node : (node.c ?? []).map(plain).join(''));

/** A section's address, made from its heading: "7. Data deletion" becomes "data-deletion". */
function addressOf(heading) {
  const made = plain(heading)
    .replace(/^\s*\d+(\.\d+)*\.?\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!made) throw new Error(`a section heading has no words to make its address from: "${plain(heading)}"`);
  return /^[a-z]/.test(made) ? made : `section-${made}`;
}

function classOf(node) {
  if (node.cls === undefined) return '';
  if (!(node.cls in BOXES)) throw new Error(`the page uses a kind of box this tool does not know: class "${node.cls}" on <${node.t}>`);
  return ` class="${BOXES[node.cls]}"`;
}

function hrefOf(node) {
  const href = node.href ?? '';
  if (href in IN_SITE) return { href: IN_SITE[href], outside: false };
  if (/^https:\/\/[^\s"<>]+$/.test(href)) return { href, outside: true };
  if (/^mailto:[^\s"<>]+$/.test(href)) return { href, outside: false };
  throw new Error(`a link goes somewhere this tool will not print: "${href}"`);
}

/** One piece of the document as markup. `indent` is how deep it sits, for a page a person can read. */
function set(node, indent, sections) {
  if (typeof node === 'string') return escape(node);
  const pad = '  '.repeat(indent);
  const inner = (children) => {
    const blocks = children.some((child) => typeof child !== 'string' && !INLINE.has(child.t));
    if (!blocks) return children.map((child) => set(child, indent, sections)).join('');
    // Blocks each take a line; loose words between them (a box that opens with a bold title) take one too.
    return `\n${children.map((child) => `${pad}  ${set(child, indent + 1, sections)}`).join('\n')}\n${pad}`;
  };

  switch (node.t) {
    case 'br':
      return '<br>';
    case 'hr':
      return '<hr class="legal__rule">';
    case 'a': {
      const { href, outside } = hrefOf(node);
      return `<a href="${attribute(href)}"${outside ? ' rel="noopener"' : ''}>${inner(node.c)}</a>`;
    }
    case 'h2': {
      const id = node.id ?? addressOf(node);
      if (sections.some((section) => section.id === id)) throw new Error(`two sections would share the address #${id}`);
      sections.push({ id, title: plain(node) });
      return `<h2 id="${attribute(id)}">${inner(node.c)}</h2>`;
    }
    case 'table':
      // On a narrow screen the table scrolls sideways inside its own frame, which a keyboard can reach.
      return (
        `<div class="legal__table" role="region" aria-label="Table" tabindex="0">\n` +
        `${pad}  <table>${inner(node.c)}</table>\n${pad}</div>`
      );
    default:
      if (!PLAIN.has(node.t)) throw new Error(`this tool does not know how to print <${node.t}>`);
      return `<${node.t}${classOf(node)}>${inner(node.c)}</${node.t}>`;
  }
}

/** The home page's footer, with its links re-aimed for a page two folders down. */
function footerFor(home) {
  const found = home.match(/<footer class="foot">[\s\S]*?<\/footer>/);
  if (!found) throw new Error('the home page has no <footer class="foot"> to copy');
  return found[0].replaceAll('href="money-tycoon/', 'href="../');
}

/** A line of the home page's head that every page of the site shares. */
function shared(home, pattern, what) {
  const found = home.match(pattern);
  if (!found) throw new Error(`the home page has no ${what} to copy`);
  return found[0];
}

/**
 * A whole page for one document.
 * @param {typeof DOCUMENTS[number]} document  which document
 * @param {{ body: object[] }} data            its content (legal/money-tycoon/<slug>.json)
 * @param {string} home                        the home page, for the parts every page shares
 */
export function legalPage(document, data, home) {
  const [title, ...rest] = data.body;
  if (!title || title.t !== 'h1') throw new Error('a document starts with its title, an h1');

  // Under the title: the short lines that date the document. Everything after them is the text.
  let lead = 0;
  while (lead < rest.length && rest[lead].t === 'p' && rest[lead].cls !== 'muted') lead += 1;
  const sections = [];
  const facts = rest.slice(0, lead).map((node) => `        ${set(node, 4, sections)}`);
  const text = rest.slice(lead).map((node, at) => {
    // The line under the closing rule is the document's last word, not a paragraph of it.
    const closing = node.t === 'p' && node.cls === undefined && at > 0 && rest[lead + at - 1].t === 'hr';
    const made = set(node, 4, sections);
    return `        ${closing ? made.replace('<p>', '<p class="legal__aside">') : made}`;
  });
  if (sections.length === 0) throw new Error('a document has sections: none of its headings is an h2');

  const sisters = DOCUMENTS.map(
    (other) => `          <a href="../${other.slug}/"${other === document ? ' aria-current="page"' : ''}>${other.name}</a>`,
  );
  const contents = sections.map(({ id, title: name }) => `          <li><a href="#${attribute(id)}">${escape(name)}</a></li>`);
  const lamp = shared(home, /<button class="lamp"[\s\S]*?<\/button>/, 'lamp button');

  return `<!doctype html>
<html lang="en-GB" class="no-js" data-theme="daylight" data-page="document">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Money Tycoon ${document.name.toLowerCase()} | CapitalCraft Studios</title>
  <meta name="description" content="${attribute(document.description)}">

  <!-- Printed by tools/make-legal.mjs from ${document.data}. Change the data, not this file. -->
  ${shared(home, /<meta http-equiv="Content-Security-Policy" content="[^"]*">/, 'Content-Security-Policy')}
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f5f7f4">

  <link rel="canonical" href="https://capitalcraftstudios.com/money-tycoon/${document.slug}/">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
  <link rel="preload" href="../../fonts/mona-sans-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../css/site.css">
  <link rel="stylesheet" href="../../css/legal.css">
  <script src="../../js/before-paint.js"></script>
  <script type="module" src="../../js/page.js"></script>
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header class="top">
    <a class="brand" href="../../" aria-label="CapitalCraft Studios, home">
      ${headerLogo()}
    </a>
    ${lamp}
  </header>

  <main class="legal" id="main">
    <div class="legal__inner">
      <header class="legal__head">
        <nav class="legal__switch" aria-label="Money Tycoon documents">
${sisters.join('\n')}
        </nav>
        <!-- words -->
        ${set(title, 4, sections)}
${facts.join('\n')}
        <!-- /words -->
      </header>
      <div class="band legal__band" data-band aria-hidden="true"></div>

      <nav class="legal__contents" aria-label="Sections">
        <ul>
${contents.join('\n')}
        </ul>
      </nav>

      <article class="legal__text">
        <!-- words -->
${text.join('\n')}
        <!-- /words -->
      </article>
    </div>
  </main>

  ${footerFor(home)}
</body>
</html>
`;
}
