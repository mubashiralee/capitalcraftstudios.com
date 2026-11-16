// The Hub's view, run on a made-up page: when its picture is drawn.
//
// The numbers behind the Hub are tested where they live (cortex, floor, callouts, hub-cloud).
// What is tested here is the one thing only the view decides: that the picture is drawn again
// whenever what was on its canvases is gone. A canvas is wiped when it is given a size and when
// the graphics card takes its context away, and a view that draws only on a change (motion
// reduced) or only on the next frame (a window being resized) would leave the brain missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- a made-up page: just enough of one for js/hub.js to run on ----

const motion = { matches: false }; // "reduce motion", switched by each test before it starts a Hub
const frames = []; // what the page has asked to run on the next frame
const whenIdle = [];
const sizeWatchers = [];
const viewWatchers = [];

/** Something that takes any call and counts it by name: a drawing context, or a graphics card. */
function counter(answers = {}) {
  const calls = {};
  const held = {};
  const thing = new Proxy(held, {
    get(_, name) {
      if (name in held) return held[name];
      if (name in answers) return answers[name];
      if (typeof name === 'string' && /^[A-Z][A-Z0-9_]+$/.test(name)) return 1; // a card's constants
      return (...args) => {
        calls[name] = (calls[name] ?? 0) + 1;
        return { addColorStop() {}, width: args.length };
      };
    },
    set(_, name, value) {
      held[name] = value;
      return true;
    },
  });
  return { thing, calls, forget: () => Object.keys(calls).forEach((name) => delete calls[name]) };
}

class Part {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.heard = {};
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.positioned = false;
    this.box = { x: 0, y: 0, w: 0, h: 0 };
    this.width = 300;
    this.height = 150;
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this.pen = null;
    this.card = null;
  }
  setAttribute() {}
  getAttribute() {}
  hasAttribute() { return false; }
  setPointerCapture() {}
  append(...parts) {
    for (const part of parts) {
      part.remove();
      part.parent = this;
      this.children.push(part);
    }
  }
  prepend(...parts) {
    for (const part of parts.reverse()) {
      part.remove();
      part.parent = this;
      this.children.unshift(part);
    }
  }
  replaceChildren(...parts) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...parts);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((each) => each !== this);
    this.parent = null;
  }
  addEventListener(type, heard) { (this.heard[type] ??= []).push(heard); }
  tell(type, event = {}) { for (const heard of this.heard[type] ?? []) heard({ type, target: this, preventDefault() {}, ...event }); }
  closest(selector) {
    for (let at = this; at; at = at.parent) if (at.className.split(' ').includes(selector.replace('.', ''))) return at;
    return null;
  }
  get offsetParent() {
    let at = this.parent;
    while (at && !at.positioned) at = at.parent;
    return at;
  }
  get offsetLeft() { return Math.round(this.box.x - (this.offsetParent?.box.x ?? 0)); }
  get offsetTop() { return Math.round(this.box.y - (this.offsetParent?.box.y ?? 0)); }
  get offsetWidth() { return Math.round(this.box.w); }
  get offsetHeight() { return Math.round(this.box.h); }
  get clientWidth() { return this.offsetWidth; }
  get clientHeight() { return this.offsetHeight; }
  getBoundingClientRect() {
    const { x, y, w, h } = this.box;
    return { left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
  }
  getContext(kind) {
    if (kind === '2d') return (this.pen ??= counter()).thing;
    if (kind !== 'webgl2' || !Part.hasCard) return null;
    return (this.card ??= counter({ getShaderParameter: () => true, getProgramParameter: () => true, getUniformLocation: () => ({}) })).thing;
  }
}
Part.hasCard = true;

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.devicePixelRatio = 2;
globalThis.matchMedia = (query) => (query.includes('reduced-motion') ? motion : { matches: query.includes('hover') });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.requestAnimationFrame = (run) => frames.push(run);
globalThis.requestIdleCallback = (run) => whenIdle.push(run);
globalThis.ResizeObserver = class {
  constructor(heard) {
    this.heard = heard;
    sizeWatchers.push(this);
  }
  observe() {}
};
globalThis.IntersectionObserver = class {
  constructor(heard) {
    this.heard = heard;
    viewWatchers.push(this);
  }
  observe() {}
};
globalThis.document = {
  hidden: false,
  fonts: { ready: Promise.resolve() },
  addEventListener() {},
  createElement(tag) {
    // The scene and the names have a size on the page; every other part the Hub makes is laid out by the Hub.
    const part = new Part(tag);
    let own = null;
    Object.defineProperty(part, 'box', {
      get() {
        if (own) return own;
        if (part.className.includes('hub__scene')) return { x: 52, y: 964, w: 1296, h: 712 };
        if (part.className.includes('hub__label')) return { x: 640, y: 1000, w: 52, h: 20 };
        return { x: 0, y: 0, w: 0, h: 0 };
      },
      set(box) { own = box; },
    });
    return part;
  },
};

const { startHub } = await import('../js/hub.js');

// One clock: what the page reads as the time is the time its frames are given, as in a browser
// that is keeping up. (A frame timed before the page's clock is js/motion.js's business, and is
// tested there.)
let now = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
function run(count) {
  for (let frame = 0; frame < count; frame += 1) {
    now += 1000 / 60;
    for (const each of frames.splice(0)) each(now);
  }
}

/** A Hub on its sheet, in view, with its full brain built and the page at rest. */
function aHub({ reduce, inView = true }) {
  motion.matches = reduce;
  for (const list of [frames, whenIdle, sizeWatchers, viewWatchers]) list.length = 0;
  const sheet = Object.assign(new Part('section'), { className: 'sheet', positioned: true });
  const slab = Object.assign(new Part('div'), { className: 'hub__slab', positioned: true, box: { x: 100, y: 1000, w: 1200, h: 640 } });
  const stage = Object.assign(new Part('div'), { className: 'hub__stage', box: { x: 640, y: 1000, w: 660, h: 640 } });
  const button = Object.assign(new Part('button'), { className: 'btn', box: { x: 100, y: 1400, w: 220, h: 50 } });
  const status = new Part('p');
  const controls = new Part('div');
  const words = new Part('div');
  controls.append(button);
  words.append(controls, status);
  slab.append(stage, words);
  sheet.append(slab);

  startHub({ slab, stage, button, status });
  const mine = { size: [...sizeWatchers], view: [...viewWatchers] };
  const show = (showing) => mine.view.forEach((watcher) => watcher.heard([{ isIntersecting: showing }]));
  show(inView);
  run(10);
  for (const build of whenIdle.splice(0)) build();
  run(90);

  const scene = slab.children[0];
  const [under, glass, over] = scene.children;
  const drawn = () => ({ desk: under.pen.calls.clearRect ?? 0, work: over.pen.calls.clearRect ?? 0, brain: glass.card.calls.drawArrays ?? 0 });
  const forget = () => [under.pen, over.pen, glass.card].forEach((each) => each.forget());
  forget();
  const within = (part) => [part, ...part.children.flatMap(within)];
  const names = within(slab).filter((part) => part.className.includes('hub__label'));
  return { scene, glass, names, drawn, forget, show, resized: () => mine.size.forEach((watcher) => watcher.heard([])) };
}

test('the made-up page runs the Hub: its full brain is built, and with motion on it is drawn every frame', () => {
  const hub = aHub({ reduce: false });
  assert.equal(hub.scene.dataset.cloud, 'card');
  run(30);
  assert.deepEqual(hub.drawn(), { desk: 30, work: 30, brain: 30 });
});

test('with motion reduced the Hub is drawn only when something has changed it', () => {
  const hub = aHub({ reduce: true });
  run(30);
  assert.deepEqual(hub.drawn(), { desk: 0, work: 0, brain: 0 }, 'a still Hub is being drawn again and again');
});

test('a new size wipes the canvases, so the Hub is drawn again there and then, not on the next frame', () => {
  // The browser paints straight after it tells the page of a new size: a view that waits for its
  // next frame is painted empty for every frame of a window being resized.
  for (const reduce of [false, true]) {
    const hub = aHub({ reduce });
    hub.resized(); // no frame is run: the drawing must have happened by the time this returns
    const { desk, work, brain } = hub.drawn();
    assert.ok(desk >= 1 && work >= 1 && brain >= 1, `after a new size (motion ${reduce ? 'reduced' : 'on'}) the Hub was left undrawn: ${JSON.stringify({ desk, work, brain })}`);
  }
});

test('drawing the Hub again after a new size moves nothing on: no time has passed', () => {
  // The names fade in and out by the time since the last frame. Drawn again between two frames,
  // they must stand where they stood, or they fade twice as fast while a window is being resized.
  const hub = aHub({ reduce: false });
  assert.equal(hub.names.length, 4);
  let fading = 0;
  for (let frame = 0; frame < 900; frame += 1) {
    const before = hub.names.map((name) => name.style.opacity);
    run(1);
    const stood = hub.names.map((name) => name.style.opacity);
    if (stood.some((opacity, i) => Math.abs(opacity - before[i]) > 0.02)) fading += 1;
    hub.resized();
    assert.deepEqual(hub.names.map((name) => name.style.opacity), stood, `frame ${frame}: a name moved on though no time had passed`);
  }
  assert.ok(fading > 0, 'no name faded in 900 frames: this test saw nothing that could have gone wrong');
});

test('a Hub that is out of sight is not drawn for a new size, and is drawn the moment it is seen', () => {
  const hub = aHub({ reduce: false, inView: false });
  hub.forget();
  hub.resized();
  assert.deepEqual(hub.drawn(), { desk: 0, work: 0, brain: 0 }, 'a Hub nobody can see was drawn');
  hub.show(true);
  run(1);
  const { desk, work, brain } = hub.drawn();
  assert.ok(desk >= 1 && work >= 1 && brain >= 1, `seen again, the Hub was left undrawn: ${JSON.stringify({ desk, work, brain })}`);
});

test('the fonts arriving make the Hub measure itself again, and it is drawn again there and then', async () => {
  for (const reduce of [false, true]) {
    const hub = aHub({ reduce }); // the page's fonts are ready, and the Hub hears of it once this has returned
    await new Promise((done) => setImmediate(done));
    const { desk, work, brain } = hub.drawn(); // no frame has been run
    assert.ok(desk >= 1 && work >= 1 && brain >= 1, `after the fonts arrived (motion ${reduce ? 'reduced' : 'on'}) the Hub was left undrawn: ${JSON.stringify({ desk, work, brain })}`);
  }
});

test('with motion reduced, a context the card takes away and hands back is drawn over both times', () => {
  const hub = aHub({ reduce: true });
  hub.glass.tell('webglcontextlost');
  run(3);
  assert.deepEqual(hub.drawn(), { desk: 1, work: 1, brain: 0 }, 'with the context lost the plainer brain must be drawn in its place, once');
  hub.forget();
  hub.glass.tell('webglcontextrestored');
  run(3);
  assert.deepEqual(hub.drawn(), { desk: 1, work: 1, brain: 1 }, 'with the context back the full brain must be drawn again, once');
});
