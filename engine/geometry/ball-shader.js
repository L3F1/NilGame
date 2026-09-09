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

// A MOVABLE camera, for the edit/play loop. Kept separate from
// BALL_PREVIEW_GLSL on purpose: that one is the fixed-viewpoint artifact the
// Godot export and the parity fixtures depend on, and giving it a camera would
// change what those compare. Same field, so the thing you walk into is still
// the thing the preview draws.
//
// The floor is a rendering AID, not scene content: it is drawn here so that
// moving through the region reads as movement, and it is deliberately absent
// from the collision field, because the document has no floor entity. Nothing
// stands on it, and it must not grow into one by accident.
export const BALL_FIRST_PERSON_GLSL = `#version 300 es
precision highp float;
uniform vec4 uBall;
uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uExtent;
out vec4 fragColor;
${BALL_FIELD_GLSL}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 u=normalize(uFwd+uv.x*uRight+uv.y*uUp);
  float tBall=ballRayHit(uEye,u,uBall);
  // The authoring floor: a plane at z = 0, faded out at the region extent so
  // the bound the document declares is visible rather than implied.
  float tFloor=1e20;
  if(u.z<-1e-4){
    float tf=-uEye.z/u.z;
    if(tf>0.0&&length((uEye+tf*u).xy)<uExtent) tFloor=tf;
  }
  vec3 color=mix(vec3(.025,.04,.07),vec3(.09,.13,.19),clamp(.5+.25*uv.y,0.0,1.0));
  if(tFloor<tBall){
    vec3 p=uEye+tFloor*u;
    float rr=length(p.xy);
    vec2 g=abs(fract(p.xy)-0.5);
    float grid=smoothstep(0.0,0.03,min(g.x,g.y));
    color=mix(mix(vec3(.16,.20,.26),vec3(.06,.08,.11),grid),color,clamp(rr/uExtent,0.0,1.0));
  } else if(tBall<1e10){
    vec3 p=uEye+tBall*u,n=normalize(p-uBall.xyz);
    float light=.2+.65*max(dot(n,normalize(vec3(-.5,-1.0,1.0))),0.0);
    color=vec3(.20,.72,.69)*light;
  }
  fragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}
`;
