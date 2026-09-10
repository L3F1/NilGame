// Cross-geometry camera ownership and the radial aperture gameplay policy.
import assert from 'node:assert/strict';
import { createMetricSpace } from './engine/geometry/metric-space.js';
import { compileRegionPortals } from './engine/world/region-portal.js';
import { createCameraFrame, turn, mapFrame } from './engine/world/camera-frame.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const near = (a,b) => assert.ok(Math.abs(a-b)<2e-11, `${a} != ${b}`);
const vectorNear = (a,b) => { assert.equal(a.length,b.length); a.forEach((x,i)=>near(x,b[i])); };
const e3 = createMetricSpace({kind:'e3'});

for (const R of [0.5, 8, 100]) test(`off-center round trip, physical radius scale ${R}`, () => {
  const s3 = createMetricSpace({kind:'s3',curvatureRadius:R});
  const a = {id:'a',regionId:'flat',position:[0,0,0],forward:[0,1,0],up:[0,0,1],radius:0.6*R};
  const b = {...a,id:'b',regionId:'sphere',position:[0.15*R,0,0.1*R],forward:[1,0,0]};
  const scene = {units:{playerRadius:0.02*R},entities:[a,b],connections:[{id:'gate',a:'a',b:'b'}]};
  const [out,back] = compileRegionPortals(scene,new Map([['flat',{space:e3}],['sphere',{space:s3}]]));
  const p = [0.2*R,0,0.1*R];
  const camera = turn(createCameraFrame(e3,p,{forward:[0,-1,0],up:[0,0,1]}),{roll:0.63,pitch:0.21});
  const transit = out.transit(p);
  const mapped = mapFrame(camera,transit.position,transit.carry,s3);
  assert.equal(mapped.space,s3);
  vectorNear(mapped.position,transit.position);
  near(s3.distance(s3.decode(b.position),mapped.position),Math.hypot(p[0],p[2]));
  for (const key of ['forward','up','right']) {
    s3.validateTangent(mapped.position,mapped[key]);
    near(s3.norm(mapped.position,mapped[key]),1);
    vectorNear(mapped[key],transit.carry(camera[key]));
  }
  near(s3.dot(mapped.position,mapped.forward,mapped.up),0);
  // Independent invariant: physical velocity length and angle to the view.
  // This is NOT a claim that the position map's differential is an isometry.
  const v = [2,-3,0.4], carried = transit.carry(v);
  near(s3.norm(mapped.position,carried),Math.hypot(...v));
  near(s3.dot(mapped.position,carried,mapped.forward),e3.dot(p,v,camera.forward));
  const reverse = back.transit(mapped.position);
  const returned = mapFrame(mapped,reverse.position,reverse.carry,e3);
  assert.equal(returned.space,e3);
  vectorNear(returned.position,p);
  for (const key of ['forward','up','right']) vectorNear(returned[key],camera[key]);
});

test('same-space API remains compatible', () => {
  const c = createCameraFrame(e3,[0,0,0],{forward:[0,1,0],up:[0,0,1]});
  const moved = mapFrame(c,[1,2,3],v=>v.slice());
  assert.equal(moved.space,e3); vectorNear(moved.forward,c.forward);
});
test('equal vector dimensions do not imply equal geometry instances', () => {
  const small = createMetricSpace({kind:'s3',curvatureRadius:1});
  const large = createMetricSpace({kind:'s3',curvatureRadius:9});
  const p = [0,0,0,1];
  const c = createCameraFrame(small,p,{forward:[0,1,0,0],up:[0,0,1,0]});
  const mapped = mapFrame(c,p,v=>v.slice(),large);
  assert.equal(mapped.space,large);
  // Equal physical travel has a different angular displacement after crossing.
  const q = mapped.space.step(p,mapped.forward,1);
  near(q[1],Math.sin(1/9)); near(q[3],Math.cos(1/9));
});
test('invalid destination tangent is rejected rather than projected into plausibility', () => {
  const s3 = createMetricSpace({kind:'s3'});
  const c = createCameraFrame(e3,[0,0,0],{forward:[0,1,0],up:[0,0,1]});
  assert.throws(()=>mapFrame(c,[0,0,0,1],v=>[...v,0.2],s3),/tangent/);
});
console.log(`${passed}/${passed+failed} cross-region frame checks passed`);
process.exitCode = failed ? 1 : 0;
