// The few things on the page that script draws and that you may want to change.
// Everything else (headings, paragraphs, links, the legal line) is plain text in
// index.html.

export const SITE = Object.freeze({
  // Engraved round the seal, in the plate's own ink. Capitals only; keep it
  // short: the ring is small, and longer text means smaller letters.
  inscription: 'CAPITALCRAFT STUDIOS LTD · NO 17529333 · ',

  // Engraved in a ring that only shows under UV light. {serial} and {count}
  // are filled in for each edition.
  hiddenInscription: 'EDITION {serial} · ONE OF {count} · ',

  // The bodies that travel the orbits. `target` is the id of a section in
  // index.html. `orbit` is which of the five orbits it rides, 0 the innermost;
  // bodies that share an orbit are spaced evenly round it (js/bodies.js).
  // `gem` names the jewel a product is marked with (.body--gem-<name> in
  // css/site.css); a body without one is a plain ring.
  //
  // The products ride the innermost orbit, a quarter turn apart, because that
  // is the one orbit a laptop and a phone both show most of: on the second
  // orbit a product was out of sight half the time on a 1440 px window, and
  // nearly all the time on a phone. The outer two orbits are mostly off the
  // screen, so nothing that has to be seen rides them.
  bodies: Object.freeze([
    Object.freeze({ label: 'Money Tycoon', target: '#money-tycoon', orbit: 0, gem: 'mt' }),
    Object.freeze({ label: 'Domino Reactor', target: '#domino-reactor', orbit: 0, gem: 'dr' }),
    Object.freeze({ label: 'Orchestration Hub', target: '#orchestration-hub', orbit: 0, gem: 'hub' }),
    Object.freeze({ label: 'CapitalCraft Books', target: '#capitalcraft-books', orbit: 0, gem: 'bk' }),
    Object.freeze({ label: 'Apps', target: '#apps', orbit: 1 }),
    Object.freeze({ label: 'Games', target: '#games', orbit: 1 }),
    Object.freeze({ label: 'Websites', target: '#websites', orbit: 1 }),
    Object.freeze({ label: 'Start a project', target: '#contact', orbit: 2 }),
  ]),
});
