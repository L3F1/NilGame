import assert from 'node:assert/strict';
import {createHyperbolicSpace} from './engine/geometry/hyperbolic-space.js';
import {queryHyperbolicAperture as query} from './engine/geometry/hyperbolic-aperture.js';

// MUSE-68 independent H3 aperture checks. Rays/planes are constructed
// independently of the production root formula (atanh ratio): intersections
// are built first and rays run backwards, and entry is cross-checked by
// signed plane-height bisection. Shared-adapter limits: step, transport,
// ambientDot, distance and frame come from the same adapter under test, so
// agreement is observed consistency, never a proof of correctness.
const REASONS=new Set(['boundary-start','asymptotic-plane','numeric-conditioning',
  'aperture-rim','range-boundary','domain-exit']);
function heightAt(s,normal,p,u,t){
  return s.curvatureRadius*Math.asinh(s.ambientDot(s.step(p,u,t),normal));
}
function bisectEntry(s,normal,p,u,lo,hi){
  const hlo=heightAt(s,normal,p,u,lo),hhi=heightAt(s,normal,p,u,hi);
  assert.ok(hlo>0&&hhi<0,'bisection bracket must straddle a +->- entry');
  let a=lo,b=hi;
  for(let i=0;i<200;i++){const m=(a+b)/2;
    if(heightAt(s,normal,p,u,m)>0)a=m;else b=m;}
  return (a+b)/2;
}
function checkUnknown(r,leadin){
  assert.equal(r.status,'unresolved',`${leadin}: unknown must never be a miss`);
  assert.ok(REASONS.has(r.reason),`${leadin}: known reason, got ${r.reason}`);
  assert.equal(r.uncertaintyFrom,0,`${leadin}: uncertaintyFrom:0 never authorizes movement`);
}
let hits=0,misses=0,unknowns=0;
const seenUnknown=r=>{checkUnknown(r,'vocab');unknowns++;};
for(const R of [.5,8,10000]){
  const s=createHyperbolicSpace({curvatureRadius:R});
  // Translated non-axis normal frame, distinct from the existing suite's numbers.
  const center=s.decode([.35*R,-.25*R,.15*R]),f=s.frame(center);
  const normal=s.normalize(center,f[0].map((x,i)=>x+.7*f[1][i]-.4*f[2][i]));
  const side=s.normalize(center,s.project(center,f[2],normal));
  const aperture={center,normal,radius:.5*R};
  for(const offset of [0,.15,.35])for(const slant of [0,.4,-.6]){
    const q=s.step(center,side,offset*R);
    const lateral=s.transport(center,q,side);
    const nAtQ=s.transport(center,q,normal);
    const v=s.normalize(q,nAtQ.map((x,i)=>-x+slant*lateral[i]));
    const d=.4*R,p=s.step(q,v,-d),u=s.transport(q,p,v);
    const hit=query(s,aperture,p,u,{maxDistance:.8*R,bodyRadius:.05*R});
    assert.equal(hit.status,'hit');
    assert.ok(Math.abs(hit.distance-d)<1e-6*R,`entry distance, R=${R}`);
    assert.ok(Math.abs(s.curvatureRadius*Math.asinh(s.ambientDot(hit.point,normal)))<=1e-9*R,
      `hit point on plane, R=${R}`);
    const tb=bisectEntry(s,normal,p,u,d-.01*R,d+.01*R);
    assert.ok(Math.abs(tb-hit.distance)<1e-6*R,`bisection agrees, R=${R}`);
    assert.ok(Math.abs(hit.clearance-(.45-offset)*R)<1e-6*R,`clearance, R=${R}`);
    hits++;
    // Range competition: strictly short range misses; exact range refuses.
    const short=query(s,aperture,p,u,{maxDistance:.3*R});
    assert.equal(short.status,'miss');misses++;
    const exact=query(s,aperture,p,u,{maxDistance:d});
    seenUnknown(exact);assert.equal(exact.reason,'range-boundary');
    // Reverse ray from the far side keeps going away: miss, not a hit.
    const rev=s.transport(p,q,u);
    const rp=s.step(q,rev,.1*R),ru=s.transport(q,rp,rev);
    assert.equal(query(s,aperture,rp,ru,{maxDistance:.2*R}).status,'miss');misses++;
    // Back-side start aimed AT the plane: the zero is an exit (- to +),
    // never an entering hit.
    const pb=s.step(q,nAtQ,-.3*R),ub=s.transport(q,pb,nAtQ);
    const back=query(s,aperture,pb,ub,{maxDistance:.5*R});
    assert.equal(back.status,'miss');misses++;
    assert.ok(heightAt(s,normal,pb,ub,0)<0&&heightAt(s,normal,pb,ub,.5*R)>0,'exit polarity');
  }
  // Centre crossing ray and on-plane centre start.
  const nc=s.transport(center,center,normal);
  const qc=center,vc=s.normalize(qc,nc.map(x=>-x));
  const pc=s.step(qc,vc,-.4*R),uc=s.transport(qc,pc,vc);
  const ch=query(s,aperture,pc,uc,{maxDistance:.8*R,bodyRadius:.05*R});
  assert.equal(ch.status,'hit');
  assert.ok(Math.abs(ch.clearance-.45*R)<1e-6*R,'centre clearance');hits++;
  seenUnknown(query(s,aperture,center,s.transport(pc,center,uc),{maxDistance:R}));
  // Rim competition: aimed at the rim point; body radius decides rim-vs-miss.
  const rim=s.step(center,side,.5*R);
  const rimN=s.transport(center,rim,normal);
  const rimP=s.step(rim,rimN,.2*R),rimU=s.transport(rim,rimP,rimN.map(x=>-x));
  const rimR=query(s,aperture,rimP,rimU,{maxDistance:R});
  seenUnknown(rimR);assert.equal(rimR.reason,'aperture-rim');
  assert.equal(query(s,aperture,rimP,rimU,{maxDistance:R,bodyRadius:.1*R}).status,'miss');misses++;
  // Near-asymptotic band refuses instead of claiming a confident miss.
  const axC=s.origin,axA={center:axC,normal:[1,0,0,0],radius:.5*R};
  const axP=s.decode([.4*R,0,0]);
  // Solve for the asymptotic direction independently: B(k)+A=0, no copied rapidity.
  const A0=s.ambientDot(axP,[1,0,0,0]);
  const e0=s.frame(axP)[0],e1=s.frame(axP)[1];
  const dir=k=>e0.map((x,i)=>-k*x+Math.sqrt(1-k*k)*e1[i]);
  const gap=k=>s.ambientDot(dir(k),[1,0,0,0])+A0;
  assert.ok(gap(0)>0&&gap(1-1e-12)<0,'asymptotic bracket');
  let klo=0,khi=1-1e-12;
  for(let i=0;i<200;i++){const m=(klo+khi)/2;if(gap(m)>0)klo=m;else khi=m;}
  const asymR=query(s,axA,axP,dir((klo+khi)/2),{maxDistance:R});
  seenUnknown(asymR);assert.equal(asymR.reason,'asymptotic-plane');
  // Domain-limited query: even a missed finite disc cannot turn a later
  // numerical-domain exit into a miss covering the whole requested range.
  const farK=Math.tanh(.55)/Math.tanh(3);
  const far=s.frame(axP)[0].map((x,i)=>-farK*x+(i===1?Math.sqrt(1-farK*farK):0));
  const dom=query(s,axA,axP,far,{maxDistance:4*R});
  seenUnknown(dom);assert.equal(dom.reason,'domain-exit');
  const outP=s.step(s.origin,[1,0,0,0],2*R);
  // maxDistance 2R exceeds the adapter extent; only assert it does not hit.
  assert.notEqual(query(s,axA,axP,s.frame(axP)[0],{maxDistance:2*R}).status,'hit');
  seenUnknown(query(s,axA,outP,s.frame(outP)[0],{maxDistance:R}));
  // Nearly coincident points after the rationalized time-difference fix.
  for(const rap of [.4,1.9,3.9]){
    const base=s.step(s.origin,s.frame(s.origin)[0],rap*R);
    const dir=s.frame(base)[0];
    for(const tiny of [1e-8,1e-10,1e-12]){
      const near=s.step(base,dir,tiny*R);
      const dd=s.distance(base,near);
      assert.ok(Number.isFinite(dd)&&Math.abs(dd-tiny*R)<1e-3*tiny*R+1e-15*R,
        `coincident distance rap=${rap} tiny=${tiny} R=${R}`);
    }
  }
  assert.equal(s.distance(center,center),0);
  // Invalid inputs throw; nothing is repaired into a confident answer.
  const toward=s.frame(axP)[0].map(x=>-x);
  for(const opts of [{},{maxDistance:-1},{maxDistance:NaN},{maxDistance:Infinity},
    {maxDistance:R,bodyRadius:-1},{maxDistance:R,bodyRadius:NaN}])
    assert.throws(()=>query(s,axA,axP,toward,opts));
  assert.throws(()=>query(s,{...axA,normal:[2,0,0,0]},axP,toward,{maxDistance:R}));
  assert.throws(()=>query(s,{...axA,radius:0},axP,toward,{maxDistance:R}));
  assert.throws(()=>query(s,{...axA,radius:2*R},axP,toward,{maxDistance:R}));
  assert.throws(()=>query(s,axA,axP,[1,0,0,0],{maxDistance:R}));
  assert.throws(()=>query({kind:'e3'},axA,axP,toward,{maxDistance:R}));
}
console.log(`H3 aperture truth: ${hits} observed hit agreements, ${misses} sampled misses, ${unknowns} unknowns (uncertaintyFrom:0); no counterexample found; sampled only, not proof`);
