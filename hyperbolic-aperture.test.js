import assert from 'node:assert/strict';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
import {queryHyperbolicAperture as query} from './engine/geometry/hyperbolic-aperture.js';

let cases=0;
for(const R of [.5,8,10000]) {
  const s=createHyperbolicSpace({curvatureRadius:R});
  const center=s.decode([.2*R,-.3*R,.1*R]),basis=s.frame(center);
  const normal=s.normalize(center,basis[0].map((x,i)=>x+.7*basis[1][i]));
  const side=s.normalize(center,s.project(center,basis[2],normal));
  const aperture={center,normal,radius:.5*R};
  // Construct the known intersection FIRST, then travel backwards from it.
  // Expected arclength comes from reversibility, not the analytic root formula.
  for(const offset of [0,.15,.35])for(const slant of [0,.4,-.6]) {
    const q=s.step(center,side,offset*R);
    const lateral=s.transport(center,q,side);
    const v=s.normalize(q,normal.map((x,i)=>-x+slant*lateral[i]));
    const d=.4*R,p=s.step(q,v,-d),u=s.transport(q,p,v);
    const hit=query(s,aperture,p,u,{maxDistance:.8*R,bodyRadius:.05*R});
    assert.equal(hit.status,'hit');
    assert.ok(Math.abs(hit.distance-d)<1e-8*R);
    assert.ok(s.distance(hit.point,q)<1e-8*R);
    assert.ok(Math.abs(hit.clearance-(.45-offset)*R)<1e-8*R);
    const height=t=>R*Math.asinh(s.ambientDot(s.step(p,u,t),normal));
    assert.ok(height(d-1e-5*R)>0&&height(d+1e-5*R)<0);
    assert.equal(query(s,aperture,p,u,{maxDistance:.3*R}).status,'miss');
    assert.equal(query(s,aperture,p,u,{maxDistance:d}).reason,'range-boundary');
    const reverse=s.transport(p,q,u);
    assert.equal(query(s,aperture,s.step(q,reverse,.1*R),
      s.transport(q,s.step(q,reverse,.1*R),reverse),{maxDistance:.2*R}).status,'miss');
    cases++;
  }
  const a={center:s.origin,normal:[1,0,0,0],radius:.5*R};
  const p=s.decode([.4*R,0,0]),toward=s.frame(p)[0].map(x=>-x);
  assert.equal(query(s,a,p,toward,{maxDistance:R,bodyRadius:.5*R}).reason,'aperture-rim');
  assert.equal(query(s,a,p,toward,{maxDistance:R,bodyRadius:.6*R}).status,'miss');
  assert.equal(query(s,a,s.origin,[1,0,0,0],{maxDistance:R}).reason,'boundary-start');
  // A ray asymptotic to the plane: B=-A, with the remainder in y.
  const k=Math.tanh(.4),asym=s.frame(p)[0].map((x,i)=>-k*x+(i===1?Math.sqrt(1-k*k):0));
  assert.equal(query(s,a,p,asym,{maxDistance:R}).reason,'asymptotic-plane');
  const farK=Math.tanh(.4)/Math.tanh(3),farRay=s.frame(p)[0].map((x,i)=>-farK*x+(i===1?Math.sqrt(1-farK*farK):0));
  assert.equal(query(s,a,p,farRay,{maxDistance:4*R}).reason,'domain-exit');
  const rim=s.step(s.origin,[0,1,0,0],.5*R),rimP=s.step(rim,[1,0,0,0],.2*R);
  const rimU=s.transport(rim,rimP,[-1,0,0,0]);
  assert.equal(query(s,a,rimP,rimU,{maxDistance:R}).reason,'aperture-rim');
  assert.equal(query(s,a,rimP,rimU,{maxDistance:R,bodyRadius:.1*R}).status,'miss');
  assert.equal(query(s,a,p,s.frame(p)[0],{maxDistance:R}).status,'miss');
  assert.equal(query(s,a,p,s.frame(p)[0],{maxDistance:3*R}).reason,'domain-exit');
  const edge=s.step(s.origin,[1,0,0,0],2*R);
  assert.equal(query(s,a,edge,s.frame(edge)[0],{maxDistance:R}).reason,'domain-exit');
  // Invalid data are errors, not repaired normals or confident misses.
  for(const opts of [{},{maxDistance:-1},{maxDistance:Infinity},{maxDistance:R,bodyRadius:-1}])
    assert.throws(()=>query(s,a,p,toward,opts));
  assert.throws(()=>query(s,{...a,normal:[2,0,0,0]},p,toward,{maxDistance:R}));
  assert.throws(()=>query(s,{...a,radius:2*R},p,toward,{maxDistance:R}));
  assert.throws(()=>query(s,a,p,[1,0,0,0],{maxDistance:R}));
}
console.log(`H3 aperture: ${cases} constructed oblique crossings; direction, rim, range, domain, asymptote and validation passed`);
