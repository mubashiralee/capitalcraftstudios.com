// The rosettes beside the services, made to turn. Each is a wheel (js/wheel.js):
// drag it round and let go and it spins on; pass a mouse across it and it is
// brushed along; press it and a new one is struck in its place.
//
// A rosette is woven from two sets of strands, one in each ink. The wheel
// turns one set one way and the other set the other way, so the weave itself
// changes as it goes (the stylesheet does the turning, from --turn).

import { reduceMotion } from './motion.js';
import { createWheel, sweep } from './wheel.js';

/** A press is a press, and not a drag, if the pointer slipped no further than this and was up again this soon. */
const PRESS = { slip: 6, longest: 450 }; // pixels, milliseconds
/** Nearer the middle than this share of the rosette's radius, a pointer's angle swings too wildly to brush with. */
const HUB = 0.22;
/** The longest step of time one frame may stand for, in seconds. */
const LONGEST_FRAME = 0.05;

/**
 * @param {{ els: HTMLElement[], strike: (el: HTMLElement) => void }} parts
 *   `els` hold the rosettes; `strike` puts a new rosette in one of them.
 */
export function startRosettes({ els, strike }) {
  const items = els.map((el) => ({ el, wheel: createWheel(), shown: '', press: null, over: null }));
  let frame = 0;
  let last = 0;

  /** Where a pointer is on a rosette: its angle round the middle, and how far out it is (1 at the rim). */
  function place(el, event) {
    const box = el.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    return { at: Math.atan2(y, x), reach: Math.hypot(x, y) / (box.width / 2) };
  }

  function show(item) {
    const turn = `${((item.wheel.angle * 180) / Math.PI).toFixed(2)}deg`;
    if (turn === item.shown) return;
    item.shown = turn;
    item.el.style.setProperty('--turn', turn);
  }

  function tick(now) {
    const seconds = Math.min(LONGEST_FRAME, Math.max(0, (now - last) / 1000));
    last = now;
    let turning = false;
    for (const item of items) {
      if (item.wheel.step(seconds)) turning = true;
      show(item);
    }
    frame = turning ? requestAnimationFrame(tick) : 0;
  }

  /** Keep the frames coming while any wheel is turning by itself. */
  function run() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  for (const item of items) {
    const { el, wheel } = item;

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || item.press) return;
      item.press = { id: event.pointerId, x: event.clientX, y: event.clientY, since: event.timeStamp, moved: event.timeStamp, slip: 0 };
      item.over = null;
      el.classList.add('is-held');
      wheel.grab(place(el, event).at);
      // Last, so that the wheel is already in hand if the browser will not give the pointer over:
      // the drag then still works for as long as the pointer stays on the rosette.
      el.setPointerCapture(event.pointerId);
    });

    el.addEventListener('pointermove', (event) => {
      const { at, reach } = place(el, event);
      const press = item.press;
      if (press) {
        if (press.id !== event.pointerId) return;
        press.slip = Math.max(press.slip, Math.hypot(event.clientX - press.x, event.clientY - press.y));
        wheel.drag(at, (event.timeStamp - press.moved) / 1000);
        press.moved = event.timeStamp;
        show(item);
        return;
      }
      // A mouse passing over, not holding: it brushes the wheel along. (A finger cannot pass over without touching.)
      if (event.pointerType !== 'mouse' || reduceMotion.matches) return;
      if (item.over && reach > HUB) {
        wheel.brush(sweep(item.over.at, at), (event.timeStamp - item.over.time) / 1000);
        run();
      }
      item.over = reach > HUB ? { at, time: event.timeStamp } : null;
    });

    el.addEventListener('pointerleave', () => {
      item.over = null;
    });

    const letGo = (event, cancelled) => {
      const press = item.press;
      if (!press || press.id !== event.pointerId) return;
      item.press = null;
      el.classList.remove('is-held');
      const pressed = !cancelled && press.slip <= PRESS.slip && event.timeStamp - press.since <= PRESS.longest;
      // With no motion a rosette goes only where a hand puts it: it does not spin on.
      wheel.release(reduceMotion.matches ? Infinity : (event.timeStamp - press.moved) / 1000);
      if (pressed) strike(el);
      else run();
    };
    el.addEventListener('pointerup', (event) => letGo(event, false));
    el.addEventListener('pointercancel', (event) => letGo(event, true));

    el.classList.add('is-live');
  }

  return true;
}
