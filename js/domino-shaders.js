// The Domino Reactor run's shaders: how one domino, the floor under it and the
// light round it are drawn, and how the lens sees them. js/dominoes.js runs them.
//
// The run is lit like a photograph of a real object in a dark studio: one big
// soft lamp high over the camera's shoulder (the key), which casts the shadows
// and lights the faces the camera sees; a cool one low on the other side, for
// the sides of the dominoes; a little light from where the camera is, so that
// nothing it looks at is lost; and two lamps behind the run, a cool strip and
// a violet one, which only show as glints. For a run that winds the other way
// the lamps are set up as in a mirror, so that both look the same.
// The dominoes have rounded edges and are made of whatever the visitor chose
// (js/domino-designs.js); the floor is dark lacquer that mirrors them faintly.
// Light is added up as light (not as screen colours) and turned into a picture
// at the end, the way film does it. Last of all the picture goes through a
// lens, which leaves sharp only what is at the distance it is focused on.

const unit = ([x, y, z]) => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
const vec3 = (parts) => `vec3(${parts.map((part) => part.toFixed(5)).join(', ')})`;

/**
 * Towards the key light, for a run that winds the usual way (for one that
 * winds the other way, its first part changes sign). js/dominoes.js looks
 * along it to take the picture the shadows come from.
 */
export const KEY = unit([-0.36, -0.12, 0.925]);
const FILL = unit([0.45, -0.75, 0.48]);
const STRIP = unit([0.86, 0.25, 0.44]);
const KISS = unit([-0.5, 0.78, 0.38]);

// Shared by every vertex shader: how far a domino has tipped, how hot it is
// from having just been struck, and where its corners are once it has tipped.
const MOTION = `
uniform float uTime;
uniform vec4 uRise; // seconds since "set them up again" (below 0: not rising), spread, each, count
uniform vec3 uSize;

float tipOf(vec4 fall, float order) {
  float along = clamp((uTime - fall.x) / fall.z, 0.0, 1.0);
  float struck = 1.0 - pow(1.0 - along, 1.6);
  float angle = fall.y * mix(struck, along * along, fall.w);
  if (uRise.x >= 0.0) {
    // The last to fall is the first to stand.
    float up = clamp((uRise.x - (1.0 - order / uRise.w) * uRise.y) / uRise.z, 0.0, 1.0);
    angle *= 1.0 - up * up * (3.0 - 2.0 * up);
  }
  return angle;
}

float heatOf(vec4 fall) {
  float since = uTime - fall.x;
  if (since < 0.0 || uRise.x >= 0.0) return 0.0;
  return smoothstep(0.0, 0.02, since) * exp(-max(0.0, since - fall.z) / 0.42);
}

// A direction on a domino that has tipped forward by an angle, in the world.
vec3 turned(vec3 direction, vec4 place, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  vec3 tipped = vec3(direction.x, direction.y * c + direction.z * s, direction.z * c - direction.y * s);
  vec2 ahead = place.zw;
  vec2 across = vec2(ahead.y, -ahead.x);
  return vec3(across * tipped.x + ahead * tipped.y, tipped.z);
}

// A point of that domino. It tips about the front edge of its foot.
vec3 standing(vec3 local, vec4 place, float angle) {
  float hinge = 0.5 * uSize.y;
  return vec3(place.xy, 0.0) + turned(vec3(local.x, local.y - hinge, local.z), place, angle) + turned(vec3(0.0, hinge, 0.0), place, 0.0);
}
`;

// Shared by the dominoes and the floor: the lamps, the shadows, and the film.
const STUDIO = `
uniform float uSide; // 1, or -1 for a run that winds the other way: the lamps are then set up as in a mirror
#define KEY (${vec3(KEY)} * vec3(uSide, 1.0, 1.0))
#define FILL (${vec3(FILL)} * vec3(uSide, 1.0, 1.0))
#define STRIP (${vec3(STRIP)} * vec3(uSide, 1.0, 1.0))
#define KISS (${vec3(KISS)} * vec3(uSide, 1.0, 1.0))
const vec3 KEY_LIGHT = vec3(1.0, 0.95, 0.87) * 2.3; // what the key lamp lays on a surface that faces it
const vec3 FILL_LIGHT = vec3(0.72, 0.8, 1.0) * 0.55;
const vec3 HEAD_LIGHT = vec3(1.0, 0.95, 0.88) * 0.2; // the light from where the camera is
const vec3 SKY = vec3(0.1, 0.1, 0.15); // the dark room, from above
const vec3 BOUNCE = vec3(0.03, 0.026, 0.05); // and what comes back up off the floor
const vec3 KEY_LAMP = vec3(1.0, 0.95, 0.88) * 9.0; // how bright each lamp is when seen in a polished surface
const vec3 TOP_LAMP = vec3(0.75, 0.8, 1.0) * 1.2;
const vec3 STRIP_LAMP = vec3(0.6, 0.72, 1.0) * 5.0;
const vec3 KISS_LAMP = vec3(0.62, 0.42, 1.0) * 2.2;

uniform highp sampler2DShadow uShadow; // the key light's picture of the run: how far the nearest thing is
uniform mat4 uSun; // from the world into that picture
uniform float uTexel; // one dot of that picture

// How much of the key light reaches a point: 0 in full shadow, 1 in the open.
// Twelve looks in a spiral round the point, so that a shadow's edge is soft,
// as a big lamp's is. Each dot of the screen turns its spiral by a different
// angle, which leaves fine grain where a fixed pattern would leave steps.
const int LOOKS = 12;
float shade(vec3 point) {
  vec4 seen = uSun * vec4(point, 1.0);
  vec3 at = seen.xyz * 0.5 + 0.5;
  if (at.x <= 0.0 || at.x >= 1.0 || at.y <= 0.0 || at.y >= 1.0) return 1.0;
  float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float sum = 0.0;
  for (int look = 0; look < LOOKS; look += 1) {
    float reach = sqrt((float(look) + 0.5) / float(LOOKS)) * 3.6 * uTexel;
    float angle = float(look) * 2.39996323 + turn;
    sum += texture(uShadow, vec3(at.xy + vec2(cos(angle), sin(angle)) * reach, at.z - 0.0004));
  }
  return sum / float(LOOKS);
}

// The light that arrives from one direction: a dark room with four soft lamps.
// \`sun\` is how much of the key lamp this point can see, \`open\` how much of the rest.
vec3 studio(vec3 from, float sun, float open) {
  vec3 room = mix(vec3(0.01, 0.008, 0.022), vec3(0.06, 0.05, 0.11), smoothstep(-0.2, 0.9, from.z));
  float key = smoothstep(0.86, 0.97, dot(from, KEY));
  float top = smoothstep(0.55, 0.98, from.z);
  float strip = smoothstep(0.92, 0.985, dot(from, STRIP));
  float kiss = smoothstep(0.84, 0.97, dot(from, KISS));
  return (room + TOP_LAMP * top + STRIP_LAMP * strip + KISS_LAMP * kiss) * open + KEY_LAMP * key * sun;
}

// The same room with the lamps out of focus: what a satin surface shows of it.
vec3 glow(vec3 from, float sun, float open) {
  return KEY_LIGHT * max(dot(from, KEY), 0.0) * sun * 0.6
    + FILL_LIGHT * max(dot(from, FILL), 0.0) * 0.7
    + mix(BOUNCE, SKY, 0.5 + 0.5 * from.z) * 1.6 * open;
}

// Light into picture: a film curve (after Narkowicz's ACES fit), then the screen's own curve.
vec3 film(vec3 light) {
  vec3 exposed = (light * (2.51 * light + 0.03)) / (light * (2.43 * light + 0.59) + 0.14);
  return pow(clamp(exposed, 0.0, 1.0), vec3(1.0 / 2.2));
}

// Less than one step of screen colour, different at every dot, so that dark gradients do not band.
float grain() {
  return (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}
`;

// What a domino is cut from: stone has veins, wood has grain, metal is brushed.
const FIGURE = `
float speck(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

// A soft pattern with no repeat: 0 to 1.
float mottle(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(speck(cell), speck(cell + vec3(1.0, 0.0, 0.0)), f.x), mix(speck(cell + vec3(0.0, 1.0, 0.0)), speck(cell + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(speck(cell + vec3(0.0, 0.0, 1.0)), speck(cell + vec3(1.0, 0.0, 1.0)), f.x), mix(speck(cell + vec3(0.0, 1.0, 1.0)), speck(cell + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float cloud(vec3 p) {
  return 0.5 * mottle(p) + 0.3 * mottle(p * 2.03 + 7.1) + 0.2 * mottle(p * 4.01 + 13.7);
}

// How much of the second colour shows at a point inside the block. \`detail\`
// is 1 where the figure can be drawn cleanly and 0 where the domino is too
// small on the screen, and then the block takes its average colour.
float veins(vec3 p, float detail) {
  float warp = cloud(p * 1.7);
  float broad = 1.0 - smoothstep(0.0, 0.2, abs(sin(p.x * 2.1 + p.z * 3.3 + p.y * 1.3 + warp * 7.0)));
  float fine = 1.0 - smoothstep(0.0, 0.07, abs(sin(p.z * 9.0 - p.x * 5.0 + warp * 14.0)));
  return clamp(mix(0.2, broad * 0.85 + fine * 0.3 + (warp - 0.5) * 0.3, detail), 0.0, 1.0);
}

float rings(vec3 p, float detail) {
  vec3 q = vec3(p.x, p.y, p.z * 0.16); // the trunk runs up the domino, so the rings are drawn out along it
  float ring = length(q.xy + vec2(0.9, 0.3)) * 11.0 + q.z * 4.0 + cloud(q * 3.0) * 2.4;
  float band = smoothstep(0.1, 0.9, abs(fract(ring) - 0.5) * 2.0);
  float fibre = mottle(vec3(p.x * 60.0, p.y * 60.0, p.z * 3.0));
  return clamp(mix(0.45, band * 0.78 + fibre * 0.22, detail), 0.0, 1.0);
}
`;

export const BOX_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aCorner; // a corner of the box: x and y from -0.5 to 0.5, z from 0 to 1
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aFace; // where on its face this corner is (0 to 1), and the face's size
layout(location = 3) in vec4 aPlace; // per domino: x, y, and the way it faces (cosine, sine)
layout(location = 4) in vec4 aFall; // per domino: when it starts to fall, how far, how long, and how
layout(location = 5) in vec3 aAcross; // the way "across the face" points
layout(location = 6) in vec3 aUp; // the way "up the face" points
uniform mat4 uCamera;
uniform float uFlip; // 1 for the run itself, -1 for its reflection in the floor
// A new design spreads out from the middle of the run: how far it has reached
// (as a share of the run's radius), how bright the edge of the change is, and
// the run's radius.
uniform vec3 uSwap;
${MOTION}
out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out vec3 vAcross;
out vec3 vUp;
out vec4 vFace;
out float vHeat;
out float vTone;
out float vFar;
out float vFlash;
flat out int vDesign; // 0: the design that is leaving; 1: the one arriving

void main() {
  float order = float(gl_InstanceID);
  float angle = tipOf(aFall, order);
  vLocal = aCorner * uSize;
  vWorld = standing(vLocal, aPlace, angle);
  vNormal = turned(aNormal, aPlace, angle);
  vAcross = turned(aAcross, aPlace, angle);
  vUp = turned(aUp, aPlace, angle);
  vFace = aFace;
  vHeat = heatOf(aFall);
  vTone = fract(order * 0.6180339887); // no two neighbours quite the same shade
  float out_ = length(aPlace.xy) / uSwap.z;
  vDesign = out_ < uSwap.x ? 1 : 0;
  vFlash = uSwap.y * exp(-abs(out_ - uSwap.x) * 16.0);
  gl_Position = uCamera * vec4(vWorld.xy, vWorld.z * uFlip, 1.0);
  vFar = gl_Position.w;
}
`;

export const BOX_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in vec3 vAcross;
in vec3 vUp;
in vec4 vFace;
in float vHeat;
in float vTone;
in float vFar;
in float vFlash;
flat in int vDesign;
uniform vec3 uEye;
uniform vec2 uReach; // how far away the haze begins, and where it is thickest
uniform float uFlip;
uniform float uPlinth; // the floor's radius
// What the dominoes are made of: two designs, the one leaving and the one arriving.
uniform vec3 uBody[2]; // the colour of the block
uniform vec3 uVein[2]; // its second colour
uniform vec3 uMark[2]; // the colour of the pips and the bar
uniform vec4 uLook[2]; // how the block is figured (0 plain, 1 veined, 2 grained, 3 brushed); metal; polish; how the marks glow
uniform float uInlay[2]; // 1 if the marks are inlaid metal
${STUDIO}
${FIGURE}
out vec4 colour;

const float BEVEL = 0.035; // how far in from an edge the rounding reaches, in domino heights
const vec3 PINK = vec3(1.0, 0.07, 0.3);

void main() {
  int design = vDesign;
  vec4 look = uLook[design];
  vec3 flat_ = normalize(vNormal);
  vec3 across = normalize(vAcross);
  vec3 up = normalize(vUp);
  vec2 size = vFace.zw;
  vec2 onFace = vFace.xy * size; // where on its face, in domino heights
  vec2 fromEdge = min(onFace, size - onFace);
  float dot_ = max(fwidth(onFace.x), fwidth(onFace.y)); // how much of the face one dot of the screen covers

  // Rounded edges: close to an edge the surface turns towards the face round
  // the corner, which is where a polished block catches its glints. A domino
  // too small on the screen to show this is drawn with plain edges.
  vec2 bend = clamp(1.0 - fromEdge / BEVEL, 0.0, 1.0);
  vec2 side = sign(vFace.xy - 0.5);
  float fine = 1.0 - smoothstep(0.6, 2.2, dot_ / BEVEL);
  vec3 normal = flat_ + fine * (across * side.x * bend.x + up * side.y * bend.y);

  // The two broad faces carry a bar across the middle and a pip in each half,
  // as the game's dominoes do, in shallow cuts. They fade out when too small
  // to draw cleanly.
  float mark = 0.0;
  if (size.y > 0.9 && size.x > 0.4) {
    vec2 p = onFace - 0.5 * size; // from the middle of the face
    float clear = 1.0 - smoothstep(0.025, 0.07, dot_);
    float bar = (1.0 - smoothstep(0.014, 0.024, abs(p.y))) * (1.0 - smoothstep(0.13, 0.14, abs(p.x)));
    vec2 q = vec2(p.x, (abs(p.y) - 0.25) * sign(p.y)); // from the middle of the nearer pip
    float pip = 1.0 - smoothstep(0.042, 0.054, length(q));
    mark = max(bar, pip) * clear;
    normal -= (across * q.x + up * q.y) * (pip * clear * 0.7 / 0.054); // a pip is a bowl: its wall leans inwards
  }
  normal = normalize(normal);

  // What the block is cut from. Each domino comes from a different part of the stone or the plank.
  float detail = 1.0 - smoothstep(0.02, 0.09, dot_);
  vec3 inside = vLocal + vTone * vec3(31.0, 17.0, 23.0);
  vec3 body = uBody[design];
  float sheen = 1.0; // how evenly the polish lies
  if (look.x > 2.5) {
    sheen = mix(1.0, 0.5 + mottle(vec3(inside.x * 70.0, inside.y * 70.0, inside.z * 1.6)), detail); // brushed along its length
  } else if (look.x > 1.5) {
    body = mix(uVein[design], body, rings(inside, detail));
  } else if (look.x > 0.5) {
    body = mix(body, uVein[design], veins(inside, detail));
  }
  body *= 0.94 + 0.12 * vTone;

  vec3 paint = mix(body, uMark[design], mark);
  float metal = mix(look.y, uInlay[design], mark);
  float polish = mix(look.z, 0.9, mark);

  // What is seen in the floor is the run as an eye under the floor would see it.
  vec3 eye = uFlip < 0.0 ? vec3(uEye.xy, -uEye.z) : uEye;
  vec3 toEye = normalize(eye - vWorld);
  float sun = dot(flat_, KEY) > 0.0 ? shade(vWorld + flat_ * 0.035) : 0.0;
  // Low down, and on the faces that look at a neighbour, less of the room can be seen.
  float open = mix(mix(0.3, 1.0, smoothstep(0.0, 0.85, vWorld.z)), 1.0, 0.6 * clamp(flat_.z, 0.0, 1.0));

  vec3 lamps = KEY_LIGHT * max(dot(normal, KEY), 0.0) * sun
    + FILL_LIGHT * max(dot(normal, FILL), 0.0) * mix(open, 1.0, 0.4)
    + HEAD_LIGHT * max(dot(normal, toEye), 0.0) * mix(open, 1.0, 0.5)
    + mix(BOUNCE, SKY, 0.5 + 0.5 * normal.z) * open;
  // The polish: a little of the room is mirrored, more of it at a glancing
  // angle. Metal mirrors nearly all of it, in its own colour. A mirror finish
  // shows the lamps themselves; a satin one only their glow.
  vec3 straight = mix(vec3(0.04 + 0.03 * polish), paint, metal);
  vec3 mirrored = straight + (1.0 - straight) * pow(1.0 - max(dot(normal, toEye), 0.0), 5.0) * mix(0.25, 0.75, polish);
  vec3 from = reflect(-toEye, normal);
  vec3 seen = mix(glow(from, sun, open), studio(from, sun, open), polish * polish) * sheen;
  vec3 lit = paint * lamps * (1.0 - metal) * (1.0 - mirrored) + seen * mirrored;

  // Marks that shine by themselves, and brighter when the domino is struck.
  lit += uMark[design] * look.w * mark * (1.5 + 2.5 * vHeat);
  // A domino that has just been struck burns pink, brightest along its edges.
  vec3 hot = lit * (1.0 - 0.6 * vHeat) + PINK * vHeat * (1.1 + 1.3 * max(bend.x, bend.y));
  // The edge of a change of design passes as a breath of cold light.
  hot += vec3(0.7, 0.82, 1.0) * vFlash * 1.3;

  vec3 shown = film(hot);
  shown = mix(shown, vec3(0.07, 0.055, 0.13), 0.34 * smoothstep(uReach.x, uReach.y, vFar));

  if (uFlip > 0.0) {
    colour = vec4(shown + grain(), 1.0);
    return;
  }
  // The reflection: seen at the point where the line of sight meets the floor,
  // only on the floor, and fainter the higher up the domino it comes from.
  vec2 onFloor = uEye.xy + (vWorld.xy - uEye.xy) * (uEye.z / (uEye.z + vWorld.z));
  float kept = 1.0 - smoothstep(uPlinth - 0.5, uPlinth - 0.06, length(onFloor));
  if (kept <= 0.0) discard;
  colour = vec4(shown * 0.36 * exp(-1.1 * vWorld.z) * kept, kept);
}
`;

// The key light's picture: only how far away things are. Of each domino it
// keeps the faces that look away from the light, so that a face in the light
// is never taken to be in its own shadow.
export const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aCorner;
layout(location = 1) in vec3 aNormal;
layout(location = 3) in vec4 aPlace;
layout(location = 4) in vec4 aFall;
uniform mat4 uSun;
${MOTION}
uniform float uSide;

void main() {
  float angle = tipOf(aFall, float(gl_InstanceID));
  bool lit = dot(turned(aNormal, aPlace, angle), ${vec3(KEY)} * vec3(uSide, 1.0, 1.0)) > 0.0;
  // A face in the light is sent off the picture altogether.
  gl_Position = lit ? vec4(2.0, 2.0, 2.0, 1.0) : uSun * vec4(standing(aCorner * uSize, aPlace, angle), 1.0);
}
`;

export const SHADOW_FRAGMENT = `#version 300 es
precision highp float;

void main() {
}
`;

// The pink light of a struck domino: on the floor under it, and as a haze in
// the air over it.
export const GLOW_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aSpot; // a corner of a square, -1 to 1
layout(location = 3) in vec4 aPlace;
layout(location = 4) in vec4 aFall;
uniform mat4 uCamera;
uniform float uSpread;
uniform float uLift; // how far above the floor
${MOTION}
out vec2 vSpot;
out float vHeat;

void main() {
  vHeat = heatOf(aFall);
  vSpot = aSpot;
  // A cold domino's square shrinks to a point, so it costs nothing to draw.
  vec2 at = aPlace.xy + aPlace.zw * 0.3 + aSpot * uSpread * step(0.004, vHeat);
  gl_Position = uCamera * vec4(at, uLift, 1.0);
}
`;

export const GLOW_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vSpot;
in float vHeat;
uniform float uGain;
out vec4 colour;

void main() {
  float fall = max(0.0, 1.0 - length(vSpot));
  colour = vec4(vec3(1.0, 0.2, 0.56) * fall * fall * vHeat * uGain, 0.0);
}
`;

// The disc the run stands on: dark lacquer, turned on a lathe.
export const FLOOR_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aSpot;
uniform mat4 uCamera;
uniform float uRadius;
out vec2 vSpot;

void main() {
  vSpot = aSpot * 1.2;
  gl_Position = uCamera * vec4(vSpot * uRadius, 0.0, 1.0);
}
`;

export const FLOOR_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vSpot;
uniform float uRadius;
uniform vec3 uEye;
${STUDIO}
out vec4 colour;

void main() {
  float r = length(vSpot);
  float dot_ = fwidth(r);
  float disc = 1.0 - smoothstep(1.0 - dot_, 1.0 + dot_, r);
  if (disc <= 0.0) discard;

  vec3 point = vec3(vSpot * uRadius, 0.0);
  vec3 toEye = normalize(uEye - point);
  float sun = shade(point + vec3(0.0, 0.0, 0.02));

  vec3 lacquer = mix(vec3(0.02, 0.016, 0.042), vec3(0.01, 0.008, 0.024), smoothstep(0.0, 1.0, r));
  vec3 light = lacquer * (KEY_LIGHT * KEY.z * sun + SKY * 0.7);
  // The lathe's fine rings catch the key light in two fans, one towards it and one away.
  vec2 outward = r > 0.0001 ? vSpot / r : vec2(1.0, 0.0);
  float along = dot(vec3(-outward.y, outward.x, 0.0), normalize(KEY + toEye));
  light += KEY_LIGHT * 0.016 * pow(max(0.0, 1.0 - along * along), 70.0) * sun;
  // The room in the lacquer: the lamps behind the run lie across it as a sheen.
  float mirrored = 0.04 + 0.96 * pow(1.0 - toEye.z, 5.0);
  light += studio(vec3(-toEye.xy, toEye.z), sun, 1.0) * mirrored * 0.15;

  vec3 shown = film(light) + grain();
  // The edge of the disc is cut to a fine bright line.
  float rim = 1.0 - smoothstep(0.0, 1.5 * dot_, abs(r - 0.985));
  shown = mix(shown, vec3(0.36, 0.3, 0.68), 0.5 * rim);
  colour = vec4(shown * disc, disc);
}
`;

// The lens. The finished picture and how far away each dot of it is go in;
// what comes out is sharp only at the distance the lens is focused on. Every
// dot gathers light from the dots round it whose blur is wide enough to reach
// it (after Dennis Gustafsson's one-pass method).
export const LENS_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aSpot;
out vec2 vAt;

void main() {
  vAt = aSpot * 0.5 + 0.5;
  gl_Position = vec4(aSpot, 0.0, 1.0);
}
`;

/** @param {number} taps how many of its neighbours each dot looks at: more is smoother and slower */
export const lensFragment = (taps) => `#version 300 es
precision highp float;
in vec2 vAt;
uniform sampler2D uScene;
uniform highp sampler2D uDepth;
uniform vec2 uDot; // one dot of the picture
uniform vec4 uLens; // the nearest and furthest the lens draws, the distance in focus, and how fast blur grows away from it (in dots)
uniform float uMost; // the widest blur drawn, in dots
out vec4 colour;

// A lens lets a little less light through to the corners of the picture.
vec4 fallingOff(vec4 light) {
  vec2 from = (vAt - 0.5) * 2.0;
  return vec4(light.rgb * (1.0 - 0.34 * smoothstep(0.55, 1.5, length(from))), light.a);
}

const int TAPS = ${taps};

float distanceAt(vec2 at) {
  float depth = texture(uDepth, at).r * 2.0 - 1.0;
  return 2.0 * uLens.x * uLens.y / (uLens.y + uLens.x - depth * (uLens.y - uLens.x));
}

float blurAt(float distance_) {
  return min(uMost, uLens.w * abs(distance_ - uLens.z) / distance_);
}

void main() {
  vec4 sum = texture(uScene, vAt);
  if (uMost < 0.5) {
    colour = fallingOff(sum);
    return;
  }
  float here = distanceAt(vAt);
  float mine = blurAt(here);
  // Each dot turns its ring of looks by a different angle, so that what is left of the pattern is fine grain.
  float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float count = 1.0;
  for (int tap = 1; tap <= TAPS; tap += 1) {
    float reach = sqrt(float(tap) / float(TAPS)) * uMost;
    float angle = float(tap) * 2.39996323 + turn;
    vec2 at = vAt + vec2(cos(angle), sin(angle)) * reach * uDot;
    float there = distanceAt(at);
    float theirs = blurAt(there);
    // What lies behind cannot spread over what is sharp in front of it.
    if (there > here) theirs = min(theirs, mine * 2.0);
    sum += mix(sum / count, texture(uScene, at), smoothstep(reach - 0.5, reach + 0.5, theirs));
    count += 1.0;
  }
  colour = fallingOff(sum / count);
}
`;
