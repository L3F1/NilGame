import assert from 'node:assert/strict';
import {sphericalRootBounds as solve,sphericalBallRootBounds,
  sphericalPlaneCrossingBounds as planeBounds,
  sphericalBallExterior as exterior} from './engine/geometry/spherical-root-bounds.js';
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

// The coefficient rectangle's angular extent, asin(dh/h), is invisible while the
// error is tiny against the amplitude: every case above has dh/h near 1e-7, so
// deleting that term changed nothing and the suite stayed green. This case makes
// it load-bearing - a small amplitude with a coarse coefficient box, where the
// rectangle subtends about 0.1 rad about the origin.
const shallow={a:.05,b:.02,c:.03,errorA:.004,errorB:.004,errorC:1e-6,
  curvatureRadius:8,maxDistance:64};
const shallowBands=solve(shallow);
assert.equal(shallowBands.status,'roots',shallowBands.reason);
for(const signA of [-1,0,1])for(const signB of [-1,0,1])for(const signC of [-1,1]){
  const f=t=>(shallow.a+signA*shallow.errorA)*Math.cos(t/8)
    +(shallow.b+signB*shallow.errorB)*Math.sin(t/8)-shallow.c-signC*shallow.errorC;
  for(let start=0;start<63.9;start+=.05){
    let lo=start,hi=start+.05;if(f(lo)*f(hi)>=0)continue;
    for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}
    assert.ok(contains(shallowBands,(lo+hi)/2),
      `A rotated shallow corner escaped its band at ${(lo+hi)/2}`);checked++;
  }
}

// Plane crossings: the same problem with c=0, and the best conditioned case of
// it. Checked the same way, by independent sign brackets over the corners of
// the coefficient box, with no atan in the reference.
const plane={point:[1,0,0,0],pointError:[1e-7,1e-7,0,0],
  direction:[0,.6,.8,0],directionError:[1e-7,1e-7,1e-7,0],
  normal:[0,1,0,0],normalError:[1e-8,1e-8,1e-8,0],curvatureRadius:8,maxDistance:64};
const crossings=planeBounds(plane);
assert.equal(crossings.status,'crossings');
assert.ok(crossings.events.every(event=>event.kind==='ambiguous'),
  'A plane crossing proves when the great sphere is met, never that the ray leaves');
for(const signP of [-1,1])for(const signD of [-1,1]){
  const a=plane.point.reduce((sum,v,i)=>sum+(v+signP*plane.pointError[i])*plane.normal[i],0);
  const b=plane.direction.reduce((sum,v,i)=>sum+(v+signD*plane.directionError[i])*plane.normal[i],0);
  const f=t=>a*Math.cos(t/8)+b*Math.sin(t/8);
  for(let start=0;start<63.9;start+=.05){
    let lo=start,hi=start+.05;if(f(lo)*f(hi)>=0)continue;
    for(let i=0;i<55;i++){const mid=(lo+hi)/2;if(f(lo)*f(mid)<=0)hi=mid;else lo=mid;}
    assert.ok(contains(crossings,(lo+hi)/2),`Missing bracketed plane crossing ${lo}`);checked++;
  }
}
// Crossings repeat every half turn, and the bands stay narrow because the zeros
// sit where the derivative is largest.
const spacing=crossings.events.slice(1).map((event,i)=>event.lower-crossings.events[i].lower);
for(const gap of spacing)assert.ok(Math.abs(gap-Math.PI*8)<1e-3,`Crossing spacing ${gap}`);
for(const event of crossings.events)assert.ok(event.upper-event.lower<1e-3,'Plane band unexpectedly wide');
// A wider box may only widen, and an undetermined phase locates nothing.
const wider=planeBounds({...plane,directionError:[1e-5,1e-5,1e-5,0]});
crossings.events.forEach((event,i)=>assert.ok(wider.events[i].lower<=event.lower
  &&wider.events[i].upper>=event.upper));
assert.equal(planeBounds({...plane,point:[0,0,1,0],direction:[0,0,0,1],
  pointError:[0,1,0,0],directionError:[0,1,0,0]}).reason,'phase-indeterminate');
assert.equal(planeBounds({...plane,maxDistance:1e12}).reason,'event-budget');
assert.throws(()=>planeBounds({...plane,normalError:undefined}),/missing input-error/);
assert.throws(()=>planeBounds({...plane,phaseAllowance:-1}),/Invalid spherical plane/);

// The exterior certificate proves a strict outside and nothing else.
const outside={point:[0,1,0,0],pointError:[0,0,0,0],center:[0,0,0,1],centerError:[0,0,0,0],
  radius:.6,radiusError:0,curvatureRadius:8};
assert.equal(exterior(outside).status,'outside');
assert.equal(exterior({...outside,point:[0,0,0,1]}).status,'unresolved');
assert.equal(exterior({...outside,pointError:[2,2,2,2]}).status,'unresolved');
assert.throws(()=>exterior({...outside,centerError:undefined}),/missing input-error/);
console.log(`Spherical root bounds: ${checked} independent sign-bracketed roots and plane crossings, uncertainty widening, exterior certificates and explicit refusals`);
