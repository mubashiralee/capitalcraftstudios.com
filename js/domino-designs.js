// The designs a visitor can choose for the dominoes: what each set is made of.
// js/dominoes.js hands these numbers to the shaders (js/domino-shaders.js), and
// the page has one button per design (index.html, `data-design`).
//
// A colour is the share of red, green and blue light the surface sends back,
// each from 0 to 1.

/** How the body of a domino is figured. The shader reads the number. */
export const PATTERN = Object.freeze({ plain: 0, veined: 1, grained: 2, brushed: 3 });

const BLACK_LACQUER = [0.012, 0.01, 0.016];
const GOLD_LEAF = [1, 0.77, 0.34];

/**
 * @typedef {Object} Design
 * @property {string} key the name the page and the visitor's saved choice use
 * @property {string} name what a screen reader calls it
 * @property {number[]} body the colour of the block
 * @property {number[]} vein its second colour: the veins in stone, the dark of the grain in wood
 * @property {keyof typeof PATTERN} pattern
 * @property {number} metal 0 for stone, wood and lacquer; 1 for metal
 * @property {number} polish 0 (satin) to 1 (a mirror finish)
 * @property {number[]} mark the colour of the pips and the bar
 * @property {number} markMetal 1 if the marks are inlaid metal
 * @property {number} markGlow how brightly the marks shine by themselves
 */

/** @type {readonly Design[]} */
export const DESIGNS = Object.freeze([
  { key: 'ivory', name: 'Ivory', body: [0.86, 0.81, 0.72], vein: [0.86, 0.81, 0.72], pattern: 'plain', metal: 0, polish: 0.8, mark: BLACK_LACQUER, markMetal: 0, markGlow: 0 },
  { key: 'obsidian', name: 'Obsidian', body: [0.016, 0.016, 0.022], vein: [0.016, 0.016, 0.022], pattern: 'plain', metal: 0, polish: 1, mark: GOLD_LEAF, markMetal: 1, markGlow: 0 },
  { key: 'marble', name: 'Marble', body: [0.88, 0.87, 0.85], vein: [0.34, 0.35, 0.4], pattern: 'veined', metal: 0, polish: 0.9, mark: GOLD_LEAF, markMetal: 1, markGlow: 0 },
  { key: 'walnut', name: 'Walnut', body: [0.36, 0.19, 0.09], vein: [0.11, 0.05, 0.022], pattern: 'grained', metal: 0, polish: 0.35, mark: [0.9, 0.86, 0.78], markMetal: 0, markGlow: 0 },
  { key: 'gold', name: 'Gold', body: [1, 0.76, 0.33], vein: [1, 0.76, 0.33], pattern: 'brushed', metal: 1, polish: 0.6, mark: BLACK_LACQUER, markMetal: 0, markGlow: 0 },
  { key: 'reactor', name: 'Reactor', body: [0.03, 0.028, 0.045], vein: [0.03, 0.028, 0.045], pattern: 'plain', metal: 0, polish: 0.9, mark: [1, 0.1, 0.42], markMetal: 0, markGlow: 1 },
].map(Object.freeze));

/** The design called `key`. */
export function designOf(key) {
  const found = DESIGNS.find((design) => design.key === key);
  if (!found) throw new Error(`There is no domino design called "${key}".`);
  return found;
}
