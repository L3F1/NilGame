import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { excludeSphericalCell } from './engine/geometry/s3-cell-exclusion.js';
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(name, e); } }
const p = [0, 0, 0, 1], u = [1, 0, 0, 0];
const space = createMetricSpace({ kind: 's3', curvatureRadius: 1 });
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
// Synthetic six constraints isolate the interval logic, not authoring validity.
const cell = pole => ({ entity: { kind: 'geodesic-cell' }, planes: Array.from({ length: 6 }, () => [...pole]) });
const query = (pole, range, opts = {}) => excludeSphericalCell(space, cell(pole), p, u, { maxDistance: range, ...opts });

check('positive whole interval excludes, origin-only exclusion does not', () => {
  assert.equal(query([0, 0, 0, 1], .5).status, 'excluded');
  assert.equal(query([0, 0, 0, 1], 2).status, 'unknown');
  assert.equal(query([0, 0, 0, -1], .5).status, 'unknown');
});
check('stationary extrema: interior maximum does not replace endpoint minimum', () => {
  const c = Math.cos(.6), s = Math.sin(.6), result = query([s, 0, 0, c], 1.2);
  assert.equal(result.status, 'excluded');
  assert.ok(Math.abs(result.minimum - c) < 1e-14);
  assert.ok(result.lower < c && result.guard > 0);
  // Negative interior minimum must never become an exclusion witness.
  assert.equal(query([-s, 0, 0, -c], 1.2).status, 'unknown');
});
check('touching endpoints, coplanarity and guard-close values stay unknown', () => {
  assert.equal(query([1, 0, 0, 0], .5).status, 'unknown');
  assert.equal(query([0, 0, 0, 1], Math.PI / 2).status, 'unknown');
  assert.equal(query([0, 1, 0, 0], .5).status, 'unknown');
  assert.equal(query([0, 1, 0, 1e-15], .5).status, 'unknown');
  assert.equal(query([0, 0, 0, 1], 0).status, 'excluded');
});
check('one witness is enough, absent witness is not occupancy, budgets are exact', () => {
  const mixed = cell([0, 1, 0, 0]); mixed.planes[3] = [0, 0, 0, 1];
  for (let cap = 0; cap <= 6; cap++) {
    const result = excludeSphericalCell(space, mixed, p, u, { maxDistance: .5, maxWork: cap });
    assert.ok(result.work <= cap);
    assert.equal(result.status, cap < 4 ? 'unknown' : 'excluded');
    if (cap >= 4) { assert.equal(result.face, 3); assert.equal(result.work, 4); }
  }
  assert.equal(query([0, 1, 0, 0], .5).reason, 'no-witness');
});
check('compiled oblique decimal cell, physical scaling and dense witness reference', () => {
  let witnesses = 0;
  for (const R of [.5, 8, 100]) {
    const world = compileRegionWorld({ format: 'nil-scene', version: 2, id: 'span', units: { name: 'design-unit', playerRadius: .01*R }, regions: [{ id: 'r', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent: R }],
      entities: [{ id: 's', kind: 'spawn', regionId: 'r', position: [0, 0, 0] },
        { id: 'c', kind: 'geodesic-cell', regionId: 'r', position: [.4*R, 0, 0], halfExtent: [.06*R, .05*R, .04*R], frame: { forward: [.87758256, .47942554, 0], up: [0, 0, 1] } }], connections: [] });
    const region = world.regions.get('r'), primitive = region.field.primitives[0];
    const before = JSON.stringify(primitive.planes);
    for (let j = 0; j < 60; j++) {
      const angle = j * .137, dir = [Math.cos(angle), Math.sin(angle), 0, 0];
      const result = excludeSphericalCell(region.space, primitive, p, dir, { maxDistance: .8*R });
      if (result.status !== 'excluded') continue;
      witnesses++;
      for (let i = 0; i <= 400; i++) {
        const theta = .8*i/400, at = p.map((x, k) => x*Math.cos(theta) + dir[k]*Math.sin(theta));
        const value = dot(at, primitive.planes[result.face]);
        assert.ok(value >= result.lower, `${value} below ${result.lower}`);
        assert.ok(value > 0);
      }
    }
    assert.equal(JSON.stringify(primitive.planes), before);
  }
  assert.ok(witnesses > 100, `only ${witnesses} witnesses`);
});
check('validation and input drift cannot produce a witness', () => {
  const primitive = cell([0, 0, 0, 1]);
  assert.equal(excludeSphericalCell(space, primitive, p.map(x => x*(1+1e-10)), u, { maxDistance: 1 }).reason, 'input-roundoff');
  assert.throws(() => query([0, 0, 0, 1], -1), /maxDistance/);
  assert.throws(() => query([0, 0, 0, 1], 4), /maxDistance/);
  assert.throws(() => query([0, 0, 0, 1], 1, { maxWork: .5 }), /maxWork/);
  primitive.planes[5] = [NaN, 0, 0, 1];
  assert.throws(() => excludeSphericalCell(space, primitive, p, u, { maxDistance: 1 }), /pole/);
});
console.log(`s3 cell exclusion: ${passed}/${passed+failed}`);
if (failed) process.exitCode = 1;
