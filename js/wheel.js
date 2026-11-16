// A wheel that can be turned by hand: taken hold of and dragged round, flung,
// or brushed by a pointer passing over it. Left alone it slows by friction and
// stops. Nothing here touches the page, so the same code runs in the browser
// (js/rosettes.js turns the rosettes beside the services with it) and in Node
// (tests/wheel.test.mjs).
//
// Angles are in radians and times in seconds.

const TAU = Math.PI * 2;

export const WHEEL = Object.freeze({
  coast: 0.9, // a free wheel's speed falls to 1/e of itself in this long
  fastest: 14, // radians a second: a little over two turns
  rest: 0.02, // slower than this, a free wheel is taken to have stopped
  memory: 0.08, // the speed a hand lets go at is its speed over about this long
  catch: 0.05, // a pointer brushing past brings the wheel most of the way to its own speed in this long
});

/** The shortest way round from one angle to another: between minus half a turn and half a turn. */
export function sweep(from, to) {
  const turned = (to - from) % TAU;
  if (turned > Math.PI) return turned - TAU;
  if (turned < -Math.PI) return turned + TAU;
  return turned;
}

const capped = (speed) => Math.max(-WHEEL.fastest, Math.min(WHEEL.fastest, speed));

export function createWheel() {
  let angle = 0;
  let speed = 0; // of the free wheel
  let held = false;
  let hand = 0; // the angle the hand was last at, round the wheel's middle
  let pull = 0; // how fast the hand has been turning the wheel lately

  return {
    get angle() {
      return angle;
    },
    get speed() {
      return speed;
    },
    get held() {
      return held;
    },

    /** A hand takes hold of the wheel at the angle `at` round its middle. A spinning wheel stops. */
    grab(at) {
      held = true;
      hand = at;
      speed = 0;
      pull = 0;
    },

    /** The hand moves to `at`, `seconds` after it last moved: the wheel goes with it. */
    drag(at, seconds) {
      if (!held) return;
      const turned = sweep(hand, at);
      hand = at;
      angle += turned;
      if (seconds > 0) pull += (turned / seconds - pull) * (1 - Math.exp(-seconds / WHEEL.memory));
    },

    /** The hand lets go, `idle` seconds after it last moved. The wheel keeps what speed the hand still had. */
    release(idle = 0) {
      if (!held) return;
      held = false;
      const kept = capped(pull * Math.exp(-idle / WHEEL.memory));
      speed = Math.abs(kept) < WHEEL.rest ? 0 : kept;
      pull = 0;
    },

    /**
     * A pointer passes over the free wheel, going `turned` round its middle in
     * `seconds`. The wheel is pulled towards the pointer's speed, as hard for
     * a pointer that reports often as for one that reports seldom.
     */
    brush(turned, seconds) {
      if (held || !(seconds > 0)) return;
      speed = capped(speed + (turned / seconds - speed) * (1 - Math.exp(-seconds / WHEEL.catch)));
    },

    /** Let `seconds` pass. Returns true while the wheel is still turning by itself. */
    step(seconds) {
      if (speed === 0) return false; // at rest, or held: a held wheel has no speed of its own
      // Friction, worked exactly: the whole run from here is speed x coast, at any frame rate.
      const left = Math.exp(-seconds / WHEEL.coast);
      angle += speed * WHEEL.coast * (1 - left);
      speed *= left;
      if (Math.abs(speed) < WHEEL.rest) speed = 0;
      return speed !== 0;
    },
  };
}
