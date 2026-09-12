import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe, resumeRegionCorrection } from './engine/world/region-motion.js';
import { createCameraFrame } from './engine/world/camera-frame.js';

// MUSE-69 independent consumer audit: explicit aperture movement refusals.
// Deterministic injected query producers on compiled E3/S3 worlds. Every
// producer here measures per-leg RELATIVE ranges: uncertaintyFrom is counted
// from the leg-start position handed to that call, never from a whole move.
// A discovered counterexample is preferred to counts; this file only reports.

// --- shared builders -------------------------------------------------------
const BALL = [0, 2, 0], BR = 0.5, PR = 0.1;
function e3world(ballAt = null) {
  return {
    ...compileRegionWorld({ format: 'nil-scene', version: 2, id: 'truth-motion',
      units: { name: 'design-unit', playerRadius: PR },
      regions: ['a', 'b'].map((id) => ({ id, geometry: { kind: 'e3', curvatureRadius: 1 }, extent: 6, topology: 'cover' })),
      entities: [...['a', 'b'].map((regionId) => ({ id: `spawn-${regionId}`, kind: 'spawn', regionId, position: [0, 0, 0] })),
        ...(ballAt ? [{ id: 'solid', regionId: 'a', kind: 'ball', position: ballAt, radius: BR }] : [])],
      connections: [] }),
  };
}
function e3state(w, chart, vel, speed = 1, regionId = 'a') {
  const s = w.regions.get(regionId).space, p = s.decode(chart), f = s.frame(p);
  const n = Math.hypot(...vel), dir = vel.map((x) => (x / n) * speed);
  return { regionId, position: p, velocity: dir, radius: PR,
    camera: createCameraFrame(s, p, { forward: vel.map((x) => x / n), up: f[2] }) };
}
// A gate whose centre-plane sits at chart height `at` on the +y axis.
const gate = (id, at, seen) => ({ id, fromId: id, fromRegionId: 'a', toRegionId: 'b',
  crossing: (p, u, d) => { seen.push({ y: p[1], d }); return d >= at - p[1] ? { status: 'hit', distance: at - p[1] } : { status: 'miss', checkedDistance: d }; },
  signedHeight: (p) => at - p[1],
  transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 1, 0] }) });
const refusalAt = (bound, seen, reason = 'truth-band') => (p, u, d) => {
  seen.push({ y: p[1], d });
  const clearance = bound - p[1];
  return clearance > d ? { status: 'miss', checkedDistance: d }
    : { status: 'unresolved', reason, distance: 999, uncertaintyFrom: Math.max(0, clearance) };
};
const originRefusal = (seen, packet) => (p, u, d) => { seen.push({ d }); return packet; };
const missAll = (seen) => (p, u, d) => { seen.push({ y: p[1], d }); return { status: 'miss', checkedDistance: d }; };
const norm = (v) => Math.hypot(...v);
function checkLegBounds(seen, dt, speed, label) {
  assert.ok(seen.length > 0, `${label}: producer never queried`);
  for (const c of seen) {
    assert.ok(Number.isFinite(c.d) && c.d > 0 && c.d <= dt * speed + 1e-9, `${label}: leg range not relative/bounded: ${c.d}`);
  }
}

// 1. Every aperture sees the same bounded per-leg segment; a definite nearer
// gate then transits and source apertures go quiet afterwards.
{
  const w = e3world(), seenGate = [], seenWit = [];
  w.portals = [gate('gate', 1, seenGate),
    { id: 'wit', fromId: 'wit', fromRegionId: 'a', toRegionId: 'b', crossing: missAll(seenWit),
      signedHeight: () => 1, transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 1, 0] }) }];
  const s = e3state(w, [0, 0, 0], [0, 1, 0]);
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'complete'); assert.equal(r.crossings, 1); assert.equal(r.state.regionId, 'b');
  assert.deepEqual(seenGate.map((c) => c.d), seenWit.map((c) => c.d));
  checkLegBounds(seenGate, 2, 1, 'shared-segment');
  console.log('truth 1: shared per-leg segment, gate transit OK');
}

// 2. A miss that does not cover the whole requested leg refuses at zero.
{
  const w = e3world(), seen = [];
  w.portals = [{ id: 'short', fromId: 'short', fromRegionId: 'a', toRegionId: 'b',
    crossing: (p, u, d) => { seen.push({ d }); return { status: 'miss', checkedDistance: d / 2 }; },
    signedHeight: () => 1, transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 1, 0] }) }];
  const s = e3state(w, [0, 0, 0], [0, 1, 0]), snap = JSON.stringify({ ...s, camera: 0 });
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.equal(r.timeConsumed, 0); assert.equal(r.timeRemaining, 2);
  assert.deepEqual(r.state.position, s.position); assert.equal(r.crossings, 0);
  assert.equal(r.events[0].apertures[0].reason, 'invalid-aperture-result');
  assert.equal(JSON.stringify({ ...s, camera: 0 }),snap);
  console.log('truth 2: short-covered miss refuses at zero OK');
}

// 3. Unknown at zero during travel: unresolved/unknown packets, full preservation.
for (const packet of [{ status: 'unresolved', distance: 4 }, { status: 'unknown' }]) {
  const w = e3world(), seen = [];
  w.portals = [{ id: 'u', fromId: 'u', fromRegionId: 'a', toRegionId: 'b', crossing: originRefusal(seen, packet),
    signedHeight: () => 1, transit: () => { throw new Error('must never transit'); } }];
  const s = e3state(w, [0, 0, 0], [0, 1, 0]), before = JSON.stringify(s);
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.deepEqual(r.state.position, s.position); assert.deepEqual(r.state.camera, s.camera);
  assert.equal(r.timeConsumed, 0); assert.equal(r.timeRemaining, 2);
  assert.equal(r.crossings, 0); assert.equal(r.contactSamples.length, 0);
  assert.equal(r.events[0].apertures[0].portalId, 'u');
  assert.equal(JSON.stringify(s), before);
  checkLegBounds(seen, 2, 1, 'origin-unknown');
}
console.log('truth 3: unknown at zero during travel OK');

// 4. Unknown at zero during LIFT (correction phase): direction-gated producer
// fires only while leaving the ball surface, never on approach legs.
{
  const w = e3world(BALL), seen = [];
  const away = (p, u) => {
    const ax = p[0] - BALL[0], ay = p[1] - BALL[1], az = p[2] - BALL[2];
    const n = norm([ax, ay, az]) || 1;
    return { dot: (ax * u[0] + ay * u[1] + az * u[2]) / n, gap: n - BR - PR };
  };
  w.portals = [{ id: 'g', fromId: 'g', fromRegionId: 'a', toRegionId: 'b',
    crossing: (p, u, d) => { seen.push({ d }); const { dot, gap } = away(p, u);
      return dot > 0.5 && gap < 0.25 ? { status: 'unresolved', reason: 'lift-band', distance: 99, uncertaintyFrom: 0 }
        : { status: 'miss', checkedDistance: d }; },
    signedHeight: (p) => 1 - p[1], transit: () => { throw new Error('must never transit'); } }];
  const s = e3state(w, [0, 0, 0], [0.15, 1, 0], 2);
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.equal(r.events[0].phase, 'correction'); assert.equal(r.events[0].kind, 'unresolved');
  assert.equal(r.events[0].apertures[0].reason, 'lift-band');
  assert.ok(r.contactSamples.length >= 1, 'lift refusal must retain the contact it lifted off');
  assert.ok(r.timeConsumed > 0 && r.timeRemaining > 0, 'approach travel stands, nothing invented');
  assert.equal(r.crossings, 0);
  assert.deepEqual(r.state.camera.position, r.state.position);
  assert.equal(r.state.camera.space, w.regions.get('a').space);
  checkLegBounds(seen, 2, 2, 'lift-gated');
  console.log('truth 4: unknown at zero during lift OK');
}

// 5. A nearer solid wins at higher speed on an oblique approach; the remote
// aperture plane beyond it never materializes inside a shortened leg.
{
  const w = e3world(BALL), seen = [];
  w.portals = [{ id: 'far', fromId: 'far', fromRegionId: 'a', toRegionId: 'b',
    crossing: refusalAt(4, seen), signedHeight: (p) => 4 - p[1],
    transit: () => { throw new Error('must never transit'); } }];
  const s = e3state(w, [0, 0, 0], [0.15, 1, 0], 3);
  const r = moveRegionProbe(w, s, 2);
  assert.notEqual(r.status, 'unresolved');
  assert.ok(r.contactSamples.length >= 1); assert.equal(r.crossings, 0);
  assert.ok(r.state.position[1] < 3.5, 'never reached the remote aperture plane');
  checkLegBounds(seen, 2, 3, 'solid-wins');
  console.log('truth 5: nearer solid wins at speed 3 oblique OK');
}

// 6. Uncertainty strictly before the solid refuses with whole-leg rollback:
// nothing of the certified-unsafe leg is consumed.
{
  const w = e3world([0, 5, 0]), seen = [];
  w.portals = [{ id: 'near', fromId: 'near', fromRegionId: 'a', toRegionId: 'b',
    crossing: refusalAt(3, seen), signedHeight: (p) => 3 - p[1],
    transit: () => { throw new Error('must never transit'); } }];
  const s = e3state(w, [0, 0, 0], [0, 1, 0]);
  const r = moveRegionProbe(w, s, 5);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.deepEqual(r.state.position, s.position); assert.equal(r.timeConsumed, 0);
  assert.equal(r.crossings, 0);
  checkLegBounds(seen, 5, 1, 'uncertainty-first');
  console.log('truth 6: uncertainty before solid refuses, leg unconsumed OK');
}

// 7. Gate vs uncertainty: strict wins, exact ties refuse, order invariant.
for (const reverse of [false, true]) {
  const cases = [
    { unc: 1.5, want: 'complete', crossings: 1 },
    { unc: 1.0, want: 'unresolved', crossings: 0 },
    { unc: 0.5, want: 'unresolved', crossings: 0 },
  ];
  for (const { unc, want, crossings } of cases) {
    const w = e3world(), seen = [];
    const u = { id: 'u', fromId: 'u', fromRegionId: 'a', toRegionId: 'b', crossing: refusalAt(unc, seen),
      signedHeight: (p) => unc - p[1], transit: () => { throw new Error('uncertain crossing must never transit'); } };
    const g = gate('g', 1, []);
    g.transit = unc === 1.5 ? g.transit : () => { throw new Error('tied/earlier unknown must never transit'); };
    w.portals = reverse ? [u, g] : [g, u];
    const s = e3state(w, [0, 0, 0], [0, 1, 0]);
    const r = moveRegionProbe(w, s, 2);
    assert.equal(r.status, want, `unc=${unc} reverse=${reverse}`);
    assert.equal(r.crossings, crossings);
    if (want === 'complete') assert.equal(r.state.regionId, 'b');
    else { assert.equal(r.detail, 'aperture-query'); assert.deepEqual(r.state.position, s.position); }
  }
}
console.log('truth 7: gate strict/tie/behind across both orders OK');

// 8. A 4e-9 separation lets the gate win; an exact tie refuses (tie tolerance
// is ~1e-9 at this scale, so 4e-9 is clearly outside it).
{
  const w = e3world();
  w.portals = [gate('g', 1, []),
    { id: 'u', fromId: 'u', fromRegionId: 'a', toRegionId: 'b', crossing: refusalAt(1 + 4e-9, []),
      signedHeight: () => 1, transit: () => { throw new Error('must never transit'); } }];
  const r = moveRegionProbe(w, e3state(w, [0, 0, 0], [0, 1, 0]), 2);
  assert.equal(r.status, 'complete'); assert.equal(r.crossings, 1);
  console.log('truth 8: near-tie separation lets gate win OK');
}

// 9. Chart edge strictly before uncertainty exits; tied with it refuses.
{
  const w = e3world(), seen = [];
  w.portals = [{ id: 'edge', fromId: 'edge', fromRegionId: 'a', toRegionId: 'b',
    crossing: refusalAt(6.5, seen), signedHeight: (p) => 6.5 - p[1],
    transit: () => { throw new Error('must never transit'); } }];
  const r = moveRegionProbe(w, e3state(w, [0, 0, 0], [0, 1, 0]), 7);
  assert.equal(r.status, 'domain-exit');
  assert.ok(r.state.position[1] < 6 && r.state.position[1] > 5.9);
}
{
  const w = e3world();
  w.portals = [{ id: 'edge-tie', fromId: 'edge-tie', fromRegionId: 'a', toRegionId: 'b',
    crossing: refusalAt(6, []), signedHeight: (p) => 6 - p[1],
    transit: () => { throw new Error('must never transit'); } }];
  const r = moveRegionProbe(w, e3state(w, [0, 0, 0], [0, 1, 0]), 7);
  assert.equal(r.status, 'unresolved'); assert.equal(r.crossings, 0);
  console.log('truth 9: domain strict-win and domain tie OK');
}

// 10. Destination-offset uncertainty refuses the whole transaction: approach
// refunded to a certified entering-side checkpoint, IDs/reasons retained.
{
  const w = e3world(), seen = [];
  w.portals = [gate('known', 1, seen),
    { id: 'dest', fromId: 'dest', fromRegionId: 'b', toRegionId: 'a',
      crossing: (p, u, d) => { seen.push({ d }); return { status: 'unresolved', reason: 'dest-band', distance: 9, uncertaintyFrom: 0 }; },
      signedHeight: () => 1, transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 1, 0] }) }];
  const s = e3state(w, [0, 0, 0], [0, 1, 0]);
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'blocked-exit'); assert.equal(r.detail, 'exit-offset-unresolved');
  assert.equal(r.crossings, 0); assert.equal(r.state.regionId, 'a');
  assert.ok(r.state.position[1] < 1 && r.state.position[1] > 0.99, `approach checkpoint: ${r.state.position[1]}`);
  assert.ok(r.timeRemaining > 1 && r.timeConsumed < 1.01);
  assert.equal(r.events[0].kind, 'portal');
  assert.equal(r.events[0].apertures[0].regionId, 'b');
  assert.equal(r.events[0].apertures[0].reason, 'dest-band');
  assert.deepEqual(r.state.camera.position, r.state.position);
  console.log('truth 10: destination-offset refusal OK');
}

// 11. Slide, then an uncertain leg: earlier contact work stands, only the
// final leg is refunded to its own start; carried camera stays coherent.
{
  const w = e3world(BALL), seen = [];
  w.portals = [{ id: 'late', fromId: 'late', fromRegionId: 'a', toRegionId: 'b',
    crossing: (p, u, d) => { seen.push({ d }); return p[0] > 0.35
      ? { status: 'unresolved', reason: 'late-band', distance: 99, uncertaintyFrom: 0 }
      : { status: 'miss', checkedDistance: d }; },
    signedHeight: (p) => 1 - p[1], transit: () => { throw new Error('must never transit'); } }];
  const s = e3state(w, [0, 0, 0], [0.15, 1, 0], 2);
  const r = moveRegionProbe(w, s, 2);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.equal(r.events[0].apertures[0].reason, 'late-band');
  assert.ok(r.contactSamples.length >= 1, 'earlier contact work retained');
  assert.ok(r.steps > 0, 'spent solver steps retained');
  assert.ok(r.timeConsumed > 0 && r.timeRemaining > 0, 'only the final leg refunded');
  assert.ok(norm([r.state.position[0] - s.position[0], r.state.position[1] - s.position[1]]) > 0.1,
    'earlier committed travel stands');
  assert.deepEqual(r.events[0].stoppedAt, r.state.position);
  assert.equal(r.crossings, 0);
  assert.deepEqual(r.state.camera.position, r.state.position);
  assert.equal(r.state.camera.space, w.regions.get('a').space);
  checkLegBounds(seen, 2, 2, 'late-band');
  console.log('truth 11: spent work kept, final leg refunded OK');
}

// 12. S3 high-speed non-axis curved approach refuses at origin: zero motion,
// on-sphere producer observations (never a chord), bounded ranges.
{
  const doc = JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json', 'utf8'));
  const w = { ...compileRegionWorld(doc) };
  const seen = [];
  w.portals = [{ id: 'curve', fromId: 'curve', fromRegionId: 'sphere', toRegionId: 'nowhere',
    crossing: (p, u, d) => { seen.push({ p: p.slice(), d });
      return { status: 'unresolved', reason: 'curve-band', distance: 50, uncertaintyFrom: 0 }; },
    signedHeight: () => 1, transit: () => { throw new Error('must never transit'); } }];
  const space = w.regions.get('sphere').space, chart = [0.2, 0.6, 0.3];
  const p0 = space.decode(chart), f = space.frame(p0);
  const raw = f[1].map((x, i) => x + 0.7 * f[2][i] - 0.3 * f[0][i]);
  const dir = space.normalize(p0, raw);
  const st = { regionId: 'sphere', position: p0, velocity: dir.map((x) => x * 8), radius: 0.25,
    camera: createCameraFrame(space, p0, { forward: dir, up: f[2] }) };
  const before = JSON.stringify(st);
  const r = moveRegionProbe(w, st, 0.5);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'aperture-query');
  assert.deepEqual(r.state.position, st.position);
  // Curved rollback re-carries the frame through a zero advance, leaving ~1ulp
  // transport noise: position is bit-exact, the frame is near-exact.
  assert.equal(r.state.camera.space, space);
  for (const k of ['forward', 'up', 'right']) {
    assert.equal(r.state.camera[k].length, st.camera[k].length);
    r.state.camera[k].forEach((x, i) => assert.ok(Math.abs(x - st.camera[k][i]) < 1e-12, `camera ${k}[${i}] drifted`));
  }
  assert.deepEqual(r.state.camera.position, r.state.position);
  assert.equal(r.timeConsumed, 0); assert.equal(r.timeRemaining, 0.5); assert.equal(r.crossings, 0);
  assert.equal(JSON.stringify(st), before);
  checkLegBounds(seen, 0.5, 8, 's3-curved');
  for (const c of seen) {
    assert.ok(Math.abs(norm(c.p) - 1) < 1e-6, `producer must observe the sphere, not a chord: |p|=${norm(c.p)}`);
  }
  console.log('truth 12: S3 high-speed curved origin refusal OK');
}

// 13. S3 miss-covering control progresses (the curved producer CAN allow motion).
{
  const doc = JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json', 'utf8'));
  const w = { ...compileRegionWorld(doc) };
  w.portals = [{ id: 'open', fromId: 'open', fromRegionId: 'sphere', toRegionId: 'nowhere',
    crossing: (p, u, d) => ({ status: 'miss', checkedDistance: d }),
    signedHeight: () => 1, transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 0, 1] }) }];
  const space = w.regions.get('sphere').space, chart = [0.2, 0.6, 0.3];
  const p0 = space.decode(chart), f = space.frame(p0);
  const dir = space.normalize(p0, f[1]);
  const st = { regionId: 'sphere', position: p0, velocity: dir.map((x) => x * 1.5), radius: 0.25,
    camera: createCameraFrame(space, p0, { forward: dir, up: f[2] }) };
  const r = moveRegionProbe(w, st, 0.25);
  assert.notEqual(r.status, 'unresolved');
  assert.ok(space.distance(p0,r.state.position)>0.01,'control must actually progress');
  console.log('truth 13: S3 miss-covering control progresses OK');
}

// 14. Malformed packet during settle RESUME (independent S3 start/debt):
// debt retained, no continuation re-issued, reuse is stale.
{
  const doc = JSON.parse(readFileSync('levels/fixtures/s3-room.nil.json', 'utf8'));
  const w = { ...compileRegionWorld(doc) };
  let uncertain = false;
  w.portals = [{ id: 'settle', fromId: 'settle', fromRegionId: 'sphere', toRegionId: 'nowhere',
    crossing: () => uncertain ? { distance: NaN } : null,
    signedHeight: () => 1, transit: (p) => ({ position: p.slice(), carry: (v) => v.slice(), normal: [0, 0, 1] }) }];
  const space = w.regions.get('sphere').space, chart = [0.1, 1, 0.2501];
  const p0 = space.decode(chart), f = space.frame(p0);
  const dir = space.normalize(p0, f[1]);
  const st = { regionId: 'sphere', position: p0, velocity: dir.map((x) => x * 2.6), radius: 0.25,
    camera: createCameraFrame(space, p0, { forward: dir, up: f[2] }) };
  const debt = moveRegionProbe(w, st, 1 / 60, { maxSteps: 8 });
  assert.ok(debt.pendingLift); assert.ok(debt.continuation);
  uncertain = true;
  const r = resumeRegionCorrection(w, debt);
  assert.equal(r.status, 'unresolved'); assert.equal(r.detail, 'correction-boundary');
  assert.deepEqual(r.state.position, debt.state.position);
  assert.deepEqual(r.state.camera, debt.state.camera);
  assert.deepEqual(r.pendingLift, debt.pendingLift); assert.equal(r.continuation, null);
  assert.equal(r.timeConsumed, 0); assert.equal(r.corrected, 0);
  assert.equal(r.events[0].apertures[0].reason, 'invalid-aperture-result');
  assert.equal(resumeRegionCorrection(w, debt).status, 'stale-continuation');
  console.log('truth 14: malformed packet during settle resume OK');
}

console.log('Aperture motion truth: per-leg ranges, travel/lift/settle unknowns, prefix/tie/order, destination offset, work-vs-time, curved S3 passed');
