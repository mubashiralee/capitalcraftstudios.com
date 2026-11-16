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
  // index.html. There are five orbits, so list at most five; the first rides
  // the innermost orbit.
  bodies: Object.freeze([
    Object.freeze({ label: 'Money Tycoon', target: '#money-tycoon', tone: 'gem' }),
    Object.freeze({ label: 'Apps', target: '#apps' }),
    Object.freeze({ label: 'Games', target: '#games' }),
    Object.freeze({ label: 'Websites', target: '#websites' }),
    Object.freeze({ label: 'Start a project', target: '#contact' }),
  ]),
});
