import assert from 'node:assert/strict';
import { createSphericalCover } from './engine/geometry/spherical-cover.js';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { compileFramedPortals } from './engine/world/region-portal.js';

// MUSE-58 independent global-aperture crossing evidence. No math repairs here:
// this suite only queries the existing compileFramedPortals/createSphericalCover
// and cross-checks every S3 answer against an independent sampling oracle.
// The oracle is numerical sampling, not proof: it brackets signed-height sign
// changes with its own great-circle evaluator, bisects, and applies the local
// metric/chord disc check directly.

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const add = (a, b) => a.map((x, i) => x + b[i]);
const smul = (v, s) => v.map((x) => x * s);
const clamp1 = (x) => Math.max(-1, Math.min(1, x));
// Ambient rotation in the X-W plane: an isometry of the cover sphere, so the
// rotated (center, normal, up) frame stays orthonormal and tangent.
const rotXW = (v, phi) => {
  const [x, y, z, w] = v, c = Math.cos(phi), s = Math.sin(phi);
  return [c * x - s * w, y, z, s * x + c * w];
};

const RADII = [0.5, 8, 10000];
const PHIS = [0, 0.9, 1.8]; // 3 rotations x 5 rays x 3 R = 45 rotated rays (<= 60)
const ALPHA = 0.2; // back-side offset angle (radians) for the full-orbit entry

function gatePair(R, phi, aperture, playerRadius) {
  const s = createSphericalCover({ curvatureRadius: R });
  const e = createMetricSpace({ kind: 'e3', maxDistance: 20 });
  const center = rotXW([0, 0, 0, 1], phi);
  const normal = rotXW([1, 0, 0, 0], phi);
  const up = rotXW([0, 0, 1, 0], phi);
  const [gate, back] = compileFramedPortals(
    [{ id: 'link', kind: 'portal', a: 'sg', b: 'fg', velocity: 'preserve-speed', scale: 1 }],
    [
      { id: 'sg', regionId: 'sphere', radius: aperture, space: s, center, normal, up },
      { id: 'fg', regionId: 'flat', radius: aperture, space: e,
        center: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, 1] },
    ],
    playerRadius);
  return { s, e, gate, back, center, normal, up };
}

// Independent oracle: own great-circle evaluator, sample for + to -
// (entering = decreasing, matching the engine convention) signed-height sign
// changes, bisect, then metric + chord disc check. Transverse crossings only;
// a grazing orbit could hide between samples, so this is a cross-check.
function oracleCrossing(s, p, u, center, normal, R, aperture, bodyRadius, maxTravel) {
  const pos = (t) => {
    const a = t / R, c = Math.cos(a), sn = Math.sin(a);
    return p.map((x, i) => c * x + sn * u[i]);
  };
  const height = (t) => R * Math.asin(clamp1(dot(pos(t), normal)));
  const N = 720, hits = [];
  let prevT = 0, prevH = height(0);
  for (let i = 1; i <= N; i++) {
    const t = (maxTravel * i) / N, h = height(t);
    if (prevH > 0 && h < 0) {
      let lo = prevT, hi = t;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        (height(mid) > 0 ? lo = mid : hi = mid);
      }
      hits.push((lo + hi) / 2);
    }
    prevT = t; prevH = h;
  }
  for (const t of hits) {
    if (t <= 1e-9 || t > maxTravel + 1e-9) continue;
    const at = pos(t);
    const d = s.distance(center, at);
    const chord = Math.hypot(...at.map((x, i) => x - center[i]));
    assert.ok(Math.abs(chord - 2 * Math.sin(d / (2 * R))) < 1e-9,
      `metric/chord disc disagreement: ${chord} vs ${d}`);
    if (d + bodyRadius <= aperture - 1e-7) return { distance: t, at };
  }
  return null;
}

function checkAgree(s, engine, oracle, label, R) {
  const tolT = 1e-6 * R;
  if (oracle === null) {
    assert.equal(engine, null, `${label}: engine hit where oracle finds none`);
    return;
  }
  assert.ok(engine, `${label}: engine null where oracle hits at ${oracle.distance}`);
  assert.ok(Math.abs(engine.distance - oracle.distance) <= tolT,
    `${label}: distance ${engine.distance} vs oracle ${oracle.distance}`);
  assert.ok(s.distance(engine.at, oracle.at) <= tolT, `${label}: at-point mismatch`);
}

let rotated = 0;
for (const R of RADII) {
  const aperture = R < 1 ? 0.4 : 0.9;
  const playerRadius = R < 1 ? 0.1 : 0.25;
  for (const phi of PHIS) {
    const { s, gate, center, normal } = gatePair(R, phi, aperture, playerRadius);
    const h0 = 0.1 * aperture;
    // 1. Full-orbit entry: negative signedHeight start, hit beyond pi R.
    {
      const p = s.expAt(center, smul(normal, -ALPHA * R));
      assert.ok(gate.signedHeight(p) < 0, 'full-orbit start must read negative');
      const u = s.transport(center, p, smul(normal, -1));
      const maxTravel = 2 * Math.PI * R * (1 + 1e-3);
      const ev = gate.crossing(p, u, maxTravel, 0);
      const or = oracleCrossing(s, p, u, center, normal, R, aperture, 0, maxTravel);
      checkAgree(s, ev, or, `R=${R} phi=${phi} full-orbit`, R);
      assert.ok(ev && ev.distance > Math.PI * R, 'full-orbit hit must lie beyond pi R');
      assert.ok(Math.abs(ev.distance - (2 * Math.PI - ALPHA) * R) <= 1e-9 * R,
        `full-orbit distance ${ev.distance} vs ${(2 * Math.PI - ALPHA) * R}`);
      rotated++;
    }
    // 2. Front-side direct entry: short hit at the starting height.
    {
      const p = s.expAt(center, smul(normal, h0));
      const u = s.transport(center, p, smul(normal, -1));
      const maxTravel = 2 * Math.PI * R;
      const ev = gate.crossing(p, u, maxTravel, 0);
      const or = oracleCrossing(s, p, u, center, normal, R, aperture, 0, maxTravel);
      checkAgree(s, ev, or, `R=${R} phi=${phi} direct`, R);
      assert.ok(Math.abs(ev.distance - h0) <= 1e-9 * R, `direct distance ${ev.distance} vs ${h0}`);
      // Too-short maxTravel on the same ray: no event.
      assert.equal(gate.crossing(p, u, h0 - 0.05 * aperture, 0), null,
        'too-short maxTravel must miss');
      rotated++;
    }
    // 3. Zero-time side ambiguity: on-plane inward start is NOT a zero event;
    // it yields the future full-period 2 pi R event.
    {
      const p = center.slice(), u = smul(normal, -1);
      assert.ok(Math.abs(gate.signedHeight(p)) <= 1e-9, 'start must read on-plane');
      const maxTravel = 2 * Math.PI * R * (1 + 1e-3);
      const ev = gate.crossing(p, u, maxTravel, 0);
      const or = oracleCrossing(s, p, u, center, normal, R, aperture, 0, maxTravel);
      checkAgree(s, ev, or, `R=${R} phi=${phi} on-plane`, R);
      assert.ok(ev && ev.distance > 0, 'on-plane inward must not report zero time');
      assert.ok(Math.abs(ev.distance - 2 * Math.PI * R) <= 1e-9 * R,
        `on-plane event ${ev.distance} vs ${2 * Math.PI * R}`);
      assert.equal(gate.crossing(p, u, 2 * Math.PI * R - 0.01 * R, 0), null,
        'too-short maxTravel must miss the 2 pi R event');
      rotated++;
    }
    // 4/5. Exact antipodal start (outside the local disc): +direction hits at
    // pi R, the reversed direction has no event. Positive/negative pair.
    {
      const p = smul(center, -1);
      assert.ok(Math.abs(s.distance(center, p) - Math.PI * R) <= 1e-9 * R,
        'antipode must sit pi R away');
      assert.ok(s.distance(center, p) > aperture, 'antipodal start is outside the disc');
      const maxTravel = Math.PI * R * (1 + 1e-3);
      const hit = gate.crossing(p, normal.slice(), maxTravel, 0);
      const orHit = oracleCrossing(s, p, normal.slice(), center, normal, R, aperture, 0, maxTravel);
      checkAgree(s, hit, orHit, `R=${R} phi=${phi} antipodal+`, R);
      assert.ok(hit && Math.abs(hit.distance - Math.PI * R) <= 1e-9 * R,
        `antipodal distance ${hit && hit.distance} vs ${Math.PI * R}`);
      assert.ok(s.distance(hit.at, center) <= 1e-9 * R, 'antipodal hit must land at the aperture');
      const miss = gate.crossing(p, smul(normal, -1), 2 * Math.PI * R * (1 + 1e-3), 0);
      const orMiss = oracleCrossing(s, p, smul(normal, -1), center, normal, R,
        aperture, 0, 2 * Math.PI * R * (1 + 1e-3));
      assert.equal(orMiss, null, 'oracle must also miss the reversed antipodal ray');
      assert.equal(miss, null, 'reversed antipodal direction must miss');
      rotated += 2;
    }
  }
}
assert.ok(rotated <= 60, `rotated ray budget exceeded: ${rotated}`);

// Unrotated supplementary cases per R: radial/body fit, antipodal-disc null,
// E3/S3 roundtrip frames and speed.
for (const R of RADII) {
  const aperture = R < 1 ? 0.4 : 0.9;
  const playerRadius = R < 1 ? 0.1 : 0.25;
  const tolP = 1e-9 * R;
  const { s, e, gate, back, center, normal, up } = gatePair(R, 0, aperture, playerRadius);
  const h = 0.1 * aperture;
  // Offset ray: plane crossing at nonzero radial offset.
  const deltaHit = 0.5 * aperture;
  const p = s.expAt(center, add(smul(normal, h), smul(up, deltaHit)));
  const u = s.transport(center, p, smul(normal, -1));
  const maxTravel = 2 * Math.PI * R;
  const ev = gate.crossing(p, u, maxTravel, 0);
  const or = oracleCrossing(s, p, u, center, normal, R, aperture, 0, maxTravel);
  checkAgree(s, ev, or, `R=${R} offset`, R);
  assert.ok(ev, 'offset ray must hit');
  const rho = s.distance(center, ev.at);
  assert.ok(rho > 1e-12 * R && rho + 0 <= aperture - 1e-7, 'offset landing must sit inside the disc');
  // Finite body fit: too-large body misses, fitting body hits.
  assert.equal(gate.crossing(p, u, maxTravel, aperture - rho + 0.02), null,
    'oversize body must miss');
  assert.equal(oracleCrossing(s, p, u, center, normal, R,
    aperture, aperture - rho + 0.02, maxTravel), null, 'oracle must also miss the oversize body');
  const fit = gate.crossing(p, u, maxTravel, aperture - rho - 0.05);
  assert.ok(fit, 'fitting body must hit');
  // Far offset: plane crossing outside the finite disc.
  const pFar = s.expAt(center, add(smul(normal, h), smul(up, aperture + 0.1 * aperture)));
  const uFar = s.transport(center, pFar, smul(normal, -1));
  assert.equal(gate.crossing(pFar, uFar, maxTravel, 0), null, 'far offset must miss the disc');
  assert.equal(oracleCrossing(s, pFar, uFar, center, normal, R, aperture, 0, maxTravel), null,
    'oracle must also miss the far offset');
  // No event at the antipodal disc: front-side start moving away loops through
  // the antipode, never entering through the local disc.
  const pAway = s.expAt(center, smul(normal, h));
  const uAway = s.transport(center, pAway, normal);
  assert.equal(gate.crossing(pAway, uAway, maxTravel, 0), null,
    'front-side ray moving away must never enter');
  assert.equal(oracleCrossing(s, pAway, uAway, center, normal, R, aperture, 0, maxTravel), null,
    'oracle must agree on the antipodal-disc null');
  // Source/destination roundtrip frames and speed, both directions.
  const q = s.expAt(center, smul(up, 0.2 * aperture));
  const m1 = gate.transit(q), m0 = back.transit(m1.position);
  assert.ok(s.distance(m0.position, q) <= tolP, `S3 roundtrip drift ${s.distance(m0.position, q)}`);
  const v = smul(s.transport(center, q, normal), 2);
  const out = m1.carry(v), rt = m0.carry(out);
  assert.ok(Math.abs(Math.hypot(...out) - 2) <= 1e-9, 'transit must preserve speed S3->E3');
  assert.ok(Math.hypot(...rt.map((x, i) => x - v[i])) <= tolP, 'carry roundtrip must invert S3->E3');
  const qe = [0.1 * aperture, 0, 0.05 * aperture];
  const n1 = back.transit(qe), n0 = gate.transit(n1.position);
  assert.ok(e.distance(n0.position, qe) <= tolP, 'E3 roundtrip must invert');
  const ve = [0, 2, 0];
  const oute = n1.carry(ve), rte = n0.carry(oute);
  assert.ok(Math.abs(Math.hypot(...oute) - 2) <= 1e-9, 'transit must preserve speed E3->S3');
  assert.ok(Math.hypot(...rte.map((x, i) => x - ve[i])) <= tolP, 'carry roundtrip must invert E3->S3');
}

console.log(`global portal truth: ${rotated} rotated rays + radial/body/antipodal/roundtrip cases at R=0.5,8,10000 passed`);
