// Phantom carve (MUSE-33): where does the 2r overhang rule actually hold?
//
// MECHANISM, stated before sweeping. Subtraction is max(d, -m). Inside the
// carved void near its mouth, -m measures the distance back to the carver's
// own boundary -- a surface standing in open air that belongs to nothing.
// The value is a valid lower bound, so the renderer is innocent, but a
// walker reads a CLEARANCE from it and halts where truth has room.
//
// MEASURED QUANTITY. A walk is PHANTOM-BLOCKED when the sweep halts
// (hit:true) while the true clearance at the halt exceeds 1e-3 -- margin far
// above the 1e-4 solver skin and far below any probe radius swept (0.125+).
// TRUE clearance is computed independently of the field: the true material
// boundary (target surface outside the cutter, cutter surface inside the
// target) is sampled densely, refined by coordinate descent to <1e-9, and
// the minimum distance to the probe is the truth. Membership tests use
// hand-written closed forms for classification only, at margins where dust
// cannot flip them. Each scene family self-checks: with the cutter removed,
// |truth - field| <= 1e-6 along the walk, proving the reference measures the
// same room the field does before any carve enters.
import assert from 'node:assert/strict';
import { validateScene } from './engine/world/document.js';
import { compileSceneField } from './engine/world/scene-field.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { e3Space, sweep, clearance } from './engine/world/collision.js';
import { readFileSync } from 'node:fs';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

// --- tiny vector kit (test-local) -------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);

// --- exact closed forms, for membership classification only -----------------
const sdfBox = (c, h, axes, p) => {
  const q = axes.map((a, i) => Math.abs(dot(a, sub(p, c))) - h[i]);
  return Math.hypot(...q.map((x) => Math.max(x, 0))) + Math.min(Math.max(...q), 0);
};
const sdfBall = (c, r, p) => norm(sub(p, c)) - r;
const sdfPlane = (n, off, p) => dot(p, n) - off;
const stdAxes = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const frameAxes = (fwd, up) => [cross(fwd, up), fwd.slice(), up.slice()];

// --- true-material boundary sampler ------------------------------------------
// Every piece keeps its parametric form so refinement stays ON the surface:
// a refinement that walks through 3D toward the probe would measure a
// shorter off-surface hop, not the surface distance. Seeds are filtered by
// material membership once; refinement re-checks membership every step.
const FILTER_TOL = 1e-7;
const GRID = 24;

function boxPiece(c, h, axes, keep) {
  const faces = [];
  const self = { kind: 'box', faces, keep, role: null, reseed: (nk) => boxPiece(c, h, axes, nk) };
  const at = (i, s, u, v) => {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const q = [0, 0, 0];
    q[i] = s * h[i]; q[j] = u; q[k] = v;
    return add(c, [0, 1, 2].map((a) => axes.reduce((sum, ax, b) => sum + ax[a] * q[b], 0)));
  };
  // Outward normal of face (i, s) in world coordinates.
  const nOut = (i, s) => scale(axes[i], s);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    for (const s of [-1, 1]) {
      const seeds = [];
      for (let a = -GRID; a <= GRID; a++) for (let b = -GRID; b <= GRID; b++) {
        const u = (a / GRID) * h[j], v = (b / GRID) * h[k];
        const q = at(i, s, u, v);
        if (keep(q, nOut(i, s))) seeds.push({ u, v, q });
      }
      if (seeds.length) {
        faces.push({ seeds, at: (u, v) => at(i, s, u, v), n: nOut(i, s), hj: h[j], hk: h[k] });
      }
    }
  }
  return self;
}

function ballPiece(c, r, keep) {
  const N = 6000, seeds = [];
  const self = { kind: 'ball', seeds, at: null, r, keep, role: null, reseed: (nk) => ballPiece(c, r, nk) };
  const at = (w) => add(c, scale(w, r));
  self.at = at;
  for (let n = 0; n < N; n++) {
    const y = 1 - (2 * (n + 0.5)) / N;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = n * 2.399963229728653;
    const w = [rad * Math.cos(th), rad * Math.sin(th), y];
    if (keep(at(w), w)) seeds.push({ w, q: at(w) });
  }
  return self;
}

function planePiece(n, off, center, radius, keep) {
  const e0 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const uu = cross(n, e0), vv = cross(n, uu);
  const un = scale(uu, 1 / norm(uu)), vn = scale(vv, 1 / norm(vv));
  const nn = scale(n, 1 / norm(n));
  const base = scale(nn, off / norm(n));
  const at = (a, b) => add(base, add(scale(un, a), scale(vn, b)));
  const seeds = [];
  const self = { kind: 'plane', seeds, at, rim: null, keep: null, role: null, reseed: null };
  for (let a = -GRID; a <= GRID; a++) for (let b = -GRID; b <= GRID; b++) {
    const q = at((a / GRID) * radius, (b / GRID) * radius);
    if (norm(sub(q, center)) > radius + 1e-9) continue;
    if (keep(q, nn)) seeds.push({ a: (a / GRID) * radius, b: (b / GRID) * radius, q });
  }
  self.at = at; self.rim = { center, radius }; self.keep = keep; self.normal = nn;
  self.reseed = (nk) => planePiece(n, off, center, radius, nk);
  return self;
}

function refineFace(face, p, keep) {
  let bd = Infinity, bu = 0, bv = 0, bq = null;
  for (const s of face.seeds) {
    const d = norm(sub(p, s.q));
    if (d < bd) { bd = d; bu = s.u; bv = s.v; bq = s.q; }
  }
  if (!bq) return { d: Infinity, q: null };
  let step = Math.max(face.hj, face.hk) / GRID;
  for (;;) {
    let improved = false;
    for (const [du, dv] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const u = Math.max(-face.hj, Math.min(face.hj, bu + du));
      const v = Math.max(-face.hk, Math.min(face.hk, bv + dv));
      const q = face.at(u, v);
      if (!keep(q, face.n)) continue;
      const d = norm(sub(p, q));
      if (d < bd) { bd = d; bu = u; bv = v; bq = q; improved = true; }
    }
    if (!improved) {
      step /= 2;
      if (step < 1e-10) break;
    }
  }
  return { d: bd, q: bq };
}

function refineBall(piece, p, keep) {
  let bw = null, bd = Infinity, bq = null;
  for (const s of piece.seeds) {
    const d = norm(sub(p, s.q));
    if (d < bd) { bd = d; bw = s.w; bq = s.q; }
  }
  if (!bw) return { d: Infinity, q: null };
  let w = bw, step = 0.05;
  const rot = (w, e, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    const w2 = [w[0] * c + e[0] * s, w[1] * c + e[1] * s, w[2] * c + e[2] * s];
    const l = norm(w2);
    return [w2[0] / l, w2[1] / l, w2[2] / l];
  };
  for (;;) {
    let improved = false;
    const e0 = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const t1 = cross(w, e0), t2 = cross(w, t1);
    const l1 = norm(t1), l2 = norm(t2);
    for (const [t, l] of [[t1, l1], [t2, l2]]) {
      const e = [t[0] / l, t[1] / l, t[2] / l];
      for (const a of [step, -step]) {
        const w2 = rot(w, e, a);
        const q = piece.at(w2);
        if (!keep(q, w2)) continue;
        const d = norm(sub(p, q));
        if (d < bd) { bd = d; w = w2; bq = q; improved = true; }
      }
    }
    if (!improved) {
      step /= 2;
      if (step < 1e-10) break;
    }
  }
  return { d: bd, q: bq };
}

function refinePlane(piece, p, keep) {
  let ba = 0, bb = 0, bd = Infinity, bq = null;
  for (const s of piece.seeds) {
    const d = norm(sub(p, s.q));
    if (d < bd) { bd = d; ba = s.a; bb = s.b; bq = s.q; }
  }
  if (!bq) return { d: Infinity, q: null };
  const R = piece.rim.radius;
  let step = R / GRID;
  for (;;) {
    let improved = false;
    for (const [da, db] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const a = Math.max(-R, Math.min(R, ba + da));
      const b = Math.max(-R, Math.min(R, bb + db));
      const q = piece.at(a, b);
      if (norm(sub(q, piece.rim.center)) > R + 1e-9) continue;
      if (!keep(q, piece.normal)) continue;
      const d = norm(sub(p, q));
      if (d < bd) { bd = d; ba = a; bb = b; bq = q; improved = true; }
    }
    if (!improved) {
      step /= 2;
      if (step < 1e-10) break;
    }
  }
  return { d: bd, q: bq };
}

// Pieces carry their own membership test: a target-surface sample is material
// outside the cutter, a cutter-surface sample inside the target.
function truthDistance(pieces, p) {
  let best = Infinity, bestPlaneRim = false;
  for (const piece of pieces) {
    let r;
    if (piece.kind === 'box') {
      r = { d: Infinity, q: null };
      for (const face of piece.faces) {
        const r2 = refineFace(face, p, piece.keep);
        if (r2.d < r.d) r = r2;
      }
    } else if (piece.kind === 'ball') {
      r = refineBall(piece, p, piece.keep);
    } else {
      r = refinePlane(piece, p, piece.keep);
      if (r.d < best) {
        best = r.d;
        bestPlaneRim = !!r.q && norm(sub(r.q, piece.rim.center)) > piece.rim.radius - 0.25;
      }
      continue;
    }
    if (r.d < best) { best = r.d; bestPlaneRim = false; }
  }
  if (bestPlaneRim) throw new Error('truth patch too small: nearest plane sample at the rim');
  return best;
}

// --- scene families ----------------------------------------------------------
// Every scene: one target, one subtract cutter, one distant spawn (required
// by the validator, invisible to the field). The builder returns the document
// plus the truth pieces with membership already attached, plus the walk.
const SPAWN = { id: 's', regionId: 'r', kind: 'spawn', position: [0, -8, 0.3] };
const REGIONS = [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }];
function docOf(id, entities) {
  return {
    format: 'nil-scene', version: 2, id,
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: REGIONS, entities: [...entities, SPAWN], connections: [],
  };
}
// Strictly outside: a target sample sitting exactly ON the cutter boundary
// is the carved-away face itself (flush mouth), not material. Tangencies lost
// this way cost the truth at most ~1e-9.
const outside = (sdf) => (q) => sdf(q) >= 1e-9;
// A cutter-surface sample is material only where its OUTER side borders kept
// target: a mouth face coincident with the target face borders exterior on
// one side and cutter void on the other, and belongs to nothing.
const cutterIn = (sdfT) => (q, n) => sdfT(add(q, scale(n, 1e-6))) <= -1e-9;

// Wall slab + box cutter doorway, walked head-on or obliquely.
function doorwayBox({ wallHalfY = 0.3, cutHalfX = 0.85, overhang = 0.5, cutHalfZ = 1.3, angle = 0, tilt = 0 }) {
  const wallC = [0, 1.5, 1.5], wallH = [3, wallHalfY, 1.5];
  const mouth = (1.5 - wallHalfY) - overhang;
  const cutH = [cutHalfX, wallHalfY + overhang + 0.5, cutHalfZ];
  const tiltRad = (tilt * Math.PI) / 180;
  // Overhang is measured at the center plane: a tilted cutter's mouth depth
  // there is halfY*cos + halfX*sin, solved so the quoted overhang is exact.
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
  const sdfT = (q) => sdfBox(wallC, wallH, stdAxes(), q);
  const sdfC = (q) => sdfBox(cutC, cutH, axes, q);
  const pieces = [
    Object.assign(boxPiece(wallC, wallH, stdAxes(), outside(sdfC)), { role: 'target' }),
    Object.assign(boxPiece(cutC, cutH, axes, cutterIn(sdfT)), { role: 'cutter' }),
  ];
  return { doc: docOf('doorway-box', entities), pieces, start, dir, dist: 9 };
}

// Wall slab + ball cutter.
function doorwayBall({ wallHalfY = 0.3, overhang = 0.5, angle = 0 }) {
  const wallC = [0, 1.5, 1.5], wallH = [3, wallHalfY, 1.5];
  const rc = wallHalfY + overhang;
  const ballC = [0, 1.5, 1];
  const mouth = (1.5 - wallHalfY) - overhang;
  const dir = [Math.sin(angle), Math.cos(angle), 0];
  const start = add([0, 1.5, 1], scale(dir, -4.5));
  const entities = [
    { id: 'wall', regionId: 'r', kind: 'box', position: wallC, halfExtent: wallH },
    { id: 'cut', regionId: 'r', kind: 'ball', op: 'subtract', target: 'wall', position: ballC, radius: rc },
  ];
  const sdfT = (q) => sdfBox(wallC, wallH, stdAxes(), q);
  const sdfC = (q) => sdfBall(ballC, rc, q);
  const pieces = [
    Object.assign(boxPiece(wallC, wallH, stdAxes(), outside(sdfC)), { role: 'target' }),
    Object.assign(ballPiece(ballC, rc, cutterIn(sdfT)), { role: 'cutter' }),
  ];
  return { doc: docOf('doorway-ball', entities), pieces, start, dir, dist: 9 };
}

// Ball target tunnelled by a box cutter, walked along the tunnel.
function tunnelBall({ overhang = 0.5 }) {
  const ballC = [0, 1.5, 1], R = 2;
  const cutH = [0.6, 2 + overhang, 0.6];
  const entities = [
    { id: 'orb', regionId: 'r', kind: 'ball', position: ballC, radius: R },
    { id: 'cut', regionId: 'r', kind: 'box', op: 'subtract', target: 'orb', position: ballC, halfExtent: cutH },
  ];
  const sdfT = (q) => sdfBall(ballC, R, q);
  const sdfC = (q) => sdfBox(ballC, cutH, stdAxes(), q);
  const pieces = [
    Object.assign(ballPiece(ballC, R, outside(sdfC)), { role: 'target' }),
    Object.assign(boxPiece(ballC, cutH, stdAxes(), cutterIn(sdfT)), { role: 'cutter' }),
  ];
  return { doc: docOf('tunnel-ball', entities), pieces, start: [0, -3, 1], dir: [0, 1, 0], dist: 10 };
}

// Plane wall with a box-cutter notch, walked INTO the notch (dead end).
function notchPlane({ overhang = 0.5, depth = 2 }) {
  const n = [0, -1, 0], off = -1.5; // solid y >= 1.5
  const mouth = 1.5 - overhang;
  const cutC = [0, mouth + depth / 2, 1], cutH = [0.85, depth / 2, 1.3];
  const entities = [
    { id: 'wall', regionId: 'r', kind: 'plane', position: [0, 1.5, 0], up: [0, -1, 0] },
    { id: 'cut', regionId: 'r', kind: 'box', op: 'subtract', target: 'wall', position: cutC, halfExtent: cutH },
  ];
  const sdfT = (q) => sdfPlane(n, off, q);
  const sdfC = (q) => sdfBox(cutC, cutH, stdAxes(), q);
  const patchC = [0, 1.5, 1];
  const pieces = [
    Object.assign(planePiece(n, off, patchC, 8, outside(sdfC)), { role: 'target' }),
    Object.assign(boxPiece(cutC, cutH, stdAxes(), cutterIn(sdfT)), { role: 'cutter' }),
  ];
  return { doc: docOf('notch-plane', entities), pieces, start: [0, -3, 1], dir: [0, 1, 0], dist: 8, notchBack: mouth + depth };
}

const space = e3Space();

// One walk: the sweep outcome plus field and true clearance at the halt.
// PHANTOM-BLOCKED means the solver stopped where truth has room.
function walk(scene, r) {
  validateScene(scene.doc);
  const field = compileSceneField(scene.doc);
  const res = sweep(field, space, {
    from: scene.start, direction: scene.dir, distance: scene.dist, radius: r, maxSteps: 2048,
  });
  const fieldClear = clearance(field, res.position, r);
  const truth = truthDistance(scene.pieces, res.position);
  return { hit: res.hit, pos: res.position, fieldClear, truthClear: truth - r, travelled: res.travelled };
}

function selfCheckTruth(name, scene, n = 5) {
  // Cutter removed: the reference must reproduce the (exact) field.
  const plain = structuredClone(scene.doc);
  const cut = plain.entities.find((e) => e.op);
  plain.entities = plain.entities.filter((e) => e !== cut);
  validateScene(plain);
  const field = compileSceneField(plain);
  const targetOnly = scene.pieces
    .filter((pc) => pc.role === 'target')
    .map((pc) => pc.reseed(() => true));
  let worst = 0;
  for (let k = 0; k < n; k++) {
    const p = add(scene.start, scale(scene.dir, (k / (n - 1)) * scene.dist));
    // Unsigned comparison: the sampler measures boundary distance, and the
    // sign lives in construction, exactly as in box-truth.test.js.
    worst = Math.max(worst, Math.abs(truthDistance(targetOnly, p) - Math.abs(field.distance(p))));
  }
  assert.ok(worst <= 1e-6, `${name}: truth self-check differs by ${worst}`);
  return worst;
}

const BLOCK_TOL = 1e-3; // halt with more true room than this is a phantom stop
const blocked = (w) => w.hit && w.truthClear > BLOCK_TOL;

check('repro: the lead’s 0.5-blocks / 0.7-crosses in E3', () => {
  const r = 0.25;
  const stuck = walk(doorwayBox({ overhang: 0.5 }), r);
  assert.equal(stuck.hit, true, 'overhang 0.5 must halt the sweep');
  assert.ok(stuck.truthClear > BLOCK_TOL, `halt must be in open air, truth clearance ${stuck.truthClear}`);
  assert.ok(Math.abs(stuck.fieldClear) <= 1e-3, `field must read contact, got ${stuck.fieldClear}`);
  const free = walk(doorwayBox({ overhang: 0.7 }), r);
  assert.equal(free.hit, false, 'overhang 0.7 must cross');
  console.log(`  repro: o=0.5 halts with field ${stuck.fieldClear.toFixed(4)} vs truth ${stuck.truthClear.toFixed(4)}; o=0.7 crosses`);
});

check('truth self-checks: uncarved, the reference is the field', () => {
  selfCheckTruth('doorway-box', doorwayBox({ overhang: 0.5 }));
  selfCheckTruth('doorway-box oblique', doorwayBox({ overhang: 0.5, angle: Math.PI / 6 }));
  selfCheckTruth('doorway-box tilted', doorwayBox({ overhang: 0.5, tilt: 25 }));
  selfCheckTruth('doorway-ball', doorwayBall({ overhang: 0.5 }));
  selfCheckTruth('tunnel-ball', tunnelBall({ overhang: 0.5 }));
  selfCheckTruth('notch-plane', notchPlane({ overhang: 0.5 }));
});

check('sink: the field never overestimates along any walk', () => {
  // The bound may under-report (the phantom) but must never report MORE room
  // than the truth: overestimation is what lets a step sink into a wall.
  const scenes = [
    doorwayBox({ overhang: 0.2 }), doorwayBox({ overhang: 0.7 }),
    doorwayBox({ overhang: 0.4, angle: Math.PI / 5 }), doorwayBox({ overhang: 0.6, tilt: 25 }),
    doorwayBall({ overhang: 0.3 }), doorwayBall({ overhang: 0.8 }),
    tunnelBall({ overhang: 0.4 }), notchPlane({ overhang: 0.4 }),
  ];
  let worst = 0;
  for (const scene of scenes) {
    for (const r of [0.125, 0.25, 0.5]) {
      const w = walk(scene, r);
      const end = w.hit ? w.pos : add(scene.start, scale(scene.dir, scene.dist));
      for (let k = 0; k <= 8; k++) {
        const p = add(scene.start, scale(sub(end, scene.start), k / 8));
        validateScene(scene.doc);
        const field = compileSceneField(scene.doc);
        const gap = field.distance(p) - truthDistance(scene.pieces, p);
        worst = Math.max(worst, gap);
        assert.ok(gap <= 1e-6, `overestimate of ${gap} at ${JSON.stringify(p)}`);
      }
    }
  }
  console.log(`  sink: worst field-minus-truth ${worst.toExponential(2)} (never positive)`);
});

// --- the sweep ---------------------------------------------------------------
const DEBUG = typeof process !== 'undefined' && process.env.PHANTOM_DEBUG;
function criticalOverhang(label, build, r, olist) {
  const ws = olist.map((o) => walk(build(o), r));
  const marks = ws.map((w) => {
    if (!w.hit) return '.';
    if (w.truthClear > BLOCK_TOL) return DEBUG ? `X@${w.pos.map((v) => v.toFixed(2)).join(',')}` : 'X';
    return `L[${w.truthClear.toFixed(3)}]`; // halted, but legitimately: truth agrees
  }).join('');
  // Blocking sits at SMALL overhang and lets go above: the transition is the
  // last X followed by the first dot.
  const verdicts = ws.map((w) => (blocked(w) ? 'X' : '.'));
  let lo = null, hi = null;
  olist.forEach((o, i) => {
    if (verdicts[i] === 'X') { lo = o; hi = i + 1 < olist.length ? olist[i + 1] : null; }
  });
  const where = lo === null ? 'never blocks' : (hi === null ? `blocks through ${lo}` : `o* in (${lo}, ${hi}]`);
  console.log(`  ${label} r=${r} 2r=${2 * r}: [${marks}] ${where}`);
  return { marks, verdicts, lo, hi };
}

check('sweep: where the 2r rule holds, and where it does not', () => {
  // THE RULE, read off the sweep: a centered, untilted walk releases at
  // o* = 2r within one grid step. Tilted and oblique-shifted walks need
  // more; two configurations never release at all (next check).
  const core = (res, r, what) => {
    assert.ok(res.lo !== null && res.lo <= 2 * r + 0.15, `${what} r=${r}: must block near 2r`);
    assert.ok(res.hi !== null && res.hi > 2 * r && res.hi - res.lo <= 0.21,
      `${what} r=${r}: release must sit one grid step just above 2r, got (${res.lo}, ${res.hi}]`);
  };
  for (const r of [0.125, 0.25, 0.5]) {
    const O = [];
    for (let o = 0; o <= 2 * r + 1.11; o += 0.1) O.push(Math.round(o * 100) / 100);
    core(criticalOverhang('box/head-on/thin ', (o) => doorwayBox({ overhang: o }), r, O), r, 'box-thin');
    core(criticalOverhang('box/head-on/thick', (o) => doorwayBox({ overhang: o, wallHalfY: 1.0 }), r, O), r, 'box-thick');
    core(criticalOverhang('tunnel/ball-wall ', (o) => tunnelBall({ overhang: o }), r, O), r, 'tunnel');
    core(criticalOverhang('notch/plane-wall ', (o) => notchPlane({ overhang: o }), r, O), r, 'notch');
    core(criticalOverhang('ball/head-on     ', (o) => doorwayBall({ overhang: o }), r, O), r, 'ball');
    if (r < 0.5) {
      core(criticalOverhang('box/oblique-30   ', (o) => doorwayBox({ overhang: o, angle: Math.PI / 6 }), r, O), r, 'oblique');
      core(criticalOverhang('ball/oblique-30  ', (o) => doorwayBall({ overhang: o, angle: Math.PI / 6 }), r, O), r, 'ball-oblique');
    }
    // Tilted cutters release LATE: the mouth corner intrudes into the path.
    const t = criticalOverhang('box/tilted-25    ', (o) => doorwayBox({ overhang: o, tilt: 25 }), r, O);
    if (r < 0.5) {
      assert.ok(t.lo !== null && t.lo > 2 * r && t.lo <= 2 * r + 0.3,
        `tilted r=${r}: must release above 2r=${2 * r}, got (${t.lo}, ${t.hi}]`);
    } else {
      assert.equal(t.hi, null, 'tilted r=0.5: must never release on the ladder');
    }
  }
  // Fat probe, oblique ball cutter: releases, but above 2r.
  const O5 = [];
  for (let o = 0; o <= 2.11; o += 0.1) O5.push(Math.round(o * 100) / 100);
  const bo = criticalOverhang('ball/oblique-30  ', (o) => doorwayBall({ overhang: o, angle: Math.PI / 6 }), 0.5, O5);
  assert.ok(bo.lo !== null && bo.lo > 1.0 && bo.lo <= 1.3, `ball-oblique r=0.5: release above 2r, got (${bo.lo}, ${bo.hi}]`);
  const ob = criticalOverhang('box/oblique-30   ', (o) => doorwayBox({ overhang: o, angle: Math.PI / 6 }), 0.5, O5);
  assert.equal(ob.hi, null, 'box-oblique r=0.5: must never release on the ladder');
});

check('fail-demo: the rule accepts scenes the walker cannot cross', () => {
  // A check built on "o > 2r is safe" accepts both of these. The walker
  // halts in open air in both. The rule is sufficient, not sufficient-and-
  // necessary -- and for these two configurations nothing is sufficient.
  const ruleAccepts = (o, r) => o > 2 * r;
  const demo = (scene, o, r, what) => {
    assert.ok(ruleAccepts(o, r), `${what}: the 2r rule accepts o=${o} at r=${r}`);
    const w = walk(scene, r);
    assert.equal(w.hit, true, `${what}: the walker must halt`);
    assert.ok(w.truthClear > BLOCK_TOL, `${what}: halted with truth clearance ${w.truthClear}`);
    console.log(`  rule accepts o=${o} r=${r} (${what}); walker halts, truth clearance ${w.truthClear.toFixed(3)}`);
  };
  demo(doorwayBox({ overhang: 0.6, tilt: 25 }), 0.6, 0.25, 'tilted-25');
  demo(doorwayBall({ overhang: 1.1, angle: Math.PI / 6 }), 1.1, 0.5, 'ball-oblique-30');
});

check('no safe overhang: fat probe, angled approach, narrow door', () => {
  // At r=0.5 in a 1.7-wide doorway the oblique/tilted walks halt at the same
  // face-minus-r point for EVERY overhang: the void depth there is capped by
  // the jamb gap (0.39 < r), so no overhang lets go. Push to o=3.0 to be sure.
  for (const o of [2.5, 3.0]) {
    const ob = walk(doorwayBox({ overhang: o, angle: Math.PI / 6 }), 0.5);
    const ti = walk(doorwayBox({ overhang: o, tilt: 25 }), 0.5);
    console.log(`  o=${o}: oblique hit=${ob.hit} truthClear=${ob.truthClear.toFixed(3)} / tilted hit=${ti.hit} truthClear=${ti.truthClear.toFixed(3)}`);
    assert.equal(ob.hit, true, `oblique o=${o} must still halt`);
    assert.ok(ob.truthClear > BLOCK_TOL, `oblique o=${o} halt must be phantom`);
    assert.equal(ti.hit, true, `tilted o=${o} must still halt`);
    assert.ok(ti.truthClear > BLOCK_TOL, `tilted o=${o} halt must be phantom`);
  }
});

check('S3: the same overhang ladder in the lead’s spherical room', () => {
  // No distance truth is claimed in curved space -- that reference is
  // MUSE-34's deliverable. The signal here is walk outcome against the flush
  // control: the flush cutter has no phantom surface, so whatever crosses
  // flush and halts with overhang was stopped by nothing.
  const source = JSON.parse(readFileSync(new URL('./levels/fixtures/s3-room.nil.json', import.meta.url), 'utf8'));
  const s3walk = (doorHalfY, r) => {
    const doc = structuredClone(source);
    doc.entities.find((e) => e.id === 's-door').halfExtent[1] = doorHalfY;
    validateScene(doc);
    const region = compileRegionWorld(doc).regions.get('sphere');
    const { space: sp, field } = region;
    const at = (x, y, z) => sp.decode([x, y, z]);
    const aim = (p, q) => sp.normalize(p, sp.logAt(p, q));
    const start = at(0, -3, 0.9);
    const res = sweep(field, sp, {
      from: start, direction: aim(start, at(0, 4, 0.9)), distance: 9, radius: r, maxSteps: 2048,
    });
    return sp.encode(res.position);
  };
  // Crossed means through the WALL (far face 1.8) by more than a radius with
  // room to spare -- not merely past the cutter mouth, and not the back wall
  // (3.3 at r=0.5 is a genuine arrival, past the doorway). A far-mouth
  // phantom halts at wallFar + r exactly, far below this line.
  const HYS = [0.3, 0.45, 0.6, 0.8, 1.0, 1.2, 1.5];
  const crossed = (y, r) => y > 2.1 + r;
  const ys = {};
  for (const r of [0.125, 0.25, 0.5]) {
    const marks = [];
    ys[r] = HYS.map((hy) => s3walk(hy, r));
    HYS.forEach((hy, i) => {
      const [x, y, z] = ys[r][i];
      marks.push(crossed(y, r) ? '.' : `X@(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)})`);
      ys[r][i] = y;
    });
    console.log(`  s3/cell r=${r} 2r=${2 * r}: o 0/.15/.3/.5/.7/.9/1.2 -> ${marks.join(' ')}`);
  }
  // The lead's original phantom, pinned: overhang 0.5 at r=0.25 halts past
  // the wall's far face with the field reading exactly the player radius.
  assert.ok(Math.abs(ys[0.25][3] - 2.05) < 0.05, `far-mouth halt must sit at y=2.05, got ${ys[0.25][3]}`);
  // Verdicts match E3 everywhere measured: block at or below 2r, cross above
  // (r=0.25 o=0.5 blocks at the far mouth, like E3 blocks at the near one).
  assert.deepEqual(ys[0.125].map((y) => crossed(y, 0.125)), [false, false, true, true, true, true, true]);
  assert.deepEqual(ys[0.25].map((y) => crossed(y, 0.25)), [false, false, false, false, true, true, true]);
  assert.deepEqual(ys[0.5].map((y) => crossed(y, 0.5)), [false, false, false, false, false, false, true]);
});

console.log(`\nphantom-carve: ${passed} checks passed\n`);
