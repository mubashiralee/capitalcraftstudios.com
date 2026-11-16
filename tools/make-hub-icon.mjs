// Writes the Orchestration Hub's icon to img/orchestration-hub-icon.svg, the file its sheet shows.
// Run it after changing the drawing in tools/hub-icon.mjs:  node tools/make-hub-icon.mjs
import { writeFileSync } from 'node:fs';

import { hubIconSvg } from './hub-icon.mjs';

const path = 'img/orchestration-hub-icon.svg';
writeFileSync(new URL(`../${path}`, import.meta.url), hubIconSvg());
console.log(`written  ${path}`);
