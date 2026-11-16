// The page as a stack of sheets, and the dock that says which one you are on.
//
// The arithmetic is in js/stack.js. This file measures the real sheets, lets
// the browser do the holding (each sheet is position: sticky), and on every
// scroll dresses the page to match: the sheet underneath slips back and
// darkens, and the light in the dock moves to the chapter in front. (The
// ornaments on a sheet are drawn when it arrives: js/tracer.js.)
//
// Sticky sheets stay where they are in the document, so the browser's own
// "go to this element" lands in the wrong place once a sheet is covered.
// Links within the page, and focus moved by the keyboard, are placed here.

import { ARROW, DIAL, ringArcs } from './dial.js';
import { CEE } from './logo.js';
import { clamp, reduceMotion } from './motion.js';
import { layStack, nextStop, recede, showOf, stackAt, startOf, travelled } from './stack.js';

/** Make one part of a drawing (an SVG element), with its attributes set. */
function draw(name, attributes = {}) {
  const part = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) part.setAttribute(key, String(value));
  return part;
}

/**
 * @param {object} page
 * @param {HTMLElement} page.main    the element whose children are the sheets
 * @param {HTMLElement} page.top     the header, which holds the dock
 * @param {HTMLElement} [page.foot]  what lies below the sheets, if anything does
 * @returns {{ refresh: () => void }} call `refresh` after changing what a sheet holds
 */
export function startSheets({ main, top, foot = null }) {
  const root = document.documentElement;
  const sheets = [...main.querySelectorAll(':scope > .sheet')].map((el, index, all) => {
    let shade = null;
    if (index < all.length - 1) {
      shade = document.createElement('div');
      shade.className = 'sheet__shade';
      shade.setAttribute('aria-hidden', 'true');
      el.append(shade);
    }
    return { el, shade, cover: -1, covered: false, chapter: el.dataset.chapter ?? '' };
  });
  if (sheets.length < 2) throw new Error(`A stack needs two sheets or more; this page has ${sheets.length}.`);

  // ---- The dock ----------------------------------------------------------

  const rail = top.querySelector('[data-dock-rail]');
  const list = rail.querySelector('.dock__list');
  const links = [...list.querySelectorAll('[data-chapter-link]')];
  const lit = list.cloneNode(false);
  lit.classList.add('dock__list--lit');
  lit.setAttribute('aria-hidden', 'true');
  for (const link of links) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = link.textContent;
    item.append(name);
    lit.append(item);
  }
  rail.append(lit);

  const home = top.querySelector('[data-dock-home]');
  if (home) {
    const { left, right, top: above, bottom } = CEE.box;
    const mark = draw('svg', { class: 'dock__mark', viewBox: `${left} ${above} ${right - left} ${bottom - above}`, 'aria-hidden': 'true', focusable: 'false' });
    mark.append(draw('path', { d: CEE.d }));
    home.replaceChildren(mark);
  }

  // ---- The next arrow ---------------------------------------------------
  // A button at the foot of the window that goes on to the next sheet, for
  // anyone who would rather press than scroll. The ring round it is the page,
  // one arc for each sheet, inked as far as the reader has come. At the end of
  // the page the arrow turns to point back up.
  //
  // The whole drawing is one picture that fills the button, with its middle at
  // (0, 0) (see js/dial.js): the arrow is on the centre of the button because
  // of where it is drawn, not because of how the button lays out what it holds.

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'onward';
  const reach = DIAL.size / 2;
  const dial = draw('svg', { class: 'onward__dial', viewBox: `${-reach} ${-reach} ${DIAL.size} ${DIAL.size}`, 'aria-hidden': 'true', focusable: 'false' });
  const arcs = ringArcs(sheets.length, DIAL.ring, DIAL.gap);
  // Each arc is drawn twice: faint, for the sheet being there at all; and in ink, for as much of it as has been read.
  const inks = arcs.map((d) => draw('path', { class: 'onward__ink', d, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }));
  const inked = arcs.map(() => '1');
  const turn = draw('g', { class: 'onward__turn' });
  const arrow = draw('path', { class: 'onward__arrow', d: ARROW.d });
  turn.append(arrow);
  dial.append(...arcs.map((d) => draw('path', { class: 'onward__arc', d })), ...inks, turn);
  next.append(dial);
  main.after(next);

  /** The furthest the page can scroll. */
  const pageEnd = () => Math.max(0, root.scrollHeight - window.innerHeight);
  let end = 0; // measured with the stack, in relay()

  // The arrow wears the colours of whatever lies under it: a sheet, or the foot
  // of the page. Each of those says what they are, in three properties of its
  // own (css/site.css, ".sheet"): the glass, the arrow, and the ink of the ring.
  const WORN = ['--dial-glass', '--dial-ink', '--dial-accent'];
  let arrowAt = 0; // how far down the window the arrow's middle is
  let footAt = 0; // how far down the document the sheets end and the foot of the page begins
  let under = -1; // the sheet under the arrow; one past the last sheet is the foot of the page

  function wear() {
    if (under < 0) return; // not measured yet
    const ground = under < sheets.length ? sheets[under].el : foot;
    const theirs = getComputedStyle(ground);
    for (const name of WORN) {
      const value = theirs.getPropertyValue(name).trim();
      // A ground that does not say leaves the arrow in the page's own colours.
      if (value) next.style.setProperty(name, value);
      else next.style.removeProperty(name);
    }
  }

  /** The arrow slips out the way it points and comes back in behind itself: onward. */
  function slip() {
    arrow.animate(
      [
        { opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
        { transform: `translateY(${DIAL.slide}px)`, opacity: 0, offset: 0.34 },
        { transform: `translateY(${-DIAL.slide}px)`, opacity: 0, offset: 0.35, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        { opacity: 1 },
      ],
      { duration: 560 },
    );
  }

  let chapter = null;

  /** Move the dock's light to the chapter in front. */
  function light({ glide = true } = {}) {
    const link = links.find((candidate) => candidate.dataset.chapterLink === chapter);
    for (const candidate of links) {
      if (candidate === link) candidate.setAttribute('aria-current', 'location');
      else candidate.removeAttribute('aria-current');
    }
    if (!link) {
      lit.style.clipPath = 'inset(0 100% 0 0 round 999px)';
      return;
    }
    const from = link.offsetLeft;
    const after = Math.max(0, lit.offsetWidth - from - link.offsetWidth);
    lit.style.clipPath = `inset(0 ${after}px 0 ${from}px round 999px)`;
    // On a narrow screen the names run off the rail: bring the lit one to the middle.
    if (rail.scrollWidth > rail.clientWidth + 1) {
      rail.scrollTo({
        left: from - (rail.clientWidth - link.offsetWidth) / 2,
        behavior: glide && !reduceMotion.matches ? 'smooth' : 'instant',
      });
    }
  }

  // ---- The stack ---------------------------------------------------------

  let lay = null;

  /** How far down its sheet an element is, in the sheet's own (unshrunk) pixels. */
  function offsetWithin(el, sheet) {
    const scale = recede(Math.max(0, sheet.cover)).scale;
    return (el.getBoundingClientRect().top - sheet.el.getBoundingClientRect().top) / scale;
  }

  function relay() {
    const viewport = window.innerHeight;
    const lip = parseFloat(getComputedStyle(sheets[1].el).borderTopLeftRadius) || 0;
    const heights = sheets.map((sheet) => sheet.el.offsetHeight);
    lay = layStack({ heights, viewport, lip, start: main.offsetTop });
    end = pageEnd();
    const box = next.getBoundingClientRect();
    arrowAt = box.top + box.height / 2;
    footAt = main.offsetTop + main.offsetHeight;
    under = -1; // the colours may have changed too: dress the arrow again
    sheets.forEach((sheet, index) => {
      sheet.el.style.top = `${lay.dock[index]}px`;
      // A sheet slips back about the middle of the window, not its own middle.
      sheet.el.style.transformOrigin = `50% ${(heights[index] - viewport / 2).toFixed(1)}px`;
    });
    update();
    light({ glide: false });
  }

  function update() {
    const scroll = window.scrollY;
    const still = reduceMotion.matches;
    const { tops, covers, front } = stackAt(lay, scroll);

    sheets.forEach((sheet, index) => {
      const cover = still ? 0 : covers[index];
      if (Math.abs(cover - sheet.cover) > 0.0004) {
        sheet.cover = cover;
        const { scale, shade } = recede(cover);
        sheet.el.style.transform = cover > 0 ? `scale(${scale.toFixed(4)})` : '';
        if (sheet.shade) sheet.shade.style.opacity = shade.toFixed(3);
      }

      // Out of sight: the next sheet has docked over it. Whatever moves on it can rest.
      const covered = index + 1 < sheets.length && tops[index + 1] <= 0.5 - lay.lip;
      if (covered !== sheet.covered) {
        sheet.covered = covered;
        sheet.el.toggleAttribute('data-covered', covered);
        sheet.el.dispatchEvent(new CustomEvent('sheetcover', { detail: { covered } }));
      }
    });

    const now = sheets[front].chapter;
    if (now !== chapter) {
      chapter = now;
      light();
    }
    const moved = String(scroll > 24);
    if (top.dataset.scrolled !== moved) top.dataset.scrolled = moved;

    // The arrow points up once there is nowhere further down to go.
    const back = String(nextStop(lay, scroll, end) < scroll);
    if (next.dataset.back !== back) {
      next.dataset.back = back;
      next.setAttribute('aria-label', back === 'true' ? 'Back to the top' : 'Next section');
    }
    // The ring round it: each sheet's arc, inked as far as that sheet has been read.
    travelled(lay, scroll, end).forEach((share, index) => {
      const left = (1 - share).toFixed(3);
      if (left === inked[index]) return;
      inked[index] = left;
      inks[index].setAttribute('stroke-dashoffset', left);
    });
    // Its colours: those of the last sheet to have come up as far as the arrow, or of the foot of the page.
    let ground = 0;
    tops.forEach((sheetTop, index) => {
      if (sheetTop <= arrowAt) ground = index; // a later sheet lies over an earlier one
    });
    if (foot && footAt - scroll <= arrowAt) ground = sheets.length;
    if (ground !== under) {
      under = ground;
      wear();
    }
  }

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };
  let relaying = 0;
  const refresh = () => {
    if (relaying) return;
    relaying = requestAnimationFrame(() => {
      relaying = 0;
      relay();
    });
  };

  // ---- Going to a place on the page ---------------------------------------

  /** How far down the window a place should sit: clear of the dock, in the upper part of the window. */
  const lead = () => clamp(lay.viewport * 0.26, 84, 220);

  /** The scroll position that shows `target`. */
  function placeOf(target) {
    const el = target.closest('.sheet');
    const index = sheets.findIndex((sheet) => sheet.el === el);
    if (index < 0) {
      // Not on a sheet. Above the sheets is the top of the page; below them, the page scrolls as any page does.
      if (target.contains(main) || (target.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING)) return 0;
      return target.getBoundingClientRect().top + window.scrollY - lead();
    }
    if (target === el) return startOf(lay, index);
    return showOf(lay, index, offsetWithin(target, sheets[index]), lead());
  }

  let going = false;

  function go(target, { glide }) {
    going = true;
    window.scrollTo({ top: placeOf(target), behavior: glide && !reduceMotion.matches ? 'smooth' : 'instant' });
    // Take the keyboard there too, so Tab carries on from the new place.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    going = false;
  }

  const targetOf = (hash) => {
    if (hash.length < 2) return null;
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch (error) {
      // The address holds a fragment that is not valid text. There is nowhere to go; say so and stay put.
      console.info('This address names a place on the page that cannot be read:', error.name);
      return null;
    }
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    const target = link ? targetOf(link.hash) : null;
    if (!target) return;
    event.preventDefault();
    if (location.hash !== link.hash) history.pushState(history.state, '', link.hash);
    // A pointer glides there. The keyboard (a click with no press behind it) goes at once.
    go(target, { glide: event.detail > 0 });
  });

  next.addEventListener('click', (event) => {
    // A pointer glides there. The keyboard goes at once, and keeps its place on the arrow to press again.
    const glide = event.detail > 0 && !reduceMotion.matches;
    // The end of the page is measured afresh for the press, in case the foot of the page has only just changed height.
    window.scrollTo({ top: nextStop(lay, window.scrollY, pageEnd()), behavior: glide ? 'smooth' : 'instant' });
    if (glide) slip();
  });

  window.addEventListener('popstate', () => {
    const target = targetOf(location.hash);
    if (target) go(target, { glide: false });
    else window.scrollTo({ top: Number.isFinite(history.state?.scrollY) ? history.state.scrollY : 0, behavior: 'instant' });
  });

  // Focus moved by the keyboard into a sheet that is covered, or not yet in the window: bring it into view.
  document.addEventListener('focusin', (event) => {
    const el = event.target;
    if (going || !(el instanceof Element) || !el.matches(':focus-visible')) return;
    const index = sheets.findIndex((sheet) => sheet.el.contains(el));
    if (index < 0) return;
    const { tops, covers } = stackAt(lay, window.scrollY);
    const box = el.getBoundingClientRect();
    const docked = index === 0 || tops[index] <= 0;
    const inWindow = box.top >= 72 && box.bottom <= lay.viewport - 8;
    if (docked && covers[index] === 0 && inWindow) return;
    window.scrollTo({ top: showOf(lay, index, offsetWithin(el, sheets[index]), lead()), behavior: 'instant' });
  });

  // ---- Start --------------------------------------------------------------

  root.classList.add('has-stack');
  relay();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', refresh);
  const watch = new ResizeObserver(refresh);
  sheets.forEach((sheet) => watch.observe(sheet.el));
  watch.observe(document.body); // whatever lies below the sheets changes how far the page scrolls
  // The lamp and a new edition both change the page's colours: dress the arrow again.
  new MutationObserver(wear).observe(root, { attributeFilter: ['data-theme', 'style'] });
  reduceMotion.addEventListener('change', refresh);
  document.fonts.ready.then(refresh); // the dock's names change width when the typeface arrives

  const opened = targetOf(location.hash);
  if (opened) go(opened, { glide: false });

  return { refresh };
}
