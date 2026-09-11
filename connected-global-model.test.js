import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConnectedGlobalPreview,GLOBAL_FLIGHT_SPEED,GLOBAL_PITCH_LIMIT} from './app/connected-global-model.js';
import {rollAgainst} from './engine/world/camera-frame.js';
const doc=JSON.parse(fs.readFileSync('levels/fixtures/connected-global.nil.json'));
const model=createConnectedGlobalPreview(doc);
const gap=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
// Independent references: the fixture's anchors map flat +z to ambient e2 and back.
const analyticUp=()=>model.state.regionId==='sphere'?[0,0,1,0]:[0,0,1];
function upright(label,up=analyticUp(),tol=1e-9){
  assert.ok(gap(model.referenceUp,up)<tol,`${label}: reference up ${model.referenceUp} expected ${up}`);
  assert.ok(Math.abs(rollAgainst(model.state.camera,up))<tol,`${label}: camera rolled against reference up`);
}
const elevationAgainst=up=>Math.asin(dot(model.state.camera.forward,up));

// Roll: 600 mouse loops return upright in E3.
assert.equal(model.state.regionId,'flat');assert.match(model.status(),/^flat · E3/);assert.doesNotMatch(model.status(),/COMPLETE S3/);
for(let i=0;i<600;i++){model.advance(1/60,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});upright(`flat loop ${i}`);}
// High pitch: yaw is about reference up, so elevation holds and heading turns by the yaw.
model.act('reset');model.advance(0,[0,0,0],{pitch:10});
assert.ok(Math.abs(elevationAgainst([0,0,1])-GLOBAL_PITCH_LIMIT)<1e-10,'pitch clamps against reference up');
for(let i=1;i<=40;i++){
  model.advance(0,[0,0,0],{yaw:.1});upright(`high-pitch yaw ${i}`);
  assert.ok(Math.abs(elevationAgainst([0,0,1])-GLOBAL_PITCH_LIMIT)<1e-10,`pure yaw kept elevation (${i})`);
  const f=model.state.camera.forward,heading=Math.atan2(-f[0],f[1]);
  assert.ok(Math.abs(Math.atan2(Math.sin(heading-.1*i),Math.cos(heading-.1*i)))<1e-9,`heading follows yaw (${i})`);
}
model.advance(0,[0,0,0],{pitch:-20});
assert.ok(Math.abs(elevationAgainst([0,0,1])+GLOBAL_PITCH_LIMIT)<1e-10,'negative clamp');

// Traversal: actual advance through flat/sphere/flat, pitched view, level straight flight.
model.act('reset');model.advance(0,[0,0,0],{pitch:1.2});
const visited=['flat'];let antipode=false,frames=0;
for(;frames<2000;frames++){
  // Pitched forward plus a descent along carried up is level: f-sin(1.2)u = cos(1.2)h.
  model.advance(1/60,[0,1,-Math.sin(1.2)]);
  assert.equal(model.halted,false,`halted at ${frames}: ${model.motion}`);
  if(model.state.regionId!==visited.at(-1))visited.push(model.state.regionId);
  upright(`route ${frames} ${model.state.regionId}`,analyticUp(),1e-7);
  assert.ok(Math.abs(elevationAgainst(analyticUp())-1.2)<1e-7,`route ${frames}: pitch transported`);
  if(model.state.regionId==='sphere'){
    assert.match(model.status(),/COMPLETE S3/);
    if(model.state.position[3]<-.999)antipode=true;
  }
  if(visited.length===3&&model.state.position[1]>.5)break;
}
assert.deepEqual(visited,['flat','sphere','flat']);assert.ok(antipode,'route passes the antipode');
assert.ok(Math.abs(model.state.position[0]-3)<1e-6&&Math.abs(model.state.position[2])<1e-6,'return portal places body');
assert.ok(frames>500,'traversal used many real-time frames, not a teleport');
// Yaw regression after portals: roll and elevation stay fixed against carried up.
for(let i=0;i<300;i++){model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});upright(`post-route loop ${i}`,[0,0,1],1e-7);}

// Noncentral turned sphere flight: compare with independent per-frame transport.
model.act('spawn-sphere');assert.equal(model.state.regionId,'sphere');assert.match(model.status(),/COMPLETE S3 · radius 8/);
const space=model.world.regions.get('sphere').space;
model.advance(0,[0,0,0],{yaw:.6,pitch:.3});
let expectedUp=[0,0,1,0];upright('sphere turned spawn',expectedUp);
for(let i=0;i<120;i++){
  if(i%10===5){model.look({yaw:-.3,pitch:.1});upright(`sphere look ${i}`,expectedUp,1e-9);}
  const {position:p,camera:c}=model.state,wish=[.4,1,.3];
  const raw=c.forward.map((x,k)=>c.right[k]*wish[0]+x*wish[1]+expectedUp[k]*wish[2]),n=Math.hypot(...raw);
  const leg=space.stepWithTransport(p,raw.map(x=>x/n),GLOBAL_FLIGHT_SPEED*.04);
  model.advance(.04,wish);
  assert.equal(model.halted,false,`sphere flight halted ${i}: ${model.motion}`);
  assert.equal(model.state.regionId,'sphere');
  expectedUp=leg.carry(expectedUp);
  assert.ok(gap(model.state.position,leg.position)<1e-9,`sphere flight ${i}: position ${model.state.position} vs ${leg.position}`);
  upright(`sphere flight ${i}`,expectedUp,1e-9);
}
const pNon=model.state.position;assert.ok(Math.hypot(pNon[1],pNon[2])*8>.5,'noncentral pose left the route plane');
for(let i=0;i<600;i++){model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});upright(`sphere loop ${i}`,expectedUp,1e-9);}

// Buttons and spawns.
model.act('spawn-flat');const right=[...model.state.camera.right];model.act('left');
assert.ok(dot(model.state.camera.forward,right)<0,'left button turns left');
model.act('reset');model.act('forward');assert.ok(Math.abs(model.state.position[1]+1.75)<1e-12,'forward button steps a quarter unit');
model.act('back');assert.ok(gap(model.state.position,[0,-2,0])<1e-12);

// Halts refuse input; reset recovers to the chosen spawn.
model.act('reset');model.advance(0,[0,0,0],{yaw:Math.PI});
for(let i=0;i<400&&!model.halted;i++)model.advance(.04,[0,1,0]);
assert.ok(model.halted&&/domain-exit/.test(model.motion),`expected flat extent halt, got ${model.motion}`);
assert.match(model.status(),/halted; reset to recover/);
const frozen=model.state;model.advance(.04,[0,-1,0],{yaw:1});model.act('forward');model.act('left');model.look({yaw:1});
assert.equal(model.state,frozen,'halted model refuses motion and look');
model.act('reset');assert.equal(model.halted,false);assert.deepEqual([...model.state.position],[0,-2,0]);
model.act('spawn-sphere');model.act('reset');assert.equal(model.state.regionId,'sphere','reset returns to selected spawn');

// Straight sight through both portals uses the renderer's explicit range.
model.act('spawn-flat');
assert.throws(()=>model.sight(model.state.camera.forward),/explicit maxDistance/);
const straight=model.sight(model.state.camera.forward,64);
assert.equal(straight.status,'hit');assert.equal(straight.query.owner,'flat-target');assert.equal(straight.crossings.length,2);
assert.ok(Math.abs(straight.distance-(2+1.5*Math.PI*8+2.4))<1e-8);
assert.notEqual(model.sight(model.state.camera.forward,32).status,'hit','old 32-unit range cannot reach through the sphere');
const centre=model.pixelSight(1,1,0,0,64);assert.equal(centre.query?.owner,'flat-target','one-pixel view is the forward ray');
assert.throws(()=>model.act('fly'),/Unknown/);assert.throws(()=>model.advance(NaN),/Invalid/);
console.log(`connected global model: roll/high-pitch look, ${frames}-frame flat/S3/flat route with antipode, independent S3 transport, halts/reset, spawns and 64-unit sight passed`);
