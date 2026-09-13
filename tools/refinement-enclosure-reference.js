// Exact dyadic reference for the standalone enclosure experiment. Inputs must
// already be finite binary32 Numbers; callers must explicitly Math.fround any
// authored doubles. No operation below rounds a geometric product or sum.
const bits=new DataView(new ArrayBuffer(4));
const abs=x=>x<0n?-x:x;
export function exactFloatUnits(x){
  if(typeof x!=='number'||!Number.isFinite(x)||Math.fround(x)!==x)
    throw new TypeError('Expected a finite binary32 Number');
  bits.setFloat32(0,x,false);
  const word=bits.getUint32(0,false),exponent=(word>>>23)&255,fraction=word&0x7fffff;
  const magnitude=exponent===0?BigInt(fraction):BigInt(0x800000+fraction)<<BigInt(exponent-1);
  return word>>>31?-magnitude:magnitude; // Both signed zeros denote exact zero.
}
function vector(v){
  if(!(Array.isArray(v)||ArrayBuffer.isView(v))||v.length!==4)
    throw new TypeError('Expected a four-component binary32 vector');
  return Array.from(v,exactFloatUnits);
}
function radius(r){
  const value=exactFloatUnits(r);
  if(value<0n)throw new RangeError('Radius must be nonnegative');
  return value;
}
export function exactMember(value4,center4,r){
  const value=vector(value4),center=vector(center4),bound=radius(r);
  return value.every((component,i)=>abs(component-center[i])<=bound);
}
export function exactSphereBoxMiss(qp4,qu4,rp,ru,center4,c){
  const qp=vector(qp4),qu=vector(qu4),center=vector(center4);
  const pointRadius=radius(rp),directionRadius=radius(ru),constant=exactFloatUnits(c);
  if(constant<=0n)return false;
  const sumAbs=center.reduce((sum,x)=>sum+abs(x),0n);
  const support=(q,r)=>abs(center.reduce((sum,x,i)=>sum+x*q[i],0n))+r*sumAbs;
  // A and B are integer multiples of 2^-298. Their squares use 2^-596;
  // c is in units 2^-149, so its squared integer needs a 298-bit scale shift.
  const a=support(qp,pointRadius),b=support(qu,directionRadius);
  return a*a+b*b<(constant*constant<<298n);
}
