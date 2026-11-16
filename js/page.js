// The script of a document page (the Money Tycoon privacy policy and terms of
// service). A document is for reading, so this does three small things and no
// more: the lamp, the band of lines under the title, and the contents list
// that knows where you are.

import { deriveEdition, mintSerial, parseSerial, secureRandomInt } from './edition.js';
import { inkRamp } from './film.js';
import { startLamp } from './lamp.js';
import { reduceMotion } from './motion.js';
import { bandMarkup } from './stamps.js';
import { startTracer } from './tracer.js';

const root = document.documentElement;

/** Where the home page keeps the serial of the last plate it drew (js/main.js). */
const LAST_KEY = 'cc-edition';
/** The band's height in pixels, and how long its film takes: both as on the home page's sheets. */
const BAND_HEIGHT = 38;
const BAND_FILM = { duration: 1300, pens: true };
/** The pace the home page draws at when its speed bar has not been touched. */
const PACE = 1; // the same as SPEED.normal in js/main.js
/** A section counts as the one being read once its heading is above this share of the window's height. */
const READING_LINE = 0.3;

/** Run one part of the page. If it fails, say so and let the rest of the page work. */
function start(name, begin) {
  try {
    return begin();
  } catch (error) {
    console.error(`${name} could not start. The rest of the page still works.`, error);
    return null;
  }
}

start('The lamp', () => startLamp({ buttons: [...document.querySelectorAll('[data-lamp]')] }));

// ---- The band under the title, in the inks of the reader's own plate ----

/** The edition this document is printed in: the plate the reader last drew on the home page, or a new one. */
function editionForReader() {
  let last = null;
  try {
    last = parseSerial(localStorage.getItem(LAST_KEY));
  } catch (error) {
    // Storage is blocked. The document is still printed, in inks of its own.
    console.info('The last edition could not be read:', error.name);
  }
  return deriveEdition(last ?? mintSerial({ randomInt: secureRandomInt, year: new Date().getFullYear() }));
}

start('The band under the title', () => {
  const band = document.querySelector('[data-band]');
  if (!band) return;
  const edition = editionForReader();

  const css = (rgb) => `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(' ')})`;
  root.style.setProperty('--ink-a', css(edition.ink.a));
  root.style.setProperty('--ink-b', css(edition.ink.b));
  inkRamp(edition.ink.a, edition.ink.b).forEach((ink, index) => root.style.setProperty(`--edition-${index + 1}`, css(ink)));

  const tracer = startTracer({ pace: () => PACE });
  let laid = 0;
  /** Draw the band at the width it has now. */
  function lay() {
    const width = band.clientWidth;
    if (!(width > 0) || width === laid) return;
    const first = laid === 0;
    laid = width;
    band.dataset.drawn = ''; // from a hairline to a band (css/site.css)
    band.innerHTML = bandMarkup(edition.stamps[0], width, BAND_HEIGHT); // the one place this page sets markup: a drawing made by js/stamps.js
    if (first) tracer.add(band, BAND_FILM);
    else tracer.relay();
  }
  lay();

  let waiting = 0;
  window.addEventListener('resize', () => {
    if (waiting) return;
    waiting = requestAnimationFrame(() => {
      waiting = 0;
      lay();
    });
  });
});

// ---- The contents list marks the section being read ----

start('The contents list', () => {
  const links = [...document.querySelectorAll('.legal__contents a[href^="#"]')];
  const sections = links
    .map((link) => ({ link, heading: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
    .filter(({ heading }) => heading !== null);
  if (sections.length === 0) return;

  const list = links[0].closest('ul');
  /** On a narrow screen the list is a rail that slides sideways: bring the section being read to its middle. */
  function bringIntoView(link) {
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const left = link.offsetLeft - list.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    list.scrollTo({ left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  let current = null;
  function mark() {
    const line = window.innerHeight * READING_LINE;
    // Measure them all, then change the page.
    const tops = sections.map(({ heading }) => heading.getBoundingClientRect().top);
    let reading = null;
    tops.forEach((top, index) => {
      if (top <= line) reading = sections[index];
    });
    if (reading === current) return;
    if (current) current.link.removeAttribute('aria-current');
    if (reading) {
      reading.link.setAttribute('aria-current', 'location');
      bringIntoView(reading.link);
    }
    current = reading;
  }

  let waiting = 0;
  const markSoon = () => {
    if (waiting) return;
    waiting = requestAnimationFrame(() => {
      waiting = 0;
      mark();
    });
  };
  window.addEventListener('scroll', markSoon, { passive: true });
  window.addEventListener('resize', markSoon);
  mark();
});
