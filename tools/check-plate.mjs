// Checks the shader against the plan: does js/plate.js really draw each of the
// ten lines where, and when, js/film.js says?
//
// The unit tests prove the plan (ten unbroken lines). They cannot see the
// shader, which is a second copy of the same arithmetic written in GLSL. This
// check can. In a real browser it takes points walked along every line, draws
// the plate flat with the pen just short of the point, then just past it, and
// reads the pixel: no ink before, ink after. Ink is measured against the same
// pixel at the film's first moment, because the paper beside the seal lies in
// the shade of its stone from the start. A point is used only where no
// other line passes within a few pixels, so the answer is never muddied. Every
// distinct part of every line (each ring of a double rule, the ramp that joins
// them, the pattern, the edge ring, each orbit and each way down between
// orbits) gets points of its own, with the bands both still and turned.
//
// It also checks the seal's stone, which is dropped onto the plate when the
// last line is done (js/drop.js works out where it is at each moment). Before
// it is let go its seat is bare paper. While it falls and wobbles, the shader
// draws it where the drop says it is: points inside its outline are stone,
// points outside are not. Once it lies still, the logo is on it the right way
// up: points inside the letters are pale, points between them dark stone. All
// of that is checked with the plate seen face on and laid back.
//
// Needs the preview server running, and Google Chrome:
//   python3 tools/dev-server.py
//   node tools/check-plate.mjs [points per part] [site address]
// Set CHROME to the browser's path if it is not in the usual place on a Mac.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { deriveEdition, mintSerial } from '../js/edition.js';
import { planFilm } from '../js/film.js';

const want = Number(process.argv[2] ?? 12);
const site = process.argv[3] ?? 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!Number.isInteger(want) || want < 1) throw new RangeError(`points per part must be a whole number, got ${process.argv[2]}`);

// Editions that between them draw every kind of band, in both bands.
function editionsToCheck() {
  let state = 7;
  const randomInt = (sides) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * sides);
  };
  const kindsOf = (serial) => planFilm(deriveEdition(serial)).bands.map((band, index) => `${index}:${band.kind}`);
  const serials = ['CC26-KQX-418207'];
  const seen = new Set(kindsOf(serials[0]));
  for (let i = 0; i < 400 && seen.size < 6; i += 1) {
    const serial = mintSerial({ randomInt, year: 2026 });
    const kinds = kindsOf(serial);
    if (kinds.some((kind) => !seen.has(kind))) {
      serials.push(serial);
      kinds.forEach((kind) => seen.add(kind));
    }
  }
  if (seen.size < 6) throw new Error('could not find editions covering every kind of band');
  return serials;
}

// Runs in the page. Returns one row per part checked.
const inPage = async (serials, want) => {
  const { createPlate } = await import('/js/plate.js');
  const { deriveEdition } = await import('/js/edition.js');
  const { planFilm, walk, LINE, LINE_COUNT, TIE, DESCENT } = await import('/js/film.js');
  const { PLATE } = await import('/js/edition.js');
  const { STONE, castDrop, silhouette } = await import('/js/drop.js');
  const { markCanvas } = await import('/js/mark.js');
  const { TILT } = await import('/js/plate.js');
  const TAU = Math.PI * 2;
  const SIZE = 600;
  const toXY = (point) => {
    const angle = (point.at - 0.5) * TAU;
    return [point.radius * Math.cos(angle), point.radius * Math.sin(angle)];
  };
  const canvas = document.createElement('canvas');
  const plate = createPlate(canvas);
  plate.resize(SIZE, SIZE, 1);
  const gl = canvas.getContext('webgl2');
  gl.enable(gl.SCISSOR_TEST);
  const block = new Uint8Array(4 * 9);
  // Which slow rotation each line turns with (see uTurn in the shader).
  const frames = { [LINE.innerA]: 0, [LINE.innerB]: 0, [LINE.outerA]: 1, [LINE.outerB]: 1, [LINE.braidA]: 2, [LINE.braidB]: 3 };
  const names = Object.keys(LINE);
  const report = [];

  // The mark the page gives the plate, and the points of it that lie well inside a letter's stroke.
  const MARK = 1024;
  const mark = markCanvas(MARK);
  plate.setWords('mark', mark);
  const markPixels = mark.getContext('2d').getImageData(0, 0, MARK, MARK).data;
  const deepInMark = (x, y) => {
    // x, y across the seal's face: 0,0 its middle, 1 its edge, y upwards
    const px = Math.floor((x * 0.5 + 0.5) * MARK);
    const py = Math.floor((0.5 - y * 0.5) * MARK);
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        if (markPixels[4 * ((py + dy) * MARK + px + dx)] < 250) return false;
      }
    }
    return true;
  };
  const clearOfMark = (x, y) => {
    const px = Math.floor((x * 0.5 + 0.5) * MARK);
    const py = Math.floor((0.5 - y * 0.5) * MARK);
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        if (markPixels[4 * ((py + dy) * MARK + px + dx)] > 5) return false;
      }
    }
    return true;
  };
  // Points of the stone's face spread evenly over it, sorted into those in a letter and those on bare stone.
  const inLetters = [];
  const onStone = [];
  for (let i = 0; i < 4000; i += 1) {
    const reach = 0.86 * Math.sqrt((i + 0.5) / 4000);
    const angle = i * 2.399963229728653; // the golden angle: no two points line up
    const at = [reach * Math.cos(angle), reach * Math.sin(angle)];
    if (deepInMark(at[0], at[1])) inLetters.push(at);
    else if (clearOfMark(at[0], at[1])) onStone.push(at);
  }
  const thinned = (points, most) => points.filter((_, index) => index % Math.ceil(points.length / most) === 0);

  for (const serial of serials) {
    const edition = deriveEdition(serial);
    const plan = planFilm(edition);
    plate.setEdition(edition);

    // Every line, walked in fine steps and filed in a grid, so that "does
    // anything else pass within a few pixels of this point?" is a plain
    // question of geometry. (Bands turn rigidly, so this holds turned or still.)
    // Distances are measured to the short straight pieces between steps, so a
    // line cannot slip between two steps unnoticed, however far we zoom in.
    const CELL = 0.01; // plate units
    const STEP = 0.0002; // turns
    const grid = new Map();
    const paths = [];
    for (let line = 0; line < LINE_COUNT; line += 1) {
      const steps = Math.ceil(plan.lines[line].turns / STEP);
      const xs = new Float64Array(steps + 1);
      const ys = new Float64Array(steps + 1);
      for (let i = 0; i <= steps; i += 1) {
        const [x, y] = toXY(walk(plan, edition, line, Math.min(plan.lines[line].turns, i * STEP)));
        xs[i] = x;
        ys[i] = y;
        const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(line, i);
      }
      paths.push({ xs, ys, steps });
    }
    const toPiece = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - ax - t * dx, py - ay - t * dy);
    };
    /** Is any other line, or any other pass of this one, within `reach` plate units of the point? */
    const crowdedAt = (x0, y0, line, tau, reach) => {
      const span = Math.ceil((reach + 0.006) / CELL);
      const cx = Math.floor(x0 / CELL);
      const cy = Math.floor(y0 / CELL);
      for (let ix = cx - span; ix <= cx + span; ix += 1) {
        for (let iy = cy - span; iy <= cy + span; iy += 1) {
          const cell = grid.get(`${ix},${iy}`);
          if (!cell) continue;
          for (let c = 0; c < cell.length; c += 2) {
            const other = cell[c];
            const i = cell[c + 1];
            if (other === line && Math.abs(i * STEP - tau) < 0.02) continue; // the point's own stretch of line
            const { xs, ys, steps } = paths[other];
            const j = Math.min(steps, i + 1);
            if (toPiece(x0, y0, xs[i], ys[i], xs[j], ys[j]) < reach) return true;
          }
        }
      }
      return false;
    };

    // The parts to check: [label, line, from, to, zoom (px per plate unit)].
    const parts = [];
    const whole = (line, zoom) => parts.push([names[line], line, 0.06, plan.lines[line].turns - 0.06, zoom]);
    whole(LINE.rim, 900);
    whole(LINE.editionRing, 900);
    whole(LINE.sealRing, 900);
    whole(LINE.braidA, 2400);
    whole(LINE.braidB, 2400);
    for (let lap = 0; lap < 5; lap += 1) {
      const from = lap * (1 + DESCENT);
      parts.push([`orbit ${5 - lap}`, LINE.orbits, from + 0.05, from + 0.95, 500]);
      if (lap < 4) parts.push([`way down ${lap + 1}`, LINE.orbits, from + 1 + 0.15 * DESCENT, from + 1 + 0.85 * DESCENT, 500]);
    }
    plan.bands.forEach((band, index) => {
      const [a, b] = band.lines;
      const which = index === 0 ? 'inner' : 'outer';
      parts.push([`${which}A ring 1`, a.line, 0.06, 0.94, 12000]);
      parts.push([`${which}A ramp`, a.line, 1 + 0.25 * TIE, 1 + 0.75 * TIE, 12000]);
      parts.push([`${which}A ring 2`, a.line, 1 + TIE + 0.06, 2 + TIE - 0.06, 12000]);
      parts.push([`${which}A pattern`, a.line, 2 + TIE + 0.06, 2 + TIE + band.turns - 0.06, 2400]);
      parts.push([`${which}B pattern`, b.line, 0.06, band.turns - 0.06, 2400]);
      parts.push([`${which}B edge ring`, b.line, band.turns + 0.06, band.turns + 0.94, 12000]);
    });

    for (const turn of [[0, 0, 0, 0], [0.7, -1.3, 2.1, -0.45]]) {
      for (const [label, line, from, to, zoom] of parts) {
        const L = plan.lines[line];
        const span = L.turns + 0.02; // the shader's PAD
        // The moment of the film at which this line's pen has covered `pen` turns (the shader's easing, undone).
        const momentOf = (pen) => {
          let low = 0;
          let high = 1;
          for (let i = 0; i < 60; i += 1) {
            const x = (low + high) / 2;
            const eased = x + 0.8 * (x * x * (3 - 2 * x) - x);
            if (eased * span < pen) low = x;
            else high = x;
          }
          return L.start + ((low + high) / 2) * L.duration;
        };
        const alpha = (reveal, hair) => {
          plate.render({
            time: 0, reveal, rate: 0, uv: 0, hair,
            light: { x: -9000, y: -9000, presence: 0 },
            loupe: { x: 0, y: 3, strength: 0 },
            turn,
          });
          gl.readPixels(SIZE / 2 - 1, SIZE / 2 - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, block);
          let most = 0;
          for (let i = 3; i < 36; i += 4) most = Math.max(most, block[i]);
          return most / 255;
        };
        gl.scissor(SIZE / 2 - 3, SIZE / 2 - 3, 7, 7);

        // The pen must be well short of the point "before" and well past it
        // "after": 0.03 of a turn, or less on a part too short for that.
        const margin = Math.min(0.03, (to - from) * 0.4);
        let tested = 0;
        let late = 0;
        let early = 0;
        const bad = [];
        for (let s = 0; s < want * 40 && tested < want; s += 1) {
          const tau = from + (to - from) * ((s * 0.6180339887 + 0.37) % 1);
          const point = walk(plan, edition, line, tau);
          const [x0, y0] = toXY(point);
          if (crowdedAt(x0, y0, line, tau, 6 / zoom)) continue;
          tested += 1;
          // Put the point at the middle of the canvas, turned with its band.
          const frame = frames[line];
          const angle = (point.at - 0.5) * TAU - (frame === undefined ? 0 : turn[frame]);
          const x = point.radius * Math.cos(angle);
          const y = point.radius * Math.sin(angle);
          plate.setView({ anchorX: SIZE / 2 - x * zoom, anchorY: SIZE / 2 + y * zoom, radius: zoom, tilt: 0, yaw: 0 });
          // The paper at the film's first moment: bare, or in the shade of the seal's stone.
          const bare = alpha(0, 0.6);
          if (bare > 0.5) {
            early += 1;
            bad.push(`the paper is not bare at the film's first moment (${bare.toFixed(2)}) at ${tau.toFixed(4)} turns (radius ${point.radius.toFixed(3)})`);
            continue;
          }
          const ink = (value) => Math.max(0, (value - bare) / (1 - bare));
          const before = ink(alpha(momentOf(tau - margin), 0.6));
          const after = ink(alpha(momentOf(tau + margin), 1.5));
          if (after < 0.4) late += 1;
          if (before > 0.15) early += 1;
          if (after < 0.4 || before > 0.15) {
            bad.push(
              `${after < 0.4 ? 'not drawn' : 'drawn too soon'} at ${tau.toFixed(4)} turns ` +
                `(radius ${point.radius.toFixed(3)}, at ${point.at.toFixed(3)}): ink before ${before.toFixed(2)}, after ${after.toFixed(2)}`,
            );
          }
        }
        report.push({ serial, turned: turn[0] !== 0, label, kinds: plan.bands.map((b) => b.kind).join(''), tested, late, early, bad: bad.slice(0, 3) });
      }
    }

    // ---- The seal's stone: dropped when the last line is done ----
    const drop = castDrop({ take: edition.drop.take, turn: edition.drop.turn, way: edition.spin });
    const still = { time: 0, rate: 0, uv: 0, hair: 1, light: { x: -9000, y: -9000, presence: 0 }, loupe: { x: 0, y: 3, strength: 0 }, turn: [0, 0, 0, 0] };
    /** The 3 by 3 pixels round a point of the canvas (CSS pixels, y down): how light they are and how solid, 0 to 1. */
    const look = (x, y, frame) => {
      const px = Math.round(x);
      const py = SIZE - 1 - Math.round(y);
      gl.scissor(px - 3, py - 3, 7, 7);
      plate.render({ ...still, ...frame });
      gl.readPixels(px - 1, py - 1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, block);
      let light = 0;
      let solid = 0;
      for (let i = 0; i < 36; i += 4) {
        light += 0.2126 * block[i] + 0.7152 * block[i + 1] + 0.0722 * block[i + 2];
        solid = Math.max(solid, block[i + 3] / 255); // the most solid of them: seen edge on, the stone is thinner than three pixels
      }
      return { light: light / 9 / 255, solid };
    };
    /** A point of the stone, given across its face (in plate units) and up from its foot, as the plate sees it. */
    const ofStone = (pose, u, v, up) => [
      pose.x + pose.axes[0] * u + pose.axes[3] * v + pose.axes[6] * up,
      pose.y + pose.axes[1] * u + pose.axes[4] * v + pose.axes[7] * up,
      pose.z + pose.axes[2] * u + pose.axes[5] * v + pose.axes[8] * up,
    ];
    const kinds = plan.bands.map((b) => b.kind).join('');

    for (const [label, tilt] of [['face on', 0], ['laid back', TILT.wide]]) {
      // Lying still: the logo is on it, the right way up.
      {
        const ZOOM = 4000; // px per plate unit: the seal is 900 px in radius
        const lying = drop.at(drop.rests + 1);
        let tested = 0;
        let late = 0;
        let early = 0;
        const bad = [];
        const seen = [];
        const check = (points, name, wrongIf, count) => {
          for (const at of points) {
            plate.setView({ anchorX: 0, anchorY: 0, radius: ZOOM, tilt, yaw: 0 });
            const on = plate.project(...ofStone(lying, at[0] * STONE.radius, at[1] * STONE.radius, STONE.thick));
            plate.setView({ anchorX: SIZE / 2 - on.x, anchorY: SIZE / 2 - on.y, radius: ZOOM, tilt, yaw: 0 });
            const { light } = look(SIZE / 2, SIZE / 2, { reveal: 1, stone: lying });
            tested += 1;
            seen.push([name, light]);
            if (wrongIf(light)) {
              count();
              bad.push(`${name} at ${at[0].toFixed(3)}, ${at[1].toFixed(3)} of the face: ${light.toFixed(2)} light`);
            }
          }
        };
        // Measured over these editions: a letter is 0.45 to 0.75 light, even in the shade of its own cut;
        // bare stone 0.06 to 0.36, at its lightest where the room's light lies on it.
        check(thinned(inLetters, 60), 'no letter', (light) => light < 0.42, () => { late += 1; });
        check(thinned(onStone, 60), 'not bare stone', (light) => light > 0.4, () => { early += 1; });
        report.push({ serial, turned: false, label: `stone lying still, ${label}`, kinds, tested, late, early, bad: bad.slice(0, 3), least: 60, seen });
      }

      // Before it is let go, in the air, landing and wobbling: it is drawn where the drop says it is.
      {
        const RADIUS = 60; // px per plate unit: the whole drop fits in the canvas
        plate.setView({ anchorX: SIZE / 2, anchorY: SIZE - 80, radius: RADIUS, tilt, yaw: 0 });
        const seat = plate.project(0, 0, 0);
        let tested = 0;
        let late = 0;
        let early = 0;
        const bad = [];
        const outside = [];
        const waiting = look(seat.x, seat.y, { reveal: 0, stone: drop.at(0) });
        tested += 1;
        if (waiting.solid > 0.3) {
          early += 1;
          bad.push(`the seat is not bare before the stone is let go: ${waiting.solid.toFixed(2)} solid`);
        }
        const moments = [0.5 * drop.lands, 0.85 * drop.lands, drop.lands + 0.12, drop.lands + 0.4, drop.lands + 0.9, drop.rests + 1];
        for (const moment of moments) {
          const pose = drop.at(moment);
          const frame = { reveal: 0, stone: pose };
          const flat = ([x, y, z]) => {
            const at = plate.project(x, y, z);
            return [at.x, at.y];
          };
          // Inside: its middle, and six points half way out to its rim.
          const inside = [ofStone(pose, 0, 0, STONE.thick / 2)];
          for (let i = 0; i < 6; i += 1) {
            inside.push(ofStone(pose, 0.5 * STONE.radius * Math.cos(i), 0.5 * STONE.radius * Math.sin(i), STONE.thick / 2));
          }
          for (const point of inside) {
            const [x, y] = flat(point);
            if (x < 4 || y < 4 || x > SIZE - 4 || y > SIZE - 4) continue;
            tested += 1;
            const { solid } = look(x, y, frame);
            if (solid < 0.9) {
              late += 1;
              bad.push(`no stone where the drop puts it ${moment.toFixed(2)} s after it is let go: ${solid.toFixed(2)} solid at ${x.toFixed(0)}, ${y.toFixed(0)}`);
            }
          }
          // Outside: six pixels beyond corners of its outline, away from its middle. Its shadow may lie there, never the stone.
          const corners = silhouette(pose, (x, y, z) => flat([x, y, z]));
          const mid = corners.reduce((sum, [x, y]) => [sum[0] + x / corners.length, sum[1] + y / corners.length], [0, 0]);
          for (let i = 0; i < corners.length; i += 4) {
            const far = Math.hypot(corners[i][0] - mid[0], corners[i][1] - mid[1]);
            const x = corners[i][0] + (6 * (corners[i][0] - mid[0])) / far;
            const y = corners[i][1] + (6 * (corners[i][1] - mid[1])) / far;
            if (x < 4 || y < 4 || x > SIZE - 4 || y > SIZE - 4) continue;
            tested += 1;
            const { solid } = look(x, y, frame);
            outside.push(solid);
            if (solid > 0.5) { // measured: a shadow is at most 0.21 solid
              early += 1;
              bad.push(`stone outside the drop's outline ${moment.toFixed(2)} s after it is let go: ${solid.toFixed(2)} solid at ${x.toFixed(0)}, ${y.toFixed(0)}`);
            }
          }
        }
        report.push({ serial, turned: false, label: `stone dropping, ${label}`, kinds, tested, late, early, bad: bad.slice(0, 3), least: 40, outside: Math.max(...outside) });
      }
    }
  }
  return report;
};

/** Open the site in headless Chrome, run `inPage` there, and hand back what it returns and what the page logged. */
async function runInChrome(address, expression) {
  if (!existsSync(CHROME)) throw new Error(`Google Chrome was not found at ${CHROME}. Set CHROME to its path.`);
  const profile = mkdtempSync(join(tmpdir(), 'check-plate-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--no-first-run', '--disable-extensions', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'],
    { stdio: 'ignore' },
  );
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !existsSync(portFile); i += 1) await sleep(100);
    if (!existsSync(portFile)) throw new Error('Chrome did not start within 15 seconds');
    const [port] = readFileSync(portFile, 'utf8').split('\n');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const socket = new WebSocket(targets.find((entry) => entry.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('could not connect to Chrome'));
    });

    let nextId = 0;
    const pending = new Map();
    const waiting = new Map();
    const said = [];
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id) {
        const call = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) call.reject(new Error(`${call.method}: ${data.error.message}`));
        else call.resolve(data.result);
      } else if (data.method === 'Runtime.exceptionThrown') {
        const details = data.params.exceptionDetails;
        said.push(details.exception?.description ?? details.text);
      } else if (data.method === 'Log.entryAdded' && /error|warning/.test(data.params.entry.level)) {
        said.push(`${data.params.entry.level}: ${data.params.entry.text}`);
      } else if (waiting.has(data.method)) {
        waiting.get(data.method)();
        waiting.delete(data.method);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        nextId += 1;
        pending.set(nextId, { resolve, reject, method });
        socket.send(JSON.stringify({ id: nextId, method, params }));
      });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    const loaded = new Promise((resolve) => waiting.set('Page.loadEventFired', resolve));
    await send('Page.navigate', { url: address });
    await Promise.race([
      loaded,
      sleep(15000).then(() => {
        throw new Error(`${address} did not load within 15 seconds`);
      }),
    ]);
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return { value: result.result.value, said };
  } finally {
    chrome.kill('SIGTERM');
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

try {
  const reply = await fetch(site);
  if (!reply.ok) throw new Error(`it answered ${reply.status}`);
} catch (error) {
  throw new Error(`The preview server is not answering at ${site} (${error.message}). Start it with: python3 tools/dev-server.py`, {
    cause: error,
  });
}

const serials = editionsToCheck();
const { value: report, said } = await runInChrome(site, `(${inPage.toString()})(${JSON.stringify(serials)}, ${want})`);

let wrong = 0;
let total = 0;
let thin = 0;
for (const row of report) {
  total += row.tested;
  wrong += row.late + row.early;
  const few = row.tested < (row.least ?? Math.min(want, 4));
  if (few) thin += 1;
  if (row.late + row.early === 0 && !few) continue;
  const what = few ? `only ${row.tested} clear points to check` : `${row.late} not drawn, ${row.early} drawn too soon, of ${row.tested}`;
  console.log(`✖ ${row.serial} (bands ${row.kinds}, ${row.turned ? 'turned' : 'still'}) ${row.label}: ${what}`);
  for (const line of row.bad) console.log(`    ${line}`);
}
if (process.env.SEEN) {
  for (const row of report.filter((entry) => entry.outside !== undefined)) console.log(`  ${row.serial} ${row.label}: most solid outside ${row.outside.toFixed(2)}`);
  for (const row of report.filter((entry) => entry.seen)) {
    const of = (name) => row.seen.filter(([kind]) => kind === name).map(([, light]) => light).sort((a, b) => a - b);
    const letters = of('no letter');
    const stone = of('not bare stone');
    console.log(`  ${row.serial} ${row.label}: letters ${letters[0].toFixed(2)} to ${letters.at(-1).toFixed(2)}; stone ${stone[0].toFixed(2)} to ${stone.at(-1).toFixed(2)}, nine in ten under ${stone[Math.floor(stone.length * 0.9)].toFixed(2)}`);
  }
}
for (const line of said) console.log(`  the page said: ${line}`);
console.log(
  `${serials.length} editions, ${report.length} parts, ${total} points checked: ` +
    `${wrong} wrong, ${thin} parts with too few clear points, ${said.length} page errors`,
);
process.exitCode = wrong === 0 && thin === 0 && total > 0 && said.length === 0 ? 0 : 1;
