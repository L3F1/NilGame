import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileRegionWorld} from './engine/world/region-world.js';
import {packConnectedWorld} from './engine/geometry/connected-shader.js';
import {createConnectedPreview} from './app/connected-preview-model.js';
const scene=JSON.parse(fs.readFileSync('levels/fixtures/connected-sight.nil.json'));
const world=compileRegionWorld(scene),data=packConnectedWorld(world);
assert.deepEqual(data.counts,[29,9,8,4]);
assert.ok(data.texture.every(Number.isFinite));
const row=i=>[...data.texture.slice(i*4,i*4+4)];
for(let i=0;i<data.counts[3];i++){
  const gate=row(132+i*10),back=row(132+gate[3]*10);
  assert.deepEqual(back.slice(0,2),[gate[1],gate[0]]);
  assert.equal(back[3],i);
}
// The carve is scoped to curve-wall; independent balls/floors must not inherit it.
const wall=data.primitiveIds.indexOf('curve-wall'),cut=data.primitiveIds.indexOf('curve-door');
let found=false;for(let i=0;i<data.counts[2];i++){const g=row(112+i);if(g[0]===wall){assert.equal(g[1],1<<cut);found=true;}else assert.equal(g[1],0);}
assert.ok(found);
const tooWide=structuredClone(scene);tooWide.regions.find(r=>r.id==='curve').extent=13;
assert.throws(()=>packConnectedWorld(compileRegionWorld(tooWide)),/hemisphere/);
const p=createConnectedPreview(scene),crossed=new Set(['entry']);
for(let i=0;i<260;i++){p.advance(1/60,[0,1,0]);assert.equal(p.halted,false);crossed.add(p.state.regionId);}
assert.deepEqual([...crossed],['entry','curve','far']);
p.act('reset');const before=[...p.state.position];p.advance(10,[0,1,0]);assert.ok(Math.hypot(...p.state.position.map((x,i)=>x-before[i]))<=.0800001,'long frame clamps motion time');
console.log('connected renderer: packing, portal pairs, scoped masks, domain refusal and continuous motion passed');
