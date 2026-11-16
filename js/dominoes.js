// The Domino Reactor run, drawn live: thousands of dominoes standing in a
// double spiral. Push one and the wave runs through all of them.
//
// Every domino is the same box, and the whole run is drawn in one call. The
// graphics card tips each box itself, from the time that domino was told to
// fall, so the page does no work per domino per frame. It only writes times
// when something is pushed (js/domino-run.js works those out).
//
// The run is photographed rather than drawn: a key lamp casts real shadows,
// the floor mirrors the dominoes, and the picture is taken through a lens that
// is sharp only where it is focused (js/domino-shaders.js). One film camera
// shoots it, from a crane (js/domino-camera.js): it waits close behind the
// first domino, and when a wave runs it stays pointed at the dominoes that are
// falling, slowing the run's clock for its opening. A visitor can turn it by
// dragging, and chooses what the dominoes are made of (js/domino-designs.js).

import { Glide, blurOf, createFilm, landingOf, lookAt, multiply, nearestTurn, orthographic, restPhase, through, viewOf } from './domino-camera.js';
import { DESIGNS, PATTERN, designOf } from './domino-designs.js';
import { DOMINO, countFor, createSchedule, layRun, radiusOf } from './domino-run.js';
import {
  BOX_FRAGMENT,
  BOX_VERTEX,
  FLOOR_FRAGMENT,
  FLOOR_VERTEX,
  GLOW_FRAGMENT,
  GLOW_VERTEX,
  KEY,
  LENS_VERTEX,
  SHADOW_FRAGMENT,
  SHADOW_VERTEX,
  lensFragment,
} from './domino-shaders.js';
import { clamp, finePointer, reduceMotion, whileVisible } from './motion.js';

// How many dominoes there are: as many as stand about this many CSS pixels
// tall when the whole run is in the picture. A phone gets fewer, larger ones.
const GRAIN = { fine: 9, coarse: 12 };
const PLINTH = 2; // how far the floor reaches beyond the outermost dominoes, in domino heights
const REACH = 1.6; // how near a press must land to a domino to push it, in domino heights
const AIM_HEIGHT = 0.4; // presses are read at this height: people aim at the dominoes, not the floor
const COOL = 2.2; // seconds a fallen domino takes to lose its glow
const GLOW = { near: 50, widest: 2.4 }; // beyond `near` domino heights the glow of a struck domino is drawn wider, up to `widest` times
const RISE = { spread: 1.2, each: 0.5 }; // setting up again: seconds for the wave to cross, and for one domino to stand
const SWAP = 1.1; // seconds a new design takes to spread through the run
// Dragging the run: radians per pixel, round and over; pixels a press may wander before it is a drag;
// how fast a spin dies away, and how fast the camera goes back to where the film puts it (both per second).
const DRAG = { turn: 0.006, tilt: 0.004, slop: 6, glide: 4, home: 5 };
// How much of the picture's half width and height a domino must be within: for a push of it to be seen where
// the camera is, and (nearer the middle) before a push that waited for the camera to come round is let go.
const IN_VIEW = { seen: 0.8, held: 0.4 };
const SWAY = { swing: 0.045, tilt: 0.01, wake: 10 }; // radians the resting camera breathes through, and seconds it goes on after the visitor last did anything
const SOFT = { fine: 9, coarse: 6 }; // the widest blur the lens draws, in CSS pixels
const TAPS = { fine: 56, coarse: 28 }; // how many neighbours each dot of the picture looks at to blur
const SHADOW = { fine: 4096, coarse: 2048 }; // dots across the key light's picture of the run
const SAVED = 'cc-domino-design'; // where the visitor's choice of design is kept

const format = (number) => number.toLocaleString('en-GB');

// ---------------------------------------------------------------------------
// The graphics card's side: programs and the shapes that never change
// ---------------------------------------------------------------------------

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`A domino shader did not compile: ${log}`);
  }
  return shader;
}

function program(gl, vertex, fragment, uniforms) {
  const made = gl.createProgram();
  gl.attachShader(made, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(made, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(made);
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) {
    throw new Error(`A domino program did not link: ${gl.getProgramInfoLog(made)}`);
  }
  const at = {};
  for (const name of uniforms) at[name] = gl.getUniformLocation(made, name);
  return { made, at };
}

/** One domino: six faces, two triangles each. Sixteen numbers per corner. */
function boxCorners() {
  const { width, thickness, height } = DOMINO;
  const faces = [
    { normal: [0, 1, 0], from: [-0.5, 0.5, 0], u: [1, 0, 0], v: [0, 0, 1], size: [width, height] },
    { normal: [0, -1, 0], from: [0.5, -0.5, 0], u: [-1, 0, 0], v: [0, 0, 1], size: [width, height] },
    { normal: [1, 0, 0], from: [0.5, 0.5, 0], u: [0, -1, 0], v: [0, 0, 1], size: [thickness, height] },
    { normal: [-1, 0, 0], from: [-0.5, -0.5, 0], u: [0, 1, 0], v: [0, 0, 1], size: [thickness, height] },
    { normal: [0, 0, 1], from: [-0.5, -0.5, 1], u: [1, 0, 0], v: [0, 1, 0], size: [width, thickness] },
    { normal: [0, 0, -1], from: [-0.5, 0.5, 0], u: [1, 0, 0], v: [0, -1, 0], size: [width, thickness] },
  ];
  const corners = [];
  for (const { normal, from, u, v, size } of faces) {
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
      corners.push(
        from[0] + u[0] * a + v[0] * b,
        from[1] + u[1] * a + v[1] * b,
        from[2] + u[2] * a + v[2] * b,
        ...normal,
        a,
        b,
        ...size,
        ...u, // the way "across the face" points, and "up" it: the shader rounds the edges with these
        ...v,
      );
    }
  }
  return new Float32Array(corners);
}

function build(gl, shadowSize, taps) {
  const boxes = program(gl, BOX_VERTEX, BOX_FRAGMENT, [
    'uCamera', 'uSize', 'uTime', 'uRise', 'uEye', 'uReach', 'uFlip', 'uPlinth', 'uSun', 'uShadow', 'uTexel', 'uSide',
    'uSwap', 'uBody', 'uVein', 'uMark', 'uLook', 'uInlay',
  ]);
  const shadow = program(gl, SHADOW_VERTEX, SHADOW_FRAGMENT, ['uSun', 'uSize', 'uTime', 'uRise', 'uSide']);
  const glow = program(gl, GLOW_VERTEX, GLOW_FRAGMENT, ['uCamera', 'uSpread', 'uLift', 'uGain', 'uTime', 'uRise']);
  const floor = program(gl, FLOOR_VERTEX, FLOOR_FRAGMENT, ['uCamera', 'uRadius', 'uEye', 'uSun', 'uShadow', 'uTexel', 'uSide']);
  const lens = program(gl, LENS_VERTEX, lensFragment(taps), ['uScene', 'uDepth', 'uDot', 'uLens', 'uMost']);

  const places = gl.createBuffer();
  const falls = gl.createBuffer();
  const perDomino = () => {
    for (const [buffer, location] of [[places, 3], [falls, 4]]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(location, 1);
    }
  };

  const square = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, square);
  gl.bufferData(gl.ARRAY_BUFFER, Float32Array.of(-1, -1, 1, -1, -1, 1, 1, 1), gl.STATIC_DRAW);
  const squareShape = () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, square);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  };

  const floorShape = gl.createVertexArray();
  gl.bindVertexArray(floorShape);
  squareShape();

  const glowShape = gl.createVertexArray();
  gl.bindVertexArray(glowShape);
  squareShape();
  perDomino();

  const boxShape = gl.createVertexArray();
  gl.bindVertexArray(boxShape);
  const box = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, box);
  gl.bufferData(gl.ARRAY_BUFFER, boxCorners(), gl.STATIC_DRAW);
  const stride = 64; // sixteen 4-byte numbers
  for (const [location, size, offset] of [[0, 3, 0], [1, 3, 12], [2, 4, 24], [5, 3, 40], [6, 3, 52]]) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  }
  perDomino();
  gl.bindVertexArray(null);

  // The key light's picture of the run: how far from the lamp the nearest thing is, at each dot.
  const picture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, picture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, shadowSize, shadowSize);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const taken = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, taken);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, picture, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`This browser cannot take the picture the dominoes' shadows come from (framebuffer status ${status}).`);
  }

  return { boxes, shadow, glow, floor, lens, places, falls, floorShape, glowShape, boxShape, picture, taken, shadowSize };
}

/**
 * What the run is drawn into before it goes through the lens: a picture with
 * smooth edges (several samples a dot), and a plain copy of it, with how far
 * away each dot is, for the lens to read.
 *
 * @returns {{ drawn: WebGLFramebuffer, settled: WebGLFramebuffer, scene: WebGLTexture, depth: WebGLTexture, width: number, height: number, free(): void } | null}
 *   null if this graphics card cannot make them; the run is then drawn straight to the page, without the lens.
 */
function makeTargets(gl, width, height) {
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  const colours = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, colours);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
  const depths = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depths);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, width, height);
  const drawn = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, drawn);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colours);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depths);
  const drawnStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

  const texture = (format, filter) => {
    const made = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, made);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return made;
  };
  const scene = texture(gl.RGBA8, gl.LINEAR);
  const depth = texture(gl.DEPTH_COMPONENT24, gl.NEAREST);
  const settled = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, settled);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  const settledStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const free = () => {
    gl.deleteFramebuffer(drawn);
    gl.deleteFramebuffer(settled);
    gl.deleteRenderbuffer(colours);
    gl.deleteRenderbuffer(depths);
    gl.deleteTexture(scene);
    gl.deleteTexture(depth);
  };
  if (drawnStatus !== gl.FRAMEBUFFER_COMPLETE || settledStatus !== gl.FRAMEBUFFER_COMPLETE) {
    free();
    console.warn(`The Domino Reactor run is drawn without its lens: this graphics card could not make the pictures it needs (framebuffer status ${drawnStatus} and ${settledStatus}).`);
    return null;
  }
  return { drawn, settled, scene, depth, width, height, free };
}

// ---------------------------------------------------------------------------
// The run on the page
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   stage: HTMLElement, canvas: HTMLCanvasElement, controls: HTMLElement,
 *   button: HTMLButtonElement, tally: HTMLElement, totals: HTMLElement[], status: HTMLElement,
 *   designs: HTMLElement,
 * }} parts
 *   `stage` is the box the run fills; `button` pushes the first domino and
 *   later sets them up again; `tally` shows how many are down, and every one
 *   of `totals` how many the run holds (it holds as many as suit the screen); `status` tells screen readers when a run starts and ends;
 *   `designs` holds a button for each design of domino (`data-design`).
 * @returns {{ lay(layout: { spin: 1 | -1 }): void }} `spin` is which way the spiral winds
 */
export function startDominoes({ stage, canvas, controls, button, tally, totals, status, designs }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true });
  if (!gl) throw new Error('This browser cannot draw the domino run: it has no WebGL2.');
  const fine = finePointer.matches;
  const shadowSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), fine ? SHADOW.fine : SHADOW.coarse);
  const taps = fine ? TAPS.fine : TAPS.coarse;
  let kit = build(gl, shadowSize, taps);
  let targets = null; // what the run is drawn into before it goes through the lens
  let lensless = false; // this graphics card cannot make them, so the run is drawn straight to the page
  let lost = false;

  let layout = { spin: 1 };
  let run = null;
  let schedule = null;
  let floorRadius = 0;
  let sun = null; // the key light's view of the run

  // 'standing': nothing is moving and at least one domino is up.
  // 'falling': a wave is running. 'down': every domino is down.
  // 'rising': they are being set up again.
  let mode = 'standing';
  let clock = 0; // seconds; it only runs while dominoes are falling or cooling
  let coolUntil = 0;
  let rise = -1; // seconds into setting them up again, or -1
  let shown = -1; // the number the tally shows
  let stale = true; // something changed that needs a new picture
  let shadowStale = true; // a domino moved, so the shadows need a new picture too
  let aspect = 1;
  let ratio = 1; // dots of the picture per CSS pixel
  let arrived = false;

  // ----- the camera -----

  let film = null; // the camera, and the film it shoots of this run
  let turn = 0; // radians the visitor has turned the crane round the run
  let tilt = 0; // and tilted the camera over what it looks at
  let spin = 0; // radians a second the crane is still turning after a drag let go
  let homing = false; // the camera is going back to where the film puts it
  let waiting = -1; // a domino to push once the camera has come back round to it, or -1
  let drag = null;
  let dragged = false;
  let awake = 0; // seconds the resting camera goes on breathing
  let breath = 0;
  const sway = new Glide(0, 3);

  /** What the camera sees now. */
  const camera = () => {
    const shot = film.shot;
    return { ...viewOf(shot, { aspect, reach: floorRadius }), shot };
  };

  /** True if that domino is well inside the picture: within `share` of its half width and height. */
  const inView = (index, share = IN_VIEW.seen) => {
    const [x, y, , w] = through(camera().matrix, run.places[index * 4], run.places[index * 4 + 1], DOMINO.height / 2);
    return w > 0 && Math.abs(x) <= share && Math.abs(y) <= share;
  };

  const wake = () => {
    awake = SWAY.wake;
  };

  /** Send the camera back to where the film puts it. */
  const goHome = () => {
    homing = true;
    spin = 0;
    turn = nearestTurn(turn, 0);
    stale = true;
  };

  /** Move the camera on by `dt` seconds. Returns true if the picture changed. */
  function stepCamera(dt) {
    let moving = false;
    const still = reduceMotion.matches;

    if (!drag) {
      if (Math.abs(spin) > 0.002) {
        turn += spin * dt;
        spin *= Math.exp(-DRAG.glide * dt);
        moving = true;
      } else {
        spin = 0;
      }
      if (homing) {
        const fade = still ? 0 : Math.exp(-DRAG.home * dt);
        turn *= fade;
        tilt *= fade;
        if (Math.abs(turn) < 0.0005 && Math.abs(tilt) < 0.0005) {
          turn = 0;
          tilt = 0;
          homing = false;
        }
        moving = true;
      }
    }

    awake = Math.max(0, awake - dt);
    const share = still || awake <= 0 ? 0 : 1;
    if (!sway.settled(share, 0.002)) sway.step(share, dt);
    else sway.snap(share);
    if (sway.value > 0) {
      breath += dt;
      moving = true;
    }

    const moment = {
      mode,
      falls: schedule.falls,
      now: clock,
      dt,
      turn,
      tilt: tilt + sway.value * SWAY.tilt * Math.sin(breath * 0.37 + 1),
      swing: sway.value * SWAY.swing * Math.sin(breath * 0.24),
      still,
    };
    if (film.step(moment)) moving = true;

    // A push that was waiting for the camera to come round: now that its domino is in the middle of the picture, push it.
    if (waiting >= 0 && (!homing || inView(waiting, IN_VIEW.held))) {
      const index = waiting;
      waiting = -1;
      push(index);
    }
    return moving;
  }

  // ----- what the dominoes are made of -----

  let wearing = DESIGNS[0];
  let leaving = DESIGNS[0];
  let swapped = 1; // how far through a change of design, 0 to 1

  const pressed = (group, attribute, key) => {
    for (const each of group.querySelectorAll(`[${attribute}]`)) {
      each.setAttribute('aria-pressed', String(each.getAttribute(attribute) === key));
    }
  };

  function wear(design, atOnce = false) {
    if (design === wearing) return;
    leaving = wearing; // if a change was still spreading, it is taken as finished
    wearing = design;
    swapped = atOnce || reduceMotion.matches ? 1 : 0;
    pressed(designs, 'data-design', design.key);
    stale = true;
  }

  const pair = (read) => Float32Array.of(...read(leaving), ...read(wearing));
  const designUniforms = () => {
    const at = kit.boxes.at;
    gl.uniform3fv(at.uBody, pair((design) => design.body));
    gl.uniform3fv(at.uVein, pair((design) => design.vein));
    gl.uniform3fv(at.uMark, pair((design) => design.mark));
    gl.uniform4fv(at.uLook, pair((design) => [PATTERN[design.pattern], design.metal, design.polish, design.markGlow]));
    gl.uniform1fv(at.uInlay, pair((design) => [design.markMetal]));
    // The new design spreads out from the middle, quickly at first; its edge is brightest half way.
    const eased = 1 - (1 - swapped) ** 3;
    gl.uniform3f(at.uSwap, swapped >= 1 ? 9 : eased * 1.3, swapped >= 1 ? 0 : 4 * swapped * (1 - swapped), run.radius);
  };

  // ----- drawing -----

  function drawShadows(rising) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, kit.taken);
    gl.viewport(0, 0, kit.shadowSize, kit.shadowSize);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(kit.shadow.made);
    gl.uniformMatrix4fv(kit.shadow.at.uSun, false, sun);
    gl.uniform1f(kit.shadow.at.uSide, layout.spin);
    gl.uniform3f(kit.shadow.at.uSize, DOMINO.width, DOMINO.thickness, DOMINO.height);
    gl.uniform1f(kit.shadow.at.uTime, clock);
    gl.uniform4fv(kit.shadow.at.uRise, rising);
    gl.bindVertexArray(kit.boxShape);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, run.count);
  }

  function drawBoxes(view, rising, flip) {
    const at = kit.boxes.at;
    const off = Math.hypot(view.eye[0], view.eye[1], view.eye[2]);
    gl.useProgram(kit.boxes.made);
    gl.uniformMatrix4fv(at.uCamera, false, view.matrix);
    gl.uniform3f(at.uSize, DOMINO.width, DOMINO.thickness, DOMINO.height);
    gl.uniform1f(at.uTime, clock);
    gl.uniform4fv(at.uRise, rising);
    gl.uniform3fv(at.uEye, view.eye);
    gl.uniform2f(at.uReach, off - run.radius * 0.5, off + run.radius * 1.2);
    gl.uniform1f(at.uFlip, flip);
    gl.uniform1f(at.uPlinth, floorRadius);
    gl.uniformMatrix4fv(at.uSun, false, sun);
    gl.uniform1f(at.uSide, layout.spin);
    gl.uniform1i(at.uShadow, 0);
    gl.uniform1f(at.uTexel, 1 / kit.shadowSize);
    designUniforms();
    gl.bindVertexArray(kit.boxShape);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, run.count);
  }

  function drawGlow(view, rising, lift, spread, gain) {
    const at = kit.glow.at;
    gl.useProgram(kit.glow.made);
    gl.uniformMatrix4fv(at.uCamera, false, view.matrix);
    gl.uniform1f(at.uSpread, spread);
    gl.uniform1f(at.uLift, lift);
    gl.uniform1f(at.uGain, gain);
    gl.uniform1f(at.uTime, clock);
    gl.uniform4fv(at.uRise, rising);
    gl.bindVertexArray(kit.glowShape);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count);
  }

  /** The finished picture, through the lens, onto the page. */
  function throughLens(view) {
    const { width, height } = targets;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.drawn);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targets.settled);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // How soft the softest thing in the picture is: the nearest or the furthest part of the floor.
    const sharp = Math.max(view.focus, 3);
    const grows = blurOf({ focal: view.shot.focal, stop: view.shot.stop, focus: sharp }) * height;
    const out = Math.hypot(view.eye[0], view.eye[1]);
    const nearest = Math.max(0.5, Math.hypot(Math.max(0, out - floorRadius), view.eye[2] - 1));
    const furthest = Math.hypot(out + floorRadius, view.eye[2]);
    const softest = grows * Math.max(Math.abs(nearest - sharp) / nearest, Math.abs(furthest - sharp) / furthest);
    const most = Math.min((fine ? SOFT.fine : SOFT.coarse) * ratio, softest);

    const at = kit.lens.at;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(kit.lens.made);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, targets.scene);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, targets.depth);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(at.uScene, 1);
    gl.uniform1i(at.uDepth, 2);
    gl.uniform2f(at.uDot, 1 / width, 1 / height);
    gl.uniform4f(at.uLens, view.near, view.far, sharp, grows);
    gl.uniform1f(at.uMost, most);
    gl.bindVertexArray(kit.floorShape);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function render(view = camera()) {
    if (lost || !run || !film) return;
    const rising = Float32Array.of(rise, RISE.spread, RISE.each, run.count);
    const hot = mode !== 'rising' && clock < coolUntil;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (shadowStale) {
      drawShadows(rising);
      shadowStale = false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, targets ? targets.drawn : null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, kit.picture);

    // The run as the floor mirrors it.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    drawBoxes(view, rising, -1);

    // The floor, laid over the reflection. From here on the floor is what is
    // "there" at each of its dots: the reflection has no depth of its own.
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.depthFunc(gl.ALWAYS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // light adds to what is there
    gl.useProgram(kit.floor.made);
    gl.uniformMatrix4fv(kit.floor.at.uCamera, false, view.matrix);
    gl.uniform1f(kit.floor.at.uRadius, floorRadius);
    gl.uniform3fv(kit.floor.at.uEye, view.eye);
    gl.uniformMatrix4fv(kit.floor.at.uSun, false, sun);
    gl.uniform1f(kit.floor.at.uSide, layout.spin);
    gl.uniform1i(kit.floor.at.uShadow, 0);
    gl.uniform1f(kit.floor.at.uTexel, 1 / kit.shadowSize);
    gl.bindVertexArray(kit.floorShape);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // The pink light of struck dominoes, on the floor under them. From far
    // off it is drawn wider, so that the wave can be picked out of the whole run.
    const wider = Math.min(GLOW.widest, Math.max(1, view.focus / GLOW.near));
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    if (hot) drawGlow(view, rising, 0.01, 1.7 * wider, 0.2);

    // The run itself.
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    drawBoxes(view, rising, 1);

    // The same pink light as a haze in the air over them.
    if (hot) {
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      drawGlow(view, rising, 0.55, 1.3 * wider, 0.05);
      gl.depthMask(true);
    }

    if (targets) throughLens(view);
    gl.bindVertexArray(null);
  }

  const send = (buffer, numbers, usage) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, numbers, usage);
  };
  const sendFalls = () => {
    send(kit.falls, schedule.falls, gl.DYNAMIC_DRAW);
    stale = true;
    shadowStale = true;
  };

  // ----- what the visitor sees and hears about -----

  const showTally = (down) => {
    if (down === shown) return;
    shown = down;
    tally.textContent = format(down);
  };
  const offer = (label, live) => {
    button.textContent = label;
    button.setAttribute('aria-disabled', String(!live));
  };

  /** Every domino is up and nothing is moving. */
  function stand() {
    schedule.standAll();
    sendFalls();
    clock = 0;
    coolUntil = 0;
    rise = -1;
    mode = 'standing';
    showTally(0);
    offer('Push the first one', true);
  }

  /** The wave has passed: say where things stand. */
  function settle() {
    const down = schedule.fallen(clock);
    showTally(down);
    if (down === run.count) {
      mode = 'down';
      offer('Set them up again', true);
      status.textContent = `All ${format(run.count)} dominoes are down.`;
    } else {
      mode = 'standing';
      offer('Push the first one', true);
    }
  }

  function push(index) {
    if (mode === 'rising' || mode === 'down' || index < 0) return;
    if (reduceMotion.matches) {
      // No wave to watch: the dominoes are simply down.
      if (!schedule.push(index, clock - 1000)) return;
      sendFalls();
      settle();
      return;
    }
    if (!schedule.push(index, clock)) return;
    sendFalls();
    coolUntil = Math.max(coolUntil, schedule.busyUntil + COOL);
    if (mode !== 'falling') {
      mode = 'falling';
      offer('Push the first one', false);
      status.textContent = 'The run is falling.';
    }
  }

  /**
   * A visitor asks for a domino to be pushed. If they have turned the camera
   * away from it, the camera comes back round first: a push is always seen.
   */
  function ask(index) {
    if (mode === 'rising' || mode === 'down' || index < 0) return;
    if (mode === 'standing' && !reduceMotion.matches && (turn !== 0 || tilt !== 0) && !inView(index)) {
      waiting = index;
      goHome();
      return;
    }
    push(index);
  }

  function setUp() {
    if (mode !== 'down') return;
    status.textContent = 'The run is standing again.';
    if (reduceMotion.matches) {
      stand();
      return;
    }
    mode = 'rising';
    rise = 0;
    offer('Set them up again', false);
    goHome();
  }

  // ----- keeping the picture smooth -----

  // If most frames are slow, the picture is drawn with fewer dots (twice at most).
  const pace = { frames: 0, slow: 0, steps: 0, scale: 1 };
  function watchPace(dt) {
    pace.frames += 1;
    if (dt > 0.03) pace.slow += 1;
    if (pace.frames < 45) return;
    const struggling = pace.slow > 30;
    pace.frames = 0;
    pace.slow = 0;
    if (!struggling || pace.steps >= 2) return;
    pace.steps += 1;
    pace.scale = pace.steps === 1 ? 0.75 : 0.55;
    size();
  }

  // ----- the frame loop -----

  const loop = whileVisible(
    stage,
    (dt) => {
      let moving = stale;
      stale = false;

      if (mode === 'rising') {
        rise += dt;
        moving = true;
        shadowStale = true;
        showTally(Math.round(run.count * (1 - clamp((rise - RISE.each / 2) / RISE.spread, 0, 1))));
        if (rise >= RISE.spread + RISE.each) stand();
      } else if (clock < coolUntil) {
        if (clock <= schedule.busyUntil) shadowStale = true; // after that the dominoes only cool
        clock += dt * film.pace; // the film slows the run for its opening
        moving = true;
        if (mode === 'falling') {
          showTally(schedule.fallen(clock));
          if (clock >= schedule.busyUntil) settle();
        }
      }

      if (swapped < 1) {
        swapped = Math.min(1, swapped + dt / SWAP);
        moving = true;
      }

      if (stepCamera(dt)) moving = true;

      if (moving) {
        render();
        watchPace(dt);
      }
    },
    {
      margin: '120px',
      onShow: () => {
        stale = true;
        wake();
        if (!arrived) {
          arrived = true;
          // The film opens high over the whole run, and the camera comes down to the first domino.
          if (!reduceMotion.matches) film.establish();
        }
      },
    },
  );

  // ----- laying the run -----

  function lay(next) {
    if (next) layout = next;
    const count = countFor(stage.clientWidth, fine ? GRAIN.fine : GRAIN.coarse);
    // The run starts where the camera waits: at the front of the stage.
    run = layRun({ count, spin: layout.spin, phase: restPhase(radiusOf(count), layout.spin) });
    schedule = createSchedule(run.count);
    floorRadius = run.radius + PLINTH;
    // The key lamp sees the whole floor, and the dominoes on it, from far
    // enough off to be a single direction. For a run that winds the other way
    // it stands on the other side, as the shaders have it.
    const away = floorRadius * 2 + 10;
    const lamp = [KEY[0] * layout.spin, KEY[1], KEY[2]];
    sun = multiply(
      orthographic(floorRadius + 0.5, floorRadius * KEY[2] + 1.2, away - floorRadius - 2, away + floorRadius + 2),
      lookAt(lamp.map((part) => part * away), [0, 0, 0]),
    );
    film = createFilm({ places: run.places, radius: run.radius, reach: floorRadius, aspect, spin: layout.spin });
    turn = 0;
    tilt = 0;
    spin = 0;
    homing = false;
    waiting = -1;
    send(kit.places, run.places, gl.STATIC_DRAW);
    for (const total of totals) total.textContent = format(run.count);
    canvas.setAttribute(
      'aria-label',
      `A run of ${format(run.count)} dominoes standing in a double spiral. Push the first and they all fall.`,
    );
    stand();
  }

  // ----- presses -----

  /** A press on the stage, as a point from -1 to 1 across and up it. */
  const pointOf = (event) => {
    const box = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * 2 - 1,
      y: 1 - ((event.clientY - box.top) / box.height) * 2,
    };
  };

  canvas.addEventListener('click', (event) => {
    if (dragged) return; // that was a turn of the camera, not a press
    wake();
    if (mode === 'down') {
      setUp();
      return;
    }
    const { x, y } = pointOf(event);
    const at = landingOf(camera().matrix, x, y, AIM_HEIGHT);
    const near = at ? schedule.nearestStanding(run.places, at.x, at.y, clock, REACH) : -1;
    ask(near >= 0 ? near : schedule.firstStanding(clock));
  });

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    wake();
    if (mode === 'down') setUp();
    else ask(schedule.firstStanding(clock));
  });

  designs.addEventListener('click', (event) => {
    const picked = event.target.closest('[data-design]');
    if (!picked) return;
    const design = designOf(picked.dataset.design);
    wear(design);
    wake();
    try {
      localStorage.setItem(SAVED, design.key);
    } catch {
      // Storage is off (private browsing, a full disk): the design still changes, it is only not remembered.
    }
  });

  // Dragging turns the camera round the run (and, with a mouse, over what it looks at).
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!event.target.closest('canvas')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, at: performance.now() };
    dragged = false;
    spin = 0;
    homing = false;
    waiting = -1; // the visitor has taken the camera: a push that was waiting for it is dropped
    wake();
  });

  stage.addEventListener('pointermove', (event) => {
    wake();
    if (!drag || drag.id !== event.pointerId) return;
    const across = event.clientX - drag.x;
    const down = event.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(across, down) < DRAG.slop) return;
      drag.moved = true;
      dragged = true;
      stage.classList.add('is-turning');
      stage.setPointerCapture(event.pointerId);
    }
    const now = performance.now();
    const step = -across * DRAG.turn; // the run follows the hand, so the camera goes the other way
    turn += step;
    spin = 0.6 * spin + 0.4 * (step / (Math.max(1, now - drag.at) / 1000));
    if (event.pointerType === 'mouse') {
      const [lowest, highest] = film.tilts;
      tilt = clamp(tilt + down * DRAG.tilt, lowest, highest);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.at = now;
    stale = true;
  });

  const letGo = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.moved) {
      stage.classList.remove('is-turning');
      if (performance.now() - drag.at > 80) spin = 0; // the hand had stopped before it let go
    }
    drag = null;
  };
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', letGo);

  // The graphics card can take its memory back (a long sleep, too many tabs).
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // we will rebuild when it comes back
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    kit = build(gl, shadowSize, taps);
    targets = lensless ? null : makeTargets(gl, canvas.width, canvas.height);
    send(kit.places, run.places, gl.STATIC_DRAW);
    lost = false;
    sendFalls();
  });

  function size() {
    ratio = Math.min(window.devicePixelRatio || 1, 2) * pace.scale;
    const width = Math.max(1, Math.round(stage.clientWidth * ratio));
    const height = Math.max(1, Math.round(stage.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height || (!targets && !lensless)) {
      canvas.width = width;
      canvas.height = height;
      if (targets) targets.free();
      targets = lost || lensless ? null : makeTargets(gl, width, height);
      if (!targets && !lost) lensless = true; // it has said why, once; do not ask again
    }
    const shape = width / height;
    if (shape !== aspect) {
      aspect = shape;
      if (film) film.reframe(aspect);
    }
    stale = true;
    if (run && !loop.visible) render(); // resizing wipes the picture; put it back even while the loop rests
  }

  size();
  lay();
  let saved = null;
  try {
    saved = localStorage.getItem(SAVED);
  } catch {
    // Storage is off: the run starts in its first design.
  }
  const remembered = DESIGNS.find((design) => design.key === saved);
  if (remembered) wear(remembered, true);
  new ResizeObserver(size).observe(stage);
  stage.classList.add('is-live');
  controls.hidden = false;
  designs.hidden = false;

  return { lay };
}
