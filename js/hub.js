// The Orchestration Hub, drawn as its own mind: a constellation under glass, after the Hub's
// Cortex view, made for this page.
//
// The mind floats over the one desk the whole floor is run from. The work on the floor
// (js/floor.js) runs through it: the orchestrator fires each job into Queue, it crosses region to
// region, the decision model weighs every build, and a release stops at the gate. A thread runs
// from the gate to the page's own button: the button fills as the release comes, and nothing
// ships until the visitor presses it. Then the release lands in Merge and a wave of light crosses
// the mind. The accounts the work runs on are gauges on the desk's rim. Point at the
// orchestrator, the decision model or the accounts and the rest dims while that part shows what
// it does.
//
// Three layers, one over another, all the size of the slab: the desk (a plain canvas), the mind
// itself (the graphics card: js/hub-cloud.js), and the work and its lines (a plain canvas). The
// names of the stages are the page's own text, set out round the mind (js/callouts.js).
//
// The numbers are in js/cortex.js, js/callouts.js and js/floor.js; this file only draws them.
// The jobs are made up: it is a picture of how the Hub works, not a feed.

import { NAMES, layNames, port, underCard, wire, wireAt } from './callouts.js';
import {
  BAND,
  DECISION,
  GLASS,
  LOOK,
  ORCHESTRATOR,
  PLATE,
  PART,
  PLAN,
  REGIONS,
  SPARE,
  TAU,
  along,
  approach,
  bandAt,
  buildMind,
  createAccounts,
  frameFor,
  glassOutline,
  onDesk,
  placeOf,
  pointOf,
  project,
  regionOfPoints,
  seatOf,
  seeded,
  spot,
  waveAt,
} from './cortex.js';
import { GATE, createFloor } from './floor.js';
import { AT_WORK, createCloud, createLiteCloud } from './hub-cloud.js';
import { finePointer, reduceMotion, whileVisible } from './motion.js';
import { createWheel } from './wheel.js';

const LANES = 5;
const SPIN = 0.07; // radians a second the mind turns by itself
const DIM = 0.45; // how bright the rest of the mind stays while one part is shown
const GATHER = 1.9; // seconds the mind takes to gather when it is first seen
const CLEARED = 1.5; // seconds the button stays green after a release is approved
const DENSE = { wide: 14, narrow: 9 }; // how many times the plain cloud's points the graphics card is given
const MARKS = { full: 230, least: 0.68 }; // the marks of the work are drawn full size where a unit of the mind is this many pixels or more; in a smaller picture smaller, down to this share
const BURST = 4; // how many points fire where a job comes to rest
const SEAT_SPAN = 0.17; // radians each account's gauge runs either side of its seat on the desk's rim
const PULSE = 0.5; // seconds the approval takes to run back up the thread to the gate
/**
 * The glass, as far as this file draws it. `inner` is the light inside it at its brightest,
 * `wide` how far that light reaches (in units of the mind), `flat` how much lower than wide it
 * is and `low` how far under the glass's middle it sits; `body` the wash over the whole dome and
 * `edge` its outline. Each of `arcs` is a line of lamp light along the outline: from and to (as
 * shares of the way from the rim on the left, over the crown, to the rim on the right), how far
 * in from the outline it runs, how bright it is and how wide.
 */
const GLASS_LIGHT = Object.freeze({
  inner: 0.24,
  wide: 0.84,
  flat: 0.62,
  low: 0.06,
  body: 0.06,
  edge: 0.2,
  arcs: Object.freeze([
    [0.21, 0.43, 0.05, 0.72, 1.3],
    [0.26, 0.37, 0.1, 0.26, 1],
    [0.79, 0.9, 0.045, 0.2, 1],
  ]),
});

// What each part does, for a business deciding whether we can build this for them.
const PARTS = Object.freeze({
  orchestrator: {
    name: 'The orchestrator',
    text: 'Runs a whole team of AI agents. Every job goes to the model that fits it, so work moves faster and costs less.',
  },
  decision: {
    name: 'The decision model',
    text: 'Reads every finished build and decides: on to audit, back for a fix, or a question for you. Nothing ships on a guess.',
  },
  accounts: {
    name: 'Many accounts, one desk',
    text: 'The work runs across several AI accounts. When one reaches its limit the next takes over, so nothing stops.',
  },
});

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** A colour written as six hex digits, as red, green and blue; `otherwise` if it is written any other way. */
const rgb = (hex, otherwise) => {
  const found = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!found) return otherwise;
  const value = Number.parseInt(found[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const mix = (a, b, t) => a.map((part, i) => Math.round(part + (b[i] - part) * t));
const css = (c, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const ease = (t) => t * t * (3 - 2 * t);

/**
 * @param {{ slab: HTMLElement, stage: HTMLElement, button: HTMLButtonElement, status: HTMLElement }} parts
 *   `slab` holds the whole of the Hub's sheet between its head and its foot, and is drawn behind;
 *   `stage` is emptied, and is where the mind stands and is turned; `button` approves the waiting
 *   release; `status` is told, for screen readers, when a release starts to wait.
 */
export function startHub({ slab, stage, button, status }) {
  const scene = make('div', 'hub__scene');
  scene.setAttribute('role', 'img');
  scene.setAttribute(
    'aria-label',
    'The Orchestration Hub drawn as a constellation under glass over one desk: jobs run from the orchestrator through Queue, Build, Audit and Merge, and a release waits for your approval.',
  );
  const under = make('canvas', 'hub__layer');
  const glass = make('canvas', 'hub__layer');
  const over = make('canvas', 'hub__layer');
  scene.append(under, glass, over);
  const u = under.getContext('2d');
  const ctx = over.getContext('2d');
  if (!u || !ctx) throw new Error('This browser cannot draw the Hub: no 2D canvas.');

  const card = make('div', 'hub__card');
  card.id = 'hub-card';
  card.setAttribute('role', 'tooltip');
  const cardName = make('p', 'hub__card-name');
  const cardText = make('p', 'hub__card-text');
  card.append(cardName, cardText);

  const labels = REGIONS.map((region) => {
    const label = make('span', 'hub__label', region.stage);
    label.setAttribute('aria-hidden', 'true'); // the picture's own description names the stages
    return label;
  });

  const nodes = {};
  for (const [key, part] of Object.entries(PARTS)) {
    const node = make('button', `hub__node hub__node--${key}`);
    node.type = 'button';
    node.setAttribute('aria-label', part.name);
    node.setAttribute('aria-describedby', card.id);
    node.setAttribute('aria-expanded', 'false');
    node.dataset.part = key;
    nodes[key] = node;
  }
  stage.replaceChildren(...labels, ...Object.values(nodes), card);
  stage.classList.add('is-live');
  slab.prepend(scene);

  // The button fills as a release comes to the gate.
  const charge = make('span', 'hub__charge');
  charge.setAttribute('aria-hidden', 'true');
  button.prepend(charge);
  button.dataset.state = 'idle';

  // ----- the palette: the sheet's own signal colours, and the five inks of its bands -----
  const look = getComputedStyle(stage);
  const ink = (name, otherwise) => rgb(look.getPropertyValue(name), otherwise);
  const C = {
    calm: ink('--calm', [143, 211, 232]),
    held: ink('--held', [255, 181, 71]),
    clear: ink('--clear', [98, 219, 160]),
    ground: ink('--ground', [11, 31, 42]),
    pain: [255, 107, 122],
    white: [246, 251, 253],
  };
  C.inks = [
    ink('--ink-1', [230, 244, 250]),
    ink('--ink-2', [143, 211, 232]),
    ink('--ink-3', [91, 176, 214]),
    ink('--ink-4', [63, 143, 196]),
    ink('--ink-5', [58, 114, 180]),
  ];
  C.dust = mix([86, 138, 222], C.calm, 0.3);
  C.deep = mix([30, 58, 128], C.ground, 0.25);
  C.pale = mix(C.white, C.calm, 0.18);
  C.lit = mix(C.calm, C.white, 0.25);
  C.wave = mix(C.clear, C.white, 0.3);

  // Soft round lights, one per colour, drawn once.
  const lights = new Map();
  function light(c) {
    const key = c.join();
    let made = lights.get(key);
    if (made) return made;
    made = document.createElement('canvas');
    made.width = made.height = 64;
    const g = made.getContext('2d');
    const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fill.addColorStop(0, 'rgba(255,255,255,1)');
    fill.addColorStop(0.12, css(c, 0.95));
    fill.addColorStop(0.36, css(c, 0.28));
    fill.addColorStop(1, css(c, 0));
    g.fillStyle = fill;
    g.fillRect(0, 0, 64, 64);
    lights.set(key, made);
    return made;
  }
  function glow(on, x, y, radius, c, alpha) {
    if (alpha <= 0.004 || radius < 0.5) return;
    on.globalAlpha = Math.min(1, alpha);
    on.drawImage(light(c), x - radius, y - radius, radius * 2, radius * 2);
  }

  // ----- the mind, the floor and the accounts -----
  // The plain cloud is light enough to draw point by point, and is where the points that fire are
  // picked from. The graphics card is given the same mind many times as dense, once the page is idle.
  // A small picture (a phone) is given the sparer constellation, decided once: the picture a visitor first sees is the one they keep.
  const small = matchMedia('(max-width: 899px)').matches;
  const plan = small ? SPARE : PLAN;
  const mind = buildMind(seeded(42), 1, plan);
  const owner = regionOfPoints(mind);
  // The points of the constellation in each stage's region: where it fires when work lands there.
  const fires = REGIONS.map((_, region) => {
    const points = [];
    for (let i = 0; i < mind.count; i += 1) if (owner[i] === region && mind.part[i] !== PART.halo) points.push(i);
    return points;
  });
  const drawLite = createLiteCloud(mind, owner, { dust: C.dust, pale: C.pale, lit: C.lit, cleared: C.wave });
  let cloud = null; // the mind on the graphics card, once it is built
  const floor = createFloor({ lanes: LANES });
  const accounts = createAccounts();
  const random = seeded(Date.now() >>> 0);

  function buildCloud() {
    const many = buildMind(seeded(42), small ? DENSE.narrow : DENSE.wide, plan);
    try {
      // The card can take its context away and hand it back (a sleeping laptop, a driver that
      // restarts): the canvas is wiped both times, so the picture has changed and is drawn again.
      cloud = createCloud(glass, many, regionOfPoints(many), { deep: C.deep, dust: C.dust, pale: C.pale, lit: C.lit, cleared: C.wave }, () => {
        dirty = true;
      });
    } catch (error) {
      // A graphics card that will not build the shader: the mind is still drawn, by the plain cloud. Say why.
      console.error('The Hub is drawing its plainer picture: the graphics card refused the full one.', error);
      cloud = null;
    }
    if (cloud) cloud.size(SW, SH, dpr);
    else glass.remove();
    // For anyone looking at the page from outside: which cloud is being drawn, and of how many points.
    scene.dataset.cloud = cloud ? 'card' : 'plain';
    scene.dataset.points = String(cloud ? many.count : mind.count);
    dirty = true;
    if (reduceMotion.matches) draw();
  }

  // ----- size: everything is measured from the top left of the scene -----
  let SW = 1; // the scene
  let SH = 1;
  let ox = 0; // where the stage starts in it
  let oy = 0;
  let W = 1; // the stage
  let H = 1;
  let dpr = 1;
  let room = { left: 0, top: 0, right: 1, bottom: 1 }; // where the names may stand
  let pill = null; // the button, or null while it has no size
  let nameTall = 18;
  const nameWide = labels.map(() => 60);
  let mark = 1; // how large the marks of the work are drawn: smaller in a small picture, so that they do not crowd it
  const view = { yaw: LOOK.yaw, pitch: LOOK.pitch, scale: 100, x: 0, y: 0 };
  const flat = { yaw: 0, pitch: LOOK.pitch, scale: 100, x: 0, y: 0 }; // the desk does not turn with the mind

  /** Where a part of the slab starts, from the slab's own top left. */
  function within(el) {
    let x = 0;
    let y = 0;
    let at = el;
    while (at && at !== slab) {
      x += at.offsetLeft;
      y += at.offsetTop;
      at = at.offsetParent;
    }
    if (at !== slab) throw new Error('The Hub cannot find one of its parts inside its slab.');
    return [x, y];
  }

  function measure() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    SW = Math.max(1, scene.clientWidth);
    SH = Math.max(1, scene.clientHeight);
    const [sx, sy] = within(stage);
    ox = sx - scene.offsetLeft;
    oy = sy - scene.offsetTop;
    W = Math.max(1, stage.clientWidth);
    H = Math.max(1, stage.clientHeight);
    for (const layer of [under, over]) {
      layer.width = Math.round(SW * dpr);
      layer.height = Math.round(SH * dpr);
    }
    if (cloud) cloud.size(SW, SH, dpr);

    labels.forEach((label, i) => {
      nameWide[i] = label.offsetWidth || nameWide[i];
    });
    nameTall = labels[0].offsetHeight || nameTall;
    // The names may stand a little outside the stage, in the page's own margin.
    const spare = Math.min(14, -scene.offsetLeft);
    room = { left: ox - spare, top: oy, right: ox + W + spare, bottom: oy + H };

    // As large as the stage allows, and no larger than leaves room for a name either side.
    const frame = frameFor(W, H);
    const names = Math.max(...nameWide) + NAMES.pad;
    view.scale = Math.max(40, Math.min(frame.scale, ((room.right - room.left) / 2 - names) / PLATE.across));
    mark = clamp(view.scale / MARKS.full, MARKS.least, 1);
    view.x = ox + frame.x;
    view.y = oy + frame.y;
    flat.scale = view.scale;
    flat.x = view.x;
    flat.y = view.y;

    if (button.offsetWidth > 0) {
      const [bx, by] = within(button);
      const left = bx - scene.offsetLeft;
      const top = by - scene.offsetTop;
      pill = { left, top, right: left + button.offsetWidth, bottom: top + button.offsetHeight };
    } else {
      pill = null;
    }
    dirty = true;
  }

  // ----- turning it by hand -----
  const wheel = createWheel();
  let spun = 0; // the mind's own turning
  let press = null;
  const angleAt = (x) => (x / Math.max(1, W)) * Math.PI * 1.4;
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.hub__node')) return;
    const box = stage.getBoundingClientRect();
    press = { x: event.clientX, y: event.clientY, t: event.timeStamp, moved: false, at: event.timeStamp, box };
    wheel.grab(angleAt(event.clientX - box.left));
    stage.classList.add('is-turning');
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the page made up for itself cannot be captured; turning still works while it stays over the mind.
    }
  });
  stage.addEventListener('pointermove', (event) => {
    if (!press) {
      if (finePointer.matches) stage.classList.toggle('is-pointing', nearRelease(event));
      return;
    }
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) press.moved = true;
    wheel.drag(angleAt(event.clientX - press.box.left), Math.max(0.001, (event.timeStamp - press.at) / 1000));
    press.at = event.timeStamp;
    dirty = true;
  });
  const letGo = (event) => {
    if (!press) return;
    const tapped = !press.moved && event.timeStamp - press.t < 450;
    wheel.release(reduceMotion.matches ? Infinity : Math.max(0, (event.timeStamp - press.at) / 1000));
    stage.classList.remove('is-turning');
    press = null;
    if (tapped && event.type === 'pointerup' && nearRelease(event)) approve();
    else if (tapped) show(null);
    dirty = true;
  };
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', letGo);

  // ----- what is on the floor, and what has just happened -----
  const P = [0, 0, 0, 0];
  const Q = [0, 0, 0];
  const R = [0, 0];
  const placed = new Map(); // job id -> where it was last frame
  const known = new Set();
  let ring = []; // { at, c, born, size }
  let sparks = []; // { i (a point of the mind), c, born, life }
  let wave = null; // { from, born }
  let lastMerged = 0;
  let releaseId = 0;
  let held = 0; // the id of the release the page has said is waiting
  let clock = 0;
  let dirty = true;
  let focus = null; // the part being shown: 'orchestrator', 'decision' or 'accounts'
  let dimmed = 1;
  let born = reduceMotion.matches ? 1 : 0; // 0 as the mind starts to gather, 1 once it has
  let seen = false;
  let coming = 0; // how near the release on the floor is to the gate, 0 to 1, as the button shows it
  let clearedUntil = -1; // the button stays green until the clock reaches this
  let pulse = -1; // when the approval set off back up the thread, or -1
  const busy = [0, 0, 0, 0]; // how busy each stage's region is, 0 to 1

  function notice() {
    for (const job of floor.jobs) {
      if (job.kind === 'Release') releaseId = job.id;
      if (!known.has(job.id)) {
        known.add(job.id);
        accounts.draw(0.06 * job.tier);
        ring.push({ at: ORCHESTRATOR, c: job.kind === 'Release' ? C.held : C.calm, born: clock, size: 14 });
      }
      const place = placeOf(job);
      const before = placed.get(job.id);
      // A job that has just come to rest in a region: a small burst of firing there.
      if (before && before.from !== before.to && place.from === place.to) {
        const at = spot(place.to, job.id);
        ring.push({ at, c: job.kind === 'Release' ? C.clear : C.calm, born: clock, size: 18 });
        burst(place.to, BURST);
      }
      placed.set(job.id, place);
    }
    const ids = new Set(floor.jobs.map((job) => job.id));
    for (const id of placed.keys()) if (!ids.has(id)) placed.delete(id);
    for (const id of known) if (!ids.has(id)) known.delete(id);
    if (floor.merged > lastMerged) {
      lastMerged = floor.merged;
      if (!ids.has(releaseId) && releaseId) {
        wave = { from: REGIONS[GATE].centre, born: clock };
        releaseId = 0;
        status.textContent = 'The release is merged.';
      }
    }
  }

  function burst(region, count) {
    const points = fires[region];
    for (let n = 0; n < count && points.length > 0; n += 1) {
      sparks.push({ i: points[Math.floor(random() * points.length)], c: C.calm, born: clock, life: 0.5 + random() * 0.4 });
    }
  }

  // ----- the release -----
  const releaseOf = (jobs) => jobs.find((job) => job.kind === 'Release') ?? null;

  function approve() {
    const waiting = floor.waiting;
    if (!waiting || !floor.approve(waiting.id)) return;
    if (reduceMotion.matches) {
      settle();
      wave = null;
      status.textContent = 'Release approved and merged. The next one is waiting at the gate.';
    } else {
      pulse = clock;
      clearedUntil = clock + CLEARED;
      status.textContent = 'Release approved. It is merging.';
    }
    dirty = true;
  }
  /** With no motion: move the floor on, unseen, to the next moment a release waits. */
  function settle() {
    for (let frame = 0; frame < 6000 && !floor.waiting; frame += 1) {
      floor.step(1 / 30);
      accounts.step(1 / 30);
      for (const job of floor.jobs) if (!known.has(job.id)) {
        known.add(job.id);
        accounts.draw(0.06 * job.tier);
      }
    }
    lastMerged = floor.merged;
    coming = floor.waiting ? 1 : 0;
  }
  function nearRelease(event) {
    const waiting = floor.waiting;
    if (!waiting) return false;
    const box = scene.getBoundingClientRect();
    const at = pointOf(waiting);
    project(at[0], at[1], at[2], view, P);
    return Math.hypot(event.clientX - box.left - P[0], event.clientY - box.top - P[1]) < 26;
  }
  button.addEventListener('click', approve);

  // ----- showing one part -----
  let leaving = 0;
  function show(part) {
    clearTimeout(leaving);
    if (part === focus) return;
    focus = part;
    for (const [key, node] of Object.entries(nodes)) node.setAttribute('aria-expanded', String(key === part));
    if (part) {
      cardName.textContent = PARTS[part].name;
      cardText.textContent = PARTS[part].text;
      card.dataset.part = part;
      card.classList.add('is-open');
      place();
    } else {
      card.classList.remove('is-open');
    }
    dirty = true;
  }
  for (const node of Object.values(nodes)) {
    const part = node.dataset.part;
    node.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') show(part);
    });
    node.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') leaving = setTimeout(() => show(null), 140);
    });
    node.addEventListener('focus', () => show(part));
    node.addEventListener('blur', () => show(null));
    // A press focuses the button, and focus opens the card before the click arrives; so the
    // click asks whether the card was open before the press, or a first tap would shut it again.
    // A mouse never shuts it (its card is the hover's), and a keyboard press toggles it.
    let wasOpen = false;
    node.addEventListener('pointerdown', (event) => {
      wasOpen = event.pointerType !== 'mouse' && focus === part;
    });
    node.addEventListener('click', (event) => {
      if (event.detail === 0) show(focus === part ? null : part);
      else show(wasOpen ? null : part);
      wasOpen = false;
    });
  }
  stage.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focus) show(null);
  });

  // Where each part is in the scene, this frame; and the three accounts' seats on the desk's rim.
  const at = { orchestrator: [0, 0], decision: [0, 0], accounts: [0, 0] };
  const seats = [0, 1, 2].map((each) => seatOf(each, 3));
  const vessels = seats.map(() => [0, 0]);
  const row = [0, 0]; // how far the row of accounts reaches, left and right
  function locate() {
    project(...ORCHESTRATOR, view, P);
    at.orchestrator[0] = P[0];
    at.orchestrator[1] = P[1];
    project(...DECISION, view, P);
    at.decision[0] = P[0];
    at.decision[1] = P[1];
    seats.forEach((seat, i) => {
      project(...onDesk(seat, 1, Q), flat, P);
      vessels[i][0] = P[0];
      vessels[i][1] = P[1];
    });
    project(...onDesk(seats[0] - SEAT_SPAN, 1, Q), flat, P);
    row[0] = P[0];
    project(...onDesk(seats[2] + SEAT_SPAN, 1, Q), flat, P);
    row[1] = P[0];
    at.accounts[0] = vessels[1][0];
    at.accounts[1] = vessels[1][1];
    for (const [key, node] of Object.entries(nodes)) {
      const [x, y] = at[key];
      const half = key === 'accounts' ? rowHalf() : 22; // the accounts' target covers the whole row
      node.style.width = `${(half * 2).toFixed(1)}px`;
      node.style.transform = `translate3d(${(x - half - ox).toFixed(1)}px, ${(y - 22 - oy).toFixed(1)}px, 0)`;
    }
  }
  /** Half the width of the row of accounts, with room for a finger at each end. */
  const rowHalf = () => (row[1] - row[0]) / 2 + 8;

  // Where the open card stands, in the scene: for the line drawn to it.
  const cardBox = { left: 0, top: 0, right: 0, bottom: 0 };
  function place() {
    if (!focus) return;
    const x = at[focus][0] - ox;
    const y = at[focus][1] - oy;
    const right = x < W * 0.56;
    const width = Math.min(264, W - 24);
    const reach = focus === 'accounts' ? 0 : 30;
    const tall = card.offsetHeight || 140;
    let left = right ? x + reach : x - reach - width;
    let top = y - 48;
    let from = right ? 'left center' : 'right center'; // the card grows out of the side facing the part
    if (focus === 'accounts' || left < 12 || left + width > W - 12) {
      // No room beside the part (a phone), or a part as wide as the desk: centre the card over it, or under it.
      left = clamp(x - width / 2, 12, Math.max(12, W - width - 12));
      const above = y - 34 - tall >= 12;
      top = above ? y - 34 - tall : y + 34;
      from = above ? 'center bottom' : 'center top';
    }
    top = Math.min(Math.max(12, top), Math.max(12, H - tall - 12));
    card.style.setProperty('--card-x', `${left.toFixed(1)}px`);
    card.style.setProperty('--card-y', `${top.toFixed(1)}px`);
    card.style.setProperty('--card-w', `${width}px`);
    card.style.setProperty('--card-from', from);
    cardBox.left = left + ox;
    cardBox.top = top + oy;
    cardBox.right = cardBox.left + width;
    cardBox.bottom = cardBox.top + tall;
  }

  // ----- the names of the stages, set out round the mind -----
  const named = REGIONS.map(() => ({ x: 0, y: 0, depth: 0, wide: 0, was: undefined }));
  const names = REGIONS.map(() => ({ live: false, seat: 0, side: 0, x: 0, y: 0, tipX: 0, tipY: 0, alpha: 0, depth: 0, px: 0, py: 0, lit: null }));
  const nameBox = { left: 0, top: 0, right: 0, bottom: 0 };
  /**
   * @param {number} dt  seconds since the names were last set out: in none, nothing fades on.
   *   Infinity sets every name straight where it belongs.
   */
  function layOut(dt, gathered) {
    REGIONS.forEach((region, i) => {
      project(region.centre[0], region.centre[1], region.centre[2], view, P);
      named[i].x = P[0];
      named[i].y = P[1];
      named[i].depth = P[3];
      named[i].wide = nameWide[i];
      names[i].px = P[0];
      names[i].py = P[1];
      names[i].depth = P[3];
    });
    const plate = {
      x: view.x,
      y: view.y + PLATE.low * view.scale,
      across: PLATE.across * view.scale,
      down: PLATE.down * view.scale,
      tall: nameTall,
      room,
    };
    const laid = layNames(named, plate);
    const quick = reduceMotion.matches ? 1 : 1 - Math.exp(-dt / 0.085);
    laid.forEach((to, i) => {
      const name = names[i];
      named[i].was = { shown: to.shown, seat: to.seat, side: to.side };
      const take = () => {
        name.live = true;
        name.seat = to.seat;
        name.side = to.side;
        name.x = to.x;
        name.y = to.y;
        name.tipX = to.tipX;
        name.tipY = to.tipY;
      };
      let wanted = 0;
      if (to.shown) {
        // A name follows its region while it keeps its seat. One that must change seats or sides
        // goes out where it is and comes in at the new place: it never slides across the mind.
        if (!name.live || (to.seat === name.seat && to.side === name.side) || name.alpha < 0.04 || quick === 1) {
          take();
          wanted = 1;
        }
      }
      // A card that is open covers what is under it: a name there goes out until it shuts.
      if (focus) {
        nameBox.left = name.x;
        nameBox.top = name.y;
        nameBox.right = name.x + nameWide[i];
        nameBox.bottom = name.y + nameTall;
        if (underCard(nameBox, cardBox)) wanted = 0;
      }
      name.alpha += (wanted - name.alpha) * quick;
      const near = clamp(0.98 - name.depth * 0.5, 0.55, 1);
      const label = labels[i];
      label.style.transform = `translate3d(${(name.x - ox).toFixed(1)}px, ${(name.y - oy).toFixed(1)}px, 0)`;
      label.style.opacity = (name.alpha * near * (0.5 + 0.5 * dimmed) * gathered).toFixed(3);
      const lit = busy[i] > AT_WORK;
      if (lit !== name.lit) {
        name.lit = lit;
        label.dataset.busy = String(lit);
      }
    });
  }

  // ----- drawing: the desk, under the mind -----
  /** A ring on the desk, `out` of the way to its rim, from one angle to another, as a path. */
  function ringPath(on, out, from = 0, to = TAU, steps = 120) {
    on.beginPath();
    for (let n = 0; n <= steps; n += 1) {
      project(...onDesk(from + ((to - from) * n) / steps, out, Q), flat, P);
      if (n === 0) on.moveTo(P[0], P[1]);
      else on.lineTo(P[0], P[1]);
    }
  }

  function drawDesk(quiet) {
    u.setTransform(dpr, 0, 0, dpr, 0, 0);
    u.globalCompositeOperation = 'source-over';
    u.globalAlpha = 1;
    u.clearRect(0, 0, SW, SH);

    // How the desk lies on the screen: an ellipse.
    project(...onDesk(0, 1, Q), flat, P);
    const nearY = P[1];
    project(...onDesk(Math.PI, 1, Q), flat, P);
    const farY = P[1];
    project(...onDesk(Math.PI / 2, 1, Q), flat, P);
    const wide = P[0] - view.x;
    const midY = (nearY + farY) / 2;
    const flatness = (nearY - farY) / 2 / wide;
    const gathered = ease(clamp(born * 1.6, 0, 1));
    const shown = gathered * (0.55 + 0.45 * quiet);

    // The light the mind throws down on it.
    u.save();
    u.translate(view.x, midY);
    u.scale(1, flatness);
    const pool = u.createRadialGradient(0, 0, 0, 0, 0, wide);
    pool.addColorStop(0, css(C.dust, 0.3 * shown));
    pool.addColorStop(0.45, css(C.dust, 0.11 * shown));
    pool.addColorStop(0.86, css(C.dust, 0.035 * shown));
    pool.addColorStop(1, css(C.dust, 0));
    u.fillStyle = pool;
    u.beginPath();
    u.arc(0, 0, wide, 0, TAU);
    u.fill();
    u.restore();

    // Far things are fainter: every line on the desk is drawn through this.
    const fade = (c, far, near) => {
      const paint = u.createLinearGradient(0, farY, 0, nearY);
      paint.addColorStop(0, css(c, far * shown));
      paint.addColorStop(1, css(c, near * shown));
      return paint;
    };

    u.lineJoin = 'round';
    u.lineCap = 'butt';
    // Its rim, and the two rings the band runs between.
    u.lineWidth = 1.25;
    u.strokeStyle = fade(C.inks[1], 0.16, 0.62);
    ringPath(u, 1);
    u.stroke();
    u.lineWidth = 1;
    u.strokeStyle = fade(C.inks[2], 0.07, 0.3);
    ringPath(u, BAND.outer + 0.022);
    u.stroke();
    ringPath(u, BAND.inner - 0.022);
    u.stroke();
    u.strokeStyle = fade(C.inks[3], 0.04, 0.16);
    ringPath(u, 0.5);
    u.stroke();
    ringPath(u, 0.26);
    u.stroke();

    // The engraved band: five strands, in the sheet's five inks, weaving round.
    const drift = reduceMotion.matches ? 0 : clock * 0.11;
    for (let strand = 0; strand < BAND.strands; strand += 1) {
      u.strokeStyle = fade(C.inks[strand % C.inks.length], 0.1, strand === 0 ? 0.6 : 0.46);
      u.beginPath();
      for (let n = 0; n <= 288; n += 1) {
        const angle = (n / 288) * TAU;
        project(...onDesk(angle, bandAt(strand, angle, drift), Q), flat, P);
        if (n === 0) u.moveTo(P[0], P[1]);
        else u.lineTo(P[0], P[1]);
      }
      u.stroke();
    }

    // Fine marks inside the rim, as on the scale of an instrument.
    u.strokeStyle = fade(C.inks[1], 0.07, 0.34);
    u.beginPath();
    for (let n = 0; n < 120; n += 1) {
      const angle = (n / 120) * TAU;
      project(...onDesk(angle, n % 5 === 0 ? 0.954 : 0.968, Q), flat, P);
      u.moveTo(P[0], P[1]);
      project(...onDesk(angle, 0.988, Q), flat, P);
      u.lineTo(P[0], P[1]);
    }
    u.stroke();

    // The accounts: a gauge each on the near rim, filling as work draws on it.
    const levels = accounts.levels;
    const full = accounts.full;
    const active = accounts.active;
    const pointed = focus === 'accounts';
    u.lineCap = 'round';
    seats.forEach((seat, i) => {
      const live = i === active;
      const c = full[i] ? C.pain : C.calm;
      u.lineWidth = 3;
      u.strokeStyle = css(mix(c, C.ground, 0.35), (pointed ? 0.5 : 0.34) * gathered);
      ringPath(u, 1, seat - SEAT_SPAN, seat + SEAT_SPAN, 24);
      u.stroke();
      const used = clamp(levels[i], 0, 1);
      if (used > 0.01) {
        u.strokeStyle = css(c, (live || pointed ? 0.98 : 0.6) * gathered);
        ringPath(u, 1, seat - SEAT_SPAN, seat - SEAT_SPAN + 2 * SEAT_SPAN * used, 24);
        u.stroke();
      }
    });
    u.lineCap = 'butt';

    drawGlass(quiet);
    u.globalCompositeOperation = 'source-over';
    u.globalAlpha = 1;
  }

  // ----- drawing: the glass, over the desk and behind the constellation -----
  // The dome's dust is the graphics card's (js/hub-cloud.js). What makes it read as glass is
  // drawn here, and does not turn, because the dome is round: the light inside it, the faint
  // body of it, its edge and its rim as hairlines, and a lamp's light on it.
  const edge = glassOutline();
  /** Adds a run of the glass's outline to the path: from one share of its length to another, drawn `inset` of the way in to the glass's middle. */
  function edgePath(run, from = 0, to = 1, inset = 0) {
    const last = run.length - 1;
    const first = Math.round(from * last);
    for (let n = first; n <= Math.round(to * last); n += 1) {
      const x = view.x + (run[n][0] + (edge.middle[0] - run[n][0]) * inset) * view.scale;
      const y = view.y + (run[n][1] + (edge.middle[1] - run[n][1]) * inset) * view.scale;
      if (n === first) u.moveTo(x, y);
      else u.lineTo(x, y);
    }
  }

  /** A fine arc of light along the glass: brightest in its middle, and gone at both ends. */
  function sheen(run, from, to, inset, alpha, width) {
    if (alpha <= 0.004) return;
    const last = run.length - 1;
    const a = run[Math.round(from * last)];
    const b = run[Math.round(to * last)];
    const paint = u.createLinearGradient(view.x + a[0] * view.scale, view.y + a[1] * view.scale, view.x + b[0] * view.scale, view.y + b[1] * view.scale);
    paint.addColorStop(0, css(C.white, 0));
    paint.addColorStop(0.5, css(C.white, Math.min(1, alpha)));
    paint.addColorStop(1, css(C.white, 0));
    u.strokeStyle = paint;
    u.lineWidth = width;
    u.beginPath();
    edgePath(run, from, to, inset);
    u.stroke();
  }

  function drawGlass(quiet) {
    // The glass forms as its dust gathers: a little after the desk, and before the work.
    const shown = ease(clamp((born - 0.1) / 0.7, 0, 1)) * (0.55 + 0.45 * quiet);
    if (shown <= 0.004) return;
    const size = view.scale;
    const mx = view.x + edge.middle[0] * size;
    const my = view.y + edge.middle[1] * size;
    u.globalAlpha = 1;
    u.lineCap = 'round';
    u.lineJoin = 'round';

    // The light inside it: brightest round the orchestrator, and gone before it reaches the glass.
    u.globalCompositeOperation = 'lighter';
    u.save();
    u.translate(mx, my + GLASS_LIGHT.low * size);
    u.scale(1, GLASS_LIGHT.flat);
    const inner = u.createRadialGradient(0, 0, 0, 0, 0, GLASS_LIGHT.wide * size);
    inner.addColorStop(0, css(C.dust, GLASS_LIGHT.inner * shown));
    inner.addColorStop(0.5, css(C.dust, GLASS_LIGHT.inner * 0.34 * shown));
    inner.addColorStop(1, css(C.dust, 0));
    u.fillStyle = inner;
    u.beginPath();
    u.arc(0, 0, GLASS_LIGHT.wide * size, 0, TAU);
    u.fill();
    u.restore();

    // Its body: the faintest wash, most on the side the lamp is.
    const wash = u.createLinearGradient(mx - 0.8 * size, my - 0.5 * size, mx + 0.7 * size, my + 0.45 * size);
    wash.addColorStop(0, css(C.calm, GLASS_LIGHT.body * shown));
    wash.addColorStop(1, css(C.calm, 0));
    u.fillStyle = wash;
    u.beginPath();
    edgePath(edge.dome);
    edgePath(edge.near);
    u.closePath();
    u.fill();

    // Its edge and its rim, as hairlines: the near half of the rim plain, the far half seen through the glass.
    u.lineWidth = 1;
    for (const [run, alpha] of [[edge.dome, GLASS_LIGHT.edge], [edge.near, GLASS_LIGHT.edge * 1.5], [edge.far, GLASS_LIGHT.edge * 0.5]]) {
      u.strokeStyle = css(C.inks[1], alpha * shown);
      u.beginPath();
      edgePath(run);
      u.stroke();
    }

    // A lamp over the viewer's left shoulder: two fine arcs of its light high on the left, where
    // the glass turns away, and a fainter one low on the right, where the light leaves.
    for (const [from, to, inset, alpha, width] of GLASS_LIGHT.arcs) {
      sheen(edge.dome, from, to, inset, alpha * 0.14 * shown, width * 4.5);
      sheen(edge.dome, from, to, inset, alpha * shown, width);
    }
  }

  // ----- drawing: the work, over the mind -----
  function draw() {
    dirty = false;
    view.yaw = LOOK.yaw + spun + wheel.angle;
    locate();
    if (focus) place();

    const jobs = floor.jobs;
    const waved = wave && waveAt(clock - wave.born);
    if (wave && !waved) wave = null;
    const quiet = dimmed;
    const surge = waved ? { from: wave.from, radius: waved.radius, strength: waved.strength } : null;

    drawDesk(quiet);
    const onCard = cloud?.ready;
    if (onCard) {
      cloud.draw({ view, time: clock, born, quiet, fire: !reduceMotion.matches, busy, wave: surge });
    } else {
      // No graphics card, or not yet: the plain cloud, on the desk's own canvas.
      cloud?.clear();
      u.globalAlpha = 1;
      drawLite(u, { view, quiet: quiet * ease(born), busy, wave: surge });
      u.globalAlpha = 1;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, SW, SH);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const gathered = ease(clamp((born - 0.35) / 0.65, 0, 1)); // the work appears once the mind is there
    if (gathered <= 0) {
      layOut(Infinity, 0);
      return;
    }

    ctx.globalCompositeOperation = 'lighter';

    // The pathways the work takes: orchestrator, Queue, Build, Audit, Merge.
    const route = [ORCHESTRATOR, ...REGIONS.map((region) => region.centre)];
    for (let n = 0; n < route.length - 1; n += 1) path(route[n], route[n + 1], C.calm, (0.13 * quiet + (focus === 'orchestrator' ? 0.12 : 0)) * gathered);

    drawArteries(gathered);
    drawThread(jobs, gathered);

    // Points of the constellation firing where work has just landed, lighting and going out.
    if (!reduceMotion.matches) {
      sparks = sparks.filter((spark) => clock - spark.born < spark.life);
      for (const spark of sparks) {
        const age = (clock - spark.born) / spark.life;
        const i = spark.i;
        project(mind.at[i * 3], mind.at[i * 3 + 1], mind.at[i * 3 + 2], view, P);
        glow(ctx, P[0], P[1], (4 + 6 * (1 - age)) * P[2] * mark, spark.c, (1 - age) * 0.85 * (0.4 + 0.6 * quiet));
      }
    }

    // Rings where something has just happened.
    ring = ring.filter((each) => clock - each.born < 0.9);
    ctx.lineWidth = 1.2;
    for (const each of ring) {
      const age = (clock - each.born) / 0.9;
      project(each.at[0], each.at[1], each.at[2], view, P);
      ctx.globalAlpha = (1 - age) * 0.7 * gathered;
      ctx.strokeStyle = css(each.c);
      ctx.beginPath();
      ctx.arc(P[0], P[1], each.size * P[2] * mark * (0.4 + age), 0, TAU);
      ctx.stroke();
    }

    // The jobs: a bright light each, with a tail when it crosses.
    for (const job of jobs) drawJob(job, gathered);

    // The orchestrator and the decision model.
    drawCentre(gathered);
    drawDecision(gathered);

    // What the part being shown does.
    if (focus === 'orchestrator') showOrchestrator();
    if (focus === 'decision') showDecision();

    ctx.globalCompositeOperation = 'source-over';
    layOut(lastStep, gathered);
    lastStep = 0; // spent: drawn again before the next step, the names stand where they are
    drawLeaders(gathered);
    drawCardLine();
    ctx.globalAlpha = 1;
  }

  function path(a, b, c, alpha, width = 1) {
    if (alpha <= 0.004) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.strokeStyle = css(c);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let n = 0; n <= 24; n += 1) {
      along(a, b, n / 24, Q);
      project(Q[0], Q[1], Q[2], view, P);
      if (n === 0) ctx.moveTo(P[0], P[1]);
      else ctx.lineTo(P[0], P[1]);
    }
    ctx.stroke();
  }

  /** A curve on the screen, from four points: start, two handles, end. */
  function curve(line, c, alpha, width, upTo = 1) {
    if (alpha <= 0.004 || upTo <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.strokeStyle = css(c);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    if (upTo >= 1) {
      ctx.bezierCurveTo(line[1][0], line[1][1], line[2][0], line[2][1], line[3][0], line[3][1]);
    } else {
      for (let n = 1; n <= 32; n += 1) {
        wireAt(line, (upTo * n) / 32, R);
        ctx.lineTo(R[0], R[1]);
      }
    }
    ctx.stroke();
  }

  function colourOf(job) {
    if (job.kind !== 'Release') return C.calm;
    return job.at > GATE || (job.at === GATE && !job.waiting) ? C.clear : C.held;
  }

  function drawJob(job, gathered) {
    const where = placeOf(job);
    const c = colourOf(job);
    const a = spot(where.from, job.id);
    const b = spot(where.to, job.id);
    const alpha = (1 - where.fade) * (focus ? 0.55 + 0.45 * dimmed : 1) * gathered;
    if (where.from !== where.to && !reduceMotion.matches) {
      for (let n = 8; n >= 1; n -= 1) {
        const t = where.t - n * 0.022;
        if (t <= 0) continue;
        along(a, b, t, Q);
        project(Q[0], Q[1], Q[2], view, P);
        glow(ctx, P[0], P[1], (7 - n * 0.5) * P[2] * mark, c, alpha * (1 - n / 9) * 0.5);
      }
    }
    along(a, b, where.from === where.to ? 0 : where.t, Q);
    project(Q[0], Q[1], Q[2], view, P);
    const big = job.kind === 'Release' ? 16 : 10 + job.tier * 1.5;
    glow(ctx, P[0], P[1], big * P[2] * mark, c, alpha);
    if (job.waiting) {
      // Held at the gate: a slow amber breath.
      const breath = reduceMotion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 3.2);
      ctx.globalAlpha = (0.5 + 0.4 * breath) * gathered;
      ctx.strokeStyle = css(C.held);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P[0], P[1], (13 + 5 * breath) * P[2] * mark, 0, TAU);
      ctx.stroke();
    }
  }

  /**
   * The thread from the gate to the page's button: the one place a person is in this picture.
   * It is faint while nothing is on its way, fills from the gate as a release comes, is whole
   * and alive while the release waits, and carries the approval back.
   */
  const gate = [0, 0];
  let thread = null; // the four points of the thread this frame, or null while the button has no size
  function drawThread(jobs, gathered) {
    thread = null;
    if (!pill) return;
    const release = releaseOf(jobs);
    if (release) along(spot(GATE - 1, release.id), spot(GATE, release.id), 0.5, Q);
    else along(REGIONS[GATE - 1].centre, REGIONS[GATE].centre, 0.5, Q);
    project(Q[0], Q[1], Q[2], view, P);
    gate[0] = P[0];
    gate[1] = P[1];
    const end = port(pill, { x: gate[0], y: gate[1] });
    thread = wire({ x: gate[0], y: gate[1] }, end);

    const still = reduceMotion.matches;
    const cleared = clock < clearedUntil;
    const armed = Boolean(floor.waiting);
    const c = cleared ? C.clear : C.held;
    const lift = (focus && focus !== 'decision' ? 0.5 : 1) * gathered;

    // Always there, faintly: a dotted line, as on a drawing.
    ctx.setLineDash([1.5, 5.5]);
    curve(thread, c, 0.3 * lift, 1.1);
    ctx.setLineDash([]);

    // The part a release has earned so far, from the gate: all of it once it waits.
    const reach = cleared || armed ? 1 : coming;
    if (reach > 0.01) {
      curve(thread, c, (cleared || armed ? 0.2 : 0.1) * lift, 5, reach);
      curve(thread, c, (cleared || armed ? 0.95 : 0.3 + 0.4 * coming) * lift, 1.4, reach);
    }

    // Where it meets the button, and where it leaves the mind.
    glow(ctx, end.x, end.y, armed || cleared ? 11 : 6, c, (armed || cleared ? 0.9 : 0.35 + 0.3 * coming) * lift);
    if (!release) glow(ctx, gate[0], gate[1], 7, C.held, 0.4 * lift);

    if (still) return;
    if (armed && !cleared) {
      // A release is asking: its question runs down to the button, again and again.
      for (let n = 0; n < 2; n += 1) {
        const t = (clock / 1.5 + n / 2) % 1;
        wireAt(thread, t, R);
        glow(ctx, R[0], R[1], 9, C.held, Math.sin(Math.PI * t) * 0.95 * lift);
      }
    }
    if (pulse >= 0) {
      // The answer runs back up to the gate.
      const t = (clock - pulse) / PULSE;
      if (t >= 1) {
        pulse = -1;
      } else {
        wireAt(thread, 1 - ease(t), R);
        glow(ctx, R[0], R[1], 13, C.clear, 1);
        glow(ctx, R[0], R[1], 26, C.clear, 0.35);
      }
    }
  }

  function drawCentre(gathered) {
    const [x, y] = at.orchestrator;
    const pointed = focus === 'orchestrator';
    glow(ctx, x, y, (pointed ? 34 : 24) * mark, C.white, (pointed ? 0.7 : 0.5) * gathered);
    ping(x, y, C.white, 0, gathered);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = gathered;
    ctx.fillStyle = css(C.white);
    ctx.beginPath();
    ctx.arc(x, y, (pointed ? 4 : 3.2) * mark, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.75 * gathered;
    ctx.strokeStyle = css(C.white);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, (pointed ? 10 : 8) * mark, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
  }

  function drawDecision(gathered) {
    const [x, y] = at.decision;
    const pointed = focus === 'decision';
    glow(ctx, x, y, (pointed ? 26 : 15) * mark, C.calm, (pointed ? 0.7 : 0.45) * (0.5 + 0.5 * dimmed) * gathered);
    ping(x, y, C.calm, 1.4, gathered);
    const size = (pointed ? 6.5 : 5) * mark;
    ctx.globalAlpha = 0.95 * gathered;
    ctx.strokeStyle = css(C.calm);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.stroke();
  }

  /** A slow ring going out from a part that can be asked what it does. */
  function ping(x, y, c, late, gathered) {
    if (focus) return;
    const t = reduceMotion.matches ? 0.35 : ((clock + late) % 4.2) / 1.5;
    if (t >= 1) return;
    ctx.globalAlpha = (1 - t) * 0.42 * gathered;
    ctx.strokeStyle = css(c);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, (9 + 15 * ease(t)) * mark, 0, TAU);
    ctx.stroke();
  }

  /** From each account, up under the glass to the orchestrator: what the work is drawing on. */
  const artery = [[0, 0], [0, 0], [0, 0], [0, 0]];
  function drawArteries(gathered) {
    const pointed = focus === 'accounts';
    const full = accounts.full;
    const active = accounts.active;
    const [cx, cy] = at.orchestrator;
    project(0, GLASS.floor + 0.34, 0, view, P); // under the middle of the glass
    const footX = P[0];
    const footY = P[1];
    seats.forEach((seat, i) => {
      const live = i === active;
      artery[0][0] = vessels[i][0];
      artery[0][1] = vessels[i][1];
      project(...onDesk(seat, 0.42, Q), flat, P);
      artery[1][0] = P[0];
      artery[1][1] = P[1];
      artery[2][0] = footX;
      artery[2][1] = footY + (cy - footY) * 0.1;
      artery[3][0] = cx;
      artery[3][1] = cy + 9;
      const c = full[i] ? C.pain : C.calm;
      curve(artery, c, (live ? 0.4 : 0.11) * (pointed ? 1.6 : 1) * (0.5 + 0.5 * dimmed) * gathered, 1);
      glow(ctx, artery[0][0], artery[0][1], live ? (pointed ? 15 : 11) : 6, c, (live ? 0.75 : 0.3) * gathered);
      if (live && !reduceMotion.matches) {
        const count = pointed ? 4 : 2;
        for (let n = 0; n < count; n += 1) {
          const t = (clock * (pointed ? 0.9 : 0.45) + n / count) % 1;
          wireAt(artery, t, R);
          glow(ctx, R[0], R[1], pointed ? 7 : 5, C.calm, 0.8 * Math.sin(Math.PI * t) * gathered);
        }
      }
    });
  }

  function showOrchestrator() {
    // Every region, one after another, sent work down a lit pathway.
    if (reduceMotion.matches) {
      for (const region of REGIONS) path(ORCHESTRATOR, region.centre, C.white, 0.5, 1.4);
      return;
    }
    REGIONS.forEach((region, i) => {
      path(ORCHESTRATOR, region.centre, C.white, 0.42, 1.4);
      const t = (clock * 0.8 + i / REGIONS.length) % 1;
      along(ORCHESTRATOR, region.centre, t, Q);
      project(Q[0], Q[1], Q[2], view, P);
      glow(ctx, P[0], P[1], 9 * P[2], C.white, 0.9 * Math.sin(Math.PI * t));
    });
  }

  function showDecision() {
    // A build arrives, and leaves one of three ways: on to the audit, back for a fix, or down to you.
    const build = REGIONS[1].centre;
    const ways = [
      [REGIONS[2].centre, C.clear],
      [build, C.pain],
    ];
    path(build, DECISION, C.calm, 0.55, 1.5);
    for (const [to, c] of ways) path(DECISION, to, c, 0.62, 1.6);
    // The third way leaves the mind: a question for whoever is reading the page.
    const from = { x: at.decision[0], y: at.decision[1] };
    const ask = pill ? wire(from, port(pill, from)) : null;
    if (ask) curve(ask, C.held, 0.62, 1.6);
    if (reduceMotion.matches) return;
    const cycle = clock % 3.6;
    const way = Math.floor(cycle / 1.2);
    const t = (cycle % 1.2) / 1.2;
    if (t < 0.45) {
      along(build, DECISION, t / 0.45, Q);
      project(Q[0], Q[1], Q[2], view, P);
      glow(ctx, P[0], P[1], 9 * P[2], C.calm, 0.9);
    } else if (way < ways.length) {
      const [to, c] = ways[way];
      along(DECISION, to, (t - 0.45) / 0.55, Q);
      project(Q[0], Q[1], Q[2], view, P);
      glow(ctx, P[0], P[1], 10 * P[2], c, 0.95);
    } else if (ask) {
      wireAt(ask, (t - 0.45) / 0.55, R);
      glow(ctx, R[0], R[1], 10, C.held, 0.95);
    }
  }

  /** From each stage's place under the glass to its name. */
  function drawLeaders(gathered) {
    ctx.lineWidth = 1;
    names.forEach((name, i) => {
      const lit = busy[i] > AT_WORK;
      const near = clamp(0.98 - name.depth * 0.5, 0.45, 1);
      const alpha = near * (0.5 + 0.5 * dimmed) * gathered;
      const c = lit ? C.lit : C.inks[1];
      // The place itself: a small ring.
      ctx.globalAlpha = alpha * (lit ? 1 : 0.8);
      ctx.strokeStyle = css(c);
      ctx.beginPath();
      ctx.arc(name.px, name.py, lit ? 4 : 3.2, 0, TAU);
      ctx.stroke();
      if (name.alpha < 0.02) return;
      const dx = name.tipX - name.px;
      const dy = name.tipY - name.py;
      const length = Math.hypot(dx, dy);
      if (length < 14) return;
      const off = 4.5 / length; // leave the ring, and stop short of the name
      const short = 1 - 6 / length;
      ctx.globalAlpha = alpha * name.alpha * 0.66;
      ctx.beginPath();
      ctx.moveTo(name.px + dx * off, name.py + dy * off);
      ctx.lineTo(name.px + dx * short, name.py + dy * short);
      ctx.stroke();
    });
  }

  /** From the part being shown to its card. */
  function drawCardLine() {
    if (!focus || focus === 'accounts') return;
    const [x, y] = at[focus];
    const tx = clamp(x, cardBox.left, cardBox.right);
    const ty = clamp(y, cardBox.top + 18, cardBox.bottom - 18);
    const length = Math.hypot(tx - x, ty - y);
    if (length < 16) return;
    ctx.globalAlpha = 0.5 * (1 - dimmed) / (1 - DIM);
    ctx.strokeStyle = css(focus === 'decision' ? C.calm : C.white);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + ((tx - x) * 12) / length, y + ((ty - y) * 12) / length);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  }

  // ----- running -----
  let shown = 1;
  let lastStep = 0;
  function step(dt) {
    clock += dt;
    lastStep = dt;
    if (seen && born < 1) born = Math.min(1, born + dt / GATHER);
    if (!press) spun += SPIN * dt * (focus ? 0.35 : 1);
    wheel.step(dt);
    floor.step(dt);
    accounts.step(dt * (focus === 'accounts' ? 6 : 1));
    if (focus === 'accounts') for (let n = 0; n < 3; n += 1) if (random() < dt * 6) accounts.draw(0.05);
    notice();
    if (floor.waiting && floor.waiting.id !== held) {
      held = floor.waiting.id;
      status.textContent = 'A release is waiting at the gate for your approval.';
    }
    const jobs = floor.jobs;
    const count = [0, 0, 0, 0];
    for (const job of jobs) {
      const { from, to } = placeOf(job);
      if (from === to && from >= 0) count[from] += 1;
    }
    const quick = 1 - Math.exp(-dt / 0.3);
    for (let r = 0; r < busy.length; r += 1) busy[r] += (Math.min(1, count[r] * 0.55) - busy[r]) * quick;
    const release = releaseOf(jobs);
    const nearing = release && release.at <= GATE ? approach(release) : 0;
    coming += (nearing - coming) * (1 - Math.exp(-dt / 0.25));
    const target = focus ? DIM : 1;
    shown = target + (shown - target) * Math.exp(-dt / 0.12);
    dimmed = shown;
  }

  let state = '';
  let filled = -1;
  function sync() {
    const waiting = floor.waiting;
    const next = clock < clearedUntil ? 'cleared' : waiting ? 'armed' : coming > 0.03 ? 'coming' : 'idle';
    if (next !== state) {
      state = next;
      button.dataset.state = next;
      button.setAttribute('aria-disabled', waiting ? 'false' : 'true');
      stage.classList.toggle('is-waiting', Boolean(waiting));
    }
    const fill = next === 'cleared' || next === 'armed' ? 1 : coming;
    if (Math.abs(fill - filled) > 0.004) {
      filled = fill;
      charge.style.transform = `scaleX(${fill.toFixed(3)})`;
    }
  }

  function still() {
    const count = [0, 0, 0, 0];
    for (const job of floor.jobs) {
      const { from, to } = placeOf(job);
      if (from === to && from >= 0) count[from] += 1;
    }
    for (let r = 0; r < busy.length; r += 1) busy[r] = Math.min(1, count[r] * 0.55);
    const release = releaseOf(floor.jobs);
    coming = release && release.at <= GATE ? approach(release) : 0;
  }

  measure();
  // Measuring gives the canvases their new size, which wipes them, and the browser paints straight
  // after telling the page of a new size: so a Hub that can be seen is drawn again here, at once, or
  // every frame of a window being resized would be painted empty. One that cannot be seen is drawn
  // when it next shows. (With motion reduced it is drawn either way, as it always was.)
  const measured = () => {
    measure();
    if (loop.visible || reduceMotion.matches) draw();
  };
  const watch = new ResizeObserver(measured);
  for (const el of [slab, stage, button]) watch.observe(el);

  if (reduceMotion.matches) {
    settle();
    held = floor.waiting?.id ?? 0;
    still();
  }
  sync();
  document.fonts?.ready.then(measured);
  draw();

  // The full cloud is built once the page has nothing better to do: until then the plain one stands in.
  (window.requestIdleCallback ?? ((run) => setTimeout(run, 240)))(buildCloud);

  const loop = whileVisible(
    stage,
    (dt) => {
      if (reduceMotion.matches) {
        // Nothing moves by itself: the picture changes only when the visitor turns it, opens a part or approves.
        dimmed = focus ? DIM : 1;
        born = 1;
        wheel.step(dt);
        if (dirty || press) {
          still();
          sync();
          draw();
        }
        return;
      }
      step(dt);
      sync();
      draw();
    },
    {
      onShow: () => {
        seen = true;
        dirty = true;
      },
    },
  );

  return true;
}
