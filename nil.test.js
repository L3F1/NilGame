// node nil.test.js
//
// NIL, and the two halves of it that behave completely differently: the
// geodesic flow, which is exact and is checked against an independent
// integration of the differential equations, and the distance, which does not
// exist in closed form and is checked for being a LOWER BOUND rather than for
// being right.
//
// The summary line goes LAST and process.exit after IT. See CLAUDE.md.

import * as N from './nil.js';
import { worldMotionFor } from './engine/runtime/world-motion.js';
import { makeRun, startRun, runStep, PHASE } from './modes.js';

let passed = 0, failed = 0;
const hyp = Math.hypot;
function ok(name, cond, info = '') {
  if (cond) { passed++; console.log(`  ok   ${name}${info ? '  ' + info : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${info ? '  ' + info : ''}`); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
// Park-Miller. The obvious LCG overflows float64 and stops being a generator.
let seed = 20260907;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

console.log('the group');
{
  let worstAssoc = 0, worstInv = 0;
  for (let i = 0; i < 400; i++) {
    const g = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
    const h = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
    const k = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
    const l = N.mul(N.mul(g, h), k), r = N.mul(g, N.mul(h, k));
    worstAssoc = Math.max(worstAssoc, hyp(l[0] - r[0], l[1] - r[1], l[2] - r[2]));
    const e = N.mul(g, N.inv(g));
    worstInv = Math.max(worstInv, hyp(e[0], e[1], e[2]));
  }
  ok('the group law is associative', worstAssoc < 1e-12, worstAssoc.toExponential(2));
  ok('and the inverse is the negation', worstInv < 1e-15, worstInv.toExponential(2));

  // NOT commutative, and the failure to commute is the whole geometry: the
  // commutator of a step right by A and forward by B is (0, 0, A B).
  const c = N.mul(N.mul([1.3, 0, 0], [0, 0.8, 0]),
    N.mul(N.inv([1.3, 0, 0]), N.inv([0, 0.8, 0])));
  ok('the commutator is exactly the enclosed area', near(c[2], 1.3 * 0.8, 1e-15)
    && near(c[0], 0, 1e-15) && near(c[1], 0, 1e-15),
    `(${c[0]}, ${c[1]}, ${c[2].toFixed(6)}) against A*B = ${(1.3 * 0.8).toFixed(6)}`);

  let worstHom = 0;
  for (let i = 0; i < 300; i++) {
    const g = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    const h = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    const A = N.matMul(N.transMat(g), N.transMat(h)), B = N.transMat(N.mul(g, h));
    for (let k = 0; k < 16; k++) worstHom = Math.max(worstHom, Math.abs(A[k] - B[k]));
  }
  ok('transMat is a homomorphism, so a placement composes by matrix multiply',
    worstHom < 1e-13, worstHom.toExponential(2));

  // The contract every other geometry here already keeps.
  const M = N.transMat([0.7, -1.1, 2.3]);
  ok('a placement puts the point in column 3',
    near(M[12], 0.7) && near(M[13], -1.1) && near(M[14], 2.3));
  // Columns 0,1,2 must be the left-invariant frame at that point.
  const p = N.coords(M);
  const want = [[1, 0, -p[1] / 2], [0, 1, p[0] / 2], [0, 0, 1]];
  let worstFrame = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    worstFrame = Math.max(worstFrame, Math.abs(N.frameVec(M, i)[j] - want[i][j]));
  }
  ok('and columns 0,1,2 are E1, E2, E3 there', worstFrame < 1e-15);

  // frameOf and ambientOf differ in exactly one component and must invert.
  let worstRound = 0;
  for (let i = 0; i < 200; i++) {
    const q = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    const back = N.ambientOf(q, N.frameOf(q, v));
    worstRound = Math.max(worstRound, hyp(back[0] - v[0], back[1] - v[1], back[2] - v[2]));
  }
  ok('frameOf and ambientOf are inverses', worstRound < 1e-14, worstRound.toExponential(2));
}

console.log('\nthe geodesic flow, against an independent integration');
{
  // RK4 on the Euler-Arnold equations in FRAME components:
  //   u1' = -c u2,  u2' = c u1,  c' = 0
  // with dp/ds the ambient form of u. Nothing here shares a line with nil.js,
  // which is the point: a formula checked against itself proves nothing.
  const ode = (u0, t, steps = 120000) => {
    let p = [0, 0, 0], u = u0.slice();
    const h = t / steps;
    const amb = (p, u) => [u[0], u[1], u[2] - 0.5 * (p[1] * u[0] - p[0] * u[1])];
    const du = (u) => [-u[2] * u[1], u[2] * u[0], 0];
    for (let i = 0; i < steps; i++) {
      const a1 = amb(p, u), b1 = du(u);
      const p2 = p.map((v, j) => v + h / 2 * a1[j]), u2 = u.map((v, j) => v + h / 2 * b1[j]);
      const a2 = amb(p2, u2), b2 = du(u2);
      const p3 = p.map((v, j) => v + h / 2 * a2[j]), u3 = u.map((v, j) => v + h / 2 * b2[j]);
      const a3 = amb(p3, u3), b3 = du(u3);
      const p4 = p.map((v, j) => v + h * a3[j]), u4 = u.map((v, j) => v + h * b3[j]);
      const a4 = amb(p4, u4), b4 = du(u4);
      p = p.map((v, j) => v + h / 6 * (a1[j] + 2 * a2[j] + 2 * a3[j] + a4[j]));
      u = u.map((v, j) => v + h / 6 * (b1[j] + 2 * b2[j] + 2 * b3[j] + b4[j]));
    }
    return [p, u];
  };
  let worstP = 0, worstD = 0;
  for (const raw of [[1, 0, 0], [0.6, 0.3, 0.74], [0.1, 0, 0.99], [0, 0, 1],
    [0.9, -0.3, 0.316], [0.03, 0.02, 0.99935]]) {
    const n = hyp(...raw), u = raw.map((v) => v / n);
    for (const t of [0.3, 2, 7]) {
      const [pa, ua] = N.flowOrigin(u, t), [pb, ub] = ode(u, t);
      worstP = Math.max(worstP, hyp(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]));
      worstD = Math.max(worstD, hyp(ua[0] - ub[0], ua[1] - ub[1], ua[2] - ub[2]));
    }
  }
  ok('the closed-form flow solves the geodesic equations', worstP < 1e-8 && worstD < 1e-8,
    `position ${worstP.toExponential(2)}, direction ${worstD.toExponential(2)}`);

  // THE SMALL-c BRANCH. Both spellings must agree where they meet, or there is
  // a step in the geometry at exactly the angle a nearly horizontal ray takes.
  const closed = (u, t) => {
    const c = u[2], a2 = u[0] * u[0] + u[1] * u[1], ct = c * t;
    const X = Math.sin(ct) / c, Y = (1 - Math.cos(ct)) / c;
    const z = ct + (a2 / (2 * c * c)) * (ct - Math.sin(ct));
    return [u[0] * X - u[1] * Y, u[1] * X + u[0] * Y, z];
  };
  let worstJoin = 0;
  for (const t of [0.5, 1, 5, 12]) {
    const c = 0.05 / t, u = [Math.sqrt(1 - c * c), 0, c];
    const a = N.flowOrigin(u, t)[0], b = closed(u, t);
    worstJoin = Math.max(worstJoin, hyp(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  ok('the series and closed-form branches join where they meet', worstJoin < 1e-13,
    worstJoin.toExponential(2));

  // Unit speed: the flow is parametrised by arclength, so a step of t has to
  // travel t. Checked by chaining many short steps against one long one.
  let worstSpeed = 0;
  for (const raw of [[1, 0, 0], [0.5, 0.5, 0.707], [0, 0, 1], [0.8, 0.1, 0.59]]) {
    const n = hyp(...raw), u = raw.map((v) => v / n);
    let g = [0, 0, 0], dir = u.slice();
    const steps = 4000, T = 3;
    for (let i = 0; i < steps; i++) {
      const [q, d] = N.flowOrigin(dir, T / steps);
      g = N.mul(g, q); dir = d;
    }
    const one = N.flowOrigin(u, T)[0];
    worstSpeed = Math.max(worstSpeed, hyp(g[0] - one[0], g[1] - one[1], g[2] - one[2]));
  }
  ok('the flow composes: 4000 short steps equal one long one', worstSpeed < 1e-9,
    worstSpeed.toExponential(2));

  // The two degenerate directions are geodesics and must come out exactly.
  const horiz = N.flowOrigin([1, 0, 0], 2.5);
  ok('a horizontal launch stays at its height and goes straight',
    near(horiz[0][0], 2.5, 1e-14) && near(horiz[0][1], 0, 1e-14) && near(horiz[0][2], 0, 1e-14));
  const vert = N.flowOrigin([0, 0, 1], 2.5);
  ok('a vertical launch runs up the axis',
    near(vert[0][0], 0, 1e-15) && near(vert[0][1], 0, 1e-15) && near(vert[0][2], 2.5, 1e-14));
}

console.log('\nclimbing is done by enclosing area');
{
  // Walk a rectangle as a chain of short horizontal steps -- no vertical input
  // at any point -- and come back higher by exactly its area.
  const A = 1.3, B = 0.8;
  const rect = [[0, 0], [A, 0], [A, B], [0, B]];
  let g = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const a = rect[i], b = rect[(i + 1) % 4];
    for (let k = 0; k < 3000; k++) {
      const f = k / 3000, f2 = (k + 1) / 3000;
      const dx = (b[0] - a[0]) * (f2 - f), dy = (b[1] - a[1]) * (f2 - f);
      const l = hyp(dx, dy);
      if (l < 1e-15) continue;
      g = N.mul(g, N.flowOrigin([dx / l, dy / l, 0], l)[0]);
    }
  }
  ok('walking a closed loop lifts you by the area it encloses',
    near(g[2], A * B, 1e-6) && near(g[0], 0, 1e-9) && near(g[1], 0, 1e-9),
    `rose ${g[2].toFixed(6)} against area ${(A * B).toFixed(6)}`);
  ok('loopLift agrees, and is signed', near(N.loopLift(rect), A * B, 1e-15)
    && near(N.loopLift([...rect].reverse()), -A * B, 1e-15),
    `the other way round is ${N.loopLift([...rect].reverse()).toFixed(4)}`);
}

console.log('\ndistance: a bound, not a value');
{
  // THE ONE PROPERTY THAT MATTERS. A path of length t from the origin realises
  // its endpoint, so the true distance is at most t -- and an underestimator
  // that ever exceeds t is broken in the direction sphere tracing cannot
  // survive, because the marcher would step past a surface.
  let violations = 0, tightest = Infinity, samples = 0;
  for (let i = 0; i < 40000; i++) {
    const c = rnd() * 2 - 1, a = Math.sqrt(1 - c * c), ph = rnd() * 2 * Math.PI;
    const t = rnd() * 30;
    const q = N.flowOrigin([a * Math.cos(ph), a * Math.sin(ph), c], t)[0];
    const d = N.distLower([0, 0, 0], q);
    if (d > t + 1e-9) violations++;
    if (t > 0.2) { tightest = Math.min(tightest, d / t); samples++; }
  }
  ok('distLower never exceeds a path that was actually flown', violations === 0,
    `${samples} samples, worst ratio ${tightest.toFixed(3)}`);

  // Left invariance: the bound must not depend on where you ask it from.
  let worstInv = 0;
  for (let i = 0; i < 500; i++) {
    const g = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
    const p = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    const q = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2];
    worstInv = Math.max(worstInv,
      Math.abs(N.distLower(p, q) - N.distLower(N.mul(g, p), N.mul(g, q))));
  }
  ok('and it is left invariant, like the metric', worstInv < 1e-12, worstInv.toExponential(2));

  ok('it is zero at zero and positive away from it',
    N.distLower([0, 0, 0], [0, 0, 0]) === 0 && N.distLower([0, 0, 0], [0, 0, 0.4]) > 0);

  // Exact along a horizontal geodesic, which is the direction it is exact in.
  ok('exact for a purely horizontal displacement',
    near(N.distLower([0, 0, 0], [3, 4, 0]), 5, 1e-12));

  // Distance to a vertical LINE is exact at every height: the horizontal
  // geodesic straight at it is radial, so it sweeps no area and does not climb.
  ok('the distance to a vertical column is exact and height independent',
    near(N.axisDist([1.2, 0.9, 0], 0, 0), 1.5) && near(N.axisDist([1.2, 0.9, 40], 0, 0), 1.5));
}

console.log('\ngoing straight up is not the shortest way up');
{
  // The helices that land back on the axis close when c*t is a multiple of
  // 2 pi, giving z = pi(1 + s^2) at length 2 pi s. Below z = 2 pi no such
  // helix exists and the axis itself is the shortest path.
  let worstLand = 0;
  for (const z of [10, 30, 60, 200]) {
    const s = Math.sqrt(z / Math.PI - 1), c = 1 / s, a = Math.sqrt(1 - c * c);
    const q = N.flowOrigin([a, 0, c], 2 * Math.PI * s)[0];
    worstLand = Math.max(worstLand, hyp(q[0], q[1], q[2] - z));
    if (!near(N.vertDist(z), 2 * Math.PI * s, 1e-9)) failed++;
  }
  ok('vertDist is realised by a helix that lands on the axis', worstLand < 1e-9,
    worstLand.toExponential(2));
  ok('below z = 2 pi the axis itself is shortest',
    near(N.vertDist(4), 4) && near(N.vertDist(2 * Math.PI), 2 * Math.PI, 1e-12),
    'and the two agree exactly where they meet');
  ok('the helix beats the axis, by more the higher you go',
    N.vertDist(60) < 60 && N.vertDist(60) / 60 < 0.5 && N.vertDist(200) / 200 < 0.3,
    `60 costs ${N.vertDist(60).toFixed(3)} (${(N.vertDist(60) / 60).toFixed(3)} of the axis)`);
  ok('and the climb widens like sqrt(height)',
    near(N.climbRadius(60), Math.sqrt(60 / Math.PI - 2), 1e-12),
    `radius ${N.climbRadius(60).toFixed(3)} at z = 60`);
}

console.log('\nthe climb');
{
  const course = N.climbCourse();
  ok(`the course has ${N.NIL_GATES} gates`, course.hoops.length === N.NIL_GATES);
  ok('the last one is the finish, directly overhead', (() => {
    const last = course.hoops[course.hoops.length - 1].at;
    return hyp(last[0], last[1]) < 1e-6 && near(last[2], N.NIL_H, 1e-6);
  })(), `at z = ${course.hoops[course.hoops.length - 1].at[2].toFixed(3)}`);

  // FLY DEAD STRAIGHT AND TAKE EVERY GATE, with no steering at all, which is
  // the same sentence the hyperbolic hoop course, the S^2 x R lap and the flat
  // torus course each make true by a different mechanism. This one is the odd
  // one out: the line does not close, it goes somewhere, and the somewhere is
  // 60 units straight up.
  let M = N.NIL_ID.slice(), v = N.NIL_DIR.map((x) => x * N.NIL_FLY);
  let next = 0;
  const dt = 0.002;
  for (let i = 0; i < 30000 && next < course.hoops.length; i++) {
    const p0 = N.coords(M);
    [M, v] = N.nilStep(M, v, dt);
    const p1 = N.coords(M);
    if (course.crossed([...p0, 1], [...p1, 1], course.hoops[next])) next++;
  }
  const end = N.coords(M);
  ok('flying dead straight takes every gate', next === course.hoops.length,
    `${next}/${course.hoops.length}`);
  ok('and arrives 60 units above where it started', near(end[2], N.NIL_H, 0.2)
    && hyp(end[0], end[1]) < 0.2,
    `z ${end[2].toFixed(2)}, horizontal ${hyp(end[0], end[1]).toFixed(3)}`);

  // The launch is almost entirely sideways: the fast route never once points
  // at the target, which is the whole skill of the mode.
  ok('and it never points at where it is going',
    N.NIL_DIR[2] < 0.25 && N.NIL_DIR[0] > 0.95,
    `launch is ${(100 * N.NIL_DIR[0]).toFixed(0)}% sideways`);

  // A gate is directional, like every course in this project.
  const g0 = course.hoops[0];
  const fwd = N.flowOrigin(N.NIL_DIR, g0.t - 0.05)[0];
  const aft = N.flowOrigin(N.NIL_DIR, g0.t + 0.05)[0];
  ok('a gate counts forwards and not backwards',
    g0.crossed === undefined
      ? course.crossed([...fwd, 1], [...aft, 1], g0) && !course.crossed([...aft, 1], [...fwd, 1], g0)
      : true);
}

console.log('\nthe level');
{
  // Nothing at the spawn. A camera inside geometry fills the screen with one
  // flat colour, which looks exactly like a shader that failed to compile.
  ok('nothing at the spawn', N.nilSDF([0, 0, 0]) > 1.0,
    `nearest surface ${N.nilSDF([0, 0, 0]).toFixed(3)}`);

  // The course must fit down the corridor, gate radius and player included.
  // Measured against the COLUMNS, which are the scenery you must not hit --
  // not against nilSDF, which also contains the finish orb, and the course
  // deliberately ends inside that. Asking the wrong question here reported a
  // clearance of -0.600, which is exactly the finish's radius.
  let worst = Infinity;
  for (let i = 0; i <= 2000; i++) {
    const q = N.flowOrigin(N.NIL_DIR, (i / 2000) * N.NIL_LEN)[0];
    for (const [cx, cy, r] of N.NIL_COLUMNS) {
      worst = Math.min(worst, N.axisDist(q, cx, cy) - r);
    }
  }
  ok('the whole climb clears every column by more than a gate',
    worst > N.NIL_GATE_R + N.NIL_PLAYER_R,
    `${worst.toFixed(3)} against gate ${N.NIL_GATE_R} + player ${N.NIL_PLAYER_R}`);
  // And the finish is a thing you arrive INSIDE, which is how you know you did.
  const fin = N.NIL_ORBS[0];
  ok('the climb ends inside the finish marker',
    N.distLower([fin[0], fin[1], fin[2]],
      N.flowOrigin(N.NIL_DIR, N.NIL_LEN)[0]) < fin[3],
    `finish radius ${fin[3]}`);

  // THE SPIRE IS A POLE OF THE CLIMB. Its horizontal distance is exact, so it
  // holds ONE distance for the whole flight -- the Nil spelling of S^2 x R's
  // rule that a pole of the course circle is a quarter turn from all of it.
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 800; i++) {
    const q = N.flowOrigin(N.NIL_DIR, (i / 800) * N.NIL_LEN)[0];
    const d = N.axisDist(q, N.NIL_SPIRE[0], N.NIL_SPIRE[1]);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  ok('the spire holds one distance for the entire climb', hi - lo < 1e-9,
    `${lo.toFixed(9)} throughout`);

  // The JS and GLSL halves are written from the same arrays; this is the cheap
  // half of what tools/sdf-check.js does for the other worlds.
  const glsl = N.nilGLSL();
  ok('the emitted GLSL carries every column and orb',
    glsl.includes(`NIL_COL[${N.NIL_COLUMNS.length}]`)
    && N.NIL_ORBS.every((o) => glsl.includes(o[3].toFixed(6))),
    `${N.NIL_COLUMNS.length} columns, ${N.NIL_ORBS.length} orbs`);
  ok('and level materials stay below 10, so nothing is silently emissive',
    N.NIL_COLUMNS.every((c) => c[3] < 10) && N.NIL_ORBS.every((o) => o[4] < 10));
}

console.log('\nmotion');
{
  // Free flight has no floor to stop on, so a standstill must stay a standstill.
  const [M0, v0] = N.nilStep(N.NIL_ID.slice(), [0, 0, 0], 0.1);
  ok('a standstill stays put', hyp(...N.coords(M0)) < 1e-15 && hyp(...v0) < 1e-15);

  // The input is in frame components and the lag is first order, so it
  // approaches cruising speed and does not exceed it.
  let v = [0, 0, 0];
  for (let i = 0; i < 400; i++) v = N.nilFly(v, [1, 0, 0], 0.01);
  ok('flight approaches cruising speed without passing it',
    v[0] < N.NIL_FLY + 1e-12 && v[0] > N.NIL_FLY * 0.98,
    `${v[0].toFixed(4)} of ${N.NIL_FLY}`);

  // Collision pushes out along the FRAME gradient. A coordinate gradient would
  // point the wrong way by an amount that grows with distance from the origin.
  const inside = N.transMat([N.NIL_SPIRE[0], N.NIL_SPIRE[1] - 0.2, 5]);
  const [pushed] = N.nilCollide(inside, [0, 0, 0], N.nilSDF);
  ok('collision pushes clear of a column', N.nilSDF(N.coords(pushed)) >= N.NIL_PLAYER_R - 1e-6,
    `${N.nilSDF(N.coords(pushed)).toFixed(4)} against r ${N.NIL_PLAYER_R}`);

  // logTo has no closed form and is solved, so it must land on its target.
  let worstLog = 0;
  for (let i = 0; i < 200; i++) {
    const M = N.transMat([rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    const q = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2, 1];
    const L = N.logTo(M, q);
    const t = hyp(L[0], L[1], L[2]);
    if (t < 1e-9) continue;
    const at = N.rayPoint(N.coords(M), [L[0] / t, L[1] / t, L[2] / t], t);
    worstLog = Math.max(worstLog, hyp(at[0] - q[0], at[1] - q[1], at[2] - q[2]));
  }
  ok('logTo lands on its target', worstLog < 1e-6, worstLog.toExponential(2));
}

// Exercise the ACTUAL input/flow/collision adapter, including the finish.
{
  const motion = worldMotionFor('nil');
  const drive = (active) => {
    let { M, vel } = motion.spawn();
    const run = makeRun(N.climbCourse()); startRun(run);
    for (let i = 0; i < 2400 && run.phase !== PHASE.DONE; i++) {
      const speed = hyp(...vel);
      // Pilot follows the transported flight direction, rather than holding
      // a fixed compass heading (the canonical Nil frame is not transported).
      const want = !active ? [0, 0, 0] : speed < 1e-8 ? N.NIL_DIR : vel.map((v) => v / speed);
      const previous = N.point(M);
      [M, vel] = motion.step(M, vel, want, false, 1 / 120);
      runStep(run, 1 / 120, previous, N.point(M), null);
    }
    return run;
  };
  const driven = drive(true), idle = drive(false);
  ok('actual adapter completes all six gates from rest with collisions', driven.phase === PHASE.DONE,
    `${driven.next}/6 in ${driven.t.toFixed(2)}s`);
  ok('idle input cannot complete the course', idle.next === 0 && idle.phase !== PHASE.DONE);
  for (const gate of N.climbCourse().hoops) {
    const error = Math.max(...N.gateRing(gate).map((p) => {
      const w = N.rel(gate.at, p);
      return Math.abs(w.reduce((sum, n, i) => sum + n * gate.dir[i], 0));
    }));
    ok('drawn ring matches crossing disc', error < 1e-10);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
