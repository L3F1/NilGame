// MUSE-51: independent S3 boundary-event audit.
//
// sphericalBoundaryEvents is audited with INDEPENDENT great-circle
// geometry and bisection on surface predicates (dot products only), never
// a second phase +/- acos root solve. Fixture setup uses compiled worlds
// and production logAt/normalize as aiming (closed-form geodesics, not the
// solver under audit); every root LOCATION, transition, normal and order
// is verified against bisection. No scene-hit claim is ever made: complete
// means a screened candidate list, and inactive face events are expected.
// Verdicts: docs/qa/muse51-s3-events.md.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { sphericalBoundaryEvents } from './engine/geometry/s3-ray-events.js';
import { compileRegionWorld } from './engine/world/region-world.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// Own arithmetic: dot, ambient distance, geodesic stepping and its tangent.
// The stepping is the geodesic DEFINITION (setup); root-finding is always
// bisection below, never acos/atan2.
const dot = (a, b) => a.reduce((t, x, i) => t + x * b[i], 0);
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const atOf = (R, p, u) => (t) => {
  const c = Math.cos(t / R), s = Math.sin(t / R);
  return p.map((x, i) => c * x + s * u[i]);
};
const tanOf = (R, p, u) => (t) => {
  const c = Math.cos(t / R), s = Math.sin(t / R);
  return u.map((x, i) => c * x - s * p[i]);
};
// Predicate closures from compiled primitive DATA (center/poles/radius are
// fixture facts, not solver output). Ball: dot - cos(r/R); faces: raw dot.
const predFor = (R, prim, face) => {
  if (prim.entity.kind === 'ball') {
    const level = Math.cos(prim.entity.radius / R);
    return (q) => dot(q, prim.center) - level;
  };
  return (q) => dot(q, prim.planes[face]);
};
// Bisection root of g in [lo,hi]; asserts a sign change brackets it.
function bisect(g, lo, hi, tag) {
  let a = lo, b = hi, fa = g(a);
  const fb = g(b);
  assert.ok(fa === 0 || fb === 0 || (fa < 0) !== (fb < 0),
    `${tag}: no sign change in [${lo},${hi}] (${fa},${fb})`);
  for (let i = 0; i < 70; i++) {
    const m = (a + b) / 2, fm = g(m);
    if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}
// Full per-event verification for a complete result. Returns event count.
function verifyComplete(R, prim, p, u, maxD, out, tag) {
  assert.equal(out.status, 'complete', `${tag}: expected complete (${out.status}/${out.reason})`);
  assert.equal(out.hit, undefined, `${tag}: event layer must not claim hits`);
  const at = atOf(R, p, u), tan = tanOf(R, p, u);
  let prev = -Infinity, maxResid = 0, maxGuard = 0, minInc = Infinity;
  out.events.forEach((e, i) => {
    assert.equal(e.primitiveId, prim.entity.id, `${tag} event ${i}: owner`);
    if (prim.entity.kind === 'ball') assert.equal(e.face, null, `${tag} event ${i}: ball face`);
    else assert.ok(e.face >= 0 && e.face < 6, `${tag} event ${i}: face range`);
    assert.ok(e.distance >= 0 && e.distance <= maxD, `${tag} event ${i}: range`);
    assert.ok(e.distance > prev, `${tag} event ${i}: order`);
    assert.ok(e.guard > 0 && e.guard < 1e-3, `${tag} event ${i}: guard sanity (${e.guard})`);
    prev = e.distance; maxGuard = Math.max(maxGuard, e.guard);
    // Point/direction consistency with the ray (record matches the ray).
    assert.ok(dist(at(e.distance), e.point) < 1e-9, `${tag} event ${i}: point off ray`);
    assert.ok(dist(tan(e.distance), e.direction) < 1e-9, `${tag} event ${i}: direction off ray`);
    // Residual of the INDEPENDENT predicate at the reported point; the
    // bisection form composes it with ray stepping (distance -> value).
    const gp = predFor(R, prim, e.face);
    const g = (t) => gp(at(t));
    const resid = Math.abs(gp(e.point));
    assert.ok(resid < 1e-9, `${tag} event ${i}: residual ${resid}`);
    maxResid = Math.max(maxResid, resid);
    // Bisection root near the reported distance agrees within guard.
    const w = Math.max(e.guard * 10, 1e-6);
    const m = bisect(g, Math.max(0, e.distance - w), Math.min(maxD, e.distance + w), `${tag} event ${i}`);
    assert.ok(Math.abs(m - e.distance) <= e.guard + 1e-9, `${tag} event ${i}: bisection ${m} vs ${e.distance}`);
    // Transition from bracket slope. Balls: interior is dot >= level, so
    // rising means entering. Planes/cell faces use the opposite inequality.
    const rising = g(Math.min(maxD, e.distance + w)) > g(Math.max(0, e.distance - w));
    const want = prim.entity.kind === 'ball'
      ? (rising ? 'enter' : 'exit')
      : (rising ? 'exit' : 'enter');
    assert.equal(e.transition, want, `${tag} event ${i}: transition (rising=${rising})`);
    // Unit/tangent normal; incidence sign matches the transition.
    assert.ok(Math.abs(Math.hypot(...e.normal) - 1) < 1e-9, `${tag} event ${i}: normal unit`);
    assert.ok(Math.abs(dot(e.normal, e.point)) < 1e-9, `${tag} event ${i}: normal tangent`);
    const nd = dot(e.normal, e.direction);
    assert.ok((e.transition === 'exit') === (nd > 0), `${tag} event ${i}: incidence sign (${nd})`);
    minInc = Math.min(minInc, Math.abs(nd));
  });
  // Ball outwardness: paired enter/exit share an interior midpoint the
  // normals point away from; lone events are sided directly.
  if (prim.entity.kind === 'ball' && out.events.length === 2) {
    const [a, b] = out.events;
    assert.equal(a.transition, 'enter', `${tag}: pair order`);
    assert.equal(b.transition, 'exit', `${tag}: pair order`);
    const M = at((a.distance + b.distance) / 2);
    assert.ok(dot(a.normal, M.map((x, i) => x - a.point[i])) < 0, `${tag}: enter normal faces out`);
    assert.ok(dot(b.normal, M.map((x, i) => x - b.point[i])) < 0, `${tag}: exit normal faces out`);
  }
  if (prim.entity.kind === 'ball' && out.events.length === 1) {
    const [e] = out.events;
    const g = (t) => predFor(R, prim, null)(at(t));
    const side = e.transition === 'exit'
      ? g(Math.max(0, e.distance - Math.max(e.guard * 10, 1e-6)))
      : g(Math.min(maxD, e.distance + Math.max(e.guard * 10, 1e-6)));
    assert.ok(side > 0, `${tag}: lone ${e.transition} has no interior on its side (${side})`);
  }
  if (prim.entity.kind !== 'ball') {
    for (const [i, e] of out.events.entries()) {
      const pole = prim.planes[e.face];
      assert.ok(dot(e.normal, pole) > 0, `${tag} event ${i}: normal points outward (${dot(e.normal, pole)})`);
    }
  }
  console.log(`  ${tag}: ${out.events.length} events, max resid=${maxResid.toExponential(1)} max guard=${maxGuard.toExponential(1)} min |n.d|=${out.events.length ? minInc.toExponential(1) : 'n/a'}`);
  return out.events.length;
}

const UNITS = { name: 'design-unit', playerRadius: 0.25 };
const csc = (id, R, extent, entities, spawn = [0, 0, 0]) => compileRegionWorld({
  format: 'nil-scene', version: 2, id, units: UNITS,
  regions: [{ id: 'r', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent }],
  entities: [{ id: 's', kind: 'spawn', regionId: 'r', position: spawn }, ...entities], connections: [],
});
const aim = (space, from, to) => space.normalize(from, space.logAt(from, space.decode(to)));

check('compiled oblique balls at R=.5/8/100 verify against bisection', () => {
  // Same author-shape fixture at three radii (normal coordinates scale
  // exactly); R=.5 uses an in-chart shrunken copy. Off-axis centers make
  // every root oblique; bisection fixes each distance independently.
  const shapes = [
    { R: 0.5, extent: 0.7, center: [0.35, 0.12, 0.05], radius: 0.06, target: [0.6, 0.12, 0.05], maxD: 0.9 },
    { R: 8, extent: 8, center: [2.5, 0.8, 0.3], radius: 0.6, target: [5, 0.8, 0.3], maxD: 8 },
    { R: 100, extent: 30, center: [2.5, 0.8, 0.3], radius: 0.6, target: [5, 0.8, 0.3], maxD: 8 },
  ];
  for (const [i, s] of shapes.entries()) {
    const w = csc(`oball${i}`, s.R, s.extent,
      [{ id: 'b', kind: 'ball', regionId: 'r', position: s.center, radius: s.radius }]);
    const space = w.regions.get('r').space, prim = w.regions.get('r').field.primitives[0];
    const p = [...space.decode([0, 0, 0])], u = aim(space, p, s.target);
    const out = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: s.maxD });
    const n = verifyComplete(s.R, prim, p, u, s.maxD, out, `R=${s.R} oblique ball`);
    assert.equal(n, 2, `R=${s.R}: enter+exit pair`);
  }
});

check('metric oblique pairs at R=.5/8/100; incidence strictly oblique', () => {
  // Hand-built off-axis center (no compile): every root must satisfy
  // 0 < |n.d| < 1 strictly — neither central nor tangent.
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const c = [Math.sin(0.35) * Math.cos(0.12), Math.sin(0.35) * Math.sin(0.12), 0, Math.cos(0.35)];
    const prim = { entity: { id: 'ob', kind: 'ball', radius: 0.12 * R }, center: c };
    const p = [0, 0, 0, 1], u = [1, 0, 0, 0];
    const out = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: 0.8 * R });
    const n = verifyComplete(R, prim, p, u, 0.8 * R, out, `R=${R} metric oblique`);
    assert.equal(n, 2, `R=${R}: pair`);
    for (const e of out.events) {
      const nd = Math.abs(dot(e.normal, e.direction));
      assert.ok(nd > 1e-6 && nd < 1 - 1e-6, `R=${R}: incidence not oblique (${nd})`);
    }
  }
});

check('large balls below pi R: pairs, lone exits, closed-form lengths', () => {
  // Radius 1.4 rad admits an outside enter+exit pair inside a half-circle;
  // radius 2.5 rad only a lone exit from an inside start. Central rays give
  // closed-form lengths (center angle +/- radius angle) alongside bisection.
  const sp8 = createMetricSpace({ kind: 's3', curvatureRadius: 8 });
  const pair = { entity: { id: 'lb', kind: 'ball', radius: 11.2 }, center: [1, 0, 0, 0] };
  const o1 = sphericalBoundaryEvents(sp8, pair, [0, 0, 0, 1], [1, 0, 0, 0], { maxDistance: 24.5 });
  verifyComplete(8, pair, [0, 0, 0, 1], [1, 0, 0, 0], 24.5, o1, 'R=8 r=11.2 pair');
  assert.ok(Math.abs(o1.events[0].distance - (Math.PI / 2 - 1.4) * 8) < 1e-9, 'entry closed form');
  assert.ok(Math.abs(o1.events[1].distance - (Math.PI / 2 + 1.4) * 8) < 1e-9, 'exit closed form');
  for (const R of [0.5, 8, 100]) {
    const space = createMetricSpace({ kind: 's3', curvatureRadius: R });
    const c = [Math.sin(0.5), 0, 0, Math.cos(0.5)];
    const big = { entity: { id: 'lx', kind: 'ball', radius: 2.5 * R }, center: c };
    const p = [0, 0, 0, 1], u = [1, 0, 0, 0], maxD = 3.1 * R;
    const out = sphericalBoundaryEvents(space, big, p, u, { maxDistance: maxD });
    verifyComplete(R, big, p, u, maxD, out, `R=${R} r=2.5R lone exit`);
    assert.equal(out.events.length, 1, `R=${R}: lone exit`);
    assert.equal(out.events[0].transition, 'exit', `R=${R}: exit transition`);
    assert.ok(Math.abs(out.events[0].distance - 3 * R) < 1e-9 * R, `R=${R}: exit closed form`);
  }
  const deg = { entity: { id: 'dg', kind: 'ball', radius: Math.PI * 8 }, center: [1, 0, 0, 0] };
  const od = sphericalBoundaryEvents(sp8, deg, [0, 0, 0, 1], [1, 0, 0, 0], { maxDistance: 24 });
  assert.equal(od.status, 'unresolved', 'degenerate radius refuses');
  assert.equal(od.reason, 'degenerate-ball', 'degenerate reason');
  console.log('  degenerate r=piR refuses; r=2.5R exits at 3R exactly');
});

check('rotated compiled cell and tilted compiled plane', () => {
  // Cell rotated 0.5 rad about z via a float-exact frame; plane tilted via
  // an exact unit up. Four face events and one plane event, all verified.
  const w = csc('rotcell', 8, 8, [{ id: 'c', kind: 'geodesic-cell', regionId: 'r',
    position: [3, 0.5, 0], halfExtent: [0.5, 0.4, 0.3],
    frame: { forward: [Math.cos(0.5), Math.sin(0.5), 0], up: [0, 0, 1] } }]);
  const space = w.regions.get('r').space, prim = w.regions.get('r').field.primitives[0];
  assert.ok(Math.max(...prim.planes.map((pl) => Math.abs(dot(pl, pl) - 1))) < 1e-12, 'compiled poles unit');
  const p = [...space.decode([0, 0, 0])], u = aim(space, p, [5, 0.8, 0]);
  const out = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: 8 });
  const n = verifyComplete(8, prim, p, u, 8, out, 'rotated cell');
  assert.ok(n >= 2, 'rotated cell crossed');
  const w2 = csc('tiltplane', 8, 8,
    [{ id: 'pl', kind: 'plane', regionId: 'r', position: [2, 0, 0], up: [0.15, 0, Math.sqrt(1 - 0.0225)] }],
    [4, 0, 0]);
  const s2 = w2.regions.get('r').space, pr2 = w2.regions.get('r').field.primitives[0];
  const p2 = [...s2.decode([4, 0, 1])], u2 = aim(s2, p2, [-2, 0.5, 0]);
  const o2 = sphericalBoundaryEvents(s2, pr2, p2, u2, { maxDistance: 10 });
  verifyComplete(8, pr2, p2, u2, 10, o2, 'tilted plane');
  assert.equal(o2.events.length, 1, 'one plane crossing');
});

check('thin-cell near pair resolves; hunted exact coincidence refuses', () => {
  // Opposite faces 0.002 apart still resolve as a complete pair. Then the
  // coincidence hunt: bisect aim angle until face-3 and face-0 roots agree,
  // and the solver must refuse coincident-events instead of listing both.
  const w = csc('thincell', 8, 8,
    [{ id: 'c', kind: 'geodesic-cell', regionId: 'r', position: [3, 0, 0], halfExtent: [1e-3, 0.4, 0.3] }]);
  const space = w.regions.get('r').space, prim = w.regions.get('r').field.primitives[0];
  const p = [...space.decode([0, 0, 0])], u = aim(space, p, [5, 0, 0]);
  const thin = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: 5 });
  verifyComplete(8, prim, p, u, 5, thin, 'thin cell');
  assert.equal(thin.events.length, 2, 'thin pair');
  assert.ok(thin.events[1].distance - thin.events[0].distance < 0.003, 'pair separation');
  const w2 = csc('cellx', 8, 8,
    [{ id: 'c', kind: 'geodesic-cell', regionId: 'r', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] }]);
  const s2 = w2.regions.get('r').space, pr2 = w2.regions.get('r').field.primitives[0];
  const S = [...s2.decode([0, 0.1, 0])];
  const [T0, T1] = [s2.frame(S)[0], s2.frame(S)[1]];
  const dirOf = (th) => T0.map((x, i) => x * Math.cos(th) + T1[i] * Math.sin(th));
  const rootOf = (f, th, lo, hi) => bisect(
    (t) => dot(atOf(8, S, dirOf(th))(t), pr2.planes[f]), lo, hi, `hunt f${f}`);
  const D = (th) => rootOf(3, th, 0.5, 4) - rootOf(0, th, 2, 3);
  assert.ok(D(0.1) > 0 && D(0.13) < 0, 'coincidence bracketed');
  let a = 0.1, b = 0.13, fa = D(a);
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2, fm = D(m); if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; }
  const thStar = (a + b) / 2, sep = Math.abs(D(thStar));
  const coin = sphericalBoundaryEvents(s2, pr2, S, dirOf(thStar), { maxDistance: 8 });
  assert.equal(coin.status, 'unresolved', 'exact coincidence refuses');
  assert.equal(coin.reason, 'coincident-events', 'coincidence reason');
  console.log(`  thin pair ${(thin.events[1].distance - thin.events[0].distance).toFixed(6)} apart resolves; hunted th*=${thStar} (sep ${sep.toExponential(1)}) refuses`);
});

check('inactive face events emitted with no hit claim', () => {
  // A central ray crosses two faces ON the clipped boundary; an off-axis
  // ray crosses face great-spheres OUTSIDE the clipped solid. Both lists
  // are emitted with no hit claim. Inside-or-on ⟺ every face dot >= -tol,
  // verified with own dots only (no production solidity call).
  const w = csc('cellx', 8, 8,
    [{ id: 'c', kind: 'geodesic-cell', regionId: 'r', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] }]);
  const space = w.regions.get('r').space, prim = w.regions.get('r').field.primitives[0];
  // Cell interior is all face dots negative (measured at the center), so
  // outside ⟺ max face dot > +tol.
  const classify = (e) => Math.max(...prim.planes.map((pl) => dot(e.point, pl))) > 1e-9 ? 'outside' : 'boundary';
  const C = [...space.decode([0, 0, 0])];
  const cu = aim(space, C, [5, 0, 0]);
  const central = sphericalBoundaryEvents(space, prim, C, cu, { maxDistance: 8 });
  verifyComplete(8, prim, C, cu, 8, central, 'central cell ray');
  assert.equal(central.events.length, 2, 'central ray crosses twice');
  assert.ok(central.events.every((e) => classify(e) === 'boundary'), 'central events on boundary');
  const S = [...space.decode([0, 2, 0])];
  const su = [...space.frame(S)[0]];
  const off = sphericalBoundaryEvents(space, prim, S, su, { maxDistance: 8 });
  verifyComplete(8, prim, S, su, 8, off, 'off-axis cell ray');
  assert.ok(off.events.length >= 1, 'off-axis ray has candidates');
  assert.ok(off.events.some((e) => classify(e) === 'outside'), 'some candidates outside the clipped cell');
  console.log(`  central: ${central.events.length} on-boundary; off-axis: ${off.events.filter((e) => classify(e) === 'outside').length}/${off.events.length} outside-clipped-cell; none claimed as hits`);
});

check('roots near both range ends refuse or exclude exactly', () => {
  // Adaptive two-call: the first complete call measures the event guard,
  // then maxDistance is placed half a guard past the root (must refuse) or
  // three guards before it (must exclude with an empty complete list).
  const w = csc('oball', 8, 8,
    [{ id: 'b', kind: 'ball', regionId: 'r', position: [2.5, 0.8, 0.3], radius: 0.6 }]);
  const space = w.regions.get('r').space, prim = w.regions.get('r').field.primitives[0];
  const p = [...space.decode([0, 0, 0])], u = aim(space, p, [5, 0.8, 0.3]);
  const full = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: 8 });
  verifyComplete(8, prim, p, u, 8, full, 'range fixture');
  const [d, g] = [full.events[0].distance, full.events[0].guard];
  const near = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: d + g / 2 });
  assert.equal(near.status, 'unresolved', 'root in guard refuses');
  assert.equal(near.reason, 'range-boundary', 'far-end reason');
  const before = sphericalBoundaryEvents(space, prim, p, u, { maxDistance: d - g * 3 });
  assert.equal(before.status, 'complete', 'root past maxD excludes');
  assert.equal(before.events.length, 0, 'exclusion is empty');
  // Near-start root: restart half a guard before the entry; the entry is
  // now inside the guard and must refuse the same way.
  const at = atOf(8, p, u), tan = tanOf(8, p, u);
  const pS = at(d - g / 2), uS = tan(d - g / 2).map((x) => x / Math.hypot(...tan(d - g / 2)));
  const rs = sphericalBoundaryEvents(space, prim, pS, uS, { maxDistance: 8 });
  assert.equal(rs.status, 'unresolved', 'near-start root refuses');
  assert.equal(rs.reason, 'range-boundary', 'near-start reason');
  console.log(`  entry guard=${g.toExponential(1)}: maxD+guard/2 and start-guard/2 refuse, maxD-3guard excludes`);
});

check('tangency, coplanarity, budgets, drift, degeneracy refuse distinctly', () => {
  // Each numerical refusal carries its own reason; none is a wrong list.
  const R = 8, space = createMetricSpace({ kind: 's3', curvatureRadius: R });
  const p = [0, 0, 0, 1], u = [1, 0, 0, 0];
  // Grazing ball, rotated out of the axis planes (exact trig, no hunt):
  // center angle 0.2 rad == radius angle 1.6/8, so amplitude == level.
  const tang = { entity: { id: 'tg', kind: 'ball', radius: 1.6 },
    center: [-Math.sin(0.3) * Math.sin(0.2), Math.cos(0.3) * Math.sin(0.2), 0, Math.cos(0.2)] };
  const ru = [Math.cos(0.3), Math.sin(0.3), 0, 0];
  const t1 = sphericalBoundaryEvents(space, tang, p, ru, { maxDistance: 4 });
  assert.equal(t1.reason, 'tangent-or-ill-conditioned', `tangent (${t1.status}/${t1.reason})`);
  // Coplanar ray with a rotated pole: on-plane, along-plane, exact.
  const cop = { entity: { id: 'cp', kind: 'plane' }, planes: [[0.2, 0, Math.sqrt(0.96), 0]] };
  const cu = [Math.sqrt(0.96), 0, -0.2, 0];
  const t2 = sphericalBoundaryEvents(space, cop, p, cu, { maxDistance: 4 });
  assert.equal(t2.reason, 'coincident-or-ill-conditioned', `coplanar (${t2.status}/${t2.reason})`);
  // Budgets on a 3-candidate cell ray and the zero budget.
  const w = csc('cellx', 8, 8,
    [{ id: 'c', kind: 'geodesic-cell', regionId: 'r', position: [3, 0, 0], halfExtent: [0.5, 0.4, 0.3] }]);
  const s2 = w.regions.get('r').space, pr2 = w.regions.get('r').field.primitives[0];
  const S = [...s2.decode([0, 0.1, 0])];
  const [T0, T1] = [s2.frame(S)[0], s2.frame(S)[1]];
  const bu = T0.map((x, i) => x * Math.cos(0.19) + T1[i] * Math.sin(0.19));
  const t3 = sphericalBoundaryEvents(s2, pr2, S, bu, { maxDistance: 8, maxEvents: 2 });
  assert.equal(t3.reason, 'event-budget', `budget (${t3.status}/${t3.reason})`);
  const t4 = sphericalBoundaryEvents(s2, pr2, S, bu, { maxDistance: 8, maxEvents: 0 });
  assert.equal(t4.reason, 'event-budget', 'zero budget');
  // Input drift the metric absorbs but the root screen refuses.
  const b = { entity: { id: 'b', kind: 'ball', radius: 0.8 }, center: [Math.sin(0.4), 0, 0, Math.cos(0.4)] };
  const t5 = sphericalBoundaryEvents(space, b, [1e-12, 0, 0, 1], [1, 0, 0, 1e-9], { maxDistance: 1 });
  assert.equal(t5.reason, 'input-roundoff', `drift (${t5.status}/${t5.reason})`);
  console.log('  tangent / coplanar / event-budget x2 / input-roundoff: all distinct');
});

check('true misses stay empty with dense-scan evidence', () => {
  // Two miss shapes: amplitude gate skips the candidate entirely, and a
  // behind-start root is out of range. A 2000-sample scan of each predicate
  // shows no sign change; the scan is reported as sampled, not proven.
  const R = 8, space = createMetricSpace({ kind: 's3', curvatureRadius: R });
  const p = [0, 0, 0, 1];
  const skip = { entity: { id: 'sk', kind: 'ball', radius: 0.8 }, center: [Math.sin(0.5), 0, 0, Math.cos(0.5)] };
  const uMiss = [0, 1, 0, 0], maxD = 4;
  const o1 = sphericalBoundaryEvents(space, skip, p, uMiss, { maxDistance: maxD });
  assert.equal(o1.status, 'complete', 'skip miss completes');
  assert.equal(o1.events.length, 0, 'skip miss empty');
  const behind = { entity: { id: 'bh', kind: 'ball', radius: 0.8 }, center: [-Math.sin(0.5), 0, 0, Math.cos(0.5)] };
  const o2 = sphericalBoundaryEvents(space, behind, p, [1, 0, 0, 0], { maxDistance: maxD });
  assert.equal(o2.status, 'complete', 'behind miss completes');
  assert.equal(o2.events.length, 0, 'behind miss empty');
  for (const [nm, prim, u] of [['skip', skip, uMiss], ['behind', behind, [1, 0, 0, 0]]]) {
    const g = predFor(R, prim, null), at = atOf(R, p, u);
    let flips = 0, prev = g(at(0));
    for (let i = 1; i <= 2000; i++) {
      const v = g(at((i / 2000) * maxD));
      if ((prev < 0) !== (v < 0)) flips++;
      prev = v;
    }
    assert.equal(flips, 0, `${nm} miss: scan found a sign change`);
    console.log(`  ${nm} miss: 0 events, 2000-sample scan has no sign change`);
  }
});

console.log(`\ns3-ray-events-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
