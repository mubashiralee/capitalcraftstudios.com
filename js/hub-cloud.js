// The Hub's mind as light: the cloud of points that js/cortex.js works out, drawn.
//
// It is a constellation under glass. On the graphics card it is tens of thousands of points, and
// each is lit by what it is part of. The glass is fine dust, faint where it faces the eye and
// bright at its edge, with the sheen of one lamp on it: so the dome reads as glass and not as a
// solid. A thread is a fine line, and now and then a signal runs along it. A node is a round
// light with a soft halo. The points are light that adds, and the eye is focused a little in
// front of the middle: further from there a point spreads and fades, so the near side is sharp
// and the far side soft. When the mind is first seen its glass gathers, and the constellation
// grows out from the orchestrator along its threads.
//
// Where a browser has no WebGL2, or loses it, a plainer picture is drawn on a plain canvas
// instead (`drawLite`): the same constellation at rest, by the same numbers.
//
// Nothing here knows about jobs. js/hub.js says how the mind is turned, how busy each region
// is and where a wave has reached, and this file draws that.

import { FOV, PART, PULSE, constellation, project, regionOfPoints, turning } from './cortex.js';

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((part) => part / length);
};

/**
 * How the mind is lit. One set of numbers, used by the shader and by the plain-canvas picture,
 * so that the two cannot drift apart.
 */
export const LIGHT = Object.freeze({
  // The glass.
  glass: 0.05, // the light the glass has where it faces the eye
  rimmed: 0.85, // and how much more where it turns away from it: the edge of the dome
  rimPower: 2.6,
  far: 0.5, // how much of the far wall of the glass shows through the near one
  sheen: 0.8, // the light of a lamp, over the viewer's left shoulder, where the glass sends it back to the eye
  sheenFaces: Object.freeze(unit([-0.36, -0.7, -0.62])), // which way the glass faces there: across, down and away
  sheenPower: 34, // how small that patch of light is
  dustWide: 0.82, // how wide a grain of the glass is, against a point of a thread
  // The constellation under it.
  thread: 0.34, // a thread at rest
  node: 1.05, // a node of the middle size, or larger
  small: 0.3, // how much of that light a node of no size at all would have: a small node is the fainter, and so the bluer
  halo: 0.5, // the glow round a node: wide and faint
  mote: 0.3, // a grain of dust adrift between them
  nodeWide: 0.017, // how wide a node of the middle size is, in units of the mind
  haloWide: 0.07, // and the glow round it
  moteWide: 0.9, // how wide a mote is, against a point of a thread
  depth: 0.55, // how much brighter the constellation is a unit nearer the eye
  focus: -0.25, // how far beyond the middle the eye is focused: a little in front of it
  blur: 0.75, // how much wider a point is a unit from there
  // What moves by itself.
  pulsed: 0.5, // the light of a signal: a bead that runs along a thread
  front: 0.005, // how long the bead is, in units of the mind
  bead: 1.5, // how much wider than its thread it is
  trailed: 0.24, // the light of the glow it leaves on the thread behind it
  tail: 0.1, // and how far behind the bead that glow has fallen to about a third
  breath: 0.16, // how far a node's light rises and falls
  // Growing, when the mind is first seen.
  grow: 1.3, // how far the growing has gone once the mind has gathered: past the furthest node, so that nothing still flares
  flare: 1.0, // how much more light a point has for a moment as the growing reaches it
  // The work.
  worked: 1.1, // how much brighter a region with work in it is
  surged: 1.3, // and the crest of a merged release's wave: bright, but still its own colour and not white
  gain: 0.9, // how bright one point is
});

/**
 * How wide a point of the glass or of a thread is: its width squared, times the number of
 * points, in units of the mind. It is the same for a cloud of any size, so a cloud of fewer
 * points is drawn with wider ones and is as bright. (A node is as wide as `LIGHT.nodeWide` says
 * in any cloud: there are as many nodes in each.)
 */
export const GRAIN = 1.1;

/**
 * How busy a stage's region must be to count as at work. js/hub.js lights the stage's name by
 * it and the plain picture lights its region by it, so that the two change together. (On the
 * graphics card a region takes its lit colour by degrees instead.)
 */
export const AT_WORK = 0.3;

const f = (number) => (Number.isInteger(number) ? `${number}.0` : String(number));
/** In the shader: 1 for a point that is this part, 0 for any other. */
const is = (part) => `(step(${f(part - 0.5)}, aLook.y) - step(${f(part + 0.5)}, aLook.y))`;

export const VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aAt;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aLook;  // how bright it is of itself, its part, its region (-1 for none), a number of its own
layout(location = 3) in vec4 aGrown; // the second its thread's signal sets out, how far along its thread it lies, how long the thread is, and when the growing reaches it

uniform mat3 uTurn;    // the turn of the view: across, down, away
uniform vec3 uView;    // pixels to one unit of the mind, and where its middle lands, in CSS pixels
uniform vec2 uSize;    // the canvas, in CSS pixels
uniform float uRatio;  // device pixels to one CSS pixel
uniform float uFov;
uniform float uGrain;  // how wide a point is, in units of the mind
uniform float uTime;
uniform float uBorn;   // 0 as the mind starts to gather, 1 once it has
uniform float uQuiet;  // 1 as a rule; less while one part of the Hub is being shown
uniform float uFire;   // 1 while signals run by themselves; 0 with motion reduced
uniform vec4 uBusy;    // how busy each stage's region is, 0 to 1
uniform vec4 uWave;    // where a merged release landed, and how far its wave has spread
uniform float uSurge;  // how strong that wave still is
uniform vec3 uDeep;    // the colour of the dimmest light, and of brighter and brighter
uniform vec3 uDust;
uniform vec3 uPale;
uniform vec3 uLit;     // the colour of a region with work in it
uniform vec3 uCleared; // the colour of the wave

out vec3 vLight;
out float vSoft; // 1 for a halo, which fades all the way from its middle; 0 for a point with an edge

void main() {
  float own = aLook.w;
  float isNode = ${is(PART.node)};
  float isThread = ${is(PART.thread)};
  float isGlass = ${is(PART.glass)};
  float isHalo = ${is(PART.halo)};
  float isMote = ${is(PART.mote)};
  float adrift = isGlass + isMote;

  // Gathering. The dust comes in from a little way off, each grain in its own time...
  float come = clamp((uBorn - own * 0.55) / 0.45, 0.0, 1.0);
  float settled = 1.0 - (1.0 - come) * (1.0 - come) * (1.0 - come);
  // ...and the constellation grows: out from the orchestrator, along its threads. A point
  // flares for a moment as the growing reaches it.
  float since = uBorn * ${f(LIGHT.grow)} - aGrown.w;
  float grown = smoothstep(0.0, 0.04, since);
  float fresh = grown * (1.0 - smoothstep(0.02, 0.22, since)) * (1.0 - adrift);
  float there = mix(grown, settled, adrift);
  vec3 at = aAt + aNormal * ((1.0 - settled) * 0.3 * adrift);

  vec3 p = uTurn * at;
  vec3 n = uTurn * aNormal;
  float near = uFov / (uFov + p.z);
  vec2 screen = uView.yz + p.xy * (uView.x * near);
  gl_Position = vec4(screen / uSize * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);

  // The glass: faint where it faces the eye, bright at its edge, the far wall behind the near
  // one, and one lamp's light where the near wall sends it back.
  float toward = -n.z;
  float rim = pow(1.0 - abs(toward), ${f(LIGHT.rimPower)});
  float sheen = pow(max(dot(n, vec3(${LIGHT.sheenFaces.map(f).join(', ')})), 0.0), ${f(LIGHT.sheenPower)});
  float glass = (${f(LIGHT.glass)} + ${f(LIGHT.rimmed)} * rim) * mix(${f(LIGHT.far)}, 1.0, smoothstep(-0.25, 0.35, toward)) + ${f(LIGHT.sheen)} * sheen;
  // The constellation: nearer is brighter.
  float depth = clamp(1.0 - p.z * ${f(LIGHT.depth)}, 0.42, 1.5);
  float inside = (isThread * ${f(LIGHT.thread)} + isMote * ${f(LIGHT.mote)}) * aLook.x + isNode * ${f(LIGHT.node)} * (${f(LIGHT.small)} + ${f(1 - LIGHT.small)} * min(aLook.x, 1.0)) + isHalo * ${f(LIGHT.halo)};
  float v = isGlass * glass * aLook.x + inside * depth;

  // Work in its region, and the wave of a merged release going over it.
  float busy = aLook.z < -0.5 ? 0.0 : uBusy[int(aLook.z + 0.5)];
  float off = distance(aAt, uWave.xyz) - uWave.w;
  float surge = exp(-off * off / (off > 0.0 ? 0.012 : 0.06)) * uSurge;

  // A signal runs along each thread in its own time, at one speed: a bead of light, and the
  // glow it leaves on the thread behind it.
  float seconds = fract(uTime / ${f(PULSE.every)}) * ${f(PULSE.every)};
  float behind = (seconds - aGrown.x) * ${f(PULSE.speed)} - aGrown.y * aGrown.z;
  float bead = uFire * isThread * exp(-behind * behind / ${f(LIGHT.front * LIGHT.front)});
  float trail = uFire * isThread * smoothstep(-${f(LIGHT.front)}, ${f(LIGHT.front)}, behind) * exp(-max(behind, 0.0) / ${f(LIGHT.tail)});
  // A node's light rises and falls a little, each in its own time; a grain of dust glints now and then.
  float breath = uFire * (isNode + isHalo) * ${f(LIGHT.breath)} * sin(uTime * (0.5 + own) + own * 40.0);
  float beat = fract(uTime * (0.04 + 0.07 * fract(own * 7.31)) + own * 37.0);
  float glint = uFire * adrift * step(0.955, fract(own * 3.17)) * smoothstep(0.0, 0.02, beat) * (1.0 - smoothstep(0.03, 0.1, beat));

  vec3 colour = mix(uDeep, uDust, smoothstep(0.0, 0.3, v));
  colour = mix(colour, uPale, smoothstep(0.3, 1.2, v));
  colour = mix(colour, uLit, min(1.0, busy * 0.75));
  colour = mix(colour, uCleared, min(1.0, surge * 1.2));
  colour = mix(colour, uPale, min(1.0, trail * 0.7));
  colour = mix(colour, vec3(1.0), min(1.0, bead + glint * 0.7 + fresh * 0.8));
  float light = v * (1.0 + ${f(LIGHT.worked)} * busy + ${f(LIGHT.surged)} * surge + breath) + (bead * ${f(LIGHT.pulsed)} + trail * ${f(LIGHT.trailed)}) * aLook.x + glint * 0.5 + fresh * ${f(LIGHT.flare)} * v;

  // Further from where the eye is focused a point spreads, and the same light over more of the screen is fainter.
  float blur = abs(p.z - (${f(LIGHT.focus)})) * ${f(LIGHT.blur)} * (1.0 - isHalo);
  float wide = uGrain * (isThread + isGlass * ${f(LIGHT.dustWide)} + isMote * ${f(LIGHT.moteWide)}) + (isNode * ${f(LIGHT.nodeWide)} + isHalo * ${f(LIGHT.haloWide)}) * aLook.x;
  float size = uView.x * near * wide * (1.0 + blur) * (1.0 + ${f(LIGHT.bead)} * bead + 0.45 * surge + fresh * (0.6 * (isNode + isHalo) + 0.15 * isThread));
  gl_PointSize = max(size, 1.1) * uRatio;
  vSoft = isHalo;
  vLight = colour * light * (${f(LIGHT.gain)} * uQuiet * there) / ((1.0 + blur) * (1.0 + blur));
}
`;

export const FRAGMENT = `#version 300 es
precision mediump float;

in vec3 vLight;
in float vSoft;
out vec4 colour;

void main() {
  // A round point, soft at its edge; a halo fades all the way from its middle. Light adds to
  // light, so what is written is light alone.
  float out_ = min(1.0, length(gl_PointCoord - 0.5) * 2.0);
  float edge = smoothstep(1.0, 0.2, out_);
  float fall = (1.0 - out_) * (1.0 - out_) * (1.0 - out_);
  vec3 lit = vLight * mix(edge, fall, vSoft);
  colour = vec4(lit, max(lit.r, max(lit.g, lit.b)));
}
`;

/** Every uniform the shaders take. Each must be set by `createCloud`, and each must be used by a shader. */
export const UNIFORMS = Object.freeze([
  'uTurn',
  'uView',
  'uSize',
  'uRatio',
  'uFov',
  'uGrain',
  'uTime',
  'uBorn',
  'uQuiet',
  'uFire',
  'uBusy',
  'uWave',
  'uSurge',
  'uDeep',
  'uDust',
  'uPale',
  'uLit',
  'uCleared',
]);

/**
 * How many numbers each point is packed into for the graphics card: where it is (3), the way it
 * faces (3), its look (4) and how it grows and signals (4).
 */
export const PACKED = 14;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`The mind's shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * The mind on the graphics card.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ count: number, at: Float32Array, normal: Float32Array, glow: Float32Array, part: Uint8Array, own: Float32Array, born: Float32Array, thread: Float32Array }} mind  from `buildMind`
 * @param {Int8Array} owner  the region each point belongs to, from `regionOfPoints`
 * @param {{ deep: number[], dust: number[], pale: number[], lit: number[], cleared: number[] }} colours  each red, green, blue from 0 to 255
 * @param {() => void} [onChange]  called when the graphics card has taken the context away, and
 *   again when the cloud has built itself on a context that is back. What was on the canvas is
 *   gone both times: a caller that draws only when something has changed must draw again.
 * @returns the cloud, or null when this browser has no WebGL2 (the caller draws the plainer picture instead)
 * @throws if WebGL2 is there but the shader cannot be built
 */
export function createCloud(canvas, mind, owner, colours, onChange = () => {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  const packed = new Float32Array(mind.count * PACKED);
  for (let i = 0; i < mind.count; i += 1) {
    const to = i * PACKED;
    for (let k = 0; k < 3; k += 1) {
      packed[to + k] = mind.at[i * 3 + k];
      packed[to + 3 + k] = mind.normal[i * 3 + k];
      packed[to + 10 + k] = mind.thread[i * 3 + k];
    }
    packed[to + 6] = mind.glow[i];
    packed[to + 7] = mind.part[i];
    packed[to + 8] = owner[i];
    packed[to + 9] = mind.own[i];
    packed[to + 13] = mind.born[i];
  }

  const turn = new Float32Array(9);
  let uniforms = {};
  let lost = false;
  let wide = 1;
  let tall = 1;
  let ratio = 1;

  function build() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`The mind's shader failed to link: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);

    uniforms = {};
    for (const name of UNIFORMS) {
      const where = gl.getUniformLocation(program, name);
      // A uniform nothing uses is dropped by the compiler, and setting it then does nothing, silently.
      if (where === null) throw new Error(`The mind's shader makes no use of ${name}.`);
      uniforms[name] = where;
    }

    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);
    const stride = PACKED * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 40);

    // Light adds to light: no point hides another, so there is no depth to keep.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    gl.uniform1f(uniforms.uFov, FOV);
    gl.uniform1f(uniforms.uGrain, Math.sqrt(GRAIN / mind.count));
    for (const [name, colour] of [
      ['uDeep', colours.deep],
      ['uDust', colours.dust],
      ['uPale', colours.pale],
      ['uLit', colours.lit],
      ['uCleared', colours.cleared],
    ]) {
      gl.uniform3f(uniforms[name], colour[0] / 255, colour[1] / 255, colour[2] / 255);
    }
  }

  build();

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // tells the browser we will rebuild, so it may hand the context back
    lost = true;
    onChange();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    build();
    lost = false;
    onChange();
  });

  return {
    /** False while the graphics card has taken the context away: the caller draws the plainer picture until it is back. */
    get ready() {
      return !lost;
    },

    /** Set the size of the canvas: in CSS pixels, and device pixels to each. */
    size(width, height, pixelRatio) {
      wide = Math.max(1, width);
      tall = Math.max(1, height);
      ratio = pixelRatio;
      canvas.width = Math.round(wide * ratio);
      canvas.height = Math.round(tall * ratio);
    },

    /** Wipe the canvas: for a frame the plainer picture is drawn instead. */
    clear() {
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    /**
     * @param {object} now
     * @param {{ yaw: number, pitch: number, scale: number, x: number, y: number }} now.view
     * @param {number} now.time    seconds, for the signals that run by themselves
     * @param {number} now.born    0 as the mind starts to gather, 1 once it has
     * @param {number} now.quiet   1 as a rule; less while one part of the Hub is being shown
     * @param {boolean} now.fire   whether signals run by themselves
     * @param {number[]} now.busy  how busy each stage's region is
     * @param {{ from: number[], radius: number, strength: number } | null} now.wave
     */
    draw({ view, time, born, quiet, fire, busy, wave }) {
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniformMatrix3fv(uniforms.uTurn, true, turning(view, turn)); // `turning` gives rows; the card wants columns
      gl.uniform3f(uniforms.uView, view.scale, view.x, view.y);
      gl.uniform2f(uniforms.uSize, wide, tall);
      gl.uniform1f(uniforms.uRatio, ratio);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uBorn, born);
      gl.uniform1f(uniforms.uQuiet, quiet);
      gl.uniform1f(uniforms.uFire, fire ? 1 : 0);
      gl.uniform4f(uniforms.uBusy, busy[0], busy[1], busy[2], busy[3]);
      if (wave) gl.uniform4f(uniforms.uWave, wave.from[0], wave.from[1], wave.from[2], wave.radius);
      else gl.uniform4f(uniforms.uWave, 0, 0, 0, 0);
      gl.uniform1f(uniforms.uSurge, wave ? wave.strength : 0);
      gl.drawArrays(gl.POINTS, 0, mind.count);
    },
  };
}

// ----- the plainer picture: a plain canvas -----

const smooth = (low, high, value) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** The brightness a light is put in a pile by, and how bright each pile is drawn. */
const PILES = Object.freeze({ over: [0.12, 0.3, 0.7], alpha: [0.2, 0.4, 0.7, 1] });
/**
 * How bright the flat glow round a node is drawn, and how much of the full halo's width it is
 * given. `disc` is how wide the node itself is drawn, as a share of its width on the graphics
 * card: there its light fades toward its edge, and a flat disc of the same width looks larger.
 */
const GLOW = Object.freeze({ alpha: 0.09, share: 0.42, disc: 0.72 });

/**
 * The mind drawn on a plain canvas, lit by the same numbers as the shader, at rest: no signal
 * runs on it. The glass and the motes are drawn grain by grain from a cloud light enough for
 * that, each thread as one line and each node as one disc with a flat glow round it. Everything
 * goes into one of a few piles by its colour and its brightness, so that the colour is set a few
 * times a frame and not thousands. `quiet` dims the whole picture alike: it is not what sorts
 * the piles, so a dimmed picture keeps its form and a picture fading in does not come in steps.
 *
 * @param {{ count: number, at: Float32Array, normal: Float32Array, glow: Float32Array, part: Uint8Array }} mind  from `buildMind`
 * @param {Int8Array} owner  the region each point belongs to, from `regionOfPoints`
 * @param {{ dust: number[], pale: number[], lit: number[], cleared: number[] }} colours  each red, green, blue from 0 to 255
 * @returns {(ctx: CanvasRenderingContext2D, now: { view: object, quiet: number, busy: number[], wave: { from: number[], radius: number, strength: number } | null }) => void}
 */
export function createLiteCloud(mind, owner, colours) {
  const { nodes, threads } = constellation(mind.plan); // the constellation the cloud was built from
  // At rest the dust and the threads are the colour of the dim light, and the nodes of the bright.
  const families = [colours.dust, colours.lit, colours.cleared];
  const nodeFamilies = [colours.pale, colours.lit, colours.cleared];
  const levels = PILES.alpha.length;
  const piles = () => Array.from({ length: families.length * levels }, () => []);
  const dust = piles(); // x, y and width for each grain
  const lines = piles(); // both ends of each thread
  const discs = piles(); // x, y and radius for each node
  const glows = families.map(() => []); // x, y and radius for the glow round each node

  // A thread is lit with the region its middle lies in.
  const middles = new Float32Array(threads.length * 3);
  threads.forEach((thread, i) => {
    for (let k = 0; k < 3; k += 1) middles[i * 3 + k] = (nodes[thread.from].at[k] + nodes[thread.to].at[k]) / 2;
  });
  const threadOwner = regionOfPoints({ count: threads.length, at: middles });

  const rows = new Float32Array(9);
  const P = [0, 0, 0, 0];
  const A = [0, 0, 0, 0];
  const depthOf = (away) => Math.min(1.5, Math.max(0.42, 1 - away * LIGHT.depth));
  const pileOf = (v) => (v > PILES.over[2] ? 3 : v > PILES.over[1] ? 2 : v > PILES.over[0] ? 1 : 0);

  let family = 0;
  /** What the work and the wave make of a light `v` at a point: how bright, and (in `family`) which colour. */
  function worked(v, region, x, y, z, busy, wave) {
    family = 0;
    if (region >= 0) {
      // How busy a region is dies away and never quite reaches nothing: it is the brighter for
      // any work at all, and takes the lit colour only while it counts as at work.
      v *= 1 + LIGHT.worked * busy[region];
      if (busy[region] > AT_WORK) family = 1;
    }
    if (wave) {
      const off = Math.hypot(x - wave.from[0], y - wave.from[1], z - wave.from[2]) - wave.radius;
      const surge = Math.exp((-off * off) / (off > 0 ? 0.012 : 0.06)) * wave.strength;
      if (surge > 0.15) {
        family = 2;
        v *= 1 + LIGHT.surged * surge;
      }
    }
    return v;
  }

  return function drawLite(ctx, { view, quiet, busy, wave }) {
    for (const each of [dust, lines, discs, glows]) for (const pile of each) pile.length = 0;
    turning(view, rows);
    const grain = Math.max(1.2, view.scale / 170);

    for (let i = 0; i < mind.count; i += 1) {
      const part = mind.part[i];
      if (part === PART.thread || part === PART.halo) continue; // a thread is drawn as one line, and a halo with its node
      const x = mind.at[i * 3];
      const y = mind.at[i * 3 + 1];
      const z = mind.at[i * 3 + 2];
      project(x, y, z, view, P);
      if (part === PART.node) {
        const v = worked(LIGHT.node * (LIGHT.small + (1 - LIGHT.small) * Math.min(mind.glow[i], 1)) * depthOf(P[3]), owner[i], x, y, z, busy, wave);
        const wide = mind.glow[i] * view.scale * P[2];
        discs[family * levels + pileOf(v)].push(P[0], P[1], Math.max(1, (LIGHT.nodeWide * GLOW.disc * wide) / 2));
        glows[family].push(P[0], P[1], (LIGHT.haloWide * GLOW.share * wide) / 2);
        continue;
      }
      let v = LIGHT.mote * mind.glow[i] * depthOf(P[3]);
      if (part === PART.glass) {
        const nx = mind.normal[i * 3];
        const ny = mind.normal[i * 3 + 1];
        const nz = mind.normal[i * 3 + 2];
        const across = rows[0] * nx + rows[1] * ny + rows[2] * nz;
        const down = rows[3] * nx + rows[4] * ny + rows[5] * nz;
        const away = rows[6] * nx + rows[7] * ny + rows[8] * nz;
        const rim = (1 - Math.abs(away)) ** LIGHT.rimPower;
        const sheen = Math.max(0, across * LIGHT.sheenFaces[0] + down * LIGHT.sheenFaces[1] + away * LIGHT.sheenFaces[2]) ** LIGHT.sheenPower;
        v = ((LIGHT.glass + LIGHT.rimmed * rim) * (LIGHT.far + (1 - LIGHT.far) * smooth(-0.25, 0.35, -away)) + LIGHT.sheen * sheen) * mind.glow[i];
      }
      v = worked(v, owner[i], x, y, z, busy, wave);
      // Never narrower than a pixel: a plain canvas smears a smaller grain over its neighbours, and it goes faint.
      dust[family * levels + pileOf(v)].push(P[0], P[1], Math.max(1, grain * P[2] * (part === PART.glass ? LIGHT.dustWide : LIGHT.moteWide)));
    }

    threads.forEach((thread, i) => {
      const a = nodes[thread.from].at;
      const b = nodes[thread.to].at;
      project(a[0], a[1], a[2], view, A);
      project(b[0], b[1], b[2], view, P);
      const v = worked(LIGHT.thread * thread.glow * depthOf((A[3] + P[3]) / 2), threadOwner[i], middles[i * 3], middles[i * 3 + 1], middles[i * 3 + 2], busy, wave);
      lines[family * levels + pileOf(v)].push(A[0], A[1], P[0], P[1]);
    });

    const paint = (colour, alpha) => `rgba(${colour[0]},${colour[1]},${colour[2]},${(alpha * quiet).toFixed(3)})`;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    for (let k = 0; k < families.length * levels; k += 1) {
      const colour = families[Math.floor(k / levels)];
      const alpha = PILES.alpha[k % levels];
      if (dust[k].length > 0) {
        ctx.fillStyle = paint(colour, alpha);
        for (let n = 0; n < dust[k].length; n += 3) {
          const s = dust[k][n + 2];
          ctx.fillRect(dust[k][n] - s / 2, dust[k][n + 1] - s / 2, s, s);
        }
      }
      if (lines[k].length > 0) {
        ctx.strokeStyle = paint(colour, alpha);
        ctx.beginPath();
        for (let n = 0; n < lines[k].length; n += 4) {
          ctx.moveTo(lines[k][n], lines[k][n + 1]);
          ctx.lineTo(lines[k][n + 2], lines[k][n + 3]);
        }
        ctx.stroke();
      }
    }
    // The nodes go over the threads that end at them.
    const round = (pile) => {
      ctx.beginPath();
      for (let n = 0; n < pile.length; n += 3) {
        ctx.moveTo(pile[n] + pile[n + 2], pile[n + 1]);
        ctx.arc(pile[n], pile[n + 1], pile[n + 2], 0, Math.PI * 2);
      }
      ctx.fill();
    };
    glows.forEach((pile, k) => {
      if (pile.length === 0) return;
      ctx.fillStyle = paint(nodeFamilies[k], GLOW.alpha);
      round(pile);
    });
    discs.forEach((pile, k) => {
      if (pile.length === 0) return;
      ctx.fillStyle = paint(nodeFamilies[Math.floor(k / levels)], PILES.alpha[k % levels]);
      round(pile);
    });
  };
}
