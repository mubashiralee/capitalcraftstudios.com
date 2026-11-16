// The Hub's brain as light (js/hub-cloud.js): the shader the graphics card runs, what it is
// handed, and the lighter cloud drawn on a plain canvas where there is no WebGL2.
//
// No graphics card here: the card is stood in for by one that writes down what it is asked.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PART, buildCortex, regionOfPoints } from '../js/cortex.js';
import { AT_WORK, FRAGMENT, GRAIN, LIGHT, UNIFORMS, VERTEX, createCloud, createLiteCloud } from '../js/hub-cloud.js';

const brain = buildCortex();
const owner = regionOfPoints(brain);
const COLOURS = { deep: [20, 40, 90], tissue: [100, 150, 220], pale: [230, 240, 255], lit: [143, 211, 232], cleared: [98, 219, 160] };
const VIEW = { yaw: 0.55, pitch: 0.24, scale: 240, x: 400, y: 300 };

/** A graphics card that does nothing but write down what it is asked. */
function fakeCard({ compiles = true, drops = null } = {}) {
  const calls = [];
  const set = new Map(); // uniform name -> the numbers it was last given
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6,
    FLOAT: 7, DEPTH_TEST: 8, BLEND: 9, ONE: 10, COLOR_BUFFER_BIT: 11, POINTS: 12,
    createShader: (type) => ({ type }),
    shaderSource: (shader, source) => { shader.source = source; },
    compileShader() {},
    getShaderParameter: () => compiles,
    getShaderInfoLog: () => 'ERROR: 0:12: something the card did not like',
    deleteShader() {},
    createProgram: () => ({ shaders: [] }),
    attachShader: (program, shader) => program.shaders.push(shader),
    linkProgram() {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    useProgram() {},
    getUniformLocation: (program, name) => (name === drops ? null : { name }),
    createVertexArray: () => ({}),
    bindVertexArray() {},
    createBuffer: () => ({}),
    bindBuffer() {},
    bufferData: (target, data) => calls.push(['bufferData', data]),
    enableVertexAttribArray: (index) => calls.push(['enable', index]),
    vertexAttribPointer: (...args) => calls.push(['pointer', ...args]),
    disable: (what) => calls.push(['disable', what]),
    enable: (what) => calls.push(['enableState', what]),
    blendFunc: (...args) => calls.push(['blend', ...args]),
    clearColor() {},
    viewport: (...args) => calls.push(['viewport', ...args]),
    clear: () => calls.push(['clear']),
    drawArrays: (...args) => calls.push(['draw', ...args]),
  };
  for (const kind of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f']) gl[kind] = (where, ...numbers) => set.set(where.name, numbers);
  gl.uniformMatrix3fv = (where, transpose, numbers) => set.set(where.name, [transpose, ...numbers]);
  const heard = {};
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind) => (kind === 'webgl2' ? gl : null),
    addEventListener: (name, listener) => { heard[name] = listener; },
  };
  return { canvas, gl, calls, set, heard };
}

/** The uniforms a shader declares, by name. */
const declared = (source) => new Map([...source.matchAll(/^\s*uniform\s+(\w+)\s+(\w+);/gm)].map((found) => [found[2], found[1]]));

test('both shaders say which language they are in, on their first line', () => {
  for (const source of [VERTEX, FRAGMENT]) assert.ok(source.startsWith('#version 300 es\n'), source.slice(0, 40));
});

test('the uniforms the shaders declare are exactly the ones the page sets, and each is put to use', () => {
  const inShaders = new Map([...declared(VERTEX), ...declared(FRAGMENT)]);
  assert.deepEqual([...inShaders.keys()].sort(), [...UNIFORMS].sort());
  assert.equal(new Set(UNIFORMS).size, UNIFORMS.length, 'a uniform is listed twice');
  for (const name of UNIFORMS) {
    const uses = (VERTEX + FRAGMENT).match(new RegExp(`\\b${name}\\b`, 'g')).length;
    assert.ok(uses >= 2, `${name} is declared and never used: the card would drop it`);
  }
});

test('each point is handed over as where it is, the way it faces and its look, in the places the shader reads them', () => {
  assert.match(VERTEX, /layout\(location = 0\) in vec3 aAt;/);
  assert.match(VERTEX, /layout\(location = 1\) in vec3 aNormal;/);
  assert.match(VERTEX, /layout\(location = 2\) in vec4 aLook;/);
  const { canvas, calls } = fakeCard();
  createCloud(canvas, brain, owner, COLOURS);
  const [, packed] = calls.find(([name]) => name === 'bufferData');
  assert.equal(packed.length, brain.count * 10);
  for (const i of [0, 1, 777, brain.count - 1]) {
    const at = i * 10;
    assert.deepEqual([...packed.slice(at, at + 3)], [...brain.at.slice(i * 3, i * 3 + 3)], `point ${i}: where it is`);
    assert.deepEqual([...packed.slice(at + 3, at + 6)], [...brain.normal.slice(i * 3, i * 3 + 3)], `point ${i}: the way it faces`);
    assert.deepEqual([...packed.slice(at + 6, at + 10)], [brain.fold[i], brain.part[i], owner[i], brain.own[i]], `point ${i}: its look`);
  }
  const pointers = calls.filter(([name]) => name === 'pointer').map(([, index, size, , , stride, offset]) => [index, size, stride, offset]);
  assert.deepEqual(pointers, [[0, 3, 40, 0], [1, 3, 40, 12], [2, 4, 40, 24]]);
  // Light adds to light: no point hides another.
  assert.ok(calls.some(([name, a, b]) => name === 'blend' && a === 10 && b === 10), 'the points do not add');
});

test('the light is one set of numbers: the shader is written from the same ones the plain cloud uses', () => {
  const number = (value) => (Number.isInteger(value) ? `${value}.0` : String(value));
  for (const name of ['ambient', 'keyed', 'filled', 'rimmed', 'rimPower', 'far', 'groove', 'stem', 'limb', 'gain', 'worked', 'surged']) {
    assert.ok(VERTEX.includes(number(LIGHT[name])), `the shader does not use LIGHT.${name} (${LIGHT[name]})`);
  }
  for (const lamp of [LIGHT.key, LIGHT.fill]) {
    assert.ok(Math.abs(Math.hypot(...lamp) - 1) < 1e-12, 'a lamp is a direction');
    assert.ok(VERTEX.includes(`vec3(${lamp.map(number).join(', ')})`), 'the shader has a lamp of its own');
  }
  assert.ok(LIGHT.key[1] < 0 && LIGHT.key[2] < 0, 'the main light is above and in front');
  assert.ok(VERTEX.includes(`aLook.y > ${number(PART.stem - 0.5)}`), 'the shader does not know which part is the brainstem');
});

test('a frame sets every uniform, turned the way the card wants, and draws every point once', () => {
  const { canvas, calls, set } = fakeCard();
  const cloud = createCloud(canvas, brain, owner, COLOURS);
  cloud.size(800, 600, 2);
  assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
  const wave = { from: [0.1, 0.2, 0.3], radius: 0.7, strength: 0.5 };
  cloud.draw({ view: VIEW, time: 3, born: 0.6, quiet: 0.45, fire: true, busy: [0.1, 0.2, 0.3, 0.4], wave });
  for (const name of UNIFORMS) assert.ok(set.has(name), `${name} was never set`);
  assert.deepEqual(set.get('uView'), [240, 400, 300]);
  assert.deepEqual(set.get('uSize'), [800, 600]);
  assert.deepEqual(set.get('uRatio'), [2]);
  assert.deepEqual(set.get('uBusy'), [0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual(set.get('uWave'), [0.1, 0.2, 0.3, 0.7]);
  assert.deepEqual([set.get('uSurge'), set.get('uQuiet'), set.get('uFire'), set.get('uBorn')], [[0.5], [0.45], [1], [0.6]]);
  assert.deepEqual(set.get('uLit'), COLOURS.lit.map((part) => part / 255));
  assert.equal(set.get('uTurn')[0], true, 'the turn is given a row at a time, so the card must be told to turn it over');
  assert.deepEqual(calls.filter(([name]) => name === 'draw'), [['draw', 12, 0, brain.count]]);
  assert.deepEqual(calls.findLast(([name]) => name === 'viewport'), ['viewport', 0, 0, 1600, 1200]);

  cloud.draw({ view: VIEW, time: 3, born: 1, quiet: 1, fire: false, busy: [0, 0, 0, 0], wave: null });
  assert.deepEqual([set.get('uSurge'), set.get('uFire')], [[0], [0]], 'with no wave and no firing, the last ones must not linger');
});

test('a cloud of fewer points is drawn with larger ones, so that the brain is as solid and as bright', () => {
  const sized = (cortex) => {
    const { canvas, set } = fakeCard();
    const cloud = createCloud(canvas, cortex, regionOfPoints(cortex), COLOURS);
    cloud.size(800, 600, 1);
    cloud.draw({ view: VIEW, time: 0, born: 1, quiet: 1, fire: false, busy: [0, 0, 0, 0], wave: null });
    return set.get('uGrain')[0];
  };
  const few = sized(brain);
  const more = sized(buildCortex(undefined, 4));
  // What the points cover between them is their number times the square of their size: the same for both.
  const covered = (grain, count) => grain * grain * count;
  assert.ok(few > more * 1.8, `a cloud a quarter the size has points ${few / more} times as large`);
  const many = buildCortex(undefined, 4).count;
  assert.ok(Math.abs(covered(few, brain.count) / covered(more, many) - 1) < 1e-9, 'the two clouds do not cover the same');
  assert.ok(Math.abs(covered(few, brain.count) - GRAIN) < 1e-6, 'the points do not cover what GRAIN says they should');
});

test('a patch of surface seen edge on is not brighter for the points piled up along it', () => {
  // The brain is drawn as light that adds. Where the surface turns away, many points land on few
  // pixels: each must count for less, or every edge is an outline and the brain a glass shell.
  assert.ok(LIGHT.limb > 0 && LIGHT.limb < 0.5, `LIGHT.limb is ${LIGHT.limb}`);
  assert.match(VERTEX, /float square = max\(abs\(toward\), [\d.]+\)/, 'the shader does not work out how squarely a point faces the eye');
  assert.match(VERTEX, /vLight = [^;]*\bsquare\b/, 'the shader works that out and then does not use it');
  // The plain cloud, by the same rule: a point facing the eye is drawn brighter than one seen edge on, all else equal.
  const one = (normal) => ({ count: 1, at: new Float32Array([0, 0, 0]), normal: new Float32Array(normal), fold: new Float32Array([1]), part: new Uint8Array([0]) });
  const bright = (normal) => {
    const { ctx, drawn } = fakeCanvas();
    createLiteCloud(one(normal), new Int8Array([-1]), COLOURS)(ctx, { view: { ...VIEW, yaw: 0, pitch: 0 }, quiet: 1, busy: [0, 0, 0, 0], wave: null });
    return Number(drawn[0].style.match(/,([\d.]+)\)$/)[1]);
  };
  const facing = bright([0, 0, -1]);
  // Turned almost side on, and full in the main light: by its light alone it is as bright as any point can be.
  const side = [LIGHT.key[0], LIGHT.key[1], 0];
  const length = Math.hypot(...side) / Math.cos(0.05);
  const edge = bright([side[0] / length, side[1] / length, -Math.sin(0.05)]);
  assert.ok(facing > edge * 2, `a point facing the eye is drawn at ${facing}, one in full light but seen edge on at ${edge}`);
});

test('a browser with no WebGL2 gets no cloud, and says so by handing back nothing', () => {
  assert.equal(createCloud({ getContext: () => null }, brain, owner, COLOURS), null);
});

test('a shader the card will not build, or one that makes no use of a uniform, fails loudly', () => {
  assert.throws(() => createCloud(fakeCard({ compiles: false }).canvas, brain, owner, COLOURS), /failed to compile: ERROR: 0:12/);
  assert.throws(() => createCloud(fakeCard({ drops: 'uQuiet' }).canvas, brain, owner, COLOURS), /makes no use of uQuiet/);
});

test('when the card takes the context away the cloud stops drawing, and builds itself again when it is back', () => {
  const { canvas, calls, heard } = fakeCard();
  const cloud = createCloud(canvas, brain, owner, COLOURS);
  const frame = { view: VIEW, time: 0, born: 1, quiet: 1, fire: false, busy: [0, 0, 0, 0], wave: null };
  assert.equal(cloud.ready, true);
  let asked = false;
  heard.webglcontextlost({ preventDefault: () => { asked = true; } });
  assert.ok(asked, 'the browser is not told that the cloud will be rebuilt');
  assert.equal(cloud.ready, false);
  cloud.draw(frame);
  cloud.clear();
  assert.equal(calls.filter(([name]) => name === 'draw' || name === 'clear').length, 0, 'it drew on a context it does not have');
  const built = calls.filter(([name]) => name === 'bufferData').length;
  heard.webglcontextrestored();
  assert.equal(cloud.ready, true);
  assert.equal(calls.filter(([name]) => name === 'bufferData').length, built + 1, 'the points were not handed over again');
  cloud.draw(frame);
  assert.equal(calls.filter(([name]) => name === 'draw').length, 1);
});

test('the page is told when the card takes the context away and when the cloud is back, each time once the cloud has dealt with it', () => {
  // What was on the canvas is gone both times. A page that draws only when something has changed
  // (motion reduced) has to be told, or the brain is missing until the visitor touches it.
  const { canvas, heard } = fakeCard();
  const told = []; // whether the cloud could be drawn with, each time the page was told
  const cloud = createCloud(canvas, brain, owner, COLOURS, () => told.push(cloud.ready));
  assert.deepEqual(told, [], 'the page is told of a change before there has been one');
  heard.webglcontextlost({ preventDefault() {} });
  assert.deepEqual(told, [false], 'a lost context: the page must be told once, and after the cloud has stopped drawing');
  heard.webglcontextrestored();
  assert.deepEqual(told, [false, true], 'a context that is back: the page must be told once, and after the cloud has built itself again');
});

/** A plain canvas that writes down what is drawn on it. */
function fakeCanvas() {
  const drawn = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    fillRect: (x, y, w, h) => drawn.push({ style: ctx.fillStyle, x: x + w / 2, y: y + h / 2, size: w }),
  };
  return { ctx, drawn };
}
const rgbOf = (colour) => `rgba(${colour.join(',')},`;

test('the plain cloud draws every point once, inside the picture, in the colour of plain tissue', () => {
  const draw = createLiteCloud(brain, owner, COLOURS);
  const { ctx, drawn } = fakeCanvas();
  draw(ctx, { view: VIEW, quiet: 1, busy: [0, 0, 0, 0], wave: null });
  assert.equal(drawn.length, brain.count);
  for (const point of drawn) {
    assert.ok(point.style.startsWith(rgbOf(COLOURS.tissue)), point.style);
    assert.ok(Math.abs(point.x - VIEW.x) < VIEW.scale * 1.3 && Math.abs(point.y - VIEW.y) < VIEW.scale * 1.3, `a point at ${point.x}, ${point.y}`);
    assert.ok(point.size >= 1, `a point ${point.size} wide`);
  }
  assert.ok(new Set(drawn.map((point) => point.style)).size >= 3, 'every point is as bright as every other: the brain has no form');
});

test('the plain cloud lights a busy region and no other, and a wave in the colour of a cleared release', () => {
  const draw = createLiteCloud(brain, owner, COLOURS);
  const busy = fakeCanvas();
  draw(busy.ctx, { view: VIEW, quiet: 1, busy: [0, 1, 0, 0], wave: null });
  const lit = busy.drawn.filter((point) => point.style.startsWith(rgbOf(COLOURS.lit))).length;
  assert.equal(lit, owner.filter((region) => region === 1).length, 'the lit points are not the points of the busy region');
  assert.ok(lit > 20);
  // And they are brighter for the work, not only another colour.
  const light = (canvas) => canvas.drawn.reduce((sum, point) => sum + Number(point.style.match(/,([\d.]+)\)$/)[1]), 0);
  const idle = fakeCanvas();
  draw(idle.ctx, { view: VIEW, quiet: 1, busy: [0, 0, 0, 0], wave: null });
  assert.ok(light(busy) > light(idle), 'a region with work in it is no brighter than one without');

  const waved = fakeCanvas();
  draw(waved.ctx, { view: VIEW, quiet: 1, busy: [0, 0, 0, 0], wave: { from: [0.3, -0.2, 0.7], radius: 0.4, strength: 1 } });
  const cleared = waved.drawn.filter((point) => point.style.startsWith(rgbOf(COLOURS.cleared))).length;
  assert.ok(cleared > 20 && cleared < brain.count / 2, `${cleared} points are in the wave`);
});

test('the plain cloud does not light a region for the trace of work that is left as it empties', () => {
  // How busy a region is dies away and never quite reaches nothing: a trace must not colour it.
  const draw = createLiteCloud(brain, owner, COLOURS);
  const { ctx, drawn } = fakeCanvas();
  draw(ctx, { view: VIEW, quiet: 1, busy: [0.001, 0.9, 0.001, 0.001], wave: null });
  const lit = drawn.filter((point) => point.style.startsWith(rgbOf(COLOURS.lit))).length;
  assert.equal(lit, owner.filter((region) => region === 1).length, 'regions with only a trace of work in them are lit');
});

test('the plain cloud lights a region by the rule the page lights its name by, and is brighter for any work at all', () => {
  const draw = createLiteCloud(brain, owner, COLOURS);
  const drawn = (busy) => {
    const canvas = fakeCanvas();
    draw(canvas.ctx, { view: VIEW, quiet: 1, busy, wave: null });
    return canvas.drawn;
  };
  const litIn = (points) => points.filter((point) => point.style.startsWith(rgbOf(COLOURS.lit))).length;
  const light = (points) => points.reduce((sum, point) => sum + Number(point.style.match(/,([\d.]+)\)$/)[1]), 0);
  const sizeOf = (wanted) => owner.filter((region) => region === wanted).length;

  assert.ok(AT_WORK > 0.05 && AT_WORK < 0.55, `a region with one job in it settles at 0.55: it must count as at work, and a trace must not (AT_WORK is ${AT_WORK})`);
  // Just short of at work, and just over: only the second is lit.
  assert.equal(litIn(drawn([AT_WORK - 0.01, 0, AT_WORK + 0.01, 0])), sizeOf(2), 'a region is lit by another rule than its name is');
  // Short of at work a region keeps the colour of plain tissue, and is the brighter for what work it has: as on the card, by degrees.
  const some = drawn([AT_WORK - 0.01, 0, 0, 0]);
  assert.equal(litIn(some), 0);
  assert.ok(light(some) > light(drawn([0, 0, 0, 0])), 'a region with some work in it is no brighter than one with none');
});

test('the plain cloud dims with the rest of the brain while one part is being shown', () => {
  const draw = createLiteCloud(brain, owner, COLOURS);
  const bright = (quiet) => {
    const { ctx, drawn } = fakeCanvas();
    draw(ctx, { view: VIEW, quiet, busy: [0, 0, 0, 0], wave: null });
    return drawn.reduce((sum, point) => sum + Number(point.style.match(/,([\d.]+)\)$/)[1]), 0);
  };
  assert.ok(bright(0.45) < bright(1) * 0.75, 'a quiet brain is as bright as a busy one');
});
