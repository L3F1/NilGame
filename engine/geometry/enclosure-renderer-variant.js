// Explicit test-only shader specialization; default renderer source is unchanged.
import {SPHERICAL_MISS_PASS_FRAGMENT,SPHERICAL_MISS_CERTIFICATE_TAG} from './spherical-miss-pass-glsl.js';
import {ENCLOSURE_MEMBER_GLSL,ENCLOSURE_EXPORT_GLSL} from './refinement-enclosure-glsl.js';
export const ENCLOSURE_CERTIFICATE_TAG=25393;
function replaceOnce(source,from,to){
  if(!source.includes(from)||source.indexOf(from)!==source.lastIndexOf(from))throw Error('Enclosure shader contract changed: '+from.slice(0,70));
  return source.replace(from,to);
}
export function enclosureProducer(){
  let s=SPHERICAL_MISS_PASS_FRAGMENT;
  s=replaceOnce(s,'layout(location=2) out vec4 outDirection;','layout(location=2) out vec4 outDirection;\nlayout(location=3) out vec4 outRadii;');
  s=replaceOnce(s,'bool additiveBallOwner(int owner){',ENCLOSURE_MEMBER_GLSL+ENCLOSURE_EXPORT_GLSL+'\nbool additiveBallOwner(int owner){');
  s=replaceOnce(s,'outCertificate=uvec4(0u);outPoint=vec4(0);outDirection=vec4(0);','outCertificate=uvec4(0u);outPoint=vec4(0);outDirection=vec4(0);outRadii=vec4(0);');
  s=replaceOnce(s,'if(!firstTransferBands())return;',
    'if(!firstTransferBands())return;\n  float rp,ru;BI pb,ub;\n  if(!exportEnclosure(rayPointBand,newP,rp,pb)||!exportEnclosure(rayDirectionBand,newU,ru,ub))return;\n  BI angle=bd(ba(bs(uMaxDistance),bs(8.*E)),bs(dest.y));\n  if(!bfinite(angle)||angle.lo.x<0.||angle.hi.x>64.)return;');
  s=replaceOnce(s,'if(!sphericalMiss(-D(2*i),-m.z))continue;','if(!enclosureCurveExterior(pb,ub,-D(2*i),-m.z,angle.hi.x))continue;');
  s=replaceOnce(s,SPHERICAL_MISS_CERTIFICATE_TAG+'u+sampleId',ENCLOSURE_CERTIFICATE_TAG+'u+sampleId');
  return replaceOnce(s,'outPoint=newP;outDirection=newU;','outPoint=newP;outDirection=newU;outRadii=vec4(rp,ru,angle.hi.x,0.);');
}
export function enclosureConsumer(source){
  let s=replaceOnce(source,'uniform highp sampler2D uMissPoint,uMissDirection;',
    'uniform highp sampler2D uMissPoint,uMissDirection,uMissRadii;\n'+ENCLOSURE_MEMBER_GLSL);
  s=replaceOnce(s,'vec4 at(vec4 p,vec4 u,float t,vec4 r){return isH3(r)?h3At(p,u,t,r.y):r.x<.5?p+u*t:p*cs(t/r.y)+u*sn(t/r.y);}',
    'vec4 at(vec4 p,vec4 u,float t,vec4 r){if(isH3(r))return h3At(p,u,t,r.y);if(r.x<.5)return p+u*t;vec2 sc=sincos(t/r.y);return p*sc.y+u*sc.x;}');
  s=replaceOnce(s,SPHERICAL_MISS_CERTIFICATE_TAG+'u+certificateSample',ENCLOSURE_CERTIFICATE_TAG+'u+certificateSample');
  return replaceOnce(s,'&&texelFetch(uMissPoint,texel,0)==newP&&texelFetch(uMissDirection,texel,0)==newU',
    '&&enclosureMember(newP,texelFetch(uMissPoint,texel,0),texelFetch(uMissRadii,texel,0).x)\n        &&enclosureMember(newU,texelFetch(uMissDirection,texel,0),texelFetch(uMissRadii,texel,0).y)');
}
