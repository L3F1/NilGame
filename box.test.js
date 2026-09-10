// The box: the primitive an author actually reaches for.
//
// Six clipped planes is the correct EXPRESSION of a box and the wrong FIELD.
// Every intersection is a `max`, `max` under-estimates near a concave seam,
// and a scene holding one bound is a marched scene -- so building the most
// common shape out of planes would make the most common shape the most
// expensive one. This file pins the two claims that justify a primitive:
// the closed form is EXACT, and the six-plane construction agrees with it
// about WHERE the solid is while promising strictly less about the distance.
import assert from 'node:assert/strict';
import { compileSceneField } from './engine/world/scene-field.js';
import { validateScene } from './engine/world/document.js';
import { e3Space, clearance } from './engine/world/collision.js';
import { stepWalker } from './engine/world/walker.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const space = e3Space();

const scene = (entities, id = 'box-room', spawn = [0, -4, 0.3]) => ({
  format: 'nil-scene', version: 1, id,
  units: { name: 'design-unit', playerRadius: 0.25 },
  regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 30 }],
  entities: [{ id: 'start', regionId: 'r', kind: 'spawn', position: spawn }, ...entities],
  connections: [],
});
const box = (id, position, halfExtent, rest = {}) =>
  ({ id, regionId: 'r', kind: 'box', position, halfExtent, ...rest });
const ground = { id: 'ground', regionId: 'r', kind: 'plane', position: [0, 0, 0], up: [0, 0, 1] };

// A deterministic spread of query points that lands INSIDE the box, ON its
// faces, past its EDGES and past its CORNERS -- the four regimes the closed
// form handles differently, and the three where a plane construction differs.
function probes(c, h, reach = 2.5) {
  const pts = [];
  const axis = (i) => [-reach, -h[i] - 0.3, -h[i], -h[i] * 0.4, 0, h[i] * 0.4, h[i], h[i] + 0.3, reach];
  for (const x of axis(0)) for (const y of axis(1)) for (const z of axis(2)) {
    pts.push([c[0] + x, c[1] + y, c[2] + z]);
  }
  return pts;
}

// --- exactness -------------------------------------------------------------

test('THE DISTANCE IS EXACT, not a bound', () => {
  // Checked without reference to the formula. For a query at reported d:
  //   NOT AN OVERESTIMATE -- nothing within d of p is inside the box, swept
  //     over many directions rather than trusting one.
  //   NOT AN UNDERESTIMATE -- stepping a hair PAST d toward the surface does
  //     land inside.
  // Together those say d is the true distance. A `max` construction passes
  // the first and fails the second, and that gap is what "bound" means.
  const c = [0.4, -0.2, 1.1], h = [1.3, 0.7, 0.5];
  const f = compileSceneField(scene([box('crate', c, h)]));
  // The two sides of the bracket. The sweep rules out an overestimate to
  // 1e-9; the step past rules out an underestimate larger than PAST.
  const PAST = 1e-7;
  const dirs = [];
  for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
    const th = a * Math.PI / 4, ph = (b + 0.5) * Math.PI / 8;
    dirs.push([Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]);
  }
  let checked = 0;
  for (const p of probes(c, h)) {
    const d = f.distance(p);
    if (d <= 1e-9) continue;                       // inside; covered below
    for (const u of dirs) {
      const s = d - 1e-9;
      const q = [p[0] + u[0] * s, p[1] + u[1] * s, p[2] + u[2] * s];
      assert.ok(f.distance(q) > -1e-9,
        `overestimate: ${JSON.stringify(p)} claims ${d}, but ${JSON.stringify(q)} is inside`);
    }
    // Stepping PAST the reported distance must not leave us outside. The
    // test is `<= 0` rather than `< 0` on purpose: a probe that sits exactly
    // on the plane of a face has its nearest point ON the boundary, and the
    // inward normal runs along that face -- so it arrives at zero and stays
    // there however far it steps. That is the field being exact, not vague.
    const n = f.normal(p), step = d + PAST;
    const inside = [p[0] - n[0] * step, p[1] - n[1] * step, p[2] - n[2] * step];
    const got = f.distance(inside);
    assert.ok(got <= 1e-12, `underestimate of at least ${PAST}: ${JSON.stringify(p)} `
      + `claims ${d}, but stepping past it still reads ${got}`);
    checked++;
  }
  assert.ok(checked > 400, `only ${checked} outside probes were exercised`);
  console.log(`  exactness: ${checked} outside probes x ${dirs.length} directions, `
    + `d bracketed within [-1e-9, +${PAST}]`);
});

test('inside, the distance is the nearest FACE and it is exact', () => {
  const c = [0, 0, 1], h = [2, 1, 0.5];
  const f = compileSceneField(scene([box('crate', c, h)]));
  assert.equal(f.distance(c), -0.5, 'centre: the nearest face is the thin axis');
  assert.ok(Math.abs(f.distance([1.9, 0, 1]) + 0.1) < 1e-15,
    `the nearest face changes with the query: got ${f.distance([1.9, 0, 1])}`);
  assert.equal(f.distance([2, 0, 1]), 0, 'the face itself reads zero');
  assert.equal(f.distance([2, 1, 1.5]), 0, 'and so does a corner');
});

test('the NORMAL is the gradient, including on an edge and a corner', () => {
  const c = [0, 0, 1], h = [1, 1, 1];
  const f = compileSceneField(scene([box('crate', c, h)]));
  assert.deepEqual(f.normal([0, 0, 2.5]).map((x) => +x.toFixed(12)), [0, 0, 1], 'over a face');
  // Diagonally off a corner the nearest point IS the corner, so the outward
  // direction is the diagonal. A face normal here is a lie a walker slides on.
  const k = 1 / Math.sqrt(3), corner = f.normal([2, 2, 3]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(corner[i] - k) < 1e-12, `corner normal ${corner}`);
  // Off an edge, the diagonal of the two axes that overshoot -- and nothing
  // along the edge itself.
  const edge = f.normal([2, 0, 3]);
  assert.ok(Math.abs(edge[1]) < 1e-12, `should not lean along the edge: ${edge}`);
  assert.ok(Math.abs(Math.hypot(...edge) - 1) < 1e-12);
  // And it agrees with a numeric gradient, which knows nothing of the formula.
  for (const p of [[1.7, 0.3, 1.2], [0.2, 1.6, 0.4], [-1.4, -1.4, 2.2], [0.3, 0.2, 1.1]]) {
    const e = 1e-6;
    const g = [0, 1, 2].map((i) => {
      const a = p.slice(), b = p.slice();
      a[i] += e; b[i] -= e;
      return (f.distance(a) - f.distance(b)) / (2 * e);
    });
    const n = f.normal(p);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(g[i] - n[i]) < 1e-5, `gradient ${g} vs normal ${n} at ${p}`);
    }
  }
});

test('the RAY HIT is exact, checked by bisection on the sign', () => {
  // The slab method is closed form; bisection on the sign of the distance
  // knows nothing about slabs. Two routes to the same number or one is wrong.
  const c = [0, 3, 1], h = [1.5, 0.4, 1];
  const f = compileSceneField(scene([box('crate', c, h)]));
  const unit = (v) => { const L = Math.hypot(...v); return v.map((x) => x / L); };
  const rays = [
    [[0, -2, 1], [0, 1, 0]],
    [[-1.2, -2, 1.6], unit([0.3, 1, -0.2])],
    [[1.4, -2, 0.2], unit([0, 1, 0.15])],
    [[0, -2, 1], unit([0.2, 1, 0])],
  ];
  for (const [p, u] of rays) {
    const t = f.rayHit(p, u);
    assert.ok(Number.isFinite(t), `expected a hit from ${p} along ${u}`);
    const at = (s) => f.distance([p[0] + u[0] * s, p[1] + u[1] * s, p[2] + u[2] * s]);
    let prev = at(0), bracket = null;
    for (let s = 0.002; s <= 12; s += 0.002) {
      const v = at(s);
      if (prev > 0 && v <= 0) { bracket = [s - 0.002, s]; break; }
      prev = v;
    }
    assert.ok(bracket, `no sign change along ${p} / ${u}`);
    let [lo, hi] = bracket;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid) > 0) lo = mid; else hi = mid;
    }
    assert.ok(Math.abs(t - hi) < 1e-9, `slab ${t} vs bisection ${hi}`);
  }
  // Parallel to a pair of faces and outside them: it never arrives, and the
  // slab test has to say so rather than dividing by a zero component.
  assert.equal(f.rayHit([0, -2, 5], [0, 1, 0]), Infinity, 'passing over the top');
  assert.equal(f.rayHit([0, 8, 1], [0, 1, 0]), Infinity, 'aimed away from it');
  // Starting inside reads zero, the convention a ball and a plane already use.
  assert.equal(f.rayHit(c, [0, 1, 0]), 0);
});

// --- what the primitive buys ----------------------------------------------

test('A BOX SCENE STAYS EXACT; the same box as six clips does not', () => {
  // The whole case for the primitive, in one comparison.
  const c = [0, 0, 1], h = [1, 2, 1];
  const prim = compileSceneField(scene([ground, box('crate', c, h)]));
  assert.equal(prim.capabilities.distance, 'exact');
  assert.equal(prim.capabilities.intersection, 'exact');

  // The construction an author would otherwise write: one half-space for the
  // first face, five clips bringing it back to a box.
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const faces = [];
  let first = null;
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
    const n = axes[i].map((x) => x * s);
    const at = [c[0] + n[0] * h[0], c[1] + n[1] * h[1], c[2] + n[2] * h[2]];
    const id = `f${faces.length}`;
    if (first === null) { first = id; faces.push({ id, regionId: 'r', kind: 'plane', position: at, up: n }); } else {
      faces.push({ id, regionId: 'r', kind: 'plane', position: at, up: n, op: 'intersect', target: first });
    }
  }
  const built = compileSceneField(scene([ground, ...faces], 'six-clips'));
  assert.equal(built.capabilities.distance, 'bound', 'six clips can only promise a bound');
  assert.equal(built.intersectCount, 5);

  // They describe the SAME SOLID -- the sign agrees everywhere ...
  for (const p of probes(c, h, 3)) {
    const a = prim.distance(p), b = built.distance(p);
    assert.ok(Math.sign(a) === Math.sign(b) || Math.abs(a - b) < 1e-12,
      `sign split at ${JSON.stringify(p)}: ${a} vs ${b}`);
  }
  // ... and the clipped build never OVER-reports, which is why it is safe.
  // What it does is under-report, and that shortfall is what a marcher pays
  // for one short step at a time. This is the cost, measured.
  let worst = 0, at = null;
  for (const p of probes(c, h, 3)) {
    const gap = prim.distance(p) - built.distance(p);
    assert.ok(gap > -1e-12, `the clipped build OVER-reports at ${JSON.stringify(p)}: ${gap}`);
    if (gap > worst) { worst = gap; at = p; }
  }
  assert.ok(worst > 0.1, `expected a real shortfall from the clipped build, got ${worst}`);
  console.log(`  six clips under-report by up to ${worst.toFixed(3)} at ${JSON.stringify(at)}`);
});

test('a box can be CARVED and can carve', () => {
  const f = compileSceneField(scene([
    ground,
    box('wall', [0, 2, 1.5], [3, 0.25, 1.5]),
    box('door', [0, 2, 0.9], [0.6, 1, 0.9], { op: 'subtract', target: 'wall' }),
  ]));
  assert.equal(f.carveCount, 1);
  assert.equal(f.modBoxCount, 1);
  assert.ok(f.distance([0, 2, 0.5]) > 0, 'the doorway is open');
  assert.ok(f.distance([2, 2, 0.5]) < 0, 'the wall beside it is not');
  assert.ok(f.distance([0, 2, 2.5]) < 0, 'and the lintel is still there');
  // The carved face is the carving box seen from INSIDE, so the jamb points
  // into the opening. Backwards here is a walker sliding the wrong way.
  const n = f.normal([0.55, 2, 0.5]);
  assert.ok(n[0] < -0.99, `the jamb should face -x, got ${n.map((x) => x.toFixed(3))}`);
});

test('a modifier box knows WHICH solid it applies to', () => {
  // Owner indices span three arrays now: ball i, plane 100+i, box 200+i.
  // Getting the band wrong carves the wrong object, which looks like a
  // rendering bug and is a bookkeeping one.
  const f = compileSceneField(scene([
    ground,
    { id: 'orb', regionId: 'r', kind: 'ball', position: [-4, 0, 1], radius: 1 },
    box('crate', [4, 0, 1], [1, 1, 1]),
    box('bite', [4, 0, 2], [0.5, 0.5, 0.5], { op: 'subtract', target: 'crate' }),
  ]));
  assert.deepEqual(f.modBoxOwners(), [200], 'the second added box is 200 + 0... ');
  assert.ok(f.distance([4, 0, 1.9]) > 0, 'the bite came out of the crate');
  assert.ok(f.distance([-4, 0, 1]) < 0, 'and the ball is untouched');
});

test('STAND ON A BOX, WALK OFF IT, LAND ON THE FLOOR', () => {
  const f = compileSceneField(scene([
    ground,
    box('plinth', [0, 0, 0.4], [1.5, 1.5, 0.4]),
  ], 'plinth-room', [0, 0, 1.05]));
  let st = { position: [0, 0, 1.05], velocity: [0, 0, 0], radius: 0.25, grounded: true };
  let stoodHigh = false;
  for (let i = 0; i < 600; i++) {
    const out = stepWalker(f, space, st, 1 / 60, { want: [0, 3, 0] });
    st = { ...st, position: out.position, velocity: out.velocity, grounded: out.grounded };
    assert.ok(clearance(f, st.position, st.radius) >= -1e-3,
      `step ${i} sank into the plinth: clearance ${clearance(f, st.position, st.radius)}`);
    assert.ok(st.position.every(Number.isFinite), `step ${i} went non-finite`);
    if (i < 30 && st.position[2] > 0.9) stoodHigh = true;
  }
  assert.ok(stoodHigh, 'never rested on top of the box');
  assert.ok(st.position[1] > 2, `expected to have walked off, got y=${st.position[1].toFixed(2)}`);
  assert.ok(Math.abs(st.position[2] - 0.25) < 0.05,
    `expected to be on the floor, got z=${st.position[2].toFixed(3)}`);
  assert.equal(st.grounded, true);
});

// --- the schema ------------------------------------------------------------

test('the schema refuses a box that is not one', () => {
  const bad = (mutate, re) => {
    const doc = scene([box('crate', [0, 0, 1], [1, 1, 1])]);
    mutate(doc.entities.find((e) => e.id === 'crate'));
    assert.throws(() => validateScene(doc), re);
  };
  bad((b) => { delete b.halfExtent; }, /halfExtent: expected 3 finite numbers/);
  bad((b) => { b.halfExtent = [1, 1]; }, /halfExtent: expected 3 finite numbers/);
  bad((b) => { b.halfExtent = [1, 0, 1]; }, /halfExtent\[1\]: expected positive/);
  bad((b) => { b.halfExtent = [1, -2, 1]; }, /halfExtent\[1\]: expected positive/);
  bad((b) => { b.radius = 1; }, /radius only applies to balls and anchors/);
  // A half-extent is not an orientation, and the schema will not pretend it
  // is one by quietly accepting a frame it does not use.
  bad((b) => { b.up = [0, 0, 1]; }, /up applies to anchors and planes/);
  const doc = scene([{
    id: 'orb', regionId: 'r', kind: 'ball', position: [0, 0, 1], radius: 1, halfExtent: [1, 1, 1],
  }]);
  assert.throws(() => validateScene(doc), /halfExtent only applies to boxes/);
});

test('a box outgrows the chart by its CORNER, not its width', () => {
  // The farthest point of a box is its corner, so the bound is the
  // circumradius. Checking one half-extent would let a box hang out of the
  // chart diagonally while every axis looked fine on its own.
  // Extent 30. Every half-extent of 18 is well inside it on its own axis,
  // and the corner at 31.2 is not.
  assert.throws(() => validateScene(scene([box('crate', [0, 0, 0], [18, 18, 18])])),
    /bounds straddle chart extent/);
  validateScene(scene([box('crate', [0, 0, 0], [18, 1, 1])]));
});

console.log(`\nbox: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
