// The frame loop every moving part shares: the time step it hands out.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Just enough of a page for js/motion.js: one frame queue, one clock, one thing to watch.
const frames = [];
const watchers = [];
let clock = 0; // what performance.now() says, in milliseconds
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.requestAnimationFrame = (run) => frames.push(run);
globalThis.IntersectionObserver = class {
  constructor(heard) {
    watchers.push(heard);
  }
  observe() {}
};

const { whileVisible } = await import('../js/motion.js');

/** A loop that has just come into view at `startedAt`, and the steps it has handed out. */
function aLoop(startedAt) {
  frames.length = 0;
  watchers.length = 0;
  const steps = [];
  whileVisible({ closest: () => null }, (dt) => steps.push(dt));
  clock = startedAt;
  watchers[0]([{ isIntersecting: true }]);
  return { steps, frame: (time) => frames.splice(0).forEach((run) => run(time)) };
}

test('a frame gives the time since the one before, in seconds, and never more than a twentieth', () => {
  const loop = aLoop(1000);
  loop.frame(1016);
  loop.frame(1032);
  loop.frame(5000); // the tab was away
  assert.deepEqual(loop.steps.map((dt) => Number(dt.toFixed(3))), [0.016, 0.016, 0.05]);
});

test('time never runs backwards: a first frame timed before the loop started gives a step of nothing', () => {
  // A browser times a frame from when it was due, which can be before the page's own clock said
  // the loop started (measured in Chrome: up to 18 ms before, in 20 to 100 of 100 starts on a busy
  // page). A step below nothing sends the Hub's jobs to places that do not exist, and it stops.
  const loop = aLoop(1000);
  loop.frame(992);
  loop.frame(1008);
  assert.deepEqual(loop.steps.map((dt) => Number(dt.toFixed(3))), [0, 0.016]);
});
