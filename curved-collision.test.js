// The collision solver, run in a space that is not flat.
//
// This is the point of the metric-space seam, and it is the first thing in the
// project to exercise it. Everything the solver does here -- sweeping,
// resolving an overlap, sliding along a contact, carrying a velocity -- runs
// against S3 with no change to the solver at all. If any Euclidean assumption
// were still in there, it would surface as a wrong arclength or a probe that
// ends up inside something, not as a type error.
//
// EVERY EXPECTATION IS AN INDEPENDENT CLOSED FORM, per WORKING_RULES. A metric
// ball of radius rho centred at q, met by a probe of radius r, makes contact
// exactly where the GREAT-CIRCLE distance equals rho + r. That is arithmetic
// on the sphere, not a second run of the solver.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { clearance, isClear, resolveOverlap, sweep, moveProbe } from './engine/world/collision.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// Curvature radius 4: big enough to walk around in, small enough that the
// curvature is not lost in the tolerances. A radius of 1 would make every
// distance an angle and hide unit errors.
const R = 4;
const space = createMetricSpace({ kind: 's3', curvatureRadius: R, maxDistance: Math.PI * R / 2 });

/**
 * A METRIC BALL, which is what a sphere makes of "everything within rho of a
 * point". Nothing here is Euclidean: the distance is a great-circle distance
 * and the normal is a tangent vector at the query point, so it is a different
 * vector at every point on the surface even though the ball is one object.
 */
function metricBall(centre, rho) {
  const q = space.decode(centre);
  return {
    distance: (p) => space.distance(p, q) - rho,
    normal(p) {
      const toward = space.logAt(p, q);
      // At the centre every direction is equally outward, exactly as in E3.
      if (!(Math.hypot(...toward) > 0)) return null;
      return space.normalize(p, toward.map((x) => -x));
    },
  };
}

const rho = 1.2, r = 0.25;
const centre = [0, 0, 0];                 // the chart origin
const field = metricBall(centre, rho);
const q = space.decode(centre);

// --- the field, as the solver sees it -------------------------------------

test('clearance on a sphere is a great-circle clearance', () => {
  const p = space.step(q, space.normalize(q, [0, 1, 0, 0]), 2.0);
  near(clearance(field, p, r), 2.0 - rho - r, 1e-12, 'clearance');
  assert.equal(isClear(field, p, r), true);
  assert.equal(isClear(field, q, r), false, 'the centre is not clear');
});

test('a point four components wide is accepted; a three-vector is not', () => {
  // The solver used to demand exactly three numbers, everywhere, which is the
  // assumption this refactor removed. An S3 point is a four-vector ON the unit
  // sphere, and the space is the authority on that, not the solver.
  assert.equal(q.length, 4);
  assert.throws(() => space.validatePoint([0, 0, 0]), /four finite numbers|point must/);
  assert.throws(() => space.validatePoint([0, 0, 0, 0.5]), /unit sphere/);
});

// --- the swept query ------------------------------------------------------

test('A SWEEP STOPS AT THE GREAT-CIRCLE CONTACT DISTANCE', () => {
  const start = 3.0;
  const u0 = space.normalize(q, [0, 1, 0, 0]);
  const from = space.step(q, u0, start);
  // Head back along the same great circle: the direction at `from` pointing
  // toward the centre.
  const back = space.normalize(from, space.logAt(from, q));
  const out = sweep(field, space, { from, direction: back, distance: 10, radius: r });
  assert.equal(out.hit, true);
  assert.equal(out.stalled, false);
  near(out.travelled, start - (rho + r), 2e-4, 'contact arclength on the sphere');
  // And the contact really is where the closed form says, measured back from
  // the centre rather than from the solver's own numbers.
  near(space.distance(out.position, q), rho + r, 2e-4, 'contact radius');
});

test('a sweep that misses travels its whole arclength', () => {
  // Offset far enough round the sphere that the swept tube cannot reach, and
  // aimed ACROSS the radial direction rather than along it.
  //
  // Building that direction is itself the lesson. A tangent vector cannot be
  // written down as a triple of numbers here -- it has to be tangent AT a
  // point, so it comes from a logarithm (which is tangent by construction) and
  // is made perpendicular with the metric's own projection. Picking [0,1,0,0]
  // and hoping is what the old three-component code did implicitly.
  const side = space.step(q, space.normalize(q, [1, 0, 0, 0]), rho + r + 0.8);
  const radial = space.logAt(side, q);
  const other = space.logAt(side, space.decode([0, 3, 0]));
  const across = space.normalize(side, space.project(side, other, radial));
  const out = sweep(field, space, { from: side, direction: across, distance: 1.5, radius: r });
  assert.equal(out.hit, false);
  near(out.travelled, 1.5, 1e-9, 'free travel');
  // A geodesic leaving perpendicular to the radial direction moves AWAY from
  // the centre -- cos(d/R) = cos(d0/R)cos(t/R) -- so it cannot curve back into
  // a ball it started clear of. Worth asserting: on a sphere "sideways" does
  // not mean "at constant distance", and assuming it does is a flat-space
  // reflex.
  assert.ok(space.distance(out.position, q) > space.distance(side, q),
    'a perpendicular geodesic climbs away from the centre');
});

test('ONE ENORMOUS STEP CANNOT TUNNEL, on a sphere either', () => {
  const start = 3.0;
  const from = space.step(q, space.normalize(q, [0, 1, 0, 0]), start);
  const back = space.normalize(from, space.logAt(from, q));
  const out = sweep(field, space, {
    from, direction: back, distance: 100, radius: r, maxSteps: 4096,
  });
  assert.equal(out.hit, true, 'must not pass through the ball');
  assert.ok(clearance(field, out.position, r) >= -1e-6, 'never ends up inside');
});

test('a probe already inside is pushed out along the geodesic normal', () => {
  const inside = space.step(q, space.normalize(q, [0, 0, 1, 0]), 0.4);
  assert.ok(clearance(field, inside, r) < 0, 'precondition: overlapping');
  const out = resolveOverlap(field, space, inside, r);
  assert.equal(out.status, 'pushed');
  assert.ok(clearance(field, out.position, r) >= 0, 'ends with room');
  near(space.distance(out.position, q), rho + r, 1e-3, 'pushed onto the surface');
});

test('dead centre reports TRAPPED here too', () => {
  const out = resolveOverlap(field, space, q.slice(), r);
  assert.equal(out.status, 'trapped');
  assert.deepEqual(out.position, q, 'a trapped probe is not moved');
});

// --- what could only go wrong in a curved space ---------------------------

test('A FREE MOVE COVERS speed * dt OF ARCLENGTH, not chord length', () => {
  // The error this catches is treating the sphere as flat: a chord is shorter
  // than its arc, so a solver measuring the wrong one arrives short. Over 3
  // units on a curvature radius of 4 the two differ by about 8%, which no
  // tolerance would hide.
  const from = space.step(q, space.normalize(q, [1, 0, 0, 0]), 2.5);
  const heading = space.normalize(from, space.logAt(from, space.decode([0, 3, 0])));
  const out = moveProbe(field, space, { position: from, velocity: heading.map((x) => x * 3), radius: r }, 1);
  assert.deepEqual(out.contacts, [], 'this path does not meet the ball');
  near(space.distance(from, out.position), 3, 1e-6, 'arclength covered');
  const chord = Math.hypot(...out.position.map((x, i) => x - from[i])) * R;
  assert.ok(chord < 3 - 0.05, `the chord must be shorter than the arc (${chord})`);
});

test('THE VELOCITY IS CARRIED, and carrying is not the identity here', () => {
  // In E3 `carry` is the identity and this whole mechanism is invisible. On a
  // sphere a vector transported along a geodesic is a DIFFERENT vector in
  // ambient coordinates at the far end -- it has to be, or it would no longer
  // be tangent. Skipping that is the classic silent steer.
  const from = space.step(q, space.normalize(q, [1, 0, 0, 0]), 2.0);
  const u = space.normalize(from, space.logAt(from, space.decode([0, 2, 0])));
  const out = sweep(field, space, { from, direction: u, distance: 2.0, radius: r });
  const carried = out.carry(u);
  space.validateTangent(out.position, carried);
  assert.ok(carried.some((x, i) => Math.abs(x - u[i]) > 1e-3),
    'a carried vector must actually change on a sphere');
  // Transport is an isometry: it turns a vector, it never lengthens it.
  near(space.norm(out.position, carried), space.norm(from, u), 1e-12, 'carry preserves length');
  // COMPOSING THE LEGS EQUALS ONE LONG CARRY. The sweep took many small
  // advances along a single geodesic; transporting once over the whole
  // arclength must give the same vector. This is the property that would break
  // if the legs were composed in the wrong order, or if any of them were
  // quietly dropped -- and in E3 it would still hold, which is why it is
  // worth checking here and not there.
  const single = space.stepWithTransport(from, u, out.travelled);
  near(space.distance(single.position, out.position), 0, 1e-9, 'same endpoint');
  for (let i = 0; i < 4; i++) {
    near(carried[i], single.direction[i], 1e-9, `leg composition, component ${i}`);
  }
});

test('a slide along a curved contact keeps the probe outside', () => {
  // Come in obliquely so there is a tangent part to keep. The invariant is the
  // one that matters everywhere: sliding must never end up inside.
  const from = space.step(q, space.normalize(q, [0, 1, 0, 0]), 2.2);
  const sideways = space.normalize(from, space.project(from, [1, 0, 0, 0], space.logAt(from, q)));
  const inward = space.normalize(from, space.logAt(from, q));
  const aim = space.normalize(from, inward.map((x, i) => x * 0.85 + sideways[i] * 0.5));
  let state = { position: from, velocity: aim.map((x) => x * 2.5), radius: r };
  for (let i = 0; i < 120; i++) {
    const out = moveProbe(field, space, state, 1 / 60);
    state = { position: out.position, velocity: out.velocity, radius: r };
    assert.ok(clearance(field, state.position, r) >= -1e-3,
      `step ${i} sank: clearance ${clearance(field, state.position, r)}`);
    assert.ok(state.position.every(Number.isFinite), `step ${i} went non-finite`);
    space.validatePoint(state.position);
  }
  assert.ok(state.velocity.some((x) => Math.abs(x) > 1e-6), 'kept some tangential speed');
});

test('THE DOMAIN LIMIT IS REPORTED, NEVER TURNED INTO A WALL', () => {
  // The plan is explicit that an authoring extent must not silently become a
  // collision surface. The space answers where the patch ends; the field says
  // nothing about it, and a sweep aimed out of the patch is a MISS, not a hit.
  const edge = space.step(q, space.normalize(q, [0, 1, 0, 0]), Math.PI * R / 2 - 0.5);
  // Straight on outward: the direction pointing away from the centre, which is
  // the inward logarithm reversed. Tangent by construction.
  const away = space.normalize(edge, space.logAt(edge, q).map((x) => -x));
  const exit = space.boundaryDistance(edge, away, 10);
  assert.ok(Number.isFinite(exit) && exit > 0,
    `the patch edge must be a reported distance, got ${exit}`);
  near(exit, 0.5, 1e-6, 'distance to the edge of the patch');
  // And the field says nothing about it. A sweep toward the edge is a MISS.
  const out = sweep(field, space, { from: edge, direction: away, distance: 0.2, radius: r });
  assert.equal(out.hit, false, 'approaching the patch edge is not a collision');
  assert.equal(out.stalled, false);
  near(out.travelled, 0.2, 1e-9, 'and it travels the whole way');
});

test('A PORTAL IN A CURVED SPACE IS REFUSED, not approximated', () => {
  // The aperture test interpolates linearly between two points. That is the
  // geodesic in E3 and nothing here: an interpolated point between two points
  // of S3 is not even on the sphere. It would not throw -- it would return a
  // plausible crossing in the wrong place, which is the kind of wrong that
  // survives review. Everything else in the solver is now geometry-correct,
  // so this is the one remaining place a curved world could quietly
  // misbehave, and it says so instead.
  const from = space.step(q, space.normalize(q, [0, 1, 0, 0]), 2.5);
  const dir = space.normalize(from, space.logAt(from, q));
  const aperture = {
    center: space.step(q, space.normalize(q, [0, 1, 0, 0]), 1.8),
    normal: space.normalize(from, space.logAt(from, q)), radius: 0.5,
    mapPoint: (p) => p, mapVector: (v) => v, exitNormal: [0, 1, 0, 0],
  };
  assert.throws(() => sweep(field, space, {
    from, direction: dir, distance: 1.0, radius: r, portals: [aperture],
  }), /E3-only|straight segment/);
  // And with no portals the same sweep is fine, so it is the aperture that is
  // refused rather than the geometry.
  const fine = sweep(field, space, { from, direction: dir, distance: 1.0, radius: r });
  assert.equal(fine.hit, false);
});

console.log(`\ncurved collision: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
