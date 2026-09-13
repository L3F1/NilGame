// Experimental only: not included in the live connected renderer.
// Domain restriction makes binary32 subtraction normal (or exactly zero):
// adjacent permitted values differ by at least 2^-123. Extreme/subnormal inputs
// refuse this certificate, not rendering. See REFINEMENT_ENCLOSURE_NEXT.md.
export const ENCLOSURE_MEMBER_GLSL=`
const float ENC_MIN=7.888609052210118e-31; // 2^-100
const float ENC_MAX=1.2676506002282294e30; // 2^100
bool enclosureValue(vec4 v){
  // Classify bits: a floating comparison can flush a subnormal to zero.
  uvec4 magnitude=floatBitsToUint(v)&uvec4(0x7fffffffu);
  for(int k=0;k<4;k++)if(magnitude[k]!=0u
    &&(magnitude[k]<0x0d800000u||magnitude[k]>0x71800000u))return false;
  return true;
}
float enclosureDifference(float a,float b){
  if(a==b)return 0.;
  // Inputs have passed enclosureValue. One outward neighbour bounds a
  // round-to-nearest binary32 subtraction; no FMA is involved.
  float d=abs(a-b);
  return uintBitsToFloat(floatBitsToUint(d)+1u);
}
bool enclosureMember(vec4 value,vec4 center,float radius){
  if(!enclosureValue(value)||!enclosureValue(center)
    ||!enclosureValue(vec4(radius))||radius<0.)return false;
  vec4 d=vec4(enclosureDifference(value.x,center.x),enclosureDifference(value.y,center.y),
    enclosureDifference(value.z,center.z),enclosureDifference(value.w,center.w));
  return all(lessThanEqual(d,vec4(radius)));
}
`;

// Include FLOAT_BANDS_GLSL and ENCLOSURE_MEMBER_GLSL first. Radius and centre
// are binary32 values; the proof must be recomputed over the returned box.
export const ENCLOSURE_EXPORT_GLSL=`
bool exportEnclosure(BI original,vec4 center,out float radius,out BI box){
  radius=0.;box=original;
  if(!bfinite(original)||!enclosureValue(center)||!enclosureValue(original.lo)
    ||!enclosureValue(original.hi)||!bcontains(original,center))return false;
  for(int k=0;k<4;k++)radius=max(radius,max(enclosureDifference(center[k],original.lo[k]),
    enclosureDifference(original.hi[k],center[k])));
  if(!enclosureValue(vec4(radius)))return false;
  box=bw(center-vec4(radius),center+vec4(radius));
  return bfinite(box);
}
bool enclosureSphereMiss(BI pointBox,BI directionBox,vec4 center,float constant){
  if(any(isnan(center))||any(isinf(center))||isnan(constant)||isinf(constant))return false;
  BI a=bdot(pointBox,bv(center)),b=bdot(directionBox,bv(center));
  // Check before sqrt's max(0,...) can mask a nonfinite intermediate.
  if(!bfinite(a)||!bfinite(b))return false;
  BI aa=bm(a,a),bb=bm(b,b);if(!bfinite(aa)||!bfinite(bb))return false;
  BI sum=ba(aa,bb);if(!bfinite(sum))return false;
  BI amplitude=broot(sum),c=bs(constant);
  return bfinite(amplitude)&&c.lo.x>0.&&amplitude.hi.x<c.lo.x;
}
`;
