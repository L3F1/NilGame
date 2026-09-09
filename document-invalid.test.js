// Invalid-document corpus for engine/world/document.js: one defect per
// document, each mutated from a valid fixture (see
// levels/fixtures/invalid/manifest.json for base + change). Every refusal
// is asserted on its MESSAGE — "throws" passing for the wrong reason is
// how this kind of test rots — and the message must name the offending id
// or field, except the two charts.js value-constraint messages noted in
// the MUSE-13 report. Rejected addEntity/addPortal/editEntities calls must
// leave the source byte-identical: atomicity is asserted, not assumed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import {
  compileSceneField, addEntity, addPortal, editEntities,
} from './engine/world/scene-field.js';

const invalidRoot = new URL('./levels/fixtures/invalid/', import.meta.url);
const fixtureRoot = new URL('./levels/fixtures/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', invalidRoot), 'utf8'));

let refused = 0;
for (const c of manifest.cases) {
  const doc = JSON.parse(readFileSync(new URL(c.file, invalidRoot), 'utf8'));
  const before = JSON.stringify(doc);
  let error = null;
  try { validateScene(doc); } catch (e) { error = e; }
  assert.ok(error, `${c.file}: accepted, expected refusal (${c.change})`);
  assert.ok(error.message.includes(c.errorContains),
    `${c.file}: wrong refusal for [${c.change}]: ${error.message}`);
  assert.equal(JSON.stringify(doc), before, `${c.file}: validator mutated its input`);
  if (c.base) {
    // The defect, not the base, refuses: the untouched fixture validates.
    validateScene(JSON.parse(readFileSync(new URL(c.base, fixtureRoot), 'utf8')));
  }
  refused++;
}

// Rejected API calls leave the source byte-identical.
const lab = () => JSON.parse(readFileSync(new URL('ball-lab.nil.json', fixtureRoot), 'utf8'));
{
  const source = lab(), before = JSON.stringify(source);
  assert.throws(() => addEntity(source, 'ball', { position: [0, 0, 0.25] }),
    /expected positive finite number/);
  assert.equal(JSON.stringify(source), before, 'rejected addEntity mutated its source');
}
{
  const source = lab(), before = JSON.stringify(source);
  assert.throws(() => editEntities(source,
    [{ id: 'editable-ball', patch: { radius: -1 } }]), /expected positive finite number/);
  assert.equal(JSON.stringify(source), before, 'rejected editEntities mutated its source');
}
{
  const source = lab(), before = JSON.stringify(source);
  assert.throws(() => editEntities(source, [{ id: 'no-such-thing', patch: {} }]),
    /No entity with id no-such-thing/);
  assert.equal(JSON.stringify(source), before, 'rejected editEntities mutated its source');
}
{
  // addPortal's defaults do not fit a 4-extent lab. Note the refusal comes
  // from chart.decode (document.js:57), which runs before the straddle
  // pre-check (:62): a far-outside point fails decoding first, with a
  // message that names neither id nor field. The point here is atomicity
  // on failure, not the defaults.
  const source = lab(), before = JSON.stringify(source);
  assert.throws(() => addPortal(source), /Point lies outside chart extent/);
  assert.equal(JSON.stringify(source), before, 'rejected addPortal mutated its source');
}

console.log(`document-invalid: ${refused} refusal cases (message-checked, non-mutating, base-validates) + 4 atomicity checks passed`);
