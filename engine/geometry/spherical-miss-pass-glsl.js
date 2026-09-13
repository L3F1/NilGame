import {PRIMARY_NORMALIZATION_GLSL} from './primary-normalization.js';
import {CONNECTED_FOCAL_SCALE} from './primary-ray-bounds.js';
import {E3_S3_TRANSFER_GLSL} from './portal-transfer-gpu.js';
// Interval exclusion helper, moved here from the app experiment so both the
// experiment and the live exclusion pass share ONE implementation. It is still
// compiled only into separate small programs; CONNECTED_FRAGMENT never contains
// this interval arithmetic and never gains a root, hit point or ordering change.
// Outward binary32 endpoints, with a minimum-normal pad to survive FTZ.
// A miss requires the entire amplitude interval below the positive constant.
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
// Written into the certificate's alpha channel. A consumer that reads anything
// else (an uncleared attachment, a foreign texture, a refused pixel) has no
// certificate at all, so a missing or invalid resource can never be mistaken
// for a proved miss.
export const SPHERICAL_MISS_CERTIFICATE_TAG=21393;
// Separate exclusion program. One draw per eligible live draw, at the SAME
// viewport, pose, packed world and range as the main draw; pixel centres only.
// Outputs, per pixel:
//   attachment 0 (RGBA32UI) x = nominated portal index + 1, 0 when refused
//                           y,z = excluded packed SURFACE index bitset (0..47)
//                           w = SPHERICAL_MISS_CERTIFICATE_TAG
//   attachment 1/2 (RGBA32F) the transferred point/direction the proof is about
// The consumer re-checks the portal index and requires its own transfer result
// to equal attachments 1/2 exactly, so the enclosure proved here is the
// enclosure of the ray the live tracer actually follows.
export const SPHERICAL_MISS_PASS_FRAGMENT=`#version 300 es
precision highp float;precision highp int;
uniform highp sampler2D uData;
uniform ivec4 uCounts;
uniform vec4 uPosition,uForward,uRight,uUp;
uniform vec2 uResolution;
uniform float uMaxDistance;
uniform int uRegion;
uniform int uEligibleOwners;
uniform int uSampleGrid;
${PRIMARY_NORMALIZATION_GLSL}
layout(location=0) out uvec4 outCertificate;
layout(location=1) out vec4 outPoint;
layout(location=2) out vec4 outDirection;
const float E=0.00003;
const float FOCAL_SCALE=${CONNECTED_FOCAL_SCALE.toPrecision(17)};
vec4 D(int i){return texelFetch(uData,ivec2(i,0),0);}
${E3_S3_TRANSFER_GLSL}
${SPHERICAL_MISS_GLSL}
// Eligible owners are ADDITIVE metric balls only: a primitive that any group
// subtracts or intersects changes that group's occupancy when omitted, so its
// miss certificate would not be a miss of the composed solid.
bool additiveBallOwner(int owner){
  return (uEligibleOwners&(1<<owner))!=0;
}
void main(){
  outCertificate=uvec4(0u);outPoint=vec4(0);outDirection=vec4(0);
  // Source must be the E3 chart the camera is in; S3 and H3 starts are refused.
  vec4 r=D(128+uRegion);if(r.x>.5)return;
  vec4 p=uPosition;
  vec2 samplePixel=gl_FragCoord.xy;uint sampleId=0u;
  if(uSampleGrid==2){vec2 tile=floor(gl_FragCoord.xy/uResolution);sampleId=uint(tile.x)+2u*uint(tile.y);samplePixel-=tile*uResolution;samplePixel+=tile*.5-.25;}
  vec2 uv=(2.*samplePixel-uResolution)/uResolution.y;
  vec4 u=euclideanPrimaryUnit(uForward*FOCAL_SCALE+uRight*uv.x+uUp*uv.y);
  if(length(p)>r.z+E)return;
  float b0=dot(p,u),c0=dot(p,p)-r.z*r.z;
  float end=min(uMaxDistance,-b0+sqrt(max(0.,b0*b0-c0)));
  // Nominate the nearest entered aperture with the live E3 rules. A wrong
  // nomination cannot certify anything: the consumer compares portal index and
  // transfer result, and the proof below depends only on boundGate.
  int gate=-1;
  for(int g=0;g<8;g++){if(g>=uCounts.w)break;int base=132+g*10;vec4 info=D(base);
    if(int(info.x)!=uRegion)continue;
    vec4 center=D(base+1),n=D(base+4);
    float a=dot(p-center,n),b=dot(u,n);
    if(abs(a)<E&&length(p-center)<info.z+E)return;
    if(b>=-E)continue;
    float t=-a/b;if(t>end+E)continue;
    vec4 q=p+u*t;float radial=length(q-center);
    if(abs(radial-info.z)<4.*E)return;
    if(radial>info.z)continue;
    if(abs(t-end)<E)return;
    end=t;gate=g;
  }
  if(gate<0)return;
  int base=132+gate*10;vec4 info=D(base),dest=D(128+int(info.y));
  // Destination must be an S3 chart (code 1); H3 carries a larger code.
  if(dest.x<.5||dest.x>1.5)return;
  vec4 newP,newU;
  if(!e3S3TransferSelected(p.xyz,u.xyz,D(base+1).xyz,D(base+2).xyz,D(base+3).xyz,D(base+4).xyz,
    D(base+5),D(base+6),D(base+7),D(base+8),dest.y,end,newP,newU))return;
  boundPixel=samplePixel;boundGate=gate;boundTried=false;boundOK=false;
  boundDistance=end;boundPoint=newP;boundDirection=newU;
  if(!firstTransferBands())return;
  int region=int(info.y);uint low=0u,high=0u;
  for(int i=0;i<48;i++){if(i>=uCounts.x)break;
    vec4 m=D(2*i+1);
    if(int(m.w)!=region||m.x>.5)continue;               // this region's S3 rows only
    if(!additiveBallOwner(int(m.y)))continue;
    // Packed S3 solid uses -centre and -cos(radius/R). Convert BOTH signs.
    if(!sphericalMiss(-D(2*i),-m.z))continue;
    if(i<32)low|=1u<<uint(i);else high|=1u<<uint(i-32);
  }
  outCertificate=uvec4(uint(gate+1),low,high,${SPHERICAL_MISS_CERTIFICATE_TAG}u+sampleId);
  outPoint=newP;outDirection=newU;
}`;
