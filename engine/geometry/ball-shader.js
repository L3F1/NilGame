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
uniform vec4 uBall;
uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uExtent;
// vec4(normal, offset) of the authored plane, and 0/1 for whether there is
// one. The drawn floor IS the collidable floor: it comes from the same entity
// the field builds its half-space from, so the picture cannot disagree with
// what you walk on.
uniform vec4 uPlane;
uniform float uHasPlane;
out vec4 fragColor;
${BALL_FIELD_GLSL}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 u=normalize(uFwd+uv.x*uRight+uv.y*uUp);
  float tBall=ballRayHit(uEye,u,uBall);
  // The authored plane. Faded out at the region extent so the bound the
  // document declares is visible rather than implied -- the plane itself is
  // unbounded, and the fade must not be mistaken for an edge you can fall off.
  float tFloor=1e20;
  if(uHasPlane>0.5){
    float denom=dot(u,uPlane.xyz), height=dot(uEye,uPlane.xyz)-uPlane.w;
    if(denom<-1e-6&&height>0.0){
      float tf=-height/denom;
      if(tf>0.0) tFloor=tf;
    }
  }
  vec3 color=mix(vec3(.025,.04,.07),vec3(.09,.13,.19),clamp(.5+.25*uv.y,0.0,1.0));
  if(tFloor<tBall){
    vec3 p=uEye+tFloor*u;
    // A grid in the plane's OWN two directions, so it stays a grid whatever
    // the normal is -- a ceiling and a ramp are the same primitive here.
    vec3 a=abs(uPlane.xyz.x)<0.9?vec3(1,0,0):vec3(0,1,0);
    vec3 e1=normalize(cross(uPlane.xyz,a)),e2=cross(uPlane.xyz,e1);
    vec2 g=abs(fract(vec2(dot(p,e1),dot(p,e2)))-0.5);
    float line=smoothstep(0.0,0.03,min(g.x,g.y));
    // FADE THE GRID WITH DISTANCE. One cell falls far under a pixel out near
    // the horizon, and below a pixel the right answer is the average, not
    // whichever line the sample happened to land on -- otherwise the floor
    // aliases into moire rings. Same rule as the H^2 x R floor checker.
    float sharp=1.0/(1.0+tFloor*tFloor*0.03);
    vec3 floorColor=mix(vec3(.42,.50,.58),vec3(.13,.17,.23),mix(1.0,line,sharp));
    // Haze toward the sky over the region extent, so the authoring bound is
    // visible without pretending to be an edge you could fall off.
    float far=clamp(tFloor/max(uExtent,1e-6),0.0,1.0);
    color=mix(floorColor,color,far*far);
  } else if(tBall<1e10){
    vec3 p=uEye+tBall*u,n=normalize(p-uBall.xyz);
    float light=.2+.65*max(dot(n,normalize(vec3(-.5,-1.0,1.0))),0.0);
    color=vec3(.20,.72,.69)*light;
  }
  fragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}
`;
