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
//
// PORTALS ARE DRAWN BY RE-AIMING THE RAY, not by pasting a texture. When a ray
// meets an aperture the camera is carried through the same isometry the walker
// is carried through -- uPortalMap is exactly the mat3 of `portal.mapVector`
// -- and tracing continues from the far side. So the picture and the physics
// agree by construction: you see the room you would arrive in, because the
// same map produced both. The bounce loop is what makes a portal seen THROUGH
// a portal work, and it is a loop rather than recursion because GLSL has none.
export const BALL_FIRST_PERSON_GLSL = `#version 300 es
precision highp float;
// Balls and planes as ARRAYS with a uniform count, not one branch each.
// CLAUDE.md's link-time rule: a branch inside a scene function is re-emitted
// everywhere that function is inlined, and that multiplication is what once
// took a link from five seconds to 212. One loop body, uMarkN-style bound, and
// an object costs nothing at all when the scene does not contain it.
#define MAX_BALLS 16
#define MAX_PLANES 4
#define MAX_PORTALS 8
#define MAX_MOD_BALLS 8
#define MAX_MOD_PLANES 4
// How many apertures one ray may pass through. Four is enough to see a portal
// through a portal through a portal, which is the case that looks wrong when a
// renderer cheats; beyond that the far side is smaller than a pixel anyway.
#define MAX_BOUNCES 4
uniform vec4 uBalls[MAX_BALLS];
uniform int uBallN;
uniform vec4 uPlanes[MAX_PLANES];
uniform int uPlaneN;
// MODIFIERS: solids that change another solid rather than adding to the
// scene. Both operations are a max against the modifying distance and differ
// only in SIGN --
//     -1  subtract   max(d, -m)   keep what is OUTSIDE m
//     +1  intersect  max(d, +m)   keep what is INSIDE m
// -- so one loop covers both. Each names the solid it applies to, or -1 for
// one that applies to everything. Balls and planes stay in separate arrays
// rather than one array with a kind flag, because a branch on kind inside the
// innermost loop is re-emitted at every inline site, and that is the exact
// shape of the 212-second link.
uniform vec4 uModBalls[MAX_MOD_BALLS];
uniform int uModBallOwner[MAX_MOD_BALLS];
uniform float uModBallSign[MAX_MOD_BALLS];
uniform int uModBallN;
uniform vec4 uModPlanes[MAX_MOD_PLANES];
uniform int uModPlaneOwner[MAX_MOD_PLANES];
uniform float uModPlaneSign[MAX_MOD_PLANES];
uniform int uModPlaneN;
uniform vec4 uPortals[MAX_PORTALS];       // aperture centre, radius
uniform vec4 uPortalNml[MAX_PORTALS];     // aperture normal, pointing OUT
uniform vec4 uPortalExit[MAX_PORTALS];    // where the far aperture sits
uniform mat3 uPortalMap[MAX_PORTALS];     // the isometry, translation removed
uniform int uPortalN;
// THE MARCH BOUND IS A UNIFORM, NOT A CONSTANT, and that is not a style
// choice. The D3D compiler unrolls every COUNTABLE loop, so a literal 160 here
// would paste the whole scene function 160 times and the link would not
// return. A uniform bound is opaque to it. Same rule, same reason, as the
// array uniforms above.
uniform int uMarchSteps;
uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uRight;
uniform vec3 uUp;
uniform float uExtent;
uniform int uSelected;      // index into uBalls, or -1
out vec4 fragColor;
${BALL_FIELD_GLSL}

// A solid's own distance, then every modifier that applies to it. The sign
// carries the operation: a point survives when it is inside what was added,
// outside everything subtracted, and inside everything intersected.
float modAdjust(float d, vec3 p, int owner){
  for(int j=0;j<MAX_MOD_BALLS;j++){
    if(j>=uModBallN)break;
    if(uModBallOwner[j]>=0 && uModBallOwner[j]!=owner)continue;
    d=max(d,uModBallSign[j]*(length(p-uModBalls[j].xyz)-uModBalls[j].w));
  }
  for(int j=0;j<MAX_MOD_PLANES;j++){
    if(j>=uModPlaneN)break;
    if(uModPlaneOwner[j]>=0 && uModPlaneOwner[j]!=owner)continue;
    d=max(d,uModPlaneSign[j]*(dot(p,uModPlanes[j].xyz)-uModPlanes[j].w));
  }
  return d;
}

// The whole field as one number, plus WHICH solid gave it. Owners are ball
// index i, or 100+i for plane i -- the shading needs to know whether it hit a
// ball or a floor, and after a carve the nearest surface is not necessarily
// the primitive a closed form would have found.
float sceneDistance(vec3 p, out int owner){
  float best=1e20; owner=-1;
  for(int i=0;i<MAX_BALLS;i++){
    if(i>=uBallN)break;
    float d=modAdjust(length(p-uBalls[i].xyz)-uBalls[i].w,p,i);
    if(d<best){best=d;owner=i;}
  }
  for(int i=0;i<MAX_PLANES;i++){
    if(i>=uPlaneN)break;
    float d=modAdjust(dot(p,uPlanes[i].xyz)-uPlanes[i].w,p,100+i);
    if(d<best){best=d;owner=100+i;}
  }
  return best;
}
float sceneDistance(vec3 p){ int o; return sceneDistance(p,o); }

vec3 sceneNormal(vec3 p){
  // Tetrahedral differences: four samples rather than six, and no reliance on
  // the field being an exact distance -- which it is not once anything is
  // carved.
  vec2 e=vec2(1.0,-1.0)*0.0015;
  return normalize(e.xyy*sceneDistance(p+e.xyy)+e.yyx*sceneDistance(p+e.yyx)
                  +e.yxy*sceneDistance(p+e.yxy)+e.xxx*sceneDistance(p+e.xxx));
}

void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 sky=mix(vec3(.025,.04,.07),vec3(.09,.13,.19),clamp(.5+.25*uv.y,0.0,1.0));
  vec3 eye=uEye,u=normalize(uFwd+uv.x*uRight+uv.y*uUp);
  vec3 color=sky;
  // The aperture RIM, accumulated across bounces. Without a drawn edge a
  // working portal in a symmetric room is invisible: the far side looks like
  // more room, and an author cannot tell a hole from an empty doorway.
  float rim=0.0;
  // Each transit dims what is beyond it a little, so depth through a chain of
  // apertures reads as depth rather than as one flat continuous room.
  float tint=1.0;
  float far=uExtent*4.0+40.0;

  for(int bounce=0;bounce<MAX_BOUNCES;bounce++){
    float tSurf=1e20; int owner=-1; vec3 nSurf=vec3(0.0,0.0,1.0);

    if(uModBallN+uModPlaneN==0){
      // NOTHING MODIFIES ANYTHING, so every primitive still solves in closed form and
      // the nearest one wins. This is the exact path and it stays exact --
      // the capability the field advertises says so, and the renderer must
      // not quietly stop matching it.
      for(int i=0;i<MAX_BALLS;i++){
        if(i>=uBallN)break;
        float t=ballRayHit(eye,u,uBalls[i]);
        if(t<tSurf&&t>0.0){tSurf=t;owner=i;}
      }
      for(int i=0;i<MAX_PLANES;i++){
        if(i>=uPlaneN)break;
        vec4 pl=uPlanes[i];
        float denom=dot(u,pl.xyz),height=dot(eye,pl.xyz)-pl.w;
        if(denom<-1e-6&&height>0.0){
          float t=-height/denom;
          if(t>0.0&&t<tSurf){tSurf=t;owner=100+i;}
        }
      }
      if(owner>=0&&owner<100)nSurf=normalize(eye+tSurf*u-uBalls[owner].xyz);
      else if(owner>=100)nSurf=uPlanes[owner-100].xyz;
    } else {
      // SOMETHING MODIFIES SOMETHING, so a closed form would happily return a
      // surface that has been cut away or clipped off. Sphere-trace the
      // expression instead: the distance is a lower bound, which is exactly
      // what tracing needs.
      float t=0.0; int o=-1; float d=0.0;
      for(int step=0;step<4096;step++){
        if(step>=uMarchSteps)break;
        d=sceneDistance(eye+t*u,o);
        if(d<2e-4){owner=o;tSurf=t;break;}
        t+=max(d,2e-4);
        if(t>far)break;
      }
      if(owner>=0)nSurf=sceneNormal(eye+tSurf*u);
    }

    // Apertures are analytic and independent of the field, so they are tested
    // the same way on both paths.
    float tPort=1e20; int hitPort=-1; float edge=0.0;
    for(int i=0;i<MAX_PORTALS;i++){
      if(i>=uPortalN)break;
      vec3 c=uPortals[i].xyz,n=uPortalNml[i].xyz; float rad=uPortals[i].w;
      float denom=dot(u,n),height=dot(eye-c,n);
      if(denom<-1e-6&&height>0.0){
        float t=-height/denom;
        if(t>0.0&&t<tPort){
          vec3 dv=eye+t*u-c;
          float rr=length(dv-dot(dv,n)*n);
          if(rr<=rad){tPort=t;hitPort=i;edge=rr/rad;}
        }
      }
    }

    if(hitPort>=0&&tPort<tSurf){
      vec3 p=eye+tPort*u;
      rim=max(rim,smoothstep(0.88,1.0,edge)*tint);
      // The SAME map the walker uses. mapPoint is the mat3 about the aperture
      // centre plus the far centre; mapVector is the mat3 alone. Applying the
      // point map to the direction is the silent error this split prevents.
      eye=uPortalExit[hitPort].xyz+uPortalMap[hitPort]*(p-uPortals[hitPort].xyz);
      u=normalize(uPortalMap[hitPort]*u);
      // Never resume exactly on the exit plane: the next sign test could read
      // either way and the ray would ping-pong without advancing.
      eye+=u*1e-3;
      tint*=0.86;
      continue;
    }

    if(owner>=100){
      vec4 pl=uPlanes[owner-100];
      vec3 p=eye+tSurf*u;
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
      float sharp=1.0/(1.0+tSurf*tSurf*0.03);
      vec3 floorColor=mix(vec3(.42,.50,.58),vec3(.13,.17,.23),mix(1.0,line,sharp));
      // A modified face on a plane is not flat, so shade it by its own normal
      // rather than letting the grid pretend it is the untouched floor.
      float lit=0.55+0.45*max(dot(nSurf,normalize(vec3(-.5,-1.0,1.0))),0.0);
      float fade=clamp(tSurf/max(uExtent,1e-6),0.0,1.0);
      color=mix(floorColor*lit,sky,fade*fade)*tint;
      break;
    }
    if(owner>=0){
      vec4 b=uBalls[owner];
      float light=.2+.65*max(dot(nSurf,normalize(vec3(-.5,-1.0,1.0))),0.0);
      vec3 base=vec3(.20,.72,.69);
      // The selected object reads as selected from inside the world, rather
      // than only in a list. Only in the FIRST view -- a highlight seen
      // through a portal would say "this is selected" about a reflection.
      if(owner==uSelected&&bounce==0){
        float ring=pow(1.0-max(dot(nSurf,-u),0.0),2.0);
        base=mix(vec3(.98,.72,.30),vec3(1.0,.94,.75),ring);
      }
      color=base*light*tint;
      break;
    }
    color=sky*tint;
    break;
  }
  color=mix(color,vec3(1.0,.76,.32),rim*0.9);
  fragColor=vec4(pow(color,vec3(1.0/2.2)),1.0);
}
`;
