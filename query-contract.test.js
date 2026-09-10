import assert from 'node:assert/strict';
import { compileSceneField, primitiveOf } from './engine/world/scene-field.js';
import { primitiveRayInterval } from './engine/geometry/e3-ray-intervals.js';

let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); } };
const near = (a, b, e = 1e-10) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
const scene = (...solids) => ({
  format: 'nil-scene', version: 1, id: 'query-contract',
  units: { name: 'design-unit', playerRadius: .1 },
  regions: [{ id: 'room', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 100 }],
  entities: [{ id: 'spawn', regionId: 'room', kind: 'spawn', position: [0, -4, 2] },
    ...solids.map((s) => ({ regionId: 'room', ...s }))], connections: [],
});
const sphere = (id, position = [0, 0, 0], radius = 1, extra = {}) => ({ id, kind: 'ball', position, radius, ...extra });
const box = (id, position = [0, 0, 0], halfExtent = [1, 1, 1], extra = {}) => ({ id, kind: 'box', position, halfExtent, ...extra });
const plane = (id, position, up, extra = {}) => ({ id, kind: 'plane', position, up, ...extra });

test('analytic queries respect the requested finite segment', () => {
  const f = compileSceneField(scene(sphere('ball')));
  assert.equal(f.rayCast([-3, 0, 0], [1, 0, 0], { maxDistance: 1 }).hit, false);
  near(f.rayCast([-3, 0, 0], [1, 0, 0], { maxDistance: 2 }).t, 2);
});
test('overlapping unions do not advertise exact signed interior distance', () => {
  const f = compileSceneField(scene(sphere('left', [-.5, 0, 0]), sphere('right', [.5, 0, 0])));
  assert.equal(f.capabilities.distance, 'bound');
  assert.equal(f.capabilities.exteriorDistance, 'exact');
  // The nearest exterior point is the intersection circle, radius sqrt(3)/2
  // from the origin. Neither individual sphere's nearest boundary is exposed.
  near(f.distance([0, 0, 0]), -.5);
  assert.ok(Math.abs(f.distance([0, 0, 0])) < Math.sqrt(3) / 2);
});
test('range zero distinguishes occupancy from a later hit', () => {
  const f = compileSceneField(scene(sphere('ball')));
  const inside = f.rayCast([0, 0, 0], [1, 0, 0], { maxDistance: 0 });
  assert.equal(inside.status, 'hit'); assert.equal(inside.t, 0);
  assert.equal(inside.contact, 'inside'); assert.equal(inside.normal, null);
  assert.equal(f.rayCast([-2, 0, 0], [1, 0, 0], { maxDistance: 0 }).status, 'miss');
});
test('invalid ray controls cannot masquerade as misses', () => {
  const f = compileSceneField(scene(sphere('ball')));
  for (const options of [{ maxDistance: -1 }, { maxDistance: Infinity }, { maxDistance: NaN },
    { maxSteps: 0 }, { maxSteps: 1.5 }, { hitEpsilon: 0 }, { hitEpsilon: NaN }, { method: 'guess' }]) {
    assert.throws(() => f.rayCast([-3, 0, 0], [1, 0, 0], options));
  }
  assert.throws(() => f.rayCast([Infinity, 0, 0], [1, 0, 0]));
  assert.throws(() => f.rayCast([0, 0, 0], [2, 0, 0]));
});
test('carved cavity hits carry the cutter normal facing into free space', () => {
  const f = compileSceneField(scene(sphere('shell', [0, 0, 0], 2),
    sphere('hole', [0, 0, 0], 1, { op: 'subtract', target: 'shell' })));
  const hit = f.rayCast([0, 0, 0], [1, 0, 0]);
  assert.equal(hit.status, 'hit'); near(hit.t, 1);
  assert.equal(hit.owner, 'shell'); assert.equal(hit.surfaceOwner, 'hole');
  near(hit.normal[0], -1); near(hit.normal[1], 0); near(hit.normal[2], 0);
  assert.equal(hit.normalUnique, true); assert.equal(hit.steps, 0);
});
test('clipping half-spaces and disjoint cutters compose interval events', () => {
  const f = compileSceneField(scene(box('wall', [0, 0, 0], [5, 1, 1]),
    box('hole-a', [-2, 0, 0], [.5, 2, 2], { op: 'subtract', target: 'wall' }),
    box('hole-b', [2, 0, 0], [.5, 2, 2], { op: 'subtract', target: 'wall' }),
    plane('clip', [3, 0, 0], [1, 0, 0], { op: 'intersect', target: 'wall' })));
  near(f.rayCast([-2, 0, 0], [1, 0, 0]).t, .5);
  near(f.rayCast([2, 0, 0], [1, 0, 0]).t, .5);
  assert.equal(f.rayCast([4, 0, 0], [1, 0, 0]).status, 'miss');
  near(f.rayCast([4, 0, 0], [-1, 0, 0]).t, 1);
});
test('modifiers never affect unrelated additive solids', () => {
  const f = compileSceneField(scene(sphere('left', [-3, 0, 0]), sphere('right', [3, 0, 0]),
    sphere('cutter', [3, 0, 0], 2, { op: 'subtract', target: 'left' })));
  const hit = f.rayCast([6, 0, 0], [-1, 0, 0]);
  assert.equal(hit.owner, 'right'); near(hit.t, 2);
});
test('exact duplicate subtraction is empty in field, query and host groups', () => {
  for (const primitive of [sphere('base'), box('base'), plane('base', [0, 0, 0], [0, 0, 1])]) {
    const f = compileSceneField(scene(primitive, { ...primitive, id: 'remove', op: 'subtract', target: 'base' }));
    assert.equal(f.distance([1, 0, 0]), Infinity);
    assert.equal(f.rayCast([-3, 0, 0], [1, 0, 0]).status, 'miss');
    assert.deepEqual(f.activeEntityIds(), []); assert.deepEqual(f.groups(), []);
    assert.equal(f.ballCount + f.boxCount + f.planeCount, 0);
  }
});
test('removed targets cannot turn their scoped modifiers into global GPU owners', () => {
  const f = compileSceneField(scene(sphere('base'), sphere('keep', [3, 0, 0]),
    sphere('remove', [0, 0, 0], 1, { op: 'subtract', target: 'base' })));
  assert.deepEqual(f.activeEntityIds(), ['keep']);
  assert.deepEqual(f.modBallOwners(), []);
  assert.equal(f.distance([3, 0, 0]), -1);
});
test('primitive tangencies remain real contacts', () => {
  const f = compileSceneField(scene(sphere('ball')));
  const hit = f.rayCast([-3, 1, 0], [1, 0, 0]);
  assert.equal(hit.status, 'hit'); assert.equal(hit.contact, 'touch'); near(hit.t, 3);
  assert.deepEqual(hit.normal, [0, 1, 0]);
});
test('Boolean collapsed intervals are unresolved instead of phantom surfaces', () => {
  const f = compileSceneField(scene(sphere('a', [-1, 0, 0]),
    sphere('b', [1, 0, 0], 1, { op: 'intersect', target: 'a' })));
  assert.equal(f.rayCast([-4, 0, 0], [1, 0, 0]).status, 'indeterminate');
});
test('near-tangent cancellation cannot become a confident miss', () => {
  const f = compileSceneField(scene(sphere('ball')));
  const hit = f.rayCast([-3, 1 + Number.EPSILON, 0], [1, 0, 0]);
  assert.equal(hit.status, 'indeterminate'); assert.equal(hit.reason, 'floating-point-boundary');
});
test('an ambiguity behind the ray does not forfeit the answer ahead of it', () => {
  // The same hairline tangency as above, but the ray is aimed AWAY from it.
  // Everything uncertain sits at negative t and the ray travels away from it
  // forever, so nothing ahead is in doubt. Reporting the uncertainty at the
  // origin instead of where it happens used to make this the easiest possible
  // ray to refuse: a standing-start `indeterminate` with an empty sky ahead.
  const f = compileSceneField(scene(sphere('ball')));
  assert.equal(f.rayCast([-3, 1 + Number.EPSILON, 0], [-1, 0, 0]).status, 'miss');
  // Straddling the origin is different, and must still decline: starting AT
  // the grazing point, whether the origin is occupied is genuinely unknown.
  assert.equal(f.rayCast([0, 1 + Number.EPSILON, 0], [1, 0, 0]).status, 'indeterminate');
});
test('tiny nonzero slopes still hit half-spaces', () => {
  const f = compileSceneField(scene(plane('ground', [0, 0, 0], [0, 0, 1])));
  near(f.rayCast([0, 0, 1e-12], [1, 0, -1e-13], { maxDistance: 20 }).t, 10);
});
test('nonsmooth seams are reported separately from deterministic normals', () => {
  const f = compileSceneField(scene(box('box')));
  assert.equal(f.normalSample([1, 0, 0]).unique, true);
  assert.equal(f.normalSample([1, 1, 0]).unique, false);
  assert.equal(f.normalSample([0, 0, 0]).unique, false);
  assert.equal(f.rayCast([2, 2, 0], [-Math.SQRT1_2, -Math.SQRT1_2, 0]).normalUnique, false);
  assert.equal(compileSceneField(scene(sphere('ball'))).normalSample([0, 0, 0]).reason, 'undefined');
});
test('the explicit marched reference preserves exhaustion and range semantics', () => {
  const f = compileSceneField(scene(sphere('ball')));
  const options = { method: 'march', maxSteps: 1 };
  const starved = f.rayCast([-3, 0, 0], [1, 0, 0], options);
  assert.equal(starved.status, 'indeterminate'); assert.equal(starved.exhausted, true);
  assert.equal(f.rayCast([-3, 0, 0], [1, 0, 0], { ...options, maxDistance: 1 }).status, 'miss');
  near(f.rayCast([-3, 0, 0], [1, 0, 0], { method: 'march' }).t, 2);
});
test('oriented box queries preserve rigid distances and rotate normals', () => {
  const p = primitiveOf(box('rotated', [2, 3, 0], [1, 2, 1],
    { frame: { forward: [-1, 0, 0], up: [0, 0, 1] } }));
  near(p.distance([5, 3, 0]), 1);
  assert.deepEqual(p.normal([5, 3, 0]), [1, 0, 0]);
  const interval = primitiveRayInterval(p, [6, 3, 0], [-1, 0, 0]);
  near(interval.intervals[0].lo, 2); near(interval.intervals[0].hi, 6);
});
test('Boolean interval hits agree with independent occupancy bisection', () => {
  const source = scene(box('block', [0, 0, 0], [3, 2, 2]),
    sphere('bore', [0, 0, 0], 1.3, { op: 'subtract', target: 'block' }),
    plane('clip', [1.8, 0, 0], [1, 0, 0], { op: 'intersect', target: 'block' }),
    sphere('extra', [5, 0, 0], .7));
  const f = compileSceneField(source);
  // No distance, normal, quadratic or interval implementation is used by the
  // reference: it checks membership inequalities, scans, then bisects a change.
  const inside = (p) => ((Math.abs(p[0]) <= 3 && Math.abs(p[1]) <= 2 && Math.abs(p[2]) <= 2)
    && p[0] ** 2 + p[1] ** 2 + p[2] ** 2 >= 1.3 ** 2 && p[0] <= 1.8)
    || (p[0] - 5) ** 2 + p[1] ** 2 + p[2] ** 2 <= .7 ** 2;
  for (let i = 0; i < 32; i++) {
    const p = [-6, 3 * Math.sin(i * 1.3), 2.6 * Math.cos(i * .71)];
    const raw = [1, .12 * Math.sin(i), -.1 * Math.cos(i * 1.1)], len = Math.hypot(...raw), u = raw.map((v) => v / len);
    const point = (t) => p.map((v, j) => v + t * u[j]);
    let ref = Infinity;
    for (let j = 0; j <= 14000; j++) if (inside(point(j / 1000))) {
      let lo = Math.max(0, (j - 1) / 1000), hi = j / 1000;
      for (let k = 0; k < 45; k++) { const m = (lo + hi) / 2; if (inside(point(m))) hi = m; else lo = m; }
      ref = hi; break;
    }
    const hit = f.rayCast(p, u, { maxDistance: 14 });
    assert.notEqual(hit.status, 'indeterminate');
    if (Number.isFinite(ref)) near(hit.t, ref, 1e-9); else assert.equal(hit.status, 'miss');
  }
});

console.log(`Query contracts: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
