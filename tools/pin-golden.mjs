// Re-records the golden values in tests/edition.test.mjs from the current code.
// Run this ONLY when a change to how plates are drawn is intended: it changes
// what every previously shared link shows.  `node tools/pin-golden.mjs`
import { readFileSync, writeFileSync } from 'node:fs';
import { createRandom, deriveEdition, seedsFromSerial } from '../js/edition.js';

const file = new URL('../tests/edition.test.mjs', import.meta.url);
const serial = 'CC26-KQX-418207';
const seeds = seedsFromSerial(serial);
const random = createRandom(seeds);
const golden = `const GOLDEN = {
  seeds: ${JSON.stringify(seeds)},
  stream: ${JSON.stringify([random(), random(), random()])},
  plate: ${JSON.stringify(JSON.stringify(deriveEdition(serial)))},
};
`;
const source = readFileSync(file, 'utf8');
const start = source.indexOf('const GOLDEN = {');
if (start < 0) throw new Error('GOLDEN block not found in tests/edition.test.mjs');
writeFileSync(file, source.slice(0, start) + golden);
console.log('Golden values re-recorded for', serial);
