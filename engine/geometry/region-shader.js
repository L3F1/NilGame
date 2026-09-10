// The S3 region field, written twice: once as GLSL for the marcher and once as
// JavaScript for a test to check the GLSL against. Host-free -- no canvas, no
// GL context, no document.
//
// WHY THE PACKING IS ITS OWN MODULE. What a renderer gets wrong is almost never
// the ray loop; it is the translation from "seven authored entities, one of
// which carves another" into flat uniform arrays. That step has no pixels in
// it, so it can be checked in Node against the SAME field the walker collides
// with, sample by sample -- and if the packing agrees with the field and the
// shader agrees with the packing, the picture and the physics cannot disagree
// without one of the two checks noticing.
//
// `packedDistance` below is therefore not a convenience. It is the reference
// the GLSL is written to match, and it is deliberately written in the shader's
// shape -- same loops, same max-then-min, same clamps -- rather than in the
// nicest JavaScript, because a reference that reorganises the computation is
// checking something else.
//
// SCOPE: one S3 region. No portals, no second region, no E3. Anything else is
// rejected by `packRegionScene` with a message naming what it found, because a
// renderer that quietly draws a scene it does not understand is worse than one
// that refuses -- the picture looks like evidence.

/** What one program can hold. Small on purpose; see the note in the renderer. */
export const REGION_RENDER_LIMITS = Object.freeze({
  primitives: 16, planes: 72, groups: 12, steps: 160,
});

const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

/**
 * Flatten one S3 region into the arrays the shader indexes.
 *
 * The grouping mirrors `region-world.js`'s `sphereField` exactly: every
 * ADDITIVE solid opens a group, every modifier joins the group of the solid it
 * targets, and the scene is the MIN over groups of the MAX within one. A
 * modifier with no target applies to every solid, so it is copied into each
 * group -- flat arrays have no other way to say "this one belongs to all of
 * them", and copying it is honest about what it then costs.
 *
 * `signedGroup` packs two facts into the one float the shader has spare:
 * its magnitude is the group index plus one, and its sign is the sign the
 * modifier contributes (`subtract` negates, `add` and `intersect` do not).
 * Zero is not a usable group index, which is why it is offset by one.
 */
export function packRegionScene(world, regionId, limits = REGION_RENDER_LIMITS) {
  const data = world.renderData();
  const region = data.regions.find((r) => r.id === regionId);
  if (!region) throw new Error(`Unknown region ${regionId}`);
  if (data.regions.length !== 1) {
    throw new Error(`This viewport draws ONE region; the scene has ${data.regions.length}. `
      + 'Cross-region rendering is a separate task, and drawing only the near '
      + 'side would show a destination that is not there.');
  }
  if (data.portals.length) {
    throw new Error(`This viewport does not draw portals; the scene has ${data.portals.length / 2} `
      + 'connection(s). A portal drawn as a wall is a false picture of where you can walk.');
  }
  if (region.kind !== 's3') {
    throw new Error(`This viewport draws S3 regions; region ${regionId} is ${region.kind.toUpperCase()}. `
      + 'The flat lab (tools/ball-lab.html) draws E3.');
  }

  const packets = data.primitives.filter((p) => p.regionId === regionId);
  const added = packets.filter((p) => !p.op || p.op === 'add');
  const modifiers = packets.filter((p) => p.op && p.op !== 'add');
  if (!added.length) throw new Error(`Region ${regionId} has no additive solid to draw.`);

  const planes = [];
  const primitives = [];
  const push = (packet, group, sign) => {
    const start = planes.length;
    // Kept at full precision. Narrowing to float32 is the GPU's loss and it is
    // taken once, at upload, where it can be measured -- doing it here would
    // fold a rendering cost into the reference the field is compared against.
    for (const plane of packet.planes) planes.push(plane.slice());
    primitives.push({
      id: packet.id, kind: packet.kind, group, sign,
      planeStart: start, planeCount: packet.planes.length,
      center: packet.center.slice(),
      radius: packet.radius ?? 0,
      signedGroup: (group + 1) * sign,
    });
  };
  added.forEach((base, group) => {
    push(base, group, 1);
    for (const modifier of modifiers) {
      if (modifier.target && modifier.target !== base.id) continue;
      push(modifier, group, modifier.op === 'subtract' ? -1 : 1);
    }
  });

  if (added.length > limits.groups) {
    throw new Error(`Scene needs ${added.length} solid groups; this viewport holds ${limits.groups}.`);
  }
  if (primitives.length > limits.primitives) {
    throw new Error(`Scene needs ${primitives.length} primitive slots; this viewport holds ${limits.primitives}.`);
  }
  if (planes.length > limits.planes) {
    throw new Error(`Scene needs ${planes.length} face planes; this viewport holds ${limits.planes}.`);
  }

  const R = region.curvatureRadius;
  return {
    regionId, curvatureRadius: R, extent: region.extent,
    // `withinDomain` on S3 is `p[3] > cos(extent / R)`, and an extent of
    // exactly a quarter turn puts the boundary at the equator.
    boundaryHeight: region.extent >= Math.PI * R / 2 ? 0 : Math.cos(region.extent / R),
    groups: added.length, primitives, planes,
  };
}

/** One primitive's distance, in the shader's shape. */
function primitiveDistance(packed, primitive, p) {
  const R = packed.curvatureRadius;
  if (primitive.planeCount === 0) {
    // The metric ball, by the same stable half-angle form metric-space uses:
    // both chords stay well conditioned at coincident AND antipodal points.
    const c = primitive.center;
    const difference = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2], p[3] - c[3]);
    const sum = Math.hypot(p[0] + c[0], p[1] + c[1], p[2] + c[2], p[3] + c[3]);
    return 2 * R * Math.atan2(difference, sum) - primitive.radius;
  }
  // A cell is the intersection of half-spaces bounded by great spheres, so its
  // bound is the MAX over faces -- and it is a bound, under-reporting near a
  // seam, which is what makes sphere tracing against it safe.
  let best = -Infinity;
  for (let j = 0; j < primitive.planeCount; j++) {
    best = Math.max(best, R * Math.asin(clamp1(dot4(p, packed.planes[primitive.planeStart + j]))));
  }
  return best;
}

/**
 * The packed scene's distance at `p`, and which primitive decided it.
 *
 * This is the reference the GLSL is written against. It answers with the OWNER
 * as well, because the shader needs one to colour by and a test that only
 * compares distances would not notice the two swapping.
 */
export function packedSample(packed, p) {
  const group = new Array(packed.groups).fill(-Infinity);
  const owner = new Array(packed.groups).fill(-1);
  for (let i = 0; i < packed.primitives.length; i++) {
    const primitive = packed.primitives[i];
    const value = primitive.sign * primitiveDistance(packed, primitive, p);
    if (value > group[primitive.group]) { group[primitive.group] = value; owner[primitive.group] = i; }
  }
  let best = Infinity, winner = -1;
  for (let k = 0; k < packed.groups; k++) {
    if (group[k] < best) { best = group[k]; winner = owner[k]; }
  }
  return { distance: best, owner: winner };
}

export const packedDistance = (packed, p) => packedSample(packed, p).distance;

/**
 * The outward normal at `p` for the primitive that won there, as a unit tangent.
 *
 * A carved face is the CARVER's surface with its normal flipped, which is the
 * `sign` factor -- the same rule the field uses, and the reason a doorway's jamb
 * shades as a wall rather than as the inside of the box that cut it.
 */
export function packedNormal(packed, p, index) {
  const primitive = packed.primitives[index];
  const R = packed.curvatureRadius;
  let raw;
  if (primitive.planeCount === 0) {
    const c = primitive.center, along = dot4(p, c);
    raw = [0, 1, 2, 3].map((i) => along * p[i] - c[i]);
  } else {
    let best = -Infinity, plane = null;
    for (let j = 0; j < primitive.planeCount; j++) {
      const n = packed.planes[primitive.planeStart + j];
      const d = R * Math.asin(clamp1(dot4(p, n)));
      if (d > best) { best = d; plane = n; }
    }
    const along = dot4(p, plane);
    raw = [0, 1, 2, 3].map((i) => plane[i] - along * p[i]);
  }
  const length = Math.hypot(...raw);
  if (!(length > 1e-12)) return null;
  return raw.map((x) => (x / length) * primitive.sign);
}

/**
 * The marcher.
 *
 * The ray is a GREAT CIRCLE, not a line: `cos(t/R) * eye + sin(t/R) * dir` is
 * the geodesic through `eye` with unit tangent `dir`, and it is the same
 * formula `metric-space.stepWithTransport` advances the walker along. Writing
 * `eye + t * dir` here instead would put the sample point off the sphere
 * entirely and the picture would disagree with the collision field everywhere
 * except near the eye.
 *
 * Three ways to stop, and they are drawn differently on purpose: a surface, the
 * CHART EDGE (which is a numerical boundary and not a wall, so it gets its own
 * colour rather than a shaded face), and the step budget.
 */
export const REGION_S3_GLSL = `#version 300 es
precision highp float;
#define MAX_PRIMS ${REGION_RENDER_LIMITS.primitives}
#define MAX_PLANES ${REGION_RENDER_LIMITS.planes}
#define MAX_GROUPS ${REGION_RENDER_LIMITS.groups}
#define MAX_STEPS ${REGION_RENDER_LIMITS.steps}

uniform vec4 uPlane[MAX_PLANES];
uniform vec4 uPrimCenter[MAX_PRIMS];
// x: first plane, y: plane count (0 means a metric ball), z: ball radius,
// w: signed group -- magnitude is the group index plus one, sign is the
// modifier's sign. See packRegionScene.
uniform vec4 uPrimA[MAX_PRIMS];
uniform int uPrimCount;
uniform int uGroupCount;
uniform float uR;
uniform float uBoundaryHeight;
uniform float uMaxTravel;
// The step bound lives in a UNIFORM so the D3D compiler cannot unroll the march
// and paste the scene function a hundred and sixty times; a literal bound is
// what once took a shader link from five seconds to two hundred.
uniform int uSteps;
uniform float uEpsilon;
uniform vec4 uEye;
uniform vec4 uFwd;
uniform vec4 uRight;
uniform vec4 uUp;
uniform vec4 uLight;
uniform vec2 uRes;
uniform float uFocal;
uniform int uSelected;
uniform int uFloorPrim;
out vec4 fragColor;

float primitiveDistance(int i, vec4 p) {
  vec4 a = uPrimA[i];
  int count = int(a.y);
  if (count == 0) {
    vec4 c = uPrimCenter[i];
    return 2.0 * uR * atan(length(p - c), length(p + c)) - a.z;
  }
  int start = int(a.x);
  float best = -1e30;
  for (int j = 0; j < MAX_PLANES; j++) {
    if (j >= count) break;
    best = max(best, uR * asin(clamp(dot(p, uPlane[start + j]), -1.0, 1.0)));
  }
  return best;
}

// MIN over groups of the MAX within one, exactly as sphereField composes it.
float sceneSample(vec4 p, out int winner) {
  float group[MAX_GROUPS];
  int owner[MAX_GROUPS];
  for (int k = 0; k < MAX_GROUPS; k++) { group[k] = -1e30; owner[k] = -1; }
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i >= uPrimCount) break;
    float signedGroup = uPrimA[i].w;
    int g = int(abs(signedGroup)) - 1;
    float s = (signedGroup < 0.0 ? -1.0 : 1.0) * primitiveDistance(i, p);
    if (s > group[g]) { group[g] = s; owner[g] = i; }
  }
  float best = 1e30;
  winner = -1;
  for (int k = 0; k < MAX_GROUPS; k++) {
    if (k >= uGroupCount) break;
    if (group[k] < best) { best = group[k]; winner = owner[k]; }
  }
  return best;
}

float sceneDistance(vec4 p) { int ignored; return sceneSample(p, ignored); }

vec4 surfaceNormal(vec4 p, int index) {
  vec4 a = uPrimA[index];
  float sign = a.w < 0.0 ? -1.0 : 1.0;
  vec4 raw;
  if (int(a.y) == 0) {
    vec4 c = uPrimCenter[index];
    raw = dot(p, c) * p - c;
  } else {
    int start = int(a.x), count = int(a.y);
    float best = -1e30;
    vec4 plane = vec4(0.0);
    for (int j = 0; j < MAX_PLANES; j++) {
      if (j >= count) break;
      vec4 n = uPlane[start + j];
      float d = uR * asin(clamp(dot(p, n), -1.0, 1.0));
      if (d > best) { best = d; plane = n; }
    }
    raw = plane - dot(p, plane) * p;
  }
  float len = length(raw);
  return len > 1e-9 ? sign * raw / len : vec4(0.0);
}

/** Authored radial coordinates, so a checker drawn on them shows the curvature. */
vec3 chartCoords(vec4 p) {
  float radial = length(p.xyz);
  if (radial < 1e-9) return vec3(0.0);
  return p.xyz * (uR * atan(radial, p.w) / radial);
}

vec3 palette(int i) {
  float h = fract(float(i) * 0.184 + 0.06);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return mix(vec3(0.62), c, 0.45);
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  // The pixel direction is a combination of three orthonormal TANGENT vectors
  // at the eye, so it is tangent there too, and normalising in R4 makes it a
  // unit physical direction. There is no "look-at matrix" on a sphere.
  vec4 dir = normalize(uFwd * uFocal + uRight * uv.x + uUp * uv.y);
  vec3 sky = mix(vec3(0.035, 0.055, 0.085), vec3(0.10, 0.15, 0.21),
    clamp(0.5 + 0.35 * uv.y, 0.0, 1.0));
  vec3 color = sky;
  float t = 0.0;
  int winner = -1;
  bool hit = false, outside = false;
  vec4 p = uEye;
  for (int s = 0; s < MAX_STEPS; s++) {
    if (s >= uSteps) break;
    float a = t / uR;
    p = cos(a) * uEye + sin(a) * dir;
    if (p.w <= uBoundaryHeight) { outside = true; break; }
    float d = sceneSample(p, winner);
    if (d < uEpsilon) { hit = true; break; }
    t += max(d, uEpsilon);
    if (t > uMaxTravel) break;
  }
  if (hit && winner >= 0) {
    vec4 n = surfaceNormal(p, winner);
    // A real point light on the sphere: the tangent at the surface pointing at
    // the light's position, which is the log map and not a constant vector.
    vec4 toLight = uLight - dot(p, uLight) * p;
    float lightLen = length(toLight);
    vec4 L = lightLen > 1e-9 ? toLight / lightLen : -dir;
    float diffuse = max(dot(n, L), 0.0);
    float facing = max(dot(n, -dir), 0.0);
    vec3 base = palette(winner);
    if (int(uPrimA[winner].y) == 1 || winner == uFloorPrim) {
      // A checker on the AUTHORED coordinates. Straight there, curved here --
      // which is the whole point of standing in the room.
      vec3 c = chartCoords(p);
      float tile = mod(floor(c.x) + floor(c.y), 2.0);
      base = mix(base * 0.72, base * 1.08, tile);
    }
    if (winner == uSelected) base = mix(base, vec3(1.0, 0.86, 0.35), 0.45);
    color = base * (0.18 + 0.62 * diffuse + 0.22 * facing);
    color = mix(color, sky, clamp(t / uMaxTravel, 0.0, 1.0));
  } else if (outside) {
    // THE CHART EDGE IS NOT A WALL. Drawn as its own colour so an author can
    // see where the numbers stop meaning something, and never shaded as a face.
    color = mix(vec3(0.30, 0.10, 0.13), vec3(0.44, 0.16, 0.18),
      clamp(0.5 + 0.35 * uv.y, 0.0, 1.0));
  }
  fragColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;
