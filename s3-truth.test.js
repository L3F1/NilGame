// S3 truth (MUSE-34): an independent reference for the geodesic-cell
// distance, the way MUSE-30 checked the box.
//
// REFERENCE (rebuildable from this description). The cell is the
// intersection of three slabs; slab j is the set of points whose angular
// coordinate |xi_j| <= h_j, where xi_j(p) = R*atan2(p.a_j, p.c) is measured
// from the decoded center c along the lifted construction axes a_j. No
// poles are ever formed and no asin(dot) is ever evaluated: those are the
// formula under test. Each face (i,s) is parametrized INDEPENDENTLY as the
// great sphere through its face-center f = step(c, s*h_i, a_i) in the
// directions orthogonal to the transported axis m = transport(c, f, s*a_i)
// -- a great sphere is totally geodesic, so exp_f(span(m-perp)) IS the face,
// exactly, with no pole involved. The patch is the slab filter on the other
// two coordinates. Sampling is a (t,phi) grid per face with coordinate
// descent from the best seeds, all on-surface; the minimum over faces is the
// unsigned distance, and the sign comes from the slab test, never from the
// field. The metric substrate (decode/step/distance/transport/frame) is
// shared deliberately: MUSE-32 verified its identities, and box-truth did
// the same with raw arithmetic. What is NOT shared is the entire plane
// construction under test.
// One-sided comparison: the cell distance is a BOUND (max under-reports
// near seams), so the field may read below the reference and must never
// read above it. Edges and corners are located by search on the
// independently-parametrized faces, minimizing slab violation.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

// --- tiny 4-vector kit (test-local; embedding arithmetic, not the formula) --
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale4 = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const norm4 = (a) => Math.hypot(a[0], a[1], a[2], a[3]);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

// --- the reference cell ------------------------------------------------------
function refCell(space, ent) {
  const R = space.curvatureRadius;
  const c = space.decode(ent.position);
  const h = ent.halfExtent.slice();
  // Construction axes rebuilt from the frame substrate, as region-world does
  // -- setup, not the formula under test.
  const base = space.frame(c);
  const f = ent.frame?.forward.slice() || [0, 1, 0];
  const u = ent.frame?.up.slice() || [0, 0, 1];
  const lift = (v) => base[0].map((_, i) => base.reduce((s, ax, j) => s + ax[i] * v[j], 0));
  const axes = [lift(cross3(f, u)), lift(f), lift(u)];
  for (const a of axes) assert.ok(Math.abs(norm4(a) - 1) < 1e-9, 'lifted axis must be unit');

  const xi = (p, j) => R * Math.atan2(dot4(p, axes[j]), dot4(p, c));
  const margin = (p) => Math.max(...[0, 1, 2].map((j) => Math.abs(xi(p, j)) - h[j]));
  const inside = (p) => margin(p) <= 0;

  // Face data, built once per cell: centers, transported normals, orthonormal
  // in-face directions, and the sampling range T.
  const faces = [];
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const fc = space.step(c, scale4(axes[i], s), h[i]);
      const m = space.transport(c, fc, scale4(axes[i], s));
      const e = space.frame(fc);
      const dirs = [];
      for (const b of e) {
        let w = space.project(fc, b, m);
        for (const d of dirs) w = sub4(w, scale4(d, dot4(w, d)));
        const l = norm4(w);
        if (l > 1e-6) dirs.push(scale4(w, 1 / l));
        if (dirs.length === 2) break;
      }
      assert.equal(dirs.length, 2, 'face tangent plane must be 2D');
      faces.push({ i, s, fc, dirs });
    }
  }

  // Sampling range: the patch plus probe reach, capped at the sphere.
  // The winner must land strictly inside; otherwise the range was too small
  // and the reference fails LOUD, not silently short.
  let probeReach = 0;
  const faceDist = (fi, p) => {
    const { fc, dirs } = faces[fi];
    const NT = 24, NW = 24;
    const T = Math.min(Math.PI * R - 0.01, 2 * (probeReach + Math.max(...h)) + 1);
    const at = (t, ph) => {
      const w = add4(scale4(dirs[0], Math.cos(ph)), scale4(dirs[1], Math.sin(ph)));
      return space.step(fc, w, t);
    };
    const keep = (q) => [0, 1, 2].every((j) => j === faces[fi].i || Math.abs(xi(q, j)) <= h[j] + 1e-9);
    const seeds = [];
    for (let a = 0; a <= NT; a++) {
      for (let b = 0; b < NW; b++) {
        const t = (a / NT) * T, ph = (b / NW) * 2 * Math.PI;
        const q = at(t, ph);
        if (keep(q)) seeds.push({ t, ph, d: space.distance(p, q) });
      }
    }
    // Aimed seed: the log map at the face center points at the probe; its
    // in-face component starts the descent within second order of the
    // minimum, so a coarse grid can never strand the refine outside.
    // (logAt/project/transport are the shared verified substrate, not the
    // pole construction under test.)
    {
      const v = space.logAt(fc, p);
      const m = space.transport(c, fc, scale4(axes[faces[fi].i], faces[fi].s));
      const wv = space.project(fc, v, m);
      const wl = norm4(wv);
      if (wl > 1e-9) {
        const wu = scale4(wv, 1 / wl);
        const ph = Math.atan2(dot4(wu, dirs[1]), dot4(wu, dirs[0]));
        const t = Math.min(T, wl);
        const q = at(t, ph);
        if (keep(q)) seeds.push({ t, ph, d: space.distance(p, q) });
      }
    }
    seeds.sort((x, y) => x.d - y.d);
    let best = Infinity, bestT = 0;
    for (const sd of seeds.slice(0, 4)) {
      let { t, ph } = sd, bd = sd.d;
      let st = T / NT, sp = (2 * Math.PI) / NW;
      for (;;) {
        let improved = false;
        for (const [dt, dp] of [[st, 0], [-st, 0], [0, sp], [0, -sp]]) {
          const t2 = Math.max(0, Math.min(T, t + dt)), p2 = ph + dp;
          const q = at(t2, p2);
          if (!keep(q)) continue;
          const d = space.distance(p, q);
          if (d < bd) { bd = d; t = t2; ph = p2; improved = true; }
        }
        if (!improved) {
          st /= 2; sp /= 2;
          if (st < 1e-10 && sp < 1e-10) break;
        }
      }
      if (bd < best) { best = bd; bestT = t; }
    }
    return { d: best, t: bestT, T };
  };

  function distance(p) {
    let best = Infinity, worstRatio = 0;
    for (let fi = 0; fi < 6; fi++) {
      const r = faceDist(fi, p);
      if (r.d < best) best = r.d;
      worstRatio = Math.max(worstRatio, r.t / r.T);
    }
    assert.ok(worstRatio < 0.95, `sampling range too small (winner at ${(worstRatio * 100).toFixed(1)}% of T)`);
    return inside(p) ? -best : best;
  }

  function faceDists(p) {
    return faces.map((f, fi) => ({ i: f.i, s: f.s, ...faceDist(fi, p) }));
  }

  probeReach = Math.max(...h) + 2;
  return {
    R, c, h, axes, xi, margin, inside, faces, distance, faceDists, space,
    setReach: (d) => { probeReach = d; },
  };
}

// Locate an edge/corner point by minimizing slab violation on face (fi),
// then refine. Returns a 4-vector on the feature within ~1e-9.
function locateFeature(ref, fi, targets) {
  const space = ref.space;
  const { faces } = ref;
  const { fc, dirs } = faces[fi];
  const NT = 32, NW = 32;
  const T = Math.min(Math.PI * ref.R - 0.01, 2 * (2 + Math.max(...ref.h)) + 1);
  const at = (t, ph) => {
    const w = add4(scale4(dirs[0], Math.cos(ph)), scale4(dirs[1], Math.sin(ph)));
    return space.step(fc, w, t);
  };
  const penalty = (q) => targets.reduce((s, [j, v]) => s + Math.abs(ref.xi(q, j) - v), 0)
    + [0, 1, 2].reduce((s, j) => (targets.some(([k]) => k === j) ? s : s + Math.max(0, Math.abs(ref.xi(q, j)) - ref.h[j] + 0.05)), 0);
  let bt = 0, bp = 0, bd = Infinity;
  for (let a = 0; a <= NT; a++) {
    for (let b = 0; b < NW; b++) {
      const t = (a / NT) * T, ph = (b / NW) * 2 * Math.PI;
      const d = penalty(at(t, ph));
      if (d < bd) { bd = d; bt = t; bp = ph; }
    }
  }
  let st = T / NT, sp = (2 * Math.PI) / NW;
  for (;;) {
    let improved = false;
    for (const [dt, dp] of [[st, 0], [-st, 0], [0, sp], [0, -sp]]) {
      const t2 = Math.max(0, Math.min(T, bt + dt)), p2 = bp + dp;
      const d = penalty(at(t2, p2));
      if (d < bd) { bd = d; bt = t2; bp = p2; improved = true; }
    }
    if (!improved) {
      st /= 2; sp /= 2;
      if (st < 1e-11 && sp < 1e-11) break;
    }
  }
  return at(bt, bp);
}

// The floor is scaffolding, not the subject: its single-great-sphere form
// is exact and involves no max, so the reference reuses that exact form
// (lift + asin, computed here by hand) while the cell's pole construction
// stays excluded. The comparison is then min(cell, floor) on both sides.
function floorRef(space, floorEnt) {
  const R = space.curvatureRadius;
  const anchor = space.decode(floorEnt.position);
  const base = space.frame(anchor);
  const n = base[0].map((_, i) => base.reduce((s, ax, j) => s + ax[i] * floorEnt.up[j], 0));
  return (p) => R * Math.asin(clamp1(dot4(p, n)));
}

// --- documents ---------------------------------------------------------------
function cellDoc(id, R, extent, pos, halves, spawn) {
  // floorId must name a real additive plane, so one is authored at maximum
  // depth. Every probe asserts the cell owns it (below): a floor win is a
  // misplaced probe, failed loud, never silently blended into the comparison.
  const fz = -(extent - 0.01);
  return {
    format: 'nil-scene', version: 2, id,
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'sphere', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent, floorId: 's-floor' }],
    entities: [
      { id: 'cell', regionId: 'sphere', kind: 'geodesic-cell', position: pos, halfExtent: halves },
      { id: 's-floor', regionId: 'sphere', kind: 'plane', position: [0, 0, fz], up: [0, 0, 1] },
      { id: 'start', regionId: 'sphere', kind: 'spawn', position: spawn },
    ],
    connections: [],
  };
}

const ROOMY = { pos: [0, 0.6, 0.6], h: [1.2, 0.25, 0.8], spawn: [0, -2.3, 0.3] };
const CONFIGS = [
  { name: 'roomy/R=2', R: 2, extent: 3.0, ...ROOMY },
  { name: 'roomy/R=8', R: 8, extent: 8, ...ROOMY },
  { name: 'roomy/R=10000', R: 10000, extent: 8, ...ROOMY },
  { name: 'near-limit/R=2', R: 2, extent: 3.0, pos: [0, 0, 0.3], h: [2.6, 0.4, 1.0], spawn: [0, -2.4, 0.2] },
  { name: 'near-limit/R=8', R: 8, extent: 12, pos: [0, 0, 0.3], h: [10.0, 0.5, 2.0], spawn: [0, -10.5, 0.3] },
];

// --- probes ------------------------------------------------------------------
function boxSDF(c, h, p) {
  const q = [0, 1, 2].map((i) => Math.abs(p[i] - c[i]) - h[i]);
  return Math.hypot(...q.map((x) => Math.max(x, 0))) + Math.min(Math.max(...q), 0);
}

function buildProbes(space, ref, cfg, field) {
  const { c, h, axes } = ref;
  const R = space.curvatureRadius;
  const probes = [];
  const push = (p, cls, label, feat = false) => probes.push({ p, cls, label, feat });
  push(c, 'center', 'center');
  // Near doses ride the construction axes (exact xi); far doses are capped
  // by the sphere itself (0.6R) so a "2.7 units out" probe cannot swing
  // around a small sphere into the floor. Downward reach is capped harder:
  // the floor sits at maximum depth and must never own a probe.
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const dir = scale4(axes[i], s);
      let farDose = Math.min(h[i] + 1.5, 0.6 * R);
      if (i === 2 && s < 0) farDose = Math.min(h[i] + 1.0, 0.6 * R);
      const doses = [h[i] * 0.5, h[i] - Math.min(0.05, h[i] * 0.2), h[i], h[i] + Math.min(0.05, h[i] * 0.2), h[i] + 0.3, farDose]
        .filter((d) => d > 1e-9);
      for (const d of doses) {
        const cls = d < h[i] - 1e-12 ? (h[i] - d < 0.35 ? 'face-in' : 'inside')
          : d > h[i] + 1e-12 ? (d - h[i] < 0.35 ? 'face-out' : 'outside') : 'face';
        push(space.step(c, dir, d), cls, `axis${i}${s > 0 ? '+' : '-'}@${d.toFixed(3)}`, d === h[i]);
      }
    }
  }
  const faceIndex = (i, s) => i * 2 + (s > 0 ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          const e = locateFeature(ref, faceIndex(i, s), [[j, t * h[j]]]);
          const mi = space.transport(c, e, scale4(axes[i], s));
          const mj = space.transport(c, e, scale4(axes[j], t));
          push(e, 'edge', `edge${i}${s > 0 ? '+' : '-'}${j}${t > 0 ? '+' : '-'}`, true);
          for (const [m, nm] of [[mi, `ni${i}`], [scale4(mi, -1), `no${i}`], [mj, `ni${j}`], [scale4(mj, -1), `no${j}`]]) {
            for (const d of [0.05, 0.3]) {
              push(space.step(e, space.normalize(e, m), d), 'edge', `edge${i}${j}-${nm}@${d}`);
            }
          }
          // Diagonal-outside: the probe the max() bound actually loses to.
          // Off a single normal one face goes nearest and max stays exact;
          // outside BOTH slabs the edge is nearest while max reads the
          // nearer face plane -- the gap between them is the walker's tax.
          {
            const md = space.normalize(e, add4(mi, mj));
            for (const d of [0.05, 0.3, 1.0]) {
              push(space.step(e, md, d), 'edge-diag', `edgediag${i}${j}@${d}`);
            }
          }
        }
      }
    }
  }
  for (const s0 of [-1, 1]) {
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const k = locateFeature(ref, faceIndex(0, s0), [[1, s1 * h[1]], [2, s2 * h[2]]]);
        push(k, 'corner', `corner${s0 > 0 ? '+' : '-'}${s1 > 0 ? '+' : '-'}${s2 > 0 ? '+' : '-'}`, true);
        const ms = [0, 1, 2].map((i) => space.transport(c, k, scale4(axes[i], [s0, s1, s2][i])));
        for (const m of [...ms, ...ms.map((v) => scale4(v, -1))]) {
          for (const d of [0.05, 0.3]) {
            push(space.step(k, space.normalize(k, m), d), 'corner', 'corner-off');
          }
        }
        // Outside all three slabs the corner itself is nearest; max reads a
        // face plane instead. Inside-diagonal goes along for the contrast
        // (faces stay nearest there, so max stays exact).
        for (const sgn of [1, -1]) {
          const md = space.normalize(k, scale4(add4(add4(ms[0], ms[1]), ms[2]), sgn));
          for (const d of [0.05, 0.3, 1.0]) {
            push(space.step(k, md, d), 'corner-diag', `cornerdiag${sgn > 0 ? 'out' : 'in'}@${d}`);
          }
        }
      }
    }
  }
  // Far probes are placed in CHART space and selected, not assumed: walk
  // each chart direction until outside the cell, the chart rim, or a floor
  // win -- whichever comes first. On a small sphere a huge cell can swallow
  // every naive offset, so selection failure is loud, not a silent gap.
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]];
  let found = 0;
  for (const dir of dirs) {
    for (let d = 0.5; d < cfg.extent - Math.hypot(...cfg.pos) - 0.05; d += 0.25) {
      const q = [cfg.pos[0] + dir[0] * d, cfg.pos[1] + dir[1] * d, cfg.pos[2] + dir[2] * d];
      const p = space.decode(q);
      if (ref.inside(p)) continue;
      if (field.sample(p).owner !== 'cell') break; // floor country; try next direction
      push(p, 'far', `far[${q.map((v) => v.toFixed(2)).join(',')}]`);
      found++;
      break;
    }
    if (found >= 4) break;
  }
  assert.ok(found >= 2, `only ${found} far probes selected outside the cell`);
  return probes;
}

// --- checks ------------------------------------------------------------------
const TOL_ONE_SIDED = 1e-9; // the field may read below the reference, never above
const TOL_FEATURE = 1e-6; // on-feature agreement (located within ~1e-9)
const summary = [];
for (const cfg of CONFIGS) {
  check(`${cfg.name}: one-sided cell comparison`, () => {
    const doc = cellDoc(cfg.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), cfg.R, cfg.extent, cfg.pos, cfg.h, cfg.spawn);
    const region = compileRegionWorld(doc).regions.get('sphere');
    const { field } = region;
    // Test-local great-circle parameterization, independent of production
    // retraction/short-vector repair. The coordinate-descent oracle must not
    // inherit those rounding changes: they can send its strict-improvement
    // search down a different long valley. Keep all grids, probes, stopping
    // resolutions and field assertions unchanged. This is single-shot surface
    // sampling, not the repeated integration exercised by metric-space tests.
    const space = { ...region.space,
      step(p, u, t) {
        region.space.validateTangent(p, u);
        assert.ok(Math.abs(norm4(u)-1)<1e-8);
        const angle=t/cfg.R, c=Math.cos(angle), s=Math.sin(angle);
        return p.map((x,i)=>c*x+s*u[i]);
      },
      normalize(p, v) {
        region.space.validateTangent(p, v);
        const length=norm4(v);assert.ok(length>0);
        return v.map(x=>x/length);
      },
    };
    assert.ok(field.distance(region.spawnPosition) > 0, 'spawn must have room (compile already enforces)');
    const ent = doc.entities.find((e) => e.id === 'cell');
    const ref = refCell(space, ent);
    ref.setReach(12);
    const floorDist = floorRef(space, doc.entities.find((e) => e.id === 's-floor'));

    // The center is exact on both sides: every plane reads -h_i there.
    const fc = field.distance(ref.c), rc = ref.distance(ref.c);
    assert.ok(Math.abs(fc + Math.min(...cfg.h)) <= 1e-9, `center field ${fc} must be -min(halves)`);
    assert.ok(Math.abs(rc - fc) <= 1e-9, `center ref ${rc} vs field ${fc}`);

    const probes = buildProbes(space, ref, cfg, field);
    const worst = {};
    const note = (cls, u, label) => {
      // Diagonal probes keep their dose: the shortfall profile U(delta) is
      // itself a finding (it grows with distance from the seam).
      const at = label.includes('@') ? label.slice(label.indexOf('@')) : '';
      const key = cls.endsWith('diag') ? `${cls}${at}` : cls;
      if (!(u > (worst[key]?.u ?? -Infinity))) return;
      worst[key] = { u, label };
    };
    for (const { p, cls, label, feat } of probes) {
      const owner = field.sample(p).owner;
      const f = field.distance(p);
      const rCell = ref.distance(p);
      const r = Math.min(rCell, floorDist(p));
      // THE safety property, against an independent truth.
      if (!(f <= r + TOL_ONE_SIDED) && process.env.S3_DEBUG) {
        const xis = [0, 1, 2].map((j) => ref.xi(p, j).toFixed(4)).join(',');
        const per = ref.faceDists(p).map((d) => `(${d.i},${d.s > 0 ? '+' : '-'}):${d.d.toFixed(4)}`).join(' ');
        console.log(`  VIOLATION ${cfg.name} ${label}: field=${f} ref=${r} owner=${owner} xi=[${xis}] halves=[${ref.h}] faces: ${per}`);
      }
      assert.ok(f <= r + TOL_ONE_SIDED, `${cfg.name} ${label}: field ${f} over-reports ref ${r}`);
      note(cls, r - f, label);
      if (feat) {
        assert.equal(owner, 'cell', `${cfg.name} ${label}: floor owns a feature probe, misplaced`);
        assert.ok(Math.abs(f) <= TOL_FEATURE, `${cfg.name} ${label}: field ${f} off the feature`);
        assert.ok(Math.abs(rCell) <= TOL_FEATURE, `${cfg.name} ${label}: ref ${rCell} off the feature`);
      }
      if (cfg.R === 10000 && (cls === 'center' || label.startsWith('axis'))) {
        // The reference itself is checked: at R=10000 great-circle is
        // Euclidean to ~1e-9, so hand arithmetic must agree with it.
        const eu = boxSDF(cfg.pos, cfg.h, space.encode(p));
        assert.ok(Math.abs(r - eu) <= 1e-6, `${cfg.name} ${label}: ref ${r} vs euclid ${eu}`);
      }
    }
    summary.push({ name: cfg.name, n: probes.length, worst });
  });
}

console.log('\nworst under-report (ref - field) by class:');
for (const { name, n, worst } of summary) {
  console.log(`  ${name} [${n} probes]`);
  for (const [cls, { u, label }] of Object.entries(worst)) {
    console.log(`    ${cls}: ${u.toExponential(2)} at ${label}`);
  }
}
console.log(`\ns3-truth: ${passed} checks passed\n`);
