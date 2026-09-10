// MUSE-28: walking on a bound.
//
// The solver was built against an exact distance and now runs on a lower
// bound. Conservative advancement should be safe by construction; this file
// replaces "should be" with walked evidence: deterministic scenes (hand
// layouts plus a seeded generator), several hundred steps per walk, and
// three assertions on every step -- clearance never below -1e-3, no stall
// run longer than STALL_RUN (calibrated below), position always finite.
// Stall fraction is reported separately for exact and bound pools at
// matched solid counts: shorter steps should stall more, and now we know
// how much.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';
import { e3Space, clearance } from './engine/world/collision.js';
import { stepWalker } from './engine/world/walker.js';

// N: at 60 Hz, 60 steps is a full second of reported stall. Every walk here
// is built to keep moving (tangential headings, no head-on traps), and the
// exact-field calibration never exceeds a run of 2 -- so a run past 60
// means the solver is stuck, not the walk. Genuine traps would stall any
// solver and are excluded by walk design, not by N.
const STALL_RUN = 60, STEPS = 400, DT = 1 / 60, RADIUS = 0.25;

const space = e3Space();
const doc = (id, entities) => ({
  format: 'nil-scene', version: 1, id,
  units: { name: 'design-unit', playerRadius: RADIUS },
  regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
  entities, connections: [],
});
const ground = { id: 'ground', regionId: 'r', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] };
const spawnAt = (id, p) => ({ id, regionId: 'r', kind: 'spawn', position: p });
const ball = (id, p, r, extra = {}) => ({ id, regionId: 'r', kind: 'ball', position: p, radius: r, ...extra });
const wallY = (id, y, up) => ({ id, regionId: 'r', kind: 'plane', position: [0, y, 0], up });

const scenes = {
  'exact/boulder': doc('exact-boulder', [ground, ball('rock', [3, 2, 1], 1), spawnAt('s', [0, -4, 0.3])]),
  'exact/wall': doc('exact-wall', [ground, wallY('wall', 2, [0, -1, 0]),
    ball('rock', [4, 4, 1], 1), spawnAt('s', [0, -4, 0.3])]),
  'exact/corner': doc('exact-corner', [ground,
    { id: 'w1', regionId: 'r', kind: 'plane', position: [-2, 0, 0], up: [1, 0, 0] },
    { id: 'w2', regionId: 'r', kind: 'plane', position: [0, 3, 0], up: [0, -1, 0] },
    spawnAt('s', [1, -3, 0.3])]),
  'bound/doorway': doc('bound-doorway', [ground, wallY('wall', 2, [0, -1, 0]), spawnAt('s', [0, -4, 0.3]),
    { id: 'back', regionId: 'r', kind: 'plane', op: 'subtract', target: 'wall', position: [0, 2.4, 0], up: [0, -1, 0] },
    ball('door', [0, 2.2, 0.45], 0.9, { op: 'subtract', target: 'wall' })]),
  'bound/clipped-doorway': doc('bound-clipped-doorway', [ground, wallY('wall', 2, [0, -1, 0]),
    spawnAt('s', [0, -4, 0.3]),
    { id: 'face', regionId: 'r', kind: 'plane', op: 'intersect', target: 'wall', position: [0, 2.4, 0], up: [0, 1, 0] },
    ball('door', [0, 2.2, 0.45], 0.9, { op: 'subtract', target: 'wall' })]),
  'bound/global-carve': doc('bound-global-carve', [ground, wallY('wall', 2, [0, -1, 0]),
    spawnAt('s', [0, -4, 0.3]),
    ball('gouge', [0, 2.2, 0.6], 0.9, { op: 'subtract', target: null })]),
  'bound/thin-membrane': doc('bound-thin-membrane', [ground, wallY('wall', 2, [0, -1, 0]),
    spawnAt('s', [0, -4, 0.3]),
    { id: 'back', regionId: 'r', kind: 'plane', op: 'subtract', target: 'wall', position: [0, 2.4, 0], up: [0, -1, 0] },
    ball('shave', [0, 2.1, 0.3], 0.28, { op: 'subtract', target: 'wall' })]),
  'bound/gap': doc('bound-gap', [ground, ball('bl', [-1.15, 2, 1], 1), ball('br', [1.15, 2, 1], 1),
    spawnAt('s', [0, -4, 0.3]),
    ball('nick', [-1.15, 2, 1], 0.4, { op: 'subtract', target: 'bl' })]),
  'bound/carved-corner': doc('bound-carved-corner', [ground,
    { id: 'w1', regionId: 'r', kind: 'plane', position: [-2, 0, 0], up: [1, 0, 0] },
    { id: 'w2', regionId: 'r', kind: 'plane', position: [0, 3, 0], up: [0, -1, 0] },
    spawnAt('s', [1, -3, 0.3]),
    ball('bite', [-2, 3, 0.5], 1.2, { op: 'subtract', target: null })]),
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded generator: 1-3 balls plus 0-2 modifiers of random kind and scope.
// Balls are convex, so no walk can wedge by construction; seeds are fixed
// and printed in every walk label, and a sink prints its scene as JSON.
function seededScene(seed) {
  const rng = mulberry32(seed);
  const entities = [ground, spawnAt('s', [0, -5, 0.3])];
  const nBalls = 1 + Math.floor(rng() * 3);
  const ids = [];
  for (let i = 0; i < nBalls; i++) {
    const id = `g${i}`;
    ids.push(id);
    entities.push(ball(id, [-4 + rng() * 8, -2 + rng() * 5, 0.8 + rng() * 0.6], 0.7 + rng() * 0.5));
  }
  const nMods = Math.floor(rng() * 3);
  for (let j = 0; j < nMods; j++) {
    const target = rng() < 0.4 ? null : ids[Math.floor(rng() * ids.length)];
    entities.push(ball(`m${j}`, [-4 + rng() * 8, -2 + rng() * 5, 0.5 + rng() * 1],
      0.5 + rng() * 0.4, { op: rng() < 0.6 ? 'subtract' : 'intersect', target }));
  }
  return doc(`seeded-${seed}`, entities);
}
for (const seed of [11, 22, 33, 44]) scenes[`seeded/${seed}`] = seededScene(seed);

const openWalks = [
  { start: [0, -4, 0.25], want: [0, 2.5, 0] },
  { start: [-4, -4, 0.25], want: [2.5, 1.2, 0] },
  { start: [0, -4, 0.25], want: [2.5, 0.6, 0] },
  { start: [3, -4, 0.25], want: [-1.5, 2.0, 0] },
];
const cornerWalks = [
  { start: [1, -3, 0.25], want: [0.5, 2.5, 0] },
  { start: [1, -3, 0.25], want: [-2.5, 1.0, 0] },
  { start: [1, -3, 0.25], want: [-1.6, 3.0, 0] },
  { start: [1, -3, 0.25], want: [-4.8, 9.0, 0] },
];
const walksFor = (name) => (name.endsWith('corner') ? cornerWalks : openWalks);

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const pool = { exact: { steps: 0, stalls: 0, maxRun: 0 }, bound: { steps: 0, stalls: 0, maxRun: 0 } };
let totalSteps = 0;

for (const [name, d] of Object.entries(scenes)) {
  const f = compileSceneField(d);
  const kind = f.capabilities.distance === 'bound' ? 'bound' : 'exact';
  check(`walk ${name} (${kind})`, () => {
    for (const [wi, w] of walksFor(name).entries()) {
      let s = { position: w.start.slice(), velocity: [0, 0, 0], radius: RADIUS, grounded: true };
      let run = 0;
      for (let i = 0; i < STEPS; i++) {
        const out = stepWalker(f, space, s, DT, { want: w.want });
        s = { ...s, position: out.position, velocity: out.velocity, grounded: out.grounded };
        totalSteps++;
        pool[kind].steps++;
        const c = clearance(f, s.position, s.radius);
        if (c < -1e-3) {
          console.error(`SINK seed-walk ${name}#${wi} step ${i}: clearance ${c}\nscene: ${JSON.stringify(d)}`);
          process.exit(1);
        }
        assert.ok(s.position.every(Number.isFinite), `${name}#${wi} step ${i} non-finite`);
        if (out.stalled) {
          run++;
          pool[kind].stalls++;
          assert.ok(run <= STALL_RUN, `${name}#${wi} stalled ${run} steps in a row`);
        } else run = 0;
        if (run > pool[kind].maxRun) pool[kind].maxRun = run;
      }
    }
  });
}

for (const [kind, p] of Object.entries(pool)) {
  console.log(`${kind} pool: ${p.steps} steps, stall fraction ${(p.stalls / p.steps).toFixed(4)}, max run ${p.maxRun}`);
}
console.log(`\nwalk-bound: ${Object.keys(scenes).length} scenes, ${totalSteps} steps, `
  + `${passed} walk checks passed, ${failed} failed\n`);
if (failed) process.exit(1);
