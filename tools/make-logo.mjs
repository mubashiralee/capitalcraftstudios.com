// Writes the logo into every place that carries it:
//   img/logo.svg   the full logo, as a file of its own
//   favicon.svg    the bold C alone, for the browser tab
//   the header of each page listed in tools/logo.mjs
// Run it after changing the logo:  node tools/make-logo.mjs
import { readFileSync, writeFileSync } from 'node:fs';

import { PAGES_WITH_LOGO, faviconSvg, logoSvg, stampHeader } from './logo.mjs';

const site = new URL('../', import.meta.url);
const write = (path, text) => {
  const file = new URL(path, site);
  let before = null;
  try {
    before = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // a missing file is simply written; anything else is a real fault
  }
  if (before === text) {
    console.log(`unchanged  ${path}`);
    return;
  }
  writeFileSync(file, text);
  console.log(`${before === null ? 'created  ' : 'updated  '}  ${path}`);
};

write('img/logo.svg', logoSvg());
write('favicon.svg', faviconSvg());
for (const page of PAGES_WITH_LOGO) write(page, stampHeader(readFileSync(new URL(page, site), 'utf8')));
