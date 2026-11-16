// The Orchestration Hub, drawn as its own brain: the Hub's Cortex view, made
// for this page. The work on the floor (js/floor.js) runs through it: the
// orchestrator fires each job into Queue, it crosses region to region, the
// decision model weighs every build, and a release stops at the gate until the
// visitor approves it. Then it lands in Merge and a wave of light crosses the
// brain. Point at the orchestrator, the decision model or the accounts and the
// rest dims while that part shows what it does.
//
// The numbers are in js/cortex.js and js/floor.js; this file only draws them.
// The jobs are made up: it is a picture of how the Hub works, not a feed.

import {
  DECISION,
  ORCHESTRATOR,
  REGIONS,
  YOU,
  along,
  buildCortex,
  createAccounts,
  facing,
  placeOf,
  pointOf,
  project,
  regionOfPoints,
  seeded,
  spot,
  waveAt,
} from './cortex.js';
import { GATE, STAGES, createFloor } from './floor.js';
import { finePointer, reduceMotion, whileVisible } from './motion.js';
import { createWheel } from './wheel.js';

const LANES = 5;
const PITCH = -0.2;
const SPIN = 0.07; // radians a second the brain turns by itself
const DIM = 0.3; // how bright the rest of the brain stays while one part is shown

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

const rgb = (hex) => {
  const value = Number.parseInt(hex.trim().replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const mix = (a, b, t) => a.map((part, i) => Math.round(part + (b[i] - part) * t));
const css = (c, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

/**
 * @param {{ stage: HTMLElement, button: HTMLButtonElement, status: HTMLElement }} parts
 *   `stage` is emptied and drawn into; `button` approves the waiting release;
 *   `status` is told, for screen readers, when a release starts to wait.
 */
export function startHub({ stage, button, status }) {
  const canvas = make('canvas', 'hub__brain');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'The Orchestration Hub drawn as a brain: jobs fire from the orchestrator through Queue, Build, Audit and Merge.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the Hub: no 2D canvas.');

  const card = make('div', 'hub__card');
  card.id = 'hub-card';
  card.setAttribute('role', 'tooltip');
  const cardName = make('p', 'hub__card-name');
  const cardText = make('p', 'hub__card-text');
  card.append(cardName, cardText);

  const nodes = {};
  for (const [key, part] of Object.entries(PARTS)) {
    const node = make('button', `hub__node hub__node--${key}`);
    node.type = 'button';
    node.setAttribute('aria-label', part.name);
    node.setAttribute('aria-describedby', card.id);
    node.dataset.part = key;
    nodes[key] = node;
  }
  stage.replaceChildren(canvas, ...Object.values(nodes), card);
  stage.classList.add('is-live');

  // ----- the palette: the sheet's own signal colours -----
  const look = getComputedStyle(stage);
  const C = {
    calm: rgb(look.getPropertyValue('--calm') || '#8fd3e8'),
    held: rgb(look.getPropertyValue('--held') || '#ffb547'),
    clear: rgb(look.getPropertyValue('--clear') || '#62dba0'),
    ground: rgb(look.getPropertyValue('--ground') || '#0b1f2a'),
    pain: [255, 107, 122],
    white: [246, 251, 253],
  };
  C.tissue = mix([92, 140, 214], C.calm, 0.25);
  C.lit = mix(C.tissue, C.calm, 0.75);
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
  function glow(x, y, radius, c, alpha) {
    if (alpha <= 0.004 || radius < 0.5) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(light(c), x - radius, y - radius, radius * 2, radius * 2);
  }

  // ----- the brain, the floor and the accounts -----
  const brain = buildCortex();
  const owner = regionOfPoints(brain);
  const floor = createFloor({ lanes: LANES });
  const accounts = createAccounts();
  const random = seeded(Date.now() >>> 0);

  // ----- size -----
  let W = 0;
  let H = 0;
  let dpr = 1;
  const view = { yaw: 0.55, pitch: PITCH, scale: 100, x: 0, y: 0 };
  function measure() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = stage.clientWidth;
    H = stage.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // The brain, the person above it and the accounts below it, with room for the nearest points to swell.
    view.scale = Math.min(W / 2.2, H / 2.55);
    view.x = W / 2;
    view.y = H * 0.45;
    dirty = true;
  }

  // ----- turning it by hand -----
  const wheel = createWheel();
  let spun = 0; // the brain's own turning
  let press = null;
  const angleAt = (x) => (x / Math.max(1, W)) * Math.PI * 1.4;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const box = canvas.getBoundingClientRect();
    press = { x: event.clientX, y: event.clientY, t: event.timeStamp, moved: false, at: event.timeStamp, box };
    wheel.grab(angleAt(event.clientX - box.left));
    canvas.classList.add('is-held');
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the page made up for itself cannot be captured; turning still works while it stays over the brain.
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!press) {
      if (finePointer.matches) canvas.classList.toggle('is-pointing', nearRelease(event));
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
    canvas.classList.remove('is-held');
    press = null;
    if (tapped && event.type === 'pointerup' && nearRelease(event)) approve();
    else if (tapped) show(null);
    dirty = true;
  };
  canvas.addEventListener('pointerup', letGo);
  canvas.addEventListener('pointercancel', letGo);

  // ----- what is on the floor, and what has just happened -----
  const P = [0, 0, 0, 0];
  const Q = [0, 0, 0];
  const placed = new Map(); // job id -> where it was last frame
  const known = new Set();
  let ring = []; // { x3, y3, z3, c, born, size }
  let sparks = []; // { i (a point of the brain) or at (a 3D point), c, born, life }
  let wave = null; // { from, born }
  let lastMerged = 0;
  let releaseId = 0;
  let held = 0; // the id of the release the page has said is waiting
  let clock = 0;
  let dirty = true;
  let focus = null; // the part being shown: 'orchestrator', 'decision' or 'accounts'
  let dimmed = 1;

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
        burst(place.to, 5);
      }
      placed.set(job.id, place);
    }
    const ids = new Set(floor.jobs.map((job) => job.id));
    for (const id of placed.keys()) if (!ids.has(id)) placed.delete(id);
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
    for (let n = 0; n < count; n += 1) {
      const i = Math.floor(random() * brain.count);
      if (owner[i] === region) sparks.push({ i, c: C.calm, born: clock, life: 0.5 + random() * 0.4 });
    }
  }

  // ----- the release -----
  function approve() {
    const waiting = floor.waiting;
    if (!waiting || !floor.approve(waiting.id)) return;
    sparks.push({ from: YOU, to: pointOf(waiting), c: C.clear, born: clock, life: 0.45 });
    if (reduceMotion.matches) {
      settle();
      wave = null;
      status.textContent = 'Release approved and merged. The next one is waiting at the gate.';
    } else {
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
  }
  function nearRelease(event) {
    const waiting = floor.waiting;
    if (!waiting) return false;
    const box = canvas.getBoundingClientRect();
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

  // Where each part's node is on the screen, this frame.
  const at = { orchestrator: [0, 0], decision: [0, 0], accounts: [0, 0] };
  const vessels = [[0, 0], [0, 0], [0, 0]];
  function locate() {
    project(...ORCHESTRATOR, view, P);
    at.orchestrator[0] = P[0];
    at.orchestrator[1] = P[1];
    project(...DECISION, view, P);
    at.decision[0] = P[0];
    at.decision[1] = P[1];
    const below = view.y + view.scale * 1.12;
    vessels.forEach((vessel, i) => {
      vessel[0] = view.x + (i - 1) * view.scale * 0.44;
      vessel[1] = below;
    });
    at.accounts[0] = view.x;
    at.accounts[1] = below;
    for (const [key, node] of Object.entries(nodes)) {
      const [x, y] = at[key];
      const half = key === 'accounts' ? rowHalf() : 22; // the accounts target covers the whole row
      node.style.width = `${(half * 2).toFixed(1)}px`;
      node.style.transform = `translate3d(${(x - half).toFixed(1)}px, ${(y - 22).toFixed(1)}px, 0)`;
    }
  }
  /** Half the width of the row of accounts, with room for a finger at each end. */
  const rowHalf = () => view.scale * 0.44 + 22;

  function place() {
    if (!focus) return;
    const [x, y] = at[focus];
    const right = x < W * 0.56;
    const width = Math.min(260, W - 32);
    const reach = focus === 'accounts' ? rowHalf() : 0; // clear of every account, not just the middle one
    const tall = card.offsetHeight || 140;
    let left = right ? x + reach + 30 : x - reach - 30 - width;
    let top = y - 48;
    let from = right ? 'left center' : 'right center'; // the card grows out of the side facing the part
    if (left < 12 || left + width > W - 12) {
      // No room beside the part (a phone): centre the card under it, or over it near the foot of the stage.
      left = (W - width) / 2;
      const under = y + 30 + tall <= H - 12;
      top = under ? y + 30 : y - 30 - tall;
      from = under ? 'center top' : 'center bottom';
    }
    top = Math.min(Math.max(12, top), H - tall - 12);
    card.style.setProperty('--card-x', `${left.toFixed(1)}px`);
    card.style.setProperty('--card-y', `${top.toFixed(1)}px`);
    card.style.setProperty('--card-w', `${width}px`);
    card.style.setProperty('--card-from', from);
  }

  // ----- drawing -----
  const BUCKETS = 4;
  const piles = Array.from({ length: 3 * BUCKETS }, () => []);
  const STEPS = [0.08, 0.17, 0.36, 0.62];

  function draw() {
    dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    view.yaw = 0.55 + spun + wheel.angle;
    locate();
    if (focus) place();

    const jobs = floor.jobs;
    const busy = [0, 0, 0, 0];
    for (const job of jobs) {
      const { from, to } = placeOf(job);
      if (from === to && from >= 0) busy[from] += 1;
    }
    const waved = wave && waveAt(clock - wave.born);
    if (wave && !waved) wave = null;
    const quiet = dimmed;

    // The body: one soft light behind the cloud.
    project(0, 0.05, 0.1, view, P);
    glow(P[0], P[1], view.scale * 1.2, C.tissue, 0.24 * quiet);

    // The cloud: each point by how bright it is, in a few piles so the colour is set a few times, not thousands.
    for (const pile of piles) pile.length = 0;
    const sz = Math.max(1.3, view.scale / 140);
    for (let i = 0; i < brain.count; i += 1) {
      const x = brain.at[i * 3];
      const y = brain.at[i * 3 + 1];
      const z = brain.at[i * 3 + 2];
      project(x, y, z, view, P);
      const depth = Math.min(1, Math.max(0.12, 0.62 - P[3] * 0.55));
      const rim = 1 - facing(brain.normal[i * 3], brain.normal[i * 3 + 1], brain.normal[i * 3 + 2], view);
      const f = brain.fold[i];
      const raised = brain.part[i] === 1 ? (f > 0.3 ? 1 : 0.2) : Math.min(1, Math.max(0, (f + 1.6) / 3.2));
      let v = depth * (0.3 + 0.7 * raised) * (0.3 + 1.05 * rim * rim);
      let family = 0;
      const r = owner[i];
      if (r >= 0 && busy[r] > 0) {
        family = 1;
        v *= 1 + Math.min(0.7, busy[r] * 0.35);
      }
      if (waved) {
        const d = Math.hypot(x - wave.from[0], y - wave.from[1], z - wave.from[2]) - waved.radius;
        const b = Math.exp((-d * d) / (d > 0 ? 0.012 : 0.06)) * waved.strength;
        if (b > 0.15) {
          family = 2;
          v *= 1 + 2.4 * b;
        }
      }
      v *= quiet;
      const bucket = v > 0.62 ? 3 : v > 0.4 ? 2 : v > 0.22 ? 1 : 0;
      piles[family * BUCKETS + bucket].push(P[0], P[1], P[2]);
    }
    const colours = [C.tissue, C.lit, C.wave];
    const strong = [1, 1.15, 1.7];
    piles.forEach((pile, k) => {
      if (pile.length === 0) return;
      const family = Math.floor(k / BUCKETS);
      ctx.globalAlpha = 1;
      ctx.fillStyle = css(colours[family], Math.min(1, STEPS[k % BUCKETS] * strong[family] * 1.9));
      const size = sz * (family === 2 ? 1.4 : 1);
      for (let n = 0; n < pile.length; n += 3) {
        const s = size * pile[n + 2];
        ctx.fillRect(pile[n] - s / 2, pile[n + 1] - s / 2, s, s);
      }
    });

    ctx.globalCompositeOperation = 'lighter';

    // The pathways the work takes: orchestrator, Queue, Build, Audit, Merge.
    const route = [ORCHESTRATOR, ...REGIONS.map((region) => region.centre)];
    for (let n = 0; n < route.length - 1; n += 1) path(route[n], route[n + 1], C.calm, 0.1 * quiet + (focus === 'orchestrator' ? 0.12 : 0));

    // The accounts: vessels under the brain, an artery from each to the orchestrator.
    drawAccounts();

    // Firing all over the brain: single neurons lighting and going out.
    if (!reduceMotion.matches) {
      sparks = sparks.filter((spark) => clock - spark.born < spark.life);
      for (const spark of sparks) {
        const age = (clock - spark.born) / spark.life;
        if (spark.from) {
          along(spark.from, spark.to, age, Q);
          project(Q[0], Q[1], Q[2], view, P);
          glow(P[0], P[1], 9 * P[2], spark.c, (1 - age * 0.6) * 0.9);
        } else {
          const i = spark.i;
          project(brain.at[i * 3], brain.at[i * 3 + 1], brain.at[i * 3 + 2], view, P);
          glow(P[0], P[1], (4 + 6 * (1 - age)) * P[2], spark.c, (1 - age) * 0.85 * (0.4 + 0.6 * quiet));
        }
      }
    }

    // Rings where something has just happened.
    ring = ring.filter((each) => clock - each.born < 0.9);
    ctx.lineWidth = 1.2;
    for (const each of ring) {
      const age = (clock - each.born) / 0.9;
      project(each.at[0], each.at[1], each.at[2], view, P);
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.strokeStyle = css(each.c);
      ctx.beginPath();
      ctx.arc(P[0], P[1], each.size * P[2] * (0.4 + age), 0, Math.PI * 2);
      ctx.stroke();
    }

    // The jobs: a bright neuron each, with a tail when it crosses.
    for (const job of jobs) drawJob(job);

    // The orchestrator, the decision model and the person.
    drawCentre();
    drawDecision();
    drawYou();

    // What the part being shown does.
    if (focus === 'orchestrator') showOrchestrator();
    if (focus === 'decision') showDecision();

    ctx.globalCompositeOperation = 'source-over';
    drawLabels();
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

  function colourOf(job) {
    if (job.kind !== 'Release') return C.calm;
    return job.at > GATE || (job.at === GATE && !job.waiting) ? C.clear : C.held;
  }

  function drawJob(job) {
    const where = placeOf(job);
    const c = colourOf(job);
    const a = spot(where.from, job.id);
    const b = spot(where.to, job.id);
    const alpha = (1 - where.fade) * (focus ? 0.55 + 0.45 * dimmed : 1);
    if (where.from !== where.to && !reduceMotion.matches) {
      for (let n = 8; n >= 1; n -= 1) {
        const t = where.t - n * 0.022;
        if (t <= 0) continue;
        along(a, b, t, Q);
        project(Q[0], Q[1], Q[2], view, P);
        glow(P[0], P[1], (7 - n * 0.5) * P[2], c, alpha * (1 - n / 9) * 0.5);
      }
    }
    along(a, b, where.from === where.to ? 0 : where.t, Q);
    project(Q[0], Q[1], Q[2], view, P);
    const big = job.kind === 'Release' ? 16 : 10 + job.tier * 1.5;
    glow(P[0], P[1], big * P[2], c, alpha);
    if (job.waiting) {
      // Held at the gate: a slow amber breath, and a signal up to the person who can let it through.
      const breath = reduceMotion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 3.2);
      ctx.globalAlpha = 0.5 + 0.4 * breath;
      ctx.strokeStyle = css(C.held);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(P[0], P[1], (13 + 5 * breath) * P[2], 0, Math.PI * 2);
      ctx.stroke();
      const gate = [Q[0], Q[1], Q[2]]; // path() below reuses Q
      path(gate, YOU, C.held, 0.32);
      if (!reduceMotion.matches) {
        const t = (clock % 1.6) / 1.6;
        along(gate, YOU, t, Q);
        project(Q[0], Q[1], Q[2], view, P);
        glow(P[0], P[1], 8, C.held, 0.9 * (1 - t * 0.4));
      }
    }
  }

  function drawCentre() {
    const [x, y] = at.orchestrator;
    const shown = focus === 'orchestrator';
    glow(x, y, shown ? 30 : 20, C.white, shown ? 0.65 : 0.4);
    const size = shown ? 9 : 7;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = css(C.white);
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.92, y + size * 0.62);
    ctx.lineTo(x - size * 0.92, y + size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  }

  function drawDecision() {
    const [x, y] = at.decision;
    const shown = focus === 'decision';
    glow(x, y, shown ? 26 : 14, C.calm, (shown ? 0.7 : 0.45) * (0.5 + 0.5 * dimmed));
    const size = shown ? 6.5 : 5;
    ctx.globalAlpha = 0.95;
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

  function drawYou() {
    project(...YOU, view, P);
    const asked = Boolean(floor.waiting) || focus === 'decision';
    const c = asked ? C.held : C.white;
    const breath = reduceMotion.matches ? 0.5 : 0.5 + 0.5 * Math.sin(clock * 3.2);
    glow(P[0], P[1], asked ? 18 + 6 * breath : 12, c, asked ? 0.75 : 0.35);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = css(c);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(P[0], P[1], 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawAccounts() {
    const shown = focus === 'accounts';
    const levels = accounts.levels;
    const full = accounts.full;
    const active = accounts.active;
    const [ox, oy] = at.orchestrator;
    vessels.forEach(([x, y], i) => {
      const live = i === active;
      // The artery up to the orchestrator.
      ctx.globalAlpha = (live ? 0.34 : 0.1) * (shown ? 1.6 : 1) * (0.5 + 0.5 * dimmed);
      ctx.strokeStyle = css(full[i] ? C.pain : C.calm);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.bezierCurveTo(x, y - 60, ox, oy + 70, ox, oy + 8);
      ctx.stroke();
      if (live && !reduceMotion.matches) {
        // What the work is drawing from it, flowing up.
        const count = shown ? 4 : 2;
        for (let n = 0; n < count; n += 1) {
          const t = (clock * (shown ? 0.9 : 0.45) + n / count) % 1;
          const u = 1 - t;
          const px = u * u * u * x + 3 * u * u * t * x + 3 * u * t * t * ox + t * t * t * ox;
          const py = u * u * u * (y - 18) + 3 * u * u * t * (y - 60) + 3 * u * t * t * (oy + 70) + t * t * t * (oy + 8);
          glow(px, py, shown ? 7 : 5, C.calm, 0.8 * Math.sin(Math.PI * t));
        }
      }
      // The vessel, and how much of it has been used.
      const h = 30;
      const w = 9;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = css(live ? C.calm : full[i] ? C.pain : mix(C.calm, C.ground, 0.45));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2);
      ctx.stroke();
      ctx.fillStyle = css(full[i] ? C.pain : C.calm, live ? 0.9 : 0.5);
      const used = Math.max(0, Math.min(1, levels[i])) * (h - 4);
      ctx.beginPath();
      ctx.roundRect(x - w / 2 + 2, y + h / 2 - 2 - used, w - 4, used, 2.5);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (live) glow(x, y - h / 2, shown ? 16 : 10, C.calm, 0.5);
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
      glow(P[0], P[1], 9 * P[2], C.white, 0.9 * Math.sin(Math.PI * t));
    });
  }

  function showDecision() {
    // A build arrives, and leaves one of three ways: on to the audit, back for a fix, or up to you.
    const build = REGIONS[1].centre;
    const ways = [
      [REGIONS[2].centre, C.clear],
      [build, C.pain],
      [YOU, C.held],
    ];
    path(build, DECISION, C.calm, 0.55, 1.5);
    for (const [to, c] of ways) path(DECISION, to, c, 0.62, 1.6);
    if (reduceMotion.matches) return;
    const cycle = clock % 3.6;
    const way = Math.floor(cycle / 1.2);
    const t = (cycle % 1.2) / 1.2;
    if (t < 0.45) {
      along(build, DECISION, t / 0.45, Q);
      project(Q[0], Q[1], Q[2], view, P);
      glow(P[0], P[1], 9 * P[2], C.calm, 0.9);
    } else {
      const [to, c] = ways[way];
      along(DECISION, to, (t - 0.45) / 0.55, Q);
      project(Q[0], Q[1], Q[2], view, P);
      glow(P[0], P[1], 10 * P[2], c, 0.95);
    }
  }

  function drawLabels() {
    ctx.font = `600 12px "Mona Sans", ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = css(C.ground, 0.85);
    const label = (text, x, y, alpha, align) => {
      // A narrow stage puts the outer labels past its edge: keep each one whole.
      const wide = ctx.measureText(text).width;
      x = align === 'right' ? Math.max(x, wide + 6) : Math.min(x, W - wide - 6);
      ctx.textAlign = align;
      ctx.globalAlpha = alpha;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = css(C.white);
      ctx.fillText(text, x, y);
    };
    REGIONS.forEach((region) => {
      const out = region.centre.map((part, i) => part + region.out[i] * 0.2);
      project(out[0], out[1], out[2], view, P);
      const near = Math.min(1, Math.max(0.25, 0.75 - P[3] * 0.7));
      label(region.stage, P[0], P[1], near * (0.45 + 0.55 * dimmed), P[0] < view.x ? 'right' : 'left');
    });
    project(...YOU, view, P);
    label('You', P[0] + 12, P[1], 0.9, 'left');
  }

  // ----- running -----
  let shown = 1;
  function step(dt) {
    clock += dt;
    if (!press && !reduceMotion.matches) spun += SPIN * dt * (focus ? 0.35 : 1);
    wheel.step(dt);
    floor.step(dt);
    accounts.step(dt * (focus === 'accounts' ? 6 : 1));
    if (focus === 'accounts') for (let n = 0; n < 3; n += 1) if (random() < dt * 6) accounts.draw(0.05);
    notice();
    // Neurons firing at random all over, more where work is.
    const rate = focus ? 6 : 14;
    for (let n = 0; n < 3; n += 1) if (random() < dt * rate) sparks.push({ i: Math.floor(random() * brain.count), c: random() < 0.15 ? C.white : C.calm, born: clock, life: 0.35 + random() * 0.5 });
    if (floor.waiting && floor.waiting.id !== held) {
      held = floor.waiting.id;
      status.textContent = 'A release is waiting at the gate for your approval.';
    }
    const target = focus ? DIM : 1;
    shown = target + (shown - target) * Math.exp(-dt / 0.12);
    dimmed = shown;
  }

  function sync() {
    const waiting = floor.waiting;
    button.setAttribute('aria-disabled', waiting ? 'false' : 'true');
    stage.classList.toggle('is-held', Boolean(waiting));
  }

  measure();
  new ResizeObserver(() => {
    measure();
    if (reduceMotion.matches) draw();
  }).observe(stage);

  if (reduceMotion.matches) {
    settle();
    held = floor.waiting?.id ?? 0;
  }
  sync();
  document.fonts?.ready.then(() => {
    dirty = true;
    if (reduceMotion.matches) draw();
  });
  draw();

  whileVisible(stage, (dt) => {
    if (reduceMotion.matches) {
      // Nothing moves by itself: the picture changes only when the visitor turns it, opens a part or approves.
      dimmed = focus ? DIM : 1;
      wheel.step(dt);
      if (dirty || press) {
        sync();
        draw();
      }
      return;
    }
    step(dt);
    sync();
    draw();
  });

  return true;
}
