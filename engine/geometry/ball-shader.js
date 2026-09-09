// Shared E3 field/intersection and preview shader, used by WebGL and emitted
// for Godot. Position/radius are uniforms: editing never rebuilds this program.
export const BALL_FIELD_GLSL = `
float ballDistance(vec3 p, vec4 ball) { return length(p-ball.xyz)-ball.w; }
float ballRayHit(vec3 p, vec3 u, vec4 ball) {
  vec3 v=p-ball.xyz; float c=dot(v,v)-ball.w*ball.w;
  if(c<=0.0)return 0.0;
  float b=dot(v,u),d=b*b-c;
  if(b>=0.0||d<0.0)return 1e20;
  return c/(-b+sqrt(d));
}
`;
export const BALL_PREVIEW_GLSL = `#version 300 es
precision highp float;
uniform vec4 uBall;
uniform vec2 uRes;
out vec4 fragColor;
${BALL_FIELD_GLSL}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 eye=vec3(0.0,-3.0,1.5),f=normalize(-eye);
  vec3 r=normalize(cross(f,vec3(0.0,0.0,1.0))),up=cross(r,f);
  vec3 u=normalize(f+uv.x*r+uv.y*up);
  float t=ballRayHit(eye,u,uBall);
  vec3 color=mix(vec3(.025,.04,.07),vec3(.09,.13,.19),clamp(.5+.25*uv.y,0.0,1.0));
  if(t<1e10){
    vec3 p=eye+t*u,n=normalize(p-uBall.xyz);
    float light=.2+.65*max(dot(n,normalize(vec3(-.5,-1.0,1.0))),0.0);
    color=vec3(.20,.72,.69)*light;
  }
  fragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}
`;
