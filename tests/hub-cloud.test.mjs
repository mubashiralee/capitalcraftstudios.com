// The Hub's mind as light (js/hub-cloud.js): the shader the graphics card runs, what it is
// handed, and the plainer picture drawn on a plain canvas where there is no WebGL2.
//
// No graphics card here: the card is stood in for by one that writes down what it is asked.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ORCHESTRATOR, PART, PLAN, PULSE, SPARE, buildMind, constellation, project, regionOfPoints, seeded } from '../js/cortex.js';
import { AT_WORK, FRAGMENT, GRAIN, LIGHT, PACKED, UNIFORMS, VERTEX, createCloud, createLiteCloud } from '../js/hub-cloud.js';

const mind = buildMind();
const owner = regionOfPoints(mind);
const { nodes, threads } = constellation();
const COLOURS = { deep: [20, 40, 90], dust: [100, 150, 220], pale: [230, 240, 255], lit: [143, 211, 232], cleared: [98, 219, 160] };
const VIEW = { yaw: 0.55, pitch: 0.24, scale: 240, x: 400, y: 300 };
const number = (value) => (Number.isInteger(value) ? `${value}.0` : String(value));
const countOf = (kind) => mind.part.reduce((sum, part) => sum + (part === kind ? 1 : 0), 0);

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

test('each point is handed over as where it is, the way it faces, its look and how it grows and signals, in the places the shader reads them', () => {
  assert.match(VERTEX, /layout\(location = 0\) in vec3 aAt;/);
  assert.match(VERTEX, /layout\(location = 1\) in vec3 aNormal;/);
  assert.match(VERTEX, /layout\(location = 2\) in vec4 aLook;/);
  assert.match(VERTEX, /layout\(location = 3\) in vec4 aGrown;/);
  const { canvas, calls } = fakeCard();
  createCloud(canvas, mind, owner, COLOURS);
  const [, packed] = calls.find(([name]) => name === 'bufferData');
  assert.equal(PACKED, 14);
  assert.equal(packed.length, mind.count * PACKED);
  // A grain of the glass, a point of a thread and a node among them: a thread's numbers are not all nothing.
  const onThread = mind.part.indexOf(PART.thread) + 5;
  const aNode = mind.part.indexOf(PART.node) + 2 * 40;
  assert.deepEqual([mind.part[0], mind.part[onThread], mind.part[aNode]], [PART.glass, PART.thread, PART.node]);
  for (const i of [0, 1, onThread, aNode, mind.count - 1]) {
    const at = i * PACKED;
    assert.deepEqual([...packed.slice(at, at + 3)], [...mind.at.slice(i * 3, i * 3 + 3)], `point ${i}: where it is`);
    assert.deepEqual([...packed.slice(at + 3, at + 6)], [...mind.normal.slice(i * 3, i * 3 + 3)], `point ${i}: the way it faces`);
    assert.deepEqual([...packed.slice(at + 6, at + 10)], [mind.glow[i], mind.part[i], owner[i], mind.own[i]], `point ${i}: its look`);
    assert.deepEqual([...packed.slice(at + 10, at + 14)], [...mind.thread.slice(i * 3, i * 3 + 3), mind.born[i]], `point ${i}: its thread, and when it is born`);
  }
  assert.ok(packed[onThread * PACKED + 10] >= 0 && packed[onThread * PACKED + 12] > 0.1, 'a point of a thread is handed over as on none');
  assert.ok(packed[aNode * PACKED + 13] > 0, 'a node far from the orchestrator is handed over as born at once');
  const pointers = calls.filter(([name]) => name === 'pointer').map(([, index, size, , , stride, offset]) => [index, size, stride, offset]);
  assert.deepEqual(pointers, [[0, 3, 56, 0], [1, 3, 56, 12], [2, 4, 56, 24], [3, 4, 56, 40]]);
  assert.deepEqual(calls.filter(([name]) => name === 'enable').map(([, index]) => index), [0, 1, 2, 3]);
  // Light adds to light: no point hides another.
  assert.ok(calls.some(([name, a, b]) => name === 'blend' && a === 10 && b === 10), 'the points do not add');
});

test('the light is one set of numbers: the shader is written from the same ones the plain picture uses', () => {
  const squared = new Set(['front']); // the shader has this one already multiplied by itself
  for (const [name, value] of Object.entries(LIGHT)) {
    if (typeof value !== 'number') continue;
    const written = number(squared.has(name) ? value * value : value);
    assert.ok(VERTEX.includes(written), `the shader does not use LIGHT.${name} (${written})`);
  }
  assert.ok(Math.abs(Math.hypot(...LIGHT.sheenFaces) - 1) < 1e-12, 'the way the glass faces where the lamp shows is not a direction');
  assert.ok(VERTEX.includes(`vec3(${LIGHT.sheenFaces.map(number).join(', ')})`), 'the shader has a lamp of its own');
  // The lamp is over the viewer's left shoulder: its light shows high on the near side of the glass, to the left.
  assert.ok(LIGHT.sheenFaces[0] < 0 && LIGHT.sheenFaces[1] < 0 && LIGHT.sheenFaces[2] < 0, `the lamp shows where the glass faces ${LIGHT.sheenFaces}`);
  // The signals run at the speed, and as often, as the numbers say (js/cortex.js).
  assert.ok(VERTEX.includes(`fract(uTime / ${number(PULSE.every)}) * ${number(PULSE.every)}`) && VERTEX.includes(`* ${number(PULSE.speed)} -`), 'the shader times its signals by its own numbers');
  // And it knows each part by the number the cloud gives it.
  for (const [name, part] of Object.entries(PART)) {
    assert.ok(VERTEX.includes(`(step(${number(part - 0.5)}, aLook.y) - step(${number(part + 0.5)}, aLook.y))`), `the shader does not know which points are part of a ${name}`);
  }
});

test('a frame sets every uniform, turned the way the card wants, and draws every point once', () => {
  const { canvas, calls, set } = fakeCard();
  const cloud = createCloud(canvas, mind, owner, COLOURS);
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
  assert.deepEqual(calls.filter(([name]) => name === 'draw'), [['draw', 12, 0, mind.count]]);
  assert.deepEqual(calls.findLast(([name]) => name === 'viewport'), ['viewport', 0, 0, 1600, 1200]);

  cloud.draw({ view: VIEW, time: 3, born: 1, quiet: 1, fire: false, busy: [0, 0, 0, 0], wave: null });
  assert.deepEqual([set.get('uSurge'), set.get('uFire')], [[0], [0]], 'with no wave and no firing, the last ones must not linger');
});

test('a cloud of fewer points is drawn with wider ones, so that its glass and its threads are as bright, and its nodes are the same size', () => {
  const sized = (cloud) => {
    const { canvas, set } = fakeCard();
    const made = createCloud(canvas, cloud, regionOfPoints(cloud), COLOURS);
    made.size(800, 600, 1);
    made.draw({ view: VIEW, time: 0, born: 1, quiet: 1, fire: false, busy: [0, 0, 0, 0], wave: null });
    return set.get('uGrain')[0];
  };
  const fine = buildMind(undefined, 4);
  const few = sized(mind);
  const more = sized(fine);
  // What the points cover between them is their number times the square of their width: the same for both.
  const covered = (grain, count) => grain * grain * count;
  assert.ok(few > more * 1.8, `a cloud a quarter the size has points ${few / more} times as wide`);
  assert.ok(Math.abs(covered(few, mind.count) / covered(more, fine.count) - 1) < 1e-6, 'the two clouds do not cover the same');
  assert.ok(Math.abs(covered(few, mind.count) - GRAIN) < 1e-6, 'the points do not cover what GRAIN says they should');
  // A node is one point in a cloud of any size: its width is its own, and not the grain's.
  assert.ok(VERTEX.includes(`float wide = uGrain * (isThread + isGlass * ${number(LIGHT.dustWide)} + isMote * ${number(LIGHT.moteWide)}) + (isNode * ${number(LIGHT.nodeWide)} + isHalo * ${number(LIGHT.haloWide)}) * aLook.x;`), 'a node is as wide as the grain says, so it would swell in a cloud of fewer points');
  assert.ok(LIGHT.haloWide > LIGHT.nodeWide * 3, 'the glow round a node is no wider than the node');
});

test('a signal is a small bead of light with a faint glow behind it, and the glow has gone before the time starts again', () => {
  // A bead, not a streak: it is no longer than a small node is wide, and wider than its thread.
  assert.ok(LIGHT.front < LIGHT.nodeWide && LIGHT.bead > 0.5, `the bead is ${LIGHT.front} long and ${LIGHT.bead} wider than its thread`);
  assert.ok(VERTEX.includes(`float bead = uFire * isThread * exp(-behind * behind / ${number(LIGHT.front * LIGHT.front)});`), 'the bead is not the length LIGHT.front says');
  // The glow behind it is far fainter than the bead, and trails many times its length.
  assert.ok(LIGHT.trailed < LIGHT.pulsed / 2 && LIGHT.tail > LIGHT.front * 8, `the glow is ${LIGHT.trailed} against the bead's ${LIGHT.pulsed}, and ${LIGHT.tail} long`);
  assert.ok(VERTEX.includes(`* exp(-max(behind, 0.0) / ${number(LIGHT.tail)});`), 'the glow does not die away over LIGHT.tail');
  assert.ok(/float trail = uFire \* isThread \* smoothstep\(-[\d.]+, [\d.]+, behind\)/.test(VERTEX), 'there is a glow ahead of the bead');
  // With motion reduced nothing runs: both are switched off with uFire.
  assert.ok(/float bead = uFire \*/.test(VERTEX) && /float trail = uFire \*/.test(VERTEX));
  // The bead is white and the glow the colour of the brightest thread, never the colour a region takes when it has work in it.
  assert.ok(VERTEX.includes('colour = mix(colour, uPale, min(1.0, trail * 0.7));') && !/mix\(colour, uLit, [^;]*(trail|bead)/.test(VERTEX), 'a signal is drawn in the colour of work');
  // Only the bead widens its thread.
  assert.ok(VERTEX.includes(`(1.0 + ${number(LIGHT.bead)} * bead + `) && !/\* trail \+ 0\.45 \* surge/.test(VERTEX));
  // Where a thread's signal ends, what is left of its glow when the time starts again is too faint to be seen go out.
  for (const plan of [PLAN, SPARE]) {
    for (const thread of constellation(plan).threads) {
      const behind = (PULSE.every - thread.when) * PULSE.speed - thread.long; // how far past the thread's far end the bead would be by then
      assert.ok(Math.exp(-behind / LIGHT.tail) < 0.01, `a thread's glow is still ${Math.exp(-behind / LIGHT.tail)} of itself when the time starts again`);
    }
  }
});

/** A plain canvas that writes down what is drawn on it: grains, lines and discs. */
function fakeCanvas() {
  const dust = [];
  const lines = [];
  const discs = [];
  let path = { segments: [], arcs: [], at: null };
  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    fillRect: (x, y, w, h) => dust.push({ style: ctx.fillStyle, x: x + w / 2, y: y + h / 2, size: w }),
    beginPath: () => { path = { segments: [], arcs: [], at: null }; },
    moveTo: (x, y) => { path.at = [x, y]; },
    lineTo: (x, y) => { path.segments.push([...path.at, x, y]); path.at = [x, y]; },
    arc: (x, y, radius) => { path.arcs.push([x, y, radius]); },
    stroke: () => { for (const [x1, y1, x2, y2] of path.segments) lines.push({ style: ctx.strokeStyle, x: (x1 + x2) / 2, y: (y1 + y2) / 2, size: ctx.lineWidth, long: Math.hypot(x2 - x1, y2 - y1) }); },
    fill: () => { for (const [x, y, radius] of path.arcs) discs.push({ style: ctx.fillStyle, x, y, size: radius * 2 }); },
  };
  return { ctx, dust, lines, discs, all: () => [...dust, ...lines, ...discs] };
}
const rgbOf = (colour) => `rgba(${colour.join(',')},`;
const alphaOf = (thing) => Number(thing.style.match(/,([\d.]+)\)$/)[1]);
const light = (things) => things.reduce((sum, thing) => sum + alphaOf(thing), 0);
const inColour = (things, colour) => things.filter((thing) => thing.style.startsWith(rgbOf(colour))).length;
const REST = { view: VIEW, quiet: 1, busy: [0, 0, 0, 0], wave: null };
const picture = (now = {}) => {
  const canvas = fakeCanvas();
  createLiteCloud(mind, owner, COLOURS)(canvas.ctx, { ...REST, ...now });
  return canvas;
};
/** Which of the plan's threads and nodes lie in a region. */
const middles = new Float32Array(threads.flatMap((thread) => [0, 1, 2].map((k) => (nodes[thread.from].at[k] + nodes[thread.to].at[k]) / 2)));
const threadsIn = (region) => regionOfPoints({ count: threads.length, at: middles }).filter((each) => each === region).length;
const nodesIn = (region) => owner.filter((each, i) => each === region && mind.part[i] === PART.node).length;

test('the glass is faint where it faces the eye and bright at its edge: it reads as glass, and not as a solid', () => {
  assert.ok(LIGHT.rimmed > LIGHT.glass * 6, `the edge of the glass is ${LIGHT.rimmed} and its face ${LIGHT.glass}`);
  assert.ok(VERTEX.includes(`(${number(LIGHT.glass)} + ${number(LIGHT.rimmed)} * rim)`) && /float v = isGlass \* glass/.test(VERTEX), 'the shader works out the edge of the glass and then does not use it');
  // The plain picture, by the same rule: one grain of glass, turned each way.
  const grain = (normal) => {
    const one = { count: 1, at: new Float32Array([0, 0, 0]), normal: new Float32Array(normal), glow: new Float32Array([1]), part: new Uint8Array([PART.glass]) };
    const { ctx, dust } = fakeCanvas();
    createLiteCloud(one, new Int8Array([-1]), COLOURS)(ctx, { ...REST, view: { ...VIEW, yaw: 0, pitch: 0 } });
    assert.equal(dust.length, 1);
    return alphaOf(dust[0]);
  };
  const facing = grain([0, 0, -1]);
  const edge = grain([1, 0, 0]);
  assert.ok(edge > facing * 2, `a grain at the edge of the glass is drawn at ${edge}, one facing the eye at ${facing}`);
  // And one where the lamp shows is as bright as any, though it faces the eye.
  assert.ok(grain(LIGHT.sheenFaces) > facing * 2, 'the lamp leaves no light on the glass');
});

test('a browser with no WebGL2 gets no cloud, and says so by handing back nothing', () => {
  assert.equal(createCloud({ getContext: () => null }, mind, owner, COLOURS), null);
});

test('a shader the card will not build, or one that makes no use of a uniform, fails loudly', () => {
  assert.throws(() => createCloud(fakeCard({ compiles: false }).canvas, mind, owner, COLOURS), /failed to compile: ERROR: 0:12/);
  assert.throws(() => createCloud(fakeCard({ drops: 'uQuiet' }).canvas, mind, owner, COLOURS), /makes no use of uQuiet/);
});

test('when the card takes the context away the cloud stops drawing, and builds itself again when it is back', () => {
  const { canvas, calls, heard } = fakeCard();
  const cloud = createCloud(canvas, mind, owner, COLOURS);
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
  // (motion reduced) has to be told, or the mind is missing until the visitor touches it.
  const { canvas, heard } = fakeCard();
  const told = []; // whether the cloud could be drawn with, each time the page was told
  const cloud = createCloud(canvas, mind, owner, COLOURS, () => told.push(cloud.ready));
  assert.deepEqual(told, [], 'the page is told of a change before there has been one');
  heard.webglcontextlost({ preventDefault() {} });
  assert.deepEqual(told, [false], 'a lost context: the page must be told once, and after the cloud has stopped drawing');
  heard.webglcontextrestored();
  assert.deepEqual(told, [false, true], 'a context that is back: the page must be told once, and after the cloud has built itself again');
});

test('the plain picture draws the glass and the motes grain by grain, every thread as one line and every node as one disc with its glow, all inside the picture', () => {
  const { dust, lines, discs, all } = picture();
  assert.equal(dust.length, countOf(PART.glass) + countOf(PART.mote));
  assert.equal(lines.length, threads.length);
  assert.equal(discs.length, 2 * nodes.length, 'a node is not one disc and one glow');
  for (const thing of all()) {
    assert.ok(Math.abs(thing.x - VIEW.x) < VIEW.scale * 1.3 && Math.abs(thing.y - VIEW.y) < VIEW.scale * 1.3, `something is drawn at ${thing.x}, ${thing.y}`);
    // A grain, a thread or a node narrower than a pixel is smeared over its neighbours and goes faint.
    assert.ok(thing.size >= 1, `something is drawn ${thing.size} wide`);
  }
  // On a phone the picture is smaller, and still nothing in it is narrower than a pixel.
  for (const thing of picture({ view: { ...VIEW, scale: 110 } }).all()) assert.ok(thing.size >= 1, `on a small screen something is drawn ${thing.size} wide`);
  // A thread is as long as its two nodes are apart on the screen: the longest is a good part of the dome, and none is longer than it.
  const longest = Math.max(...lines.map((line) => line.long));
  assert.ok(longest > VIEW.scale * 0.15 && longest < VIEW.scale * 0.5, `the longest thread is drawn ${longest} long`);
  // At rest the glass and the threads are the colour of the dim light, and the nodes of the bright.
  assert.equal(inColour([...dust, ...lines], COLOURS.dust), dust.length + lines.length);
  assert.equal(inColour(discs, COLOURS.pale), discs.length);
  assert.ok(new Set(dust.map((grain) => grain.style)).size >= 3, 'every grain of the glass is as bright as every other: the dome has no form');
  assert.ok(new Set(lines.map((line) => line.style)).size >= 2, 'every thread is as bright as every other: the constellation has no depth');
  // The glows are drawn first and the lights over them: each light has one glow round it, wider and fainter.
  const glows = discs.slice(0, nodes.length);
  const lights = discs.slice(nodes.length);
  assert.ok(light(glows) < light(lights) / 3, 'the glow round the nodes is as bright as the nodes');
  for (const each of lights) {
    const round = glows.filter((glow) => Math.abs(glow.x - each.x) < 1e-9 && Math.abs(glow.y - each.y) < 1e-9);
    assert.equal(round.length, 1, `the light at ${each.x}, ${each.y} has ${round.length} glows`);
    assert.ok(round[0].size > each.size * 1.3 && alphaOf(round[0]) < alphaOf(each), `the glow at ${each.x}, ${each.y} is not a glow`);
  }
  // A larger node is drawn larger: the orchestrator's is the largest of all, and it is where the orchestrator is.
  const largest = lights.reduce((most, each) => (each.size > most.size ? each : most));
  const [x, y, near] = project(...ORCHESTRATOR, VIEW);
  // On the card a node's light fades toward its edge. A flat disc of the same width would look larger, so it is drawn narrower: but not by half.
  const onCard = LIGHT.nodeWide * PLAN.orchestrator * VIEW.scale * near;
  assert.ok(largest.size < onCard * 0.85 && largest.size > onCard * 0.6, `the orchestrator's disc is ${largest.size} wide, and its light on the card ${onCard}`);
  // (The cloud keeps where its points are in single precision: the two agree to a thousandth of a pixel, not to the last digit.)
  assert.ok(Math.abs(largest.x - x) < 1e-3 && Math.abs(largest.y - y) < 1e-3, `the largest light is at ${largest.x}, ${largest.y}, and the orchestrator at ${x}, ${y}`);
});

test('the plain picture draws the constellation its cloud was built from: the sparer one for a small picture', () => {
  const small = buildMind(seeded(42), 1, SPARE);
  const spare = constellation(SPARE);
  const canvas = fakeCanvas();
  createLiteCloud(small, regionOfPoints(small), COLOURS)(canvas.ctx, REST);
  assert.equal(canvas.lines.length, spare.threads.length, 'the threads drawn are not the threads of the cloud');
  assert.equal(canvas.discs.length, 2 * spare.nodes.length, 'the nodes drawn are not the nodes of the cloud');
  assert.ok(spare.threads.length < threads.length, 'the sparer constellation is no sparer');
});

test('the plain picture lights the constellation in a busy region and nowhere else, never the glass, and a wave in the colour of a cleared release', () => {
  const busy = picture({ busy: [0, 1, 0, 0] });
  assert.equal(inColour(busy.dust, COLOURS.lit), 0, 'the glass is lit by the work');
  assert.equal(inColour(busy.lines, COLOURS.lit), threadsIn(1), 'the lit threads are not the threads of the busy region');
  assert.equal(inColour(busy.discs, COLOURS.lit), 2 * nodesIn(1), 'the lit nodes are not the nodes of the busy region');
  assert.ok(threadsIn(1) > 3 && nodesIn(1) > 1, `the busy region holds ${threadsIn(1)} threads and ${nodesIn(1)} nodes`);
  // And they are brighter for the work, not only another colour.
  assert.ok(light(busy.all()) > light(picture().all()), 'a region with work in it is no brighter than one without');

  const waved = picture({ wave: { from: [0.3, -0.2, 0.5], radius: 0.4, strength: 1 } });
  const cleared = inColour(waved.all(), COLOURS.cleared);
  assert.ok(cleared > 20 && cleared < waved.all().length / 2, `${cleared} things are in the wave`);
  for (const kind of ['dust', 'lines', 'discs']) assert.ok(inColour(waved[kind], COLOURS.cleared) > 0, `the wave passes over the ${kind} and leaves them as they were`);
});

test('the plain picture does not light a region for the trace of work that is left as it empties', () => {
  // How busy a region is dies away and never quite reaches nothing: a trace must not colour it.
  const { lines, discs } = picture({ busy: [0.001, 0.9, 0.001, 0.001] });
  assert.equal(inColour(lines, COLOURS.lit), threadsIn(1), 'regions with only a trace of work in them are lit');
  assert.equal(inColour(discs, COLOURS.lit), 2 * nodesIn(1), 'regions with only a trace of work in them are lit');
});

test('the plain picture lights a region by the rule the page lights its name by, and is brighter for any work at all', () => {
  assert.ok(AT_WORK > 0.05 && AT_WORK < 0.55, `a region with one job in it settles at 0.55: it must count as at work, and a trace must not (AT_WORK is ${AT_WORK})`);
  // Just short of at work, and just over: only the second is lit.
  const two = picture({ busy: [AT_WORK - 0.01, 0, AT_WORK + 0.01, 0] });
  assert.equal(inColour(two.lines, COLOURS.lit), threadsIn(2), 'a region is lit by another rule than its name is');
  assert.equal(inColour(two.discs, COLOURS.lit), 2 * nodesIn(2), 'a region is lit by another rule than its name is');
  // Short of at work a region keeps its colours, and is the brighter for what work it has: as on the card, by degrees.
  const some = picture({ busy: [AT_WORK - 0.01, 0, 0, 0] });
  assert.equal(inColour(some.all(), COLOURS.lit), 0);
  assert.ok(light(some.all()) > light(picture().all()), 'a region with some work in it is no brighter than one with none');
});

test('the plain picture dims as a whole while one part is being shown, and keeps its form', () => {
  const full = picture();
  const quiet = picture({ quiet: 0.45 });
  for (const kind of ['dust', 'lines', 'discs']) {
    const share = light(quiet[kind]) / light(full[kind]);
    assert.ok(Math.abs(share - 0.45) < 0.02, `dimmed to 0.45, the ${kind} are drawn at ${share} of their light`);
  }
  assert.ok(new Set(quiet.dust.map((grain) => grain.style)).size >= 3, 'dimmed, the dome loses its form');
  assert.equal(light(picture({ quiet: 0 }).all()), 0, 'a picture that is not there yet is drawn');
});
