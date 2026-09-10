import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';

let passed = 0, failed = 0;
function test(name, run) {
  try { run(); passed++; console.log(`  ok   ${name}`); }
  catch (error) { failed++; console.error(`  FAIL ${name}: ${error.message}`); }
}
const close = (a, b, tolerance = 2e-11) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const same = (a, b, tolerance) => { assert.equal(a.length, b.length); a.forEach((x, i) => close(x, b[i], tolerance)); };
const scalar = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const e3 = createMetricSpace({ kind: 'e3', maxDistance: 5 });

test('E3 physical distances, straight motion and unchanged carried frame', () => {
  const p = e3.decode([1, 2, 1]), u = e3.normalize(p, [3, 4, 0]);
  const segment = e3.stepWithTransport(p, u, 2);
  same(segment.position, [2.2, 3.6, 1]);
  close(e3.distance(p, segment.position), 2);
  same(segment.carry([0, 0, 7]), [0, 0, 7]);
  same(e3.encode(p), [1, 2, 1]);
  assert.deepEqual(e3.frame(p), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});
test('E3 radial domain exit is reported, not clamped into a collision wall', () => {
  close(e3.boundaryDistance([4, 0, 0], [1, 0, 0]), 1);
  close(e3.boundaryDistance([4, 0, 0], [-1, 0, 0]), 9);
  close(e3.boundaryDistance([4, 0, 0], [0, 1, 0]), 3);
  assert.equal(e3.boundaryDistance([4, 0, 0], [1, 0, 0], .9), Infinity);
  assert.equal(e3.boundaryDistance([5, 0, 0], [-1, 0, 0]), 0);
  const outside = e3.step([4, 0, 0], [1, 0, 0], 2);
  same(outside, [6, 0, 0]); assert.equal(e3.withinDomain(outside), false);
});

for (const R of [.5, 1, 7]) {
  const s = createMetricSpace({ kind: 's3', curvatureRadius: R, maxDistance: 1.4 * R });
  test(`S3 R=${R}: radial coordinates, canonical frame and independent arclength`, () => {
    for (let i = 0; i < 30; i++) {
      const author = [.5 * Math.sin(i), .4 * Math.cos(2 * i), .3 * Math.sin(3 * i)].map(x => x * R);
      const p = s.decode(author), frame = s.frame(p);
      same(s.encode(p), author);
      close(scalar(p, p), 1);
      for (let a = 0; a < 3; a++) {
        close(scalar(p, frame[a]), 0);
        for (let b = 0; b < 3; b++) close(scalar(frame[a], frame[b]), a === b ? 1 : 0);
      }
      const travel = .2 * R, segment = s.stepWithTransport(p, frame[1], travel);
      close(scalar(segment.position, segment.position), 1);
      // Chord-length identity, independent of adapter distance implementation.
      const chord = Math.hypot(...segment.position.map((x, j) => x - p[j]));
      close(chord, 2 * Math.sin(travel / (2 * R)));
      close(s.distance(p, segment.position), travel);
      same(s.logAt(p, segment.position), frame[1].map(x => x * travel));
      same(s.expAt(p, frame[1].map(x => x * travel)), segment.position);
      for (const v of frame) {
        const carried = segment.carry(v);
        close(scalar(carried, segment.position), 0);
        close(scalar(carried, carried), 1);
        same(s.transport(p, segment.position, v), carried);
      }
    }
  });
  test(`S3 R=${R}: geodesic transport follows the segment through the antipode`, () => {
    const o = [0, 0, 0, 1], u = [1, 0, 0, 0];
    const half = s.stepWithTransport(o, u, Math.PI * R);
    same(half.position, [0, 0, 0, -1]); same(half.carry(u), [-1, 0, 0, 0]);
    assert.throws(() => s.transport(o, half.position, u), /Antipodal/);
    assert.throws(() => s.logAt(o, half.position), /Antipodal/);
    const full = s.stepWithTransport(o, u, 2 * Math.PI * R);
    same(full.position, o); same(full.carry(u), u);
    close(s.distance(o, half.position), Math.PI * R);
  });
  test(`S3 R=${R}: explicit boundary solves catch leave-and-return segments`, () => {
    const p = s.decode([.6 * R, 0, 0]), u = s.frame(p)[0];
    close(s.boundaryDistance(p, u), .8 * R);
    close(s.boundaryDistance(p, u.map(x => -x)), 2 * R);
    assert.equal(s.boundaryDistance(p, u, .7 * R), Infinity);
    const exit = s.boundaryDistance(p, u, 2 * Math.PI * R);
    assert.ok(s.withinDomain(s.step(p, u, exit - 1e-7 * R)));
    assert.ok(!s.withinDomain(s.step(p, u, exit + 1e-7 * R)));
    assert.ok(s.withinDomain(s.step(p, u, 2 * Math.PI * R)));
  });
}

test('S3 octant triangle has pi/2 holonomy, not a reset to the canonical frame', () => {
  const s = createMetricSpace({ kind: 's3' });
  const o = [0, 0, 0, 1], x = [1, 0, 0, 0], y = [0, 1, 0, 0];
  // Great-circle right triangle on a totally geodesic S2 in S3. Its spherical
  // excess is 3*pi/2-pi=pi/2, independently predicting this frame rotation.
  let v = x;
  v = s.stepWithTransport(o, x, Math.PI / 2).carry(v);
  v = s.stepWithTransport(x, y, Math.PI / 2).carry(v);
  v = s.stepWithTransport(y, o, Math.PI / 2).carry(v);
  same(v, y);
  close(s.dot(o, x, v), 0); close(s.norm(o, v), 1);
});
test('projection uses tangent metric and accepts non-unit surface normals', () => {
  const s = createMetricSpace({ kind: 's3' }), p = s.decode([.5, .3, .2]);
  const [a, b] = s.frame(p), v = a.map((x, i) => 3 * x + 2 * b[i]);
  same(s.project(p, v, a.map(x => 4 * x)), b.map(x => 2 * x));
});
test('zero and tiny displacement logarithms preserve physical scale', () => {
  const s = createMetricSpace({ kind: 's3', curvatureRadius: 7 }), p = s.decode([.4, -.5, .8]);
  same(s.logAt(s.origin, s.origin), [0, 0, 0, 0]);
  same(s.expAt(p, [0, 0, 0, 0]), p);
  const d = s.frame(p)[2].map(x => 1e-9 * x);
  same(s.logAt(p, s.expAt(p, d)), d, 1e-14);
  same(e3.logAt([1, 2, 3], [4, 3, 2]), [3, 1, -1]);
  same(e3.expAt([1, 2, 3], [3, 1, -1]), [4, 3, 2]);
});
test('segment carries a snapshot even if the caller subsequently mutates inputs', () => {
  const s = createMetricSpace({ kind: 's3' });
  const p = [0, 0, 0, 1], u = [1, 0, 0, 0], segment = s.stepWithTransport(p, u, .4);
  const expected = segment.carry([1, 0, 0, 0]); p[0] = 9; u[0] = 9;
  same(segment.carry([1, 0, 0, 0]), expected);
});
test('point/tangent/domain contracts reject unsupported and invalid inputs', () => {
  assert.throws(() => createMetricSpace({ kind: 'nil' }), /Unsupported/);
  assert.throws(() => createMetricSpace({ kind: 'e3', curvatureRadius: 2 }), /curvatureRadius/);
  assert.throws(() => createMetricSpace({ kind: 's3', maxDistance: 2 }), /hemisphere/);
  assert.throws(() => createMetricSpace({ kind: 's3', maxDistance: Infinity }), /maxDistance/);
  assert.throws(() => createMetricSpace({ kind: 's3', curvatureRadius: NaN }), /curvatureRadius/);
  const s = createMetricSpace({ kind: 's3' }), o = s.origin;
  assert.throws(() => s.validatePoint([0, 0, 0, 2]), /unit sphere/);
  assert.throws(() => s.validateTangent(o, [0, 0, 0, 1]), /tangent/);
  assert.throws(() => s.validateTangent(o, [1, 0, 0]), /4 finite/);
  assert.throws(() => s.normalize(o, [0, 0, 0, 0]), /zero/);
  assert.throws(() => s.step(o, [2, 0, 0, 0], 1), /unit/);
  assert.throws(() => s.decode([Math.PI / 2, 0, 0]), /outside/);
  assert.throws(() => s.encode([1, 0, 0, 0]), /outside/);
  assert.throws(() => s.boundaryDistance(o, [1, 0, 0, 0], -1), /maxTravel/);
  assert.throws(() => s.step(o, [1, 0, 0, 0], NaN), /finite/);
});

console.log(`\nmetric-space: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
