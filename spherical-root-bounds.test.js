import assert from 'node:assert/strict';
import {sphericalRootBounds as solve,sphericalBallRootBounds} from './engine/geometry/spherical-root-bounds.js';
const base={a:1,b:0,c:Math.cos(.075),errorA:1e-7,errorB:1e-7,errorC:1e-7,curvatureRadius:8,maxDistance:64};
const contains=(result,t)=>result.events.some(e=>e.lower<=t&&t<=e.upper);
const exact=solve({...base,errorA:0,errorB:0,errorC:0});
for(const t of [.6,16*Math.PI-.6,16*Math.PI+.6])assert.ok(contains(exact,t));
assert.equal(exact.status,'roots');
// Independent sign-bracketing reference: no atan/acos/root formula.
let checked=0;
for(const a of [base.a-base.errorA,base.a,base.a+base.errorA])
for(const b of [-base.errorB,0,base.errorB])
for(const c of [base.c-base.errorC,base.c,base.c+base.errorC]){
  const result=solve(base),f=t=>a*Math.cos(t/8)+b*Math.sin(t/8)-c;
  for(const bracket of [[0,1],[49,50.265],[50.265,52]]){
    let [lo,hi]=bracket;assert.ok(f(lo)*f(hi)<0);
    for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}
    assert.ok(contains(result,(lo+hi)/2),`Missing bracketed root ${lo}`);checked++;
  }
}
const tight=solve(base),wide=solve({...base,errorA:1e-6,errorB:1e-6,errorC:1e-6});
tight.events.forEach((e,i)=>assert.ok(wide.events[i].lower<=e.lower&&wide.events[i].upper>=e.upper));
for(const phase of [-3,-1.2,1.5,3.13])for(const angle of [.05,.1]){
  const input={...base,a:Math.cos(phase),b:Math.sin(phase),c:Math.cos(angle)};
  const result=solve(input);
  for(const signA of [-1,1])for(const signB of [-1,1])for(const signC of [-1,1]){
    const f=t=>(input.a+signA*input.errorA)*Math.cos(t/8)
      +(input.b+signB*input.errorB)*Math.sin(t/8)-input.c-signC*input.errorC;
    for(let start=0;start<63.9;start+=.1){
      let lo=start,hi=start+.1;if(f(lo)*f(hi)>=0)continue;
      for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}
      assert.ok(contains(result,(lo+hi)/2),'Rotated coefficient corner escaped its root band');checked++;
    }
  }
}
assert.equal(solve({...base,a:base.c,c:base.c}).status,'unresolved');
assert.equal(solve({...base,a:base.c-.001,c:base.c}).status,'miss');
assert.equal(solve({...base,c:1}).reason,'tangency-band');
assert.equal(solve({...base,maxDistance:.6}).reason,'range-boundary');
assert.equal(solve({...base,maxDistance:1e10}).reason,'event-budget');
assert.throws(()=>solve({...base,errorC:undefined}),/Invalid/);
const ball={position:[0,0,0,1],direction:[0,1,0,0],center:[0,0,0,1],
  positionError:[0,0,0,0],directionError:[0,0,0,0],centerError:[0,0,0,0],
  radius:.6,radiusError:0,curvatureRadius:8,maxDistance:64};
assert.ok(contains(sphericalBallRootBounds(ball),.6));
assert.throws(()=>sphericalBallRootBounds({...ball,positionError:undefined}),/missing input-error/);
console.log(`Spherical root bounds: ${checked} independent sign-bracketed roots, uncertainty widening and explicit refusals`);
