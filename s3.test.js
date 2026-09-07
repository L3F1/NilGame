// s3.test.js — the spherical world and flying in it.
//
//   node s3.test.js
//
// Keep the summary line LAST and process.exit after IT. A test appended after
// the summary still runs and still prints but is not counted, and an exit in
// the MIDDLE of the file ends the run there -- which cost physics.test.js 59
// silent tests once.

import {
  S3G, S3_BALLS, S3_PLAYER_R, S3_LAP, S3_ANTIPODE,
  s3Map, s3SDF, s3GLSL, s3Control, s3Step, s3SurfaceNormal, s3Collide,
  s3LapFraction,
} from './s3.js';

let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ok     ${name}`); }
  else { failed++; console.log(`  FAIL   ${name}${extra ? '  ' + extra : ''}`); }
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
function section(s) { console.log(`\n${s}`); }

// ---------------------------------------------------------------------------
section('the model: every scene point is actually on the 3-sphere');

// This is the test that would have caught the whole black-screen problem in
// one line. A hyperbolic placement fed to a spherical marcher gives points
// with <p,p> = 1.81 where +1 is required, so nothing is ever hit.
{
  let worst = 0;
  for (const b of S3_BALLS) worst = Math.max(worst, Math.abs(S3G.dot(b.c, b.c) - 1));
  ok('every ball centre has <p,p> = +1', worst < 1e-12, `worst off by ${worst.toExponential(2)}`);
}

{
  // The origin is a point of S^3 too, and it is where the player starts.
  ok('the origin is on the model', near(S3G.dot(S3G.ORIGIN, S3G.ORIGIN), 1));
}

// ---------------------------------------------------------------------------
section('the scene is clear where the player spawns');

{
  const [d] = s3Map(S3G.ORIGIN);
  // The rule from CLAUDE.md: nothing at either spawn. A camera inside geometry
  // makes every ray hit at t = 0 and fills the screen with one flat colour,
  // which is indistinguishable from a shader that failed to compile.
  ok('spawn is clear of everything', d > 4 * S3_PLAYER_R, `nearest surface ${d.toFixed(3)}`);
  console.log(`         nearest surface to the spawn: ${d.toFixed(4)}`);
}

// ---------------------------------------------------------------------------
section('apparent size is NOT monotonic in distance -- the S^3 signature');

{
  // An object of proper radius r at distance t subtends about r / sin(t), and
  // sin peaks at pi/2. So the far ring looks BIGGER than the near one.
  const axis = S3_BALLS.find((b) => b.r === 0.30);
  const diag = S3_BALLS.find((b) => b.r === 0.15);
  const tA = S3G.dist(S3G.ORIGIN, axis.c), tD = S3G.dist(S3G.ORIGIN, diag.c);
  const appA = axis.r / Math.sin(tA), appD = diag.r / Math.sin(tD);
  ok('the far ring really is further', tD > tA, `${tD.toFixed(3)} > ${tA.toFixed(3)}`);
  ok('yet it subtends MORE', appD > appA * 1.3,
    `apparent ${appD.toFixed(3)} vs ${appA.toFixed(3)}`);
  console.log(`         near ring  d = ${tA.toFixed(3)}  apparent ${appA.toFixed(3)}`);
  console.log(`         far  ring  d = ${tD.toFixed(3)}  apparent ${appD.toFixed(3)}`);
  console.log(`         ${(tD / tA).toFixed(2)}x the distance, ${(appD / appA).toFixed(2)}x the size`);
}

// ---------------------------------------------------------------------------
section('geodesics close, and the antipode focuses them');

{
  const back = S3G.rayPoint(S3G.IDENTITY, [1, 0, 0], S3_LAP);
  ok('a geodesic returns to its start after 2*pi',
    S3G.dist(back, S3G.ORIGIN) < 1e-9, `${S3G.dist(back, S3G.ORIGIN).toExponential(2)}`);
}

{
  // Every geodesic from a point meets again at the antipode. This is the thing
  // that has no hyperbolic counterpart at all: there, geodesics diverge
  // exponentially and never meet again.
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]];
  const ends = dirs.map((d) => S3G.rayPoint(S3G.IDENTITY, d, S3_ANTIPODE));
  let spread = 0;
  for (const a of ends) for (const b of ends) spread = Math.max(spread, S3G.dist(a, b));
  ok('four directions flown pi land on one point', spread < 1e-7,
    `spread ${spread.toExponential(2)}`);
}

// ---------------------------------------------------------------------------
section('flying: the integrator stays in SO(4)');

{
  // The hyperbolic worry is that coordinates grow like cosh and <p,p> loses
  // its digits. S^3 has the opposite problem and it is milder: coordinates are
  // bounded by 1 forever, so nothing overflows -- but the matrix quietly stops
  // being a rotation, which still ruins the picture and is harder to notice.
  let M = S3G.IDENTITY, v = [0.7, 0.3, -0.2];
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    [M, v] = s3Step(M, v, 1 / 120);
    worst = Math.max(worst, Math.abs(S3G.dot(S3G.point(M), S3G.point(M)) - 1));
  }
  ok('4000 substeps keep <p,p> = 1', worst < 1e-12, `worst ${worst.toExponential(2)}`);
  console.log(`         worst |<p,p> - 1| over 4000 steps: ${worst.toExponential(2)}`);
}

{
  // Coordinates cannot run away here, and that IS the engineering case for
  // S^3: the range limit that caps the hyperbolic level size does not exist.
  let M = S3G.IDENTITY;
  let v = [1.2, -0.4, 0.9];
  let biggest = 0;
  for (let i = 0; i < 20000; i++) {
    [M, v] = s3Step(M, v, 1 / 240);
    for (const x of S3G.point(M)) biggest = Math.max(biggest, Math.abs(x));
  }
  ok('coordinates stay bounded by 1 forever', biggest <= 1 + 1e-9,
    `largest |coordinate| ${biggest.toFixed(6)}`);
  console.log(`         largest coordinate after 20000 steps: ${biggest.toFixed(6)}`);
}

{
  // Straight flight really does come back. Speed 1, so a lap takes 2*pi
  // seconds; walk it in small steps and check the return.
  let M = S3G.IDENTITY, v = [1, 0, 0];
  const dt = 1 / 2000;
  for (let i = 0; i < Math.round(S3_LAP / dt); i++) [M, v] = s3Step(M, v, dt);
  const back = S3G.dist(S3G.point(M), S3G.ORIGIN);
  ok('flying straight returns you to the start', back < 1e-3, `off by ${back.toExponential(2)}`);
  console.log(`         after one full lap, distance from start: ${back.toExponential(2)}`);
}

{
  // Velocity in frame components is constant along a geodesic, which is what
  // makes the step one matrix multiply.
  let M = S3G.IDENTITY;
  const v0 = [0.5, -0.3, 0.8];
  let v = v0.slice();
  for (let i = 0; i < 500; i++) [M, v] = s3Step(M, v, 0.01);
  let worst = 0;
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(v[i] - v0[i]));
  ok('frame velocity is unchanged by free flight', worst < 1e-12);
}

// ---------------------------------------------------------------------------
section('control');

{
  const v = s3Control([0, 0, 0], [1, 0, 0], 0.1);
  ok('thrust accelerates along the requested axis', v[0] > 0 && near(v[1], 0) && near(v[2], 0));
  ok('all three axes are driven, not just two',
    s3Control([0, 0, 0], [0, 0, 1], 0.1)[2] > 0);
}

{
  // Drag has to give a terminal speed, or a held key integrates without bound
  // and one lap per frame is not a flight model.
  let v = [0, 0, 0];
  for (let i = 0; i < 20000; i++) v = s3Control(v, [1, 0, 0], 1 / 120);
  const speed = Math.hypot(...v);
  ok('thrust reaches a terminal speed', speed < 20, `terminal ${speed.toFixed(3)}`);
  // A lap is 2*pi. Crossing the whole world in under a second means nothing is
  // ever in view long enough to look at, so this is a design bound, not a
  // sanity check: cap the terminal speed at a third of a lap per second.
  ok('and a lap takes at least three seconds', speed < S3_LAP / 3,
    `${speed.toFixed(3)}, so a lap takes ${(S3_LAP / speed).toFixed(1)} s`);
  console.log(`         terminal speed: ${speed.toFixed(3)} (a lap is ${S3_LAP.toFixed(3)})`);
}

// ---------------------------------------------------------------------------
section('collision');

{
  // Aim at a ball centre and fly in; collide must stop the centre PLAYER_R
  // clear of the surface rather than letting it through.
  const b = S3_BALLS[0];
  const dir = (() => {
    const lv = S3G.logTo(S3G.IDENTITY, b.c);
    const m = Math.hypot(lv[0], lv[1], lv[2]);
    return [lv[0] / m, lv[1] / m, lv[2] / m];
  })();
  let M = S3G.IDENTITY, v = dir.map((x) => x * 3);
  let minClear = 1e9;
  for (let i = 0; i < 2000; i++) {
    [M, v] = s3Step(M, v, 1 / 240);
    [M, v] = s3Collide(M, v, s3SDF);
    minClear = Math.min(minClear, s3SDF(S3G.point(M)));
  }
  ok('a head-on flight never gets inside a ball', minClear > -1e-6,
    `deepest ${minClear.toExponential(2)}`);
  console.log(`         closest approach to a surface: ${minClear.toExponential(2)}`);
}

{
  // The normal must point OUT of the surface. Sample just inside a ball.
  const b = S3_BALLS[0];
  const lv = S3G.logTo(S3G.IDENTITY, b.c);
  const m = Math.hypot(lv[0], lv[1], lv[2]);
  const dir = [lv[0] / m, lv[1] / m, lv[2] / m];
  // Just inside the near face of the ball.
  const M = S3G.geodesic(S3G.IDENTITY, dir, S3G.dist(S3G.ORIGIN, b.c) - b.r + 0.02);
  const n = s3SurfaceNormal(M, s3SDF);
  // Outward means back toward where we came from, i.e. opposed to dir.
  const along = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
  ok('the surface normal points out of the ball', along < -0.9, `dot ${along.toFixed(4)}`);
}

{
  ok('a clear point is not moved by collide', (() => {
    const [M2, , n] = s3Collide(S3G.IDENTITY, [0, 0, 0], s3SDF);
    return n === null && S3G.dist(S3G.point(M2), S3G.ORIGIN) < 1e-12;
  })());
}

// ---------------------------------------------------------------------------
section('the JS and GLSL scenes describe the same thing');

{
  const src = s3GLSL();
  ok('the GLSL emits every ball', (src.match(/vec4\(/g) || []).length === S3_BALLS.length);
  // Count inside the S3_RM array only -- the function body has vec2s of its
  // own, and counting those made this pass or fail for the wrong reason.
  const rm = src.slice(src.indexOf('S3_RM'), src.indexOf('vec2 sphereWorld'));
  ok('and a radius/material for each', (rm.match(/vec2\(/g) || []).length === S3_BALLS.length,
    `found ${(rm.match(/vec2\(/g) || []).length}`);
  ok('it declares sphereWorld', src.includes('vec2 sphereWorld(vec4 p)'));
  // The backtick rule: these strings live in template literals in shader.js.
  ok('no backtick anywhere in the emitted GLSL', !src.includes('`'));
  ok('the emitted GLSL is ASCII', [...src].every((c) => c.charCodeAt(0) < 128));
  // Every number must parse as GLSL float, i.e. carry a '.' or an exponent.
  const nums = src.match(/-?\d[\d.e+-]*/g) || [];
  const bad = nums.filter((s) => !/[.e]/.test(s) && !/^\d+$/.test(s));
  ok('every emitted number is a valid float literal', bad.length === 0, bad.join(' '));
}

{
  // The materials rule: level content stays below 10, because the shader's
  // "does it glow" test is exactly that boundary. A level material above it
  // would be silently emissive in every direction.
  const worst = Math.max(...S3_BALLS.map((b) => b.mat));
  ok('every material is below 10', worst < 10, `largest ${worst}`);
}

// ---------------------------------------------------------------------------
section('lap readout');

{
  ok('the lap fraction starts at zero', near(s3LapFraction(S3G.IDENTITY, S3G.IDENTITY), 0));
  const half = S3G.geodesic(S3G.IDENTITY, [1, 0, 0], S3_ANTIPODE);
  ok('and reads 1 at the antipode', near(s3LapFraction(half, S3G.IDENTITY), 1, 1e-9));
}

// ---------------------------------------------------------------------------
section('S^3 does not need what H^3 needs');

{
  // The engineering case for S^3, and the reason it was drawn first. In
  // float32 -- which is what the shader has -- a hyperbolic point at d = 7 has
  // already lost <p,p> to 1e-3, because coordinates grow like cosh. Spherical
  // coordinates are bounded by 1 at every distance, including the antipode.
  const far = S3G.rayPoint(S3G.IDENTITY, [1, 0, 0], S3_ANTIPODE * 0.999);
  const f32 = far.map((x) => Math.fround(x));
  const err = Math.abs(f32[0] ** 2 + f32[1] ** 2 + f32[2] ** 2 + f32[3] ** 2 - 1);
  ok('float32 holds all the way to the antipode', err < 1e-6, `err ${err.toExponential(2)}`);
  console.log(`         <p,p> error in float32 at 0.999 of the antipode: ${err.toExponential(2)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
