// Nil's analytic columns and bounded beacon marcher do not need the H3 kit.
// Keep the native shader small and make exact-hit shading independent of the
// legacy full-scene marcher and its pixel-footprint stopping thresholds.
export function nilFragment(math,world) {
  return `#version 300 es
precision highp float;
#define GEOM (5)
uniform mat4 uPlayer;
uniform vec2 uRes;
uniform float uYaw,uPitch,uRoll,uZoom,uSteps,uFog,uAO,uSuper;
out vec4 fragColor;
${math}
${world}
vec3 traceNil(vec2 uv){
  vec3 f=vec3(cos(uYaw)*cos(uPitch),sin(uYaw)*cos(uPitch),sin(uPitch));
  vec3 r=vec3(sin(uYaw),-cos(uYaw),0.0),v=cross(r,f);
  vec3 u=normalize(f+1.2*(uv.x*(cos(uRoll)*r+sin(uRoll)*v)+uv.y*(cos(uRoll)*v-sin(uRoll)*r))/max(uZoom,.001));
  vec3 origin=uPlayer[3].xyz;
  vec2 hit=nilFirstColumn(origin,u,NIL_COLUMN_COUNT+int(min(uRes.x,0.0)));
  float limit=min(70.0,hit.x),t=.08;
  for(int i=0;i<int(uSteps);i++){
    if(t>=limit)break;
    vec4 q=vec4(nilMul(origin,nilFlow(u,t)),1.0);
    vec2 m=nilBeaconWorld(q);
    if(m.x<.001){hit=vec2(t,m.y);break;}
    t+=max(.001,m.x*.8);
  }
  vec3 sky=vec3(.035,.045,.075);
  if(hit.x>4096.0)return sky;
  vec4 p=vec4(nilMul(origin,nilFlow(u,hit.x)),1.0);
  vec3 n=vec3(0.0,0.0,1.0);
  float nearest=1e20;
  for(int i=0;i<NIL_COLUMN_COUNT;i++){
    vec2 delta=p.xy-NIL_COL[i].xy;
    float d=abs(length(delta)-NIL_COL[i].z);
    if(d<nearest){nearest=d;n=vec3(normalize(delta),0.0);}
  }
  if(hit.y<4.5){
    vec3 g=vec3(0.0);
    for(int i=0;i<3;i++){
      vec3 axis=vec3(0.0);axis[i]=1.0;
      g[i]=nilBeaconWorld(geoStep(p,vec4(axis,0.0),.001)).x-nilBeaconWorld(geoStep(p,vec4(axis,0.0),-.001)).x;
    }
    n=normalize(g);
  }
  vec3 color=hit.y<4.5?vec3(.15,.75,.85):hit.y<5.5?vec3(.34,.26,.20):hit.y<6.5?vec3(.335,.345,.375):vec3(.30,.27,.34);
  float head=max(0.0,-dot(n,nilFlowDir(u,hit.x)));
  float occ=1.0;
  if(uAO>.5){
    float sum=0.0;
    for(int i=1;i<=4;i++){float d=.055*float(i);sum+=pow(.62,float(i-1))*max(d-nilWorld(geoStep(p,vec4(n,0.0),d)).x,0.0);}
    occ=clamp(1.0-2.6*sum,0.0,1.0);
  }
  color*=.16*occ+(.62*max(n.z,0.0)+.30*head)*(.35+.65*occ);
  vec3 extinction=exp(-hit.x*uFog*vec3(1.0));
  return color*extinction+sky*(1.0-extinction);
}
void main(){
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 color=vec3(0.0);int count=uSuper>.5?4:1;
  for(int i=0;i<count;i++){
    vec2 offset=count==1?vec2(0.0):vec2(float(i%2)-.5,float(i/2)-.5)/uRes.y;
    color+=traceNil(uv+offset);
  }
  color/=float(count);
  if(any(isnan(color))||any(isinf(color)))color=vec3(.035,.045,.075);
  fragColor=vec4(pow(clamp(color,0.0,1.0),vec3(1.0/2.2)),1.0);
}`;
}
