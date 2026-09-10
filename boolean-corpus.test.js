// Boolean corpus (MUSE-21): the validator rules around `op` and `target`,
// each refused for the RIGHT reason, and valid carve documents pinned where
// the lead's own tests do not reach.
//
// Rule inventory, read from the code rather than this list: document.js
// refuses `op` on non-solids, a misspelled `op`, a `target` without a
// subtract, and a self-target; scene-field.js refuses a `target` that is not
// an ADDED solid (missing, non-solid, or itself a carve). The runner asserts
// which layer refuses, because the split is the design.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import { compileSceneField } from './engine/world/scene-field.js';

const carveRoot = new URL('./levels/fixtures/carve/', import.meta.url);
const invalidRoot = new URL('./levels/fixtures/invalid/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', carveRoot), 'utf8'));
const load = (dir, file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

// The defect refuses, never the base: the untouched room compiles.
check('base room compiles', () => {
  const base = load(carveRoot, manifest.base);
  validateScene(base);
  const f = compileSceneField(base);
  assert.equal(f.carveCount, 1);
});

for (const c of manifest.invalid) {
  check(`refuse ${c.file}`, () => {
    const dir = c.file.startsWith('../invalid/') ? invalidRoot : carveRoot;
    const file = c.file.replace(/^\.\.\/invalid\//, '');
    const doc = load(dir, file);
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

const BOUND = { distance: 'bound', intersection: 'marched', normal: 'exact-except-ball-center' };
function compiled(file) {
  const f = compileSceneField(load(carveRoot, file));
  assert.deepEqual({ ...f.capabilities }, BOUND, `${file}: a carve must advertise bound/marched`);
  return f;
}

check('room: slab solid, floor past the wall intact', () => {
  const f = compiled('room.nil.json');
  assert.ok(f.distance([0, 2.2, 0.5]) < 0, 'inside the slab');
  assert.ok(f.distance([0, 6, -0.5]) < 0, 'floor past the wall');
  assert.ok(f.distance([0, 3, 0.5]) > 0, 'past the slab is open');
});

check('removed-entirely: the nub is free space', () => {
  const f = compiled('removed-entirely.nil.json');
  assert.equal(f.distance([5, 5, 0.5]), 0.5, 'carve negated at the centre');
  assert.equal(f.distance([5, 5, 0]), 0, 'the floor surface is unmoved');
  assert.ok(f.distance([5, 5, -0.5]) < 0, 'solid floor beneath');
});

check('two-carves: both doorways open, wall between them stands', () => {
  const f = compiled('two-carves.nil.json');
  assert.equal(f.carveCount, 3, 'back face plus two doors');
  assert.ok(f.distance([0, 2.2, 0.6]) > 0, 'first doorway open');
  assert.ok(f.distance([2, 2.2, 0.6]) > 0, 'second doorway open');
  assert.ok(f.distance([1, 2.2, 0.6]) < 0, 'wall between them solid');
});

check('carve-after-carve: targeting an already-removed solid is consistent', () => {
  const f = compiled('carve-after-carve.nil.json');
  assert.equal(f.carveCount, 2);
  assert.equal(f.distance([5, 5, 0.5]), 0.5, 'the larger carve dominates');
});

check('carve-outside: no effect, bitwise', () => {
  const plain = compileSceneField(load(carveRoot, 'room.nil.json'));
  const f = compiled('carve-outside.nil.json');
  assert.equal(f.carveCount, 2);
  for (const p of [[0, 2.2, 0.5], [0, 6, -0.5], [0, 0, 1], [3, 3, 3], [0, 2.2, 2.0], [-4, 1, 0.2]]) {
    assert.equal(f.distance(p), plain.distance(p), `drift at ${JSON.stringify(p)}`);
  }
});

check('carve-tangent: surface at the touch, solid beneath', () => {
  const f = compiled('carve-tangent.nil.json');
  assert.equal(f.distance([5, 5, 0]), 0, 'the tangent point reads as surface');
  assert.ok(f.distance([5, 5, -0.5]) < 0, 'floor beneath survives');
  assert.ok(f.distance([5, 5, 0.001]) > 0, 'just above is free');
});

check('carve-global: untargeted cuts everything, floor included', () => {
  const f = compiled('carve-global.nil.json');
  assert.equal(f.carveCount, 2);
  assert.ok(f.distance([0, 2.2, 0.6]) > 0, 'doorway open');
  assert.ok(f.distance([0, 2.2, -0.1]) > 0, 'floor under the doorway holed — global scope');
  assert.ok(f.distance([0, 6, -0.5]) < 0, 'floor elsewhere intact');
});

console.log(`\nboolean-corpus: ${passed} checks passed\n`);
