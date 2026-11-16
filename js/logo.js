// The CapitalCraft logo ("Shared C"), as outlines.
//
// One large, light C begins both words: "apital" sits in its mouth at the top,
// "raft" at the bottom. The outlines are letters of the site's own typeface,
// Mona Sans, at width 118: weight 750 for the words, weight 320 for the large
// C (see fonts/OFL.txt). They are kept here as paths, so the logo is the same
// drawing everywhere and never waits on a font.
//
// The page engraves the full logo into the seal's stone. Where there is no room for
// it (the browser tab, the dock) the mark is the bold C on its own, because a
// light letter vanishes at small sizes. tools/logo.mjs wraps the same drawing
// as the files and page headers that carry it.

/**
 * The bold C in font units: 1000 to the em, y growing downwards, the letter
 * sitting on y = 0. `box` is the outline's own extent.
 */
export const CEE = Object.freeze({
  d:
    'M424 10Q330 10 255 -16Q181 -43 129 -92Q76 -141 49 -210Q22 -279 22 -365Q22 -451 49 -520Q76 -589 129 -637' +
    'Q181 -686 255 -712Q330 -738 424 -738Q530 -738 610 -705Q691 -673 739 -614Q787 -555 797 -476H614' +
    'Q605 -511 578 -537Q551 -563 512 -577Q473 -592 424 -592Q358 -592 309 -566Q260 -541 234 -491Q207 -441 207 -365' +
    'Q207 -308 222 -265Q238 -223 266 -195Q295 -166 334 -152Q374 -138 424 -138Q472 -138 512 -152Q552 -167 579 -193' +
    'Q606 -219 615 -254H797Q788 -175 737 -115Q686 -56 606 -23Q525 10 424 10Z',
  box: Object.freeze({ left: 22, right: 797, top: -738, bottom: 10 }),
});

/**
 * Where to put the bold C so that it is `height` tall with its middle at (x, y).
 * @returns {{ scale: number, dx: number, dy: number }} multiply the outline by
 *   `scale`, then move it by (dx, dy).
 */
export function placeCee(height, x = 0, y = 0) {
  if (!(height > 0)) throw new RangeError(`placeCee needs a height above zero, got ${height}`);
  const { left, right, top, bottom } = CEE.box;
  const scale = height / (bottom - top);
  return {
    scale,
    dx: x - (scale * (left + right)) / 2,
    dy: y - (scale * (top + bottom)) / 2,
  };
}

// ---------------------------------------------------------------------------
// The full logo
// ---------------------------------------------------------------------------

/** The logo's box, in font units (1000 to the em). */
export const LOGO_BOX = Object.freeze({ width: 4870, height: 1920 });


// Outlines in font units: y grows downwards and each letter sits on y = 0.
/** The large C: Mona Sans, weight 320, width 118. */
const LARGE_CEE =
    'M416 8Q330 8 260 -18Q190 -44 140 -94Q90 -143 64 -212Q37 -281 37 -364Q37 -449 64 -517Q90 -585 140 -634' +
    'Q190 -684 260 -710Q330 -737 416 -737Q510 -737 584 -706Q658 -676 705 -621Q752 -566 765 -490H694' +
    'Q682 -547 644 -588Q607 -630 548 -653Q490 -676 416 -676Q321 -676 252 -638Q183 -600 146 -530' +
    'Q109 -460 109 -364Q109 -293 130 -235Q152 -178 191 -137Q231 -96 288 -74Q345 -52 416 -52Q492 -52 550 -75' +
    'Q609 -99 647 -142Q684 -185 694 -242H765Q754 -166 707 -109Q660 -53 585 -22Q510 8 416 8Z';

/** The letters of the words: Mona Sans, weight 750, width 118. */
const LETTERS = Object.freeze({
  a:
    'M273 10Q216 10 170 -10Q124 -29 91 -65Q58 -102 40 -153Q22 -204 22 -269Q22 -355 53 -418Q85 -480 141 -513' +
    'Q198 -547 272 -547Q321 -547 357 -535Q394 -524 420 -503Q447 -483 461 -455H468L473 -538H640V0H467L465 -84' +
    'H458Q435 -41 385 -16Q335 10 273 10ZM330 -125Q372 -125 403 -142Q433 -159 448 -188Q464 -218 464 -254V-285' +
    'Q464 -322 448 -351Q432 -379 402 -396Q372 -413 331 -413Q290 -413 260 -396Q231 -379 215 -347' +
    'Q198 -315 198 -269Q198 -224 214 -191Q230 -159 259 -142Q288 -125 330 -125Z',
  f:
    'M99 0V-405H9V-538H99V-583Q99 -654 143 -691Q188 -729 269 -729H398V-614H324Q298 -614 286 -604' +
    'Q274 -593 274 -570V-538H389V-405H274V0Z',
  i:
    'M51 0V-538H226V0ZM139 -595Q93 -595 69 -615Q45 -635 45 -667Q45 -704 71 -722Q97 -740 139 -740' +
    'Q186 -740 210 -720Q234 -701 234 -667Q234 -632 208 -613Q182 -595 139 -595Z',
  l:
    'M51 0V-729H226V0Z',
  p:
    'M51 167V-538H217L223 -455H230Q252 -496 300 -521Q347 -547 418 -547Q475 -547 520 -528Q566 -508 599 -472' +
    'Q633 -437 651 -385Q669 -333 669 -269Q669 -183 638 -120Q606 -58 550 -24Q493 10 417 10Q376 10 339 -2' +
    'Q303 -13 276 -34Q249 -55 233 -84H226V167ZM360 -124Q402 -124 431 -141Q460 -158 477 -191Q493 -223 493 -269' +
    'Q493 -315 477 -346Q461 -378 432 -395Q403 -413 362 -413Q318 -413 288 -396Q258 -379 242 -350' +
    'Q226 -321 226 -285V-254Q226 -217 242 -188Q258 -159 289 -142Q319 -124 360 -124Z',
  r:
    'M51 0V-538H210L216 -454H223Q240 -499 278 -522Q316 -546 368 -546Q379 -546 389 -545Q399 -545 408 -544V-385' +
    'Q398 -387 387 -388Q375 -388 363 -388Q319 -388 289 -374Q259 -360 243 -330Q227 -301 226 -254V0Z',
  t:
    'M248 0Q177 0 142 -36Q106 -72 106 -143V-404H9V-538H106V-675L279 -703V-538H404V-404H279V-189' +
    'Q279 -165 291 -156Q303 -147 324 -147H404V0Z',
});

/** How far each letter of a word is set from the start of the word (the typeface's own spacing, kerning included). */
const WORDS = Object.freeze([
  { letters: 'apital', sets: [0, 671, 1342, 1600, 2009, 2680], baseline: 749 },
  { letters: 'raft', sets: [0, 393, 1064, 1461], baseline: 1899 },
]);
/** Where both words begin: just inside the mouth of the large C. */
const WORDS_START = 1956;
/** The large C stands 2.577 times the height of the letters, so that it spans both lines. */
const LARGE = Object.freeze({ scale: 2.577, dx: -95, dy: 1899 });

/**
 * Scale a path, then move it. The path may use M, L, H, V, Q and Z (absolute)
 * and nothing else: those are the only steps a letter outline here contains.
 * @param {number} places  decimal places to keep
 */
export function placePath(d, scale, dx, dy, places = 0) {
  const tidy = (value) => String(Number(value.toFixed(places)));
  return d.replace(/([A-Za-z])([^A-Za-z]*)/g, (step, command, rest) => {
    if (!'MLHVQZ'.includes(command)) throw new Error(`placePath does not know the path step "${command}" in "${step}"`);
    if (command === 'Z') return 'Z';
    const numbers = rest.trim().split(/[\s,]+/).map(Number);
    if (numbers.some((value) => !Number.isFinite(value))) throw new Error(`placePath met a bad number in "${step}"`);
    const across = (x) => tidy(x * scale + dx);
    const down = (y) => tidy(y * scale + dy);
    if (command === 'H') return `H${numbers.map(across).join(' ')}`;
    if (command === 'V') return `V${numbers.map(down).join(' ')}`;
    return command + numbers.map((value, index) => (index % 2 === 0 ? across(value) : down(value))).join(' ');
  });
}

/** The whole logo as one path, in LOGO_BOX. The large C comes first. */
export function logoPath() {
  let d = placePath(LARGE_CEE, LARGE.scale, LARGE.dx, LARGE.dy);
  for (const word of WORDS) {
    [...word.letters].forEach((letter, index) => {
      d += placePath(LETTERS[letter], 1, WORDS_START + word.sets[index], word.baseline);
    });
  }
  return d;
}

/**
 * The full logo, ready drawn. `reach` is how far the outline gets from the
 * middle of its box: a circle of that radius, on that middle, holds all of it.
 */
export const LOGO = Object.freeze({ d: logoPath(), box: LOGO_BOX, reach: 2610 });

/**
 * Where to put the full logo so that it just fits a circle of `radius` whose middle is (x, y).
 * @returns {{ scale: number, dx: number, dy: number }} multiply the outline by
 *   `scale`, then move it by (dx, dy).
 */
export function placeLogo(radius, x = 0, y = 0) {
  if (!(radius > 0)) throw new RangeError(`placeLogo needs a radius above zero, got ${radius}`);
  const scale = radius / LOGO.reach;
  return {
    scale,
    dx: x - (scale * LOGO.box.width) / 2,
    dy: y - (scale * LOGO.box.height) / 2,
  };
}
