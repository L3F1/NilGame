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
// The plane it draws is an AUTHORED ENTITY, taken from the same document the
// collision field is built from, so what you see and what you stand on are the
// same half-space. A scene with no plane draws none.
export const BALL_FIRST_PERSON_GLSL = `#version 300 es
precision highp float;
// Balls and planes as ARRAYS with a uniform count, not one branch each.
// CLAUDE.md's link-time rule: a branch inside a scene function is re-emitted
// everywhere that function is inlined, and that multiplication is what once
// took a link from five seconds to 212. One loop body, uMarkN-style bound, and
// an object costs nothing at all when the scene does not contain it.
#define MAX_BALLS 16
#define MAX_PLANES 4
uniform vec4 uBalls[MAX_BALLS];
uniform int uBallN;
uniform vec4 uPlanes[MAX_PLANES];
uniform int uPlaneN;
uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uExtent;
uniform int uSelected;      // index into uBalls, or -1
out vec4 fragColor;
${BALL_FIELD_GLSL}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 u=normalize(uFwd+uv.x*uRight+uv.y*uUp);

  // Nearest ball along the ray.
  float tBall=1e20; int hitBall=-1;
  for(int i=0;i<MAX_BALLS;i++){
    if(i>=uBallN)break;
    float t=ballRayHit(uEye,u,uBalls[i]);
    if(t<tBall&&t>0.0){tBall=t;hitBall=i;}
  }
  // Nearest plane along the ray. A plane is { p : dot(p,n) = w }, solid on the
  // side the normal points away from, so a ray only meets it coming from the
  // free side and heading in.
  float tPlane=1e20; int hitPlane=-1;
  for(int i=0;i<MAX_PLANES;i++){
    if(i>=uPlaneN)break;
    vec4 pl=uPlanes[i];
    float denom=dot(u,pl.xyz), height=dot(uEye,pl.xyz)-pl.w;
    if(denom<-1e-6&&height>0.0){
      float t=-height/denom;
      if(t>0.0&&t<tPlane){tPlane=t;hitPlane=i;}
    }
  }

  vec3 color=mix(vec3(.025,.04,.07),vec3(.09,.13,.19),clamp(.5+.25*uv.y,0.0,1.0));
  if(hitPlane>=0&&tPlane<tBall){
    vec4 pl=uPlanes[hitPlane];
    vec3 p=uEye+tPlane*u;
    // A grid in the plane's OWN two directions, so it stays a grid whatever
    // the normal is -- a ceiling and a ramp are the same primitive here.
    vec3 a=abs(pl.x)<0.9?vec3(1,0,0):vec3(0,1,0);
    vec3 e1=normalize(cross(pl.xyz,a)),e2=cross(pl.xyz,e1);
    vec2 g=abs(fract(vec2(dot(p,e1),dot(p,e2)))-0.5);
    float line=smoothstep(0.0,0.03,min(g.x,g.y));
    // FADE THE GRID WITH DISTANCE. One cell falls far under a pixel out near
    // the horizon, and below a pixel the right answer is the average, not
    // whichever line the sample happened to land on -- otherwise the floor
    // aliases into moire rings. Same rule as the H^2 x R floor checker.
    float sharp=1.0/(1.0+tPlane*tPlane*0.03);
    vec3 floorColor=mix(vec3(.42,.50,.58),vec3(.13,.17,.23),mix(1.0,line,sharp));
    float far=clamp(tPlane/max(uExtent,1e-6),0.0,1.0);
    color=mix(floorColor,color,far*far);
  } else if(hitBall>=0&&tBall<1e10){
    vec4 b=uBalls[hitBall];
    vec3 p=uEye+tBall*u,n=normalize(p-b.xyz);
    float light=.2+.65*max(dot(n,normalize(vec3(-.5,-1.0,1.0))),0.0);
    vec3 base=vec3(.20,.72,.69);
    // The selected object reads as selected from inside the world, rather than
    // only in a list: a warmer body and a rim, so it is findable while playing.
    if(hitBall==uSelected){
      float rim=pow(1.0-max(dot(n,-u),0.0),2.0);
      base=mix(vec3(.98,.72,.30),vec3(1.0,.94,.75),rim);
    }
    color=base*light;
  }
  fragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}
`;
