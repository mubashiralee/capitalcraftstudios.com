// Where each body on the hero's orbits sits (js/site.config.js lists them).
//
// The edition gives every orbit one starting angle and one speed (js/edition.js).
// An orbit may carry more than one body: they share its speed and are spaced
// evenly round it, so they never catch each other up or bunch together.
// Pure numbers, no page: js/main.js turns these into places on the screen.

/**
 * @param {{ orbit: number }[]} bodies  in the order they are listed
 * @param {number} orbits  how many orbits the plate has
 * @returns {{ orbit: number, share: number }[]}  for each body, its orbit and how far round
 *   from that orbit's starting angle it rides, as a share of a whole turn (0 to under 1)
 */
export function seatBodies(bodies, orbits) {
  const riders = Array.from({ length: orbits }, () => []);
  bodies.forEach((body, index) => {
    if (!Number.isInteger(body.orbit) || body.orbit < 0 || body.orbit >= orbits) {
      throw new RangeError(`body ${index} rides orbit ${body.orbit}; the plate has orbits 0 to ${orbits - 1}`);
    }
    riders[body.orbit].push(index);
  });
  const seats = new Array(bodies.length);
  for (const [orbit, on] of riders.entries()) {
    on.forEach((index, place) => {
      seats[index] = { orbit, share: place / on.length };
    });
  }
  return seats;
}
