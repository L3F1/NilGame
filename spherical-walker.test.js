import assert from 'node:assert/strict';
import {compileRegionWorld} from './engine/world/region-world.js';
import {createSphericalWalker} from './engine/world/spherical-walker.js';
import {createCameraFrame} from './engine/world/camera-frame.js';
import {moveRegionProbe} from './engine/world/region-motion.js';
const scene=()=>({format:'nil-scene',version:2,id:'walk',units:{name:'design-unit',playerRadius:.25},
  regions:[{id:'s',geometry:{kind:'s3',curvatureRadius:8},topology:'cover',extent:10,floorId:'floor'}],
  entities:[{id:'start',kind:'spawn',regionId:'s',position:[0,0,.3]},
    {id:'floor',kind:'plane',regionId:'s',position:[0,0,0],up:[0,0,1]}],connections:[]});
let passed=0,failed=0;
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function test(name,fn){try{fn();passed++;}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`);}}
function setup(doc=scene()){const world=compileRegionWorld(doc);return {world,walk:createSphericalWalker(world),state:world.spawn()};}
test('fall, sustained rest and walking use physical floor height',()=>{
  const {world,walk}=setup();let s=world.spawn();
  for(let i=0;i<120;i++){const out=walk.step(s,1/60);assert.equal(out.status,'complete',out.detail);s=out.state;}
  assert.ok(walk.support(s).grounded);
  near(walk.support(s).height,.25,2e-4);
  const start=s.position;
  for(let i=0;i<120;i++){const out=walk.step(s,1/60,{wish:[0,1]});assert.equal(out.status,'complete',out.detail);s=out.state;}
  near(walk.support(s).height,.25,3e-4);
  assert.ok(world.regions.get('s').space.distance(start,s.position)>3.8);
  world.regions.get('s').space.validateTangent(s.position,s.camera.forward);
});
test('jump departs from support and cannot double-jump',()=>{
  const {walk,state}=setup();let s=walk.step(state,.2).state;
  assert.ok(walk.support(s).grounded);
  const a=walk.step(s,1/120,{jump:true});assert.equal(a.grounded,false);
  const b=walk.step(a.state,1/120,{jump:true});
  const v0=walk.support(a.state),v1=walk.support(b.state);
  assert.ok(v1.height>v0.height);
  assert.ok(v1.height-v0.height<.04);
});
test('invalid start is reported even with no requested movement',()=>{
  const {world,walk}=setup(),space=world.regions.get('s').space,p=space.decode([0,0,-.2]);
  const s={...world.spawn(),position:p,velocity:[0,0,0,0],camera:createCameraFrame(space,p,{forward:space.frame(p)[1],up:space.frame(p)[2]})};
  const out=walk.step(s,.1);assert.equal(out.status,'unresolved');assert.equal(out.detail,'center-in-solid');
  assert.equal(out.timeConsumed,0);near(out.timeRemaining,.1);assert.equal(out.state,s);
  const probe=moveRegionProbe(world,s,.1);
  assert.equal(probe.status,'unresolved');assert.equal(probe.detail,'stationary-center-in-solid');
  assert.equal(probe.timeConsumed,0);assert.deepEqual(probe.state.position,p);
});
test('zero and bounded integration clocks',()=>{
  const {walk,state}=setup();const original=JSON.stringify(state);
  const zero=walk.step(state,0);assert.equal(zero.state,state);assert.equal(zero.substeps,0);
  const limited=walk.step(state,2,{maxSubsteps:2});assert.equal(limited.status,'budget-exhausted');
  near(limited.timeConsumed+limited.timeRemaining,2);assert.equal(limited.substeps,2);
  assert.equal(JSON.stringify(state),original);
});
test('modified floors are refused rather than treated as infinite support',()=>{
  const doc=scene();doc.entities.push({id:'cut',kind:'ball',regionId:'s',position:[3,0,0],radius:.5,op:'subtract',target:'floor'});
  const w=compileRegionWorld(doc);assert.throws(()=>createSphericalWalker(w),/modified floor/);
});
test('local-up yaw preserves elevation on a tilted floor',()=>{
  const doc=scene();doc.entities[1].up=[.6,0,.8];doc.entities[0].position=[.18,0,.24];
  const {walk,world}=setup(doc);let s=world.spawn();
  s=walk.look(s,{pitch:.7});
  const space=world.regions.get('s').space,up=walk.support(s).up;
  const elevation=space.dot(s.position,s.camera.forward,up);
  for(let i=0;i<100;i++)s=walk.look(s,{yaw:.1});
  near(space.dot(s.position,s.camera.forward,up),elevation,1e-12);
  s=walk.look(s,{pitch:100});
  near(Math.asin(space.dot(s.position,s.camera.forward,up)),1.5,1e-12);
});
test('free fall converges toward the independent one-dimensional height solution',()=>{
  const {walk,world}=setup();const space=world.regions.get('s').space;
  const p=space.decode([0,0,2]),base=space.frame(p);
  const s={...world.spawn(),position:p,velocity:p.map(()=>0),camera:createCameraFrame(space,p,{forward:base[1],up:base[2]})};
  const exact=2-9*.2*.2/2;
  const coarse=walk.support(walk.step(s,.2,{maxSubstep:1/60}).state).height;
  const fine=walk.support(walk.step(s,.2,{maxSubstep:1/240}).state).height;
  assert.ok(Math.abs(fine-exact)<Math.abs(coarse-exact)/3);
  near(fine,exact,.004);
});
test('obstacles block walking but do not become the designated support',()=>{
  const doc=scene();doc.entities.push({id:'obstacle',kind:'ball',regionId:'s',position:[0,1.5,.5],radius:.5});
  const {walk,world}=setup(doc);let s=world.spawn();
  for(let i=0;i<90;i++){
    const out=walk.step(s,1/60,{wish:[0,1]});s=out.state;
    assert.ok(world.regions.get('s').field.distance(s.position)>=s.radius-1e-4);
    if(out.pendingLift||out.status==='unresolved')break;
  }
  assert.ok(world.regions.get('s').space.encode(s.position)[1]<1.5);
});
test('physical support scales with radius and follows an offset floor',()=>{
  for(const R of [.5,8,100]) {
    const doc=scene();doc.regions[0].geometry.curvatureRadius=R;doc.regions[0].extent=R;
    doc.units.playerRadius=R*.03;doc.entities[1].position=[0,0,-R*.2];
    doc.entities[0].position=[0,0,-R*.16];
    const {walk,world}=setup(doc);let s=world.spawn();
    near(walk.support(s).height,R*.04,1e-11);
    for(let i=0;i<120;i++) {
      const out=walk.step(s,1/120,{gravity:R,speed:R*.1,skin:R*1e-5});
      assert.equal(out.status,'complete',out.detail);s=out.state;
    }
    near(walk.support(s,{skin:R*1e-5}).height,s.radius,R*2e-5);
  }
});
console.log(`${passed}/${passed+failed} spherical walking checks passed`);process.exitCode=failed?1:0;
