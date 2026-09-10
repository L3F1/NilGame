// A camera that is carried, not rebuilt.
//
// Two claims have to hold at once and they pull against each other. In E3 the
// new camera must be the OLD camera exactly -- nothing about a flat room may
// change, or this is a rewrite pretending to be a generalisation. And on a
// sphere it must do the thing the old one cannot, which is not "look roughly
// right": a carried frame picks up holonomy, and holonomy has a closed form
// to be checked against.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { createCameraFrame, turn, carryAlong, alignUp, rollAgainst } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (${Math.abs(a - b)})`);
const e3 = createMetricSpace({ kind: 'e3' });
const s3 = createMetricSpace({ kind: 's3', curvatureRadius: 8 });

// The lab's camera, copied verbatim from app/ball-lab.js so the parity check
// below compares against the real thing rather than a restatement of it.
function labBasis(yaw, pitch) {
  const cp = Math.cos(pitch);
  const f = [Math.cos(yaw) * cp, Math.sin(yaw) * cp, Math.sin(pitch)];
  const r = [Math.sin(yaw), -Math.cos(yaw), 0];
  return { f, r, u: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] };
}
const canonical = (space, p) => createCameraFrame(space, p, { forward: [1, 0, 0], up: [0, 0, 1] });
// The chord form, not acos(dot): near an angle of zero acos loses half its
// digits, and this is used to assert that an angle IS zero. The first version
// of the roll check read 1.5e-8 for two identical vectors and looked like a
// defect in the camera.
const angleBetween = (space, p, a, b) =>
  2 * Math.asin(Math.min(1, Math.hypot(...a.map((x, i) => x - b[i])) / 2));

// --- the flat room must not change ------------------------------------------

test('IN E3 THIS IS THE OLD CAMERA, TO THE LAST BIT', () => {
  // Yaw about the frame's own up, then pitch about its own right, starting
  // from the canonical frame -- that is the whole of what the lab's yaw and
  // pitch mean. If these disagree anywhere, every existing lab check that
  // pins a view direction is about to move.
  let worst = 0, at = null;
  for (let y = -3; y <= 3; y += 0.37) {
    for (let p = -1.5; p <= 1.5; p += 0.19) {
      const camera = turn(canonical(e3, [0, 0, 0]), { yaw: y, pitch: p });
      const lab = labBasis(y, p);
      for (const [ours, theirs, which] of [[camera.forward, lab.f, 'forward'],
        [camera.right, lab.r, 'right'], [camera.up, lab.u, 'up']]) {
        for (let i = 0; i < 3; i++) {
          const gap = Math.abs(ours[i] - theirs[i]);
          if (gap > worst) { worst = gap; at = `${which} yaw=${y.toFixed(2)} pitch=${p.toFixed(2)}`; }
        }
      }
    }
  }
  assert.ok(worst <= 1e-15, `differs from the lab camera by ${worst} at ${at}`);
  console.log(`  E3 parity over 153 look angles: worst ${worst.toExponential(2)}`);
});

test('a frame stays orthonormal under whatever you do to it', () => {
  let camera = canonical(e3, [0, 0, 0]);
  for (let i = 0; i < 400; i++) camera = turn(camera, { yaw: 0.31, pitch: 0.17, roll: -0.07 });
  for (const [name, v] of Object.entries({ forward: camera.forward, up: camera.up, right: camera.right })) {
    near(e3.norm(camera.position, v), 1, 1e-12, `${name} is a unit vector`);
  }
  for (const [a, b] of [['forward', 'up'], ['forward', 'right'], ['up', 'right']]) {
    near(e3.dot(camera.position, camera[a], camera[b]), 0, 1e-12, `${a} vs ${b}`);
  }
});

// --- and the thing the old camera could not do -------------------------------

test('ROLL SURVIVES A LOOP OF LOOK-INPUTS, WHICH IS WHAT THE OLD CAMERA LOST', () => {
  // Yaw and pitch about the frame's own axes do not commute, so a loop that
  // returns nowhere in particular still leaves the view rolled. Rebuilding
  // from a world up throws that away by construction -- it has nowhere to
  // keep it. Measured here as the residual roll against world up, which is
  // exactly the number the old camera would report as zero.
  let camera = canonical(e3, [0, 0, 0]);
  for (const [yaw, pitch] of [[0.8, 0], [0, 0.7], [-0.8, 0], [0, -0.7]]) camera = turn(camera, { yaw, pitch });
  const roll = rollAgainst(camera, [0, 0, 1]);
  assert.ok(Math.abs(roll) > 0.05, `expected real roll from the loop, got ${roll}`);
  // The old camera reconstructs from this same forward and gets a different
  // up: that difference IS the roll, and it is why a tilted aperture needs a
  // carried frame.
  const rebuilt = labBasis(Math.atan2(camera.forward[1], camera.forward[0]), Math.asin(camera.forward[2]));
  near(angleBetween(e3, camera.position, camera.forward, rebuilt.f), 0, 1e-12, 'same forward');
  near(angleBetween(e3, camera.position, camera.up, rebuilt.u), Math.abs(roll), 1e-9, 'the up it discards');
  console.log(`  loop leaves ${roll.toFixed(4)} rad of roll the old camera reports as 0`);
});

test('gravity alignment is a policy, and it never re-aims the walker', () => {
  const rolled = turn(canonical(e3, [0, 0, 0]), { yaw: 0.9, pitch: 0.3, roll: 0.6 });
  const upright = alignUp(rolled, [0, 0, 1]);
  near(rollAgainst(upright, [0, 0, 1]), 0, 1e-12, 'snapped upright');
  // Forward must be untouched: standing a walker up is not turning them.
  near(angleBetween(e3, upright.position, upright.forward, rolled.forward), 0, 1e-12, 'forward held');
  // A partial correction moves part of the way, so a host can ease instead of
  // snap. Half of the roll, applied once, must leave half of it.
  const eased = alignUp(rolled, [0, 0, 1], 0.5);
  near(rollAgainst(eased, [0, 0, 1]), rollAgainst(rolled, [0, 0, 1]) / 2, 1e-12, 'half applied');
  // And declining to call it leaves the roll where it was: nothing stands the
  // walker up behind the host's back.
  assert.ok(Math.abs(rollAgainst(rolled, [0, 0, 1])) > 0.5, 'the frame keeps its roll unasked');
});

test('looking straight down leaves nothing to align, and says so', () => {
  // Every up is equally upright when forward is along gravity. Snapping to an
  // arbitrary choice here is how a camera spins on its own axis at the
  // bottom of a pitch.
  const down = createCameraFrame(e3, [0, 0, 0], { forward: [0, 0, -1], up: [1, 0, 0] });
  assert.equal(rollAgainst(down, [0, 0, 1]), 0);
  const same = alignUp(down, [0, 0, 1]);
  assert.deepEqual(same.forward.slice(), down.forward.slice());
  assert.deepEqual(same.up.slice(), down.up.slice());
});

// --- the sphere, where a rebuilt camera has nothing to rebuild against -------

test('a camera exists at a point on the sphere with no global up in sight', () => {
  const p = s3.decode([2, 1, 0.5]);
  const local = s3.frame(p);
  const camera = createCameraFrame(s3, p, { forward: local[1], up: local[2] });
  s3.validateTangent(p, camera.forward);
  s3.validateTangent(p, camera.up);
  s3.validateTangent(p, camera.right);
  near(s3.norm(p, camera.forward), 1, 1e-12, 'forward unit');
  near(s3.dot(p, camera.forward, camera.up), 0, 1e-12, 'orthogonal');
  // Right-handed in the same sense as E3: forward, up, right with right on
  // the -y side, checked through the tangent basis coordinates.
  const coords = (v) => local.map((e) => v.reduce((s, x, i) => s + x * e[i], 0));
  const [f, u, r] = [coords(camera.forward), coords(camera.up), coords(camera.right)];
  const cross = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
  for (let i = 0; i < 3; i++) near(r[i], cross[i], 1e-12, 'right = forward x up');
});

function lhuilier(x, y, z) {
  const s = (x + y + z) / 2;
  const t = Math.tan(s / 2) * Math.tan((s - x) / 2) * Math.tan((s - y) / 2) * Math.tan((s - z) / 2);
  return 4 * Math.atan(Math.sqrt(Math.max(0, t)));
}

test('CARRYING THE CAMERA ROUND A LOOP ROTATES IT BY THE ENCLOSED AREA', () => {
  // The check that cannot be faked. A frame carried round a closed geodesic
  // triangle comes back rotated by area/R^2 -- and the area arrives by
  // l'Huilier's theorem from the side lengths, which is a different path than
  // composing the transports a second time. A camera that quietly re-derived
  // itself from a construction frame would come back UNROTATED and fail this
  // by the full excess; one that drifted would fail it by the drift.
  for (const [name, space] of [['s3', s3], ['e3', e3]]) {
    const R = space.curvatureRadius;
    let worst = 0, at = null;
    for (const [a, b] of [[0.4, 0.4], [1.0, 0.6], [2.0, 2.0]]) {
      const o = space.origin, local = space.frame(o);
      const A = space.expAt(o, local[0].map((x) => x * a));
      const B = space.expAt(o, local[1].map((x) => x * b));
      const start = createCameraFrame(space, o, { forward: local[0], up: local[2] });
      const leg = (camera, from, to) => {
        const travel = space.distance(from, to);
        const aim = space.normalize(from, space.logAt(from, to));
        return carryAlong(camera, space.stepWithTransport(from, aim, travel));
      };
      let camera = leg(start, o, A);
      camera = leg(camera, A, B);
      camera = leg(camera, B, o);
      // The frame came home. How far did it turn? Read the angle off forward
      // against the frame it left with -- the whole triad shares one rotation.
      const turned = Math.atan2(space.dot(o, camera.forward, start.right),
        space.dot(o, camera.forward, start.forward));
      const excess = name === 'e3' ? 0
        : lhuilier(space.distance(o, A) / R, space.distance(o, B) / R, space.distance(A, B) / R);
      const gap = Math.abs(Math.abs(turned) - excess);
      if (gap >= worst) { worst = gap; at = `a=${a} b=${b} turned=${turned.toFixed(6)} excess=${excess.toFixed(6)}`; }
      // Home is home: the loop closed, so the camera is back where it started.
      near(space.distance(camera.position, o), 0, 1e-12, 'returned to the start point');
    }
    console.log(`  holonomy/${name}: worst |turn - area/R^2| ${worst.toExponential(2)} at ${at}`);
    assert.ok(worst <= 1e-11, `${name}: worst ${worst} at ${at}`);
  }
});

test('a carried frame stays tangent over a long walk on the sphere', () => {
  // Drift off the tangent space is silent and compounds: a 4-vector that is
  // no longer perpendicular to its own position is not a direction at that
  // point at all, and every angle read from it is slightly wrong.
  let p = s3.decode([0, 0, 0]);
  let camera = createCameraFrame(s3, p, { forward: s3.frame(p)[0], up: s3.frame(p)[2] });
  for (let i = 0; i < 3000; i++) {
    const segment = s3.stepWithTransport(camera.position, camera.forward, 0.05);
    camera = carryAlong(camera, segment);
    camera = turn(camera, { yaw: 0.02, pitch: 0.011 * Math.sin(i / 40) });
  }
  s3.validatePoint(camera.position);
  for (const v of [camera.forward, camera.up, camera.right]) {
    s3.validateTangent(camera.position, v);
    near(s3.norm(camera.position, v), 1, 1e-12, 'unit after 3000 steps');
  }
  near(s3.dot(camera.position, camera.forward, camera.up), 0, 1e-12, 'orthogonal after 3000 steps');
});

test('the flat limit: a huge sphere carries the camera like a plane', () => {
  // The same walk on a sphere of radius 10000 must leave the frame where E3
  // leaves it. This catches a curvature radius dropped or inverted in the
  // carry, which no orthonormality check would notice.
  const big = createMetricSpace({ kind: 's3', curvatureRadius: 10000 });
  const walk = (space) => {
    let camera = createCameraFrame(space, space.origin,
      { forward: space.frame(space.origin)[0], up: space.frame(space.origin)[2] });
    for (let i = 0; i < 24; i++) {
      camera = carryAlong(camera, space.stepWithTransport(camera.position, camera.forward, 0.25));
      camera = turn(camera, { yaw: 0.09, pitch: 0.03 });
    }
    return camera;
  };
  const curved = walk(big), flat = walk(e3);
  const coords = (space, camera, v) => space.frame(camera.position)
    .map((e) => v.reduce((s, x, i) => s + x * e[i], 0));
  let worst = 0;
  for (const which of ['forward', 'up', 'right']) {
    const a = coords(big, curved, curved[which]), b = coords(e3, flat, flat[which]);
    for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  }
  assert.ok(worst < 1e-6, `flat limit differs by ${worst}`);
  console.log(`  flat limit (R=10000) over a 6-unit walk: worst ${worst.toExponential(2)}`);
});

console.log(`\ncamera frame: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
