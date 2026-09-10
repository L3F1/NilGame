// Box truth (MUSE-30): an independent reference for the box closed form in
// scene-field.js, which box.test.js only brackets against itself.
//
// REFERENCE (rebuildable from this description). Distance: the nearest point
// on the surface, found WITHOUT the over()/hypot-minmax formula. Each of the
// six faces is sampled on a 51x51 grid in its own (u,v) plane, the best point
// of each face is refined by coordinate descent (try +-step in u and v,
// keep improvements, halve the step when nothing improves, stop below
// 1e-12), and the minimum over all six refined faces is the reference. It is
// UNSIGNED: the sign comes from construction (test points sit at a known
// margin inside/outside, or exactly on a face by construction), never from
// the formula under test. The frame (right = forward x up) is rebuilt from
// the raw document values, not read from the solid.
// Convergence: the grid only seeds; the descent drives every face to a step
// below 1e-12, so the reference resolution is 1e-12 and any disagreement far
// above that belongs to the formula, not the reference. The run prints the
// smallest final step actually observed.
// Normal: central differences of the box distance itself at h=1e-7, compared
// only where the solid reports unique:true; seams assert unit + deterministic.
// RayHit: bisection on the sign of the box distance along the ray down to a
// 1e-12 bracket, seeded from the slab answer when finite, grown by doubling
// otherwise; a ray that never goes non-positive is an Infinity miss.
import assert from 'node:assert/strict';
import { primitiveOf } from './engine/world/scene-field.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

// Frame rebuilt from the raw entity, mirroring the documented convention
// (right = forward x up) without touching the solid under test.
function frameOf(ent) {
  const forward = ent.frame?.forward.slice() || [0, 1, 0];
  const up = ent.frame?.up.slice() || [0, 0, 1];
  const right = cross(forward, up);
  const axes = [right, forward, up];
  return {
    axes,
    toLocal: (p) => axes.map((a) => dot(a, sub(p, ent.position))),
    toWorld: (q) => add(ent.position, [0, 1, 2].map((i) => axes.reduce((s, a, j) => s + a[i] * q[j], 0))),
  };
}

const GRID = 25; // 51x51 seeds per face; the descent below does the real work
function refDistance(ent, p) {
  const { toWorld } = frameOf(ent);
  const h = ent.halfExtent;
  let best = Infinity, bestStep = Infinity;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const s of [-1, 1]) {
      const at = (u, v) => {
        const q = [0, 0, 0];
        q[i] = s * h[i]; q[j] = u; q[k] = v;
        return toWorld(q);
      };
      let bu = 0, bv = 0, bd = Infinity;
      for (let a = -GRID; a <= GRID; a++) {
        for (let b = -GRID; b <= GRID; b++) {
          const u = (a / GRID) * h[j], v = (b / GRID) * h[k];
          const d = norm(sub(p, at(u, v)));
          if (d < bd) { bd = d; bu = u; bv = v; }
        }
      }
      let step = Math.max(h[j], h[k]) / GRID;
      for (;;) {
        let improved = false;
        for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const u = Math.max(-h[j], Math.min(h[j], bu + du));
          const v = Math.max(-h[k], Math.min(h[k], bv + dv));
          const d = norm(sub(p, at(u, v)));
          if (d < bd) { bd = d; bu = u; bv = v; improved = true; }
        }
        if (!improved) {
          step /= 2;
          if (step < 1e-12) break;
        }
      }
      if (bd < best) { best = bd; bestStep = step; }
    }
  }
  return { d: best, step: bestStep };
}

const BOXES = [
  { id: 'unit', regionId: 'r', kind: 'box', position: [0, 0, 0], halfExtent: [1, 1, 1] },
  { id: 'slab', regionId: 'r', kind: 'box', position: [2, 0, 1], halfExtent: [10, 1, 0.01] },
  { id: 'needle', regionId: 'r', kind: 'box', position: [-3, 2, 50], halfExtent: [0.001, 0.001, 50] },
  { id: 'turned', regionId: 'r', kind: 'box', position: [0, 0, 3], halfExtent: [1, 2, 0.5],
    frame: { forward: [0, 0, 1], up: [0, -1, 0] } },
  { id: 'turned-flat', regionId: 'r', kind: 'box', position: [5, -5, 2], halfExtent: [8, 0.05, 0.5],
    frame: { forward: [1, 0, 0], up: [0, 0, 1] } },
];

// Local-coordinate query points: [point, expectedSign]. Margins (1e-6, 0.05,
// 0.5, 3, far) sit far above the 1e-12 reference resolution; on-face points
// carry sign 0 and assert both answers read ~zero.
function distancePoints(h) {
  const pts = [];
  pts.push([[0, 0, 0], -1]);
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const face = [0, 0, 0]; face[i] = s * h[i];
      pts.push([face, 0]);
      for (const m of [1e-6, 0.5]) {
        const q = face.slice(); q[i] += s * m; pts.push([q, 1]);
        // The inside margin must not cross a thin box: clamp to half depth.
        const r = face.slice(); r[i] -= s * Math.min(m, h[i] * 0.5); pts.push([r, -1]);
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const e = [0, 0, 0]; e[j] = a * h[j]; e[k] = b * h[k];
      pts.push([e, 0]); // edge midpoint, on the surface by construction
      const o = e.slice(); o[j] += a * 0.05; o[k] += b * 0.05; pts.push([o, 1]);
    }
  }
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) {
    pts.push([[a * h[0], b * h[1], c * h[2]], 0]);
    pts.push([[a * (h[0] + 0.05), b * (h[1] + 0.05), c * (h[2] + 0.05)], 1]);
  }
  pts.push([[h[0] * 10 + 100, h[1] * 10 - 50, h[2] * 10 + 25], 1]);
  return pts;
}

let worstD = { dev: 0, where: '' };
let finestStep = Infinity;
check('distance matches the face-sampled reference on every box', () => {
  for (const ent of BOXES) {
    const solid = primitiveOf(ent);
    const { toWorld } = frameOf(ent);
    for (const [local, sign] of distancePoints(ent.halfExtent)) {
      const p = toWorld(local);
      const d = solid.distance(p);
      const ref = refDistance(ent, p);
      finestStep = Math.min(finestStep, ref.step);
      if (sign === 0) {
        // On-face by construction but 1-ulp off after float round-trips:
        // both answers must read ~zero rather than agree on a sign.
        assert.ok(Math.abs(d) <= 1e-9, `${ent.id}: face reads ${d} at ${JSON.stringify(local)}`);
        assert.ok(ref.d <= 1e-9, `${ent.id}: ref reads ${ref.d} at ${JSON.stringify(local)}`);
      } else {
        assert.equal(Math.sign(d), sign, `${ent.id}: sign at ${JSON.stringify(local)}`);
      }
      const dev = Math.abs(ref.d - Math.abs(d));
      if (dev > worstD.dev) worstD = { dev, where: `${ent.id} ${JSON.stringify(local)}` };
      assert.ok(dev <= 1e-9, `${ent.id}: ref ${ref.d} vs formula ${d} at ${JSON.stringify(local)}`);
    }
  }
});

let worstN = { dev: 0, where: '' };
check('normal matches the numeric gradient where the solid claims unique', () => {
  const e = 1e-7;
  for (const ent of BOXES) {
    const solid = primitiveOf(ent);
    const { toWorld } = frameOf(ent);
    const h = ent.halfExtent;
    const smooth = [];
    const thin = Math.min(...h);
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        const f = [0, 0, 0]; f[i] = s * (h[i] + 0.5); smooth.push(f);
        // Interior: only the thinnest faces can be nearest from inside,
        // so only they give unambiguous interior gradient probes.
        if (h[i] === thin) {
          const g = [0, 0, 0]; g[i] = s * (h[i] / 2); smooth.push(g);
        }
      }
    }
    smooth.push([h[0] + 1, h[1] + 1, h[2] + 1]); // off-corner diagonal
    for (const local of smooth) {
      const p = toWorld(local);
      const info = solid.normalInfo(p);
      assert.ok(info.unique, `${ent.id}: expected unique at ${JSON.stringify(local)}`);
      const g = [0, 1, 2].map((i) => {
        const a = p.slice(); a[i] += e;
        const b = p.slice(); b[i] -= e;
        return (solid.distance(a) - solid.distance(b)) / (2 * e);
      });
      assert.ok(Math.abs(norm(g) - 1) < 1e-6, `${ent.id}: gradient magnitude at ${JSON.stringify(local)}`);
      const n = solid.normal(p);
      const dev = 1 - dot(g.map((x) => x / norm(g)), n);
      if (dev > worstN.dev) worstN = { dev, where: `${ent.id} ${JSON.stringify(local)}` };
      assert.ok(dev < 1e-8, `${ent.id}: gradient vs normal at ${JSON.stringify(local)}`);
    }
    // Seams: the tie rule is lowest-axis-index-wins, deterministic, unit.
    for (const local of [[h[0], h[1] * 0.5, 0], [h[0], h[1], h[2]]]) {
      const p = toWorld(local);
      const a = solid.normal(p), b = solid.normal(p);
      assert.deepEqual(a, b, `${ent.id}: seam normal must be deterministic`);
      assert.ok(Math.abs(norm(a) - 1) < 1e-12, `${ent.id}: seam normal must be unit`);
    }
  }
});

// Blind doubling can step clean OVER a small box (outside, inside,
// outside again), so the bracket is seeded from the slab answer when it is
// finite and only grown by doubling to confirm a reported miss. A miss that
// still brackets a sign change is a slab defect, reported, not papered over.
function bisect(solid, p, u, slab, tag) {
  const f = (t) => solid.distance(add(p, scale(u, t)));
  if (f(0) <= 0) return 0;
  let lo = 0, hi;
  if (Number.isFinite(slab)) {
    // One dust-step past the slab entry: f(slab) itself can read +1ulp when
    // the entry point round-trips through world space (needle edge: +3.3e-16).
    hi = slab + Math.max(1e-9, Math.abs(slab) * 1e-12);
    assert.ok(f(hi) <= 1e-9, `${tag}: slab claims hit at ${slab} but f(${hi})=${f(hi)}`);
  } else {
    hi = 1;
    while (f(hi) > 0) {
      hi *= 2;
      if (hi > 1e9) return Infinity;
    }
    assert.fail(`${tag}: slab claims a miss but the sign changes by t=${hi}`);
  }
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) <= 0) hi = mid; else lo = mid;
  }
  return hi;
}

let worstR = { dev: 0, where: '' };
check('rayHit matches bisection on the sign at finer resolution than box.test.js', () => {
  for (const ent of BOXES) {
    const solid = primitiveOf(ent);
    const { toWorld, axes } = frameOf(ent);
    const h = ent.halfExtent;
    const L = (q) => toWorld(q);
    const rays = [
      [L([0, 0, h[2] + 5]), [0, 0, -1]],       // face-on hit
      [L([h[0] + 5, h[1], 0]), [-1, 0, 0]],    // edge-on hit
      [L([h[0] + 5, h[1] + 5, h[2] + 5]), [-1, -1, -1]], // corner-on hit
      [L([0, 0, h[2] + 1]), [1, 0, 0]],        // parallel miss
      [L([0, 0, h[2] + 1]), [0, 0, 1]],        // aimed away
      [L([0, 0, 0]), [0, 0, 1]],               // starts inside
      [L([h[0] + 1e-9, 0, -10]), [0, 0, 1]],   // grazing miss past the edge
      [L([0, 0, h[2] + 500]), [0, 0, -1]],     // far start, still hits
    ];
    for (let ri = 0; ri < rays.length; ri++) {
      const [lq, ld] = rays[ri];
      const u = (() => { const w = [0, 1, 2].map((i) => axes.reduce((s, a, j) => s + a[i] * ld[j], 0)); return scale(w, 1 / norm(w)); })();
      const t = solid.rayHit(lq, u);
      const b = bisect(solid, lq, u, t, `${ent.id} ray ${ri}`);
      if (!Number.isFinite(t) || !Number.isFinite(b)) {
        assert.equal(t, b, `${ent.id}: slab ${t} vs bisection ${b}`);
        continue;
      }
      const dev = Math.abs(t - b);
      if (dev > worstR.dev) worstR = { dev, where: `${ent.id}` };
      assert.ok(dev <= 1e-9, `${ent.id}: slab ${t} vs bisection ${b}`);
    }
  }
});

// eslint-disable-next-line no-console
console.log(`\nbox-truth: ${passed} checks passed; `
  + `worst |ref|-|formula|| = ${worstD.dev} at ${worstD.where}; `
  + `worst normal gap = ${worstN.dev} at ${worstN.where}; `
  + `worst slab-vs-bisection = ${worstR.dev} at ${worstR.where}; `
  + `finest reference step = ${finestStep}\n`);
