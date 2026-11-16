// Writes the CapitalCraft logo ("Shared C") out as files and page headers.
//
// The drawing itself lives in js/logo.js, because the page draws it too (on
// the seal's stone). This file wraps that drawing as markup. It only works
// things out: tools/make-logo.mjs writes the results to img/logo.svg,
// favicon.svg and the header of each page, and tests/logo.test.mjs fails if
// any of those copies falls behind.

import { CEE, LOGO_BOX, logoPath, placeCee, placePath } from '../js/logo.js';

export { LOGO_BOX, logoPath, placePath };

/** The pages whose header carries the logo, relative to the site folder. */
export const PAGES_WITH_LOGO = Object.freeze(['index.html', 'money-tycoon/privacy-policy/index.html', 'money-tycoon/terms-of-service/index.html']);

const INK = '#0d1a14';
const PAPER = '#f5f7f4';

/** The logo as it sits in a page header: it takes the colour of the text around it. */
export function headerLogo() {
  return (
    `<svg class="brand__logo" viewBox="0 0 ${LOGO_BOX.width} ${LOGO_BOX.height}" aria-hidden="true" focusable="false">` +
    `<path d="${logoPath()}"/></svg>`
  );
}

/** Put the current logo into a page's header. Throws if the page has no place for it. */
export function stampHeader(html) {
  const place = /<svg class="brand__logo"[\s\S]*?<\/svg>/g;
  const found = html.match(place);
  if (!found || found.length !== 1) {
    throw new Error(`expected one <svg class="brand__logo"> in the page, found ${found ? found.length : 0}`);
  }
  return html.replace(place, headerLogo());
}

/**
 * The logo as a file of its own: ink on nothing, to place on any pale ground.
 * It states a size (a tenth of its box) so that a program showing the bare file has one to use.
 */
export function logoSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO_BOX.width / 10}" height="${LOGO_BOX.height / 10}" ` +
    `viewBox="0 0 ${LOGO_BOX.width} ${LOGO_BOX.height}" role="img" aria-label="CapitalCraft">\n` +
    '  <title>CapitalCraft</title>\n' +
    `  <path fill="${INK}" d="${logoPath()}"/>\n` +
    '</svg>\n'
  );
}

/** The browser-tab icon: the bold C alone, on a tile of the site's ink. */
export function faviconSvg() {
  const { scale, dx, dy } = placeCee(35, 32, 32);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">\n' +
    `  <rect width="64" height="64" rx="14" fill="${INK}"/>\n` +
    `  <path fill="${PAPER}" d="${placePath(CEE.d, scale, dx, dy, 2)}"/>\n` +
    '</svg>\n'
  );
}
