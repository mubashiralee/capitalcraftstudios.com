// The Orchestration Hub's icon: a mind.
//
// The Hub's sheet draws the Hub as a constellation under one glass dome, over
// the desk the floor is run from (js/cortex.js). The icon is that picture made
// small. A dome of glass; under it one lit stone, the orchestrator, with a
// thread running out to a node for each of the four stages a job goes through,
// a deeper blue the further a job has come; and the rim of the desk below.
//
// This file only works the picture out. tools/make-hub-icon.mjs writes it to
// img/orchestration-hub-icon.svg, and tests/hub-icon.test.mjs fails if that
// file falls behind, or if it would not draw.

/** The picture's box. The page shows it at this many pixels (css/site.css: .slab__icon). */
const SIZE = 64;

/** The orchestrator: one lit stone in the middle of the constellation. */
const STONE = Object.freeze([31.6, 29.6]);

/** The colour of the stone and of its light: on the Hub's sheet, the colour of a job held for a person. */
const LIGHT = '#ffb547';

/**
 * The glass: half an ellipse standing on a round rim seen from a little above. `x`, `y` the
 * middle of the rim; `across` half its width; `tall` how far the crown stands over it; `rim`
 * half the height the rim shows on the screen.
 */
const DOME = Object.freeze({ x: 32, y: 39, across: 22, tall: 24.5, rim: 5.2 });

/** The desk under the glass: only its rim, and the light the mind throws down on it. */
const DESK = Object.freeze({ x: 32, y: 51.2, across: 15.5, down: 3.2 });

// A node for each stage, where it stands under the glass, with its colour. A
// job goes Queue, Build, Audit, Merge: lightest to deepest. On the sheet Queue
// and Audit are named on the left of the dome and Build and Merge on the right;
// here they stand the same way.
const NODES = [
  { stage: 'Queue', at: [19.2, 27.4], fill: '#c9eefa' },
  { stage: 'Build', at: [37.8, 19.6], fill: '#a6dff1' },
  { stage: 'Audit', at: [24.6, 37.2], fill: '#8fd3e8' },
  { stage: 'Merge', at: [45, 32.6], fill: '#4f9fd0' },
];

// The small lights between them, and the fine threads that make one constellation of it all.
// A thread names its two ends: a stage, or the number of a small light.
const STARS = [[27.4, 18.8], [38.6, 39.4], [14.6, 35.6], [45.2, 23.8]];
const LINKS = [['Queue', 0], [0, 'Build'], ['Audit', 1], [1, 'Merge'], ['Queue', 2], [2, 'Audit'], ['Build', 3], [3, 'Merge']];

const tenth = (n) => Math.round(n * 10) / 10;
const at = ([x, y]) => `${tenth(x)} ${tenth(y)}`;

/** How far along its radius a quarter of an ellipse's curve is pulled, drawn as one cubic curve. */
const ROUND = 0.5523;

/** A quarter of an ellipse from one end of an axis to an end of the other, as the rest of a path after the point it starts at. */
function quarter([fromX, fromY], [toX, toY], sideways) {
  // Leaving the end of the level axis the curve first runs straight up or down; leaving the end of the upright one, level.
  const c1 = sideways ? [fromX + (toX - fromX) * ROUND, fromY] : [fromX, fromY + (toY - fromY) * ROUND];
  const c2 = sideways ? [toX, toY - (toY - fromY) * ROUND] : [toX - (toX - fromX) * ROUND, toY];
  return `C${at(c1)} ${at(c2)} ${at([toX, toY])}`;
}

const left = [DOME.x - DOME.across, DOME.y];
const right = [DOME.x + DOME.across, DOME.y];
const crown = [DOME.x, DOME.y - DOME.tall];
const near = [DOME.x, DOME.y + DOME.rim];
const far = [DOME.x, DOME.y - DOME.rim];

/** The outline of the glass: from the left of its rim over the crown to the right, and back along the near half of the rim. */
const GLASS = `M${at(left)}${quarter(left, crown, false)}${quarter(crown, right, true)}${quarter(right, near, false)}${quarter(near, left, true)}Z`;
/** The far half of the rim, seen through the glass. */
const RIM = `M${at(right)}${quarter(right, far, false)}${quarter(far, left, true)}`;
/** The rim of the desk. */
const deskLeft = [DESK.x - DESK.across, DESK.y];
const deskRight = [DESK.x + DESK.across, DESK.y];
const DESK_RIM = `M${at(deskLeft)}${quarter(deskLeft, [DESK.x, DESK.y - DESK.down], false)}${quarter([DESK.x, DESK.y - DESK.down], deskRight, true)}${quarter(deskRight, [DESK.x, DESK.y + DESK.down], false)}${quarter([DESK.x, DESK.y + DESK.down], deskLeft, true)}Z`;

/** Where the end of a fine thread is: a stage's node, or a small light. */
const endOf = (end) => (typeof end === 'number' ? STARS[end] : NODES.find((node) => node.stage === end).at);
const line = (from, to) => `M${at(from)}L${at(to)}`;

/** The numbers of the drawing, for the tests to measure: every path here is one the picture draws. */
export const HUB_ICON = Object.freeze({
  size: SIZE,
  stone: STONE,
  light: LIGHT,
  glass: GLASS,
  rim: RIM,
  desk: DESK_RIM,
  nodes: Object.freeze(NODES.map((node) => Object.freeze({ stage: node.stage, fill: node.fill, at: Object.freeze([...node.at]), thread: line(STONE, node.at) }))),
  stars: Object.freeze(STARS.map((star) => Object.freeze([...star]))),
  links: Object.freeze(LINKS.map(([from, to]) => line(endOf(from), endOf(to)))),
});

/**
 * The icon as a file of its own. The page shows it through <img> and rounds its corners, so it is
 * a plain square tile here, and it loads nothing and names no style: a picture shown that way can
 * do neither. It states its size so that a program showing the bare file has one to use.
 *
 * Nothing is cut out with a mask: Safari's engine draws a mask coarsely. The glass is painted over
 * the tile's ground, and what is under it is painted over the glass.
 */
export function hubIconSvg() {
  const [x, y] = STONE;
  const threads = HUB_ICON.nodes.map((node) => node.thread).join('');
  const nodes = HUB_ICON.nodes.flatMap((node) => [
    `  <circle cx="${tenth(node.at[0])}" cy="${tenth(node.at[1])}" r="4.4" fill="${node.fill}" opacity="0.2"/>`,
    `  <circle cx="${tenth(node.at[0])}" cy="${tenth(node.at[1])}" r="2.5" fill="${node.fill}"/>`,
  ]);
  const stars = HUB_ICON.stars.map((star) => `  <circle cx="${tenth(star[0])}" cy="${tenth(star[1])}" r="1.15" fill="#e6f7fd"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- The Orchestration Hub's icon: a mind. A constellation under a dome of glass: one lit stone,
       the orchestrator, with a thread out to a node for each stage a job goes through, over the
       rim of the desk the floor is run from.
       Written by tools/make-hub-icon.mjs from tools/hub-icon.mjs. Change it there, not here. -->
  <defs>
    <radialGradient id="ground" gradientUnits="userSpaceOnUse" cx="19" cy="9" r="68">
      <stop offset="0" stop-color="#37606f"/>
      <stop offset="0.5" stop-color="#173d4c"/>
      <stop offset="1" stop-color="#0b222d"/>
    </radialGradient>
    <linearGradient id="glass" x1="0.18" y1="0.02" x2="0.78" y2="1">
      <stop offset="0" stop-color="#dff4fb" stop-opacity="0.34"/>
      <stop offset="0.5" stop-color="#8fd3e8" stop-opacity="0.09"/>
      <stop offset="1" stop-color="#8fd3e8" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="edge" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#bfe8f5" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#8fd3e8" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="14.6" y1="31" x2="26.4" y2="18.6">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="pool">
      <stop offset="0" stop-color="#8fd3e8" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#8fd3e8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="stone" cx="0.42" cy="0.36" r="0.7">
      <stop offset="0" stop-color="#fff8e6"/>
      <stop offset="0.5" stop-color="${LIGHT}"/>
      <stop offset="1" stop-color="#f08a1c"/>
    </radialGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="${LIGHT}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="seam" gradientUnits="userSpaceOnUse" cx="${x}" cy="${y}" r="15">
      <stop offset="0" stop-color="#fff1cf"/>
      <stop offset="0.45" stop-color="${LIGHT}" stop-opacity="0.85"/>
      <stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#ground)"/>
  <!-- The desk: its rim, and the light the mind throws down on it. -->
  <path d="${HUB_ICON.desk}" fill="url(#pool)" stroke="#8fd3e8" stroke-opacity="0.55" stroke-width="0.9"/>
  <!-- The glass, and the far half of its rim seen through it. -->
  <path d="${HUB_ICON.glass}" fill="url(#glass)"/>
  <path d="${HUB_ICON.rim}" fill="none" stroke="#c9eefa" stroke-opacity="0.4" stroke-width="0.8"/>
  <!-- The constellation: fine threads, then the light running out from the stone along its own. -->
  <path d="${HUB_ICON.links.join('')}" fill="none" stroke="#c9eefa" stroke-opacity="0.66" stroke-width="0.9" stroke-linecap="round"/>
  <path d="${threads}" fill="none" stroke="#c9eefa" stroke-opacity="0.5" stroke-width="0.8" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y}" r="10" fill="url(#glow)"/>
  <path d="${threads}" fill="none" stroke="url(#seam)" stroke-width="1.2" stroke-linecap="round"/>
${stars.join('\n')}
${nodes.join('\n')}
  <circle cx="${x}" cy="${y}" r="3.1" fill="url(#stone)"/>
  <circle cx="${tenth(x - 1.1)}" cy="${tenth(y - 1.2)}" r="0.8" fill="#fff" opacity="0.9"/>
  <!-- The edge of the glass, and one lamp's light on it. -->
  <path d="${HUB_ICON.glass}" fill="none" stroke="url(#edge)" stroke-width="1.25" stroke-linejoin="round"/>
  <path d="M14.6 31C15.4 25.6 19.6 20.6 26.4 18.6" fill="none" stroke="url(#shine)" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;
}
