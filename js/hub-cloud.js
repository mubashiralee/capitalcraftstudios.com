// The Hub's brain as light: the cloud of points that js/cortex.js works out, drawn.
//
// On the graphics card it is tens of thousands of points, each lit by where it stands: bright on
// the crest of a fold and dark in a groove, lit from the upper left, soft and faint where it is
// far from the eye. The points are light that adds, so two things keep the brain a solid and not
// a glass shell: a point is as wide as it must be for the cloud to cover the surface (`GRAIN`),
// and a point seen edge on counts for less, because many of them land on the same pixels
// (`LIGHT.limb`). Where a browser has no WebGL2, or loses it, a lighter cloud is drawn point by
// point on a plain canvas instead (`drawLite`), by the same rules.
//
// Nothing here knows about jobs. js/hub.js says how the brain is turned, how busy each region
// is and where a wave has reached, and this file draws that.

import { FOV, PART, project, turning } from './cortex.js';

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((part) => part / length);
};

/**
 * How the brain is lit. One set of numbers, used by the shader and by the plain-canvas cloud, so
 * that the two cannot drift apart. Directions are as the viewer sees them: x to the right, y
 * down, z away.
 */
export const LIGHT = Object.freeze({
  key: Object.freeze(unit([-0.5, -0.62, -0.6])), // the main light: above, to the left, in front
  fill: Object.freeze(unit([0.75, 0.25, -0.35])), // a faint light from the right, so the dark side is not flat
  ambient: 0.16, // the light every point has, wherever it faces
  keyed: 0.95, // how much the main light adds
  filled: 0.22,
  rimmed: 0.3, // how much brighter the surface is where it turns away from the eye
  rimPower: 3,
  far: 0.1, // how much of the far wall shows through the near one
  groove: 0.26, // how bright the bottom of a groove is, against a crest
  stem: 0.62, // the brainstem keeps out of the light
  limb: 0.22, // the least a point counts for, however far it is turned from the eye: what is left is a fine line of light at the brain's edge
  worked: 1.1, // how much brighter a region with work in it is
  surged: 1.3, // and the crest of a merged release's wave: bright, but still its own colour and not white
  gain: 0.8, // how bright one point is, for the points over a pixel to add up to the light that falls there
});

/**
 * What the points cover between them: their number, times the square of how wide each is (in
 * units of the brain). It is the same for a cloud of any size, so a cloud of fewer points is as
 * solid as a cloud of many.
 */
export const GRAIN = 14;

/**
 * How busy a stage's region must be to count as at work. js/hub.js lights the stage's name by
 * it and the plain cloud lights its region by it, so that the two change together. (On the
 * graphics card a region takes its lit colour by degrees instead.)
 */
export const AT_WORK = 0.3;

const f = (number) => (Number.isInteger(number) ? `${number}.0` : String(number));
const vec3 = (v) => `vec3(${v.map(f).join(', ')})`;

export const VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aAt;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aLook; // how far up its fold it stands, its part, its region (-1 for none), a number of its own

uniform mat3 uTurn;    // the turn of the view: across, down, away
uniform vec3 uView;    // pixels to one unit of the brain, and where its middle lands, in CSS pixels
uniform vec2 uSize;    // the canvas, in CSS pixels
uniform float uRatio;  // device pixels to one CSS pixel
uniform float uFov;
uniform float uGrain;  // how wide a point is, in units of the brain
uniform float uTime;
uniform float uBorn;   // 0 as the brain starts to gather, 1 once it has
uniform float uQuiet;  // 1 as a rule; less while one part of the Hub is being shown
uniform float uFire;   // 1 while neurons fire by themselves; 0 with motion reduced
uniform vec4 uBusy;    // how busy each stage's region is, 0 to 1
uniform vec4 uWave;    // where a merged release landed, and how far its wave has spread
uniform float uSurge;  // how strong that wave still is
uniform vec3 uDeep;    // the colour of the dimmest tissue, and of brighter and brighter
uniform vec3 uTissue;
uniform vec3 uPale;
uniform vec3 uLit;     // the colour of a region with work in it
uniform vec3 uCleared; // the colour of the wave

out vec3 vLight;

void main() {
  float own = aLook.w;

  // Gathering: each point comes in from a little way off, in its own time.
  float come = clamp((uBorn - own * 0.55) / 0.45, 0.0, 1.0);
  float gathered = 1.0 - (1.0 - come) * (1.0 - come) * (1.0 - come);
  vec3 at = aAt + aNormal * (1.0 - gathered) * 0.3;

  vec3 p = uTurn * at;
  vec3 n = uTurn * aNormal;
  float near = uFov / (uFov + p.z);
  vec2 screen = uView.yz + p.xy * (uView.x * near);
  gl_Position = vec4(screen / uSize * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);

  // The form: lit from one side, rimmed where it turns away, the far wall faint behind the near one.
  float toward = -n.z;
  float square = max(abs(toward), ${f(LIGHT.limb)}); // edge on, many points share a pixel: each counts for less
  float shell = mix(${f(LIGHT.far)}, 1.0, smoothstep(-0.25, 0.35, toward));
  float rim = pow(1.0 - abs(toward), ${f(LIGHT.rimPower)});
  float form = ${f(LIGHT.ambient)} + ${f(LIGHT.keyed)} * max(0.0, dot(n, ${vec3(LIGHT.key)})) + ${f(LIGHT.filled)} * max(0.0, dot(n, ${vec3(LIGHT.fill)})) + ${f(LIGHT.rimmed)} * rim;
  float folded = mix(${f(LIGHT.groove)}, 1.0, aLook.x);
  float v = form * folded * shell * clamp(1.0 - p.z * 0.4, 0.5, 1.45);
  if (aLook.y > ${f(PART.stem - 0.5)}) v *= ${f(LIGHT.stem)};

  // Work in its region, and the wave of a merged release going over it.
  float busy = aLook.z < -0.5 ? 0.0 : uBusy[int(aLook.z + 0.5)];
  float off = distance(aAt, uWave.xyz) - uWave.w;
  float surge = exp(-off * off / (off > 0.0 ? 0.012 : 0.06)) * uSurge;

  // One point in fourteen is a neuron that fires now and then: a quick flash, in its own time.
  float beat = fract(uTime * (0.05 + 0.09 * fract(own * 7.31)) + own * 37.0);
  float fire = uFire * step(0.93, fract(own * 3.17)) * smoothstep(0.0, 0.015, beat) * (1.0 - smoothstep(0.02, 0.07, beat));

  vec3 colour = mix(uDeep, uTissue, smoothstep(0.0, 0.5, v));
  colour = mix(colour, uPale, smoothstep(0.45, 1.5, v));
  colour = mix(colour, uLit, min(1.0, busy * 0.75));
  colour = mix(colour, uCleared, min(1.0, surge * 1.2));
  colour = mix(colour, vec3(1.0), fire * 0.75);
  float light = v * (1.0 + ${f(LIGHT.worked)} * busy + ${f(LIGHT.surged)} * surge) + fire * 1.1;

  // Sharpest a little in front of the middle; further from there a point spreads, and the same light over more of the screen is fainter.
  float blur = abs(p.z + 0.3) * 0.5;
  float size = uView.x * uGrain * near * (1.0 + blur) * (1.0 + 1.2 * fire + 0.45 * surge);
  gl_PointSize = max(size, 1.1) * uRatio;
  vLight = colour * light * (${f(LIGHT.gain)} * square * uQuiet * gathered) / ((1.0 + blur) * (1.0 + blur));
}
`;

export const FRAGMENT = `#version 300 es
precision mediump float;

in vec3 vLight;
out vec4 colour;

void main() {
  // A round point, soft at its edge. Light adds to light, so what is written is light alone.
  float out_ = length(gl_PointCoord - 0.5) * 2.0;
  vec3 lit = vLight * smoothstep(1.0, 0.2, out_);
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
  'uTissue',
  'uPale',
  'uLit',
  'uCleared',
]);

/** How many numbers each point is packed into for the graphics card: where it is, the way it faces, and its look. */
const PACKED = 10;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`The brain's shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * The brain on the graphics card.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ count: number, at: Float32Array, normal: Float32Array, fold: Float32Array, part: Uint8Array, own: Float32Array }} brain  from `buildCortex`
 * @param {Int8Array} owner  the region each point belongs to, from `regionOfPoints`
 * @param {{ deep: number[], tissue: number[], pale: number[], lit: number[], cleared: number[] }} colours  each red, green, blue from 0 to 255
 * @param {() => void} [onChange]  called when the graphics card has taken the context away, and
 *   again when the cloud has built itself on a context that is back. What was on the canvas is
 *   gone both times: a caller that draws only when something has changed must draw again.
 * @returns the cloud, or null when this browser has no WebGL2 (the caller draws the lighter cloud instead)
 * @throws if WebGL2 is there but the shader cannot be built
 */
export function createCloud(canvas, brain, owner, colours, onChange = () => {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;

  const packed = new Float32Array(brain.count * PACKED);
  for (let i = 0; i < brain.count; i += 1) {
    const to = i * PACKED;
    for (let k = 0; k < 3; k += 1) {
      packed[to + k] = brain.at[i * 3 + k];
      packed[to + 3 + k] = brain.normal[i * 3 + k];
    }
    packed[to + 6] = brain.fold[i];
    packed[to + 7] = brain.part[i];
    packed[to + 8] = owner[i];
    packed[to + 9] = brain.own[i];
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
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`The brain's shader failed to link: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);

    uniforms = {};
    for (const name of UNIFORMS) {
      const where = gl.getUniformLocation(program, name);
      // A uniform nothing uses is dropped by the compiler, and setting it then does nothing, silently.
      if (where === null) throw new Error(`The brain's shader makes no use of ${name}.`);
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

    // Light adds to light: no point hides another, so there is no depth to keep.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(0, 0, 0, 0);

    gl.uniform1f(uniforms.uFov, FOV);
    gl.uniform1f(uniforms.uGrain, Math.sqrt(GRAIN / brain.count));
    for (const [name, colour] of [
      ['uDeep', colours.deep],
      ['uTissue', colours.tissue],
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
    /** False while the graphics card has taken the context away: the caller draws the lighter cloud until it is back. */
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

    /** Wipe the canvas: for a frame the lighter cloud is drawing instead. */
    clear() {
      if (lost) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    /**
     * @param {object} now
     * @param {{ yaw: number, pitch: number, scale: number, x: number, y: number }} now.view
     * @param {number} now.time    seconds, for the neurons that fire by themselves
     * @param {number} now.born    0 as the brain starts to gather, 1 once it has
     * @param {number} now.quiet   1 as a rule; less while one part of the Hub is being shown
     * @param {boolean} now.fire   whether neurons fire by themselves
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
      gl.drawArrays(gl.POINTS, 0, brain.count);
    },
  };
}

// ----- the lighter cloud: a plain canvas, point by point -----

const smooth = (low, high, value) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** The brightness a point is put in a pile by, and how bright each pile is drawn. */
const PILES = Object.freeze({ over: [0.22, 0.4, 0.62], alpha: [0.15, 0.32, 0.68, 1] });

/**
 * The brain drawn on a plain canvas: a cloud light enough to draw point by point, lit by the
 * same rules as the shader. Each point goes into one of a few piles by its colour and its
 * brightness, so that the colour is set a few times a frame and not thousands.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ count: number, at: Float32Array, normal: Float32Array, fold: Float32Array, part: Uint8Array }} brain
 * @param {Int8Array} owner
 * @param {{ tissue: number[], lit: number[], cleared: number[] }} colours
 * @param {{ view: object, quiet: number, busy: number[], wave: { from: number[], radius: number, strength: number } | null }} now
 */
export function createLiteCloud(brain, owner, colours) {
  const families = [colours.tissue, colours.lit, colours.cleared];
  const piles = Array.from({ length: families.length * PILES.alpha.length }, () => []);
  const rows = new Float32Array(9);
  const P = [0, 0, 0, 0];

  return function drawLite(ctx, { view, quiet, busy, wave }) {
    for (const pile of piles) pile.length = 0;
    turning(view, rows);
    const size = Math.max(1.3, view.scale / 150);
    for (let i = 0; i < brain.count; i += 1) {
      const x = brain.at[i * 3];
      const y = brain.at[i * 3 + 1];
      const z = brain.at[i * 3 + 2];
      const nx = brain.normal[i * 3];
      const ny = brain.normal[i * 3 + 1];
      const nz = brain.normal[i * 3 + 2];
      project(x, y, z, view, P);
      const across = rows[0] * nx + rows[1] * ny + rows[2] * nz;
      const down = rows[3] * nx + rows[4] * ny + rows[5] * nz;
      const away = rows[6] * nx + rows[7] * ny + rows[8] * nz;
      const toward = -away;
      const shell = LIGHT.far + (1 - LIGHT.far) * smooth(-0.25, 0.35, toward);
      const rim = (1 - Math.abs(toward)) ** LIGHT.rimPower;
      const key = Math.max(0, across * LIGHT.key[0] + down * LIGHT.key[1] + away * LIGHT.key[2]);
      const fill = Math.max(0, across * LIGHT.fill[0] + down * LIGHT.fill[1] + away * LIGHT.fill[2]);
      let v = (LIGHT.ambient + LIGHT.keyed * key + LIGHT.filled * fill + LIGHT.rimmed * rim) * (LIGHT.groove + (1 - LIGHT.groove) * brain.fold[i]) * shell;
      v *= Math.max(Math.abs(toward), LIGHT.limb);
      v *= Math.min(1.45, Math.max(0.5, 1 - P[3] * 0.4));
      if (brain.part[i] === PART.stem) v *= LIGHT.stem;
      let family = 0;
      const region = owner[i];
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
      v *= quiet;
      const pile = v > PILES.over[2] ? 3 : v > PILES.over[1] ? 2 : v > PILES.over[0] ? 1 : 0;
      piles[family * PILES.alpha.length + pile].push(P[0], P[1], P[2]);
    }
    piles.forEach((pile, k) => {
      if (pile.length === 0) return;
      const [r, g, b] = families[Math.floor(k / PILES.alpha.length)];
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${r},${g},${b},${PILES.alpha[k % PILES.alpha.length]})`;
      for (let n = 0; n < pile.length; n += 3) {
        const s = size * pile[n + 2];
        ctx.fillRect(pile[n] - s / 2, pile[n + 1] - s / 2, s, s);
      }
    });
  };
}
