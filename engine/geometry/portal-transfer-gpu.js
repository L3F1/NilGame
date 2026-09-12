// Candidate E3 -> S3 transfer evaluation. Not yet enabled in connected trace.
// Matches the stable small-angle construction in portal-transfer-bounds.js.
// Callers must certify the selected crossing and provide interval propagation
// before using this evaluation to relax any existing renderer guard.
export const E3_S3_TRANSFER_GLSL=`
bool e3S3Transfer(vec3 p,vec3 u,vec3 c,vec3 right,vec3 up,vec3 normal,
  vec4 exitCenter,vec4 exitRight,vec4 exitUp,vec4 exitNormal,float R,
  out float t,out vec4 newP,out vec4 newU){
  float denominator=dot(u,normal);
  if(denominator>=0.||R<=0.)return false;
  t=-dot(p-c,normal)/denominator;
  vec3 radial=p+u*t-c;
  vec4 mapped=-dot(radial,right)*exitRight+dot(radial,up)*exitUp;
  float angle=length(mapped)/R;
  if(angle>.25||t<=0.)return false;
  float z=angle*angle;
  float sinc=1.+z*(-1./6.+z*(1./120.+z*(-1./5040.)));
  float cosine=1.+z*(-1./2.+z*(1./24.+z*(-1./720.+z*(1./40320.))));
  newP=exitCenter*cosine+mapped*(sinc/R);
  vec4 vector=-dot(u,right)*exitRight+dot(u,up)*exitUp-dot(u,normal)*exitNormal;
  float divisor=1.+dot(exitCenter,newP);
  if(divisor<=0.)return false;
  vec4 transported=vector-(exitCenter+newP)*(dot(vector,newP)/divisor);
  newU=normalize(transported);
  return true;
}
`;
