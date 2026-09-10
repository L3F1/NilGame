// Box corpus (MUSE-29): the validator rules around `box`, each refused for
// the RIGHT reason, and valid box documents pinned where the lead's own
// tests do not reach.
//
// Rule inventory, read from the code rather than this list: document.js
// refuses a missing, short, zero, negative, or non-finite halfExtent,
// halfExtent on anything but a box, a ball-style radius or up on a box, a box
// in a non-E3 chart, a tilted frame, a frame on a version-1 box, a box whose
// corner leaves the chart, `op`/`target` on a spawn, and a cross-region
// modifier target; scene-field.js refuses a `target` that is not an ADDED
// solid. The runner asserts which layer refuses, because the split is the
// design.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import { compileSceneField } from './engine/world/scene-field.js';

const boxRoot = new URL('./levels/fixtures/box/', import.meta.url);
const invalidRoot = new URL('./levels/fixtures/invalid/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', boxRoot), 'utf8'));
const load = (file) => JSON.parse(readFileSync(
  new URL(file.replace(/^\.\.\/invalid\//, ''), file.startsWith('../invalid/') ? invalidRoot : boxRoot), 'utf8'));

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

// The defect refuses, never the base: the untouched room compiles. A union
// of two or more solids advertises a bounded distance even with no modifiers
// in it: the code grants `exact` only to a single unmodified solid.
const EXACT = {
  distance: 'exact', exteriorDistance: 'exact', interiorDistance: 'exact',
  interiorSign: 'exact', intersection: 'analytic-with-numeric-guard',
  normal: 'deterministic-contact', normalUniqueness: 'query-dependent',
};
const UNION = { ...EXACT, distance: 'bound', interiorDistance: 'magnitude-bound' };
check('base room compiles', () => {
  const base = load(manifest.base);
  validateScene(base);
  const f = compileSceneField(base);
  assert.deepEqual(f.activeEntityIds(), ['ground', 'crate']);
  assert.deepEqual({ ...f.capabilities }, UNION, 'two solids means a bounded distance');
});

for (const c of manifest.invalid) {
  check(`refuse ${c.file}`, () => {
    const doc = load(c.file);
    const before = JSON.stringify(doc);
    if (c.level === 'document') {
      assert.throws(() => validateScene(doc), (e) =>
        e.message.includes(c.errorContains), `wrong refusal for [${c.change}]`);
    } else {
      // Field-level by design: validation passes, compilation refuses.
      validateScene(doc);
      assert.throws(() => compileSceneField(doc), (e) =>
        e.message.includes(c.errorContains), `wrong refusal for [${c.change}]`);
    }
    assert.equal(JSON.stringify(doc), before, `${c.file}: refusal mutated its input`);
  });
}

// Any scene holding a subtract or intersect advertises a bounded distance,
// because boolean max can lose exterior exactness while the sign and the
// bound survive.
const BOUND = { ...EXACT, distance: 'bound', exteriorDistance: 'bound', interiorDistance: 'magnitude-bound' };
function compiled(file, caps) {
  const f = compileSceneField(load(file));
  assert.deepEqual({ ...f.capabilities }, caps, `${file}: capabilities misadvertised`);
  return f;
}

check('box-alone: exact caps, exact face distances', () => {
  const f = compiled('box-alone.nil.json', EXACT);
  assert.deepEqual(f.activeEntityIds(), ['crate']);
  assert.equal(f.distance([2, 0, 3]), 1, 'one unit above the top face');
  assert.equal(f.distance([2, 0, 2]), 0, 'on the top face');
});

// The owner a modifier names is computed from the TARGET, not from document
// position: balls live in band 0, planes in 100+i, boxes in 200+i, and the
// field lays subtracts before intersects within each kind. The shuffled twin
// below asserts the same rule under a different declaration order.
function expectedOwners(doc, kind) {
  const added = doc.entities.filter((e) => !e.op);
  const band = (target) => {
    const b = added.filter((e) => e.kind === 'ball').findIndex((e) => e.id === target);
    if (b >= 0) return b;
    const p = added.filter((e) => e.kind === 'plane').findIndex((e) => e.id === target);
    if (p >= 0) return 100 + p;
    return 200 + added.filter((e) => e.kind === 'box').findIndex((e) => e.id === target);
  };
  const mods = doc.entities.filter((e) => e.kind === kind && e.op);
  const ordered = [...mods.filter((e) => e.op === 'subtract'), ...mods.filter((e) => e.op === 'intersect')];
  return {
    owners: ordered.map((e) => band(e.target)),
    signs: ordered.map((e) => (e.op === 'subtract' ? -1 : 1)),
  };
}
const BAND_POINTS = [[4, 0, 2], [0, -3, 1], [-4, 0, 2], [-4, 0, 0.5]];
function checkBands(file) {
  const doc = load(file);
  const f = compileSceneField(doc);
  assert.deepEqual({ ...f.capabilities }, BOUND, `${file}: capabilities misadvertised`);
  for (const kind of ['ball', 'box', 'plane']) {
    const want = expectedOwners(doc, kind);
    const owners = { ball: f.modBallOwners(), box: f.modBoxOwners(), plane: f.modPlaneOwners() }[kind];
    const signs = { ball: f.modBallSigns(), box: f.modBoxSigns(), plane: f.modPlaneSigns() }[kind];
    assert.deepEqual(owners, want.owners, `${file}: ${kind} owners name the wrong solids`);
    assert.deepEqual(signs, want.signs, `${file}: ${kind} signs misrecorded`);
  }
  return f;
}

check('owner-bands: every carve kind lands in the right owner band', () => {
  const f = checkBands('owner-bands.nil.json');
  assert.equal(f.carveCount, 5, 'five cuts');
  assert.equal(f.intersectCount, 3, 'three clips');
  assert.deepEqual(f.modBallOwners(), [200, 101, 0, 101, 200], 'ball carves cut box, plane, ball, box');
  assert.deepEqual(f.modBoxOwners(), [0, 101], 'a box cuts a ball and clips a plane');
  assert.deepEqual(f.modPlaneOwners(), [200], 'the plane carve cuts the box');
  assert.equal(f.distance([4, 0, 2]), 0.8, 'ball carve frees the box interior');
  assert.equal(f.distance([0, -3, 1]), 0.8, 'ball carve frees the plane side');
  assert.equal(f.distance([-4, 0, 2]), 0.8, 'ball carve frees the ball top');
  assert.equal(f.distance([-4, 0, 0.5]), 0.25, 'box carve frees the ball flank');
});

check('owner-bands-shuffled: the same bands under another declaration order', () => {
  const f = checkBands('owner-bands-shuffled.nil.json');
  const plain = compileSceneField(load('owner-bands.nil.json'));
  assert.equal(f.hash, plain.hash, 'order is invisible, bitwise');
  for (const p of BAND_POINTS) {
    assert.equal(f.distance(p), plain.distance(p), `drift at ${JSON.stringify(p)}`);
  }
});

check('overlap: declaration order is invisible, bitwise', () => {
  const a = compiled('overlap-ab.nil.json', UNION);
  const b = compiled('overlap-ba.nil.json', UNION);
  assert.equal(a.distance([0.25, 0, 1.5]), b.distance([0.25, 0, 1.5]), 'same field');
  assert.equal(a.hash, b.hash, 'bitwise identical hash');
});

check('rest-point: clearance hits 0 at the rest face and at the carve tie', () => {
  const f = compiled('rest-point.nil.json', BOUND);
  assert.equal(f.distance([1.5, 0, 1]), 0, 'the crate rest face survives the carve');
  assert.equal(f.distance([2, 0, 1.75]), 0.25, 'crate wall and carve wall tie');
});

check('oriented-box: the frame turns the clearance, not the position', () => {
  const f = compiled('oriented-box.nil.json', UNION);
  assert.equal(f.distance([0, 0, 4.5]), -0.5, 'half a unit inside the turned top face');
});

check('clip-box: intersection keeps the overlap, one clip advertised', () => {
  const f = compiled('clip-box.nil.json', BOUND);
  assert.equal(f.intersectCount, 1, 'one clipping modifier');
  assert.equal(f.distance([0, 0, 2.5]), -0.5, 'inside both box and cap');
  assert.equal(f.distance([0, 0, 1.5]), 0.5, 'inside the box but outside the cap is free');
});

check('dup-pair: an exactly cancelled solid leaves a spawn-only field', () => {
  const f = compiled('dup-pair.nil.json', UNION);
  assert.deepEqual(f.activeEntityIds(), [], 'the cancelled ball is retained nowhere');
  const spawnOnly = {
    format: 'nil-scene', version: 2, id: 'spawn-only',
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
    entities: [{ id: 'start', regionId: 'r', kind: 'spawn', position: [0, -5, 0.3] }],
    connections: [],
  };
  validateScene(spawnOnly);
  const g = compileSceneField(spawnOnly);
  for (const p of [[3, 0, 3], [3, 0, 1], [0, 0, 5], [10, 10, 10]]) {
    assert.equal(f.distance(p), g.distance(p), `drift at ${JSON.stringify(p)}`);
  }
});

console.log(`\nbox-corpus: ${passed} checks passed\n`);
