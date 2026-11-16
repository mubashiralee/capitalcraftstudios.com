// Runs before the page paints. Kept tiny and separate so the page needs no
// inline script.
(function () {
  var root = document.documentElement;

  // 1. The right light is on from the first frame.
  var saved = null;
  try {
    saved = localStorage.getItem('cc-light');
  } catch (error) {
    // Storage can be blocked (private windows, strict settings). Nothing is
    // lost: we fall through to the system's light or dark setting below.
    saved = null;
  }
  if (saved !== 'uv' && saved !== 'daylight') {
    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'uv' : 'daylight';
  }
  root.setAttribute('data-theme', saved);
  root.classList.remove('no-js');
  root.classList.add('js');

  // A document page (a privacy policy, a set of terms) is for reading: a
  // refresh keeps the reader's place there, as browsers do by themselves.
  if (root.getAttribute('data-page') === 'document') return;

  // 2. A refresh starts again at the top, where the plate is drawn. Left alone,
  //    a browser puts a refreshed page back where it was scrolled to. It
  //    decides that before any script here runs, from what the page asked for
  //    last time, so the page asks on every visit. Returning with the Back
  //    button still lands where you left off: keepPlace() in main.js does that.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  //    A section link still in the address (#studio) would send a refresh down
  //    the page as well, so a refresh drops it. Opening such a link afresh
  //    still goes to its section.
  var visit = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
  var refreshed = visit ? visit.type === 'reload' : Boolean(performance.navigation && performance.navigation.type === 1);
  if (refreshed && location.hash) history.replaceState(history.state, '', location.pathname + location.search);
})();
