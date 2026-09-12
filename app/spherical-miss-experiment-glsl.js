// EXPERIMENT ONLY: interval exclusion in a small separate GPU program.
// Not imported by the production connected shader.
// Outward binary32 endpoints, with a minimum-normal pad to survive FTZ.
// A miss requires the entire amplitude interval below the positive constant.
// No roots, hit points or event ordering are changed by this path.
export const SPHERICAL_MISS_GLSL=`
struct BI { vec4 lo; vec4 hi; };
float bdown(float x){if(abs(x)<1.17549436e-38)return -1.17549436e-38;uint b=floatBitsToUint(x);return uintBitsToFloat(x>0.?b-1u:b+1u);}
float bup(float x){if(abs(x)<1.17549436e-38)return 1.17549436e-38;uint b=floatBitsToUint(x);return uintBitsToFloat(x>0.?b+1u:b-1u);}
BI bw(vec4 lo,vec4 hi){return BI(vec4(bdown(lo.x),bdown(lo.y),bdown(lo.z),bdown(lo.w)),vec4(bup(hi.x),bup(hi.y),bup(hi.z),bup(hi.w)));}
BI bv(vec4 v){return bw(v,v);}
BI bs(float x){return bv(vec4(x));}
BI ba(BI a,BI b){return bw(a.lo+b.lo,a.hi+b.hi);}
BI bn(BI a){return BI(-a.hi,-a.lo);}
BI bm(BI a,BI b){return bw(min(min(a.lo*b.lo,a.lo*b.hi),min(a.hi*b.lo,a.hi*b.hi)),max(max(a.lo*b.lo,a.lo*b.hi),max(a.hi*b.lo,a.hi*b.hi)));}
BI bd(BI a,BI b){return bm(a,bw(1./b.hi,1./b.lo));}
BI bdot(BI a,BI b){BI p=bm(a,b);return ba(ba(ba(BI(p.lo.xxxx,p.hi.xxxx),BI(p.lo.yyyy,p.hi.yyyy)),BI(p.lo.zzzz,p.hi.zzzz)),BI(p.lo.wwww,p.hi.wwww));}
BI broot(BI a){return bw(sqrt(max(vec4(0),a.lo)),sqrt(max(vec4(0),a.hi)));}
BI bnorm(BI a){return broot(bdot(a,a));}
bool bfinite(BI a){return !any(isnan(a.lo))&&!any(isnan(a.hi))&&!any(isinf(a.lo))&&!any(isinf(a.hi))&&all(lessThanEqual(a.lo,a.hi));}
bool bcontains(BI a,vec4 v){return bfinite(a)&&all(lessThanEqual(a.lo,v))&&all(greaterThanEqual(a.hi,v));}
vec2 boundPixel;
int boundGate=-1;bool boundTried=false,boundOK=false;
vec4 boundPoint,boundDirection;float boundDistance;
BI rayPointBand,rayDirectionBand;

bool firstTransferBands(){
  if(boundTried)return boundOK;boundTried=true;
  if(boundGate<0)return false;
  // Packed uniforms are enclosed by neighbouring binary32 values, including
  // their CPU ideals. Pixel centres/subsamples and integer viewport are exact.
  BI ux=bd(ba(bm(bs(2.),bs(boundPixel.x)),bn(bs(uResolution.x))),bs(uResolution.y));
  BI uy=bd(ba(bm(bs(2.),bs(boundPixel.y)),bn(bs(uResolution.y))),bs(uResolution.y));
  BI raw=ba(ba(bm(bv(uForward),bs(FOCAL_SCALE)),bm(bv(uRight),ux)),bm(bv(uUp),uy));
  BI len=bnorm(raw);if(len.lo.x<=0.)return false;
  BI v=bd(raw,len),p=bv(uPosition);
  int base=132+boundGate*10;vec4 info=D(base),dest=D(128+int(info.y));
  BI center=bv(D(base+1)),right=bv(D(base+2)),up=bv(D(base+3)),normal=bv(D(base+4));
  BI ec=bv(D(base+5)),er=bv(D(base+6)),eu=bv(D(base+7)),en=bv(D(base+8));
  BI den=bdot(v,normal);if(den.hi.x>=0.)return false;
  BI t=bd(bn(bdot(ba(p,bn(center)),normal)),den);
  if(t.lo.x<=0.||t.hi.x>=uMaxDistance||!bcontains(t,vec4(boundDistance)))return false;
  BI radial=ba(ba(p,bm(v,t)),bn(center));
  if(bnorm(radial).hi.x>=bdown(info.z))return false;
  BI mapped=ba(bm(er,bn(bdot(radial,right))),bm(eu,bdot(radial,up)));
  BI R=bs(dest.y);if(R.lo.x<=0.)return false;
  BI angle=bd(bnorm(mapped),R);if(angle.hi.x>.25)return false;
  BI z=bm(angle,angle);
  BI sinc=ba(bs(1.),bm(z,ba(bs(-1./6.),bm(z,ba(bs(1./120.),bm(z,bs(-1./5040.)))))));
  BI cosine=ba(bs(1.),bm(z,ba(bs(-1./2.),bm(z,ba(bs(1./24.),bm(z,ba(bs(-1./720.),bm(z,bs(1./40320.)))))))));
  sinc=ba(sinc,bw(vec4(-4.205e-11),vec4(4.205e-11)));
  cosine=ba(cosine,bw(vec4(-2.629e-13),vec4(2.629e-13)));
  BI point=ba(bm(ec,cosine),bm(mapped,bd(sinc,R)));
  BI vector=ba(ba(bm(er,bn(bdot(v,right))),bm(eu,bdot(v,up))),bn(bm(en,bdot(v,normal))));
  BI divisor=ba(bs(1.),bdot(ec,point));if(divisor.lo.x<=0.)return false;
  BI carried=ba(vector,bn(bm(ba(ec,point),bd(bdot(vector,point),divisor))));
  BI speed=bnorm(carried);if(speed.lo.x<=0.)return false;
  BI directionBand=bd(carried,speed);
  if(!bcontains(point,boundPoint)||!bcontains(directionBand,boundDirection))return false;
  rayPointBand=point;rayDirectionBand=directionBand;boundOK=true;return true;
}
bool sphericalMiss(vec4 center,float c){
  if(!boundOK)return false;
  BI a=bdot(rayPointBand,bv(center)),b=bdot(rayDirectionBand,bv(center));
  BI amplitude=broot(ba(bm(a,a),bm(b,b))),constant=bs(c);
  return bfinite(amplitude)&&constant.lo.x>0.&&amplitude.hi.x<constant.lo.x;
}
`;
