// MUSE-25: is the marched rayHit telling the truth?
//
// On a carved scene rayHit sphere-traces the distance bound instead of
// solving in closed form. The ground truth here is deliberately slow and
// obviously correct: fixed-step along the ray for the first sign change of
// field.distance, then bisection to convergence. It never consults rayHit.
//
// Measured on this spread (see overnight-results MUSE-25) and pinned below:
// uncarved agrees to 4e-15; carved stops at most 6.56e-6 early, which is the
// 1e-6 hit threshold amplified by oblique incidence (~threshold/sin); nothing
// ever overshoots. One ray per carved scene outruns the marcher's fixed
// 256-step budget and returns Infinity for a surface at 40.4 -- the bound
// never steps past, the budget just runs out. That is a known limitation,
// pinned explicitly so fixing it breaks this test on purpose.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';

// Stated tolerances, with the measurement behind each in the report.
const CLOSE_TOL = 1e-4;   // marched may stop early: threshold/sin(incidence)
const OVER_TOL = 1e-9;    // overshoot would mean the bound lied: never seen
const PLAIN_TOL = 1e-12;  // uncarved closed form vs truth: measured 4e-15

const doc = (id, entities) => ({
  format: 'nil-scene', version: 1, id,
  units: { name: 'design-unit', playerRadius: 0.25 },
  regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
  entities, connections: [],
});
const ground = { id: 'ground', regionId: 'r', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] };
const wall = { id: 'wall', regionId: 'r', kind: 'plane', position: [0, 2, 0], up: [0, -1, 0] };
const backface = { id: 'backface', regionId: 'r', kind: 'plane', op: 'subtract', target: 'wall',
  position: [0, 2.4, 0], up: [0, -1, 0] };
const spawnAt = (p) => ({ id: 'start', regionId: 'r', kind: 'spawn', position: p });
const carve = (id, position, radius, target) =>
  ({ id, regionId: 'r', kind: 'ball', op: 'subtract', target, position, radius });

const scenes = {
  plain: doc('plain', [ground,
    { id: 'boulder', regionId: 'r', kind: 'ball', position: [4, 0, 1], radius: 1 },
    spawnAt([-4, -4, 0.3])]),
  doorway: doc('doorway', [ground, wall, spawnAt([0, -1, 0.3]), backface,
    carve('door', [0, 2.2, 0.6], 0.9, 'wall')]),
  'inside-carve': doc('inside', [ground, wall, spawnAt([0, -1, 0.3]), backface,
    carve('pit', [3, 2.2, 0.6], 0.1, 'wall')]),
  straddle: doc('straddle', [ground, wall, spawnAt([3, -3, 0.3]), backface,
    carve('pit', [-3, 0, 0.3], 0.5, 'ground')]),
  overlap: doc('overlap', [ground, wall, spawnAt([0, -1, 0.3]), backface,
    carve('door1', [0, 2.2, 0.6], 0.9, 'wall'),
    carve('door2', [0.8, 2.2, 0.6], 0.9, 'wall')]),
  // Shaves the slab to a ~0.02 membrane near the axis: the step-over case.
  thin: doc('thin', [ground, wall, spawnAt([0, -1, 0.3]), backface,
    carve('shave', [0, 2.1, 0.6], 0.28, 'wall')]),
};

const at = (p, u, t) => [p[0] + u[0] * t, p[1] + u[1] * t, p[2] + u[2] * t];
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

/** Independent ground truth. Slow, fixed-step, then bisection. */
function truth(f, p, u, step = 0.002, tmax = 100) {
  if (f.distance(p) <= 0) return 0;
  let prev = 0;
  for (let t = step; t <= tmax; t += step) {
    if (f.distance(at(p, u, t)) <= 0) {
      let lo = prev, hi = t;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (f.distance(at(p, u, m)) <= 0) hi = m; else lo = m;
      }
      return hi;
    }
    prev = t;
  }
  return Infinity;
}

const rays = [];
for (const x of [-4, -2, 0, 2, 4]) for (const z of [0.2, 0.6, 1.5]) {
  rays.push([[x, -3, z], norm([0, 1, 0])]);
  rays.push([[x, -3, z], norm([0.2, 1, 0.1])]);
  rays.push([[-3, x, z], norm([1, 0.15, 0])]);
}
for (const dx of [-0.5, 0, 0.5]) for (const dz of [-0.3, 0, 0.3]) {
  rays.push([[dx, -1, 0.6 + dz], norm([0, 1, 0])]);
  rays.push([[dx, 5, 0.6 + dz], norm([0, -1, 0.05])]);
}
rays.push([[0, -1, 0.6], norm([0, 1, 0.02])]);
rays.push([[3, -1, 0.6], norm([0, 1, 0.001])]);
// Origins inside carved voids, aimed at what remains.
rays.push([[0, 2.2, 0.6], norm([0, 1, 0])]);
rays.push([[0, 2.2, 0.6], norm([0, -1, 0])]);
rays.push([[0, 2.2, 0.6], norm([0.3, 1, 0.1])]);
rays.push([[-3, 0, 0.3], norm([0, 0, -1])]);
rays.push([[-3, 0, 0.9], norm([0, 0, -1])]);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// The budget ray, pinned as a LIMITATION, not as correctness: truth is a
// wall face at ~40.45, reached after ~300 bound-limited steps, and the
// marcher's fixed budget of 256 runs out one step short. If the budget is
// ever raised or made adaptive, this case fails and should be deleted.
const SAIL = { p: [-3, -4, 0.2], u: norm([1, 0.15, 0]) };
const isSail = (p, u) => p.every((x, i) => x === SAIL.p[i]) && u.every((x, i) => x === SAIL.u[i]);

for (const [name, d] of Object.entries(scenes)) {
  const f = compileSceneField(d);
  const tol = name === 'plain' ? PLAIN_TOL : null;
  let worstClose = 0, worstCloseAt = null, worstOver = 0, worstOverAt = null, n = 0;
  const failures = [];
  for (const [p, u] of rays) {
    if (f.distance(p) <= 0) continue;
    const T = truth(f, p, u), M = f.rayHit(p, u);
    n++;
    if (!isFinite(T) && !isFinite(M)) continue;
    if (!isFinite(T) && isFinite(M)) { failures.push(`hallucinated hit at ${M} on ${JSON.stringify(p)}`); continue; }
    if (isFinite(T) && !isFinite(M)) {
      if (isSail(p, u)) continue; // the pinned limitation, checked below
      failures.push(`sailed past truth ${T} on ${JSON.stringify(p)}`);
      continue;
    }
    const closeTol = tol ?? CLOSE_TOL, overTol = tol ?? OVER_TOL;
    if (M < T - closeTol) failures.push(`closer ${T - M} than truth ${T} on ${JSON.stringify(p)}`);
    else if (T - M > worstClose) { worstClose = T - M; worstCloseAt = [p, T, M]; }
    if (M > T + overTol) failures.push(`overshoot ${M - T} past truth ${T} on ${JSON.stringify(p)}`);
    else if (M - T > worstOver) { worstOver = M - T; worstOverAt = [p, T, M]; }
  }
  console.log(`${name}: ${n} rays, worst closer ${worstClose.toExponential(2)} `
    + `${JSON.stringify(worstCloseAt)}, worst over ${worstOver.toExponential(2)} `
    + `${JSON.stringify(worstOverAt)}`);
  check(`${name} disagreements within tolerance`, () => {
    assert.equal(failures.length, 0, failures.slice(0, 3).join(' | '));
  });
}

check('thin membrane is a hit, not a step-over', () => {
  const f = compileSceneField(scenes.thin);
  const p = [0, 2.2, 0.6], u = norm([0, 1, 0]);
  const T = truth(f, p, u), M = f.rayHit(p, u);
  console.log(`thin membrane ray: truth ${T}, marched ${M}`);
  assert.ok(Math.abs(T - 0.18) < 1e-3, `membrane face should be at t≈0.18, truth ${T}`);
  assert.ok(Math.abs(M - T) <= CLOSE_TOL, `marched ${M} vs truth ${T}`);
});

check('starting inside reports 0 on both', () => {
  const f = compileSceneField(scenes.doorway);
  assert.equal(f.rayHit([3, 2.2, 0.6], norm([0, 1, 0])), 0);
  const g = compileSceneField(scenes.plain);
  assert.equal(g.rayHit([4, 0, 1], norm([0, 1, 0])), 0);
});

check('the ray that used to outrun the budget now resolves', () => {
  // WAS a known limitation, and it was a real defect rather than a quirk:
  // this ray needs about 300 bound-limited steps to reach a wall at 40.4, the
  // old fixed budget of 256 ran out one step short, and `rayHit` answered
  // Infinity -- "nothing there" -- about a wall it had nearly touched. Found
  // by comparing against the brute-force reference in this file, which is
  // exactly what an independent reference is for.
  const f = compileSceneField(scenes.doorway);
  const T = truth(f, SAIL.p, SAIL.u), M = f.rayHit(SAIL.p, SAIL.u);
  assert.ok(Number.isFinite(M), 'the wall is found at all');
  assert.ok(Math.abs(M - T) < CLOSE_TOL, `marched ${M} vs truth ${T}`);
});

check('A MISS AND A GIVE-UP ARE DIFFERENT ANSWERS', () => {
  // The fix that mattered, and the general lesson. `rayHit` returns one
  // number, so it has one way to say "no hit", and a marcher has two reasons
  // to be there: nothing is there, or it ran out of steps while something
  // was. Collapsing them is the same mistake as a bound claiming to be exact.
  const f = compileSceneField(scenes.doorway);
  // Starved on purpose, on the MARCHED path. A step budget is a property of
  // marching; the analytic path does not iterate and so cannot be starved,
  // which is asserted at the end rather than assumed.
  const starved = f.rayCast(SAIL.p, SAIL.u, { maxSteps: 16, method: 'march' });
  assert.equal(starved.hit, false);
  assert.equal(starved.exhausted, true, 'ran out of steps, and says so');
  assert.equal(starved.steps, 16);
  assert.equal(starved.status, 'indeterminate', 'not a miss: it never found out');
  assert.equal(starved.reason, 'step-budget');
  // Straight up into empty sky: a real miss, and a certain one.
  const sky = f.rayCast([0, -4, 1], [0, 0, 1], { method: 'march' });
  assert.equal(sky.hit, false);
  assert.equal(sky.exhausted, false, 'left the scene, which is not a give-up');
  assert.equal(sky.status, 'miss', 'nothing there, and it knows');
  // And an ordinary hit reports neither.
  const hit = f.rayCast(SAIL.p, SAIL.u, { method: 'march' });
  assert.equal(hit.hit, true);
  assert.equal(hit.exhausted, false);
  assert.ok(hit.steps > 0 && hit.steps < 2048);
  // THE SAME RAY, ANALYTICALLY. This is the ray that started all of this: it
  // needed about 300 bound-limited steps and the old fixed budget of 256 ran
  // out one step short, so `rayHit` called a wall it had nearly touched
  // "nothing there". The analytic path answers it without a budget at all.
  const solved = f.rayCast(SAIL.p, SAIL.u, { maxSteps: 4 });
  assert.equal(solved.hit, true, 'the analytic path has no step budget to run out of');
  assert.equal(solved.exhausted, false);
  assert.ok(Math.abs(solved.t - truth(f, SAIL.p, SAIL.u)) < CLOSE_TOL,
    `analytic ${solved.t} vs truth ${truth(f, SAIL.p, SAIL.u)}`);
});

console.log(`\nmarch-truth: ${passed} checks passed, ${failed} failed\n`);
if (failed) process.exit(1);
