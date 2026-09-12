import assert from 'node:assert/strict';
import { createHyperbolicSpace } from './engine/geometry/hyperbolic-space.js';
import { sampleHyperbolicBall, castHyperbolicBalls } from './engine/geometry/hyperbolic-balls.js';

// MUSE-67 truth corpus for experimental hyperbolic-balls.js.
// Reference: bisection on g(t)=distance(step(p,u,t),center)-radius with a
// verified sign-change bracket from a dense scan. The reference is
// independent of the production A/B/C/D/H root formula ONLY: it shares the
// production space's distance/step, so it is not fully independent truth.
// A found bracket plus bisection supports the observed entry, but the scan
// cannot certify a miss (scan-only no-hit is sampled evidence, counted
// separately) nor exclude an earlier narrow dip or tangent touch that falls
// between samples. A confident production hit/miss must agree with the
// reference; unresolved is always an acceptable answer (heuristic unknown).
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function refEntry(s, p, u, ball, end) {
  const g = (t) => s.distance(s.step(p, u, t), ball.center) - ball.radius;
  if (g(0) <= 0) return { kind: 'inside' };
  const N = 2000;
  let prev = 0;
  for (let i = 1; i <= N; i++) {
    const t = end * i / N;
    if (g(t) <= 0) {
      let a = prev, b = t;
      for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (g(m) <= 0) b = m; else a = m; }
      return { kind: 'hit', t: b };
    }
    prev = t;
  }
  // No bracket found: sampled evidence only, NOT a certified miss. A narrow
  // dip or tangent touch between samples would escape this scan.
  return { kind: 'sampled-miss' };
}
function randTangent(s, rng, p) {
  const raw = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1];
  const t = s.tangentPart(p, raw), n = s.norm(p, t);
  return n < 1e-6 ? randTangent(s, rng, p) : t.map((x) => x / n);
}

let agree = 0, sampled = 0, narrow = 0, unknown = 0;
let uIn = 0, uHit = 0, uSamp = 0;
for (const R of [.5, 8, 10000]) {
  const s = createHyperbolicSpace({ curvatureRadius: R });
  const rng = mulberry32(67);
  for (let k = 0; k < 40; k++) {
    let p;
    try { p = s.decode([(rng() * 2 - 1) * 1.2 * R, (rng() * 2 - 1) * 1.2 * R, (rng() * 2 - 1) * 1.2 * R]); }
    catch { k--; continue; }
    if (!s.withinDomain(p)) { k--; continue; }
    const u = randTangent(s, rng, p);
    const boundary = s.boundaryDistance(p, u);
    const maxD = Math.min(boundary * 0.999, (0.5 + rng() * 2) * R);
    const balls = [];
    // Aim one ball at the ray so the sweep is not all-misses: centre near
    // gamma(t*) with an offset perpendicular to the ray (ray direction
    // transported to the aim point, parallel component projected out) of
    // size inside (hit), near (grazing) or outside (clean miss) the radius.
    {
      const tStar = (0.1 + rng() * 0.8) * maxD;
      const aim = s.step(p, u, tStar);
      const fwd = s.transport(p, aim, u);
      let side = null;
      for (let a = 0; a < 32 && !side; a++) {
        const perp = s.project(aim, randTangent(s, rng, aim), fwd);
        const n = s.norm(aim, perp);
        if (n > 0.1) side = perp.map((x) => x / n);
      }
      assert.ok(side, `R=${R} seed=${k}: perpendicular side construction failed`);
      assert.ok(Math.abs(s.dot(aim, side, fwd)) < 1e-9, 'aim offset must be perpendicular to the ray');
      const radius = (0.05 + rng() * 0.45) * R;
      const mode = k % 3; // 0: direct hit, 1: off-axis hit, 2: near miss
      const off = mode === 0 ? 0 : mode === 1 ? 0.5 * radius : 2 * radius;
      const ac = s.expAt(aim, side.map((x) => x * off));
      balls.push({ id: 'aimed', center: s.withinDomain(ac) ? ac : aim, radius });
    }
    for (let j = 0; j < Math.floor(rng() * 2); j++) {
      try {
        balls.push({
          id: `bg${j}`,
          center: s.decode([(rng() * 2 - 1) * 1.5 * R, (rng() * 2 - 1) * 1.5 * R, (rng() * 2 - 1) * 1.5 * R]),
          radius: (0.05 + rng() * 0.5) * R,
        });
      } catch { /* outside domain: skip */ }
    }
    const got = castHyperbolicBalls(s, balls, p, u, { maxDistance: maxD });
    const end = Math.min(maxD, boundary);
    let ref = { kind: 'sampled-miss' };
    for (const b of balls) {
      const r = refEntry(s, p, u, b, end);
      if (r.kind === 'inside') { ref = { kind: 'inside', ball: b }; break; }
      if (r.kind === 'hit' && (ref.kind !== 'hit' || r.t < ref.t)) ref = { kind: 'hit', t: r.t, ball: b };
    }
    if (got.status === 'hit') {
      const gb = balls.find((b) => b.id === got.id);
      assert.ok(gb, `R=${R} seed=${k}: hit claims unknown ball ${got.id}`);
      if (ref.kind === 'hit') {
        assert.equal(got.id, ref.ball.id, `R=${R} seed=${k}: closest-order mismatch`);
        assert.ok(Math.abs(got.distance - ref.t) < 1e-6 * R,
          `R=${R} seed=${k}: hit at ${got.distance}, reference ${ref.t}`);
        agree++;
      } else {
        // Scan found no bracket: narrow event the scan missed, or a false
        // production hit. Directly verify the claimed entry on the shared
        // distance/step rather than trusting either side.
        assert.equal(ref.kind, 'sampled-miss', `R=${R} seed=${k}: hit but reference ${ref.kind}`);
        const gg = (t) => s.distance(s.step(p, u, t), gb.center) - gb.radius;
        assert.ok(Math.abs(gg(got.distance)) < 1e-6 * R,
          `R=${R} seed=${k}: claimed hit at ${got.distance} not on surface (g=${gg(got.distance)})`);
        assert.ok(gg(got.distance + 1e-6 * R) < 0,
          `R=${R} seed=${k}: claimed hit has no interior just beyond`);
        narrow++;
      }
    } else if (got.status === 'miss') {
      assert.ok(ref.kind !== 'hit', `R=${R} seed=${k}: confident miss but reference hits at ${ref.t}`);
      assert.ok(ref.kind !== 'inside', `R=${R} seed=${k}: confident miss but ray starts inside`);
      assert.equal(ref.kind, 'sampled-miss');
      sampled++;
    } else {
      assert.equal(got.status, 'unresolved', 'query must use the declared result vocabulary');
      unknown++;
      if (ref.kind === 'inside') uIn++;
      else if (ref.kind === 'hit') uHit++;
      else uSamp++;
    }
  }

  // Outward normals vs intrinsic finite differences on an on-axis hit.
  const p0 = s.origin, u0 = [1, 0, 0, 0];
  const ball0 = { id: 'n', center: s.decode([R, 0, 0]), radius: 0.2 * R };
  const h = castHyperbolicBalls(s, [ball0], p0, u0, { maxDistance: 1.5 * R });
  assert.equal(h.status, 'hit');
  const eps = 1e-6 * R, n0 = h.normal;
  assert.ok(Math.abs(s.norm(h.point, n0) - 1) < 1e-9, 'hit normal must be unit');
  const d0 = sampleHyperbolicBall(s, ball0, h.point).distance;
  assert.ok(Math.abs(d0) < 1e-9 * R, 'hit point must lie on the surface');
  const dAlong = sampleHyperbolicBall(s, ball0, s.expAt(h.point, n0.map((x) => x * eps))).distance;
  assert.ok(Math.abs((dAlong - d0) / eps - 1) < 1e-3, 'outward normal must grow distance at unit rate');
  const nn = s.dot(h.point, n0, n0), f1 = s.frame(h.point)[1];
  const perp = f1.map((x, i) => x - n0[i] * s.dot(h.point, f1, n0) / nn);
  const pn = s.norm(h.point, perp);
  const dSide = sampleHyperbolicBall(s, ball0, s.expAt(h.point, perp.map((x) => x / pn * eps))).distance;
  assert.ok(Math.abs((dSide - d0) / eps) < 1e-2, 'transverse motion must leave distance flat');

  // Closest order beats array order.
  const near = { id: 'near', center: s.decode([R, 0, 0]), radius: 0.2 * R };
  const far = { id: 'far', center: s.decode([1.4 * R, 0, 0]), radius: 0.2 * R };
  for (const order of [[near, far], [far, near]]) {
    const q = castHyperbolicBalls(s, order, p0, u0, { maxDistance: 1.8 * R });
    assert.equal(q.status, 'hit'); assert.equal(q.id, 'near');
  }

  // Overlapping / inside starts refuse, never claim.
  const c0 = s.decode([0.3 * R, 0, 0]);
  const inner = { id: 'in', center: c0, radius: 0.5 * R };
  assert.equal(castHyperbolicBalls(s, [inner], p0, u0, { maxDistance: R }).reason, 'inside-start');
  assert.equal(castHyperbolicBalls(s, [inner], c0, s.frame(c0)[0], { maxDistance: R }).reason, 'inside-start');

  // Near-tangent refuses; a clearly-clear ray shows no scan bracket
  // (sampled evidence only, not a certified miss).
  const foot = s.decode([0.8 * R, 0, 0]), side = s.frame(foot)[1];
  const grazed = { id: 'g', center: s.step(foot, side, 0.3001 * R), radius: 0.3 * R };
  const gq = castHyperbolicBalls(s, [grazed], p0, u0, { maxDistance: 1.8 * R });
  const gr = refEntry(s, p0, u0, grazed, Math.min(1.8 * R, s.boundaryDistance(p0, u0)));
  assert.equal(gr.kind, 'sampled-miss');
  assert.equal(gq.status, gq.status === 'miss' ? 'miss' : 'unresolved');
  // Range edge: entry exactly at maxDistance refuses; strictly short range misses.
  assert.equal(castHyperbolicBalls(s, [ball0], p0, u0, { maxDistance: 0.8 * R }).status, 'unresolved');
  assert.equal(castHyperbolicBalls(s, [ball0], p0, u0, { maxDistance: 0.7 * R }).status, 'miss');

  // Domain: empty cast exits through the boundary; coincident roots refuse.
  assert.equal(castHyperbolicBalls(s, [], p0, u0, { maxDistance: 2 * R }).reason, 'domain-exit');
  assert.equal(castHyperbolicBalls(s, [ball0, { ...ball0, id: 'twin' }], p0, u0, { maxDistance: 1.5 * R }).status, 'unresolved');

  // Budget exhaustion refuses the whole query.
  assert.equal(castHyperbolicBalls(s, [ball0], p0, u0, { maxDistance: R, maxTests: 0 }).reason, 'work-budget');
}
console.log(`H3 balls truth: ${agree} observed hit-hit, ${sampled} sampled miss-miss, ${narrow} narrow scan-miss verified direct, ${unknown} heuristic unknowns (inside:${uIn} hit-refused:${uHit} sampled:${uSamp}), 0 observed false confident answers`);
