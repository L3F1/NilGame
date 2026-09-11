import assert from 'node:assert/strict';
import {createSphericalFlight} from './app/spherical-cover-model.js';
import {rollAgainst} from './engine/world/camera-frame.js';
const m=createSphericalFlight(),period=2*Math.PI*m.space.curvatureRadius;
const original=m.state.camera;
for(let i=0;i<256;i++){
  m.stepLoop(period/256);
  assert.ok(m.space.withinDomain(m.state.position));
  assert.ok(Math.abs(rollAgainst(m.state.camera,m.state.reference.up))<1e-10);
  // The intended route is clear by actual metric distance, not chart spacing.
  for(const ball of m.balls)assert.ok(m.space.distance(m.state.position,ball.center)>ball.radius+.25);
  if(i===127)assert.ok(m.state.position[3]<-.999999999);
}
assert.ok(m.state.returnDistance<1e-10);assert.ok(Math.abs(m.state.travel-period)<1e-10);
for(const key of ['forward','up','right'])assert.ok(Math.hypot(...m.state.camera[key].map((x,i)=>x-original[key][i]))<1e-10);
for(let i=0;i<600;i++){m.advance(0,[0,0,0],{yaw:.1*Math.cos(i/13),pitch:.1*Math.sin(i/13)});assert.ok(Math.abs(rollAgainst(m.state.camera,m.state.reference.up))<1e-10);}
m.reset();const before=m.state.position;m.advance(10,[0,1,0]);assert.ok(m.space.distance(before,m.state.position)<=.16000001);
assert.throws(()=>m.advance(NaN),/Invalid/);
console.log('spherical flight: clear full loop, antipode, frame return, upright look and time cap passed');
