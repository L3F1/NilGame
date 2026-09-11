// MUSE-52: independent composed S3 sight audit.
//
// castSphericalRegion and default traceRegionSight (s3Method 'events')
// audited against independent geodesic/sign references on compiled scenes:
// own cos/sin stepping, dot-product predicates, bisection for roots, and
// closed forms on central rays — never the solver's phase/acos answers.
// Claude's fixture/tool files are not imported. No kernel, renderer,
// schema, or old-test changes. Verdicts: docs/qa/muse52-composed-sight.md.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { castSphericalRegion } from './engine/world/s3-ray-cast.js';
import { traceRegionSight } from './engine/world/region-sight.js';
import { compileRegionWorld } from './engine/world/region-world.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// Own kit: dot, ambient distance, geodesic stepping/tangent, bisection.
const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const atOf = (R, p, u) => (t) => {
  const c = Math.cos(t / R), s = Math.sin(t / R);
  return p.map((x, i) => c * x + s * u[i]);
};
function bisect(g, lo, hi, tag) {
  let a = lo, b = hi, fa = g(a);
  assert.ok((fa < 0) !== (g(b) < 0), `${tag}: no sign change`);
  for (let i = 0; i < 70; i++) {
    const m = (a + b) / 2, fm = g(m);
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
// Bisected ball-entry/exit distances from p along u (independent of any
// solver): predicate dot - cos(radius/R), brackets at +/-1e-4.
function ballRoots(R, center, radius, p, u, lo, hi) {
  const level = Math.cos(radius / R), at = atOf(R, p, u);
  const g = (t) => dot(at(t), center) - level;
  return scanRoots(g, lo, hi, 'ball root');
}
// Bisected great-sphere crossings for one face pole (level 0).
function faceRoots(R, pole, p, u, lo, hi) {
  const at = atOf(R, p, u);
  return scanRoots((t) => dot(at(t), pole), lo, hi, 'face root');
}
function scanRoots(g, lo, hi, tag) {
  const found = [];
  let pt = lo, pv = g(lo);
  for (let i = 1; i <= 400; i++) {
    const t = lo + ((hi - lo) * i) / 400, v = g(t);
    if ((pv < 0) !== (v < 0)) found.push(bisect(g, pt, t, tag));
    pt = t; pv = v;
  }
  return found;
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const e3 = (id, extent = 30) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent });
const s3 = (id, R, extent) => ({ id, geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent });
const spawn = (id, regionId, position) => ({ id, regionId, kind: 'spawn', position });
const anchor = (id, regionId, position, forward, radius = 0.9, up = [0, 0, 1]) =>
  ({ id, regionId, kind: 'anchor', position, forward, up, radius });
const link = (id, a, b) => ({ id, kind: 'portal', a, b, velocity: 'preserve-speed', scale: 1 });
const csc = (id, regions, entities, connections = []) =>
  compileRegionWorld({ format: 'nil-scene', version: 2, id, units: UNITS, regions, entities, connections });
const aim = (space, from, to) => space.normalize(from, space.logAt(from, space.decode(to)));
const D = (space, a) => [...space.decode(a)];

check('oblique cast hits at R=.5/8/100 match bisection', () => {
  // Off-axis compiled balls; every root oblique. Cast distance must equal
  // the independently bisected root; normals oppose travel on entry.
  const shapes = [
    { R: 0.5, extent: 0.7, center: [0.35, 0.12, 0.05], radius: 0.06, target: [0.6, 0.12, 0.05], maxD: 0.9 },
    { R: 8, extent: 8, center: [2.5, 0.8, 0.3], radius: 0.6, target: [5, 0.8, 0.3], maxD: 8 },
    { R: 100, extent: 30, center: [2.5, 0.8, 0.3], radius: 0.6, target: [5, 0.8, 0.3], maxD: 8 },
  ];
  for (const [i, s] of shapes.entries()) {
    const w = csc(`ocast${i}`, [s3('orb', s.R, s.extent)], [
      spawn('s', 'orb', [0, 0, 0]),
      { id: 'b', kind: 'ball', regionId: 'orb', position: s.center, radius: s.radius },
    ]);
    const reg = w.regions.get('orb'), space = reg.space;
    const prim = reg.field.primitives[0];
    const p = D(space, [0, 0, 0]), u = aim(space, p, s.target);
    const out = castSphericalRegion(reg, p, u, { maxDistance: s.maxD });
    assert.equal(out.status, 'hit', `R=${s.R}: hit`);
    assert.equal(out.contact, 'surface', `R=${s.R}: surface contact`);
    const roots = ballRoots(s.R, prim.center, s.radius, p, u, 0, s.maxD);
    assert.equal(roots.length, 2, `R=${s.R}: bisected pair`);
    assert.ok(Math.abs(out.distance - roots[0]) < 1e-9, `R=${s.R}: distance ${out.distance} vs ${roots[0]}`);
    assert.equal(out.surfaceOwner, 'b', `R=${s.R}: surface owner`);
    assert.equal(out.additiveOwner, 'b', `R=${s.R}: additive owner`);
    assert.ok(Math.abs(Math.hypot(...out.normal) - 1) < 1e-9, `R=${s.R}: normal unit`);
    assert.ok(dot(out.normal, out.point) < 1e-9, `R=${s.R}: normal tangent`);
    assert.ok(dot(out.normal, out.tangent) < 0, `R=${s.R}: entry normal opposes travel`);
    assert.ok(dist(atOf(s.R, p, u)(out.distance), out.point) < 1e-9, `R=${s.R}: point on ray`);
    console.log(`  R=${s.R}: hit at ${out.distance.toFixed(6)} (bisected ${roots[0].toFixed(6)}), owners b/b`);
  }
});

check('global cutter carves both groups; scoped cutter bites one', () => {
  // A[2.1,2.9] B[4.2,5.8] carve[1.9,5.1] on the +x axis: global scope hits
  // the carve exit at 5.1 with a reversed normal owned by the carve in B;
  // target-a scope never bites B and hits its entry at 4.2 unreversed.
  const ball = (id, x, r, extra = {}) =>
    ({ id, kind: 'ball', regionId: 'orb', position: [x, 0, 0], radius: r, ...extra });
  const base = [ball('a', 2.5, 0.4), ball('b', 5, 0.8)];
  const ray = (reg) => {
    const space = reg.space;
    const p = D(space, [0, 0, 0]);
    return [p, aim(space, p, [7, 0, 0])];
  };
  const wG = csc('cutglobal', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]), ...base, ball('carve', 3.5, 1.6, { op: 'subtract' })]);
  const regG = wG.regions.get('orb');
  const [pG, uG] = ray(regG);
  const g = castSphericalRegion(regG, pG, uG, { maxDistance: 8 });
  assert.equal(g.status, 'hit', 'global: hit');
  assert.ok(Math.abs(g.distance - 5.1) < 1e-9, `global: carve-exit distance (${g.distance})`);
  assert.equal(g.surfaceOwner, 'carve', 'global: surface belongs to the cutter');
  assert.equal(g.additiveOwner, 'b', 'global: solid belongs to B');
  const carveOut = ballRoots(8, regG.field.primitives[2].center, 1.6, pG, uG, 0, 8);
  assert.ok(carveOut.some((t) => Math.abs(t - g.distance) < 1e-9), 'global: distance is a carve root');
  // Ball outward normal at E: interior is X.C >= level, so outward is
  // minus the projected gradient: (E.C)*E - C. (EC != 1, so the EC factor
  // matters — verified numerically against travel/outward directions.)
  const gEC = dot(g.point, regG.field.primitives[2].center);
  const nOut = g.point.map((x, i) => gEC * x - regG.field.primitives[2].center[i]);
  const nOutN = nOut.map((x) => x / Math.hypot(...nOut));
  assert.ok(dist(g.normal, nOutN.map((x) => -x)) < 1e-9, 'global: subtraction normal reversed');
  const wS = csc('cutscoped', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]), ...base, ball('carve', 3.5, 1.6, { op: 'subtract', target: 'a' })]);
  const regS = wS.regions.get('orb');
  const [pS, uS] = ray(regS);
  const sc = castSphericalRegion(regS, pS, uS, { maxDistance: 8 });
  assert.equal(sc.status, 'hit', 'scoped: hit');
  assert.ok(Math.abs(sc.distance - 4.2) < 1e-9, `scoped: B-entry distance (${sc.distance})`);
  assert.equal(sc.surfaceOwner, 'b', 'scoped: surface is B');
  assert.equal(sc.additiveOwner, 'b', 'scoped: solid is B');
  const bC = regS.field.primitives[1].center;
  const bEC = dot(sc.point, bC);
  const bOut = sc.point.map((x, i) => bEC * x - bC[i]);
  const bOutN = bOut.map((x) => x / Math.hypot(...bOut));
  assert.ok(dist(sc.normal, bOutN) < 1e-9, 'scoped: entry normal unreversed');
  assert.ok(dot(sc.normal, sc.tangent) < 0, 'scoped: entry normal opposes travel');
  console.log(`  global hit ${g.distance.toFixed(4)} (carve/b reversed); scoped hit ${sc.distance.toFixed(4)} (b/b)`);
});

check('subtracted cell: partial faces, reversed normal, owning solids', () => {
  // Cell [2.5,3.5]x... with a carve covering the f0 entry: the central ray
  // enters through carved space (no hit), exits the carve inside the cell
  // (HIT on the carve boundary, reversed, owned carve-in-cell). A low ray
  // missing the carve hits the cell wall directly, unreversed.
  const w = csc('carvecell', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]),
    { id: 'box', kind: 'geodesic-cell', regionId: 'orb', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] },
    { id: 'bite', kind: 'ball', regionId: 'orb', position: [2.7, 0.25, 0], radius: 0.4, op: 'subtract', target: 'box' },
  ]);
  const reg = w.regions.get('orb'), space = reg.space;
  const bite = reg.field.primitives.find((x) => x.entity.id === 'bite');
  const p = D(space, [0, 0, 0]), u = aim(space, p, [5, 0, 0]);
  const q = castSphericalRegion(reg, p, u, { maxDistance: 8 });
  assert.equal(q.status, 'hit', 'carved entry still hits at carve exit');
  assert.equal(q.surfaceOwner, 'bite', 'surface belongs to the cutter');
  assert.equal(q.additiveOwner, 'box', 'solid belongs to the cell');
  const exits = ballRoots(8, bite.center, 0.4, p, u, 0, 8);
  assert.ok(exits.some((t) => Math.abs(t - q.distance) < 1e-9), `hit is a carve root (${q.distance})`);
  const qEC = dot(q.point, bite.center);
  const nOut = q.point.map((x, i) => qEC * x - bite.center[i]);
  const nOutN = nOut.map((x) => x / Math.hypot(...nOut));
  assert.ok(dist(q.normal, nOutN.map((x) => -x)) < 1e-9, 'carve-exit normal reversed');
  const p2 = D(space, [0, -0.35, 0]), u2 = aim(space, p2, [5, -0.35, 0]);
  const q2 = castSphericalRegion(reg, p2, u2, { maxDistance: 8 });
  assert.equal(q2.status, 'hit', 'uncarved entry hits the wall');
  assert.equal(q2.surfaceOwner, 'box', 'wall surface');
  assert.equal(q2.additiveOwner, 'box', 'wall solid');
  assert.ok(dot(q2.normal, q2.tangent) < 0, 'wall entry opposes travel');
  const wallRoots = faceRoots(8, reg.field.primitives[0].planes[q2.face], p2, u2, 0, 8);
  assert.ok(wallRoots.some((t) => Math.abs(t - q2.distance) < 1e-9), `wall hit is a face root (${q2.distance})`);
  console.log(`  carved entry hits carve-exit ${q.distance.toFixed(4)} (bite/box reversed); low ray hits wall ${q2.distance.toFixed(4)} (box/box)`);
});

check('decimal plane poles keep the zero set; screens still refuse', () => {
  // The MUSE-51 fix: a compile-legal near-unit pole (off-unit 5e-9, inside
  // the 1e-8 compile bar) must root exactly where the exact pole roots, and
  // the stored pole must keep its scale (nothing renormalized). Ball-center
  // and ray-input screens keep refusing invalid inputs.
  const upE = [0.15, 0, Math.sqrt(1 - 0.0225)], upS = upE.map((x) => x * (1 + 5e-9));
  const mkplane = (id, up) => csc(id, [s3('orb', 8, 8)], [
    spawn('s', 'orb', [4, 0, 0]),
    { id: 'pl', kind: 'plane', regionId: 'orb', position: [2, 0, 0], up },
  ]);
  const wE = mkplane('planexact', upE), wS = mkplane('planscaled', upS);
  const outs = [];
  for (const [nm, w] of [['exact', wE], ['scaled', wS]]) {
    const reg = w.regions.get('orb'), space = reg.space;
    const pole = reg.field.primitives[0].planes[0];
    const dev = Math.abs(Math.hypot(...pole) - 1);
    const p = D(space, [4, 0, 1]), u = aim(space, p, [-2, 0.5, 0]);
    outs.push([nm, dev, castSphericalRegion(reg, p, u, { maxDistance: 10 })]);
  }
  assert.ok(outs[0][1] < 1e-12, 'exact pole unit');
  assert.ok(outs[1][1] > 1e-12 && outs[1][1] < 1e-7, `scaled pole keeps scale (${outs[1][1].toExponential(1)})`);
  assert.equal(outs[0][2].status, 'hit', 'exact plane hits');
  assert.equal(outs[1][2].status, 'hit', 'scaled plane hits');
  assert.ok(Math.abs(outs[0][2].distance - outs[1][2].distance) < 1e-9,
    `zero set unmoved (${outs[0][2].distance} vs ${outs[1][2].distance})`);
  assert.ok(dist(outs[0][2].normal, outs[1][2].normal) < 1e-9, 'normals agree');
  // Ball centers compare against a nonzero cosine level: drift still refuses.
  const reg = wE.regions.get('orb'), space = reg.space;
  const good = { entity: { id: 'b', kind: 'ball', radius: 0.5 }, center: D(space, [2.5, 0, 0]) };
  const drifted = { entity: good.entity, center: good.center.map((x, i) => x + (i === 3 ? 1e-9 : 0)) };
  const gp = { primitives: [good], groups: [{ base: good, modifiers: [] }] };
  const dp = { primitives: [drifted], groups: [{ base: drifted, modifiers: [] }] };
  const p = D(space, [0, 0, 0]), u = aim(space, p, [5, 0, 0]);
  assert.equal(castSphericalRegion({ space, field: gp }, p, u, { maxDistance: 8 }).status, 'hit', 'clean center hits');
  assert.equal(castSphericalRegion({ space, field: dp }, p, u, { maxDistance: 8 }).reason,
    'input-roundoff', 'drifted center refuses');
  assert.equal(castSphericalRegion(reg, [1e-12, 0, 0, 1], [1, 0, 0, 1e-9], { maxDistance: 8 }).reason,
    'input-roundoff', 'drifted ray refuses');
  console.log(`  scaled pole dev ${outs[1][1].toExponential(1)}, distances ${outs[0][2].distance.toFixed(6)} == ${outs[1][2].distance.toFixed(6)}; drift screens refuse`);
});

check('zero casts classify origin only', () => {
  // maxDistance 0: empty origin is a miss, occupied is an inside hit at 0
  // with no normal, near-boundary is ambiguous-origin. No travel happens.
  const w = csc('zerocast', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]),
    { id: 'bl', kind: 'ball', regionId: 'orb', position: [2, 0, 0], radius: 0.5 },
  ]);
  const reg = w.regions.get('orb'), space = reg.space;
  const empty = castSphericalRegion(reg, D(space, [0, 5, 0]), [...space.frame(D(space, [0, 5, 0]))[0]], { maxDistance: 0 });
  assert.equal(empty.status, 'miss', 'empty origin misses');
  assert.equal(empty.work, 1, 'empty origin classifies the one surface once');
  const inside = castSphericalRegion(reg, D(space, [2, 0, 0]), [...space.frame(D(space, [2, 0, 0]))[0]], { maxDistance: 0 });
  assert.equal(inside.status, 'hit', 'occupied origin hits');
  assert.equal(inside.contact, 'inside', 'inside contact');
  assert.equal(inside.distance, 0, 'zero distance');
  assert.equal(inside.normal, null, 'no invented normal');
  assert.deepEqual([...inside.additiveOwners], ['bl'], 'inside owners');
  const pG = [Math.sin(1.5 / 8 - 1e-12), 0, 0, Math.cos(1.5 / 8 - 1e-12)];
  const uG = [Math.cos(1.5 / 8 - 1e-12), 0, 0, -Math.sin(1.5 / 8 - 1e-12)];
  const near = castSphericalRegion(reg, pG, [...uG], { maxDistance: 0 });
  assert.equal(near.reason, 'ambiguous-origin', 'near-boundary origin refuses');
  console.log('  empty miss (work 1), inside hit at 0 with owners [bl], guard-close ambiguous-origin');
});

check('E3-S3-E3 route: totals, local distance, obstacle beyond exit', () => {
  // Rock just past the orb entry: total route distance must equal the gate
  // leg plus the local S3 hit, and the local hit must equal the bisected
  // rock entry from the crossing exit. Zero remaining at the exit misses
  // exactly at maxDistance with the crossing kept.
  const w = csc('route', [e3('a', 12), s3('orb', 8, 8), e3('b', 12)], [
    spawn('sa', 'a', [0, 0, 0]), spawn('so', 'orb', [0, 3, 0]), spawn('sb', 'b', [10, 0, 0]),
    anchor('ga', 'a', [3, 0, 0], [-1, 0, 0], 1.5),
    anchor('go', 'orb', [0, 0, -2], [0, 0, 1], 1.5, [0, 1, 0]),
    anchor('ho', 'orb', [0, 0, 2], [0, 0, -1], 1.5, [0, 1, 0]),
    anchor('hb', 'b', [10, 0, 0], [1, 0, 0], 1.5),
    { id: 'rock', kind: 'ball', regionId: 'orb', position: [0, 0, -1.2], radius: 0.4 },
  ], [link('in', 'ga', 'go'), link('out', 'ho', 'hb')]);
  const ray = { regionId: 'a', position: [0, 0, 0], direction: [1, 0, 0] };
  const r = traceRegionSight(w, ray, { maxDistance: 40 });
  assert.equal(r.status, 'hit', 'route hits the rock');
  assert.equal(r.crossings.length, 1, 'one crossing');
  assert.ok(Math.abs(r.crossings[0].distance - 3) < 1e-9, 'gate leg exactly 3');
  assert.equal(r.segments.length, 2, 'two legs');
  assert.ok(Math.abs(r.segments[0].distance - 3) < 1e-9, 'E3 leg exactly 3');
  const local = r.query.distance;
  assert.ok(Math.abs(r.segments[1].distance - local) < 1e-12, 'S3 leg is the local hit');
  assert.ok(Math.abs(r.distance - (3 + local)) < 1e-9, `total ${r.distance} is gate + local`);
  assert.equal(r.query.t, local, 'local t and distance agree');
  assert.equal(r.query.surfaceOwner, 'rock', 'surface owner');
  assert.equal(r.query.owner, 'rock', 'route owner is the additive owner');
  // Independent local root from the crossing exit along the carried ray.
  const orb = w.regions.get('orb');
  const exit = r.crossings[0].exit;
  const outDir = orb.space.normalize(exit, orb.space.logAt(exit, r.query.point));
  const rock = orb.field.primitives.find((x) => x.entity.id === 'rock');
  const roots = ballRoots(8, rock.center, 0.4, exit, outDir, 0, local + 1e-6);
  assert.ok(roots.some((t) => Math.abs(t - local) < 1e-9), `local hit is a rock root (${local})`);
  assert.equal(r.work, 11, `exact route work (${r.work})`);
  // Zero remaining range at the exit: crossing kept, miss exactly at maxD.
  const z = traceRegionSight(w, ray, { maxDistance: 3 });
  assert.equal(z.status, 'miss', 'zero-remaining exit misses');
  assert.equal(z.crossings.length, 1, 'crossing kept');
  assert.ok(Math.abs(z.distance - 3) < 1e-9, 'miss exactly at maxDistance');
  console.log(`  total ${r.distance.toFixed(4)} = 3 + local ${local.toFixed(4)} (bisected); work 11; zero-remaining exit misses at 3`);
});

check('maxWork caps: zero, upfront, applying; exact single-region work', () => {
  // Allowance boundaries on the wk ball (entry 2.5, exit 3.5): 0/1 refuse
  // upfront, 2 refuses while applying the first event, 4 hits. The sight
  // coordinator charges the cast back exactly: 1 + query.work, no portals.
  const w = csc('workcap', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [5, 5, 0]),
    { id: 'ball', kind: 'ball', regionId: 'orb', position: [3, 0, 0], radius: 0.5 },
  ]);
  const reg = w.regions.get('orb'), space = reg.space;
  const p = D(space, [0, 0, 0]), u = aim(space, p, [5, 0, 0]);
  assert.equal(castSphericalRegion(reg, p, u, { maxDistance: 8, maxWork: 0 }).reason, 'work-budget', 'zero allowance');
  assert.equal(castSphericalRegion(reg, p, u, { maxDistance: 8, maxWork: 1 }).reason, 'work-budget', 'upfront refusal');
  assert.equal(castSphericalRegion(reg, p, u, { maxDistance: 8, maxWork: 2 }).reason, 'work-budget', 'applying refusal');
  const ok = castSphericalRegion(reg, p, u, { maxDistance: 8, maxWork: 4 });
  assert.equal(ok.status, 'hit', 'sufficient allowance hits');
  const t = traceRegionSight(w, { regionId: 'orb', position: p, direction: [...u] }, { maxDistance: 8 });
  assert.equal(t.status, 'hit', 'sight hits');
  assert.equal(t.query.work, ok.work, 'same cast work through the coordinator');
  assert.equal(t.work, 1 + ok.work, `coordinator charges exactly (${t.work} = 1 + ${ok.work})`);
  assert.equal(traceRegionSight(w, { regionId: 'orb', position: p, direction: [...u] }, { maxDistance: 8, maxWork: 0 }).reason,
    'work-budget', 'sight zero allowance');
  console.log(`  cast refuses at 0/1/2, hits at 4; sight work ${t.work} = 1 + cast ${ok.work}; sight zero refuses`);
});

check('distant coincidence refuses an earlier valid hit: known limit', () => {
  // Ball hit at ~0.6 is valid on its own; adding a cell whose faces coincide
  // at 2.516 makes the merged guard screen refuse the WHOLE cast, including
  // the earlier hit. Recorded as a completeness limit, not a repair demand.
  const mkball = (id, extra) => csc(id, [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]),
    { id: 'bl', kind: 'ball', regionId: 'orb', position: [0.9, 0.09, 0], radius: 0.3 },
    ...extra,
  ]);
  const wB = mkball('coincell0', []);
  const regB = wB.regions.get('orb'), spB = regB.space;
  const S = D(spB, [0, 0.1, 0]);
  const [T0, T1] = [spB.frame(S)[0], spB.frame(S)[1]];
  const dirOf = (th) => T0.map((x, i) => x * Math.cos(th) + T1[i] * Math.sin(th));
  const thStar = 0.12312498122384068;
  const alone = castSphericalRegion(regB, S, dirOf(thStar), { maxDistance: 8 });
  assert.equal(alone.status, 'hit', 'ball alone hits');
  assert.ok(Math.abs(alone.distance - 0.617) < 0.01, `ball hit early (${alone.distance})`);
  const wC = mkball('coincell', [
    { id: 'c', kind: 'geodesic-cell', regionId: 'orb', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] }]);
  const regC = wC.regions.get('orb');
  const both = castSphericalRegion(regC, S, dirOf(thStar), { maxDistance: 8 });
  assert.equal(both.status, 'unresolved', 'coincidence refuses');
  assert.equal(both.reason, 'primitive-events', 'cast wraps the primitive refusal');
  assert.ok(/coincident-events/.test(both.detail), `detail names it (${both.detail})`);
  console.log(`  ball-only hit at ${alone.distance.toFixed(4)}; with coincident faces: unresolved/primitive-events over coincident-events (known limit)`);
});

check('cutter-face origin refuses without a hit; multi-owner origin names both', () => {
  // A ray starting exactly on a subtractor face that bounds nothing refuses
  // the whole cast from a point clear of solid. An origin inside two balls
  // hits at 0 naming both, with no normal and a null single owner.
  const w = csc('cutface', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [0, 5, 0]),
    { id: 'base', kind: 'ball', regionId: 'orb', position: [5, 0, 0], radius: 0.5 },
    { id: 'cut', kind: 'ball', regionId: 'orb', position: [-3, 0, 0], radius: 0.5, op: 'subtract', target: 'base' },
  ]);
  const reg = w.regions.get('orb'), space = reg.space;
  const startOn = [-Math.sin(2.5 / 8), 0, 0, Math.cos(2.5 / 8)];
  const dirOn = space.normalize(startOn, space.logAt(startOn, space.decode([-5, 0, 0])));
  const q = castSphericalRegion(reg, startOn, [...dirOn], { maxDistance: 8 });
  assert.equal(q.status, 'unresolved', 'cutter-face origin refuses, never a confident miss');
  console.log(`  cutter-face origin: ${q.status}/${q.reason}`);
  const w3 = csc('twoowners', [s3('orb', 8, 8)], [
    spawn('s', 'orb', [5, 5, 0]),
    { id: 'ba', kind: 'ball', regionId: 'orb', position: [0.3, 0, 0], radius: 0.6 },
    { id: 'bb', kind: 'ball', regionId: 'orb', position: [-0.3, 0, 0], radius: 0.6 },
  ]);
  const reg3 = w3.regions.get('orb'), sp3 = reg3.space;
  const p3 = D(sp3, [0, 0, 0]);
  const q3 = castSphericalRegion(reg3, p3, [...sp3.frame(p3)[0]], { maxDistance: 8 });
  assert.equal(q3.status, 'hit', 'inside origin hits');
  assert.equal(q3.contact, 'inside', 'inside contact');
  assert.equal(q3.distance, 0, 'zero distance');
  assert.equal(q3.normal, null, 'no invented normal');
  assert.deepEqual([...q3.additiveOwners], ['ba', 'bb'], 'both owners named');
  assert.equal(q3.additiveOwner, null, 'no unique owner');
  console.log(`  inside-two-balls origin: hit/inside at 0, owners [ba,bb], owner null`);
});

console.log(`\nconnected-s3-query-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
