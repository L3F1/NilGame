// MUSE-31: coincident faces, characterised, no forced number.
//
// DEFECT SIGNAL, stated before sweeping: neighbouring rays in a fan across
// the sill whose hit (owner or normal) disagrees where the geometry is the
// same face -- flips NOT explained by the hit segment crossing a box face,
// touching one face at exactly one end (grazing a jamb), or passing within
// 5e-3 of a box edge. A box HAS edges, so edge crossings are legitimate and
// excluded explicitly; the touch tolerance follows the path's own stopping
// precision (exact for analytic, 2*hitEpsilon for march).
//
// What the sweep found, both paths separately:
// - Analytic never disagrees with itself (suspect 0 in every config), and on
//   rays crossing exactly-coincident faces it returns status
//   'indeterminate' (reason floating-point-boundary) instead of guessing --
//   at every other offset, even +-1e-12, that flag is absent.
// - March agrees everywhere EXCEPT exact-zero offsets on wide sills, where
//   neighbouring rays dither between the coplanar faces with identical
//   normals -- the on-screen speckle mechanism, reproduced in Node.
// There is no warning DISTANCE here: both signals live at exactly zero.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSceneField } from './engine/world/scene-field.js';

const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const base = JSON.parse(readFileSync(new URL('./levels/fixtures/box-room.nil.json', import.meta.url), 'utf8'));

function boxEdges(center, half) {
  const segs = [];
  for (const ax of [0, 1, 2]) {
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const a = center.slice(), b = center.slice();
      a[o1] = center[o1] + s1 * half[o1]; a[o2] = center[o2] + s2 * half[o2];
      a[ax] = center[ax] - half[ax]; b[o1] = a[o1]; b[o2] = a[o2]; b[ax] = center[ax] + half[ax];
      segs.push([a, b]);
    }
  }
  return segs;
}
function distToSeg(p, [a, b]) {
  const ab = sub(b, a), t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / dot(ab, ab)));
  return Math.hypot(...sub(p, a.map((x, i) => x + t * ab[i])));
}
function segSegDist(p, q, [a, b]) {
  const d1 = sub(q, p), d2 = sub(b, a), r = sub(p, a);
  const a1 = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const s = dot(d1, d2), t = dot(d1, r), denom = a1 * e - s * s;
  let sc = denom > 1e-18 ? Math.min(1, Math.max(0, (s * f - t * e) / denom)) : 0;
  let tc = e > 1e-18 ? (s * sc + f) / e : 0;
  tc = Math.min(1, Math.max(0, tc));
  sc = a1 > 1e-18 ? Math.min(1, Math.max(0, (s * tc - t) / a1)) : 0;
  return Math.hypot(...sub(p.map((x, i) => x + sc * d1[i]), a.map((x, i) => x + tc * d2[i])));
}
function explained(p, q, boxes, touchTol) {
  for (const { center, half } of boxes) {
    for (let ax = 0; ax < 3; ax++) {
      const o = [(ax + 1) % 3, (ax + 2) % 3];
      for (const f of [center[ax] + half[ax], center[ax] - half[ax]]) {
        const da = p[ax] - f, db = q[ax] - f;
        const inRect = (pt) => o.every((i) => Math.abs(pt[i] - center[i]) <= half[i] + 1e-9);
        if (da * db < 0) {
          const t = (f - p[ax]) / (q[ax] - p[ax]);
          if (inRect(p.map((x, i) => x + t * (q[i] - x)))) return true;
        }
        if ((Math.abs(da) < touchTol) !== (Math.abs(db) < touchTol)) {
          if (inRect(Math.abs(da) < touchTol ? p : q)) return true;
        }
      }
    }
    const edges = boxEdges(center, half);
    if (edges.some((s) => segSegDist(p, q, s) < 5e-3)) return true;
    if (edges.some((s) => distToSeg(p, s) < 5e-3 || distToSeg(q, s) < 5e-3)) return true;
  }
  return false;
}

function makeField(offset, size = 1) {
  const d = JSON.parse(JSON.stringify(base));
  d.id = 'sweep';
  const door = d.entities.find((e) => e.id === 'doorway');
  door.halfExtent = [0.8 * size, 1 * size, 1.05 * size];
  door.position = [0, 1.5, offset + 1.05 * size]; // bottom face at `offset`
  return { field: compileSceneField(d), boxes: d.entities.filter((e) => e.kind === 'box')
    .map((e) => ({ center: e.position, half: e.halfExtent })) };
}

let passed = 0, failed = 0, fans = 0, rays = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

// One 41-ray fan; returns suspect/ambiguity counts per method.
function sweepFan(offset, origin, label, { hitEpsilon = 1e-6, size = 1 } = {}) {
  const { field: f, boxes } = makeField(offset, size);
  const out = {};
  for (const method of ['analytic', 'march']) {
    const casts = [];
    for (let i = 0; i <= 40; i++) {
      const x = -1.5 * size + ((3 * size) * i) / 40;
      casts.push(f.rayCast(origin, norm(sub([x, 1.5, 0.05], origin)), { method, hitEpsilon }));
      rays++;
    }
    let suspect = 0, indet = 0;
    for (const r of casts) if (r.status === 'indeterminate') indet++;
    for (let i = 0; i < casts.length - 1; i++) {
      const a = casts[i], b = casts[i + 1];
      if (!a.hit || !b.hit || !a.normal || !b.normal) continue;
      const ang = Math.acos(Math.min(1, Math.max(-1, dot(a.normal, b.normal))));
      const ownerA = a.surfaceOwner ?? a.owner, ownerB = b.surfaceOwner ?? b.owner;
      if ((ang > 1e-6 || ownerA !== ownerB)
        && !explained(a.point, b.point, boxes, method === 'analytic' ? 1e-9 : 2 * hitEpsilon)) {
        suspect++;
        if (suspect === 1) console.log(`  first suspect: ${label} ${method} offset=${offset} eps=${hitEpsilon} `
          + `owners ${ownerA}->${ownerB} ang ${ang.toFixed(4)} at ${JSON.stringify(a.point.map((v) => +v.toFixed(3)))}`);
      }
    }
    out[method] = { suspect, indet };
  }
  fans++;
  return out;
}

const OFFSETS = [0, 1e-12, -1e-12, 1e-9, -1e-9, 1e-6, -1e-6, 1e-4, -1e-4, 1e-3, -1e-3, 0.01, -0.01, -0.25];
check('analytic: no self-disagreement; indeterminates only at exact zero', () => {
  let zeroTotal = 0;
  for (const offset of OFFSETS) {
    const { analytic: s } = sweepFan(offset, [0, -4, 2], 'spawn');
    assert.equal(s.suspect, 0, `analytic offset=${offset}: ${s.suspect} suspect`);
    if (offset === 0) zeroTotal += s.indet;
    else assert.equal(s.indet, 0, `analytic offset=${offset}: ${s.indet} indeterminate`);
  }
  console.log(`  analytic indeterminates at exact zero (spawn view): ${zeroTotal}/41 rays`);
  assert.ok(zeroTotal > 0, 'the ambiguity flag must fire on exact coincidence');
});

check('march: clean except wide coincident sills', () => {
  for (const offset of OFFSETS) {
    const { march: s } = sweepFan(offset, [0, -4, 2], 'spawn');
    assert.equal(s.suspect, 0, `march offset=${offset}: ${s.suspect} suspect`);
  }
  for (const size of [0.5, 1, 1.5]) {
    const { march: s } = sweepFan(0, [0, -4, 2], `size${size}`, { size });
    assert.equal(s.suspect, 0, `march size=${size}: ${s.suspect} suspect`);
  }
  for (const size of [2, 3]) {
    const { march: s } = sweepFan(0, [0, -4, 2], `size${size}`, { size });
    console.log(`  march dither at size=${size}, exact zero: ${s.suspect} suspect pairs`);
    assert.ok(s.suspect > 0, `size=${size} should dither (range pin)`);
  }
  for (const offset of [1e-9, -1e-9, 1e-6, -0.25]) {
    const { march: s } = sweepFan(offset, [0, -4, 2], 'spawn2', { size: 3 });
    assert.equal(s.suspect, 0, `march size=3 offset=${offset}: dither must stop off exact zero`);
  }
});

check('cameras, epsilon, sizes: no other signal', () => {
  for (const offset of [0, 1e-6, -1e-6, -0.25]) {
    for (const [origin, label] of [[[0, -2.2, 1.1], 'close'], [[0, -10, 4], 'far'], [[0, -6, 0.6], 'grazing']]) {
      const r = sweepFan(offset, origin, label);
      assert.equal(r.analytic.suspect, 0, `analytic ${label} offset=${offset}`);
      assert.equal(r.march.suspect, 0, `march ${label} offset=${offset}`);
      if (offset !== 0) assert.equal(r.analytic.indet, 0, `analytic ${label} offset=${offset}: flag off zero`);
    }
  }
  for (const eps of [1e-9, 1e-3]) {
    for (const offset of [0, -1e-6, -0.25]) {
      const r = sweepFan(offset, [0, -4, 2], 'eps', { hitEpsilon: eps });
      assert.equal(r.march.suspect, 0, `march eps=${eps} offset=${offset}`);
    }
  }
});

check('the machinery is live: an edge graze reports touch', () => {
  const { field: f } = makeField(0);
  const r = f.rayCast([0, -4, 2], norm(sub([0, 1.2, 2.8], [0, -4, 2])), { method: 'analytic' });
  assert.equal(r.contact, 'touch', `edge graze should report touch, got ${r.contact}`);
});

console.log(`\ncoincident: ${fans} fans, ${rays} casts, ${passed} checks passed, ${failed} failed\n`);
if (failed) process.exit(1);
