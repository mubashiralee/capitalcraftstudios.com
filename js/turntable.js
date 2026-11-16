// The Money Tycoon turntable: three phones standing on an engraved disc.
// Drag or flick it to turn it, press a phone at the back to bring it round, or
// use the list beside it. Left alone, it steps on by itself, until a visitor
// starts using one of the phones (js/phones.js).
//
// Each phone carries its whole 3D position in its own transform and is stacked
// by its depth, so the scene does not rely on the browser sorting 3D layers.

import { Spring, TAU, clamp, finePointer, reduceMotion, whileVisible, wrap } from './motion.js';

// The scene, in phone widths.
const RING = 1.05; // how far from the middle of the disc the phones stand
const DISC = 1.5; // the disc's radius
const CAMERA = 3.3; // how far away the viewer is
const CAMERA_HEIGHT = '34%'; // eye level, measured down the stage
const FACE = 0.6; // radians a phone at the side turns away from the viewer
const DRAG = 1.15; // drag this far to turn the disc by one phone
const SHADE = 0.5; // how dark a phone at the very back gets
const FLING = 0.22; // seconds of a flick's speed that carry over after letting go
const SLOP = 6; // pixels a press may wander and still count as a press

/** Where the phones stand on the disc, 0 (the middle) to 1 (the rim). For drawing the disc. */
export const TURNTABLE_REACH = RING / DISC;

/**
 * @param {{ stage: HTMLElement, tabs: HTMLElement, area: HTMLElement, onFront?: (index: number) => void }} parts
 *   `stage` holds the phones and the disc, `tabs` the list of buttons, and
 *   `area` is the region the pointer steers the scene from. `onFront` is told
 *   which phone is at the front, at the start and each time it changes.
 */
export function startTurntable({ stage, tabs, area, onFront }) {
  const phones = [...stage.querySelectorAll('[data-phone]')];
  const floor = stage.querySelector('[data-floor]');
  const buttons = [...tabs.querySelectorAll('[data-show]')];
  if (phones.length < 2 || !floor || buttons.length !== phones.length) {
    throw new Error(`Turntable needs a disc and one button per phone; found ${phones.length} phones, ${buttons.length} buttons.`);
  }
  const glares = phones.map((phone) => phone.querySelector('.mt__glare'));
  const count = phones.length;
  const step = TAU / count;

  // `turn` says which phone is at the front. Whole numbers are resting places:
  // 0 is the first phone, 1 the second, and it keeps counting past the last.
  const turn = new Spring(0, 42);
  const leanX = new Spring(0, 38);
  const leanY = new Spring(0, 38);
  let goal = 0;
  let width = 0;
  let height = 0;
  let clock = 0;
  let drag = null;
  let steer = null; // where the pointer is over `area`, each axis from -1 to 1
  let arrived = false;
  let hovered = false;
  let held = false; // a visitor is using a phone: the disc no longer steps on by itself
  let front = -1;

  const measure = () => {
    width = phones[0].offsetWidth;
    height = phones[0].offsetHeight;
    stage.style.perspective = `${(CAMERA * width).toFixed(0)}px`;
    stage.style.perspectiveOrigin = `50% ${CAMERA_HEIGHT}`;
    floor.style.width = `${(2 * DISC * width).toFixed(0)}px`;
  };

  /** The resting place nearest to where the disc is now that puts phone `index` in front. */
  const placeOf = (index) => {
    const here = Math.round(turn.value);
    let ahead = wrap(index - here, count);
    if (ahead > count / 2) ahead -= count;
    return here + ahead;
  };

  const syncPause = () => {
    const paused = held || hovered || Boolean(drag) || tabs.matches(':focus-within') || stage.matches(':focus-within') || !loop.visible;
    tabs.dataset.paused = String(paused);
  };

  const setGoal = (next) => {
    goal = next;
    const was = front;
    front = wrap(goal, count);
    buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === front)));
    if (front !== was && onFront) onFront(front);
    if (reduceMotion.matches) {
      turn.snap(goal);
      render();
    }
  };

  function render() {
    const radius = RING * width;
    const lean = `translate(-50%, -50%) translateZ(${(-radius).toFixed(1)}px) rotateX(${leanX.value.toFixed(4)}rad) rotateY(${leanY.value.toFixed(4)}rad)`;
    phones.forEach((phone, index) => {
      const angle = (index - turn.value) * step; // 0 at the front
      const sine = Math.sin(angle);
      const cosine = Math.cos(angle);
      const face = FACE * sine;
      phone.style.transform =
        `${lean} translate3d(${(radius * sine).toFixed(1)}px, 0, ${(radius * cosine).toFixed(1)}px) rotateY(${face.toFixed(4)}rad)`;
      phone.style.zIndex = String(10 + Math.round(10 * cosine));
      phone.style.setProperty('--shade', (SHADE * (1 - cosine) * 0.5).toFixed(3));
      // The sheen slides across the glass as the phone turns and the scene leans.
      glares[index].style.transform = `translateX(${((face * 0.9 + leanY.value * 2.6) * 100).toFixed(1)}%)`;
    });
    floor.style.transform =
      `${lean} translateY(${(height / 2).toFixed(1)}px) rotateX(90deg) rotate(${(turn.value * step).toFixed(4)}rad)`;
  }

  const loop = whileVisible(
    stage,
    (dt) => {
      clock += dt;
      if (!drag?.moved && !reduceMotion.matches) turn.step(goal, dt);

      // Lean toward the pointer; with no pointer to follow, sway a little.
      const still = reduceMotion.matches;
      const sway = still ? 0 : 0.03 * Math.sin(clock * 0.55);
      leanY.step(still ? 0 : steer ? steer.x * 0.11 : sway, dt);
      leanX.step(still ? 0 : steer ? -steer.y * 0.05 : 0, dt);
      render();
    },
    {
      margin: '80px',
      onShow: () => {
        if (!arrived) {
          arrived = true;
          if (!reduceMotion.matches) turn.snap(goal - 0.8); // the disc comes to rest as it arrives
        }
        syncPause();
      },
      onHide: () => syncPause(),
    },
  );

  // The list beside the stage.
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => setGoal(placeOf(index)));
  });
  // The gold line on the current button is the timer: when it has run its
  // length, the disc steps on. Pausing the line (see the stylesheet) pauses the timer.
  tabs.addEventListener('animationend', (event) => {
    if (event.animationName === 'mt-dwell' && !reduceMotion.matches) setGoal(goal + 1);
  });
  for (const part of [tabs, stage]) {
    part.addEventListener('focusin', syncPause);
    part.addEventListener('focusout', syncPause);
  }

  // Dragging and flicking the disc.
  stage.addEventListener('pointerdown', (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return; // a second finger does not take over
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startTurn: turn.value,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      speed: 0, // places per second
      moved: false,
      phone: phones.indexOf(event.target.closest('[data-phone]')),
    };
    syncPause();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const travelled = event.clientX - drag.startX;
    if (!drag.moved) {
      if (Math.abs(travelled) < SLOP) return;
      drag.moved = true;
      stage.setPointerCapture(drag.id);
      stage.dataset.dragging = 'true';
    }
    const perPlace = DRAG * width;
    turn.snap(drag.startTurn - travelled / perPlace);
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime) / 1000;
    const speed = -(event.clientX - drag.lastX) / perPlace / elapsed;
    drag.speed = drag.speed * 0.6 + speed * 0.4;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
  });

  const release = (event, cancelled) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { moved, speed, phone } = drag;
    drag = null;
    delete stage.dataset.dragging;
    if (moved) {
      const carried = cancelled ? 0 : clamp(speed * FLING, -1, 1);
      turn.velocity = cancelled ? 0 : speed;
      setGoal(Math.round(turn.value + carried));
    } else if (!cancelled && phone >= 0) {
      setGoal(placeOf(phone)); // a press on a phone at the back brings it round
    }
    syncPause();
  };
  stage.addEventListener('pointerup', (event) => release(event, false));
  stage.addEventListener('pointercancel', (event) => release(event, true));

  // The pointer steers the lean, and resting on the scene holds the timer.
  area.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) return;
    const box = area.getBoundingClientRect();
    steer = {
      x: clamp(((event.clientX - box.left) / box.width) * 2 - 1, -1, 1),
      y: clamp(((event.clientY - box.top) / box.height) * 2 - 1, -1, 1),
    };
  });
  area.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    hovered = true;
    syncPause();
  });
  area.addEventListener('pointerleave', () => {
    hovered = false;
    steer = null;
    syncPause();
  });

  stage.classList.add('is-live');
  new ResizeObserver(() => {
    measure();
    render();
  }).observe(stage);
  measure();
  setGoal(0);
  syncPause();
  render();

  return {
    /** Bring phone `index` to the front. */
    show: (index) => setGoal(placeOf(index)),
    /** Stop stepping on by itself, for good: someone is using a phone. */
    hold: () => {
      held = true;
      syncPause();
    },
  };
}
