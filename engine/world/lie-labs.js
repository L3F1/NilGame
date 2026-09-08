// Bounded navigation laboratories. Shared authored boxes feed collision and GLSL.
import * as Sol from '../geometry/sol.js';
import * as SL from '../geometry/sl2r.js';
import { integrate } from '../geometry/numerical-flow.js';

export const LAB_BOXES = Object.freeze([
  [-.7,.7,-.7,.7,-.7,.7],
  [1.6,2.0,-2,1,-1.5,1.5],
  [-2,-1.6,-1,2,-1.5,1.5],
]);
export function model(key) { return key === 'sol' ? Sol : key === 'sl2r' ? SL : (()=>{throw new Error('Unknown laboratory');})(); }
export function placement(p) { return [1,0,0,0,0,1,0,0,0,0,1,0,...p,1]; }
export function field(key,p) {
  const plane=model(key).planeDistance;
  let d=Infinity;
  // Outer coordinate chamber, +/-3 on each axis.
  for(let i=0;i<3;i++) d=Math.min(d,plane(p,i,-3),-plane(p,i,3));
  for(const b of LAB_BOXES) {
    let box=-Infinity;
    for(let i=0;i<3;i++) box=Math.max(box,-plane(p,i,b[2*i]),plane(p,i,b[2*i+1]));
    d=Math.min(d,box);
  }
  return d;
}
export function coordinateVector(key,p,v) {
  return key==='sol' ? [Math.exp(-p[2])*v[0],Math.exp(p[2])*v[1],v[2]]
    : [Math.exp(p[1])*v[0],v[1],v[2]-v[0]];
}

// Differentiate in the orthonormal frame, not raw coordinate axes. In SL2R
// the first frame direction also changes theta; omitting that steers contact
// impulses in the wrong direction.
export function contactNormal(key,p) {
  const epsilon=1e-5;
  const gradient=[0,1,2].map(axis=>{
    const basis=[0,0,0]; basis[axis]=1;
    const d=coordinateVector(key,p,basis);
    return (field(key,p.map((x,i)=>x+epsilon*d[i]))
      -field(key,p.map((x,i)=>x-epsilon*d[i])))/(2*epsilon);
  });
  const length=Math.hypot(...gradient);
  return length>1e-8 ? gradient.map(x=>x/length) : null;
}

function slideStep(key,rhs,p,v,h) {
  let trial=integrate(rhs,p,v,h);
  if(field(key,trial[0])>=.07) return trial;
  // Retry from the same position/frame so a rejected trial cannot rotate the
  // retained velocity. A small separating speed leaves room for the curved
  // tangent path; this is contact stabilization, not a bounce.
  const normal=contactNormal(key,p);
  if(!normal) return [p,[0,0,0]];
  const inward=v.reduce((sum,x,i)=>sum+x*normal[i],0);
  const tangent=v.map((x,i)=>x-Math.min(0,inward)*normal[i]);
  for(const separation of [.02,.05,.1]) {
    trial=integrate(rhs,p,tangent.map((x,i)=>x+separation*normal[i]),h);
    if(field(key,trial[0])>=.07) return trial;
  }
  // Intersecting contacts may leave no valid tangent step. Stay outside;
  // never push through a second wall to satisfy the first constraint.
  return [p,[0,0,0]];
}
export function labMotion(key) {
  const rhs=model(key).derivative;
  return {
    input:'flight', course:null, point:M=>M.slice(12,16),
    spawn:()=>({M:placement([-1.2,-1.2,0]),vel:[0,0,0],yaw:.7,pitch:0}),
    step(M,vel,want,jump,dt) {
      let p=M.slice(12,15), v=vel.slice();
      // Bound collision travel as well as integration error when a frame stalls.
      const count=Math.max(1,Math.ceil(dt/.01)), h=dt/count;
      for(let j=0;j<count;j++) {
        const blend=1-Math.exp(-5*h);
        v=v.map((x,i)=>x+blend*(want[i]*1.2-x));
        [p,v]=slideStep(key,rhs,p,v,h);
      }
      return [placement(p),v];
    },
  };
}
