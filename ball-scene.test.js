import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScene } from './engine/world/document.js';
import { compileBallScene, editBallScene } from './engine/world/ball-scene.js';
const scene=JSON.parse(readFileSync(new URL('./levels/fixtures/ball-lab.nil.json',import.meta.url),'utf8'));
const initial=JSON.stringify(scene), ball=compileBallScene(scene);
assert.equal(ball.distance([0,0,.25]),-.6);
assert.ok(Math.abs(ball.distance([.6,0,.25]))<1e-12);
assert.equal(ball.normal([0,0,.25]),null);
assert.deepEqual(ball.normal([0,0,1.25]),[0,0,1]);
assert.ok(Math.abs(ball.rayHit([0,-2,.25],[0,1,0])-1.4)<1e-12);
assert.equal(ball.rayHit([0,-2,.25],[0,-1,0]),Infinity);
assert.equal(ball.rayHit([0,0,.25],[1,0,0]),0);
assert.throws(()=>ball.rayHit([0,0,0],[0,2,0]),/unit/);
const edited=editBallScene(scene,[.5,0,.25],.4), loaded=compileBallScene(JSON.parse(JSON.stringify(edited)));
assert.equal(loaded.id,ball.id); assert.equal(loaded.regionId,ball.regionId);
assert.deepEqual(loaded.uniform(),[.5,0,.25,.4]);
assert.equal(loaded.distance([.5,0,.25]),-.4);
assert.equal(JSON.stringify(scene),initial);
assert.throws(()=>editBallScene(scene,[4,0,0],.5),/extent/);
assert.throws(()=>editBallScene(scene,[0,0,0],-1),/positive/);
const unsupported=structuredClone(scene); unsupported.regions[0].geometry.kind='h3';
assert.throws(()=>compileBallScene(unsupported),/one E3/);
scene.entities[1].radius=3;
assert.deepEqual(ball.uniform(),[0,0,.25,.6], 'compiled scene owns a snapshot');
// Language-neutral document cases: general-schema and ball-host acceptance
// are asserted separately, with the rejecting reason checked literally.
const cases=JSON.parse(readFileSync(new URL('./levels/fixtures/ball-document-cases.json',import.meta.url),'utf8')).cases;
assert.ok(cases.length>=10, 'representative case set');
for (const c of cases) {
  const doc=JSON.parse(JSON.stringify(c.document)), before=JSON.stringify(doc);
  let generalError=null, hostError=null, host=null;
  try { validateScene(doc); } catch (error) { generalError=error.message; }
  if (!generalError) { try { host=compileBallScene(doc); } catch (error) { hostError=error.message; } }
  assert.equal(JSON.stringify(doc),before, `doc-case ${c.id}: validation never mutates the source`);
  if (c.general==='accept') assert.equal(generalError,null, `doc-case ${c.id}: general rejected: ${generalError}`);
  else assert.ok(generalError, `doc-case ${c.id}: general accepted, expected rejection`);
  if (c.ballHost==='accept') assert.ok(host, `doc-case ${c.id}: ball host rejected: ${hostError}`);
  else {
    const reason=generalError||hostError;
    assert.ok(reason, `doc-case ${c.id}: ball host accepted, expected rejection`);
    if (c.errorContains) assert.ok(reason.includes(c.errorContains), `doc-case ${c.id}: wrong rejection: ${reason}`);
  }
}
// Rejected edits leave the source untouched.
const editable=JSON.parse(readFileSync(new URL('./levels/fixtures/ball-lab.nil.json',import.meta.url),'utf8'));
const editableBefore=JSON.stringify(editable);
assert.throws(()=>editBallScene(editable,[4,0,0],.5),/extent/);
assert.throws(()=>editBallScene(editable,[0,0,0],-1),/positive/);
assert.equal(JSON.stringify(editable),editableBefore, 'rejected edits leave the source unchanged');
// Snapshots cannot be mutated through document()/uniform() results.
const snap=compileBallScene(editable);
snap.document().entities.find(e=>e.kind==='ball').radius=99;
snap.uniform()[0]=99;
assert.deepEqual(snap.uniform(),[0,0,.25,.6], 'uniform results are copies');
assert.equal(snap.distance([0,0,.25]),-.6, 'field still reads the snapshot');
// JSON round trip preserves nontrivial decimals, radius and IDs.
const precise=editBallScene(editable,[1.23456789,-2.34567891,0.33333333],0.123456789);
const revived=compileBallScene(JSON.parse(JSON.stringify(precise)));
assert.deepEqual(revived.uniform(),[1.23456789,-2.34567891,0.33333333,0.123456789]);
assert.equal(revived.id,'editable-ball');
assert.deepEqual(revived.document().entities.find(e=>e.kind==='ball').position,[1.23456789,-2.34567891,0.33333333]);
console.log(`ball scene: signed field, rays, immutable edits, round trip, rejection and ${cases.length} document cases passed`);
