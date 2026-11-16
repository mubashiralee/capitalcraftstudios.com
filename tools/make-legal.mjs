// Prints the Money Tycoon legal pages from their data:
//   legal/money-tycoon/<document>.json  ->  money-tycoon/<document>/index.html
// Run it after importing a new copy of a document (tools/import-legal.py), and
// after changing the home page's footer or the logo, which these pages share:
//   node tools/make-legal.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { DOCUMENTS, legalPage } from './legal.mjs';

const site = new URL('../', import.meta.url);
const home = readFileSync(new URL('index.html', site), 'utf8');

for (const document of DOCUMENTS) {
  const data = JSON.parse(readFileSync(new URL(document.data, site), 'utf8'));
  const page = legalPage(document, data, home);
  const file = new URL(document.page, site);
  let before = null;
  try {
    before = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // a missing page is simply printed; anything else is a real fault
  }
  if (before === page) {
    console.log(`unchanged  ${document.page}`);
    continue;
  }
  mkdirSync(new URL('./', file), { recursive: true });
  writeFileSync(file, page);
  console.log(`${before === null ? 'created  ' : 'updated  '}  ${document.page}  (${data.words} words)`);
}
