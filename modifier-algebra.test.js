// MUSE-27: the modifier algebra, tested rather than asserted.
//
// scene-field.js claims a global modifier EQUALS per-solid targeted copies
// because max distributes over min. A comment asserting an algebraic law is
// true when written and false after a refactor, so this file checks what the
// field COMPUTES: same scenes built both ways, distance AND normal compared
// at deterministic grid points that include the seams (modifier-boundary
// band and the junction between the two solids), plus order-independence,
// idempotence, and isolation of targeted modifiers.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';

const doc = (id, entities) => ({
  format: 'nil-scene', version: 1, id,
  units: { name: 'design-unit', playerRadius: 0.25 },
  regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
  entities, connections: [],
});
const ground = { id: 'ground', regionId: 'r', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] };
const ballA = { id: 'a', regionId: 'r', kind: 'ball', position: [-2, 0, 1], radius: 1 };
const ballB = { id: 'b', regionId: 'r', kind: 'ball', position: [2, 0, 1], radius: 1 };
const spawn = { id: 'start', regionId: 'r', kind: 'spawn', position: [0, -5, 0.3] };
const mod = (id, op, target, position, radius) =>
  ({ id, regionId: 'r', kind: 'ball', op, target, position, radius });

// Grid over both solids and the gap, plus a band hugging the modifier
// boundary where max is not exact. Deterministic; seams included by
// construction rather than by luck.
function gridAround(modCenter, modR) {
  const pts = [];
  for (let x = -4; x <= 4.01; x += 0.4) for (const z of [0.05, 0.5, 1, 1.5, 2, 2.5]) {
    pts.push([x, 0, z]);
  }
  for (let a = 0; a < 40; a++) {
    const t = a * 0.55;
    pts.push([modCenter[0] + Math.cos(t) * (modR + 0.07), 0, modCenter[2] + Math.sin(t) * (modR + 0.07)]);
    pts.push([modCenter[0] + Math.cos(t) * (modR - 0.07), 0, modCenter[2] + Math.sin(t) * (modR - 0.07)]);
  }
  return pts;
}

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

function compareFields(name, f, g, points, { normals = true } = {}) {
  let worstD = 0, worstN = 0, atD = null, atN = null, n = 0;
  const bad = [];
  for (const p of points) {
    n++;
    const d0 = f.distance(p), d1 = g.distance(p);
    const dd = Math.abs(d0 - d1);
    if (!(dd <= 0)) bad.push(`distance differs at ${JSON.stringify(p)}: ${d0} vs ${d1}`);
    else if (dd > worstD) { worstD = dd; atD = p; }
    if (normals) {
      const n0 = f.normal(p), n1 = g.normal(p);
      if ((n0 === null) !== (n1 === null)) bad.push(`null mismatch at ${JSON.stringify(p)}`);
      else if (n0 && n1) {
        const dn = Math.hypot(n0[0] - n1[0], n0[1] - n1[1], n0[2] - n1[2]);
        if (!(dn <= 0)) bad.push(`normal differs at ${JSON.stringify(p)}`);
        else if (dn > worstN) { worstN = dn; atN = p; }
      }
    }
  }
  console.log(`${name}: ${n} points, worst |dd| ${worstD.toExponential(2)} at ${JSON.stringify(atD)}, `
    + `worst |dn| ${worstN.toExponential(2)} at ${JSON.stringify(atN)}`);
  return bad;
}

// The identity, both signs: one global modifier vs a targeted copy per solid.
for (const op of ['subtract', 'intersect']) {
  const c = op === 'subtract' ? [-2, 0, 1.4] : [-2, 0, 1];
  const r = op === 'subtract' ? 1.2 : 2.5;
  const global = compileSceneField(doc(`g-${op}`,
    [ground, ballA, ballB, spawn, mod('m', op, null, c, r)]));
  const scoped = compileSceneField(doc(`s-${op}`,
    [ground, ballA, ballB, spawn, mod('m-a', op, 'a', c, r), mod('m-b', op, 'b', c, r),
      mod('m-g', op, 'ground', c, r)]));
  check(`global ${op} == targeted copies (distance+normal)`, () => {
    const bad = compareFields(`identity/${op}`, global, scoped, gridAround(c, r));
    assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
  });
}

check('order-independence: carve then clip == clip then carve', () => {
  const ab = compileSceneField(doc('ab', [ground, ballA, ballB, spawn,
    mod('carve', 'subtract', 'a', [-2, 0, 1.5], 0.7),
    mod('clip', 'intersect', 'a', [-1.2, 0, 0.6], 1.1)]));
  const ba = compileSceneField(doc('ba', [ground, ballA, ballB, spawn,
    mod('clip', 'intersect', 'a', [-1.2, 0, 0.6], 1.1),
    mod('carve', 'subtract', 'a', [-2, 0, 1.5], 0.7)]));
  const bad = compareFields('order', ab, ba, gridAround([-2, 0, 1.2], 1.4));
  assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
});

check('idempotence: the same carve twice == once', () => {
  const once = compileSceneField(doc('once', [ground, ballA, ballB, spawn,
    mod('carve', 'subtract', 'a', [-2, 0, 1.4], 1.2)]));
  const twice = compileSceneField(doc('twice', [ground, ballA, ballB, spawn,
    mod('carve', 'subtract', 'a', [-2, 0, 1.4], 1.2),
    mod('carve2', 'subtract', 'a', [-2, 0, 1.4], 1.2)]));
  const bad = compareFields('idempotent', once, twice, gridAround([-2, 0, 1.4], 1.2));
  assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
});

check('isolation: a carve on A leaves B bitwise alone', () => {
  const bare = compileSceneField(doc('bare', [ground, ballA, ballB, spawn]));
  const cut = compileSceneField(doc('cut', [ground, ballA, ballB, spawn,
    mod('carve', 'subtract', 'a', [-2, 0, 1.4], 1.2)]));
  // Near B, far from A and from the carve: the carve must not reach here.
  // B centre [2,0,1], carve centre [-2,0,1.4] r 1.2: nearest approach 4-1.2.
  const nearB = [];
  for (let x = 0.5; x <= 4.01; x += 0.35) for (const z of [0.2, 1, 1.8]) nearB.push([x, 0, z]);
  const bad = compareFields('isolation', bare, cut, nearB);
  assert.equal(bad.length, 0, bad.slice(0, 3).join(' | '));
});

console.log(`\nmodifier-algebra: ${passed} checks passed, ${failed} failed\n`);
if (failed) process.exit(1);
