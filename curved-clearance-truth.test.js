// MUSE-42: independent checks for intrinsic clearance.
//
// Contract: docs/engineering/CURVED_CLEARANCE_CONTRACT.md. MUSE-40 proved the
// sampled hallway was face-limited; it did NOT establish global field
// exactness. This file checks the analytic center-local face-height relation
// and the face-foot exactness certificate against independently parameterized
// references. No engine/app/schema changes; the field under test is read,
// never modified.
//
// INDEPENDENT REFERENCE (rebuildable, two layers).
// Layer 1 (analytic, exact in exact arithmetic): face normals rebuilt from
// the contract formula n_(i,s) = s*cos(h_i/R)*a_i - sin(h_i/R)*c with axes
// lifted through space.frame exactly as construction does, but derived here,
// not read from engine planes. Positions from the contract's center-local
// exponential map p = cos(l/R)*c + sin(l/R)*v/l. Face height R*asin(p.n).
// Layer 1 agrees with the field to ~1e-12 (observed max 4.5e-13); it shares
// only decode/step/distance/transport/frame/project/logAt substrate with the
// engine, never the asin(dot) plane-max under test.
// Layer 2 (sampled nearest-point truth): per-face (t,phi) grid over each
// supporting patch plus coordinate descent from the best grid node,
// slab-filtered; min over faces, sign from the slab test. Convergence gate:
// every quantitative truth claim uses a probe where NT=16 and NT=32 grids
// agree to 1e-6, else the check fails loud. Observed: agreement ~1e-12 on
// face-interior probes, <1e-6 on the selected corner probes; near jamb
// edges (foot within a grid cell of the patch boundary) grids can disagree
// at 1e-3, so such probes are excluded from exact claims, not averaged in.
//
// CERTIFICATE UNDER TEST (the contract's rule, implemented here, not in the
// engine): for an exterior point, let n* be the argmax-plane normal and
// a = p.n*. If 1-a^2 is tiny the projection is singular -> UNRESOLVED. Else
// q = (p - a*n*)/sqrt(1-a^2). If q lies in every half-space (slack 1e-9 for
// FP; the active face holds by construction to 2.3e-16 observed) and the
// transverse margins clear 1e-3, q attains the bound -> EXACT with value
// R*asin(a) == metric dist(p,q) (observed identity to 6e-17). Otherwise,
// including every corner/jamb case where the foot leaves a slab,
// UNRESOLVED: exactness must NOT be claimed.
//
// LIMITS. Seeded probes, not a proof: no universal safe-distance or
// step-cost claim. Singular/near-ambiguous projection is unresolved by
// design. The single-cell certificate is NOT applied to modified/union
// scenes (check H shows the transfer misfiring by 0.50). Negative
// conservative clearance is not a collision witness (check G).
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// Deterministic LCG so probes are seeded, not hand-tuned.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; };
}

const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale4 = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const norm4 = (a) => Math.hypot(a[0], a[1], a[2], a[3]);
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function cellDoc(R, pos, half, frame, extent, id = 'probe', extra = [], spawnPos = [0, 0, 0]) {
  return {
    format: 'nil-scene', version: 2, id,
    units: { name: 'design-unit', playerRadius: 0.05 },
    regions: [{ id: 's', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent }],
    entities: [
      { id: 'cell', regionId: 's', kind: 'geodesic-cell', position: pos, halfExtent: half, ...(frame ? { frame } : {}) },
      { id: 'start', regionId: 's', kind: 'spawn', position: spawnPos },
      ...extra,
    ],
    connections: [],
  };
}

// Construction axes rebuilt here (lift of cross(f,u),f,u through the
// canonical frame), not read from engine packets.
function axesOf(space, c, f, u) {
  const base = space.frame(c);
  const lift = (v) => base[0].map((_, i) => base.reduce((s, ax, j) => s + ax[i] * v[j], 0));
  return [lift(cross3(f, u)), lift(f), lift(u)];
}

// Contract position formula: center-local v -> embedding point.
function expCenter(c, axes, v, R) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l === 0) return c.slice();
  const uh = [v[0] / l, v[1] / l, v[2] / l];
  const w = axes[0].map((_, i) => axes[0][i] * uh[0] + axes[1][i] * uh[1] + axes[2][i] * uh[2]);
  return c.map((ck, k) => Math.cos(l / R) * ck + Math.sin(l / R) * w[k]);
}

function makeCell(space, pos, half, f, u) {
  const R = space.curvatureRadius;
  const c = space.decode(pos);
  const axes = axesOf(space, c, f, u);
  const xi = (p, j) => R * Math.atan2(dot4(p, axes[j]), dot4(p, c));
  const normals = axes.flatMap((a, i) => [-1, 1].map((s) =>
    c.map((ck, k) => s * Math.cos(half[i] / R) * a[k] - Math.sin(half[i] / R) * ck)));
  const height = (p, fi) => R * Math.asin(clamp1(dot4(p, normals[fi])));
  const analytic = (p) => Math.max(...normals.map((_, fi) => height(p, fi)));
  return { R, c, h: half, axes, xi, normals, height, analytic };
}

// The contract's face-foot certificate, implemented here for the test.
function certify(cell, p) {
  const { R, normals, xi, h } = cell;
  let fi = 0, best = -Infinity;
  normals.forEach((n, k) => { const d = R * Math.asin(clamp1(dot4(p, n))); if (d > best) { best = d; fi = k; } });
  if (!(best > 0)) return { status: 'interior', bound: best };
  const n = normals[fi];
  const a = dot4(p, n);
  if (!(1 - a * a > 1e-12)) return { status: 'unresolved', reason: 'singular', bound: best, face: fi };
  const q = scale4(sub4(p, scale4(n, a)), 1 / Math.sqrt(1 - a * a));
  const over = [0, 1, 2].map((j) => Math.abs(xi(q, j)) - h[j]);
  if (over.some((o) => o > 1e-9)) {
    return { status: 'unresolved', reason: 'off-slab', bound: best, face: fi, foot: q, over };
  }
  return { status: 'exact', bound: best, face: fi, foot: q, over };
}

// Layer-2 sampled truth: per-face grid + descent, slab-filtered.
function makeSampler(space, pos, half, f, u, NT, NW) {
  const R = space.curvatureRadius;
  const c = space.decode(pos);
  const axes = axesOf(space, c, f, u);
  const xi = (p, j) => R * Math.atan2(dot4(p, axes[j]), dot4(p, c));
  const inside = (p) => [0, 1, 2].every((j) => Math.abs(xi(p, j)) <= half[j]);
  const T = Math.min(Math.PI * R - 0.01, 2 * (Math.max(...half) + 2) + 1);
  const faces = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const fc = space.step(c, scale4(axes[i], s), half[i]);
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
    faces.push({ i, s, fc, dirs });
  }
  function faceDist(fi, p) {
    const F = faces[fi];
    const at = (t, ph) => space.step(F.fc,
      add4(scale4(F.dirs[0], Math.cos(ph)), scale4(F.dirs[1], Math.sin(ph))), t);
    const keep = (q) => [0, 1, 2].every((j) => j === F.i || Math.abs(xi(q, j)) <= half[j] + 1e-9);
    // Multi-start descent (top-4 grid seeds): single-start descent traps in a
    // local basin on corner probes (observed 0.048 miss at NT=32, MUSE-42).
    const seeds = [];
    for (let a = 0; a <= NT; a++) for (let b = 0; b < NW; b++) {
      const q = at((a / NT) * T, (b / NW) * 2 * Math.PI);
      if (!keep(q)) continue;
      seeds.push({ t: (a / NT) * T, ph: (b / NW) * 2 * Math.PI, d: space.distance(p, q) });
    }
    assert.ok(seeds.length > 0, 'sampler grid empty: range too small');
    seeds.sort((x, y) => x.d - y.d);
    let bd = Infinity, bq = null;
    for (const sd of seeds.slice(0, 4)) {
      let bt = sd.t, bph = sd.ph, cd = sd.d, cq = at(bt, bph);
      let st = T / NT, sp = 2 * Math.PI / NW;
      for (;;) {
        let improved = false;
        for (const [dt, dp] of [[st, 0], [-st, 0], [0, sp], [0, -sp]]) {
          const t2 = Math.max(0, Math.min(T, bt + dt)), p2 = bph + dp;
          const q = at(t2, p2);
          if (!keep(q)) continue;
          const d = space.distance(p, q);
          if (d < cd) { cd = d; bt = t2; bph = p2; cq = q; improved = true; }
        }
        if (!improved) { st /= 2; sp /= 2; if (st < 1e-11 && sp < 1e-11) break; }
      }
      if (cd < bd) { bd = cd; bq = cq; }
    }
    return { d: bd, q: bq };
  }
  function distance(p) {
    let best = Infinity;
    for (let fi = 0; fi < 6; fi++) { const r = faceDist(fi, p); if (r.d < best) best = r.d; }
    return inside(p) ? -best : best;
  }
  return { distance };
}

// Test configurations: translated and rotated cells at three curvatures.
// R=0.5 needs a sub-hemisphere patch (extent 0.75 < pi/4) and small probes.
const TH30 = Math.PI / 6, TH45 = Math.PI / 4;
const CONFIGS = [
  { R: 8, pos: [1.2, -0.8, 0.6], half: [0.5, 0.9, 0.7], f: [Math.cos(TH30), Math.sin(TH30), 0], u: [0, 0, 1], extent: 8, vr: 1.4, tag: 'R8-rot30' },
  { R: 8, pos: [-2.0, 1.0, -0.5], half: [0.5, 0.9, 0.7], f: [0, 1, 0], u: [0, 0, 1], extent: 8, vr: 1.4, tag: 'R8-axis' },
  { R: 0.5, pos: [0.12, -0.06, 0.09], half: [0.08, 0.12, 0.10], f: [Math.cos(TH30), Math.sin(TH30), 0], u: [0, 0, 1], extent: 0.75, vr: 0.22, tag: 'R0p5-rot30', spawn: [-0.35, -0.35, -0.35] },
  { R: 10000, pos: [1.2, -0.8, 0.6], half: [0.5, 0.9, 0.7], f: [Math.cos(TH45), Math.sin(TH45), 0], u: [0, 0, 1], extent: 8, vr: 1.4, tag: 'R10000-rot45' },
];

function loadConfig(cfg) {
  const frame = (cfg.f[1] === 1 && cfg.f[0] === 0) ? null : { forward: cfg.f, up: cfg.u };
  const region = compileRegionWorld(
    cellDoc(cfg.R, cfg.pos, cfg.half, frame, cfg.extent, cfg.tag.toLowerCase(), [], cfg.spawn)).regions.get('s');
  return { ...region, cell: makeCell(region.space, cfg.pos, cfg.half, cfg.f, cfg.u) };
}

check('analytic face-height: field matches the center-local relation at R=0.5/8/10000', () => {
  for (const cfg of CONFIGS) {
    const { space, field, cell } = loadConfig(cfg);
    const rand = lcg(0x42);
    let kept = 0, exterior = 0, maxErr = 0;
    for (let k = 0; k < 25; k++) {
      const v = [(rand() * 2 - 1) * cfg.vr, (rand() * 2 - 1) * cfg.vr, (rand() * 2 - 1) * cfg.vr];
      if (Math.hypot(...v) < 1e-6) continue;
      const p = expCenter(cell.c, cell.axes, v, cfg.R);
      if (!space.withinDomain(p)) continue;
      kept++;
      // Contract position identity: p.n in center-local coordinates.
      const l = Math.hypot(...v);
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const n = cell.normals[i * 2 + (s > 0 ? 1 : 0)];
        const viaV = s * Math.cos(cfg.half[i] / cfg.R) * Math.sin(l / cfg.R) * v[i] / l
          - Math.sin(cfg.half[i] / cfg.R) * Math.cos(l / cfg.R);
        assert.ok(Math.abs(dot4(p, n) - viaV) < 1e-12, `${cfg.tag}: position identity broken`);
      }
      const analytic = cell.analytic(p), f = field.distance(p);
      if (analytic > 0) exterior++;
      maxErr = Math.max(maxErr, Math.abs(analytic - f));
      assert.ok(Math.abs(analytic - f) <= 1e-9, `${cfg.tag}: field ${f} vs analytic ${analytic}`);
    }
    assert.ok(kept >= 20, `${cfg.tag}: only ${kept} probes in domain`);
    assert.ok(exterior >= 5, `${cfg.tag}: only ${exterior} exterior probes (vacuous cover)`);
    console.log(`  ${cfg.tag}: n=${kept} exterior=${exterior} maxErr=${maxErr.toExponential(1)}`);
  }
});

check('chart distinction: scene-origin author numbers are NOT center-local v', () => {
  const cfg = CONFIGS[0]; // rotated cell: the confusion bites hardest off-axis
  const { space, field, cell } = loadConfig(cfg);
  // Author-space offset from the cell center (axis steps, NOT center-local).
  const author = [cfg.pos[0] - cfg.half[0] - 0.25, cfg.pos[1] + 0.3, cfg.pos[2] - 0.1];
  const p = space.decode(author);
  const right = cell.analytic(p);
  assert.ok(Math.abs(right - field.distance(p)) <= 1e-9, 'decoded-p prediction must match the field');
  // The scale error: feeding author numbers as center-local v.
  const pw = expCenter(cell.c, cell.axes, author, cfg.R);
  const wrong = cell.analytic(pw);
  console.log(`  field=${field.distance(p).toFixed(6)} decoded=${right.toFixed(6)} author-as-v=${wrong.toFixed(6)}`);
  assert.ok(Math.abs(wrong - field.distance(p)) > 1e-3, 'wrong-chart prediction must differ non-vacuously');
  assert.ok(Math.sign(wrong) !== Math.sign(field.distance(p)), 'this probe even flips the sign');
});

check('face-foot certificate: interior positives certify exact at three curvatures', () => {
  for (const cfg of [CONFIGS[0], CONFIGS[2], CONFIGS[3]]) {
    const { space, field, cell } = loadConfig(cfg);
    const s = cfg.R === 0.5 ? 0.16 : 1; // scale probe offsets to the cell
    const probes = [
      { v: [-(cfg.half[0] + 0.3 * s), 0.15 * s, -0.1 * s], face: 0 },
      { v: [0.1 * s, cfg.half[1] + 0.25 * s, 0.05 * s], face: 3 },
    ];
    for (const { v, face } of probes) {
      const p = expCenter(cell.c, cell.axes, v, cfg.R);
      const cert = certify(cell, p);
      assert.equal(cert.status, 'exact', `${cfg.tag} face ${face}: ${cert.reason ?? ''} ${cert.over ?? ''}`);
      assert.equal(cert.face, face, `${cfg.tag}: wrong active face`);
      const transverse = cert.over.filter((_, j) => j !== Math.floor(face / 2));
      assert.ok(transverse.every((o) => o < -1e-3), `${cfg.tag}: transverse margin vacuous`);
      const dq = space.distance(p, cert.foot);
      assert.ok(Math.abs(dq - field.distance(p)) <= 1e-9, `${cfg.tag}: foot distance must equal the field`);
      assert.ok(Math.abs(dq - cert.bound) <= 1e-9, `${cfg.tag}: R*asin identity broken`);
      const t16 = makeSampler(space, cfg.pos, cfg.half, cfg.f, cfg.u, 16, 16).distance(p);
      const t32 = makeSampler(space, cfg.pos, cfg.half, cfg.f, cfg.u, 32, 32).distance(p);
      assert.ok(Math.abs(t16 - t32) <= 1e-6, `${cfg.tag}: sampler unconverged (${t16} vs ${t32})`);
      assert.ok(Math.abs(t32 - dq) <= 1e-6, `${cfg.tag}: sampler must confirm the foot`);
      console.log(`  ${cfg.tag} face${face}: foot=${dq.toFixed(6)} sampler=${t32.toFixed(6)} margin=${Math.min(...transverse.map((o) => -o)).toFixed(3)}`);
    }
  }
});

check('certificate refusals: corner feet leave the slab, exactness NOT claimed', () => {
  const cfg = CONFIGS[0];
  const { space, field, cell } = loadConfig(cfg);
  const corners = [
    { v: [-(cfg.half[0] + 0.3), -(cfg.half[1] + 0.3), 0.1], minOver: 0.05, minGap: 0.01 },
    { v: [cfg.half[0] + 0.25, cfg.half[1] + 0.35, -0.2], minOver: 0.05, minGap: 0.01 },
  ];
  for (const { v, minOver, minGap } of corners) {
    const p = expCenter(cell.c, cell.axes, v, cfg.R);
    const cert = certify(cell, p);
    assert.equal(cert.status, 'unresolved', 'corner foot must not certify');
    assert.equal(cert.reason, 'off-slab', 'corner refusal must name containment');
    assert.ok(Math.max(...cert.over) > minOver, `refusal margin vacuous: ${cert.over}`);
    const f = field.distance(p);
    const t16 = makeSampler(space, cfg.pos, cfg.half, cfg.f, cfg.u, 16, 16).distance(p);
    const t32 = makeSampler(space, cfg.pos, cfg.half, cfg.f, cfg.u, 32, 32).distance(p);
    assert.ok(Math.abs(t16 - t32) <= 1e-6, `sampler unconverged (${t16} vs ${t32})`);
    assert.ok(t32 - f > minGap, `corner must stay conservative by a non-vacuous gap (got ${t32 - f})`);
    console.log(`  v=[${v}]: field=${f.toFixed(6)} truth=${t32.toFixed(6)} gap=${(t32 - f).toFixed(6)} over=${Math.max(...cert.over).toFixed(3)}`);
  }
  // Edge-adjacent jamb regime: foot off-slab by 0.02, twenty-thousand times
  // the 1e-9 slack, while the bound still reads the plane extension.
  {
    const p = expCenter(cell.c, cell.axes, [0.55, cfg.half[1] + 0.2, 0.05], cfg.R);
    const cert = certify(cell, p);
    assert.equal(cert.status, 'unresolved', 'edge-adjacent foot must not certify');
    console.log(`  jamb-adjacent: over=${Math.max(...cert.over).toFixed(4)} status=${cert.status}`);
  }
});

check('singular projection refuses instead of claiming', () => {
  const cfg = CONFIGS[0];
  const { cell } = loadConfig(cfg);
  // p near the active face-sphere pole: 1-a^2 ~ 1e-14. Unreachable in-patch
  // (the pole sits pi*R/2 from the face, outside every admissible patch), so
  // this exercises the refusal path, not a physical probe.
  const n = cell.normals[0];
  const m = cell.axes[1];
  const eps = 1e-7;
  const raw = n.map((x, k) => x + eps * m[k]);
  const p = scale4(raw, 1 / norm4(raw));
  const cert = certify(cell, p);
  assert.equal(cert.status, 'unresolved', 'singular foot must not certify');
  assert.equal(cert.reason, 'singular', 'refusal must name singularity');
  assert.ok(Number.isFinite(cert.bound), 'bound still reported alongside refusal');
  console.log(`  1-a^2=${(1 - dot4(p, n) ** 2).toExponential(1)} status=${cert.status} bound=${cert.bound.toFixed(4)}`);
});

check('face length changes only the clipped extent, not the supporting sphere', () => {
  const cfg = CONFIGS[1]; // axis-aligned control
  const variants = [
    { half: [0.5, 0.9, 0.7], expect: 'same' },
    { half: [0.5, 0.4, 0.3], expect: 'same' }, // transverse clipped only
    { half: [0.6, 0.9, 0.7], expect: 'moved' }, // supporting sphere re-bent
  ];
  const fields = variants.map(({ half }) => {
    const region = compileRegionWorld(cellDoc(cfg.R, cfg.pos, half, null, cfg.extent, 'flen')).regions.get('s');
    return { half, field: region.field, space: region.space };
  });
  // Probe outside the x- face interior in center-local coordinates of h0=0.5.
  const { space, cell } = loadConfig(cfg);
  const p = expCenter(cell.c, cell.axes, [-(0.5 + 0.3), 0.1, -0.05], cfg.R);
  const got = fields.map(({ field }) => field.distance(p));
  console.log(`  same-h0: ${got[0].toFixed(9)} vs ${got[1].toFixed(9)} | moved-h0: ${got[2].toFixed(6)}`);
  assert.ok(Math.abs(got[0] - got[1]) <= 1e-12, 'clipping the face must not move the field');
  assert.ok(Math.abs(got[2] - got[0]) > 0.05, 're-bending the sphere must move the field');
  void space;
});

check('counterexample: negative conservative clearance proves no collision', () => {
  // Cube corner at R=8. r=0.36 sits strictly between field and converged
  // truth, so the conservative clearance is negative while the nearest
  // occupied point is 0.065 beyond the ball: UNRESOLVED, not BLOCKED.
  const R = 8, pos = [0, 0, 1.2], half = [0.5, 0.5, 0.5], f = [0, 1, 0], u = [0, 0, 1];
  const region = compileRegionWorld(cellDoc(R, pos, half, null, 8, 'negclear')).regions.get('s');
  const { space, field } = region;
  const cell = makeCell(space, pos, half, f, u);
  const p = expCenter(cell.c, cell.axes, [-(half[0] + 0.3), -(half[1] + 0.3), 0.05], R);
  const cert = certify(cell, p);
  assert.equal(cert.status, 'unresolved', 'counterexample corner must refuse the certificate');
  const fld = field.distance(p);
  const t16 = makeSampler(space, pos, half, f, u, 16, 16).distance(p);
  const t32 = makeSampler(space, pos, half, f, u, 32, 32).distance(p);
  const t48 = makeSampler(space, pos, half, f, u, 48, 48).distance(p);
  assert.ok(Math.abs(t16 - t32) <= 1e-6, `sampler unconverged (${t16} vs ${t32})`);
  console.log(`  field=${fld.toFixed(6)} t16=${t16.toFixed(6)} t32=${t32.toFixed(6)} t48=${t48.toFixed(6)}`);
  const r = 0.36;
  const conservativeClearance = fld - r, truthClearance = t32 - r;
  console.log(`  r=${r}: conservative clearance=${conservativeClearance.toFixed(4)} truth clearance=${truthClearance.toFixed(4)}`);
  assert.ok(conservativeClearance < -0.01, 'conservative clearance must read overlap');
  assert.ok(truthClearance > 0.01, 'converged truth must read clear');
  // No witness: nothing sampled or descended-upon lies within r of p, and
  // the certificate path that could promote the bound to exact refuses.
});

check('single-cell certificate does not transfer to a carved union scene', () => {
  // Wall minus door at R=8. The wall-alone certificate fully passes on its
  // y- face (foot contained with transverse margins ~1-3), claiming exact
  // 0.2003 — but its foot lies strictly inside the door void, so it is not
  // on the union boundary and the conclusion does not transfer.
  const R = 8;
  const wallPos = [0, 1.5, 1.5], wallHalf = [3, 0.3, 1.5];
  const doorPos = [0, 1.5, 1.0], doorHalf = [0.85, 1.2, 1.3];
  const alone = compileRegionWorld(cellDoc(R, wallPos, wallHalf, null, 8, 'wallalone')).regions.get('s');
  const wallCell = makeCell(alone.space, wallPos, wallHalf, [0, 1, 0], [0, 0, 1]);
  const union = compileRegionWorld({
    format: 'nil-scene', version: 2, id: 'walldoor',
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 's', geometry: { kind: 's3', curvatureRadius: R }, topology: 'cover', extent: 8 }],
    entities: [
      { id: 'wall', regionId: 's', kind: 'geodesic-cell', position: wallPos, halfExtent: wallHalf },
      { id: 'door', regionId: 's', kind: 'geodesic-cell', position: doorPos, halfExtent: doorHalf, op: 'subtract', target: 'wall' },
      { id: 'start', regionId: 's', kind: 'spawn', position: [0, -3, 0.3] },
    ],
    connections: [],
  }).regions.get('s');
  const p = union.space.decode([0, 1.0, 1.0]); // inside the doorway void
  const cert = certify(wallCell, p);
  assert.equal(cert.status, 'exact', 'wall-alone certificate must pass for the demo to bite');
  const transverse = cert.over.filter((_, j) => j !== Math.floor(cert.face / 2));
  assert.ok(transverse.every((o) => o < -0.5), 'wall-alone foot must be deeply contained');
  // The certified foot, in author coordinates, sits strictly inside the door box.
  const footAuthor = union.space.encode(cert.foot);
  const inDoor = [0, 1, 2].every((i) => Math.abs(footAuthor[i] - doorPos[i]) < doorHalf[i] - 0.05);
  assert.ok(inDoor, `certified foot [${footAuthor.map((x) => x.toFixed(3))}] must lie in the carved void`);
  const wallAloneValue = cert.bound;
  const unionField = union.field.distance(p);
  console.log(`  wall-alone certified=${wallAloneValue.toFixed(6)} union field=${unionField.toFixed(6)} foot=[${footAuthor.map((x) => x.toFixed(3))}]`);
  assert.ok(Math.abs(wallAloneValue - 0.2003) < 0.005, 'wall-alone claim pins to the plane height');
  assert.ok(unionField - wallAloneValue > 0.25, 'union scene contradicts the transferred value');
});

check('fail-demo (isolated): a flipped-sign normal cannot certify', () => {
  // Sign error injected HERE, in a local copy of the normal — the engine is
  // untouched. With s -> -s, the active face reads interior (a<0) and the
  // certificate refuses; it cannot reproduce the field value it should match.
  const cfg = CONFIGS[0];
  const { field, cell } = loadConfig(cfg);
  const p = expCenter(cell.c, cell.axes, [-(cfg.half[0] + 0.3), 0.15, -0.1], cfg.R);
  const good = certify(cell, p);
  assert.equal(good.status, 'exact', 'control must certify');
  const flipped = { ...cell, normals: cell.normals.map((n, k) => (k === good.face ? scale4(n, -1) : n)) };
  const bad = certify(flipped, p);
  assert.notEqual(bad.status, 'exact', 'flipped-sign normal must not certify');
  console.log(`  control=${good.status}(${good.bound.toFixed(4)}) flipped=${bad.status}(${bad.reason ?? 'interior'}) field=${field.distance(p).toFixed(4)}`);
});

console.log(`\ncurved-clearance-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);

