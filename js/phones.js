// Puts the Money Tycoon app (js/phone-app.js) on the three phones of the
// turntable, and passes the visitor's presses to it.
//
// Each phone keeps its photograph (the frame, the status bar, and the picture a
// visitor without script sees). The app is laid over the photograph's screen.
// Only the phone at the front can be used; a press on one at the back still
// brings it round (js/turntable.js). The markup comes only from
// js/phone-app.js, which escapes every piece of text it is given.

import { clockText, openApp, press, tick, view } from './phone-app.js';

const SLOP = 6; // pixels a press may wander and still count as a press

/**
 * @param {{ stage: HTMLElement, onUse: () => void }} parts
 *   `stage` holds the phones; `onUse` is called each time the visitor uses one.
 * @returns {{ front: (index: number) => void }} tell it which phone is at the front
 */
export function startPhones({ stage, onUse }) {
  const figures = [...stage.querySelectorAll('[data-phone]')];
  let app = openApp();
  if (figures.length !== app.phones.length) {
    throw new Error(`The app is written for ${app.phones.length} phones; the page has ${figures.length}.`);
  }

  const screens = figures.map((figure) => {
    const screen = document.createElement('div');
    screen.className = 'mt__app';
    figure.querySelector('img').after(screen); // over the photograph, under the shade and the sheen
    return screen;
  });
  const shown = screens.map(() => ''); // the markup each phone is showing
  const places = screens.map(() => ({ key: '', depth: 0 }));

  /** Where a phone is in the app: screens that share a place keep their scroll. */
  const placeOf = (nav) => {
    const stack = nav.stacks[nav.tab];
    return { key: [nav.tab, stack.join('>'), nav.desk, nav.board, nav.hall].join('|'), tab: nav.tab, depth: stack.length };
  };

  function draw(index) {
    const html = view(app, index);
    if (html === shown[index]) return;
    const screen = screens[index];
    const place = placeOf(app.phones[index]);
    const before = places[index];
    const stayed = place.key === before.key;
    const scrolled = stayed ? (screen.querySelector('[data-scroll]')?.scrollTop ?? 0) : 0;
    // If the keyboard was on a button, it is put back on the same button afterwards.
    const held = screen.contains(document.activeElement) ? document.activeElement.closest('[data-do]') : null;

    screen.innerHTML = html;
    shown[index] = html;
    places[index] = place;
    screen.querySelector('[data-scroll]').scrollTop = scrolled;

    if (!stayed && before.key) {
      const how = place.tab !== before.tab ? 'is-swapped-in' : place.depth > before.depth ? 'is-pushed-in' : place.depth < before.depth ? 'is-popped-in' : 'is-swapped-in';
      screen.firstElementChild.classList.add(how);
    }
    if (held) {
      const again = [...screen.querySelectorAll('button[data-do]:not(:disabled)')].filter((button) => !button.closest('[inert]'));
      const same = again.find((button) => button.dataset.do === held.dataset.do && button.dataset.arg === held.dataset.arg);
      (same ?? again[0])?.focus({ preventScroll: true });
    }
  }
  const drawAll = () => screens.forEach((_, index) => draw(index));

  // A press, a swipe or a scroll: which it was is settled by how far the pointer went.
  let pointer = null;
  let wandered = false;
  stage.addEventListener('pointerdown', (event) => {
    wandered = false;
    const scroller = event.pointerType === 'mouse' && event.button === 0 ? event.target.closest('.mt__app:not([inert]) [data-scroll]') : null;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, scroller, from: scroller?.scrollTop ?? 0, scrolling: false };
  });
  stage.addEventListener('pointerup', (event) => {
    if (pointer?.id !== event.pointerId) return;
    wandered = pointer.scrolling || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= SLOP;
    pointer = null;
  });
  stage.addEventListener('pointercancel', () => {
    pointer = null;
  });
  // With a mouse there is no finger to scroll with, so dragging the screen up and down scrolls it.
  // Whichever way the pointer sets off first, across or up and down, keeps the drag: this listener
  // hears a move before the turntable does, and keeps an up-and-down drag to itself.
  screens.forEach((screen) => {
    screen.addEventListener('pointermove', (event) => {
      if (!pointer?.scroller || pointer.id !== event.pointerId) return;
      const across = event.clientX - pointer.x;
      const down = event.clientY - pointer.y;
      if (!pointer.scrolling) {
        if (Math.abs(down) < SLOP || Math.abs(down) < Math.abs(across)) return;
        pointer.scrolling = true;
      }
      pointer.scroller.scrollTop = pointer.from - down;
      event.stopPropagation();
    });
  });

  stage.addEventListener('click', (event) => {
    const swiped = wandered;
    wandered = false;
    const button = event.target.closest('[data-do]');
    if (!button || swiped) return;
    const index = screens.indexOf(button.closest('.mt__app'));
    if (index < 0 || screens[index].inert) return;
    app = press(app, index, button.dataset.do, button.dataset.arg);
    drawAll(); // the wallet is shared, so a press on one phone can change the others
    onUse();
  });

  // The game's clock. Only its three pieces of text are touched each second.
  let inView = false;
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
  }).observe(stage);
  setInterval(() => {
    if (!inView || document.hidden || app.clock.paused) return;
    app = tick(app);
    const live = clockText(app.clock);
    screens.forEach((screen, index) => {
      const marks = screen.querySelectorAll('[data-live]');
      if (!marks.length) return;
      marks.forEach((mark) => {
        mark.textContent = live[mark.dataset.live];
      });
      shown[index] = view(app, index); // what the phone now shows, so the next press finds nothing to redraw here
    });
  }, 1000);

  drawAll();
  screens.forEach((screen, index) => {
    screen.inert = index !== 0;
  });

  return {
    front(index) {
      screens.forEach((screen, at) => {
        screen.inert = at !== index;
      });
    },
  };
}
