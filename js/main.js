// Page behaviour: picks the edition, runs the plate and the orbiting bodies,
// lays the ornaments on each sheet, and starts the page's other moving parts
// (the stack of sheets, the lamp, the turntable, the dominoes).

import {
  EDITION_COUNT,
  PLATE,
  chooseSerial,
  deriveEdition,
  formatSerial,
  mintSerial,
  mintUnlike,
  secureRandomInt,
  serialParts,
  stampFrom,
} from './edition.js';
import { startBooks } from './books-view.js';
import { startDominoes } from './dominoes.js';
import { castDrop, lifted, silhouette } from './drop.js';
import { inkRamp } from './film.js';
import { startHub } from './hub.js';
import { startLamp } from './lamp.js';
import { markCanvas } from './mark.js';
import { Spring, TAU, clamp, finePointer, reduceMotion } from './motion.js';
import { TILT, createPlate } from './plate.js';
import { startRosettes } from './rosettes.js';
import { startSheets } from './sheets.js';
import { SITE } from './site.config.js';
import { bandMarkup, fibresMarkup, rosetteMarkup, stillPlateMarkup, turntableMarkup } from './stamps.js';
import { startTracer } from './tracer.js';
import { startPhones } from './phones.js';
import { TURNTABLE_REACH, startTurntable } from './turntable.js';

const root = document.documentElement;
const one = (selector, scope = document) => scope.querySelector(selector);
const all = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const hero = one('.hero');
const canvas = one('.hero__plate');
const front = one('.hero__front');
const frontInk = front.getContext('2d');
const slot = one('[data-plate-slot]');
const bodiesLayer = one('.hero__bodies');
const serialEl = one('[data-serial]');
const noteEl = one('[data-edition-note]');
const redrawButton = one('[data-redraw]');
const sealButton = one('[data-seal]');
const copyButton = one('[data-copy]');
const speedBar = one('[data-speed]');
const fibreEls = all('[data-fibres]');
const bandEls = all('[data-band]');
const stampEls = all('[data-stamp]');
const turntableFloor = one('[data-floor]');
const copyBlocks = all('[data-keep-clear]');

const wideScreen = matchMedia('(min-width: 900px)');

/** The height of the band of lines at the head of a sheet, in CSS pixels (css/site.css gives it the same). */
const BAND_HEIGHT = 38;

const count = EDITION_COUNT.toLocaleString('en-GB');

/**
 * Start one of the page's moving parts. Each has a still version in the page
 * already, so if one cannot start we say so and leave the rest standing.
 */
function start(name, begin) {
  try {
    return begin();
  } catch (error) {
    console.error(`${name} could not start; its still version is shown instead.`, error);
    return null;
  }
}

/**
 * Put generated SVG into an element. The markup comes only from js/stamps.js,
 * which builds it from numbers (never from text a visitor or a link supplied),
 * so there is nothing in it that could carry script.
 */
function setOrnament(el, markup) {
  el.innerHTML = markup;
}
const easeOut = (t) => 1 - (1 - t) ** 3;
const steady = (t) => t; // a pen moves at one speed

// The film of the plate being drawn, in milliseconds at normal speed. The
// film's own timeline (which of the ten lines is drawn when) is worked out in
// js/film.js. The film is the lines and nothing else: the seal's stone is let
// go when it ends, and keeps its own time (see STONE below).
const FILM = { open: 8100, redraw: 6750, rewind: 520 };

// The seal's stone (js/drop.js). It is let go the moment the last line is done
// and falls, wobbles and settles in its own time: a stone takes as long to fall
// as it takes, whatever the film is doing. `lift` is how long it takes to be
// lifted away again when the plate is redrawn: less than the film's rewind, so
// it is gone before the next plate's lines begin.
const STONE = { lift: 0.36 };

// The small films of the ornaments on the sheets below: each is drawn, line by line, when its part of
// the page arrives (js/tracer.js). Milliseconds at normal speed, like the times in FILM.
const ORNAMENT = { band: { duration: 1300, pens: true }, rosette: { duration: 1150 }, floor: { duration: 1500 } };

// The speed bar. It counts in doublings: -2 is a quarter of normal speed, 0 is
// normal, 2 is four times. Close to the middle it settles on normal.
// `normal` is the pace of the bar's middle: the times in FILM are divided by
// it, so at 1 the opening film runs for about 9 seconds. (For a while it was
// 0.54, a slower pace the owner picked; on 15 November 2026 the owner asked for
// the middle back.) The key is renumbered whenever `normal` changes, so that a
// setting saved against the old middle is not read against the new one.
const SPEED = { slowest: -2, fastest: 2, settle: 0.12, normal: 1, key: 'cc-speed-3' };

/** Where the serial of the last plate shown is kept, so that the next one can be made to look different. */
const LAST_KEY = 'cc-edition';

/** How fast the plate lives: the film, the turning rings and the bodies all keep this time. */
let tempo = SPEED.normal;

let edition = null;
let origin = 'visit';
let plate = null;
let dominoRun = null;
let stack = null;
let tracer = null;
let bodyEls = [];
let keepClear = [];
let running = false;
let loop = 0; // each start of the frame loop gets a number; a frame from an older start stops itself
let lastFrame = 0;
let heroInView = true;
let heroCovered = false; // the next sheet lies over the hero (js/sheets.js says when)
let hoveredBody = false;
let drop = null; // this edition's drop: where its seal's stone is at each moment after it is let go (js/drop.js)
let drawing = 0; // counts redraws, so a newer press takes over from an older one
let filmShown = 0; // where the film was at the last frame drawn
let inFront = null; // the part of the front canvas that has the stone drawn in it, in its own pixels: [left, top, width, height]

const view = { width: 1, height: 1, anchorX: 0, anchorY: 0, radius: 100, tilt: 0.95, ratio: 1 };
const pointer = { x: 0, y: 0, active: false };
const state = {
  clock: 0, // seconds the plate has been alive
  orbit: 0, // seconds the bodies have been travelling (stops while one is hovered)
  orbitRate: new Spring(1, 60),
  // The film. It runs on time spent in view, so it waits while the hero is off
  // screen or the tab is in the background, and carries on where it stopped.
  reveal: { value: 0, from: 0, to: 0, elapsed: 0, duration: 0, ease: steady, paced: true, done: null },
  // The seal's stone: seconds since it was let go (below 0: it has not been), and how far it has been lifted away again (0..1).
  stone: { time: -1, lift: 0 },
  uv: root.dataset.theme === 'uv' ? 1 : 0,
  lightX: new Spring(0, 90),
  lightY: new Spring(0, 90),
  presence: new Spring(0.75, 40),
  yaw: new Spring(0, 34),
  lean: new Spring(0, 34),
  loupe: new Spring(0, 70),
  loupeAt: [0, 3],
};
const pace = { average: 16, since: 0, floor: 0.75 };

// ---------------------------------------------------------------------------
// The edition
// ---------------------------------------------------------------------------

const mint = () => mintSerial({ randomInt: secureRandomInt, year: new Date().getFullYear() });

/** The serial of the plate this browser showed last, or null. */
function recallEdition() {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch (error) {
    // Storage is blocked. Editions are still fresh each time; they are just not compared with the last.
    console.info('The last edition could not be read:', error.name);
    return null;
  }
}

function rememberEdition(serial) {
  try {
    localStorage.setItem(LAST_KEY, serial);
  } catch (error) {
    console.info('The edition could not be noted on this device:', error.name);
  }
}

function showEdition(serial, from) {
  edition = deriveEdition(serial);
  origin = from;
  rememberEdition(edition.serial);

  const { series, letters, digits } = serialParts(serial);
  const digitSpans = [...digits].map((digit) => {
    const span = document.createElement('span');
    span.textContent = digit;
    return span;
  });
  const group = (className, ...children) => {
    const span = document.createElement('span');
    span.className = className;
    span.append(...children);
    return span;
  };
  serialEl.replaceChildren(
    group('serial__part', series),
    ' ',
    group('serial__part', letters),
    ' ',
    group('serial__digits', ...digitSpans),
  );
  noteEl.textContent =
    from === 'link' ? `One of ${count}. Shared with you by link.` : `One of ${count}. Drawn for this visit.`;

  const css = (rgb) => `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(' ')})`;
  root.style.setProperty('--ink-a', css(edition.ink.a));
  root.style.setProperty('--ink-b', css(edition.ink.b));
  // The fan of five inks the plate's lines are drawn in. The bands on the sheets use the same five.
  inkRamp(edition.ink.a, edition.ink.b).forEach((ink, index) => {
    root.style.setProperty(`--edition-${index + 1}`, css(ink));
  });

  stampEls.forEach((el, index) => {
    setOrnament(el, rosetteMarkup(edition.stamps[index % edition.stamps.length]));
  });
  setOrnament(turntableFloor, turntableMarkup(edition.stamps[0], { feet: 3, reach: TURNTABLE_REACH }));
  // The domino run winds the way this edition's plate turns.
  if (dominoRun) dominoRun.lay({ spin: edition.spin });
  layFibres();
  layBands();

  if (plate) {
    plate.setEdition(edition);
    // The stone's wobble goes round the way the plate turns.
    drop = castDrop({ ...edition.drop, way: edition.spin });
    engraveHiddenWords();
  } else {
    setOrnament(slot, stillPlateMarkup(edition));
  }
}

/** Scatter the security fibres over each sheet of paper: a different scatter on each. */
function layFibres() {
  if (!edition) return;
  fibreEls.forEach((el, index) => {
    const width = Math.round(el.clientWidth);
    const height = Math.round(el.clientHeight);
    if (width > 0 && height > 0) setOrnament(el, fibresMarkup(edition.fibres + index * 7919, width, height));
  });
}

/** Draw the band of lines at the head of each sheet, at the width it has now. */
function layBands() {
  if (!edition) return;
  bandEls.forEach((el, index) => {
    el.dataset.drawn = ''; // from a hairline to a band (css/site.css)
    const width = el.clientWidth;
    if (!(width > 0)) return;
    const stamp = edition.stamps[index % edition.stamps.length];
    setOrnament(el, bandMarkup({ waves: stamp.waves + 2 * index, phase: stamp.phase + index }, width, BAND_HEIGHT));
  });
  if (tracer) tracer.relay(); // the lines are new: the tracer takes hold of them, drawn as far as each ornament's film has got
}

// ---------------------------------------------------------------------------
// Lettering for the plate (drawn to small canvases, then handed to the GPU)
// ---------------------------------------------------------------------------

const WORDS_HEIGHT = 64;

/**
 * Draw one copy of `text` sized to run round a ring a whole number of times.
 * @returns {{ canvas: HTMLCanvasElement, repeats: number }}
 */
function ringWords(text, ring) {
  const radius = (ring.inner + ring.outer) / 2;
  let around = ((TAU * radius) / (ring.outer - ring.inner)) * WORDS_HEIGHT; // ring length, in texture px
  const letters = [...text];
  const probe = document.createElement('canvas').getContext('2d');
  const fontAt = (size) => `650 ${size}px "Mona Sans", system-ui, sans-serif`;

  let size = 52; // capitals fill about 60% of the ring
  let tracking = size * 0.12;
  const measure = () => {
    probe.font = fontAt(size);
    return letters.map((letter) => probe.measureText(letter).width + tracking);
  };
  let advances = measure();
  let total = advances.reduce((sum, advance) => sum + advance, 0);

  const repeats = Math.max(1, Math.round(around / total));
  const share = around / repeats; // the room one copy has
  if (share < total) {
    size *= share / total; // too long: smaller letters
    tracking = size * 0.12;
  } else {
    tracking += (share - total) / letters.length; // too short: air between letters
  }
  advances = measure();
  total = advances.reduce((sum, advance) => sum + advance, 0);

  // Stay inside what the GPU accepts.
  const limit = plate ? plate.maxTextureSize : 2048;
  const squeeze = Math.min(1, limit / total);
  around *= squeeze;

  const words = document.createElement('canvas');
  words.width = Math.max(2, Math.round(total * squeeze));
  words.height = WORDS_HEIGHT;
  const ctx = words.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, words.width, words.height);
  ctx.fillStyle = '#fff';
  ctx.font = fontAt(size);
  ctx.textBaseline = 'alphabetic';
  ctx.scale(squeeze, 1);
  const baseline = WORDS_HEIGHT / 2 + size * 0.365; // centres the capitals
  let x = tracking / 2;
  letters.forEach((letter, index) => {
    ctx.fillText(letter, x, baseline);
    x += advances[index];
  });
  return { canvas: words, repeats };
}

function engraveLegend() {
  const legend = ringWords(SITE.inscription, PLATE.inscription);
  plate.setWords('legal', legend.canvas, legend.repeats);
  plate.setWords('mark', markCanvas(Math.min(1024, plate.maxTextureSize))); // the mark frosted into the seal's stone
}

function engraveHiddenWords() {
  const text = SITE.hiddenInscription
    .replace('{serial}', formatSerial(edition.serial))
    .replace('{count}', count);
  const hidden = ringWords(text, PLATE.edition);
  plate.setWords('edition', hidden.canvas, hidden.repeats);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function layout() {
  const heroBox = hero.getBoundingClientRect();
  const slotBox = slot.getBoundingClientRect();
  view.width = heroBox.width;
  view.height = heroBox.height;
  view.anchorX = slotBox.left - heroBox.left + slotBox.width / 2;
  view.anchorY = slotBox.top - heroBox.top + slotBox.height / 2;
  view.radius = slotBox.width / 2;
  view.tilt = wideScreen.matches ? TILT.wide : TILT.narrow;

  keepClear = copyBlocks.map((el) => {
    const box = el.getBoundingClientRect();
    return {
      left: box.left - heroBox.left - 28,
      right: box.right - heroBox.left + 28,
      top: box.top - heroBox.top - 22,
      bottom: box.bottom - heroBox.top + 22,
    };
  });

  if (plate) plate.resize(view.width, view.height, view.ratio);
  else placeSeal(); // the live plate places its seal's button every frame; the still plate needs it done here
  if (!running) drawOnce();
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/** Where the light rests when no pointer is steering it: a slow wander above the plate. */
function restingLight(clock) {
  return {
    x: view.anchorX - view.radius * (0.55 + 0.5 * Math.cos(clock * 0.19)),
    y: view.anchorY - view.radius * (0.42 + 0.28 * Math.sin(clock * 0.27)),
  };
}

function step(dt) {
  const beat = dt * tempo;
  state.clock += beat;
  state.orbit += beat * state.orbitRate.step(hoveredBody ? 0 : 1, dt);

  const { reveal } = state;
  if (reveal.duration > 0) {
    reveal.elapsed += 1000 * (reveal.paced ? beat : dt);
    const t = clamp(reveal.elapsed / reveal.duration, 0, 1);
    reveal.value = reveal.from + (reveal.to - reveal.from) * reveal.ease(t);
    if (t >= 1) {
      reveal.duration = 0;
      const { done } = reveal;
      reveal.done = null;
      if (done) done();
    }
  }

  // The seal's stone is let go when the last line is done. The speed bar slows
  // or quickens it too, but by half as much as it does the film: a stone at a
  // quarter of its speed would hang in the air. When the lines are taken up
  // again for a new plate, it is lifted away.
  const { stone } = state;
  if (reveal.value >= 1 && reveal.duration === 0) {
    stone.lift = 0;
    stone.time = stone.time < 0 ? 0 : stone.time + dt * Math.sqrt(tempo / SPEED.normal);
  } else if (stone.time >= 0) {
    stone.lift += dt / STONE.lift;
    if (stone.lift >= 1) Object.assign(stone, { time: -1, lift: 0 });
  }

  const uvTarget = root.dataset.theme === 'uv' ? 1 : 0;
  state.uv += (uvTarget - state.uv) * (1 - Math.exp(-dt * 9));

  const steering = pointer.active;
  const idle = restingLight(state.clock);
  const lightX = state.lightX.step(steering ? pointer.x : idle.x, dt);
  const lightY = state.lightY.step(steering ? pointer.y : idle.y, dt);
  state.presence.step(steering ? 1 : 0.78, dt);

  // The plate leans a little toward the pointer.
  const offX = steering ? clamp((pointer.x - view.anchorX) / (view.radius * 2.4), -1, 1) : 0;
  const offY = steering ? clamp((pointer.y - view.anchorY) / (view.radius * 2.4), -1, 1) : 0;
  state.yaw.step(offX * 0.085, dt);
  state.lean.step(offY * 0.05, dt);

  // The loupe swells the engraving under a mouse pointer that is over the medallion.
  const under = plate ? plate.unproject(lightX, lightY) : null;
  if (under) state.loupeAt = under;
  const overMedallion = under !== null && Math.hypot(under[0], under[1]) < 1.25;
  state.loupe.step(steering && finePointer.matches && overMedallion ? 0.24 : 0, dt);
}

function draw() {
  if (!plate) return;
  plate.setView({
    anchorX: view.anchorX,
    anchorY: view.anchorY,
    radius: view.radius,
    tilt: view.tilt,
    lean: state.lean.value, // kept apart from the tilt: the room's light stays put while the plate leans, so its reflection slides across the seal's stone
    yaw: state.yaw.value,
  });
  const spin = edition.spin;
  const reveal = state.reveal.value;
  const stone = lifted(drop.at(state.stone.time), state.stone.lift);
  plate.render({
    time: state.clock,
    reveal,
    rate: reveal - filmShown, // how far the pens moved since the last frame: they trail a tail that long
    stone,
    uv: state.uv,
    hair: clamp(view.radius / 330, 0.72, 1.1) * 0.36,
    light: { x: state.lightX.value, y: state.lightY.value, presence: state.presence.value },
    loupe: { x: state.loupeAt[0], y: state.loupeAt[1], strength: Math.max(0, state.loupe.value) },
    turn: [
      (spin * state.clock * TAU) / 320,
      (-spin * state.clock * TAU) / 460,
      (-spin * state.clock * TAU) / 200,
      (spin * state.clock * TAU) / 260,
    ],
  });
  filmShown = reveal;
  showStoneInFront(stone);
  placeBodies();
}

/**
 * The page's words stand in front of the plate's canvas. Where the stone passes
 * them in its drop (on a narrow screen they stand above the plate, and it falls
 * past them all) it must pass in front of them. So there it is drawn a second
 * time, on a canvas of its own in front of the words: the plate's picture, cut
 * to the stone's outline. Its shadow stays behind, on the paper.
 */
function showStoneInFront(stone) {
  if (!frontInk) return;
  if (inFront) {
    frontInk.clearRect(...inFront);
    inFront = null;
  }
  const lying = state.stone.lift === 0 && state.stone.time >= drop.rests;
  if (stone.present <= 0 || lying) return;

  const corners = silhouette(stone, (x, y, z) => {
    const at = plate.project(x, y, z);
    return [at.x, at.y];
  });
  const across = corners.map(([x]) => x);
  const down = corners.map(([, y]) => y);
  const box = { left: Math.min(...across), right: Math.max(...across), top: Math.min(...down), bottom: Math.max(...down) };
  const passesWords = keepClear.some(
    (words) => box.right > words.left && box.left < words.right && box.bottom > words.top && box.top < words.bottom,
  );
  if (!passesWords) return;

  // The front canvas keeps the plate's own pixels, so the stone is copied across dot for dot.
  if (front.width !== canvas.width || front.height !== canvas.height) {
    front.width = canvas.width;
    front.height = canvas.height;
  }
  const perX = canvas.width / view.width;
  const perY = canvas.height / view.height;
  const left = Math.max(0, Math.floor(box.left * perX) - 1);
  const top = Math.max(0, Math.floor(box.top * perY) - 1);
  const width = Math.min(canvas.width, Math.ceil(box.right * perX) + 1) - left;
  const height = Math.min(canvas.height, Math.ceil(box.bottom * perY) + 1) - top;
  if (width <= 0 || height <= 0) return; // it is off the page
  frontInk.save();
  frontInk.beginPath();
  corners.forEach(([x, y], index) => (index ? frontInk.lineTo(x * perX, y * perY) : frontInk.moveTo(x * perX, y * perY)));
  frontInk.closePath();
  frontInk.clip();
  frontInk.globalAlpha = Math.min(1, stone.present); // as it is lifted away it fades, and the words show through it
  frontInk.drawImage(canvas, left, top, width, height, left, top, width, height);
  frontInk.restore();
  inFront = [left, top, width, height];
}


/** If frames come slowly for a while, draw fewer pixels rather than stutter. */
function watchPace(elapsed, time) {
  if (!plate || time - pace.since < 2500) return;
  pace.average += (elapsed - pace.average) * 0.06;
  if (pace.average > 27 && view.ratio > pace.floor) {
    view.ratio = Math.max(pace.floor, view.ratio * 0.8);
    plate.resize(view.width, view.height, view.ratio);
    pace.since = time;
    pace.average = 16;
  }
}

const shouldRun = () => Boolean(plate) && heroInView && !heroCovered && !document.hidden && !reduceMotion.matches;

function wake() {
  if (running || !shouldRun()) return;
  running = true;
  loop += 1;
  const mine = loop;
  lastFrame = performance.now();
  pace.since = lastFrame;
  const frame = (time) => {
    if (!running || mine !== loop) return; // resting, or a newer start has taken over
    const elapsed = time - lastFrame;
    lastFrame = time;
    step(Math.min(0.05, elapsed / 1000));
    draw();
    watchPace(elapsed, time);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function rest() {
  running = false;
}

/** One still frame: used when motion is reduced, and whenever something changes while the loop is resting. */
function drawOnce() {
  if (!plate || !edition) return;
  if (reduceMotion.matches) {
    const { done } = state.reveal;
    Object.assign(state.reveal, { value: 1, duration: 0, done: null });
    Object.assign(state.stone, { time: Infinity, lift: 0 }); // the stone lies in its seat: nothing falls
    if (done) done(); // whoever was waiting for the film to end can carry on
    state.uv = root.dataset.theme === 'uv' ? 1 : 0;
    const idle = restingLight(0);
    state.lightX.snap(idle.x);
    state.lightY.snap(idle.y);
    state.yaw.snap(0);
    state.lean.snap(0);
    state.loupe.snap(0);
  }
  draw();
}

/**
 * Run the film to `value` (0 = bare paper, 1 = the finished plate).
 * `paced` films keep the speed bar's time; the quick rewind does not.
 * @returns a promise that settles when the film gets there, or is overtaken.
 */
function revealTo(value, duration, { ease = steady, paced = true } = {}) {
  return new Promise((resolve) => {
    if (state.reveal.done) state.reveal.done(); // an older film gives way to this one
    if (reduceMotion.matches || duration <= 0) {
      Object.assign(state.reveal, { value, duration: 0, done: null });
      drawOnce();
      resolve();
      return;
    }
    Object.assign(state.reveal, { from: state.reveal.value, to: value, elapsed: 0, duration, ease, paced, done: resolve });
  });
}

// ---------------------------------------------------------------------------
// The bodies on the orbits
// ---------------------------------------------------------------------------

function buildBodies() {
  bodyEls = SITE.bodies.slice(0, PLATE.orbits.length).map((body) => {
    const link = document.createElement('a');
    link.className = body.tone ? `body body--${body.tone}` : 'body';
    link.href = body.target;
    link.tabIndex = -1; // the same links are in the page proper; these are a visual echo
    const dot = document.createElement('i');
    dot.className = 'body__dot';
    const label = document.createElement('span');
    label.className = 'body__label';
    label.textContent = body.label;
    link.append(dot, label);
    link.dataset.hidden = 'true';
    return link;
  });
  bodiesLayer.replaceChildren(...bodyEls);
  bodiesLayer.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'mouse') hoveredBody = Boolean(event.target.closest('.body'));
  });
  bodiesLayer.addEventListener('pointerout', () => {
    hoveredBody = false;
  });
}

/** Points round the seal's edge, for finding where it lies on the page. */
const SEAL_EDGE = Array.from({ length: 12 }, (_, index) => {
  const angle = (TAU * index) / 12;
  return [PLATE.seal * Math.cos(angle), PLATE.seal * Math.sin(angle)];
});
const sealBox = { left: 0, top: 0, width: 0, height: 0 };

/** Lay the seal's button over the seal: pressing the seal redraws the plate. */
function placeSeal() {
  let left;
  let top;
  let right;
  let bottom;
  if (plate) {
    const edge = SEAL_EDGE.map(([x, y]) => plate.project(x, y));
    left = Math.min(...edge.map((at) => at.x));
    right = Math.max(...edge.map((at) => at.x));
    top = Math.min(...edge.map((at) => at.y));
    bottom = Math.max(...edge.map((at) => at.y));
  } else {
    // The still plate lies face-on in its slot; its drawing is 208 units across, the plate 200 of them.
    const still = one('.still', slot);
    if (!still) return;
    const box = still.getBoundingClientRect();
    const home = hero.getBoundingClientRect();
    const reach = (PLATE.seal * box.width * 100) / 208;
    left = box.left - home.left + box.width / 2 - reach;
    right = left + 2 * reach;
    top = box.top - home.top + box.height / 2 - reach;
    bottom = top + 2 * reach;
  }
  const next = { left, top, width: right - left, height: bottom - top };
  const moved = Object.keys(next).some((key) => Math.abs(next[key] - sealBox[key]) > 0.5);
  if (!moved) return;
  Object.assign(sealBox, next);
  sealButton.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
  sealButton.style.width = `${next.width.toFixed(1)}px`;
  sealButton.style.height = `${next.height.toFixed(1)}px`;
}

function placeBodies() {
  placeSeal();
  // The bodies come out once the plate is whole: its lines drawn and its stone at rest.
  const ready = state.stone.lift === 0 && state.stone.time >= drop.rests;
  bodyEls.forEach((el, index) => {
    const body = edition.bodies[index];
    const orbit = edition.orbits[body.orbit];
    const angle = body.angle + (edition.spin * TAU * state.orbit) / body.period;
    const radius = orbit.radius * (1 + orbit.amp * Math.cos(orbit.lobes * angle + orbit.phase));
    const at = plate.project(radius * Math.cos(angle), radius * Math.sin(angle));
    el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0) scale(${(0.84 + 0.16 * at.scale).toFixed(3)})`;

    const offStage = at.x < 12 || at.x > view.width - 12 || at.y < 70 || at.y > view.height - 24;
    const overCopy = keepClear.some((box) => at.x > box.left && at.x < box.right && at.y > box.top && at.y < box.bottom);
    const hidden = String(!ready || offStage || overCopy);
    if (el.dataset.hidden !== hidden) el.dataset.hidden = hidden;
  });
}

// ---------------------------------------------------------------------------
// Redraw and Copy link
// ---------------------------------------------------------------------------

async function redraw() {
  drawing += 1;
  const mine = drawing;
  // Run the film backwards, quickly: the lines are taken up in the order they were laid.
  await revealTo(0, FILM.rewind * state.reveal.value, { ease: easeOut, paced: false });
  if (mine !== drawing) return; // Redraw was pressed again; that press carries on from here
  showEdition(mintUnlike({ last: edition.serial, mint }), 'visit');
  // A fresh edition is no longer the one in the link.
  if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);
  await revealTo(1, FILM.redraw);
}

// ---------------------------------------------------------------------------
// The speed bar
// ---------------------------------------------------------------------------

/** Set the speed from the bar's value, in doublings (see SPEED). */
function setSpeed(doublings) {
  let value = clamp(Number.isFinite(doublings) ? doublings : 0, SPEED.slowest, SPEED.fastest);
  if (Math.abs(value) < SPEED.settle) value = 0;
  tempo = SPEED.normal * 2 ** value;
  speedBar.value = String(value);
  const times = Number((2 ** value).toPrecision(2));
  speedBar.setAttribute('aria-valuetext', value === 0 ? 'Normal speed' : `${times} times normal speed`);
  return value;
}

function rememberSpeed(value) {
  try {
    localStorage.setItem(SPEED.key, String(value));
  } catch (error) {
    // Storage is blocked. The bar still works for this visit.
    console.info('The speed setting could not be saved on this device:', error.name);
  }
}

function recallSpeed() {
  try {
    const saved = localStorage.getItem(SPEED.key);
    return saved === null ? 0 : Number(saved);
  } catch (error) {
    console.info('The saved speed setting could not be read:', error.name);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Keeping your place
// ---------------------------------------------------------------------------

/**
 * Returning with the Back button puts the page where you left it. A browser
 * normally does this itself, but js/before-paint.js asks it not to move the
 * page, so that a refresh starts at the top and shows the plate being drawn.
 */
function keepPlace() {
  const [visit] = performance.getEntriesByType('navigation');
  const left = history.state?.scrollY;
  if (visit?.type === 'back_forward' && Number.isFinite(left)) {
    root.style.scrollBehavior = 'auto'; // jump there; do not glide
    window.scrollTo(0, left);
    root.style.scrollBehavior = '';
  }

  let timer = 0;
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          history.replaceState({ ...history.state, scrollY: Math.round(window.scrollY) }, '');
        } catch (error) {
          // Some browsers ration how often a page may write this note. Missing
          // one only means Back lands a little off.
          console.info('The scroll position could not be noted:', error.name);
        }
      }, 400);
    },
    { passive: true },
  );
}

function flash(button, text) {
  const label = button.dataset.label ?? button.textContent;
  button.dataset.label = label;
  button.textContent = text;
  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => {
    button.textContent = label;
  }, 1800);
}

async function copyLink() {
  const link = new URL(location.pathname, location.origin);
  link.searchParams.set('e', edition.serial);
  try {
    await navigator.clipboard.writeText(link.href);
    flash(copyButton, 'Copied');
  } catch (error) {
    // The browser refused clipboard access. Show the link so it can be copied by hand.
    console.info('Clipboard unavailable:', error.name);
    noteEl.textContent = link.href;
    const range = document.createRange();
    range.selectNodeContents(noteEl);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    flash(copyButton, 'Link shown');
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function boot() {
  try {
    plate = createPlate(canvas);
  } catch (error) {
    // WebGL2 is there but the plate could not be built. Say so, then show the still plate.
    console.error('The live plate could not start; showing the still plate instead.', error);
    plate = null;
  }
  root.classList.toggle('has-plate', Boolean(plate));

  view.ratio = Math.min(window.devicePixelRatio || 1, 2);
  pace.floor = Math.min(0.75, view.ratio);

  const link = new URLSearchParams(location.search).get('e');
  // A refresh draws a new plate, even over one that came by link; so does every fresh visit.
  const [visit] = performance.getEntriesByType('navigation');
  const chosen = chooseSerial({ link, mint, last: recallEdition(), reload: visit?.type === 'reload' });
  if (link !== null && chosen.origin !== 'link') {
    // Drop a serial we could not read, or one a refresh has just moved on from.
    history.replaceState(history.state, '', location.pathname + location.hash);
  }

  // The sheets stack before anything is measured or put back in place: stacking changes the page's height.
  stack = start('The stack of sheets', () => startSheets({ main: one('main'), top: one('.top'), foot: one('.foot') }));
  hero.addEventListener('sheetcover', (event) => {
    heroCovered = event.detail.covered;
    if (heroCovered) rest();
    else wake();
  });
  keepPlace();

  tracer = start('The drawing of the ornaments', () => {
    const made = startTracer({ pace: () => tempo });
    for (const el of bandEls) made.add(el, ORNAMENT.band);
    for (const el of stampEls) made.add(el, ORNAMENT.rosette);
    made.add(turntableFloor, ORNAMENT.floor);
    return made;
  });
  start('The turning rosettes', () =>
    startRosettes({
      els: stampEls,
      // A pressed rosette is struck anew: a pattern of its own, drawn from its first line.
      strike(el) {
        setOrnament(el, rosetteMarkup(stampFrom(Math.random)));
        if (tracer) tracer.redraw(el);
      },
    }),
  );

  if (plate) buildBodies();
  startLamp({
    buttons: all('[data-lamp]'),
    onChange(theme, { instant }) {
      // The plate fades between the lights in its frame loop; for the spreading-light picture it jumps.
      if (instant) state.uv = theme === 'uv' ? 1 : 0;
      if (running) draw();
      else drawOnce();
    },
  });

  const dominoStage = one('[data-dominoes]');
  dominoRun = start('The Domino Reactor run', () =>
    startDominoes({
      stage: dominoStage,
      canvas: one('canvas', dominoStage),
      controls: one('[data-dominoes-controls]'),
      button: one('[data-push]'),
      tally: one('[data-tally]'),
      total: one('[data-total]'),
      status: one('[data-dominoes-status]'),
      designs: one('[data-dominoes-designs]'),
    }),
  );
  if (!dominoRun) dominoStage.classList.add('is-still');

  // The two systems. If either cannot start, what the page came with stays: the four stages, the statement.
  const hub = start('The Orchestration Hub floor', () =>
    startHub({ stage: one('[data-hub]'), button: one('[data-hub-approve]'), status: one('[data-hub-status]') }),
  );
  if (hub) one('[data-hub-controls]').hidden = false;
  start('The CapitalCraft Books card', () => startBooks({ stage: one('[data-books]'), status: one('[data-books-status]') }));

  showEdition(chosen.serial, chosen.origin);
  layout();

  // The phones first: if the app in them cannot start, they stay photographs and the turntable still turns.
  const phoneStage = one('[data-turntable]');
  let turntable = null;
  const phones = start('The app in the Money Tycoon phones', () => startPhones({ stage: phoneStage, onUse: () => turntable?.hold() }));
  turntable = start('The Money Tycoon turntable', () =>
    startTurntable({ stage: phoneStage, tabs: one('[data-turntable-tabs]'), area: one('.sheet--mt'), onFront: (index) => phones?.front(index) }),
  );

  if (plate) {
    const idle = restingLight(0);
    state.lightX.snap(idle.x);
    state.lightY.snap(idle.y);

    // The lettering needs the typeface; draw it once the font is in.
    document.fonts
      .load('650 52px "Mona Sans"')
      .catch((error) => {
        // The font did not arrive. The lettering is drawn in the system face instead.
        console.info('Mona Sans did not load for the plate lettering:', error.name);
      })
      .then(() => {
        engraveLegend();
        engraveHiddenWords();
        if (!running) drawOnce();
      });
  }

  redrawButton.addEventListener('click', redraw);
  sealButton.addEventListener('click', redraw);
  copyButton.addEventListener('click', copyLink);

  setSpeed(recallSpeed());
  speedBar.addEventListener('input', () => setSpeed(Number(speedBar.value)));
  speedBar.addEventListener('change', () => rememberSpeed(setSpeed(Number(speedBar.value))));
  speedBar.addEventListener('dblclick', () => rememberSpeed(setSpeed(0))); // back to normal

  window.addEventListener(
    'pointermove',
    (event) => {
      if (reduceMotion.matches) return;
      const box = hero.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.active = pointer.y > -40 && pointer.y < box.height + 40;
    },
    { passive: true },
  );
  for (const gone of ['pointerleave', 'pointercancel']) {
    root.addEventListener(gone, () => {
      pointer.active = false;
    });
  }
  window.addEventListener('blur', () => {
    pointer.active = false;
  });
  window.addEventListener(
    'touchend',
    () => {
      pointer.active = false; // a lifted finger no longer holds the light
    },
    { passive: true },
  );

  new ResizeObserver(layout).observe(hero);
  const layOrnaments = () => {
    layFibres();
    layBands();
  };
  let ornamentsTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(ornamentsTimer);
    ornamentsTimer = setTimeout(layOrnaments, 250);
  });
  window.addEventListener('load', layOrnaments); // images have settled each sheet's size by now

  new IntersectionObserver(([entry]) => {
    heroInView = entry.isIntersecting;
    if (heroInView) wake();
    else rest();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? rest() : wake()));
  window.addEventListener('pageshow', wake);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) {
      rest();
      drawOnce();
    } else {
      wake();
    }
  });
  wideScreen.addEventListener('change', layout);

  if (reduceMotion.matches) {
    drawOnce();
  } else {
    wake();
    revealTo(1, FILM.open);
  }
}

boot();
