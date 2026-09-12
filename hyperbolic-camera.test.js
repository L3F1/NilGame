// The camera frame on the experimental H3 adapter.
//
// camera-frame.js used to write the ambient inner product out by hand, as the
// plain Euclidean sum, on the reasoning that both spaces it then supported
// embed Euclidean-ly. H3 does not: its ambient pairing is Lorentzian and the
// last coordinate enters with a minus sign. So this file has two jobs.
//
//   - Show the H3 camera is a camera: orthonormal, tangent, right-handed,
//     turnable, and CARRIED. Every claim here is checked against a Lorentz
//     product computed in this file, never against the adapter's own `dot`,
//     so an adapter that agreed with itself while being wrong would not pass.
//   - Show E3 and S3 did not move. The old Euclidean path is reimplemented
//     below as `legacyAxes` and the new code must equal it bit for bit, which
//     is a stronger statement than "still passes its own tests".
//
// The failing case is pinned too: `euclideanProjector` is what the old file
// did: on H3 it can return a tangent vector pointing in the wrong direction.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { createSphericalCover } from './engine/geometry/spherical-cover.js';
import { createHyperbolicSpace } from './engine/geometry/hyperbolic-space.js';
import { createCameraFrame, turn, carryAlong, alignUp, rollAgainst } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (${Math.abs(a - b)})`);

// The Lorentz form, written here and not imported, so these tests are an
// independent measurement of the adapter rather than a restatement of it.
const L = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
const combine = (a, x, b, y) => a.map((v, i) => v * x + b[i] * y);
function det4(m) {
  let total = 0;
  for (let c = 0; c < 4; c++) {
    const s = m.slice(1).map(row => row.filter((_, j) => j !== c));
    const minor = s[0][0] * (s[1][1] * s[2][2] - s[1][2] * s[2][1])
      - s[0][1] * (s[1][0] * s[2][2] - s[1][2] * s[2][0])
      + s[0][2] * (s[1][0] * s[2][1] - s[1][1] * s[2][0]);
    total += (c % 2 ? -1 : 1) * m[0][c] * minor;
  }
  return total;
}

const e3 = createMetricSpace({ kind: 'e3' });
const s3 = createMetricSpace({ kind: 's3', curvatureRadius: 8 });
const cover = createSphericalCover({ curvatureRadius: 8 });
const h3 = createHyperbolicSpace({ curvatureRadius: 1.25, maxDistance: 2.5 });
// Every H3 assertion below is made OFF the origin. At the origin the Lorentz
// and Euclidean projectors coincide on the spatial block and the bug this
// change fixes is invisible.
const offOrigin = [[0.6, -0.4, 0.35], [1.1, 0.2, -0.9], [-0.3, 1.4, 0.5], [0, 0, 1.8]]
  .map(a => h3.decode(a));

// ---------------------------------------------------------------- the contract

test('E3 and S3 expose an ambientDot that is the Euclidean sum, off-tangent included', () => {
  for (const [space, p, off] of [
    [e3, [1, 2, 3], [0.5, -1, 4]],
    [s3, s3.decode([1, 2, 0]), [0.5, -1, 4, 2]],
  ]) {
    const euclidean = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
    // `off` is deliberately NOT tangent at p on S3: ambientDot must still
    // answer, because repairing drift is the only reason it exists.
    if (space === s3) assert.throws(() => space.validateTangent(p, off), /tangent/);
    near(space.ambientDot(off, off), euclidean(off, off), 0, 'ambientDot self');
    near(space.ambientDot(p, off), euclidean(p, off), 0, 'ambientDot mixed');
    near(space.ambientDot(off, p), space.ambientDot(p, off), 0, 'ambientDot symmetry');
    // On tangent vectors it must agree with the validated metric dot.
    const [right, forward] = space.frame(p);
    near(space.ambientDot(right, forward), space.dot(p, right, forward), 1e-15, 'tangent agreement');
    near(space.ambientDot(forward, forward), 1, 1e-15, 'frame axis is unit');
  }
});

test('ambientDot refuses anything that is not a finite vector of the dimension', () => {
  for (const space of [e3, s3, h3]) {
    const n = space.dimension, good = new Array(n).fill(0.1);
    for (const bad of [good.slice(0, n - 1), [...good, 1], 'x', null, good.map(() => NaN),
      good.map((v, i) => (i ? v : Infinity))]) {
      assert.throws(() => space.ambientDot(bad, good), /finite|Expected/, `accepted ${JSON.stringify(bad)}`);
      assert.throws(() => space.ambientDot(good, bad), /finite|Expected/, `accepted ${JSON.stringify(bad)}`);
    }
  }
});

test('spherical-cover inherits ambientDot through its spread', () => {
  assert.equal(typeof cover.ambientDot, 'function');
  const p = cover.decode ? s3.decode([2, 1, -1]) : null;
  const off = [1, 0.5, -2, 3];
  near(cover.ambientDot(off, off), s3.ambientDot(off, off), 0, 'cover ambientDot');
  // And the inherited pairing is the one its camera actually uses.
  const camera = createCameraFrame(cover, p, { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] });
  near(cover.norm(p, camera.forward), 1, 1e-14, 'cover camera forward unit');
});

test('a metric with no ambientDot is refused, never given the Euclidean answer', () => {
  // The whole hazard: an unknown kind silently treated as flat. The message
  // must name the kind so the refusal is actionable.
  const { ambientDot, ...crippled } = h3;
  assert.throws(() => createCameraFrame(crippled, offOrigin[0], { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] }),
    /h3.*ambientDot|ambientDot/, 'a space without an ambient pairing was accepted');
});

// -------------------------------------------------------- H3 frame assembly

test('H3 camera axes are Lorentz-orthonormal and tangent, off the origin', () => {
  let worst = 0, at = null;
  for (const p of offOrigin) {
    const basis = h3.frame(p);
    // Aim somewhere generic so no axis coincides with a construction axis.
    const forward = combine(combine(basis[0], 0.4, basis[1], 0.9), 1, basis[2], -0.2);
    const camera = createCameraFrame(h3, p, { forward, up: basis[2] });
    const axes = [camera.right, camera.forward, camera.up];
    for (let i = 0; i < 3; i++) {
      const residual = Math.abs(L(p, axes[i]));
      if (residual > worst) { worst = residual; at = `tangency ${i}`; }
      for (let j = 0; j < 3; j++) {
        const r = Math.abs(L(axes[i], axes[j]) - (i === j ? 1 : 0));
        if (r > worst) { worst = r; at = `gram ${i}${j}`; }
      }
    }
  }
  console.log(`  H3 orthonormality: worst ${worst.toExponential(2)} at ${at}`);
  assert.ok(worst <= 1e-13, `worst ${worst} at ${at}`);
});

test('H3 handedness matches the construction frame and the lab convention', () => {
  for (const p of offOrigin) {
    const b = h3.frame(p);
    // Aimed along the frame exactly as the lab aims a flat camera: forward
    // +x, up +z. Then right must be -y, which is what the E3 cross product
    // gives and is the sign a floor-above-the-horizon bug would flip.
    const camera = createCameraFrame(h3, p, { forward: b[0], up: b[2] });
    const worst = Math.max(...camera.right.map((x, i) => Math.abs(x + b[1][i])));
    assert.ok(worst <= 1e-14, `right is not -y: ${worst}`);
    // Independent of any coordinate convention: the oriented 4-volume of
    // (position, right, forward, up) must equal that of the construction
    // frame. Equal, not merely same-sign -- both are Lorentz-orthonormal.
    const cameraVolume = det4([p, camera.right, camera.forward, camera.up]);
    const basisVolume = det4([p, b[0], b[1], b[2]]);
    near(cameraVolume, basisVolume, 1e-12, 'oriented volume');
    assert.ok(Math.abs(basisVolume) > 0.5, 'degenerate construction frame');
    // A frame aimed the other way round must reverse it, or the test above
    // would pass for a formula that ignores its inputs.
    const mirrored = createCameraFrame(h3, p, { forward: b[2], up: b[0] });
    near(det4([p, mirrored.right, mirrored.forward, mirrored.up]), basisVolume, 1e-12, 'mirrored volume');
    near(L(mirrored.right, camera.right), -L(b[1], b[1]), 1e-12, 'mirrored right reverses');
  }
});

test('H3 rejects a degenerate aim rather than inventing an orientation', () => {
  const p = offOrigin[1], b = h3.frame(p);
  assert.throws(() => createCameraFrame(h3, p, { forward: [0, 0, 0, 0], up: b[2] }), /degenerate/);
  assert.throws(() => createCameraFrame(h3, p, { forward: b[0], up: b[0].map(x => x * -3) }), /parallel/);
});

// ------------------------------------------------------------------- turning

test('H3 turns rotate by exactly the requested angle, in the lab\'s sense', () => {
  const p = offOrigin[2], b = h3.frame(p);
  const camera = createCameraFrame(h3, p, { forward: b[0], up: b[2] });
  for (const yaw of [0.3, -1.1, 2.4]) {
    const turned = turn(camera, { yaw });
    // Measured against the ORIGINAL axes with the Lorentz form written above.
    near(L(turned.forward, camera.forward), Math.cos(yaw), 1e-13, `yaw ${yaw} cos`);
    near(L(turned.forward, camera.right), -Math.sin(yaw), 1e-13, `yaw ${yaw} sin`);
    near(L(turned.up, camera.up), 1, 1e-13, `yaw ${yaw} leaves up alone`);
  }
  for (const pitch of [0.4, -0.9]) {
    const turned = turn(camera, { pitch });
    near(L(turned.forward, camera.forward), Math.cos(pitch), 1e-13, `pitch ${pitch} cos`);
    near(L(turned.forward, camera.up), Math.sin(pitch), 1e-13, `pitch ${pitch} lifts toward up`);
    near(L(turned.right, camera.right), 1, 1e-13, `pitch ${pitch} leaves right alone`);
  }
});

test('H3 yaw and pitch about the frame\'s own axes do not commute', () => {
  const p = offOrigin[0], b = h3.frame(p);
  const camera = createCameraFrame(h3, p, { forward: b[0], up: b[2] });
  const yawFirst = turn(turn(camera, { yaw: 0.6 }), { pitch: 0.5 });
  const pitchFirst = turn(turn(camera, { pitch: 0.5 }), { yaw: 0.6 });
  const gap = Math.acos(Math.min(1, L(yawFirst.forward, pitchFirst.forward)));
  assert.ok(gap > 1e-2, `the rotations commuted, so they are about a world up: ${gap}`);
  // Both are still frames -- non-commuting is a fact, not a corruption.
  for (const c of [yawFirst, pitchFirst]) {
    near(L(c.forward, c.forward), 1, 1e-13, 'unit');
    near(L(p, c.up), 0, 1e-13, 'tangent');
  }
});

test('H3 roll survives, and alignUp removes it without re-aiming', () => {
  const p = offOrigin[3], b = h3.frame(p);
  const camera = createCameraFrame(h3, p, { forward: b[0], up: b[2] });
  for (const roll of [0.4, -1.2]) {
    const rolled = turn(camera, { roll });
    near(L(rolled.forward, camera.forward), 1, 1e-13, 'roll re-aimed the camera');
    // Roll r sends up to cos(r)*up - sin(r)*right, so rollAgainst reads +r.
    near(L(rolled.up, camera.up), Math.cos(roll), 1e-13, 'roll up cosine');
    near(L(rolled.up, camera.right), -Math.sin(roll), 1e-13, 'roll up sine');
    near(rollAgainst(rolled, camera.up), roll, 1e-12, 'rollAgainst disagrees with the roll applied');
    // The gravity policy: a half correction leaves half the roll.
    const half = alignUp(rolled, camera.up, 0.5);
    near(L(half.forward, camera.forward), 1, 1e-12, 'alignUp re-aimed the camera');
    near(rollAgainst(half, camera.up), roll / 2, 1e-12, 'alignUp amount is not a fraction');
    near(rollAgainst(alignUp(rolled, camera.up), camera.up), 0, 1e-12, 'a full alignUp left roll behind');
  }
});

// ------------------------------------------------------------ carrying a step

test('an H3 frame carried round a geodesic triangle picks up the angle defect', () => {
  // Gauss-Bonnet with K = -1/R^2: the holonomy of a closed loop is the
  // enclosed area over R^2, and for a hyperbolic equilateral triangle of side
  // a the area is exactly the angle defect pi - 3A with cos A = cosh(a/R) /
  // (1 + cosh(a/R)). That closed form is computed here, not by the adapter.
  for (const R of [1, 1.25, 4]) {
    const space = createHyperbolicSpace({ curvatureRadius: R, maxDistance: 2 * R });
    for (const side of [0.35 * R, 0.7 * R, 1.3 * R]) {
      const interior = Math.acos(Math.cosh(side / R) / (1 + Math.cosh(side / R)));
      const exterior = Math.PI - interior;
      for (const sense of [1, -1]) {
        let camera = createCameraFrame(space, space.origin, { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] });
        const start = camera;
        for (let i = 0; i < 3; i++) {
          camera = carryAlong(camera, space.stepWithTransport(camera.position, camera.forward, side));
          camera = turn(camera, { yaw: sense * exterior });
        }
        // The loop closes in space; undo only the three deliberate turns.
        near(space.distance(camera.position, start.position), 0, 1e-12, 'the triangle did not close');
        camera = turn(camera, { yaw: -sense * 3 * exterior });
        const angle = Math.atan2(L(camera.forward, start.right), L(camera.forward, start.forward));
        near(angle, sense * (Math.PI - 3 * interior), 1e-11, `holonomy R=${R} a=${side} sense=${sense}`);
      }
    }
  }
  // The same construction on the sphere, where cosh becomes cos and the
  // defect becomes an excess. Identical code, identical closed form, opposite
  // sign -- which is the evidence that the H3 number above is curvature and
  // not an artefact of this harness.
  const euclid = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const sphere = createMetricSpace({ kind: 's3', curvatureRadius: 4 });
  const interior = Math.acos(Math.cos(1) / (1 + Math.cos(1)));
  let sc = createCameraFrame(sphere, sphere.origin, { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] });
  const s0 = sc;
  for (let i = 0; i < 3; i++) {
    sc = carryAlong(sc, sphere.stepWithTransport(sc.position, sc.forward, 4));
    sc = turn(sc, { yaw: Math.PI - interior });
  }
  near(sphere.distance(sc.position, s0.position), 0, 1e-12, 'the spherical triangle did not close');
  sc = turn(sc, { yaw: -3 * (Math.PI - interior) });
  const sphereAngle = Math.atan2(euclid(sc.forward, s0.right), euclid(sc.forward, s0.forward));
  near(sphereAngle, Math.PI - 3 * interior, 1e-11, 'spherical holonomy');
  assert.ok(sphereAngle < 0 && Math.PI - 3 * interior < 0, `sphere must turn the other way: ${sphereAngle}`);
  console.log(`  holonomy: H3 defect positive, S3 excess ${sphereAngle.toFixed(6)}`);
});

test('an H3 frame is carried, not rebuilt from the construction frame', () => {
  // The whole reason the frame is state. Walk out, turn, walk on: the arriving
  // frame must NOT be the one `space.frame` would hand anyone standing there.
  let camera = createCameraFrame(h3, h3.origin, { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] });
  camera = turn(camera, { yaw: 0.7, pitch: 0.3 });
  camera = carryAlong(camera, h3.stepWithTransport(camera.position, camera.forward, 0.8));
  camera = turn(camera, { yaw: -0.9 });
  camera = carryAlong(camera, h3.stepWithTransport(camera.position, camera.forward, 0.6));
  const rebuilt = h3.frame(camera.position);
  const drift = Math.max(...rebuilt.map((e, i) => Math.abs(L(e, [camera.right, camera.forward, camera.up][i]) - 1)));
  assert.ok(drift > 1e-3, `the frame was rebuilt from construction: ${drift}`);
  // Carried and still a frame: orthonormal and tangent at the arrival point.
  for (const v of [camera.right, camera.forward, camera.up]) {
    near(L(v, v), 1, 1e-12, 'carried axis is unit');
    near(L(camera.position, v), 0, 1e-12, 'carried axis is tangent');
    h3.validateTangent(camera.position, v);
  }
  near(L(camera.right, camera.up), 0, 1e-12, 'carried axes stay orthogonal');
});

test('a long H3 walk does not accumulate off-tangent drift', () => {
  let camera = createCameraFrame(h3, h3.origin, { forward: [1, 0, 0, 0], up: [0, 0, 1, 0] });
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    camera = turn(camera, { yaw: 0.07, pitch: 0.03 * Math.sin(i) });
    const reach = h3.boundaryDistance(camera.position, camera.forward, 0.05);
    camera = carryAlong(camera, h3.stepWithTransport(camera.position, camera.forward,
      Number.isFinite(reach) && reach < 0.05 ? 0 : 0.05));
    for (const v of [camera.right, camera.forward, camera.up]) {
      worst = Math.max(worst, Math.abs(L(camera.position, v)), Math.abs(L(v, v) - 1));
    }
  }
  console.log(`  H3 400-step walk: worst tangency/norm residual ${worst.toExponential(2)}`);
  assert.ok(worst <= 1e-10, `drift accumulated to ${worst}`);
});

// -------------------------------------------------------------- drift repair

test('H3 repairs an off-tangent input with the Lorentz projector, and Euclid cannot', () => {
  const p = offOrigin[1], b = h3.frame(p);
  // A forward pushed off the tangent space along the position, exactly the
  // shape float error produces. `createCameraFrame` must absorb it.
  const dirty = combine(b[0], 1, p, 0.02);
  assert.throws(() => h3.validateTangent(p, dirty), /tangent/, 'the test input was already clean');
  const camera = createCameraFrame(h3, p, { forward: dirty, up: b[2] });
  near(L(p, camera.forward), 0, 1e-13, 'repaired forward is tangent');
  // Repair means REMOVE the radial part, not re-aim: the clean camera and the
  // dirty one must agree, since the two forwards differ only along p.
  const clean = createCameraFrame(h3, p, { forward: b[0], up: b[2] });
  for (const axis of ['forward', 'up', 'right']) {
    const worst = Math.max(...camera[axis].map((x, i) => Math.abs(x - clean[axis][i])));
    assert.ok(worst <= 1e-13, `${axis} was re-aimed by the repair: ${worst}`);
  }

  // THE ISOLATED FAILURE, pinned so it cannot come back. This is what
  // camera-frame.js did before: take the basis coefficients with the Euclidean
  // sum. Note carefully what goes wrong, because it is NOT what one would
  // guess: the result is still tangent -- any combination of the basis is,
  // since every basis vector is Lorentz-orthogonal to p -- so no validation
  // anywhere catches it. It is simply the WRONG tangent vector. A projector
  // handed an already-tangent, already-unit vector must be the identity; the
  // Euclidean one instead rotates the aim, by an angle that is exactly zero at
  // the origin and grows without bound with distance from it. That is the
  // worst possible shape for a bug: every test at the origin passes, and the
  // camera quietly points somewhere else the further the player walks.
  const euclideanProjector = (space, point, v) => space.frame(point)
    .reduce((acc, e) => combine(acc, 1, e, v.reduce((s, x, i) => s + x * e[i], 0)),
      new Array(v.length).fill(0));
  const lorentzProjector = (space, point, v) => space.frame(point)
    .reduce((acc, e) => combine(acc, 1, e, space.ambientDot(v, e)), new Array(v.length).fill(0));
  let worstEuclid = 0;
  for (const point of [h3.origin, ...offOrigin]) {
    const axis = h3.frame(point)[0];
    const wrong = euclideanProjector(h3, point, axis);
    // Still tangent -- which is exactly why nothing downstream refuses it.
    near(L(point, wrong), 0, 1e-12, 'the Euclidean result was not even tangent');
    const aimError = Math.acos(Math.min(1, L(wrong, axis) / Math.sqrt(L(wrong, wrong))));
    if (point !== h3.origin) worstEuclid = Math.max(worstEuclid, aimError);
    else near(aimError, 0, 1e-12, 'the two projectors must agree at the origin');
    // The Lorentz one, which is what the code now uses, is the identity.
    const right = lorentzProjector(h3, point, axis);
    assert.ok(Math.max(...right.map((x, i) => Math.abs(x - axis[i]))) <= 1e-14,
      'Lorentz projector is not the identity on a tangent');
  }
  console.log(`  Euclidean projector on H3: aim wrong by up to ${(worstEuclid * 180 / Math.PI).toFixed(1)} deg (Lorentz: exact)`);
  assert.ok(worstEuclid > 0.1, `the failing case no longer fails: ${worstEuclid}`);
});

// ------------------------------------------------------------ E3/S3 parity

test('E3 and S3 frames are bit-identical to the old Euclidean-ambient code', () => {
  // The previous implementation, restated. If the change moved a flat or
  // spherical camera by one ulp this fails, which is the point: H3 support
  // must be a generalisation and not a rewrite.
  const euclid = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const legacyToTangent = (space, p, v) => space.frame(p)
    .reduce((acc, e) => combine(acc, 1, e, euclid(v, e)), new Array(v.length).fill(0));
  function legacyAxes(space, position, forward, up) {
    const f = legacyToTangent(space, position, forward);
    const u = legacyToTangent(space, position, up);
    const basis = space.frame(position);
    const fc = basis.map(e => euclid(f, e)), uc = basis.map(e => euclid(u, e));
    const cross = [fc[1] * uc[2] - fc[2] * uc[1], fc[2] * uc[0] - fc[0] * uc[2], fc[0] * uc[1] - fc[1] * uc[0]];
    const right = basis.reduce((acc, e, i) => combine(acc, 1, e, cross[i]), new Array(position.length).fill(0));
    // Same Gram-Schmidt, unchanged by this task.
    const F = space.normalize(position, legacyToTangent(space, position, f));
    const U = space.normalize(position, space.project(position, legacyToTangent(space, position, u), F));
    const R = space.normalize(position, space.project(position,
      space.project(position, legacyToTangent(space, position, right), F), U));
    return { forward: F, up: U, right: R };
  }
  const cases = [
    [e3, [0, 0, 0]], [e3, [3, -2, 7]],
    [s3, s3.origin], [s3, s3.decode([2, 1, -1])], [s3, s3.decode([0, 5.5, 3])],
  ];
  for (const [space, p] of cases) {
    for (const [forward, up] of [
      [space.frame(p)[0], space.frame(p)[2]],
      [combine(space.frame(p)[0], 0.3, space.frame(p)[1], -1.7), space.frame(p)[2]],
      [combine(space.frame(p)[1], 1, space.frame(p)[2], 0.25), space.frame(p)[0]],
    ]) {
      const now = createCameraFrame(space, p, { forward, up });
      const before = legacyAxes(space, p, forward, up);
      for (const axis of ['forward', 'up', 'right']) {
        for (let i = 0; i < p.length; i++) {
          assert.equal(now[axis][i], before[axis][i],
            `${space.kind} ${axis}[${i}] moved: ${now[axis][i]} vs ${before[axis][i]}`);
        }
      }
    }
  }
  console.log(`  E3/S3 parity: ${cases.length * 3} frames identical to the last bit`);
});

test('E3 and S3 carried frames still survive a walk unchanged', () => {
  for (const space of [e3, s3, cover]) {
    let camera = createCameraFrame(space, space.origin,
      { forward: space.frame(space.origin)[0], up: space.frame(space.origin)[2] });
    const start = camera;
    for (let i = 0; i < 25; i++) {
      camera = turn(camera, { yaw: 0.1, pitch: 0.05 });
      camera = carryAlong(camera, space.stepWithTransport(camera.position, camera.forward, 0.2));
      for (const v of [camera.forward, camera.up, camera.right]) space.validateTangent(camera.position, v);
    }
    near(space.norm(camera.position, camera.forward), 1, 1e-12, `${space.kind} forward unit`);
    near(space.dot(camera.position, camera.forward, camera.up), 0, 1e-12, `${space.kind} orthogonal`);
    if (space !== e3) {
      const rebuilt = space.frame(camera.position);
      const same = rebuilt.every((e, i) =>
        Math.abs(space.dot(camera.position, e, [camera.right, camera.forward, camera.up][i]) - 1) < 1e-6);
      assert.ok(!same, `${space.kind} frame was rebuilt from construction`);
    }
    assert.notEqual(camera.position, start.position);
  }
});

console.log(`\nhyperbolic camera: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
