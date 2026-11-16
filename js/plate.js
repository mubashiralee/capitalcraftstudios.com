// The engraved plate.
//
// One WebGL2 fragment shader draws the whole medallion. There is no geometry:
// every pixel works out where its line of sight meets the tilted paper, then
// how far (in pixels) it is from the nearest engraved line, and inks itself.
// Because that distance comes from the pattern's own gradient, the lines stay
// hair-thin and sharp at any size, tilt or zoom.
//
// The plate is drawn by ten pens, each laying one unbroken line. js/film.js
// works out what those ten lines are; the shader here asks, for every pixel,
// which line passes nearest and how far along that line the pixel lies, and
// shows it once the line's pen has got that far. The shader's sums are the
// same as near() in js/film.js, which the tests check against walking the line.

import { STONE } from './drop.js';
import { PLATE } from './edition.js';
import { KIND, LINE, TIE, planFilm } from './film.js';
import { MARK_BOX } from './stamps.js';

export const CAMERA_DISTANCE = 6.5; // plate units; smaller = stronger perspective
/** How far the plate is laid back from face-on, in radians: on a wide screen and on a narrow one (about 56 and 48 degrees). */
export const TILT = Object.freeze({ wide: 0.97, narrow: 0.84 });
const LOUPE_SPREAD = 0.2; // plate units squared: how wide the loupe's swell is
export const SEAL_LIFT = STONE.thick; // plate units: how thick the seal's stone is, so how far its face stands off the paper
const STUDIO_HEIGHT = 1; // plate units above the paper: where the studio's strip light hangs
// Where the near edge of the strip light shows in the stone's face when the plate is at rest: a little above the mark.
const STRIP_REST = [0, 0.42 * PLATE.seal];

const glsl = (value) => (Number.isInteger(value) ? `${value}.0` : String(value));

const VERTEX = `#version 300 es
void main() {
  // One triangle that covers the whole canvas.
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

out vec4 fragColor;

uniform vec2 uAnchor;       // medallion centre, device px from the bottom-left
uniform float uScale;       // device px per plate unit
uniform float uDpr;         // device px per CSS px
uniform mat3 uBasis;        // the plate's axes as the camera sees them: columns U, V, N
uniform vec3 uLoupe;        // xy: centre on the plate, z: strength
uniform vec3 uLight;        // xy: device px, z: how present the light is (0..1)
uniform vec2 uLightPlate;   // where the light sits over the plate
uniform float uHair;        // hairline half-width, device px
uniform float uReveal;      // 0..1: how far through the film of the plate being drawn
uniform float uRate;        // how far uReveal moved since the frame before (negative while the film runs backwards)
uniform float uUV;          // 0 daylight .. 1 ultraviolet
uniform float uTime;        // seconds
uniform vec4 uTurn;         // slow rotation of: inner band, outer band, braid A, braid B
uniform vec2 uIris;         // direction the inks drift along, across the plate
uniform vec3 uRamp[5];      // the edition's five inks: a fan of hues the ten lines are mixed from
uniform ivec2 uKind;        // per band: 0 = two spirals, 1 = weave, 2 = lace
uniform vec4 uFam[8];
uniform vec4 uBraid[2];     // waves, strands, phase
uniform vec4 uOrbit[5];     // radius, lobes, amp, phase
uniform vec4 uSeal;         // the seal's stone: x a whole number its grain is dealt from, y 0..1 its tint
uniform vec2 uStudio;       // where the near edge of the studio's strip light hangs, over the plate
uniform vec2 uRepeat;       // how many times each inscription runs round its ring
uniform sampler2D uLegal;
uniform sampler2D uEditionText;
uniform sampler2D uMark;

// ---- The film ---------------------------------------------------------------
// Nothing on the plate appears at once. Ten pens draw it, each laying one
// unbroken line, the way a rose engine cuts a banknote plate. uReveal runs 0..1
// through the film. js/film.js decides what the ten lines are and when each
// pen sets off; these are its numbers.
uniform vec4 uLine[10];     // per line: when its pen sets off, 1 / how long it takes, its length in turns, its ink (0..1 along uRamp)
uniform vec4 uRule[9];      // per framing circle: where the pen joins it, which way round (+1 / -1), turns into its line, the line
uniform vec4 uTie[2];       // the ramp that joins each double rule: the same four numbers
uniform vec4 uBandA[2];     // each band's first line: the same four numbers
uniform vec4 uBandB[2];     // ... and its second
uniform vec4 uBraidLine[2]; // each braid's line: the same four numbers
uniform vec4 uLace[2];      // a laced band: rays, lean, inverse, zigzag
uniform vec3 uOrbitLine;    // the orbits' line: where it sets off, which way round, turns it takes to come down an orbit
uniform vec4 uTyped;        // the lettering is typed round its ring: legend start, length; edition number start, length
uniform mat3 uStone;        // the seal's stone, wherever its drop has it (js/drop.js): its own axes as the plate sees them
uniform vec4 uStoneAt;      // xyz: the middle of its underside, over the plate; w: 0 not there .. 1 wholly there
uniform float uGlint;       // 0..1: the light crossing the stone once it has settled

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;
const float CAM = ${glsl(CAMERA_DISTANCE)};

const float SEAL = ${glsl(PLATE.seal)};
const float SEAL_LIFT = ${glsl(SEAL_LIFT)};      // how thick the seal's stone is: its face stands this far off the paper
const float BEVEL = 0.06;          // the share of the face's radius that its polished, rounded edge takes
const float STUDIO = ${glsl(STUDIO_HEIGHT)};          // how high above the paper the studio's strip light hangs
const float LAMP = 0.16;           // ... and the lamp at the pointer
const float ROWS = 24.0;          // the rows the laser left across the frosted mark, and the box they fill
const vec2 MARK_HALF = vec2(${glsl(MARK_BOX.halfWidth)}, ${glsl(MARK_BOX.halfHeight)});

const int WEAVE = ${KIND.weave};
const int LACE = ${KIND.lace};
const float TIE = ${glsl(TIE)};            // turns a pen takes to step between the two circles of a double rule
const float WET = 0.3;             // turns of line still wet behind the pen
const float CUT = 0.0015;          // turns: softness of a line's fresh end
const float PAD = 0.02;            // turns a pen runs on past the end of its line, so a closed line shows no notch
const float LONGEST_TAIL = 0.25;   // turns: the longest streak a pen may trail
const float LEGAL0 = ${glsl(PLATE.inscription.inner)};
const float LEGAL1 = ${glsl(PLATE.inscription.outer)};
const float INNER0 = ${glsl(PLATE.inner.inner)};
const float INNER1 = ${glsl(PLATE.inner.outer)};
const float BRAID_A = ${glsl(PLATE.braidA.radius)};
const float BRAID_A_HALF = ${glsl(PLATE.braidA.half)};
const float EDITION0 = ${glsl(PLATE.edition.inner)};
const float EDITION1 = ${glsl(PLATE.edition.outer)};
const float OUTER0 = ${glsl(PLATE.outer.inner)};
const float OUTER1 = ${glsl(PLATE.outer.outer)};
const float BRAID_B = ${glsl(PLATE.braidB.radius)};
const float BRAID_B_HALF = ${glsl(PLATE.braidB.half)};
const float BRAID_ROOM = 0.006;    // plate units past a braid's edge that are still its own: room for the crests' full width

// Plain circles that frame the bands: radius, weight, and the band each turns with (-1: none).
const int RULES = 9;
const float RULE_AT[9] = float[9](
  ${glsl(PLATE.sealRing)}, ${glsl(PLATE.inscription.outer + 0.005)}, INNER0, INNER1,
  ${glsl(PLATE.edition.inner - 0.004)}, ${glsl(PLATE.edition.outer + 0.004)}, OUTER0, OUTER1, ${glsl(PLATE.rim)});
const float RULE_WEIGHT[9] = float[9](1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 2.4);
const int RULE_BAND[9] = int[9](-1, 0, 0, 0, -1, 1, 1, 1, -1);

// Under ultraviolet the same fan glows: five inks from aqua round to rose, all equally bright.
const vec3 UV_RAMP[5] = vec3[5](
  vec3(0.34, 0.90, 0.86), vec3(0.40, 0.72, 1.0), vec3(0.61, 0.60, 1.0), vec3(0.83, 0.56, 1.0), vec3(1.0, 0.56, 0.83));
const vec3 UV_HOT = vec3(1.0, 0.54, 0.30);

vec2 gDx;        // how far the plate point moves per device px, across
vec2 gDy;        // ... and up
vec2 gToLight;   // screen direction to the light; shrinks to nothing right under it
vec2 gShift;     // where a raised line's shadow falls, device px
float gNear;     // 1 right under the light, fading with distance
float gIris;     // 0..1 across the plate, along the direction the inks drift
vec4 gInk;       // ink laid so far (premultiplied)
float gShade;    // shadow laid so far
float gHalo;     // glow gathered under ultraviolet
float gSpark;    // glow gathered at the points of the pens
float gTone;     // how strongly the line in hand is inked (the orbits are fainter than the plate)
float gLine;     // the ink of the line in hand: 0..1 along the ramp
float gBlend;    // the ink a band's two lines blur into where they lie too close to tell apart (-1: not in a band)

// Coverage of a stroke of half-width h whose centre is d px away, averaged over one pixel.
float stroke(float d, float h) {
  float a = abs(d);
  return clamp(0.5 + h - a, 0.0, 1.0) - clamp(0.5 - h - a, 0.0, 1.0);
}

// mod() for whole numbers. A GPU may divide by multiplying by 1/y, which can
// land a hair under a whole number and so wrap once too few.
float wrap(float x, float y) {
  return x - y * floor((x + 0.5) / y);
}

// An ink: 0 = one end of the edition's fan of five, 1 = the other, and the inks between.
vec3 ramp(float k) {
  float x = clamp(k, 0.0, 1.0) * 4.0;
  int i = int(min(x, 3.0));
  return mix(uRamp[i], uRamp[i + 1], x - float(i));
}

// The same ink as it glows under ultraviolet.
vec3 glow(float k) {
  float x = clamp(k, 0.0, 1.0) * 4.0;
  int i = int(min(x, 3.0));
  return mix(UV_RAMP[i], UV_RAMP[i + 1], x - float(i));
}

// Where the pen of one line has got to. line: which of the ten; tau: how many
// turns along that line this point lies; reach: plate units the pen covers per
// turn hereabouts. Notes the line's ink, and returns
//   x: turns this point lies behind the pen (negative: the pen has not reached it)
//   y: 1 while the pen is at work on this line, 0 before it sets off and once it is done
//   z: turns the pen covers between one frame and the next
//   w: reach
vec4 pen(int line, float tau, float reach) {
  vec4 L = uLine[line];
  float x = clamp((uReveal - L.x) * L.y, 0.0, 1.0);
  float span = L.z + PAD;
  // A pen eases away from rest and eases to a stop.
  float eased = mix(x, x * x * (3.0 - 2.0 * x), 0.8);
  float pace = 0.2 + 4.8 * x * (1.0 - x);
  gLine = L.w;
  return vec4(eased * span - tau,
              smoothstep(0.0, 0.015, x) * (1.0 - smoothstep(0.985, 1.0, x)),
              abs(uRate) * L.y * pace * span,
              reach);
}

// Lay one line. d: signed px to its centre; w: lines per px here (0 for a lone
// curve); n: the line's unit normal on screen; lead: where the pen is (see pen()).
void paint(float d, float w, vec2 n, float weight, vec4 lead) {
  // The point of the pen: a small hot bead. A fast pen crosses many pixels
  // between one frame and the next, so the bead trails a tail as long as that
  // step. Frame after frame the tails join up, and the eye sees one point travel.
  float bead = 2.65 * uDpr / (lead.w * uScale);                   // the bead's size, in turns
  float tail = clamp(lead.z, bead, max(bead, LONGEST_TAIL));
  float trailing = uRate < 0.0 ? -lead.x : lead.x;                // turns behind the pen, the way it is travelling
  float along = trailing < 0.0 ? exp(-trailing * trailing / (bead * bead)) : exp(-trailing / tail);
  float girth = 7.0 * uDpr * uDpr * mix(0.3, 1.0, along);         // the tail tapers
  gSpark += lead.y * along * exp(-d * d / girth);

  float show = smoothstep(0.0, CUT, lead.x);
  if (show <= 0.001) return;
  float wet = lead.y * exp(-lead.x / WET);                        // fresh ink stands a little proud
  float h = uHair * weight * (1.0 + 0.8 * wet);
  float dense = smoothstep(0.2, 0.5, w);                          // lines too close to tell apart
  float cover = mix(stroke(d, h), min(2.0 * h * w, 1.0) * 0.8, dense) * show * gTone;

  // Each line has an ink of its own. It drifts a little across the plate, and
  // the ink is optically variable: a line swaps toward the far end of the ramp
  // where it faces the light.
  float facing = abs(dot(n, gToLight));
  float flip = smoothstep(0.5, 1.0, facing) * mix(0.3, 1.0, gNear) * (1.0 - 0.6 * dense);
  float own = gBlend < 0.0 ? gLine : mix(gLine, gBlend, dense);
  float home = clamp(own + 0.24 * (gIris - 0.5), 0.0, 1.0);
  float k = mix(home, 1.0 - home, flip);

  vec3 day = ramp(k);
  vec3 lit = glow(k);
  float dayCover = cover * 0.92;
  float litCover = min(cover * (0.30 + 0.70 * gNear + 0.25 * flip), 1.0);
  vec3 colour = mix(day, lit, uUV);
  float alpha = mix(dayCover, litCover, uUV);
  gInk = vec4(colour * alpha, alpha) + gInk * (1.0 - alpha);

  // Raised ink throws a sliver of shadow away from the light.
  float lone = (1.0 - dense) * show;
  gShade = max(gShade, stroke(d - dot(n, gShift), h + 0.6) * lone);
  gHalo += exp(-d * d / (9.0 * uDpr * uDpr)) * lone * (1.0 + 2.0 * wet);
}

// A family of level lines: one line wherever v is a whole number. g = gradient of v on the plate.
void lines(float v, vec2 g, float weight, vec4 lead) {
  vec2 sg = vec2(dot(g, gDx), dot(g, gDy));
  float w = length(sg);
  float inv = 1.0 / max(w, 1e-6);
  paint((fract(v + 0.5) - 0.5) * inv, w, sg * inv, weight, lead);
}

// One lone curve where F = 0.
void curve(float F, vec2 g, float weight, vec4 lead) {
  vec2 sg = vec2(dot(g, gDx), dot(g, gDy));
  float inv = 1.0 / max(length(sg), 1e-6);
  paint(F * inv, 0.0, sg * inv, weight, lead);
}

// In everything below, "at" says where round the plate a point is: 0..1, with
// 0.5 at three o'clock, growing anticlockwise. A line's four numbers are:
// x where its pen sets off, y which way round it goes, z how many turns of the
// whole line come before this part, w which of the ten lines it is.

// A band of two spirals. Each is one wavy line that leaves the band's inner
// edge and winds out to its outer edge. They are wound opposite ways, so they
// cross all the way round, like the two families of rings they replace.
void spirals(int band, float rho, float at, float r, float width, vec2 er, vec2 et) {
  float th = (at - 0.5) * TAU;
  float envelope = sin(PI * rho);            // the waves die away at both edges of the band
  float slope = PI * cos(PI * rho);
  for (int f = 0; f < 2; f++) {
    vec4 a = uFam[band * 4 + f * 2];          // rings, rays, lobes, amp
    vec4 b = uFam[band * 4 + f * 2 + 1];      // twist, phase
    vec4 own = f == 0 ? uBandA[band] : uBandB[band];
    float psi = a.z * th + b.x * rho + b.y;
    float c = cos(psi);
    float s = sin(psi);
    float part = fract(own.y * (at - own.x));              // how far round from where the pen set off
    float v = a.x * rho + a.w * envelope * c - part;
    float across = a.x + a.w * (slope * c - envelope * b.x * s);
    float around = -a.w * envelope * a.z * s - own.y / TAU;
    vec2 g = across / width * er + around / r * et;
    float tau = floor(v + 0.5) + part;
    if (tau < -0.001 || tau > a.x + 0.001) continue;        // past either end of the line
    lines(v, g, 1.0, pen(int(own.w + 0.5), own.z + tau, TAU * r));
  }
}

// Which line a strand of a weave belongs to, and where that line's pen is.
// nearest: the strand's own number.
vec4 strandPen(float nearest, float at, float r, float strands, float stride, vec4 lineA, vec4 lineB) {
  float which = wrap(nearest, stride);
  float lap = (wrap(nearest, strands) - which) / stride;   // times this line has passed the seam
  vec4 own = which < 0.5 ? lineA : lineB;
  float tau = mod(own.y * (lap + at - own.x), strands / stride);
  return pen(int(own.w + 0.5), own.z + tau, TAU * r);
}

// One strand of a weave: the curve F = 0, among neighbours w lines per px apart. g = gradient of F on the plate.
void strand(float F, vec2 g, float w, float weight, vec4 lead) {
  vec2 sg = vec2(dot(g, gDx), dot(g, gDy));
  float inv = 1.0 / max(length(sg), 1e-6);
  paint(F * inv, w, sg * inv, weight, lead);
}

// Many strands of one sine wave, each a step out of phase with the last.
// u runs from -1 to 1 across the band; a strand is the curve u = sin(waves * angle + its phase).
// The wave count is a fraction over a whole number, so each strand, once round
// the plate, runs on into another: stride strands on. That makes the whole
// weave one unbroken line (stride 1: a braid) or two (stride 2: a band).
void weave(float rho, float at, float r, float width, vec2 er, vec2 et, float waves, float strands,
           float scallops, float depth, float phase, float weight, float stride, vec4 lineA, vec4 lineB) {
  float th = (at - 0.5) * TAU;
  float u = (2.0 * rho - 1.0 - depth * cos(scallops * th)) / (1.0 - depth);
  vec2 gu = (2.0 / width * er + depth * scallops * sin(scallops * th) / r * et) / (1.0 - depth);
  vec2 gx = waves / r * et;
  float k = strands / TAU;
  float x = waves * th + phase;

  // Which strands pass nearest: one climbing, one falling. Counting in turns of
  // the wave, strand n is where k * (arc - x), or k * (PI - arc - x), equals n.
  float arc = asin(clamp(u, -1.0, 1.0));
  float n1 = floor(k * (arc - x) + 0.5);
  float n2 = floor(k * (PI - arc - x) + 0.5);
  // How close together the strands lie, for where they are too close to tell apart.
  float rise = inversesqrt(max(1.0 - u * u, 0.04));
  float w1 = length(vec2(dot(k * (rise * gu - gx), gDx), dot(k * (rise * gu - gx), gDy)));
  float w2 = length(vec2(dot(k * (rise * gu + gx), gDx), dot(k * (rise * gu + gx), gDy)));

  // Each is measured from its own curve, u = sin(x + n / k). That stays true
  // round the crests, where the strands bunch up and a count of levels does not.
  float x1 = x + n1 / k;
  strand(u - sin(x1), gu - cos(x1) * gx, w1, weight, strandPen(n1, at, r, strands, stride, lineA, lineB));
  if (abs(wrap(n2 - n1, strands)) > 0.5) {                   // at a crest the two are one and the same strand
    float x2 = x + n2 / k;
    strand(u - sin(x2), gu - cos(x2) * gx, w2, weight, strandPen(n2, at, r, strands, stride, lineA, lineB));
  }
}

// Lace: leaning strokes that cross the band. A pen goes out along one stroke
// and comes back along its mirror image, over and over, lacing round the band
// like thread through eyelets. Two pens share the strokes: the even and the odd.
void lace(int band, float rho, float at, float r, float width, vec2 er, vec2 et) {
  float th = (at - 0.5) * TAU;
  float envelope = sin(PI * rho);
  float slope = PI * cos(PI * rho);
  vec4 knot = uLace[band];                    // rays, lean, inverse, zigzag
  for (int f = 0; f < 2; f++) {
    vec4 a = uFam[band * 4 + f * 2];          // rings, rays, lobes, amp
    vec4 b = uFam[band * 4 + f * 2 + 1];      // twist, phase
    float psi = a.z * th + b.x * rho + b.y;
    float c = cos(psi);
    float s = sin(psi);
    float v = a.x * rho + a.y * at + a.w * envelope * c;
    float across = a.x + a.w * (slope * c - envelope * b.x * s);
    float around = a.y / TAU - a.w * envelope * a.z * s;
    vec2 g = across / width * er + around / r * et;

    // The whole number nearest v is the stroke's own number. From it: which of
    // the two pens draws it, and how many zigzags that pen has made before it.
    float nearest = floor(v + 0.5);
    float which = wrap(nearest, 2.0);
    float pair = wrap((which - nearest) * 0.5 * knot.z - float(f), 0.5 * knot.x);
    float natural = (pair + (f == 0 ? 0.5 * rho : 1.0 - 0.5 * rho)) * knot.w;
    vec4 own = which < 0.5 ? uBandA[band] : uBandB[band];
    // The strokes lean clockwise, so a pen going anticlockwise walks the lace backwards.
    float tau = mod(-own.y * (natural - own.x), knot.y);
    lines(v, g, 1.0, pen(int(own.w + 0.5), own.z + tau, 2.0 * width / knot.w));
  }
}

// One of the two wide bands, drawn the way its edition asks.
void drawBand(int which, float rho, float at, float r, float width, vec2 er, vec2 et) {
  int kind = which == 0 ? uKind.x : uKind.y;
  vec4 lineA = uBandA[which];
  vec4 lineB = uBandB[which];
  gBlend = 0.5 * (uLine[int(lineA.w + 0.5)].w + uLine[int(lineB.w + 0.5)].w);
  if (kind == WEAVE) {
    vec4 a = uFam[which * 4];                 // waves, strands, scallops, depth
    weave(rho, at, r, width, er, et, a.x, a.y, a.z, a.w, uFam[which * 4 + 1].x, 1.0, 2.0, lineA, lineB);
  } else if (kind == LACE) {
    lace(which, rho, at, r, width, er, et);
  } else {
    spirals(which, rho, at, r, width, er, et);
  }
  gBlend = -1.0;
}

// Lettering that runs clockwise round a ring, tops outward, like the legend on a coin.
float inscription(sampler2D words, float r, float th, float r0, float r1, float repeats, vec2 er, vec2 et) {
  float t = (r - r0) / (r1 - r0);
  if (t <= 0.0 || t >= 1.0) return 0.0;
  vec2 gs = -repeats / (TAU * r) * et;
  vec2 gt = er / (r1 - r0);
  return textureGrad(words, vec2(-th / TAU * repeats, t),
                     vec2(dot(gs, gDx), dot(gt, gDx)), vec2(dot(gs, gDy), dot(gt, gDy))).r;
}

// The loupe: the plate swells gently under the pointer.
vec2 loupe(vec2 p) {
  vec2 d = p - uLoupe.xy;
  return p - d * (uLoupe.z * exp(-dot(d, d) / ${glsl(LOUPE_SPREAD)}));
}

// ---- The seal's stone ---------------------------------------------------------
// The seal is a disc of polished black granite. Its grain is dealt from the
// edition, so every plate has a stone of its own.

// A number from 0 to 1 that depends only on a square of a grid and a seed. The
// sums are in whole numbers, so every GPU deals the same stone to the same edition.
float chance(ivec2 cell, int seed) {
  uint h = uint(cell.x + 8192) * 0x9E3779B1u ^ uint(cell.y + 8192) * 0x85EBCA77u ^ uint(seed) * 0xC2B2AE3Du;
  h ^= h >> 15;
  h *= 0x2C1B3C6Du;
  h ^= h >> 12;
  h *= 0x297A2D39u;
  h ^= h >> 15;
  return float(h >> 8) * (1.0 / 16777216.0);
}

// Cloud: chance() blended smoothly between the corners of the grid.
float cloud(vec2 x, int seed) {
  vec2 f = floor(x);
  vec2 u = x - f;
  u = u * u * (3.0 - 2.0 * u);
  ivec2 c = ivec2(f);
  return mix(mix(chance(c, seed), chance(c + ivec2(1, 0), seed), u.x),
             mix(chance(c + ivec2(0, 1), seed), chance(c + ivec2(1, 1), seed), u.x), u.y);
}

// Crystals: a share of the grid's squares (often) hold one, somewhere inside the
// square, a small leaning lozenge. x: how much of this pixel it covers;
// y, z, w: three numbers of its own (its tone, and which way it faces).
vec4 crystal(vec2 x, float pxPerSquare, float often, int seed) {
  vec2 f = floor(x);
  ivec2 c = ivec2(f);
  if (chance(c, seed) > often) return vec4(0.0);
  float size = 0.09 + 0.2 * chance(c, seed + 1);             // half its length, in squares
  vec2 centre = size + (1.0 - 2.0 * size) * vec2(chance(c, seed + 2), chance(c, seed + 3));
  float lean = TAU * chance(c, seed + 4);
  vec2 d = x - f - centre;
  d = vec2(cos(lean) * d.x + sin(lean) * d.y, cos(lean) * d.y - sin(lean) * d.x);
  float reach = abs(d.x) + (1.3 + 1.4 * chance(c, seed + 5)) * abs(d.y);
  return vec4(clamp((size - reach) * pxPerSquare + 0.5, 0.0, 1.0),
              chance(c, seed + 6), chance(c, seed + 7), chance(c, seed + 8));
}

// Turn a point about the middle. Each layer of the stone's grain lies on a grid
// turned its own way, so no grid lines up with the screen or with another.
vec2 askew(vec2 v, float angle) {
  return vec2(cos(angle) * v.x - sin(angle) * v.y, sin(angle) * v.x + cos(angle) * v.y);
}

// What the polish mirrors: a long strip light hung above and behind the plate.
// from: the point on the stone; back: the way a ray from the eye leaves it.
// Returns how bright the strip looks along that ray, 0..1: a crisp near edge,
// then falling away behind it.
float studio(vec3 from, vec3 back) {
  if (back.z < 0.04) return 0.0;
  // The strip hangs STUDIO above the paper. The stone is let go from higher than
  // that, so while it is well up in the air the strip is taken to hang as far
  // above the stone as it does above a stone some way off the paper: the stone
  // never passes through the light.
  vec2 hit = from.xy + back.xy * (max(STUDIO - from.z, 0.6 * STUDIO) / back.z) - uStudio;
  float across = dot(hit, vec2(-0.2079, 0.9781));            // the strip is hung a little askew
  float along = dot(hit, vec2(0.9781, 0.2079));
  return smoothstep(0.0, 0.03, across) * exp(-max(across, 0.0) / 0.3) * (1.0 - smoothstep(0.7, 1.5, abs(along)))
       * mix(1.0, 0.7, smoothstep(-0.5, 0.8, along));          // it is brighter at one end
}

void main() {
  // Line of sight: from the eye, through this pixel, onto the tilted paper.
  vec2 s = (gl_FragCoord.xy - uAnchor) / uScale;
  vec3 U = uBasis[0];
  vec3 V = uBasis[1];
  vec3 N = uBasis[2];
  float facingAway = CAM * N.z - dot(s, N.xy);
  float safe = max(facingAway, CAM * 0.05);

  float tPaper = CAM * N.z / safe;
  vec3 onPaper = vec3(tPaper * s, CAM * (1.0 - tPaper));
  vec2 p = loupe(vec2(dot(onPaper, U), dot(onPaper, V)));

  // Derivatives are taken here, before any branch, so they are always defined.
  gDx = dFdx(p);
  gDy = dFdy(p);

  // The seal's stone may be anywhere above the paper, leaning any way (its drop:
  // js/drop.js). Where this pixel's line of sight meets the planes of its
  // underside and of its face, measured along the stone's own axes. The line is
  // the true one, from the eye: high in its drop the stone is far from the paper,
  // and the paper's loupe must not bend the way to it. The loupe then swells the
  // stone as it does the paper under it, so at rest these two are the paper point
  // and the point of the face above it.
  vec3 eyeAt = CAM * vec3(U.z, V.z, N.z);                        // where the eye is, as the plate sees it
  vec3 look = vec3(s, -CAM);
  look = vec3(dot(look, U), dot(look, V), dot(look, N));         // the way this pixel looks, as the plate sees it
  vec3 sightFrom = (eyeAt - uStoneAt.xyz) * uStone;              // v * M turns v into M's axes
  vec3 sight = look * uStone;
  bool fromBelow = sight.z > 0.0;                                // the eye is under the plane of its face: its underside is the near side
  float edgeOn = 0.02 * length(sight);
  float dive = fromBelow ? max(sight.z, edgeOn) : min(sight.z, -edgeOn);   // never quite edge-on
  vec2 su = sightFrom.xy - sight.xy * (sightFrom.z / dive);
  vec2 sf = sightFrom.xy + sight.xy * ((SEAL_LIFT - sightFrom.z) / dive);
  vec2 underAt = uStoneAt.xy + (uStone * vec3(su, 0.0)).xy;      // those two points, across the plate
  vec2 faceAt = uStoneAt.xy + (uStone * vec3(sf, SEAL_LIFT)).xy;
  su += (vec3(loupe(underAt) - underAt, 0.0) * uStone).xy;
  sf += (vec3(loupe(faceAt) - faceAt, 0.0) * uStone).xy;
  vec2 uDx = dFdx(su);
  vec2 uDy = dFdy(su);
  vec2 fDx = dFdx(sf);
  vec2 fDy = dFdy(sf);

  float r = length(p);
  // Beyond the plate is bare paper with nothing drawn on it. But the stone, high
  // in its drop, shows in front of paper far beyond the plate, and its shadow
  // falls out there: while it is in the air, those pixels are drawn too.
  bool beyond = r > 2.95;
  if (facingAway <= CAM * 0.05 || (beyond && !(uStoneAt.w > 0.0 && uStoneAt.z > 0.0))) {
    fragColor = vec4(0.0);
    return;
  }

  vec2 toLight = (uLight.xy - gl_FragCoord.xy) / uScale;
  float lightGap = dot(toLight, toLight);
  gToLight = toLight * inversesqrt(lightGap + 0.02);
  gNear = exp(-lightGap / 1.5) * uLight.z;
  gShift = -gToLight * 1.5 * uDpr;
  gIris = smoothstep(-1.0, 1.0, dot(p, uIris));
  gInk = vec4(0.0);
  gShade = 0.0;
  gHalo = 0.0;
  gSpark = 0.0;
  gTone = 1.0;
  gLine = 0.0;
  gBlend = -1.0;

  // ---- The plate's lines. ----
  if (!beyond) {
    float th = atan(p.y, p.x);
    vec2 er = p / max(r, 1e-6);
    vec2 et = vec2(-er.y, er.x);

    float turn = th / TAU;                       // once round the plate = 1
    float at = fract(turn + 0.5);                // where round the plate this point is
    float typing = fract(0.25 - turn);           // 0 at the far side, growing clockwise: the way the lettering reads

    if (r < 1.03) {
      // The bands turn slowly, each at its own pace. A band's framing circles
      // turn with it, so a pen runs straight on from a circle into the pattern.
      float atInner = fract(turn + uTurn.x / TAU + 0.5);
      float atOuter = fract(turn + uTurn.y / TAU + 0.5);

      for (int i = 0; i < RULES; i++) {
        float gap = r - RULE_AT[i];
        if (abs(gap) < 0.03) {
          vec4 rule = uRule[i];
          float here = RULE_BAND[i] < 0 ? at : (RULE_BAND[i] == 0 ? atInner : atOuter);
          curve(gap, er, RULE_WEIGHT[i],
                pen(int(rule.w + 0.5), rule.z + fract(rule.y * (here - rule.x)), TAU * RULE_AT[i]));
        }
      }

      // Each double rule is one line: a short ramp carries the pen from the first circle out to the second.
      for (int i = 0; i < 2; i++) {
        float from = RULE_AT[1 + 4 * i];
        float to = RULE_AT[2 + 4 * i];
        if (r > from - 0.02 && r < to + 0.02) {
          vec4 tie = uTie[i];
          float into = fract(tie.y * ((i == 0 ? atInner : atOuter) - tie.x));
          if (into < TIE) {
            float e = into / TIE;
            float path = from + (to - from) * e * e * (3.0 - 2.0 * e);
            float climb = (to - from) * 6.0 * e * (1.0 - e) / TIE * tie.y / TAU;   // how fast the ramp climbs, per radian
            curve(r - path, er - climb / r * et, 1.0, pen(int(tie.w + 0.5), tie.z + into, TAU * r));
          }
        }
      }

      if (r > INNER0 && r < INNER1) {
        drawBand(0, (r - INNER0) / (INNER1 - INNER0), atInner, r, INNER1 - INNER0, er, et);
      } else if (r > OUTER0 && r < OUTER1) {
        drawBand(1, (r - OUTER0) / (OUTER1 - OUTER0), atOuter, r, OUTER1 - OUTER0, er, et);
      } else if (abs(r - BRAID_A) < BRAID_A_HALF + BRAID_ROOM) {
        weave((r - BRAID_A + BRAID_A_HALF) / (2.0 * BRAID_A_HALF), fract(turn + uTurn.z / TAU + 0.5), r,
              2.0 * BRAID_A_HALF, er, et, uBraid[0].x, uBraid[0].y, 0.0, 0.0, uBraid[0].z, 1.15, 1.0,
              uBraidLine[0], uBraidLine[0]);
      } else if (abs(r - BRAID_B) < BRAID_B_HALF + BRAID_ROOM) {
        weave((r - BRAID_B + BRAID_B_HALF) / (2.0 * BRAID_B_HALF), fract(turn + uTurn.w / TAU + 0.5), r,
              2.0 * BRAID_B_HALF, er, et, uBraid[1].x, uBraid[1].y, 0.0, 0.0, uBraid[1].z, 1.15, 1.0,
              uBraidLine[1], uBraidLine[1]);
      } else if (r > LEGAL0 && r < LEGAL1) {
        // The company's legal inscription, in the plate's own ink, typed round its ring.
        float typed = smoothstep(0.0, 0.01, (uReveal - uTyped.x) / uTyped.y - typing);
        float letters = inscription(uLegal, r, th, LEGAL0, LEGAL1, uRepeat.x, er, et) * typed;
        vec3 colour = mix(ramp(gIris), glow(gIris), uUV);
        float alpha = letters * mix(0.92, 0.35 + 0.65 * gNear, uUV);
        gInk = vec4(colour * alpha, alpha) + gInk * (1.0 - alpha);
      } else if (r > EDITION0 && r < EDITION1) {
        // The edition's own number: printed in ink that only shows under ultraviolet.
        float typed = smoothstep(0.0, 0.01, (uReveal - uTyped.z) / uTyped.w - typing);
        float letters = inscription(uEditionText, r, th, EDITION0, EDITION1, uRepeat.y, er, et) * typed;
        float alpha = letters * uUV * (0.6 + 0.4 * gNear);
        gInk = vec4(UV_HOT * alpha, alpha) + gInk * (1.0 - alpha);
      }
    } else {
      // The orbits open the film, and they are one line: it circles the widest
      // orbit, comes down to the next, circles that, and so on in to the plate.
      gTone = 0.62;
      float descent = uOrbitLine.z;
      for (int i = 0; i < 5; i++) {
        vec4 o = uOrbit[i];
        float lap = float(4 - i);                                   // orbits already circled when the pen gets here
        float into = fract(uOrbitLine.y * (at - uOrbitLine.x) - lap * descent);
        float psi = o.y * th + o.w;
        float q = 1.0 + o.z * cos(psi);
        if (abs(r - o.x) <= o.x * o.z + 0.05) {
          vec2 g = er / q + (o.z * o.y * sin(psi) / (q * q)) * et;
          curve(r / q - o.x, g, 0.9, pen(${LINE.orbits}, lap * (1.0 + descent) + into, TAU * o.x));
        }
        if (i > 0 && into < descent) {
          // The way down to the next orbit in.
          vec4 n = uOrbit[i - 1];
          float psiN = n.y * th + n.w;
          float here = o.x * q;
          float next = n.x * (1.0 + n.z * cos(psiN));
          if (r < here + 0.05 && r > next - 0.05) {
            float e = into / descent;
            float eased = e * e * (3.0 - 2.0 * e);
            float path = mix(here, next, eased);
            float climb = mix(-o.x * o.z * o.y * sin(psi), -n.x * n.z * n.y * sin(psiN), eased)
                        + (next - here) * 6.0 * e * (1.0 - e) / descent * uOrbitLine.y / TAU;
            curve(r - path, er - climb / r * et, 0.9,
                  pen(${LINE.orbits}, lap * (1.0 + descent) + 1.0 + into, TAU * r));
          }
        }
      }
      gTone = 1.0;
    }
  }

  // Shadow first, then ink, then the glow that ultraviolet adds.
  float shade = gShade * 0.2 * (1.0 - uUV);
  vec4 acc = gInk + vec4(0.0, 0.0, 0.0, shade) * (1.0 - gInk.a);
  acc.rgb += glow(gIris) * min(gHalo, 1.5) * 0.09 * uUV * (0.3 + 0.9 * gNear);

  // The points of the pens: hot in daylight, white-hot under ultraviolet.
  float spark = min(gSpark, 1.0);
  vec3 hot = mix(vec3(0.92, 0.34, 0.10), vec3(1.0, 0.84, 0.62), uUV);
  acc = vec4(hot * spark, spark) + acc * (1.0 - spark);

  // ---- The seal: a disc of polished black stone with the mark engraved in it.
  // It is dropped onto the finished plate (js/drop.js). Until then it is not there. ----
  if (uStoneAt.w > 0.0) {
    float high = max(uStoneAt.z, 0.0);
    vec3 faceUp = uStone[2];                                     // the way the stone's face looks, as the plate sees it
    vec2 below = p - uStoneAt.xy;                                // from the point of the paper under the stone's middle

    // Its shadow on the paper: a soft one thrown away from the light, wider
    // and fainter the higher the stone is, and a tight dark line where the
    // stone is down on the paper.
    vec2 lit = mix(p, uStoneAt.xy, clamp(high / 0.25, 0.0, 1.0));   // high up, the whole shadow is thrown one way
    vec2 away = lit - uLightPlate;
    away /= length(away) + 0.35;
    vec2 shed = below - away * (SEAL_LIFT * 1.9 + high * 0.6);
    float leaning = length(faceUp.xy);
    if (leaning > 1e-4) {
      // A leaning stone throws a narrower shadow: narrower along the way it leans.
      vec2 downhill = faceUp.xy / leaning;
      shed += downhill * dot(shed, downhill) * (1.0 / max(abs(faceUp.z), 0.35) - 1.0);
    }
    float thrown = 1.0 - smoothstep(-0.01 - 0.3 * high, 0.062 + 0.55 * high, length(shed) - SEAL);
    float gap = uStoneAt.z - dot(below, faceUp.xy) / max(faceUp.z, 0.2);   // how far the stone's underside stands above this point of the paper
    float contact = (1.0 - smoothstep(0.0, 0.014, length(below) - SEAL)) * (1.0 - smoothstep(0.004, 0.05, gap));
    float shadow = max(0.22 * thrown / (1.0 + 1.5 * high), 0.40 * contact) * (1.0 - 0.8 * uUV) * uStoneAt.w;
    acc = vec4(0.0, 0.0, 0.0, shadow) + acc * (1.0 - shadow);

    float ru = length(su);
    vec2 eru = su / max(ru, 1e-6);
    float rf = length(sf);
    vec2 erf = sf / max(rf, 1e-6);

    // The face, and the stone's underside. Where the outline of the one further
    // from the eye shows but the nearer one does not, we are looking at the stone's side.
    // A pixel is never wider than a small part of the stone. Where a line of sight
    // runs along the plane of its face, the place it meets that plane leaps from
    // one side of the world to the other between two pixels, and that leap must
    // not be read as a pixel wide enough to hold a little of the stone.
    float widest = 0.2 * SEAL;
    float top = clamp(0.5 - (rf - SEAL) / clamp(length(vec2(dot(erf, fDx), dot(erf, fDy))), 1e-6, widest), 0.0, 1.0);
    float foot = clamp(0.5 - (ru - SEAL) / clamp(length(vec2(dot(eru, uDx), dot(eru, uDy))), 1e-6, widest), 0.0, 1.0);
    float body = max(top, foot);

    if (body > 0.0) {
      int seed = int(uSeal.x);
      vec2 q = sf / SEAL;                                        // across the face: 1 at its edge
      float rq = rf / SEAL;
      // Device px to one unit of q: across the screen, and up it (the tilt makes these differ).
      vec2 pxPer = SEAL / max(vec2(length(fDx), length(fDy)), vec2(1e-6));
      float fine = min(pxPer.x, pxPer.y);

      // The light is worked out twice over: along the stone's own axes for what
      // its surface does, and over the plate for where the room's lights hang.
      vec3 here = uStoneAt.xyz + uStone * vec3(sf, SEAL_LIFT);    // this point of the face, over the plate
      vec3 see = normalize(eyeAt - here) * uStone;                 // the way to the eye, along the stone's axes
      vec3 lamp = vec3(uLightPlate, LAMP);
      vec2 lampOn = ((lamp - uStoneAt.xyz) * uStone).xy;         // the lamp, across the stone's face
      vec2 ldir = (lampOn - sf) / (length(lampOn - sf) + 0.02);

      // -- The polish. The face is flat and rounds over at its edge. It mirrors
      // the studio's strip light, the lamp at the pointer, and, where it turns
      // far enough away from the eye, the paper beyond it.
      float turned = smoothstep(1.0 - BEVEL, 1.0, rq);
      vec3 n = normalize(vec3(erf * (0.8 * turned * turned), 1.0));
      vec3 back = uStone * reflect(-see, n);                     // where the polish throws the eye's ray, over the plate
      float facing = max(dot(n, see), 0.0);
      float polish = min((0.05 + 0.95 * pow(1.0 - facing, 5.0)) / 0.056, 5.0);   // 1 on the flat face, more at a glancing angle
      float strip = studio(here, back);
      float beyond = 1.0 - smoothstep(-0.1, 0.12, back.z);
      // What it mirrors when it throws the eye's ray down: the paper, and the
      // plate's two inked bands where the ray comes down on them.
      vec2 down = here.xy + back.xy * (here.z / max(-back.z, 0.05));
      float dr = length(down);
      float inked = smoothstep(INNER0 - 0.03, INNER0 + 0.03, dr) * (1.0 - smoothstep(INNER1 - 0.03, INNER1 + 0.03, dr))
                  + smoothstep(OUTER0 - 0.03, OUTER0 + 0.03, dr) * (1.0 - smoothstep(OUTER1 - 0.03, OUTER1 + 0.03, dr));
      float irisDown = smoothstep(-1.0, 1.0, dot(down, uIris));
      vec3 mirrored = mix(mix(vec3(0.93, 0.95, 0.93), vec3(0.34, 0.27, 0.72), uUV),
                          mix(ramp(irisDown), glow(irisDown), uUV), 0.5 * inked);
      vec2 miss = here.xy + back.xy * ((LAMP - here.z) / max(back.z, 0.08)) - lamp.xy;
      float m2 = dot(miss, miss);
      float under = smoothstep(0.0, 0.06, LAMP - here.z);        // a face lifted above the lamp cannot mirror it
      float glare = (0.7 * exp(-m2 / 0.0016) + 0.5 * exp(-m2 / 0.012) + 0.16 * exp(-m2 / 0.09)) * uLight.z * under;
      vec3 stripTone = mix(vec3(0.90, 0.95, 1.0), vec3(0.50, 0.40, 1.0), uUV);
      vec3 lampTone = mix(vec3(1.0, 0.96, 0.88), vec3(0.78, 0.66, 1.0), uUV);
      vec3 shine = stripTone * (strip * mix(0.30, 0.15, uUV) + mix(0.03, 0.012, uUV)) * polish
                 + mirrored * beyond * polish * mix(0.056, 0.12, turned)   // the flat face mirrors as much as polished stone does; its rounded edge is given more
                 + lampTone * glare * min(polish, 2.0) * mix(0.62, 0.5, uUV);

      // -- The stone itself: black granite. Soft clouds, pale grains, a few
      // larger crystals, a faint vein in some stones, and flecks that glint.
      float clouds = 0.6 * cloud(q * 3.1 + 11.0, seed) + 0.4 * cloud(q * 7.7 + 5.0, seed + 9);
      vec3 albedo = mix(vec3(0.050, 0.046, 0.044), vec3(0.040, 0.045, 0.054), uSeal.y) * (0.72 + 0.56 * clouds);
      vec4 grain = crystal(askew(q, 0.61) * 44.0, fine / 44.0, 0.42, seed + 20);
      vec4 dust = crystal(askew(q, -0.37) * 63.0 + 0.5, fine / 63.0, 0.36, seed + 30);
      vec4 gem = crystal(askew(q, 1.9) * 15.0 + 3.3, fine / 15.0, 0.3, seed + 40);
      albedo += vec3(0.115, 0.115, 0.11) * grain.x * (0.25 + 0.75 * grain.y) * smoothstep(0.8, 2.0, fine / 44.0)
              + vec3(0.09, 0.09, 0.088) * dust.x * (0.2 + 0.8 * dust.y) * smoothstep(0.8, 2.0, fine / 63.0)
              + vec3(0.085, 0.09, 0.095) * gem.x * (0.3 + 0.7 * gem.y);
      float bend = cloud(q * 2.1 + 31.0, seed + 90) - 0.5;
      float veinAt = dot(q, vec2(cos(TAU * uSeal.y), sin(TAU * uSeal.y))) + 0.7 * bend - (chance(ivec2(3, 5), seed + 91) - 0.5);
      float vein = exp(-veinAt * veinAt / 0.0005) * cloud(q * 6.0, seed + 92) * step(0.45, chance(ivec2(1, 2), seed + 93));
      albedo += vec3(0.055, 0.055, 0.053) * vein;

      vec4 fleck = crystal(askew(q, -1.13) * 27.0 + 7.1, fine / 27.0, 0.2, seed + 60);
      vec3 facet = normalize(vec3((fleck.zw - 0.5) * 0.9, 1.0));  // each fleck lies at a small tilt of its own
      vec3 off = uStone * reflect(-see, facet);
      vec2 missF = here.xy + off.xy * (max(0.5 - here.z, 0.3) / max(off.z, 0.08)) - lamp.xy;
      float flash = fleck.x * (0.5 * studio(here, off) * mix(1.0, 0.25, uUV) + exp(-dot(missF, missF) / 0.06) * uLight.z);
      vec3 fleckTone = mix(mix(vec3(1.0, 0.80, 0.52), vec3(0.84, 0.90, 1.0), fract(fleck.y + uSeal.y)),
                           glow(fleck.y), uUV);

      float matte = mix(0.82 + 0.26 * gNear, 0.06 + 0.5 * gNear, uUV);   // the light that falls on anything not polished
      vec3 face = albedo * matte * mix(vec3(1.0), vec3(0.75, 0.6, 1.3), uUV) + shine + fleckTone * flash
                + glow(fleck.y) * fleck.x * step(0.6, fleck.w) * uUV * (0.10 + 0.35 * gNear);   // under ultraviolet some flecks glow

      // -- The mark: laser-frosted stone, pale and matte, a hair below the polish.
      vec2 muv = q * 0.5 + 0.5;
      vec2 mdx = fDx * (0.5 / SEAL);
      vec2 mdy = fDy * (0.5 / SEAL);
      float etched = textureGrad(uMark, muv, mdx, mdy).r;
      float pitch = 2.0 * MARK_HALF.y / ROWS;
      float rowAt = (MARK_HALF.y - q.y) / pitch;
      float frost = 0.955 + 0.09 * (cloud(askew(q, 0.5) * 170.0, seed + 70) - 0.5) * smoothstep(1.0, 2.5, fine / 170.0);
      float ridges = (0.5 + 0.5 * cos(TAU * rowAt)) * smoothstep(2.6, 5.0, pitch * pxPer.y);   // the laser's rows, where they are wide enough to see
      vec3 pale = mix(vec3(0.83, 0.82, 0.79) * (0.80 + 0.24 * gNear), UV_HOT * (0.74 + 0.34 * gNear), uUV)
                * frost * (1.0 - 0.05 * ridges);
      float toward = textureGrad(uMark, muv + ldir * 0.006, mdx, mdy).r;
      float awayM = textureGrad(uMark, muv - ldir * 0.006, mdx, mdy).r;
      pale *= 1.0 - 0.34 * (1.0 - toward);                       // in the shadow of the cut's wall on the light's side
      pale += 0.14 * (1.0 - awayM) * mix(1.0, 0.5, uUV);         // the far wall faces the light
      face = mix(face, pale, etched);

      // -- Once it has settled in its seat, the stone takes the light once.
      float sweep = mix(-1.6, 1.6, uGlint * uGlint * (3.0 - 2.0 * uGlint));
      float band = (dot(q, vec2(0.87, 0.5)) - sweep) / 0.2;
      face += stripTone * exp(-band * band) * sin(PI * uGlint) * mix(0.42, 0.14, etched) * mix(1.0, 0.6, uUV);

      // -- The side: honed, not polished, so it is greyer than the face.
      float span = rf - ru;                                           // (seen from below, the face is the smaller outline)
      float up = clamp((SEAL - ru) / (abs(span) > 1e-5 ? span : 1e-5), 0.0, 1.0);   // 0 at the underside .. 1 at the face
      vec2 pw = mix(su, sf, up);
      vec2 out2 = pw / max(length(pw), 1e-6);
      float grainW = 0.6 * cloud(vec2(atan(pw.y, pw.x) * 150.0, up * 9.0), seed + 80)
                   + 0.4 * cloud(vec2(atan(pw.y, pw.x) * 47.0, up * 3.0), seed + 81);
      float lit = max(dot(out2, ldir), 0.0) * gNear;
      vec3 side = mix(vec3(0.105, 0.105, 0.108), vec3(0.09, 0.07, 0.19), uUV) * (0.82 + 0.36 * grainW)
                * (1.0 - 0.22 * out2.x)                                   // the room's light comes from the left
                * (mix(0.60, 0.5, uUV) + mix(0.28, 0.05, uUV) * (1.0 - up) + 0.5 * lit)
                * (0.72 + 0.28 * smoothstep(0.0, 0.22, up));
      side += stripTone * 0.07 * smoothstep(0.72, 1.0, up) * mix(1.0, 0.4, uUV);   // its shoulder catches the light

      // -- Its underside, which shows only while it rears up in its wobble with its
      // back to the eye: honed like its side, unmarked, and in its own shade.
      vec2 qu = su / SEAL;
      vec3 underside = mix(vec3(0.074, 0.074, 0.077), vec3(0.06, 0.05, 0.13), uUV)
                     * (0.78 + 0.44 * cloud(qu * 5.3 + 17.0, seed + 82))
                     * (0.62 + 0.38 * smoothstep(0.55, 1.0, length(qu)));   // the room's light just reaches in under its rim

      vec3 colour = clamp(fromBelow ? mix(side, underside, foot) : mix(side, face, top), 0.0, 1.0);
      body *= uStoneAt.w;
      acc = vec4(colour * body, body) + acc * (1.0 - body);
    }
  }

  fragColor = vec4(min(acc.rgb, vec3(1.0)), min(acc.a, 1.0));
}`;

/** The seal's stone lying in its seat, the light long since across it (the shape of a pose from js/drop.js). */
const STONE_AT_REST = { present: 1, x: 0, y: 0, z: 0, axes: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), glint: 1 };

/** Flatten an edition, and the film that draws it, into the numbers the shader reads. */
function packEdition(edition) {
  const film = planFilm(edition);
  // A line's four numbers, as the shader reads them (see "A line's four numbers" there).
  const part = ({ start, way, offset = 0, line }) => [start, way, offset, line];

  const families = new Float32Array(32);
  const lace = new Float32Array(8);
  const kinds = [0, 0];
  film.bands.forEach((band, index) => {
    kinds[index] = band.kind;
    if (band.kind === KIND.weave) {
      // The weave's wave count here is the film's: a fraction over the edition's whole number.
      const { waves, strands, scallops, depth, phase } = band.weave;
      families.set([waves, strands, scallops, depth, phase], index * 16);
      return;
    }
    band.families.forEach((family, f) => {
      const { rings, rays, lobes, amp, twist, phase } = family;
      families.set([rings, rays, lobes, amp, twist, phase], index * 16 + f * 8);
    });
    if (band.kind === KIND.lace) {
      const { rays, lean, inverse, zigzag } = band.lace;
      lace.set([rays, lean, inverse, zigzag], index * 4);
    }
  });

  const braids = new Float32Array(8);
  film.braids.forEach((braid, index) => {
    braids.set([braid.weave.waves, braid.weave.strands, braid.weave.phase], index * 4);
  });

  const orbits = new Float32Array(20);
  edition.orbits.forEach((orbit, index) => orbits.set([orbit.radius, orbit.lobes, orbit.amp, orbit.phase], index * 4));

  return {
    kinds,
    families,
    lace,
    braids,
    orbits,
    lines: new Float32Array(film.lines.flatMap((line) => [line.start, 1 / line.duration, line.turns, line.ink])),
    rules: new Float32Array(film.rules.flatMap(part)),
    ties: new Float32Array(film.ties.flatMap(part)),
    bandA: new Float32Array(film.bands.flatMap((band) => part(band.lines[0]))),
    bandB: new Float32Array(film.bands.flatMap((band) => part(band.lines[1]))),
    braidLines: new Float32Array(film.braids.flatMap(part)),
    orbitLine: [film.orbits.start, film.orbits.way, film.orbits.descent],
    typed: [...film.typed.legend, ...film.typed.edition],
    ramp: new Float32Array(film.ramp.flat()),
    iris: [Math.cos(edition.ink.angle), Math.sin(edition.ink.angle)],
    // The stone's grain is dealt from a whole number, and its tint is a share from 0 to 1.
    seal: [Math.floor(edition.seal.hue * 65535), edition.seal.hue, 0, 0],
  };
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Plate shader failed to compile: ${log}`);
  }
  return shader;
}

/**
 * Start a plate on a canvas.
 * @returns the plate, or null when this browser has no WebGL2 (the caller shows the still plate instead).
 * @throws if WebGL2 exists but the shader cannot be built.
 */
export function createPlate(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false, // the shader does its own, exact, antialiasing
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const view = { width: 1, height: 1, ratio: 1, anchorX: 0, anchorY: 0, radius: 100, tilt: 0.95, lean: 0, yaw: 0 };
  const now = { loupe: [0, 0, 0] };
  const kept = { edition: null, textures: new Map() }; // what to restore if the GPU context is lost
  let uniforms = {};
  let textures = {};
  let lost = false;

  function build() {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Plate shader failed to link: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i += 1) {
      const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    textures = {};
    ['uLegal', 'uEditionText', 'uMark'].forEach((name, unit) => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // One black pixel until the real words arrive.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(uniforms[name], unit);
      textures[name] = { texture, unit };
    });
    gl.uniform2f(uniforms.uRepeat, 1, 1);
  }

  function upload(name, source, { repeat }) {
    const { texture, unit } = textures[name];
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const sharper = gl.getExtension('EXT_texture_filter_anisotropic');
    if (sharper) {
      const most = gl.getParameter(sharper.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, sharper.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, most));
    }
  }

  function applyEdition(edition) {
    const packed = packEdition(edition);
    gl.uniform2i(uniforms.uKind, packed.kinds[0], packed.kinds[1]);
    gl.uniform4fv(uniforms.uFam, packed.families);
    gl.uniform4fv(uniforms.uLace, packed.lace);
    gl.uniform4fv(uniforms.uBraid, packed.braids);
    gl.uniform4fv(uniforms.uOrbit, packed.orbits);
    gl.uniform4fv(uniforms.uLine, packed.lines);
    gl.uniform4fv(uniforms.uRule, packed.rules);
    gl.uniform4fv(uniforms.uTie, packed.ties);
    gl.uniform4fv(uniforms.uBandA, packed.bandA);
    gl.uniform4fv(uniforms.uBandB, packed.bandB);
    gl.uniform4fv(uniforms.uBraidLine, packed.braidLines);
    gl.uniform3fv(uniforms.uOrbitLine, packed.orbitLine);
    gl.uniform4fv(uniforms.uTyped, packed.typed);
    gl.uniform3fv(uniforms.uRamp, packed.ramp);
    gl.uniform2fv(uniforms.uIris, packed.iris);
    gl.uniform4fv(uniforms.uSeal, packed.seal);
  }

  /** The plate's three axes as the camera sees them. */
  function axes() {
    const ct = Math.cos(view.tilt + view.lean);
    const st = Math.sin(view.tilt + view.lean);
    const cy = Math.cos(view.yaw);
    const sy = Math.sin(view.yaw);
    return {
      U: [cy, 0, -sy],
      V: [-st * sy, ct, -st * cy],
      N: [ct * sy, st, ct * cy],
    };
  }

  function swell(x, y) {
    const [lx, ly, strength] = now.loupe;
    const dx = x - lx;
    const dy = y - ly;
    const k = strength * Math.exp(-(dx * dx + dy * dy) / LOUPE_SPREAD);
    return [x - dx * k, y - dy * k];
  }

  /** CSS px on the canvas -> the paper point under it (before the loupe), or null past the horizon. */
  function unproject(x, y) {
    const { U, V, N } = axes();
    const sx = (x - view.anchorX) / view.radius;
    const sy = (view.anchorY - y) / view.radius;
    const facingAway = CAMERA_DISTANCE * N[2] - (sx * N[0] + sy * N[1]);
    if (facingAway <= CAMERA_DISTANCE * 0.05) return null;
    const t = (CAMERA_DISTANCE * N[2]) / facingAway;
    const P = [t * sx, t * sy, CAMERA_DISTANCE * (1 - t)];
    return [P[0] * U[0] + P[1] * U[1] + P[2] * U[2], P[0] * V[0] + P[1] * V[1] + P[2] * V[2]];
  }

  build();

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // tells the browser we will rebuild, so it may hand the context back
    lost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    build();
    if (kept.edition) applyEdition(kept.edition);
    for (const [name, { source, options }] of kept.textures) upload(name, source, options);
    lost = false;
  });

  return {
    /** Maximum texture width this GPU accepts. */
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),

    setEdition(edition) {
      kept.edition = edition;
      if (!lost) applyEdition(edition);
    },

    /** name: 'legal' | 'edition' | 'mark'. source: a canvas of white on black. */
    setWords(name, source, repeats = 1) {
      const uniform = { legal: 'uLegal', edition: 'uEditionText', mark: 'uMark' }[name];
      if (!uniform) throw new RangeError(`Unknown plate lettering: ${name}`);
      const options = { repeat: name !== 'mark' };
      kept.textures.set(uniform, { source, options });
      if (name === 'legal') kept.legalRepeats = repeats;
      if (name === 'edition') kept.editionRepeats = repeats;
      if (!lost) upload(uniform, source, options);
    },

    /** Size the drawing surface. Sizes are CSS px; ratio is device px per CSS px. */
    resize(width, height, ratio) {
      view.width = width;
      view.height = height;
      view.ratio = ratio;
      const w = Math.max(1, Math.round(width * ratio));
      const h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    },

    /**
     * Where the medallion sits (CSS px from the canvas's top-left) and how it lies (radians):
     * `tilt` is how far it is laid back at rest, `lean` how much further it is leaning just now,
     * `yaw` how far it is turned to one side.
     */
    setView({ anchorX, anchorY, radius, tilt, yaw, lean = 0 }) {
      Object.assign(view, { anchorX, anchorY, radius, tilt, yaw, lean });
    },

    /**
     * Plate point -> CSS px on the canvas, plus how much perspective enlarges it there.
     * `lift` is how far the point stands above the paper (the seal's face stands SEAL_LIFT above it).
     */
    project(px, py, lift = 0) {
      const { U, V, N } = axes();
      // Undo the loupe: find the paper point that the loupe shows as (px, py).
      let x = px;
      let y = py;
      const [lx, ly, strength] = now.loupe;
      for (let i = 0; i < 4 && strength > 0; i += 1) {
        const dx = x - lx;
        const dy = y - ly;
        const k = strength * Math.exp(-(dx * dx + dy * dy) / LOUPE_SPREAD);
        x = px + dx * k;
        y = py + dy * k;
      }
      const X = x * U[0] + y * V[0] + lift * N[0];
      const Y = x * U[1] + y * V[1] + lift * N[1];
      const Z = x * U[2] + y * V[2] + lift * N[2];
      const scale = CAMERA_DISTANCE / (CAMERA_DISTANCE - Z);
      return {
        x: view.anchorX + X * scale * view.radius,
        y: view.anchorY - Y * scale * view.radius,
        scale,
      };
    },

    unproject,

    /**
     * Draw one frame.
     * @param {{ time: number, reveal: number, rate?: number, uv: number, hair: number,
     *           light: { x: number, y: number, presence: number },
     *           loupe: { x: number, y: number, strength: number },
     *           turn: [number, number, number, number] }} frame
     *   light is in CSS px on the canvas; loupe is on the plate. reveal is how
     *   far through the film the plate is (0 bare paper .. 1 finished), and rate
     *   how far reveal has moved since the frame before.
     */
    render(frame) {
      if (lost) return;
      const { ratio } = view;
      now.loupe = [frame.loupe.x, frame.loupe.y, frame.loupe.strength];
      const { U, V, N } = axes();

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.uAnchor, view.anchorX * ratio, (view.height - view.anchorY) * ratio);
      gl.uniform1f(uniforms.uScale, view.radius * ratio);
      gl.uniform1f(uniforms.uDpr, ratio);
      gl.uniformMatrix3fv(uniforms.uBasis, false, [...U, ...V, ...N]);
      gl.uniform3f(uniforms.uLoupe, frame.loupe.x, frame.loupe.y, frame.loupe.strength);
      gl.uniform3f(uniforms.uLight, frame.light.x * ratio, (view.height - frame.light.y) * ratio, frame.light.presence);
      const overPlate = unproject(frame.light.x, frame.light.y) ?? [0, 3];
      const [lx, ly] = swell(overPlate[0], overPlate[1]);
      gl.uniform2f(uniforms.uLightPlate, lx, ly);
      // The studio's strip light hangs where the stone's face mirrors it when the plate is at rest,
      // so a lean or a turn of the plate slides its reflection across the stone.
      const rest = ((STUDIO_HEIGHT - SEAL_LIFT) * CAMERA_DISTANCE * Math.sin(view.tilt)) /
        (CAMERA_DISTANCE * Math.cos(view.tilt) - SEAL_LIFT);
      gl.uniform2f(uniforms.uStudio, STRIP_REST[0], rest + STRIP_REST[1]);
      gl.uniform1f(uniforms.uHair, frame.hair * ratio);
      gl.uniform1f(uniforms.uReveal, frame.reveal);
      gl.uniform1f(uniforms.uRate, frame.rate ?? 0);
      // Where the seal's stone is at this moment: not there yet, falling, wobbling down, or at rest.
      // js/drop.js works that out and js/main.js keeps its time. A frame that says nothing of the
      // stone shows it at rest in its seat.
      const stone = frame.stone ?? STONE_AT_REST;
      gl.uniformMatrix3fv(uniforms.uStone, false, stone.axes);
      gl.uniform4f(uniforms.uStoneAt, stone.x, stone.y, stone.z, stone.present);
      gl.uniform1f(uniforms.uGlint, stone.glint);
      gl.uniform1f(uniforms.uUV, frame.uv);
      gl.uniform1f(uniforms.uTime, frame.time);
      gl.uniform4fv(uniforms.uTurn, frame.turn);
      gl.uniform2f(uniforms.uRepeat, kept.legalRepeats ?? 1, kept.editionRepeats ?? 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    get lost() {
      return lost;
    },
  };
}
