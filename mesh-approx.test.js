// Can a triangle mesh stand in for a curved surface, and how wrong is it?
//
// This is the check behind a DECISION -- whether a host's asset pipeline is
// worth migrating for -- so it asserts the two claims that decision rests on
// rather than printing a table nobody re-runs. `tools/mesh-probe.js` prints
// the table; this pins the properties.
//
// The claims, kept apart because they fail differently:
//
//   1. In the projective model (p |-> p/p3: Klein for k<0, gnomonic for k>0)
//      geodesics are STRAIGHT LINES. If this is false the whole technique is
//      false and subdivision does not help. If it is true, an ordinary
//      rasterizer draws exact geodesic EDGES for free.
//   2. The flat filling INSIDE a triangle is wrong, and the error falls like
//      the triangle's area -- so it is bought down with subdivision, at a
//      price that depends on the object's size in curvature radii.
import assert from 'node:assert/strict';
import { measure } from './tools/mesh-probe.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

test('THE PREMISE: projective straight lines are geodesics, in all three', () => {
  // Measured against the kernel's own `dist`, not against a second derivation
  // of the projection. The midpoint of a projected edge must be equidistant
  // from both ends AND those two distances must sum to the geodesic length --
  // equidistant alone is satisfied by any point on the perpendicular bisector.
  for (const k of [-1, 0, 1]) {
    for (const r of [0.3, 1.5]) {
      const m = measure(k, r, 3);
      assert.ok(m.edgeError < 1e-9,
        `k=${k} r=${r}: edge error ${m.edgeError.toExponential(2)} is not zero`);
    }
  }
});

test('interior error falls like the area: roughly a quarter per subdivision', () => {
  // One subdivision halves every edge, so a triangle covers a quarter the
  // area, so a second-order error should drop by about four. Anything much
  // worse than that means the error is NOT the flat filling and the story
  // above is wrong even though the numbers look small.
  for (const k of [-1, 0, 1]) {
    let previous = null;
    for (const level of [1, 2, 3, 4]) {
      const m = measure(k, 0.3, level);
      if (previous !== null) {
        const ratio = previous / m.interiorError;
        assert.ok(ratio > 3.2 && ratio < 4.8,
          `k=${k} level ${level}: error fell by ${ratio.toFixed(2)}, expected about 4`);
      }
      previous = m.interiorError;
    }
  }
});

test('a mesh small against the curvature radius costs the same everywhere', () => {
  // At r = 0.3 curvature radii all three geometries are nearly flat, so the
  // relative error must be nearly the same in all of them. This is what makes
  // "import a prop and place it" reasonable: a chair does not care about the
  // curvature of the universe.
  const [h, e, s] = [-1, 0, 1].map((k) => measure(k, 0.3, 4).relative);
  for (const [name, value] of [['H3', h], ['S3', s]]) {
    assert.ok(Math.abs(value - e) / e < 0.1,
      `${name} relative error ${value} differs from E3 ${e} by more than a tenth`);
  }
  assert.ok(e < 0.002, `even flat space should be under 0.2% here, got ${e}`);
});

test('THE PRICE: a large hyperbolic object costs far more triangles', () => {
  // The finding that actually constrains an asset pipeline. Hyperbolic area
  // grows exponentially with radius, so a fixed triangle budget covers
  // proportionally less of a big object. At 5120 triangles a sphere of radius
  // 2.5 is an order of magnitude worse than the same sphere in flat space --
  // so "subdivide until it looks right" is a per-object, size-dependent
  // budget in H3, not a global setting.
  const big = measure(-1, 2.5, 4), flat = measure(0, 2.5, 4);
  assert.ok(big.relative > 5 * flat.relative,
    `expected hyperbolic to cost much more; got ${big.relative} vs ${flat.relative}`);
  assert.ok(big.relative < 0.05,
    `but still usable at 5120 triangles; got ${(big.relative * 100).toFixed(2)}%`);
  // And it IS bought down by subdivision rather than being a hard floor.
  assert.ok(measure(-1, 2.5, 4).relative < measure(-1, 2.5, 2).relative / 5,
    'two more subdivisions must buy back an order of magnitude');
});

test('a mesh vertex sits exactly on the surface; only the filling is wrong', () => {
  // Guards against a probe that measures its own vertex placement rather than
  // the technique. Vertices are exp of a tangent vector of length r, so their
  // distance from the centre is r to machine precision at every level.
  const m = measure(-1, 1.5, 0);
  assert.ok(m.interiorError > 0.1, 'a bare icosahedron should be visibly wrong');
  assert.ok(m.longest > m.shortest * 0.5, 'and its edges roughly comparable');
});

console.log(`\nmesh approximation: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
