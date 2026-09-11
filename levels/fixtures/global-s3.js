// A clear great-circle route, with off-route landmarks all around S3.
// Explicit runtime points, not a scene-v2 document or a single author chart.
export const GLOBAL_S3_RADIUS=8;
export const GLOBAL_S3_BALLS=Object.freeze(Array.from({length:8},(_,i)=>{
  const theta=i*Math.PI/4,offset=.14;
  return Object.freeze({id:`landmark-${i}`,label:`${i*45} degrees`,radius:.55,
    center:Object.freeze([Math.cos(offset)*Math.sin(theta),Math.sin(offset),0,Math.cos(offset)*Math.cos(theta)]),
    color:Object.freeze([[.95,.35,.22],[1,.7,.18],[.35,.8,.35],[.2,.85,.8],[.25,.5,1],[.7,.4,.95],[.95,.4,.75],[.8,.8,.85]][i])});
}));
