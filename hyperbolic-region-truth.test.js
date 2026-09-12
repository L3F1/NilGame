import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRegionWorld, compileHyperbolicRegionWorld } from './engine/world/region-world.js';
import { moveRegionProbe } from './engine/world/region-motion.js';

const fixture = JSON.parse(readFileSync('levels/fixtures/connected-h3-cpu.nil.json', 'utf8'));
const failures = [];
const counts = { docs: 0, queries: 0, hits: 0, misses: 0, unresolved: 0 };
const check = (name, fn) => {
  try { fn(); }
  catch (e) { failures.push(`${name}: ${e.message}`); }
};

// Build a saved E3/H3/E3 document at curvature radius R with an anchor variant.
// base: fixture anchors; rotated: H3 anchors rolled 90 deg; offcentre: shifted.
function makeDoc(R, variant = 'base') {
  const d = structuredClone(fixture);
  const h3 = d.regions.find(r => r.id === 'hyperbolic');
  h3.geometry.curvatureRadius = R;
  h3.extent = Math.min(12, 1.5 * R);
  const k = Math.min(1, R / 8); // scale author offsets down so small-R docs stay in-domain
  for (const e of d.entities.filter(e => e.regionId === 'hyperbolic')) {
    e.position = e.position.map(x => x * k);
  }
  for (const e of d.entities.filter(e => e.kind === 'anchor')) {
    e.radius = Math.min(0.7, 0.4 * R);
  }
  const ball = d.entities.find(e => e.id === 'landmark');
  ball.radius = Math.min(0.25, 0.05 * R);
  const bs = Math.min(1, 0.2 * h3.extent); // keep clear of the scaled spawn
  ball.position = [bs, bs, 0];
  if (variant === 'rotated') {
    for (const id of ['h3-entry', 'h3-exit']) {
      const a = d.entities.find(e => e.id === id);
      a.forward = [1, 0, 0]; a.up = [0, 0, 1];
    }
  } else if (variant === 'offcentre') {
    const a = d.entities.find(e => e.id === 'h3-entry');
    a.position = [0.3 * k, 0.2 * k, 0.1 * k];
  }
  d.units.playerRadius = Math.min(0.1, 0.1 * R);
  return d;
}

// Signed-height evolution audit of the outward rule B > |A| + band through a
// compiled world's real H3 portals. Collects counterexamples, not just counts.
function auditPortals(w, label) {
  const space = w.regions.get('hyperbolic').space;
  const R = space.curvatureRadius;
  const h3Portals = w.portals.filter(p => p.fromRegionId === 'hyperbolic');
  assert.ok(h3Portals.length > 0, `${label}: no H3 portals compiled`);
  for (const portal of h3Portals) {
    const n = portal.normal;
    const frame = space.frame(portal.center);
    const axis = [...frame].sort((a,b)=>Math.abs(space.dot(portal.center,a,n))-Math.abs(space.dot(portal.center,b,n)))[0];
    const tangent = space.normalize(portal.center,space.project(portal.center,axis,n));
    assert.ok(Math.abs(space.dot(portal.center,tangent,n))<1e-10,'constructed ray must be tangent to the aperture');
    const cases = [];
    // On-plane outward / near-plane outward / ambiguous / inward starts.
    cases.push({ name: 'on-plane-outward', p: portal.center.slice(), u: n.slice() });
    const near = space.step(portal.center, n, 1e-7 * R);
    cases.push({ name: 'near-plane-outward', p: near, u: space.transport(portal.center, near, n) });
    cases.push({ name: 'on-plane-tangential', p: portal.center.slice(), u: tangent.slice() });
    cases.push({ name: 'on-plane-inward', p: portal.center.slice(), u: n.map(x => -x) });
    const front = space.step(portal.center, n, Math.min(0.05 * R, 0.1 * space.maxDistance));
    cases.push({ name: 'front-inward-hit', p: front, u: space.transport(portal.center, front, n.map(x => -x)) });
    for (const c of cases) {
      // Expectations come from the constructed cases, not a copy of the
      // production coefficient predicate we are supposed to challenge.
      const outward = c.name.endsWith('outward');
      const boundary = space.boundaryDistance(c.p, c.u);
      const maxDistance = Math.min(boundary * 0.9, R);
      const res = portal.crossing(c.p, c.u, maxDistance);
      counts.queries++;
      if (res && res.status === 'hit') counts.hits++;
      else if (res && res.status === 'miss') counts.misses++;
      else counts.unresolved++;
      const tag = `${label}/${portal.fromId}/${c.name}`;
      if (c.name === 'front-inward-hit') {
        check(`${tag} enters disc`, () => assert.equal(res.status, 'hit'));
        continue;
      }
      if (outward) {
        // Outward on/near plane never enters; height strictly increases.
        check(`${tag} never enters`, () => assert.notEqual(res.status, 'hit'));
        check(`${tag} height monotonic`, () => {
          let prev = portal.signedHeight(c.p);
          for (let i = 1; i <= 8; i++) {
            const q = space.step(c.p, c.u, (maxDistance * i) / 8);
            const h = portal.signedHeight(q);
            assert.ok(h > prev - 1e-9 * R, `height fell ${prev} -> ${h}`);
            prev = h;
          }
          assert.ok(prev > -1e-9 * R, `outward ray went negative: ${prev}`);
        });
        if (boundary > maxDistance) {
          check(`${tag} bounded miss`, () => assert.equal(res.status, 'miss'));
        }
      } else {
        // Ambiguous and inward on-plane starts stay unresolved, never a full miss.
        check(`${tag} stays unresolved`, () => assert.equal(res.status, 'unresolved'));
      }
      // Domain-limited queries never claim a full miss.
      const over = portal.crossing(c.p, c.u, boundary + R);
      counts.queries++;
      if (over.status === 'miss') counts.misses++; else counts.unresolved++;
      check(`${tag} domain limit is not a miss`, () => assert.notEqual(over.status, 'miss'));
    }
  }
}

for (const R of [0.5, 8, 10000]) {
  for (const variant of ['base', 'rotated', 'offcentre']) {
    const label = `R=${R}/${variant}`;
    const doc = makeDoc(R, variant);
    check(`${label} compiles`, () => {
      const w = compileHyperbolicRegionWorld(doc);
      counts.docs++;
      // Persistence: document round-trips byte-identically through save/load.
      const again = compileHyperbolicRegionWorld(JSON.parse(JSON.stringify(w.document())));
      assert.deepEqual(again.document(), w.document());
      // Snapshot: later author edits do not move the compiled field.
      const region = w.regions.get('hyperbolic');
      const p = region.space.decode([0.05, 0, 0]);
      const before = region.field.distance(p);
      doc.entities.find(e => e.id === 'landmark').radius = 100 * R;
      assert.equal(region.field.distance(p), before);
      auditPortals(w, label);
    });
  }
}

// Saved-document traversal, snapshot and gates on the real fixture.
check('fixture E3/H3/E3 traversal', () => {
  const w = compileHyperbolicRegionWorld(fixture);
  const start = w.spawn('flat'); start.velocity = [0, 1, 0];
  const r = moveRegionProbe(w, start, 4, { maxSteps: 256 });
  assert.equal(r.status, 'complete');
  assert.equal(r.state.regionId, 'return');
  assert.equal(r.crossings, 2);
});

// Explicit unsupported-intent refusals on saved documents.
const refusals = [
  ['default compiler gates H3', d => compileRegionWorld(d), /does not support h3/],
  ['renderData refuses H3', () => compileHyperbolicRegionWorld(fixture).renderData(), /not implemented/],
  ['floor policy', d => { d.entities.push({ id: 'fl', regionId: 'hyperbolic', kind: 'plane', position: [0, 0, -1], up: [0, 0, 1] }); }, null],
  ['subtract modifier', d => { d.entities.find(e => e.id === 'landmark').op = 'subtract'; }, null],
  ['oversize ball', d => { d.entities.find(e => e.id === 'landmark').radius = 9; }, null],
  ['oversize extent', d => { d.regions.find(r => r.id === 'hyperbolic').extent = 17; }, null],
  ['box solid', d => { d.entities.push({ id: 'bx', regionId: 'hyperbolic', kind: 'box', position: [0, 0, 0], halfExtent: [1, 1, 1] }); }, null],
  ['second spawn', d => { d.entities.push({ id: 'sp2', regionId: 'hyperbolic', kind: 'spawn', position: [0, 1, 0] }); }, null],
  ['anchor radius beyond R', d => { d.entities.find(e => e.id === 'h3-entry').radius = 9; }, null],
];
for (const [name, mutate, direct] of refusals) {
  check(`refusal: ${name}`, () => {
    if (name === 'default compiler gates H3') { assert.throws(() => compileRegionWorld(fixture), /does not support h3/); return; }
    if (name === 'renderData refuses H3') { assert.throws(() => compileHyperbolicRegionWorld(fixture).renderData(), /not implemented/); return; }
    const d = structuredClone(fixture);
    mutate(d);
    assert.throws(() => compileHyperbolicRegionWorld(d));
  });
}

console.log(`truth audit: ${counts.docs} docs, ${counts.queries} queries (${counts.hits} hit/${counts.misses} miss/${counts.unresolved} unresolved)`);
if (failures.length) {
  console.error(`FAILURES (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('H3 saved-world truth audit passed: outward rule holds, ambiguous/inward unresolved, domain limits never miss');
