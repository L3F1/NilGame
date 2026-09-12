import {interval as I,add,sub,mul,div,dot,norm,scale,plus,minus,normalize,enclose,square} from './float32-interval.js';

// Reference construction for ONE front-to-back E3 -> S3 aperture crossing.
// Does not choose a portal, apply collision policy or certify a GPU executable.
export function e3S3TransferBounds({position,direction,positionError,directionError,
  frame,frameError,curvatureRadius,maxDistance}){
  if(!Number.isFinite(frameError)||frameError<0||!Number.isFinite(curvatureRadius)||curvatureRadius<=0
    ||!Number.isFinite(maxDistance)||maxDistance<=0||!Array.isArray(position)||!Array.isArray(direction)
    ||position.length!==3||direction.length!==3||!frame)
    throw Error('Invalid E3/S3 transfer bound inputs');
  const fields=['center','right','up','normal','exitCenter','exitRight','exitUp','exitNormal'];
  for(const key of fields)if(!Array.isArray(frame[key])||frame[key].length!==(key.startsWith('exit')?4:3)
    ||!frame[key].every(Number.isFinite))throw Error('Invalid transfer frame');
  if(!Number.isFinite(frame.radius)||frame.radius<=0)throw Error('Invalid aperture radius');
  // Missing uncertainty is a caller error, not a zero-error default.
  try{
    const p=enclose(position,positionError),v=enclose(direction,directionError);
    const f=Object.fromEntries(fields.map(key=>[key,enclose(frame[key],frame[key].map(()=>frameError))]));
    const denominator=dot(v,f.normal);
    if(denominator[1]>=0)return {status:'unresolved',reason:'crossing-direction'};
    const t=div(scale([dot(minus(p,f.center),f.normal)],I(-1))[0],denominator);
    if(t[0]<=0||t[1]>=maxDistance)return {status:'unresolved',reason:'crossing-range'};
    const q=plus(p,scale(v,t)),radial=minus(q,f.center);
    if(norm(radial)[1]>=frame.radius)return {status:'unresolved',reason:'aperture-rim'};
    const mapped=plus(scale(f.exitRight,mul(I(-1),dot(radial,f.right))),scale(f.exitUp,dot(radial,f.up)));
    const r=I(curvatureRadius),angle=div(norm(mapped),r);
    if(angle[1]>.25)return {status:'unresolved',reason:'angular-envelope'};
    // Stable small-angle exp: no division by a radial norm that can contain0.
    // Alternating Taylor polynomials, with a remainder enclosure at |x|<=.25.
    const z=square(angle);
    const sinc=add(I(1),mul(z,add(I(-1/6),mul(z,add(I(1/120),mul(z,I(-1/5040)))))));
    const cosine=add(I(1),mul(z,add(I(-1/2),mul(z,add(I(1/24),mul(z,add(I(-1/720),mul(z,I(1/40320)))))))));
    const sincBand=add(sinc,I(-(.25**8)/362880,.25**8/362880));
    const cosBand=add(cosine,I(-(.25**10)/3628800,.25**10/3628800));
    const point=plus(scale(f.exitCenter,cosBand),scale(mapped,div(sincBand,r)));
    const vector=minus(plus(scale(f.exitRight,mul(I(-1),dot(v,f.right))),scale(f.exitUp,dot(v,f.up))),scale(f.exitNormal,dot(v,f.normal)));
    const transported=minus(vector,scale(plus(f.exitCenter,point),div(dot(vector,point),add(I(1),dot(f.exitCenter,point)))));
    return {status:'bounded',distance:t,position:point,direction:normalize(transported)};
  }catch(error){
    if(!/^interval-/.test(error.message))throw error;
    return {status:'unresolved',reason:error.message};
  }
}
