import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview} from './app/connected-global-model.js';
const model=createConnectedGlobalPreview(JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json')));
model.act('approach-exit');
let g=model.renderGuide();
assert.equal(g.nearest.id,'sphere-exit');assert.equal(g.nearest.side,'front');
assert.ok(Math.abs(g.nearest.distance-2)<1e-10);assert.equal(g.aimed.id,'sphere-exit');
assert.ok(Math.abs(g.aimed.distance-2)<1e-10);assert.ok(g.aimed.bodyFits);
for(let i=0;i<40&&model.state.regionId==='sphere';i++)model.advance(1/60,[0,1,0]);
assert.equal(model.state.regionId,'flat');assert.equal(model.halted,false);
model.act('reset');assert.equal(model.state.regionId,'sphere');
assert.ok(Math.abs(model.renderGuide().nearest.distance-2)<1e-10);
// Strafe toward the visual aperture rim: a point ray still fits, a body doesn't.
for(let i=0;i<4;i++)model.advance(.04,[1,0,0]);
model.advance(.015,[1,0,0]);
g=model.renderGuide();assert.equal(g.aimed.id,'sphere-exit');assert.equal(g.aimed.bodyFits,false);
assert.ok(g.aimed.clearance<0);
console.log('portal guide: explicit exit approach, control traversal, reset and visible-but-too-narrow rim passed');
