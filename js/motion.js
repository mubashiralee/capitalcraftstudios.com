// Shared motion helpers: springs, the visitor's motion and pointer settings,
// and a frame loop that only runs while its element can be seen.

export const TAU = Math.PI * 2;

export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Wrap a number into 0 up to (not including) size. Works for negatives too. */
export const wrap = (value, size) => ((value % size) + size) % size;

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

/** A critically damped spring: follows its target smoothly and never overshoots. */
export class Spring {
  constructor(value = 0, stiffness = 120) {
    this.value = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = 2 * Math.sqrt(stiffness);
  }

  step(target, dt) {
    this.velocity += ((target - this.value) * this.stiffness - this.velocity * this.damping) * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  snap(value) {
    this.value = value;
    this.velocity = 0;
  }

  /** True once the spring has all but arrived, so a loop can stop asking. */
  settled(target, slack = 0.001) {
    return Math.abs(target - this.value) < slack && Math.abs(this.velocity) < slack;
  }
}

/**
 * Call `tick(dt)` once a frame, but only while `el` can be seen: it is on
 * screen, the tab is in front, and the sheet it lies on is not covered by the
 * next one (js/sheets.js says when). `dt` is in seconds and never more than a
 * twentieth, so a pause (a slow frame, a tab switch) cannot make anything jump.
 *
 * @param {Element} el
 * @param {(dt: number) => void} tick
 * @param {{ margin?: string, onShow?: () => void, onHide?: () => void }} [options]
 * @returns {{ readonly visible: boolean }}
 */
export function whileVisible(el, tick, { margin = '0px', onShow, onHide } = {}) {
  let inView = false;
  let covered = false;
  let running = false;
  let loop = 0; // each start gets a number; a frame from an older start stops itself
  let last = 0;

  const start = () => {
    running = true;
    loop += 1;
    const mine = loop;
    last = performance.now();
    const frame = (time) => {
      if (!running || mine !== loop) return;
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (onShow) onShow();
  };

  const stop = () => {
    running = false;
    if (onHide) onHide();
  };

  const sync = () => {
    const should = inView && !covered && !document.hidden;
    if (should && !running) start();
    else if (!should && running) stop();
  };

  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      sync();
    },
    { rootMargin: margin },
  ).observe(el);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  const sheet = el.closest('.sheet');
  if (sheet) {
    covered = sheet.hasAttribute('data-covered');
    sheet.addEventListener('sheetcover', (event) => {
      covered = event.detail.covered;
      sync();
    });
  }

  return {
    get visible() {
      return running;
    },
  };
}
