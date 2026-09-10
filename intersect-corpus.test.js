// Intersection corpus (MUSE-26): the validator rules around `op: intersect`
// and the valid clips worth pinning where clipping differs from carving.
//
// Intersection shares subtraction's code path with the sign flipped, so the
// cases that matter are the differences: a global intersect is refused
// (a global carve is merely broad), and the face normal does NOT flip.
// Rule inventory, read from the code: op on non-solids, the three-valued
// op set, intersect-must-name-target, target scope, self-target (all
// document.js), and target-must-be-an-added-solid (scene-field.js, now
// covering both modifier kinds).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import { compileSceneField } from './engine/world/scene-field.js';

const clipRoot = new URL('./levels/fixtures/clip/', import.meta.url);
const invalidRoot = new URL('./levels/fixtures/invalid/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', clipRoot), 'utf8'));
const load = (dir, file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8'));

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
}

check('base clip-room compiles', () => {
  const base = load(clipRoot, manifest.base);
  validateScene(base);
  const f = compileSceneField(base);
  assert.equal(f.intersectCount, 0);
  assert.equal(f.carveCount, 0);
});

for (const c of manifest.invalid) {
  check(`refuse ${c.file}`, () => {
    const dir = c.file.startsWith('../invalid/') ? invalidRoot : clipRoot;
    const file = c.file.replace(/^\.\.\/invalid\//, '');
    const doc = load(dir, file);
    const before = JSON.stringify(doc);
    if (c.level === 'document') {
      assert.throws(() => validateScene(doc), (e) =>
        e.message.includes(c.errorContains)
        && (!c.whyContains || e.message.includes(c.whyContains)),
      `wrong refusal for [${c.change}]`);
    } else {
      validateScene(doc);
      assert.throws(() => compileSceneField(doc), (e) =>
        e.message.includes(c.errorContains), `wrong refusal for [${c.change}]`);
    }
    assert.equal(JSON.stringify(doc), before, `${c.file}: refusal mutated its input`);
  });
}

const BOUND = { distance: 'bound', intersection: 'marched', normal: 'exact-except-ball-center' };
function compiled(file) {
  const f = compileSceneField(load(clipRoot, file));
  assert.deepEqual({ ...f.capabilities }, BOUND, `${file}: a clip must advertise bound/marched`);
  return f;
}

check('clipped-away: the target is free space', () => {
  const f = compiled('clipped-away.nil.json');
  assert.equal(f.intersectCount, 1);
  assert.ok(f.distance([0, 0, 1.6]) > 0, 'mono centre is open');
});

check('clip-noop: target wholly inside is bitwise the base field', () => {
  const plain = compileSceneField(load(clipRoot, 'clip-room.nil.json'));
  const f = compiled('clip-noop.nil.json');
  assert.equal(f.intersectCount, 1);
  for (const p of [[0, 0, 1.6], [0, 0, 3.1], [0, 0, 0.1], [2, 2, 2], [4, 0, 0.3]]) {
    assert.equal(f.distance(p), plain.distance(p), `drift at ${JSON.stringify(p)}`);
  }
});

check('two-clips: both boundaries meet at the centre', () => {
  const f = compiled('two-clips.nil.json');
  assert.equal(f.intersectCount, 2);
  assert.equal(f.distance([0, 0, 1.6]), 0, 'centre is on both clip faces');
});

check('clip and carve commute bitwise', () => {
  const ab = compiled('clip-carve-ab.nil.json');
  const ba = compiled('clip-carve-ba.nil.json');
  assert.equal(ab.carveCount, 1);
  assert.equal(ab.intersectCount, 1);
  for (const p of [[0, 0, 1.6], [0, 0, 2.2], [0, 0, 0.6], [0, 0, 3.1], [1, 1, 1]]) {
    assert.equal(ab.distance(p), ba.distance(p), `order matters at ${JSON.stringify(p)}`);
  }
});

check('clip-tangent: one point of solid, cut away around it', () => {
  const f = compiled('clip-tangent.nil.json');
  assert.equal(f.distance([0, 0, 3.1]), 0, 'the touch point reads as surface');
  assert.ok(f.distance([0, 0, 3.0]) > 0, 'just below is open');
  assert.ok(f.distance([0, 0, 3.2]) > 0, 'just above is open');
  assert.ok(f.distance([0, 0, 1.6]) > 0, 'the old centre is outside the clip');
});

check('THE ONE THAT MATTERS: clipped and carved faces agree', () => {
  // The sign is the only difference between the operations, and it decides
  // which way the surface faces. Same sphere point, made both ways: a
  // carved doorway roof faces down into the opening, and the matching
  // clipped cap faces the same way. Backwards is a one-character bug.
  const fa = compiled('carve-face.nil.json');
  const fb = compiled('clip-face.nil.json');
  const Q = [0, 2.2, 1.5];
  const na = fa.normal(Q).map((x) => +x.toFixed(9));
  const nb = fb.normal(Q).map((x) => +x.toFixed(9));
  assert.deepEqual(na, [0, 0, -1], `carved face should face down, got ${na}`);
  assert.deepEqual(nb, na, `clipped face ${nb} disagrees with carved face ${na}`);
});

console.log(`\nintersect-corpus: ${passed} checks passed\n`);
