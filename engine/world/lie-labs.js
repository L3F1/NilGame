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
        const old=p;
        [p,v]=integrate(rhs,p,v,h);
        // Conservative stop prevents crossing a thin wall. Sliding can be added
        // once normal transport is shared by the editor's collision queries.
        if(field(key,p)<.07) {p=old;v=[0,0,0];}
      }
      return [placement(p),v];
    },
  };
}
