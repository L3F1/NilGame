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
bool enclosureEndpoint(vec4 v){
  uvec4 m=floatBitsToUint(v)&uvec4(0x7fffffffu);
  // Tiny NORMAL bounds can be widened. Subnormals still refuse: floating
  // ordering/containment on those values may flush them to zero.
  for(int k=0;k<4;k++)if(m[k]!=0u&&(m[k]<0x00800000u||m[k]>0x71800000u))return false;
  return true;
}
bool exportEnclosure(BI original,vec4 center,out float radius,out BI box){
  radius=0.;box=original;
  if(!enclosureValue(center)||!enclosureEndpoint(original.lo)||!enclosureEndpoint(original.hi)
    ||!bfinite(original)||!bcontains(original,center))return false;
  // Validate ORIGINAL order/containment first. Widen only endpoints, never the
  // nominal state. The exported symmetric box must still be reproved below.
  uvec4 lo=floatBitsToUint(original.lo)&uvec4(0x7fffffffu);
  uvec4 hi=floatBitsToUint(original.hi)&uvec4(0x7fffffffu);
  for(int k=0;k<4;k++){
    if(lo[k]!=0u&&lo[k]<0x0d800000u)original.lo[k]=-ENC_MIN;
    if(hi[k]!=0u&&hi[k]<0x0d800000u)original.hi[k]=ENC_MIN;
  }
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
