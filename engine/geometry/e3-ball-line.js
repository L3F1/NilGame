// Closest-approach form for p + t*u, without assuming float32 normalize
// produces an exactly unit direction. Returns (centre parameter, height^2,a).
// Callers own range/uncertainty policy; a<=0 is a degenerate line, not a miss.
export const E3_BALL_LINE_GLSL=`
vec3 e3BallLine(vec3 v,vec3 u,float radius){
  float a=dot(u,u);
  if(!(a>0.))return vec3(0.,0.,0.);
  float centre=-dot(v,u)/a;
  vec3 foot=v+centre*u;
  return vec3(centre,radius*radius-dot(foot,foot),a);
}
`;
