// MUSE-38: what does the S3 bound cost a walk?
//
// MUSE-34 measured the cell bound's shortfall as a FRACTION of distance
// (0.29 at an edge, 0.36-0.42 at a corner). A conservative bound costs STEPS:
// the solver advances by the distance it is promised. This file walks
// identical routes in the spherical room (R=8) and in the FLAT LIMIT (same
// document, curvatureRadius 10000 — Euclidean to ~1e-8, verified below), so
// curvature and the spherical construction are the only things that vary,
// and reports the cost as a RATIO to the flat case per route.
//
// Step sizes come from the public `events` provider, which sees every
// proposed advance (returning null takes the step unchanged): no engine
// changes, no private hooks. STALL means a step advancing less than a tenth
// of the player radius (0.1r): below that the probe moves negligibly
// relative to its own size, so in OPEN space (bound at step start > r —
// sound one direction, since the bound never over-reports... where it does,
// steps would grow, not shrink) such steps are pure bound churn, not
// approach. Waste fraction = stalled steps in open space / all steps.
import assert from 'node:assert/strict';
import { validateScene } from './engine/world/document.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { sweep } from './engine/world/collision.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const R_ROOM = 8, R_FLAT = 10000, R_PROBE = 0.25, STALL_FRac = 0.1;
const MAXSTEPS = 32768; // budget must never bind: a stall here is a finding

const ROUTES = [
  // Open-floor and wall-hugging routes run y -3 -> 0.5: the wall slab spans
  // x -3..3 at y 1.2..1.8, so anything past y~1 outside the doorway HITS it
  // (the first run's "open" route did exactly that). The doorway is the only
  // way through; the corner route threads it diagonally into the far pocket.
  { id: 'open', from: [2.0, -3, 0.9], to: [2.0, 0.5, 0.9] },
  { id: 'wall-1.1', from: [2.1, -3, 0.9], to: [2.1, 0.5, 0.9] },
  { id: 'wall-0.6', from: [2.6, -3, 0.9], to: [2.6, 0.5, 0.9] },
  { id: 'wall-0.35', from: [2.85, -3, 0.9], to: [2.85, 0.5, 0.9] },
  { id: 'doorway', from: [0, -3, 0.9], to: [0, 2.9, 0.9] },
  { id: 'jamb-hug', from: [0.55, -3, 0.9], to: [0.55, 2.9, 0.9] },
  // Corner: the room's back pockets are unreachable straight through the
  // 1.7-wide door (two runs died at the door rim / in the s-ball in BOTH
  // worlds, ratio 1.0, no signal). So the corner walk starts past the door,
  // in open back-room space, and drives into the s-right/s-back pocket.
  { id: 'corner', from: [0, 2.85, 0.9], to: [3.0, 3.6, 0.9] },
];

function worldAt(curvatureRadius) {
  const doc = JSON.parse(readFileSync(new URL('./levels/fixtures/s3-room.nil.json', import.meta.url), 'utf8'));
  doc.regions[0].geometry.curvatureRadius = curvatureRadius;
  validateScene(doc);
  const region = compileRegionWorld(doc).regions.get('sphere');
  return { doc, ...region };
}

function walkRoute(world, route) {
  const { space: sp, field } = world;
  const start = sp.decode(route.from);
  const end = sp.decode(route.to);
  const aim = sp.normalize(start, sp.logAt(start, end));
  const geodesic = sp.distance(start, end);
  const legs = [];
  const res = sweep(field, sp, {
    from: start, direction: aim, distance: geodesic, radius: R_PROBE,
    maxSteps: MAXSTEPS,
    events: ({ position, distance }) => {
      legs.push({ advance: distance, bound: field.distance(position), at: world.space.encode(position).map((v) => +v.toFixed(3)) });
      return null;
    },
  });
  const sizes = legs.map((l) => l.advance).sort((a, b) => a - b);
  const q = (f) => sizes.length ? sizes[Math.min(sizes.length - 1, Math.floor(f * sizes.length))] : 0;
  const stalledN = legs.filter((l) => l.advance < STALL_FRac * R_PROBE).length;
  const waste = legs.filter((l) => l.advance < STALL_FRac * R_PROBE && l.bound > R_PROBE).length;
  return {
    steps: res.steps, stalled: res.stalled, hit: res.hit,
    endAt: world.space.encode(res.position).map((v) => +v.toFixed(3)),
    travelled: res.travelled, geodesic, legs,
    stallFrac: legs.length ? stalledN / legs.length : 0,
    arcRatio: res.travelled / geodesic,
    min: sizes[0] ?? 0, p50: q(0.5), p90: q(0.9),
    wasteFrac: legs.length ? waste / legs.length : 0,
    openWaste: waste,
  };
}

const curved = worldAt(R_ROOM);
const flat = worldAt(R_FLAT);

check('flat limit is Euclidean (control validity)', () => {
  const a = flat.space.decode([2.0, -3, 0.9]), b = flat.space.decode([2.0, 3.5, 0.9]);
  const dev = Math.abs(flat.space.distance(a, b) - 6.5);
  console.log(`  flat deviation over 6.5 units at R=10000: ${dev.toExponential(2)}`);
  assert.ok(dev < 1e-6, `flat control must be Euclidean, deviation ${dev}`);
});

const rows = [];
check('walk every route in both worlds', () => {
  for (const route of ROUTES) {
    const c = walkRoute(curved, route);
    const f = walkRoute(flat, route);
    assert.equal(c.stalled, false, `${route.id} curved: step budget bound the walk`);
    assert.equal(f.stalled, false, `${route.id} flat: step budget bound the walk`);
    rows.push({ id: route.id, c, f, ratio: c.steps / f.steps });
  }
});

const stepsWithin = (legs, L) => {
  let n = 0, acc = 0;
  for (const l of legs) { if (acc < L - 1e-12) n++; acc += l.advance; }
  return n;
};

check('curved never out-walks flat (the bound only under-reports)', () => {
  for (const { id, c, f, ratio } of rows) {
    // Where did the steps go: split the curved walk into thirds by advance.
    const thirds = [[], [], []];
    let acc = 0;
    for (const l of c.legs) {
      thirds[Math.min(2, Math.floor((acc / c.travelled) * 3))].push(l);
      acc += l.advance;
    }
    const tstr = thirds.map((ts) => {
      const w = ts.filter((l) => l.advance < STALL_FRac * R_PROBE && l.bound > R_PROBE).length;
      const at = ts.length ? `${ts[0].at[1].toFixed(2)}..${ts[ts.length - 1].at[1].toFixed(2)}` : '-';
      return `${ts.length}n/${w}w@${at}`;
    }).join(' ');
    console.log(`  ${id}: curved ${c.steps} steps vs flat ${f.steps} (ratio ${ratio.toFixed(2)}) `
      + `arc ${c.arcRatio.toFixed(4)}/${f.arcRatio.toFixed(4)} `
      + `stall ${c.stallFrac.toFixed(3)}/${f.stallFrac.toFixed(3)} (of it open-space waste ${c.wasteFrac.toFixed(3)}/${f.wasteFrac.toFixed(3)}) `
      + `step p50 ${c.p50.toExponential(1)}/${f.p50.toExponential(1)}`);
    console.log(`    thirds (n/waste@y-range): ${tstr} end ${c.endAt} hit=${c.hit}`);
    if (!c.hit && !f.hit) {
      assert.ok(c.steps >= f.steps, `${id}: curved took fewer steps (${c.steps} < ${f.steps}) — an over-reporting bound`);
    } else {
      // Halt points differ per world, so raw counts confound path length
      // with bound cost. Compare over the common travelled prefix instead;
      // the corner ratio below does NOT isolate the bound — the endpoints
      // (and hence the paths) differ, and no exact truth says which halt
      // is right.
      const L = Math.min(c.travelled, f.travelled);
      const rc = stepsWithin(c.legs, L), rf = stepsWithin(f.legs, L);
      console.log(`    common-prefix ${L.toFixed(3)}: curved ${rc} vs flat ${rf} (ratio ${(rc / rf).toFixed(2)})`);
    }
  }
});

check('corner halts, the rest cross', () => {
  for (const { id, c, f } of rows) {
    if (id === 'corner') {
      assert.equal(c.hit, true, 'corner curved must halt in the pocket');
      assert.equal(f.hit, true, 'corner flat must halt in the pocket');
    } else {
      assert.equal(c.hit, false, `${id} curved must cross`);
      assert.equal(f.hit, false, `${id} flat must cross`);
    }
  }
});

console.log(`\ns3-walk-cost: ${passed} checks passed, ${failed} failed`);
if (failed) process.exit(1);
