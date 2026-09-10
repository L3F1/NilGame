// MUSE-37: the carve predicate, past the box cutter.
//
// The rule under test (docs/rendering-contract.md): a walk passes iff,
// everywhere the target is within r of the path, the cutter's boundary is
// farther than r from the path. The lead checked it as a predicate against
// the solver over 372 configurations — all BOX cutter, straight path, E3.
// This file takes it past that: ball cutters, plane targets, oriented
// cutters, geodesic-cell cutters in S3 on a geodesic path, and targets
// carved by SEVERAL cutters at once.
//
// PREDICATE (test-local, implemented below, no engine predicate exists).
// Sample the walk path densely. Single cutter: BLOCK iff some sample has
//   dTarget <= r AND dCutterBoundary <= r, else PASS.
// Several cutters: the field is max(d, -m1, -m2, ...), so EVERY cutter grows
// a phantom surface. The predicate becomes: BLOCK iff some sample has
//   dTarget <= r AND min_i(dCutter_i boundary) <= r,
// i.e. a walk passes iff, everywhere the target is within r, ALL cutter
// boundaries are farther than r. Stated before sweeping; the two-cutter
// fail-demo shows the min-form is load-bearing.
// Distances in E3 are exact closed forms (box/ball/plane SDFs, oriented
// frames included). In S3 both sides are sampled cell boundaries refined by
// coordinate descent under sp.distance — stated resolution, no exact truth
// claimed there.
//
// DIRECTION MATTERS MORE THAN RATE. Four buckets, never one accuracy:
//   agree-pass / agree-block (legit vs phantom split by exact-field margin),
//   REJECT-then-work (predicate blocks, sweep passes: costs an author a room),
//   ACCEPT-then-fail (predicate passes, sweep halts phantom: player stops).
// ACCEPT-then-legit-halt (predicate passes, probe truly cannot fit) is a
// fifth bucket for the shape the rule never promised.
import assert from 'node:assert/strict';
import { validateScene } from './engine/world/document.js';
import { compileSceneField } from './engine/world/scene-field.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { e3Space, sweep } from './engine/world/collision.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// --- tiny vector kit + exact SDFs (test-local) -------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a) => Math.hypot(a[0], a[1], a[2]);
const stdAxes = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const frameAxes = (fwd, up) => [cross(fwd, up), fwd.slice(), up.slice()];
const sdfBox = (c, h, axes, p) => {
  const q = axes.map((a, i) => Math.abs(dot(a, sub(p, c))) - h[i]);
  return Math.hypot(...q.map((x) => Math.max(x, 0))) + Math.min(Math.max(...q), 0);
};
const sdfBall = (c, r, p) => vnorm(sub(p, c)) - r;
const sdfPlane = (n, off, p) => dot(p, n) - off;

// Per-face distance to a (possibly oriented) box boundary, for binding-face
// characterisation. Returns {face: 'axis:side', d}.
function boxFaces(c, h, axes, p) {
  const q = axes.map((a) => dot(a, sub(p, c)));
  let best = { face: null, d: Infinity };
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const over = [0, 1, 2].filter((j) => j !== i)
        .map((j) => Math.max(0, Math.abs(q[j]) - h[j]));
      const d = Math.hypot(q[i] - s * h[i], ...over);
      if (d < best.d) best = { face: `${'xyz'[i]}:${s > 0 ? '+' : '-'}`, d };
    }
  }
  return best;
}

// --- E3 scene builders --------------------------------------------------------
// Each returns {doc, start, dir, dist, target: {sdf}, cutters: [{sdf, bind(p)}]}.
// bind(p) reports the binding face for characterisation.
const SPAWN = { id: 's', regionId: 'r', kind: 'spawn', position: [0, -8, 0.3] };
const REGIONS = [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }];
function docOf(id, entities) {
  return {
    format: 'nil-scene', version: 2, id,
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: REGIONS, entities: [...entities, SPAWN], connections: [],
  };
}
const boxCut = (c, h, axes) => ({
  sdf: (q) => sdfBox(c, h, axes, q),
  bind: (p) => `box(${boxFaces(c, h, axes, p).face})`,
  box: { cc: c, hh: h, axes },
});
const ballCut = (c, r) => ({
  sdf: (q) => sdfBall(c, r, q), bind: () => 'ball-surface', ball: { cc: c, rr: r },
});
const boxTarget = (c, h, axes) => ({ sdf: (q) => sdfBox(c, h, axes, q), box: { cc: c, hh: h, axes } });
const planeTarget = (n, off) => ({ sdf: (q) => sdfPlane(n, off, q), plane: { n, off } });

function doorwayBox({ wallHalfY = 0.3, cutHalfX = 0.85, overhang = 0.5, angle = 0, tilt = 0 }) {
  const wallC = [0, 1.5, 1.5], wallH = [3, wallHalfY, 1.5];
  const mouth = (1.5 - wallHalfY) - overhang;
  const cutH = [cutHalfX, wallHalfY + overhang + 0.5, 1.3];
  const tiltRad = (tilt * Math.PI) / 180;
  const depth = cutH[1] * Math.cos(tiltRad) + cutH[0] * Math.sin(tiltRad);
  const cutC = [0, mouth + depth, 1];
  const fwd = [-Math.sin(tiltRad), Math.cos(tiltRad), 0];
  const axes = tilt ? frameAxes(fwd, [0, 0, 1]) : stdAxes();
  const dir = [Math.sin(angle), Math.cos(angle), 0];
  const start = add([0, 1.5, 1], scale(dir, -4.5));
  const entities = [
    { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
    Object.assign(
      { id: 'cut', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: cutC, halfExtent: cutH },
      tilt ? { frame: { forward: fwd, up: [0, 0, 1] } } : {},
    ),
  ];
  return {
    doc: docOf('doorway-box', entities), start, dir, dist: 9,
    target: boxTarget(wallC, wallH, stdAxes()),
    cutters: [boxCut(cutC, cutH, axes)],
  };
}

function doorwayBall({ wallHalfY = 0.3, overhang = 0.5, angle = 0 }) {
  const wallC = [0, 1.5, 1.5], wallH = [3, wallHalfY, 1.5];
  const rc = wallHalfY + overhang, ballC = [0, 1.5, 1];
  const dir = [Math.sin(angle), Math.cos(angle), 0];
  const start = add([0, 1.5, 1], scale(dir, -4.5));
  return {
    doc: docOf('doorway-ball', [
      { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
      { id: 'cut', regionId: 'r', kind: 'ball', op: 'subtract', target: 'wall', position: ballC, radius: rc },
    ]),
    start, dir, dist: 9,
    target: boxTarget(wallC, wallH, stdAxes()),
    cutters: [ballCut(ballC, rc)],
  };
}

function notchPlane({ overhang = 0.5, depth = 2 }) {
  const n = [0, -1, 0], off = -1.5;
  const mouth = 1.5 - overhang;
  const cutC = [0, mouth + depth / 2, 1], cutH = [0.85, depth / 2, 1.3];
  return {
    doc: docOf('notch-plane', [
      { id: 'wall', regionId: 'r', kind: 'plane', position: [0, 1.5, 0], up: [0, -1, 0] },
      { id: 'cut', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: cutC, halfExtent: cutH },
    ]),
    start: [0, -3, 1], dir: [0, 1, 0], dist: 8,
    target: planeTarget(n, off),
    cutters: [boxCut(cutC, cutH, stdAxes())],
  };
}

// One wall, TWO adjacent box-cutter doorways; the walk takes the left one.
function doubleDoor({ overhang = 0.5, gap = 2.2 }) {
  const wallC = [0, 1.5, 1.5], wallH = [4, 0.3, 1.5];
  const mk = (x) => {
    const mouth = 1.2 - overhang;
    const cutH = [0.85, 0.3 + overhang + 0.5, 1.3];
    return { c: [x, mouth + cutH[1], 1], h: cutH };
  };
  const L = mk(-gap / 2), R = mk(gap / 2);
  return {
    doc: docOf('double-door', [
      { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
      { id: 'cutl', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: L.c, halfExtent: L.h },
      { id: 'cutr', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: R.c, halfExtent: R.h },
    ]),
    start: [-gap / 2, -3, 1], dir: [0, 1, 0], dist: 9,
    target: boxTarget(wallC, wallH, stdAxes()),
    cutters: [boxCut(L.c, L.h, stdAxes()), boxCut(R.c, R.h, stdAxes())],
  };
}

// --- the predicate ------------------------------------------------------------
// BLOCK iff some path sample has dTarget <= r AND the nearest cutter
// boundary <= r. Returns the first blocking sample and the binding cutter
// face there, plus the tightest margin over the whole within-r stretch
// (negative = blocked; |margin| <= 1e-9 counts as a tie, reported.tied).
const PSTEP = 0.005;
const atT = (scene, t) => add(scene.start, scale(scene.dir, t));
function cutterDist(scene, p) {
  let dC = Infinity, who = -1;
  scene.cutters.forEach((c, i) => {
    const d = Math.abs(c.sdf(p));
    if (d < dC) { dC = d; who = i; }
  });
  return { dC, who };
}
function predicate(scene, r) {
  const n = Math.max(1, Math.ceil(scene.dist / PSTEP));
  let firstBlock = null, margin = Infinity, marginAt = null, kBest = -1;
  for (let k = 0; k <= n; k++) {
    const p = atT(scene, (k / n) * scene.dist);
    const dT = scene.target.sdf(p);
    if (dT > r) continue;
    const { dC, who } = cutterDist(scene, p);
    const m = dC - r;
    if (m < margin) { margin = m; marginAt = p; kBest = k; }
    if (dC <= r && !firstBlock) {
      firstBlock = { p, dT, dC, cutter: who, face: scene.cutters[who].bind(p) };
    }
  }
  // Refine the margin by golden section on the CONTINUOUS cutter distance
  // around the best sample. Sampling luck then decides nothing: ties are
  // exact (|margin| <= 1e-9) and near-tie verdicts are earned.
  if (kBest >= 0) {
    const tB = (kBest / n) * scene.dist;
    let lo = Math.max(0, tB - PSTEP), hi = Math.min(scene.dist, tB + PSTEP);
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
    const f = (t) => cutterDist(scene, atT(scene, t)).dC;
    for (let i = 0; i < 80; i++) {
      if (f(c) < f(d)) hi = d; else lo = c;
      c = hi - gr * (hi - lo); d = lo + gr * (hi - lo);
    }
    let tR = (lo + hi) / 2;
    // The continuous minimum can sit AT the stretch boundary while golden
    // section converges just outside it (dT+dC is complementary near a mouth
    // dip). Then the honest margin is the boundary limit from inside: bisect
    // dT = r between the out-of-stretch endpoint and the in-stretch sample.
    if (scene.target.sdf(atT(scene, tR)) > r) {
      let a = tR, b = (kBest / n) * scene.dist;
      for (let i = 0; i < 60; i++) {
        const m = (a + b) / 2;
        if (scene.target.sdf(atT(scene, m)) > r) a = m; else b = m;
      }
      tR = b;
    }
    const pR = atT(scene, tR);
    if (scene.target.sdf(pR) <= r) {
      const { dC, who } = cutterDist(scene, pR);
      margin = dC - r; marginAt = pR;
      if (dC <= r) firstBlock = { p: pR, dT: scene.target.sdf(pR), dC, cutter: who, face: scene.cutters[who].bind(pR) };
      else firstBlock = null;
    }
  }
  return {
    verdict: firstBlock ? 'block' : 'pass',
    firstBlock, margin, marginAt,
    tied: Math.abs(margin) <= 1e-9,
    stretch: margin !== Infinity,
  };
}

const space = e3Space();
const PHANTOM_TOL = 1e-3; // halt with more true room than this: phantom stop

// --- material truth (test-local, independent of the field) --------------------
// True clearance = min distance to a MATERIAL boundary sample: target faces
// outside every cutter, cutter faces/surfaces inside the target. Faces are
// seeded on a grid and refined by coordinate descent to <1e-9; membership
// uses exact SDF signs at 1e-7 margins (dust cannot flip them: halts sit
// >=1e-4 from any surface). Unsigned: halts are outside the material.
const TGRID = 40, TOL_MEM = 1e-7;

// Seeds grouped by face: best seed per face, then ONE descent per face.
function boxFaceSeeds(c, h, axes, keep) {
  const at = (i, s, u, v) => {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const q = [0, 0, 0];
    q[i] = s * h[i]; q[j] = u; q[k] = v;
    return add(c, [0, 1, 2].map((a) => axes.reduce((sum, ax, b) => sum + ax[a] * q[b], 0)));
  };
  const faces = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const s of [-1, 1]) {
      faces.push({
        face: `${'xyz'[i]}:${s > 0 ? '+' : '-'}`, i, s, at,
        hj: h[j], hk: h[k], n: scale(axes[i], s), seeds: [],
      });
    }
  }
  for (const F of faces) {
    for (let a = -TGRID; a <= TGRID; a++) for (let b = -TGRID; b <= TGRID; b++) {
      const u = (a / TGRID) * F.hj, v = (b / TGRID) * F.hk;
      const q = F.at(F.i, F.s, u, v);
      if (keep(q, F.n)) F.seeds.push({ u, v, q });
    }
  }
  return faces;
}
// Descend (u,v) on one face from its best seed; coordinate descent to 1e-10.
function descendFace(F, p, keep) {
  let bu = 0, bv = 0, bd = Infinity;
  for (const s of F.seeds) {
    const d = vnorm(sub(p, s.q));
    if (d < bd) { bd = d; bu = s.u; bv = s.v; }
  }
  if (!F.seeds.length) return { d: Infinity };
  let step = Math.max(F.hj, F.hk) / TGRID;
  for (;;) {
    let improved = false;
    for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const u = Math.max(-F.hj, Math.min(F.hj, bu + du));
      const v = Math.max(-F.hk, Math.min(F.hk, bv + dv));
      const q = F.at(F.i, F.s, u, v);
      if (!keep(q, F.n)) continue;
      const d = vnorm(sub(p, q));
      if (d < bd) { bd = d; bu = u; bv = v; improved = true; }
    }
    if (!improved) { step /= 2; if (step < 1e-10) break; }
  }
  return { d: bd };
}
function truthClearance(scene, p) {
  // Nearest MATERIAL sample, refined: target faces outside every cutter,
  // cutter faces inside the target. Plane target is closed-form.
  let best = { d: Infinity, face: null };
  const consider = (d, face) => { if (d < best.d) best = { d, face }; };
  const tSdf = scene.target.sdf;
  // Target box faces outside ALL cutters.
  if (scene.target.box) {
    const { cc, hh, axes } = scene.target.box;
    const keep = (q) => scene.cutters.every((c) => c.sdf(q) >= TOL_MEM);
    for (const F of boxFaceSeeds(cc, hh, axes, keep)) {
      if (!F.seeds.length) continue;
      consider(descendFace(F, p, keep).d, `target:box(${F.face})`);
    }
  }
  // Plane target: closed form, admitted only where outside every cutter.
  if (scene.target.plane) {
    const { n, off } = scene.target.plane;
    const nn = vnorm(n), unit = scale(n, 1 / nn);
    const foot = add(p, scale(unit, -(dot(p, unit) - off / nn)));
    if (scene.cutters.every((c) => c.sdf(foot) >= TOL_MEM)) {
      consider(vnorm(sub(p, foot)), 'target:plane');
    }
  }
  for (const c of scene.cutters) {
    if (c.ball) {
      const { cc, rr } = c.ball;
      const keep = (q, w) => tSdf(add(q, scale(w, 1e-6))) <= -TOL_MEM;
      const N = 3000;
      let bw = null, bd = Infinity;
      for (let n = 0; n < N; n++) {
        const y = 1 - (2 * (n + 0.5)) / N;
        const rad = Math.sqrt(Math.max(0, 1 - y * y)), th = n * 2.399963229728653;
        const w = [rad * Math.cos(th), rad * Math.sin(th), y];
        const q = add(cc, scale(w, rr));
        if (!keep(q, w)) continue;
        const d = vnorm(sub(p, q));
        if (d < bd) { bd = d; bw = w; }
      }
      if (bw) {
        let w = bw, step = 0.05;
        const rot = (w2, e, a) => {
          const cq = Math.cos(a), sq = Math.sin(a);
          const r2 = [w2[0] * cq + e[0] * sq, w2[1] * cq + e[1] * sq, w2[2] * cq + e[2] * sq];
          const l = vnorm(r2);
          return [r2[0] / l, r2[1] / l, r2[2] / l];
        };
        for (;;) {
          let improved = false;
          const e0 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
          for (const t of [cross(w, e0), cross(w, cross(w, e0))]) {
            const l = vnorm(t);
            const e = [t[0] / l, t[1] / l, t[2] / l];
            for (const a of [step, -step]) {
              const w2 = rot(w, e, a), q = add(cc, scale(w2, rr));
              if (!keep(q, w2)) continue;
              const d = vnorm(sub(p, q));
              if (d < bd) { bd = d; w = w2; improved = true; }
            }
          }
          if (!improved) { step /= 2; if (step < 1e-10) break; }
        }
        consider(bd, 'ball-surface');
      }
    } else {
      const { cc, hh, axes } = c.box;
      const keep = (q, n) => tSdf(add(q, scale(n, 1e-6))) <= -TOL_MEM;
      for (const F of boxFaceSeeds(cc, hh, axes, keep)) {
        if (!F.seeds.length) continue;
        consider(descendFace(F, p, keep).d, `box(${F.face})`);
      }
    }
  }
  return best;
}
function dowalk(scene, r) {
  validateScene(scene.doc);
  const field = compileSceneField(scene.doc);
  const res = sweep(field, space, {
    from: scene.start, direction: scene.dir, distance: scene.dist, radius: r, maxSteps: 2048,
  });
  if (!res.hit) return { pass: true, pos: res.position };
  const truth = truthClearance(scene, res.position);
  return { pass: false, pos: res.position, truthClear: truth.d - r, truthFace: truth.face };
}

// Buckets: agree-pass | agree-block-legit | agree-block-phantom |
// REJECT-then-work | ACCEPT-then-fail | ACCEPT-then-legit-halt | tie.
const buckets = {
  'agree-pass': [], 'agree-block-legit': [], 'agree-block-phantom': [],
  'REJECT-then-work': [], 'ACCEPT-then-fail': [], 'ACCEPT-then-legit-halt': [], tie: [],
};
const disagreements = [];
function classify(label, scene, r) {
  const pred = predicate(scene, r);
  const w = dowalk(scene, r);
  if (pred.tied) {
    buckets.tie.push(`${label} sweep:${w.pass ? 'pass' : 'halt'}`);
    return { pred, w, bucket: 'tie' };
  }
  const phantom = w.truthClear > PHANTOM_TOL;
  let bucket;
  if (pred.verdict === 'pass' && w.pass) bucket = 'agree-pass';
  else if (pred.verdict === 'block' && w.pass) bucket = 'REJECT-then-work';
  else if (pred.verdict === 'pass' && !w.pass) {
    bucket = phantom ? 'ACCEPT-then-fail' : 'ACCEPT-then-legit-halt';
  } else {
    bucket = phantom ? 'agree-block-phantom' : 'agree-block-legit';
  }
  buckets[bucket].push(label);
  if (bucket !== 'agree-pass') {
    disagreements.push({
      label, bucket,
      predFace: pred.firstBlock ? `cutter${pred.firstBlock.cutter}:${pred.firstBlock.face}` : '(predicate passed)',
      predAt: pred.firstBlock ? pred.firstBlock.p.map((v) => v.toFixed(3)).join(',') : '-',
      haltAt: w.pass ? '-' : w.pos.map((v) => v.toFixed(3)).join(','),
      // Which face was ACTUALLY binding, by material truth — vs what the
      // predicate thought. For phantom halts this is the face the solver
      // stopped short of; for legit halts it is the contact face.
      truthFace: w.pass ? '-' : w.truthFace,
      truthClear: w.pass ? '-' : w.truthClear.toFixed(4),
    });
  }
  return { pred, w, bucket };
}

function ladder(label, build, r, olist) {
  const marks = olist.map((o) => {
    const { pred, w, bucket } = classify(`${label} o=${o} r=${r}`, build(o), r);
    if (bucket === 'tie') return '=';
    if (bucket === 'agree-pass') return '.';
    if (bucket === 'agree-block-phantom') return 'X';
    if (bucket === 'agree-block-legit') return 'L';
    if (bucket === 'REJECT-then-work') return 'R';
    return bucket === 'ACCEPT-then-fail' ? 'A' : 'a';
  }).join('');
  console.log(`  ${label} r=${r}: [${marks}]  (. pass, X phantom-block, L legit-block, R reject-then-work, A accept-then-phantom-halt, a accept-then-legit-halt, = tie)`);
}

const O = [];
for (let o = 0; o <= 1.11; o += 0.1) O.push(Math.round(o * 100) / 100);

check('E3 control: box cutter, head-on — the lead’s 372 on a smaller grid', () => {
  for (const r of [0.125, 0.25, 0.5]) {
    ladder('box/head-on      ', (o) => doorwayBox({ overhang: o }), r, O);
  }
  const bad = buckets['REJECT-then-work'].length + buckets['ACCEPT-then-fail'].length;
  assert.equal(bad, 0, `control must fully agree: ${bad} disagreements`);
});

check('E3 ball cutters, head-on and oblique', () => {
  for (const r of [0.125, 0.25, 0.5]) {
    ladder('ball/head-on     ', (o) => doorwayBall({ overhang: o }), r, O);
    ladder('ball/oblique-30  ', (o) => doorwayBall({ overhang: o, angle: Math.PI / 6 }), r, O);
  }
});

check('E3 plane targets (notch), oriented cutters (tilt + oblique approach)', () => {
  for (const r of [0.125, 0.25, 0.5]) {
    ladder('notch/plane-wall ', (o) => notchPlane({ overhang: o }), r, O);
    ladder('box/tilted-25    ', (o) => doorwayBox({ overhang: o, tilt: 25 }), r, O);
    ladder('box/oblique-30   ', (o) => doorwayBox({ overhang: o, angle: Math.PI / 6 }), r, O);
  }
});

check('E3 several cutters: two doorways, walking the left one', () => {
  for (const r of [0.25, 0.5]) {
    ladder('double-door      ', (o) => doubleDoor({ overhang: o }), r, O);
    ladder('double-door-near ', (o) => doubleDoor({ overhang: o, gap: 1.6 }), r, O);
  }
});

check('fail-demo: the naive 2r rule accepts a walk the predicate refuses', () => {
  // A check built on "o > 2r is safe" accepts this tilted walk. The
  // predicate blocks it, and the walker halts in open air. Replace the
  // predicate with the naive rule and this check fails.
  const r = 0.25, scene = doorwayBox({ overhang: 0.6, tilt: 25 });
  assert.ok(0.6 > 2 * r, 'the 2r rule accepts o=0.6 at r=0.25');
  const pred = predicate(scene, r);
  assert.equal(pred.verdict, 'block', 'the predicate must refuse');
  const w = dowalk(scene, r);
  assert.equal(w.pass, false, 'the walker must halt');
  assert.ok(w.truthClear > PHANTOM_TOL, `halt must be phantom, room ${w.truthClear}`);
  console.log(`  2r accepts o=0.6 r=0.25 tilted-25; predicate blocks (${pred.firstBlock.face}); walker halts, truth room ${w.truthClear.toFixed(3)}`);
});

function splitDoors({ overL = 0.0, overR = 1.0, gap = 2.2 }) {
  // Two doorways with DIFFERENT overhangs; the walk takes the left one. The
  // right cutter is 1.1+ from the path — too far to mask the left dip.
  const wallC = [0, 1.5, 1.5], wallH = [4, 0.3, 1.5];
  const mk = (x, over) => {
    const mouth = 1.2 - over, h = [0.85, 0.3 + over + 0.5, 1.3];
    return { c: [x, mouth + h[1], 1], h };
  };
  const L = mk(-gap / 2, overL), R = mk(gap / 2, overR);
  return {
    doc: docOf('split-doors', [
      { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
      { id: 'cutl', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: L.c, halfExtent: L.h },
      { id: 'cutr', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: R.c, halfExtent: R.h },
    ]),
    start: [-gap / 2, -3, 1], dir: [0, 1, 0], dist: 9,
    target: boxTarget(wallC, wallH, stdAxes()),
    cutters: [boxCut(L.c, L.h, stdAxes()), boxCut(R.c, R.h, stdAxes())],
  };
}

check('fail-demo: a predicate that ignores one cutter accepts a walk that fails', () => {
  // The walked (left) doorway is flush: its mouth dip stops the walker. The
  // full predicate sees it and refuses. Drop the left cutter — a predicate
  // that only checks the deep right one — and it passes a walk that halts in
  // open air. Without the min-over-cutters form this check fails.
  const r = 0.25, scene = splitDoors({});
  const full = predicate(scene, r);
  assert.equal(full.verdict, 'block', 'full predicate must refuse (flush left mouth)');
  assert.equal(full.firstBlock.cutter, 0, 'the binding cutter must be the left one');
  const dropped = predicate({ ...scene, cutters: [scene.cutters[1]] }, r);
  assert.equal(dropped.verdict, 'pass', 'right-cutter-only predicate passes');
  const w = dowalk(scene, r);
  assert.equal(w.pass, false, 'the walker must halt');
  assert.ok(w.truthClear > PHANTOM_TOL, `halt must be phantom, room ${w.truthClear}`);
  console.log(`  split: full blocks (${full.firstBlock.face}), cutr-only passes, walker halts with room ${w.truthClear.toFixed(3)}`);
});

function nestedCutters({ overA = 1.0, overB = 0.0 }) {
  // One doorway, TWO cutters on the same target: cuta deep, cutb flush and
  // nested inside cuta's void. cuta's -m term MASKS cutb's mouth dip in the
  // max() field, so the solver walks through — while the min-form predicate
  // still refuses on cutb's mouth. Conservative by construction.
  const wallC = [0, 1.5, 1.5], wallH = [3, 0.3, 1.5];
  const mk = (halfX, over) => {
    const mouth = 1.2 - over, h = [halfX, 0.3 + over + 0.5, 1.3];
    return { c: [0, mouth + h[1], 1], h };
  };
  const A = mk(0.85, overA), B = mk(0.85, overB);
  return {
    doc: docOf('nested-cutters', [
      { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
      { id: 'cuta', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: A.c, halfExtent: A.h },
      { id: 'cutb', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: B.c, halfExtent: B.h },
    ]),
    start: [0, -3, 1], dir: [0, 1, 0], dist: 9,
    target: boxTarget(wallC, wallH, stdAxes()),
    cutters: [boxCut(A.c, A.h, stdAxes()), boxCut(B.c, B.h, stdAxes())],
  };
}

check('nested cutters: the min-form over-blocks a masked dip (not yet safe)', () => {
  // The inner flush mouth sits inside the outer cutter's void: max() masks
  // its dip and the walk passes with room, but min-over-cutters refuses it.
  // An editor using the predicate as-is would cost an author this room. The
  // combination is recorded here as NOT YET SAFE to check, not as agreement.
  const r = 0.25, scene = nestedCutters({});
  const full = predicate(scene, r);
  assert.equal(full.verdict, 'block', 'min-form refuses on the inner mouth');
  const w = dowalk(scene, r);
  assert.equal(w.pass, true, 'the solver walks through the masked dip');
  console.log(`  nested: predicate blocks (${full.firstBlock.face}) but the walk passes — min-form is conservative here`);
});

check('S3 geodesic-cell cutters on a geodesic path', () => {
  // No exact truth is claimed in curved space (MUSE-34's domain): the split
  // below is predicate-vs-sweep only, with no legit/phantom sub-buckets.
  // Predicate distances are sampled cell boundaries (author-coord face grids,
  // decoded, refined by coordinate descent under sp.distance). Coarse path
  // step 0.01 with a fine geodesic rescan (0.0005) around near-zero margins;
  // |margin| <= 0.001 after refinement is reported tie-adjacent, never
  // counted either way.
  const source = JSON.parse(readFileSync(new URL('./levels/fixtures/s3-room.nil.json', import.meta.url), 'utf8'));
  const G = 15;
  const facesOf = (center, half) => {
    const F = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, k = (i + 2) % 3;
      for (const s of [-1, 1]) {
        const seeds = [];
        for (let a = -G; a <= G; a++) for (let b = -G; b <= G; b++) {
          seeds.push([(a / G) * half[j], (b / G) * half[k]]);
        }
        F.push({ i, s, hj: half[j], hk: half[k], seeds });
      }
    }
    return F;
  };
  function s3config(hy, r) {
    const doc = structuredClone(source);
    doc.entities.find((e) => e.id === 's-door').halfExtent[1] = hy;
    validateScene(doc);
    const region = compileRegionWorld(doc).regions.get('sphere');
    const { space: sp, field } = region;
    const wall = doc.entities.find((e) => e.id === 's-wall');
    const door = doc.entities.find((e) => e.id === 's-door');
    const seat = (center, half) => facesOf(center, half).map((F) => {
      const j = (F.i + 1) % 3, k = (F.i + 2) % 3;
      return {
        ...F,
        pts: F.seeds.map(([u, v]) => {
          const q = [0, 0, 0];
          q[F.i] = F.s * half[F.i]; q[j] = u; q[k] = v;
          return { u, v, pt: sp.decode([center[0] + q[0], center[1] + q[1], center[2] + q[2]]) };
        }),
      };
    });
    const wallSet = { center: wall.position, half: wall.halfExtent, faces: seat(wall.position, wall.halfExtent) };
    const doorSet = { center: door.position, half: door.halfExtent, faces: seat(door.position, door.halfExtent) };
    const authorOf = (set, F, u, v) => {
      const j = (F.i + 1) % 3, k = (F.i + 2) % 3;
      const q = [0, 0, 0];
      q[F.i] = F.s * set.half[F.i]; q[j] = u; q[k] = v;
      return [set.center[0] + q[0], set.center[1] + q[1], set.center[2] + q[2]];
    };
    // Coarse min over the decoded grid, then coordinate descent in author
    // (u,v) under sp.distance. Without the descent the grid spacing (~0.15)
    // manufactures passes out of ties.
    const distTo = (set, pt) => {
      let bd = Infinity, bF = null, bu = 0, bv = 0;
      for (const F of set.faces) {
        for (const s of F.pts) {
          const d = sp.distance(pt, s.pt);
          if (d < bd) { bd = d; bF = F; bu = s.u; bv = s.v; }
        }
      }
      if (bF) {
        let step = Math.max(bF.hj, bF.hk) / G;
        for (;;) {
          let improved = false;
          for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            const u = Math.max(-bF.hj, Math.min(bF.hj, bu + du));
            const v = Math.max(-bF.hk, Math.min(bF.hk, bv + dv));
            const d = sp.distance(pt, sp.decode(authorOf(set, bF, u, v)));
            if (d < bd) { bd = d; bu = u; bv = v; improved = true; }
          }
          if (!improved) { step /= 2; if (step < 1e-7) break; }
        }
      }
      return { d: bd, face: bF ? `${'xyz'[bF.i]}:${bF.s > 0 ? '+' : '-'}` : null };
    };
    // Geodesic path, carried direction, step 0.01 (positions AND tangents kept).
    const start = sp.decode([0, -3, 0.9]);
    const aim = sp.normalize(start, sp.logAt(start, sp.decode([0, 4, 0.9])));
    const path = [];
    {
      let p = start, u = aim;
      for (let t = 0; t <= 9.0001; t += 0.01) {
        path.push({ p, u });
        const seg = sp.stepWithTransport(p, u, 0.01);
        p = seg.position; u = seg.carry(u);
      }
    }
    let verdict = 'pass', margin = Infinity, marginFace = null, kBest = -1;
    const evalPt = (pt) => {
      const dW = distTo(wallSet, pt).d;
      if (dW > r) return null;
      const dd = distTo(doorSet, pt);
      return { m: dd.d - r, face: dd.face, blocked: dd.d <= r };
    };
    path.forEach(({ p }, k) => {
      const e = evalPt(p);
      if (!e) return;
      if (e.m < margin) { margin = e.m; marginFace = e.face; kBest = k; }
      if (e.blocked) verdict = 'block';
    });
    // Near-zero margins get a fine geodesic rescan (±0.02 at 0.0005, true
    // carried steps, not interpolation): the far-mouth tie at hy=0.8 sits
    // between coarse samples, and interpolation would invent the answer.
    if (kBest >= 0 && Math.abs(margin) < 0.02) {
      const k0 = Math.max(0, kBest - 2);
      let p = path[k0].p, u = path[k0].u;
      for (let s = 0; s <= 80; s++) {
        const e = evalPt(p);
        if (e) {
          if (e.m < margin) { margin = e.m; marginFace = e.face; }
          if (e.blocked) verdict = 'block';
        }
        const seg = sp.stepWithTransport(p, u, 0.0005);
        p = seg.position; u = seg.carry(u);
      }
    }
    const res = sweep(field, sp, { from: start, direction: aim, distance: 9, radius: r, maxSteps: 2048 });
    // Pass = the doorway line crossed (phantom's own crossed line). A later
    // halt at the back wall is not the carve stopping the walk, and the
    // predicate governs the carve, not the back wall.
    const crossed = sp.encode(res.position)[1] > 2.1 + r;
    return { verdict, margin, marginFace, crossed, pass: crossed };
  }
  const HYS = [0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.5];
  const s3 = { agree: 0, R: 0, A: 0, tie: [] };
  const marks = [];
  for (const hy of HYS) {
    const { verdict, margin, marginFace, pass } = s3config(hy, 0.25);
    let mark;
    if (Math.abs(margin) <= 0.001) { mark = '='; s3.tie.push(`hy=${hy} margin=${margin.toExponential(1)} sweep:${pass ? 'pass' : 'halt'}`); }
    else if (verdict === 'pass' && pass) { mark = '.'; s3.agree++; }
    else if (verdict === 'block' && !pass) { mark = 'X'; s3.agree++; }
    else if (verdict === 'block') { mark = 'R'; s3.R++; }
    else { mark = 'A'; s3.A++; }
    marks.push(mark);
    console.log(`  s3 hy=${hy}: predicate ${verdict} (margin ${margin.toExponential(1)} at door ${marginFace}) sweep ${pass ? 'pass' : 'halt'} -> ${mark}`);
  }
  console.log(`  s3/cell r=0.25 hy 0.3/.45/.6/.8/1/1.2/1.5 -> [${marks.join('')}]  agree=${s3.agree} R=${s3.R} A=${s3.A}`);
  for (const t of s3.tie) console.log(`  s3 tie-adjacent: ${t}`);
  assert.equal(s3.R, 0, `S3 reject-then-work: ${s3.R}`);
  assert.equal(s3.A, 0, `S3 accept-then-fail: ${s3.A}`);
});

check('E3 summary: split by direction of error, faces characterised', () => {
  const count = (b) => buckets[b].length;
  console.log(`  agree-pass=${count('agree-pass')} agree-block-phantom=${count('agree-block-phantom')} `
    + `agree-block-legit=${count('agree-block-legit')} ties=${count('tie')}`);
  console.log(`  REJECT-then-work=${count('REJECT-then-work')} ACCEPT-then-fail=${count('ACCEPT-then-fail')} `
    + `ACCEPT-then-legit-halt=${count('ACCEPT-then-legit-halt')}`);
  for (const d of disagreements) {
    console.log(`  ${d.bucket} ${d.label}\n    predicate: ${d.predFace} at [${d.predAt}]\n`
      + `    halt: [${d.haltAt}] truth nearest ${d.truthFace} with room ${d.truthClear}`);
  }
  for (const t of buckets.tie) console.log(`  tie: ${t}`);
  assert.equal(buckets['REJECT-then-work'].length, 0, 'no reject-then-work in E3');
  assert.equal(buckets['ACCEPT-then-fail'].length, 0, 'no accept-then-fail in E3');
  assert.equal(buckets['ACCEPT-then-legit-halt'].length, 0, 'no accept-then-legit-halt in E3');
});

console.log(`\ncarve-predicate: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);

