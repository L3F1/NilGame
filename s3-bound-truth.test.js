// MUSE-40: the S3 bound collapse — curvature cost, or a defect?
//
// MUSE-38 walked wall-0.35 into 2778 curved steps vs 36 flat, bound ~4e-4
// where the flat control proves 0.1. MUSE-34 measured the cell shortfall as
// a FRACTION (0.29 edge, 0.36-0.42 corner, identical at R = 2/8/10000). A
// fractional shortfall cannot make a 250x collapse. This file evaluates the
// FIELD directly, away from any walk, on a grid through the open hallway,
// against an independent truth rebuilt the way MUSE-34's was — and names
// the winning term at the collapse.
//
// REFERENCE (rebuildable). The cell is the intersection of three slabs;
// slab j is |xi_j| <= h_j with xi_j(p) = R*atan2(p.a_j, p.c) from the decoded
// center along lifted construction axes. Faces are great spheres through
// face-centers (stepped arclength h along the lifted axis), sampled on a
// (t,phi) grid with an aimed log-map seed plus descent from the best seeds,
// slab-filtered; the minimum over faces is the unsigned distance, sign from
// the slab test. Shared substrate is decode/step/distance/transport/frame/
// logAt/project only; the asin(dot) plane-max under test is never invoked.
// Floor: exact single-great-sphere hand form (no max involved), as MUSE-34.
// Ball: geodesic metric minus radius (shared metric substrate).
// Far cells (wall/left/back/door, all 0.7+ flat away) are excluded by margin:
// flat author gap minus truth must exceed 0.3, else the sample is rejected
// loud, never silently blended.
//
// WINNER IDENTIFICATION (diagnosis, not reference). Plane-extension
// distances from a separately derived normal, n = s*cos(h/R)*axis -
// sin(h/R)*center (check: n annihilates the stepped face-center, so the
// great sphere through the face has exactly this normal — same math the
// field must use, derived here, not read). Matching field.distance against
// per-face extensions AND slab-clipped face distances tells whether the
// winner is the genuinely nearest face or a far plane's extension passing
// through open hallway.
import assert from 'node:assert/strict';
import { compileRegionWorld } from './engine/world/region-world.js';
import { sweep } from './engine/world/collision.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scale4 = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
const norm4 = (a) => Math.hypot(a[0], a[1], a[2], a[3]);
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp1 = (x) => Math.max(-1, Math.min(1, x));

function refCell(space, ent) {
  const R = space.curvatureRadius;
  const c = space.decode(ent.position);
  const h = ent.halfExtent.slice();
  const base = space.frame(c);
  const f = ent.frame?.forward.slice() || [0, 1, 0];
  const u = ent.frame?.up.slice() || [0, 0, 1];
  const lift = (v) => base[0].map((_, i) => base.reduce((s, ax, j) => s + ax[i] * v[j], 0));
  const axes = [lift(cross3(f, u)), lift(f), lift(u)];
  const xi = (p, j) => R * Math.atan2(dot4(p, axes[j]), dot4(p, c));
  const inside = (p) => [0, 1, 2].every((j) => Math.abs(xi(p, j)) <= h[j]);
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
      faces.push({ i, s, fc, dirs });
    }
  }
  let probeReach = Math.max(...h) + 2;
  const faceDist = (fi, p) => {
    const F = faces[fi];
    const NT = 20, NW = 20;
    const T = Math.min(Math.PI * R - 0.01, 2 * (probeReach + Math.max(...h)) + 1);
    const at = (t, ph) => {
      const w = add4(scale4(F.dirs[0], Math.cos(ph)), scale4(F.dirs[1], Math.sin(ph)));
      return space.step(F.fc, w, t);
    };
    const keep = (q) => [0, 1, 2].every((j) => j === F.i || Math.abs(xi(q, j)) <= h[j] + 1e-9);
    const seeds = [];
    for (let a = 0; a <= NT; a++) {
      for (let b = 0; b < NW; b++) {
        const t = (a / NT) * T, ph = (b / NW) * 2 * Math.PI;
        const q = at(t, ph);
        if (keep(q)) seeds.push({ t, ph, d: space.distance(p, q) });
      }
    }
    {
      const v = space.logAt(F.fc, p);
      const m = space.transport(c, F.fc, scale4(axes[F.i], F.s));
      const wv = space.project(F.fc, v, m), wl = norm4(wv);
      if (wl > 1e-9) {
        const wu = scale4(wv, 1 / wl);
        const t = Math.min(T, wl), ph = Math.atan2(dot4(wu, F.dirs[1]), dot4(wu, F.dirs[0]));
        const q = at(t, ph);
        if (keep(q)) seeds.push({ t, ph, d: space.distance(p, q) });
      }
    }
    seeds.sort((x, y) => x.d - y.d);
    let best = Infinity, bestQ = null, inRange = true;
    for (const sd of seeds.slice(0, 4)) {
      let { t, ph } = sd, bd = sd.d, bq = at(t, ph);
      let st = T / NT, sp = (2 * Math.PI) / NW;
      for (;;) {
        let improved = false;
        for (const [dt, dp] of [[st, 0], [-st, 0], [0, sp], [0, -sp]]) {
          const t2 = Math.max(0, Math.min(T, t + dt)), p2 = ph + dp;
          const q = at(t2, p2);
          if (!keep(q)) continue;
          const d = space.distance(p, q);
          if (d < bd) { bd = d; t = t2; ph = p2; bq = q; improved = true; }
        }
        if (!improved) { st /= 2; sp /= 2; if (st < 1e-10 && sp < 1e-10) break; }
      }
      if (bd < best) { best = bd; bestQ = bq; inRange = t < 0.95 * T; }
    }
    return { d: best, q: bestQ, ok: inRange && seeds.length > 0 };
  };
  function distance(p) {
    let best = Infinity;
    for (let fi = 0; fi < 6; fi++) {
      const r = faceDist(fi, p);
      assert.ok(r.ok, 'face sampling range too small');
      if (r.d < best) best = r.d;
    }
    return inside(p) ? -best : best;
  }
  function faceDists(p) {
    return faces.map((F, fi) => ({ i: F.i, s: F.s, ...faceDist(fi, p) }));
  }
  // Strict interiority of a foot in face F's slab (margin): with it, no
  // edge/corner point can beat this face (Pythagoras), so the face minimum
  // IS the exact cell distance. Fails loud if ever violated.
  function strictIn(F, q, margin = 1e-4) {
    return [0, 1, 2].every((j) => j === F.i || Math.abs(xi(q, j)) <= h[j] - margin);
  }
  return {
    R, c, h, axes, xi, inside, faces, distance, faceDists, strictIn, space,
    // Plane-extension normal for face (i,s), derived (see header).
    planeNormal: (i, s) => axes[i].map((a, k) => s * Math.cos(h[i] / R) * a - Math.sin(h[i] / R) * c[k]),
  };
}

function floorRef(space, floorEnt) {
  const R = space.curvatureRadius;
  const anchor = space.decode(floorEnt.position);
  const base = space.frame(anchor);
  const n = base[0].map((_, i) => base.reduce((s, ax, j) => s + ax[i] * floorEnt.up[j], 0));
  return (p) => R * Math.asin(clamp1(dot4(p, n)));
}

// Flat author-space box gap (lower-excludes far pieces, never a distance).
function flatGap(ent, q) {
  const c = ent.position, h = ent.halfExtent || [0, 0, 0];
  const d = [0, 1, 2].map((i) => Math.abs(q[i] - c[i]) - (h[i] || 0));
  return Math.hypot(...d.map((x) => Math.max(x, 0)));
}

function loadRoom(R) {
  const doc = JSON.parse(readFileSync(new URL('./levels/fixtures/s3-room.nil.json', import.meta.url), 'utf8'));
  doc.regions[0].geometry.curvatureRadius = R;
  const region = compileRegionWorld(doc).regions.get('sphere');
  return { doc, ...region };
}

// Author-box membership of a 4-vector foot (via encode), strict by margin.
function boxStrict(space, box, q, wantInside, margin = 1e-7) {
  const a = space.encode(q);
  const inside = [0, 1, 2].every((i) => Math.abs(a[i] - box.c[i]) <= box.h[i] - margin);
  const outside = [0, 1, 2].some((i) => Math.abs(a[i] - box.c[i]) >= box.h[i] + margin);
  return wantInside ? inside : outside;
}

// One hallway sample: field bound, independent truth, named winner.
// Truth is the min over MATERIAL pieces: s-right faces (unmodified solid),
// s-wall faces whose foot lies outside the door box, s-door faces whose
// foot lies inside the wall box, ball, floor. Every kept argmin foot must
// be strictly interior (slab and box); violations fail loud.
function sampleOne(ctx, author) {
  const { space, field, rightRef, wallRef, doorRef, wallBox, doorBox, ball, floorD, farEnts } = ctx;
  const p = space.decode(author);
  const f = field.distance(p);
  const pieces = [];
  for (const fd of rightRef.faceDists(p)) {
    pieces.push({ tag: `R${['x', 'y', 'z'][fd.i]}${fd.s > 0 ? '+' : '-'}`, d: fd.d, ext: true, ref: rightRef, fi: fd.i, s: fd.s, q: fd.q });
  }
  for (const fd of wallRef.faceDists(p)) {
    if (!boxStrict(space, doorBox, fd.q, false)) continue; // carved away: immaterial
    pieces.push({ tag: `W${['x', 'y', 'z'][fd.i]}${fd.s > 0 ? '+' : '-'}`, d: fd.d, ext: true, ref: wallRef, fi: fd.i, s: fd.s, q: fd.q });
  }
  for (const fd of doorRef.faceDists(p)) {
    if (!boxStrict(space, wallBox, fd.q, true)) continue; // borders void: immaterial
    pieces.push({ tag: `D${['x', 'y', 'z'][fd.i]}${fd.s > 0 ? '+' : '-'}`, d: fd.d, ext: true, ref: doorRef, fi: fd.i, s: fd.s, q: fd.q });
  }
  assert.ok(pieces.some((x) => x.tag[0] === 'W'), `wall fully carved at [${author}]?!`);
  const dBall = space.distance(p, ball.c) - ball.r;
  const dFloor = floorD(p);
  pieces.push({ tag: 'ball', d: dBall }, { tag: 'floor', d: dFloor });
  // Exactness: the argmin foot must be strictly interior (face pieces) —
  // then no edge/corner point can beat it (Pythagoras). Ball/floor need no
  // slab. Fails loud if an edge ever wins on this grid.
  const arg0 = pieces.reduce((a, b) => (b.d < a.d ? b : a));
  if (arg0.ext) {
    const F = arg0.ref.faces[arg0.fi * 2 + (arg0.s > 0 ? 1 : 0)];
    assert.ok(arg0.ref.strictIn(F, arg0.q), `argmin foot off-slab at [${author}]: ${arg0.tag}`);
  }
  const truth = Math.min(...pieces.map((x) => x.d));
  for (const e of farEnts) {
    const g = flatGap(e, author);
    assert.ok(g > truth + 0.15, `far piece ${e.id} too close (gap ${g.toFixed(3)} vs truth ${truth.toFixed(3)})`);
  }
  // Winner: match the field against each candidate term (clip + extension).
  const R = space.curvatureRadius;
  let winner = null, werr = Infinity;
  for (const x of pieces) {
    if (x.ext) {
      const n = x.ref.planeNormal(x.fi, x.s);
      const ext = R * Math.asin(clamp1(dot4(p, n)));
      const e = Math.abs(ext - f);
      if (e < werr) { werr = e; winner = `${x.tag}:ext`; }
    }
    const e = Math.abs(x.d - f);
    if (e < werr) { werr = e; winner = `${x.tag}:clip`; }
  }
  const argmin = pieces.reduce((a, b) => (b.d < a.d ? b : a));
  return { author, f, truth, ratio: f / Math.max(truth, 1e-12), winner, werr, argmin: argmin.tag };
}

function roomCtx(R) {
  const { doc, space, field } = loadRoom(R);
  const ent = (id) => doc.entities.find((e) => e.id === id);
  const boxOf = (e) => ({ c: e.position.slice(), h: e.halfExtent.slice() });
  const ballEnt = ent('s-ball');
  return {
    space, field, R,
    rightRef: refCell(space, ent('s-right')),
    wallRef: refCell(space, ent('s-wall')),
    doorRef: refCell(space, ent('s-door')),
    wallBox: boxOf(ent('s-wall')), doorBox: boxOf(ent('s-door')),
    ball: { c: space.decode(ballEnt.position), r: ballEnt.radius },
    floorD: floorRef(space, ent('s-floor')),
    farEnts: ['s-left', 's-back'].map(ent),
  };
}

check('hallway grid: bound/truth ratio field at R=8 and R=10000', () => {
  for (const R of [8, 10000]) {
    const ctx = roomCtx(R);
    console.log(`  R=${R} x(clear) : minRatio  p10  | collapse samples (ratio<0.5)`);
    for (const x of [2.1, 2.6, 2.7, 2.85, 3.0]) {
      const rows = [];
      for (let yi = 0; yi <= 23; yi++) {
        const y = -3 + yi * 0.15;
        for (const z of [0.5, 0.9, 1.3]) {
          rows.push(sampleOne(ctx, [x, Math.min(y, 0.5), z]));
        }
      }
      for (const r of rows) {
        assert.ok(r.f <= r.truth + 1e-9, `R=${R} x=${x} [${r.author}]: field ${r.f} over-reports truth ${r.truth}`);
      }
      const ratios = rows.map((r) => r.ratio).sort((a, b) => a - b);
      const bad = rows.filter((r) => r.ratio < 0.5);
      console.log(`    x=${x.toFixed(2)} (${(3.2 - x).toFixed(2)}): min ${ratios[0].toFixed(4)} p10 ${ratios[Math.floor(ratios.length * 0.1)].toFixed(3)} n=${rows.length} nbad=${bad.length}`);
      for (const b of bad.slice(0, 3)) {
        console.log(`      [${b.author.map((v) => v.toFixed(2)).join(',')}]: f=${b.f.toExponential(2)} truth=${b.truth.toFixed(4)} winner=${b.winner} werr=${b.werr.toExponential(1)} truemin=${b.argmin}`);
      }
    }
  }
});

// No SceneControls harness exists anywhere in the repo (searched
// tools/docs/engine/app); "reconstructions" here means committed minimal
// scenes isolating one variable each, with bound/truth numbers.
function singleCellDoc() {
  return {
    format: 'nil-scene', version: 2, id: 'peelcell',
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'sphere', geometry: { kind: 's3', curvatureRadius: 8 }, topology: 'cover', extent: 8, floorId: 's-floor' }],
    entities: [
      { id: 'cell', regionId: 'sphere', kind: 'geodesic-cell', position: [3.4, 0, 1.5], halfExtent: [0.2, 3.6, 1.5] },
      { id: 's-floor', regionId: 'sphere', kind: 'plane', position: [0, 0, -7.99], up: [0, 0, 1] },
      { id: 'start', regionId: 'sphere', kind: 'spawn', position: [0, -4.5, 0.9] },
    ],
    connections: [],
  };
}

check('reconstructions: the peel isolated in four committed scenes', () => {
  // R1: single cell alone at R=8. No room, no ball, no carve: if the facing
  // plane still reads 0.20 three units along-face, the room is innocent.
  {
    const region = compileRegionWorld(singleCellDoc()).regions.get('sphere');
    const { space, field } = region;
    const ref = refCell(space, { position: [3.4, 0, 1.5], halfExtent: [0.2, 3.6, 1.5] });
    const p = space.decode([2.85, -3, 0.9]);
    const f = field.distance(p), t = ref.distance(p);
    console.log(`  R1 single cell: field=${f.toFixed(4)} truth=${t.toFixed(4)} (author gap 0.35)`);
    assert.ok(Math.abs(f - t) <= 1e-9, 'R1: field exact vs slab truth');
    assert.ok(Math.abs(f - 0.20) < 0.02, `R1: peel present without the room, got ${f}`);
  }
  // R2: full room, same point (MUSE-38 burn point): identical numbers mean
  // composition contributes nothing.
  {
    const { space, field } = loadRoom(8);
    const ref = refCell(space, { position: [3.4, 0, 1.5], halfExtent: [0.2, 3.6, 1.5] });
    const p = space.decode([2.85, -3, 0.9]);
    const f = field.distance(p), t = ref.distance(p);
    console.log(`  R2 full room:   field=${f.toFixed(4)} truth=${t.toFixed(4)}`);
    assert.ok(Math.abs(f - t) <= 1e-9, 'R2: field exact vs slab truth');
    assert.ok(Math.abs(f - 0.20) < 0.02, `R2: same peel with the room, got ${f}`);
  }
  // R3: full room at R=10000: no peel when flat (curvature separation).
  {
    const { space, field } = loadRoom(10000);
    const p = space.decode([2.85, -3, 0.9]);
    const f = field.distance(p);
    console.log(`  R3 flat room:   field=${f.toFixed(4)} (author gap 0.35)`);
    assert.ok(Math.abs(f - 0.35) < 0.01, `R3: no peel when flat, got ${f}`);
  }
  // R4: near the face center at R=8: no peel where the sphere meets its
  // tangent plane (peel profile endpoint).
  {
    const { space, field } = loadRoom(8);
    const p = space.decode([2.85, 0, 0.9]);
    const f = field.distance(p);
    console.log(`  R4 face center: field=${f.toFixed(4)} (author gap 0.35)`);
    assert.ok(Math.abs(f - 0.35) < 0.01, `R4: exact at face center, got ${f}`);
  }
});

check('walk-truth loop: the walker is genuinely in contact (slab truth)', () => {
  // Re-walk MUSE-38's wall-0.35 with slab truth on every 10th leg. If the
  // field were under-reporting, truth-clearance would stay positive while
  // the solver churned. If the slab itself is that close, truth-clearance
  // goes negative and the churn is contact regime, not a bound defect.
  for (const R of [8, 10000]) {
    const ctx = roomCtx(R);
    const { space, field } = ctx;
    const start = space.decode([2.85, -3, 0.9]), end = space.decode([2.85, 0.5, 0.9]);
    const aim = space.normalize(start, space.logAt(start, end));
    const legs = [];
    const res = sweep(field, space, {
      from: start, direction: aim, distance: space.distance(start, end), radius: 0.25,
      maxSteps: 32768,
      events: ({ position, distance }) => { legs.push({ at: [...position], adv: distance }); return null; },
    });
    let minClear = Infinity, maxDrift = 0;
    legs.forEach((l, k) => {
      const enc = space.encode(l.at);
      maxDrift = Math.max(maxDrift, Math.abs(enc[0] - 2.85));
      if (k % 10 !== 0) return;
      const r = sampleOne(ctx, enc);
      minClear = Math.min(minClear, r.truth - 0.25);
    });
    console.log(`  R=${R}: steps=${res.steps} hit=${res.hit} maxDrift=${maxDrift.toFixed(4)} minTruthClear=${minClear.toFixed(4)}`);
    if (R === 8) {
      assert.ok(minClear < 0, `R=8: slab truth must go negative (got ${minClear}) — else the churn is unexplained`);
    } else {
      assert.ok(minClear > 0.05, `R=10000: slab truth stays clear (got ${minClear})`);
    }
  }
});

console.log(`\ns3-bound-truth: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
