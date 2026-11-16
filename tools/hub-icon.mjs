// The Orchestration Hub's icon: a mind.
//
// A brain seen from the side. Each of the four stages a job goes through
// (js/cortex.js names them) has a lobe, a deeper blue the further a job has
// come; the lobes are parted by grooves that all run to one lit stone in the
// middle, where the orchestrator sits, with its light running out along them.
// The Hub's sheet draws the same mind another way: a constellation under glass.
//
// This file only works the picture out. tools/make-hub-icon.mjs writes it to
// img/orchestration-hub-icon.svg, and tests/hub-icon.test.mjs fails if that
// file falls behind, or if it would not draw.

/** The picture's box. The page shows it at this many pixels (css/site.css: .slab__icon). */
const SIZE = 64;

/** The middle of the brain, where the orchestrator sits. */
const STONE = Object.freeze([32.4, 31.6]);

/** The colour of the stone and of its light: on the Hub's sheet, the colour of a job held for a person. */
const LIGHT = '#ffb547';

/** How wide the groove between two lobes is. */
const GROOVE = 2.2;

// The outline of the cerebrum, clockwise from its front: the brain faces left.
// A third number is how round the outline is at that point (1 where none is
// given). It is less at the notch where the groove between the frontal and
// temporal lobes opens.
const CEREBRUM = [
  [10.6, 31.5], [12.6, 23.5], [18.2, 17.2], [26, 13.8], [34, 13.2], [42, 15.2], [48.6, 19.8], [52.6, 26.4],
  [53.4, 33], [50.6, 38.4], [45.4, 40.6], [39.5, 40.2], [35, 42], [30.5, 45.4], [24.8, 46.8], [19.4, 44.6],
  [16.6, 40.6], [18.6, 37.4, 0.35], [14, 37.2],
];

// The cerebellum, tucked under the back of the brain, and the stem that goes down in front of it.
const CEREBELLUM = [[40.8, 44], [45.2, 42.7], [49.8, 41.6], [52.6, 43.4], [52, 47.4], [48.4, 50.6], [43.6, 50.2], [40.8, 47.6]];
const STEM = 'M33.2 41.6C34 45 35 48.4 36.6 51.6L39.6 50.8C38.5 48 38 45 37.9 41.4Z';

// The grooves, clockwise from the top. Each is one curve from the stone to the
// edge of the brain (`c1` and `c2` bend it). The lobe named with a groove is
// the one that lies after it, with the stage that lives there (js/cortex.js)
// and its colour. A job goes Queue, Build, Audit, Merge: lightest to deepest.
const GROOVES = [
  { c1: [28.8, 26.6], c2: [36.4, 20.6], to: [31.2, 12.6], lobe: 'parietal', stage: 'Build', fill: '#a6dff1' },
  { c1: [38, 32.4], c2: [39.6, 23.4], to: [49.8, 19.9], lobe: 'occipital', stage: 'Merge', fill: '#4f9fd0' },
  { c1: [36.6, 33.8], c2: [40.8, 37.2], to: [38.2, 41.6], lobe: 'temporal', stage: 'Audit', fill: '#8fd3e8' },
  { c1: [27.6, 35.8], c2: [22.6, 32.6], to: [17.6, 37.6], lobe: 'frontal', stage: 'Queue', fill: '#c9eefa' },
];

const tenth = (n) => Math.round(n * 10) / 10;
const at = ([x, y]) => `${tenth(x)} ${tenth(y)}`;

/** A smooth closed line through the points, as a path. */
function outline(points) {
  const count = points.length;
  let d = `M${at(points[0])}`;
  for (let i = 0; i < count; i += 1) {
    const before = points[(i - 1 + count) % count];
    const from = points[i];
    const to = points[(i + 1) % count];
    const after = points[(i + 2) % count];
    // A Catmull-Rom curve, written as the cubic Bézier that draws the same line.
    const leave = (from[2] ?? 1) / 6;
    const arrive = (to[2] ?? 1) / 6;
    const c1 = [from[0] + (to[0] - before[0]) * leave, from[1] + (to[1] - before[1]) * leave];
    const c2 = [to[0] - (after[0] - from[0]) * arrive, to[1] - (after[1] - from[1]) * arrive];
    d += `C${at(c1)} ${at(c2)} ${at(to)}`;
  }
  return `${d}Z`;
}

/** A groove as a path: from the stone to the edge of the brain. */
const grooveOf = (groove) => `M${at(STONE)}C${at(groove.c1)} ${at(groove.c2)} ${at(groove.to)}`;

/**
 * Everything between one groove and the next, going clockwise, out to far beyond the brain. The
 * drawing shows only the part of it that lies inside the cerebrum, and that part is the lobe.
 */
function wedge(from, to) {
  const way = (point) => Math.atan2(point[1] - STONE[1], point[0] - STONE[0]);
  const start = way(from.to);
  let end = way(to.to);
  while (end <= start) end += Math.PI * 2;
  const steps = Math.ceil((end - start) / (Math.PI / 3));
  const beyond = Array.from({ length: steps + 1 }, (_, step) => {
    const angle = start + ((end - start) * step) / steps;
    return `${Math.round(STONE[0] + SIZE * Math.cos(angle))} ${Math.round(STONE[1] + SIZE * Math.sin(angle))}`;
  });
  return `${grooveOf(from)}L${beyond.join('L')}L${at(to.to)}C${at(to.c2)} ${at(to.c1)} ${at(STONE)}Z`;
}

/** The numbers of the drawing, for the tests to measure: every path here is one the picture draws. */
export const HUB_ICON = Object.freeze({
  size: SIZE,
  stone: STONE,
  light: LIGHT,
  groove: GROOVE,
  cerebrum: outline(CEREBRUM),
  cerebellum: outline(CEREBELLUM),
  stem: STEM,
  lobes: Object.freeze(GROOVES.map((groove) => Object.freeze({ stage: groove.stage, fill: groove.fill, groove: grooveOf(groove) }))),
});

/**
 * The icon as a file of its own. The page shows it through <img> and rounds its corners, so it is
 * a plain square tile here, and it loads nothing and names no style: a picture shown that way can
 * do neither. It states its size so that a program showing the bare file has one to use.
 *
 * The grooves are not cut out of the lobes with a mask: Safari's engine draws a mask coarsely, and
 * the grooves came out jagged. They are painted over the lobes with the tile's own ground instead,
 * which is measured from the tile's corner and so is the same colour under a groove as beside it.
 */
export function hubIconSvg() {
  const grooves = GROOVES.map(grooveOf).join('');
  const lobes = GROOVES.map((groove, index) => `    <path d="${wedge(groove, GROOVES[(index + 1) % GROOVES.length])}" fill="${groove.fill}"/>`);
  const [x, y] = STONE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <!-- The Orchestration Hub's icon: a mind. A brain seen from the side, a lobe for each stage a job
       goes through, parted by grooves that meet at one lit stone: the desk the floor is run from.
       Written by tools/make-hub-icon.mjs from tools/hub-icon.mjs. Change it there, not here. -->
  <defs>
    <radialGradient id="ground" gradientUnits="userSpaceOnUse" cx="19" cy="9" r="68">
      <stop offset="0" stop-color="#37606f"/>
      <stop offset="0.5" stop-color="#173d4c"/>
      <stop offset="1" stop-color="#0b222d"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0.2" y1="0" x2="0.7" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.26"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#04131b" stop-opacity="0.3"/>
    </linearGradient>
    <radialGradient id="stone" cx="0.42" cy="0.36" r="0.7">
      <stop offset="0" stop-color="#fff8e6"/>
      <stop offset="0.5" stop-color="${LIGHT}"/>
      <stop offset="1" stop-color="#f08a1c"/>
    </radialGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="${LIGHT}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="seam" gradientUnits="userSpaceOnUse" cx="${x}" cy="${y}" r="16">
      <stop offset="0" stop-color="#fff1cf"/>
      <stop offset="0.4" stop-color="${LIGHT}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cerebrum">
      <path d="${HUB_ICON.cerebrum}"/>
    </clipPath>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#ground)"/>
  <path d="${STEM}" fill="#3a72b4"/>
  <path d="${HUB_ICON.cerebellum}" fill="#3f7fc0"/>
  <g clip-path="url(#cerebrum)">
${lobes.join('\n')}
    <rect width="${SIZE}" height="${SIZE}" fill="url(#sheen)"/>
  </g>
  <!-- The grooves between the lobes and the seat the stone sits in, in the tile's own ground. -->
  <path d="${grooves}" fill="none" stroke="url(#ground)" stroke-width="${GROOVE}" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y}" r="4.6" fill="url(#ground)"/>
  <circle cx="${x}" cy="${y}" r="11" fill="url(#glow)"/>
  <path d="${grooves}" fill="none" stroke="url(#seam)" stroke-width="1.15" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y}" r="3.1" fill="url(#stone)"/>
  <circle cx="${tenth(x - 1.1)}" cy="${tenth(y - 1.2)}" r="0.8" fill="#fff" opacity="0.9"/>
</svg>
`;
}
