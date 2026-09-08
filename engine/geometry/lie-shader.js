import { LAB_BOXES } from '../world/lie-labs.js';

// Incremental geodesic tracing: no exponential/log map is assumed available.
// RK4 is evaluated once per march step, with a bounded arclength step.
export function lieFragment(key) {
  const sol=key==='sol';
  return `#version 300 es
precision highp float;
#define GEOM (${sol?6:7})
uniform vec2 uRes;
uniform mat4 uPlayer;
uniform float uYaw,uPitch,uRoll,uZoom,uSteps;
uniform float uFog,uMaxT;
out vec4 fragColor;
void rhs(vec3 p,vec3 u,out vec3 dp,out vec3 du) {
  ${sol ? 'dp=vec3(exp(-p.z)*u.x,exp(p.z)*u.y,u.z); du=vec3(-u.x*u.z,u.y*u.z,u.x*u.x-u.y*u.y);'
    : 'dp=vec3(exp(p.y)*u.x,u.y,u.z-u.x); du=vec3(u.y*(u.x+u.z),-u.x*(u.x+u.z),0.0);'}
}
void advance(inout vec3 p,inout vec3 u,float h) {
  vec3 a,b,c,d,e,f,g,k;
  rhs(p,u,a,b); rhs(p+h*a*.5,u+h*b*.5,c,d);
  rhs(p+h*c*.5,u+h*d*.5,e,f); rhs(p+h*e,u+h*f,g,k);
  p+=h*(a+2.0*c+2.0*e+g)/6.0;
  u+=h*(b+2.0*d+2.0*f+k)/6.0;
}
float pd(vec3 p,int i,float c) {
  ${sol ? 'float a=i==0?exp(p.z)*(p.x-c):exp(-p.z)*(p.y-c); if(i==2)return p.z-c;'
    : 'if(i==1)return p.y-c; if(i==2)return (p.z-c)*0.70710678118; float a=exp(-p.y)*(p.x-c);'}
  return sign(a)*log(abs(a)+sqrt(a*a+1.0));
}
float scene(vec3 p) {
  float d=1e6;
  for(int i=0;i<3;i++) d=min(d,min(pd(p,i,-3.0),-pd(p,i,3.0)));
  ${LAB_BOXES.map(b=>`{float v=-1e6; ${[0,1,2].map(i=>`v=max(v,max(-pd(p,${i},${b[2*i].toFixed(6)}),pd(p,${i},${b[2*i+1].toFixed(6)})));`).join('')} d=min(d,v);}`).join('\n')}
  return d;
}
void main() {
  vec2 uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;
  vec3 f=vec3(cos(uYaw)*cos(uPitch),sin(uYaw)*cos(uPitch),sin(uPitch));
  vec3 r=vec3(sin(uYaw),-cos(uYaw),0.0), up=cross(r,f);
  vec3 u=normalize(f+(uv.x*(cos(uRoll)*r+sin(uRoll)*up)+uv.y*(cos(uRoll)*up-sin(uRoll)*r))/max(uZoom,.001));
  vec3 p=uPlayer[3].xyz;
  float t=0.0; bool hit=false;
  for(int i=0;i<600;i++) {
    if(float(i)>=uSteps*2.0)break;
    float d=scene(p);
    if(d<.002){hit=true;break;}
    float h=min(.04,d*.75);
    advance(p,u,h); t+=h;
    if(t>min(16.0,uMaxT))break;
  }
  vec3 col=vec3(.025,.035,.055);
  if(hit) {
    float grid=smoothstep(.04,.08,min(min(abs(fract(p.x*2.0)-.5),abs(fract(p.y*2.0)-.5)),abs(fract(p.z*2.0)-.5)));
    col=mix(vec3(.08,.15,.22),${sol?'vec3(.3,.65,.8)':'vec3(.65,.4,.8)'},grid);
    vec3 gradient=vec3(scene(p+vec3(.001,0,0))-scene(p-vec3(.001,0,0)),scene(p+vec3(0,.001,0))-scene(p-vec3(0,.001,0)),scene(p+vec3(0,0,.001))-scene(p-vec3(0,0,.001)));
    vec3 n=normalize(${sol?'vec3(exp(-p.z)*gradient.x,exp(p.z)*gradient.y,gradient.z)':'vec3(exp(p.y)*gradient.x-gradient.z,gradient.y,gradient.z)'});
    col*=.4+.6*abs(dot(n,normalize(vec3(.3,.5,.8))));
    col=mix(col,vec3(.025,.035,.055),1.0-exp(-uFog*t));
  }
  fragColor=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;
}
