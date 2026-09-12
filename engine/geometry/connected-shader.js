import {CONNECTED_FOCAL_SCALE} from './primary-ray-bounds.js';
import {E3_S3_TRANSFER_GLSL} from './portal-transfer-gpu.js';
// Bounded float32 GPU reference for E3/S3. Surface candidates are analytic;
// uncertain roots, intervals, portal rims and chart exits stay unresolved.
import {CONNECTED_MATERIAL_GLSL} from './connected-material.js';
import {H3_GEOMETRY_GLSL,H3_REGION_CODE,H3_SURFACE_TYPE,h3BallSurfaceRow,
  validateH3GpuRegion,validateH3GpuPortal} from './hyperbolic-gpu.js';
export const CONNECTED_LIMITS = Object.freeze({ surfaces:48, primitives:16, groups:16, regions:4, portals:8 });
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const v4=a=>[...a,...Array(4-a.length).fill(0)];
// experimentalH3 is an explicit opt-in. The default call refuses H3 worlds at
// renderData, before any envelope check or live GL state, exactly as before.
export function packConnectedWorld(world,{experimentalH3=false}={}) {
  const data=world.renderData(experimentalH3?{experimentalH3:true}:{}), ids=data.regions.map(r=>r.id);
  if(data.regions.length>4||data.primitives.length>16||data.portals.length>8) throw Error('Connected GPU capacity exceeded');
  for(const r of data.regions){
    if(r.kind==='h3'){
      if(!experimentalH3)throw Error('Connected GPU requires explicit experimental H3 opt-in');
      validateH3GpuRegion(r);
    }else if(r.coverage==='s3-cover'){
      if(r.kind!=='s3'||r.curvatureRadius!==8)throw Error('Global connected GPU currently requires S3 radius 8');
    }else if(!['e3','s3'].includes(r.kind)||r.kind==='s3'&&r.extent>=Math.PI*r.curvatureRadius/2)
      throw Error('Connected GPU requires E3 or an open-hemisphere S3 chart');
  }
  for(const p of data.portals)
    if([p.fromRegionId,p.toRegionId].some(id=>data.regions[ids.indexOf(id)].kind==='h3'))
      validateH3GpuPortal(p);
  const rows=Array.from({length:224},()=>[0,0,0,0]), surfaces=[], primitives=[];
  for(const p of data.primitives) {
    const region=ids.indexOf(p.regionId), r=data.regions[region], owner=primitives.length, start=surfaces.length;
    if(r.coverage==='s3-cover'&&(p.kind!=='ball'||p.op!=='add'||p.radius/r.curvatureRadius<.05||p.radius/r.curvatureRadius>.1))
      throw Error('Global connected GPU supports additive balls with angular radius .05-.1');
    const add=(n,c,type=0)=>surfaces.push({n:v4(n),meta:[type,owner,c,region]});
    if(r.kind==='h3') { const row=h3BallSurfaceRow(p);add(row.n,row.coefficient,row.type); }
    else if(p.kind==='ball') {
      if(r.kind==='e3') add(p.center,p.radius,1);
      else add(p.center.map(x=>-x),-Math.cos(p.radius/r.curvatureRadius));
    } else if(r.kind==='s3') for(const n of p.planes) add(n,0);
    else if(p.kind==='plane') { const n=p.planes[0]; add(n.slice(0,3),-n[3]); }
    else if(p.kind==='box') for(let a=0;a<3;a++) for(const sign of [-1,1]) {
      const n=p.axes[a].map(x=>x*sign);add(n,dot(n,p.center)+p.halfExtent[a]);
    } else throw Error(`Unsupported connected primitive ${p.kind}`);
    primitives.push([start,surfaces.length-start,region,p.kind==='ball'?1:0]);
  }
  if(surfaces.length>48) throw Error('Connected GPU surface capacity exceeded');
  surfaces.forEach((s,i)=>{rows[i*2]=s.n;rows[i*2+1]=s.meta;});
  primitives.forEach((p,i)=>rows[96+i]=p);
  let groups=0;
  // An H3 field exposes no Boolean groups: each admitted ball is its own
  // additive group, with no subtraction or intersection mask.
  const regionGroups=(id,r)=>r.space?.kind==='h3'
    ?data.primitives.filter(p=>p.regionId===id).map(p=>({base:{entity:{id:p.id}},modifiers:[]}))
    :typeof r.field.groups==='function'
      ?r.field.groups().map(g=>({base:{entity:g.entity},modifiers:g.modifiers.map(entity=>({entity}))}))
      :r.field.groups??r.balls.map(b=>({base:{entity:b},modifiers:[]}));
  for(const [id,r] of world.regions) for(const g of regionGroups(id,r)) {
    const index=p=>data.primitives.findIndex(q=>q.id===p.entity.id);
    let sub=0,intersect=0;
    for(const m of g.modifiers) {const bit=1<<index(m);if(m.entity.op==='subtract')sub|=bit;else intersect|=bit;}
    if(groups>=16)throw Error('Connected GPU group capacity exceeded');
    rows[112+groups++]=[index(g.base),sub,intersect,ids.indexOf(id)];
  }
  data.regions.forEach((r,i)=>rows[128+i]=[r.kind==='h3'?H3_REGION_CODE:r.kind==='s3'?1:0,
    r.curvatureRadius,r.extent??0,r.coverage==='s3-cover'?1:0]);
  data.portals.forEach((p,i)=>{
    const reverse=world.portals.findIndex(q=>q.fromId===world.portals[i].toId&&q.toId===world.portals[i].fromId);
    rows[132+i*10]=[ids.indexOf(p.fromRegionId),ids.indexOf(p.toRegionId),p.radius,reverse];
    ['center','right','up','normal','exitCenter','exitRight','exitUp','exitNormal'].forEach((key,k)=>rows[133+i*10+k]=v4(p[key]));
  });
  return {texture:new Float32Array(rows.flat()),ids,primitiveIds:data.primitives.map(p=>p.id),
    maxDistance:data.regions.some(r=>r.coverage==='s3-cover')?64:32,
    counts:[surfaces.length,primitives.length,groups,data.portals.length]};
}

export const CONNECTED_VERTEX=`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
export const CONNECTED_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uData;
uniform ivec4 uCounts;
uniform vec4 uPosition,uForward,uRight,uUp;
uniform vec2 uResolution;
uniform int uRegion,uDebug,uDiagnostics;
uniform int uPolished,uAO,uAntialias;
uniform float uMaxDistance;
out vec4 frag;
const float PI=3.141592653589793;
// Numerical refusal bands for bounded float32 data, not a portable libm proof.
const float E=0.00003;
// Query status stays unresolved. Kind 1 identifies a reached chart boundary;
// kind 2 is numerical/traversal uncertainty, never silently painted as sky.
int refusalKind=2;
vec4 hitPoint;
// Range-reduced atan2: the shader compiler's native atan approximation caused
// measurable drift through two portals. Half-angle reduction keeps the Taylor
// argument <=sqrt(2)-1; nine terms bound truncation below float32 roundoff.
float a2(float y,float x){
  if(x==0.)return y==0.?0.:sign(y)*PI*.5;
  float ax=abs(x),ay=abs(y),z=min(ax,ay)/max(ax,ay);
  float h=z/(1.+sqrt(1.+z*z)),s=h*h;
  float p=1./17.;p=-1./15.+s*p;p=1./13.+s*p;p=-1./11.+s*p;p=1./9.+s*p;p=-1./7.+s*p;p=1./5.+s*p;p=-1./3.+s*p;
  float angle=2.*h*(1.+s*p);if(ay>ax)angle=PI*.5-angle;if(x<0.)angle=PI-angle;return y<0.?-angle:angle;
}
float ac(float x){x=clamp(x,-1.,1.);return a2(sqrt(max(0.,(1.-x)*(1.+x))),x);}
// Native trigonometric accuracy varies by backend. In particular, a small
// absolute cosine error near a small spherical ball is amplified by root solving.
// Reduce to [-pi/2,pi/2], then evaluate sine/cosine without native trig calls.
vec2 sincos(float x){
  x=mod(x+PI,2.*PI)-PI;float signC=1.;
  if(x>PI*.5){x=PI-x;signC=-1.;}else if(x< -PI*.5){x=-PI-x;signC=-1.;}
  float z=x*x;
  float s=1./6227020800.;s=-1./39916800.+z*s;s=1./362880.+z*s;s=-1./5040.+z*s;s=1./120.+z*s;s=-1./6.+z*s;
  float c=-1./87178291200.;c=1./479001600.+z*c;c=-1./3628800.+z*c;c=1./40320.+z*c;c=-1./720.+z*c;c=1./24.+z*c;c=-.5+z*c;
  return vec2(x*(1.+z*s),signC*(1.+z*c));
}
float sn(float x){return sincos(x).x;}
float cs(float x){return sincos(x).y;}
${H3_GEOMETRY_GLSL}
${E3_S3_TRANSFER_GLSL}
vec4 D(int i){return texelFetch(uData,ivec2(i,0),0);}
// Region row x selects the geometry: 0 E3, 1 S3, ${H3_REGION_CODE} H3. Every
// operation below dispatches explicitly; H3 is never the spherical else branch.
bool isH3(vec4 r){return r.x>1.5;}
vec4 at(vec4 p,vec4 u,float t,vec4 r){return isH3(r)?h3At(p,u,t,r.y):r.x<.5?p+u*t:p*cs(t/r.y)+u*sn(t/r.y);}
vec4 direction(vec4 p,vec4 u,float t,vec4 r){return isH3(r)?h3Direction(p,u,t,r.y):r.x<.5?u:-p*sn(t/r.y)+u*cs(t/r.y);}
vec4 transport(vec4 a,vec4 b,vec4 v,vec4 r){return isH3(r)?h3Transport(a,b,v):r.x<.5?v:v-dot(v,b)/(1.+dot(a,b))*(a+b);}
float dist(vec4 a,vec4 b,vec4 r){return isH3(r)?h3Distance(a,b,r.y):r.x<.5?length(a-b):r.y*a2(length(b-dot(a,b)*a),dot(a,b));}
vec4 logAt(vec4 a,vec4 b,vec4 r){if(isH3(r))return h3Log(a,b,r.y);if(r.x<.5)return b-a;vec4 v=b-dot(a,b)*a;float m=length(v);return m<E?vec4(0):v/m*dist(a,b,r);}
vec4 expAt(vec4 p,vec4 v,vec4 r){if(isH3(r))return h3Exp(p,v,r.y);float m=length(v);return r.x<.5?p+v:m<E?p:p*cs(m/r.y)+v/m*sn(m/r.y);}
// Tangent inner product and normalization in the region's own metric: a frame
// mapping may not mix a Lorentz pairing with a Euclidean dot product.
float tdot(vec4 a,vec4 b,vec4 r){return isH3(r)?h3Pair(a,b):dot(a,b);}
vec4 unitize(vec4 p,vec4 v,vec4 r){return isH3(r)?h3Unit(p,v):normalize(v);}
// H3 surface rows carry an ambient centre and a PHYSICAL radius; the value is
// the signed metric distance, matching sampleHyperbolicBall exactly.
float value(int i,vec4 p,vec4 r){vec4 m=D(2*i+1),n=D(2*i);
  return m.x>1.5?h3Distance(p,n,r.y)-m.z:m.x>.5?length(p-n)-m.z:dot(p,n)-m.z;}
int combine(int a,int b){return a==0||b==0?0:a==2||b==2?2:1;}
bool omitted[16];
int occupancy(vec4 p,int region,out int owner){
  int inside[16];vec4 r=D(128+region);
  for(int j=0;j<16;j++){inside[j]=0;if(j>=uCounts.y)break;vec4 pr=D(96+j);if(int(pr.z)!=region||omitted[j])continue;
    int v=1;for(int k=0;k<6;k++){if(k>=int(pr.y))break;int i=int(pr.x)+k;float f=value(i,p,r);v=combine(v,f>E?0:f< -E?1:2);}inside[j]=v;}
  int answer=0;owner=-1;
  for(int g=0;g<16;g++){if(g>=uCounts.z)break;ivec4 group=ivec4(D(112+g));if(group.w!=region)continue;int v=inside[group.x];
    for(int j=0;j<16;j++){if(j>=uCounts.y)break;if((group.y&(1<<j))!=0)v=combine(v,inside[j]==2?2:1-inside[j]);if((group.z&(1<<j))!=0)v=combine(v,inside[j]);}
    if(v==1){owner=group.x;return 1;}if(v==2)answer=2;}
  return answer;
}
float roots[100];int rootSurface[100];int count;float uncertainAt;
void ambiguity(float lo,float hi,float end){if(hi>=-E&&lo<=end+E)uncertainAt=min(uncertainAt,max(0.,lo-E));}
void root(float t,int i,float end){if(t< -E||t>end+E)return;if(t<=E||abs(t-end)<=E){ambiguity(t-4.*E,t+4.*E,end);return;}if(count>=100){ambiguity(0.,end,end);return;}roots[count]=t;rootSurface[count++]=i;}
void solve(int i,vec4 p,vec4 u,vec4 r,float end){
  vec4 n=D(i*2),m=D(i*2+1);
  if(isH3(r)){
    // Analytic H3 ball boundary roots. An inside/on-surface start or lost
    // conditioning refuses the whole ray; a tangency band becomes an
    // uncertainty event, never an absent ball.
    //
    // BOTH boundaries are supplied. The shared sweep below decides occupancy
    // halfway between consecutive events, so an entry-only primitive would be
    // sampled beyond the exit -- outside the ball -- and the hit would vanish
    // (entry 1.5, exit 2.5, end 6 samples 3.75). A boundary band that straddles
    // the segment end stays an uncertainty event, never an absent surface.
    vec3 enterBand,exitBand;int code=h3BallSpan(p,u,n,m.z,r.y,enterBand,exitBand);
    if(code==3){ambiguity(0.,end,end);return;}
    if(code==0)return;
    if(code==2){if(enterBand.x<=end)uncertainAt=min(uncertainAt,max(0.,enterBand.x-4.*E));return;}
    if(enterBand.x>end)return;
    if(enterBand.z>=end){uncertainAt=min(uncertainAt,max(0.,enterBand.x-4.*E));return;}
    root(enterBand.y,i,end);
    // Past the segment end the exit root cannot separate two events inside it,
    // and [entry,end] is then wholly interior, so omitting it changes no answer.
    if(exitBand.x>end)return;
    if(exitBand.z>=end){uncertainAt=min(uncertainAt,max(0.,exitBand.x-4.*E));return;}
    root(exitBand.y,i,end);
    return;
  }
  if(r.x<.5){
    if(m.x>.5){vec4 v=p-n;float b=dot(v,u),c=dot(v,v)-m.z*m.z,d=b*b-c;if(d< -4.*E)return;if(d<4.*E){float s=sqrt(max(0.,d)+4.*E);ambiguity(-b-s,-b+s,end);return;}float s=sqrt(d);root(-b-s,i,end);root(-b+s,i,end);}
    else {float a=dot(p,n)-m.z,b=dot(u,n);if(abs(b)<E){float last=a+b*end;if(abs(a)<E||abs(last)<E||a*last<0.)ambiguity(0.,end,end);return;}root(-a/b,i,end);}
  }else{
    float a=dot(p,n),b=dot(u,n),h=length(vec2(a,b)),c=m.z;
    if(h<E){if(abs(c)<E)ambiguity(0.,end,end);return;}float ratio=c/h;
    if(abs(ratio)>1.+4.*E)return;
    if(abs(ratio)>1.-4.*E){float center=a2(b,a)+(ratio<0.?PI:0.),spread=ac(clamp(abs(ratio)-4.*E,0.,1.));
      for(int k=-1;k<=2;k++)ambiguity((center-spread+float(k)*2.*PI)*r.y,(center+spread+float(k)*2.*PI)*r.y,end);return;}
    float phase=a2(b,a),angle=ac(ratio);
    for(int k=-1;k<=2;k++){root((phase-angle+float(k)*2.*PI)*r.y,i,end);root((phase+angle+float(k)*2.*PI)*r.y,i,end);}
  }
}
bool excluded(int j,vec4 p,vec4 u,vec4 r,float end){
  // Half-space exclusion is a Boolean-primitive optimisation. H3 admits single
  // additive balls only, so there is no hyperbolic plane bound to reuse here.
  if(isH3(r))return false;
  vec4 pr=D(96+j);if(pr.y<2.)return false;
  for(int k=0;k<6;k++){if(k>=int(pr.y))break;int i=int(pr.x)+k;vec4 n=D(2*i);float c=D(2*i+1).z;
    float a=dot(p,n),b=dot(u,n),minimum;
    if(r.x<.5)minimum=min(a-c,a+b*end-c);
    else{float L=end/r.y;minimum=min(a,a*cs(L)+b*sn(L));float phase=a2(b,a)+PI;
      for(int z=-1;z<=1;z++){float t=phase+float(z)*2.*PI;if(t>=-E&&t<=L+E)minimum=min(minimum,-length(vec2(a,b)));}minimum-=c;}
    if(minimum>4.*E)return true;
  }return false;
}
// SHARED occupancy sweep of one segment [0,end] in ONE region. uncertainEvent is
// the nearest already-known unresolved event on that segment; travel through it
// is never claimed. Returns 0 empty travel, 1 a definite hit, 2 unresolved.
// hitSurface <0 with a hit means the start itself was inside a solid.
int sweep(vec4 p,vec4 u,vec4 r,int region,float end,float uncertainEvent,
  out float hitAt,out int hitOwner,out int hitSurface){
  hitAt=end;hitOwner=-1;hitSurface=-1;
  count=0;uncertainAt=uncertainEvent;
  for(int j=0;j<16;j++){omitted[j]=false;if(j>=uCounts.y)break;if(int(D(96+j).z)==region)omitted[j]=excluded(j,p,u,r,end);}
  // An H3 start inside a solid refuses, matching castHyperbolicBalls: the
  // adapter makes no interior claim a ray could be launched from.
  int owner;int start=occupancy(p,region,owner);
  if(start==2||start==1&&(r.w>.5||isH3(r)))return 2;
  if(start==1){hitOwner=owner;hitAt=0.;return 1;}
  for(int i=0;i<48;i++){if(i>=uCounts.x)break;vec4 m=D(2*i+1);if(int(m.w)==region&&!omitted[int(m.y)])solve(i,p,u,r,end);}
  float previous=-1.;
  for(int step=0;step<100;step++){
    float nearest=1e20;int chosen=-1;for(int j=0;j<100;j++){if(j>=count)break;if(roots[j]>previous&&roots[j]<nearest){nearest=roots[j];chosen=j;}}
    if(chosen<0)break;if(uncertainAt<=nearest+4.*E)return 2;float next=min(end,uncertainAt);for(int j=0;j<100;j++){if(j>=count)break;if(j!=chosen&&abs(roots[j]-nearest)<E)return 2;if(roots[j]>nearest)next=min(next,roots[j]);}
    if(next-nearest<4.*E)return 2;int after=occupancy(at(p,u,(nearest+next)*.5,r),region,owner);
    if(after==2)return 2;
    if(after==1){hitAt=nearest;hitOwner=owner;hitSurface=rootSurface[chosen];return 1;}
    previous=nearest;
  }
  if(uncertainAt<=end+E)return 2;
  return 0;
}
// status 1 hit, 0 miss, 2 unresolved; region/owner retain provenance.
vec4 trace(vec4 p,vec4 u,int region,out vec4 normal,out vec4 tangent){
  float traveled=0.;int reverse=-1;normal=vec4(0);tangent=u;
  for(int crossing=0;crossing<5;crossing++){
    vec4 r=D(128+region);float remain=uMaxDistance-traveled,edge=1e20;
    float end=remain;int gate=-1;bool h3Path=isH3(r),solidGateTie=false;
    int found=0;float hitAt=0.;int hitOwner=-1;int hitSurface=-1;
    if(h3Path){
      // H3 domain: physical radial distance from the chart origin, refusing just
      // inside the authored extent. Reaching it is a chart boundary (kind 1).
      if(h3Radial(p,r.y)>r.z-E)return vec4(2,region,-1,traveled);
      edge=h3Boundary(p,u,r.y,r.z);
      float full=min(remain,edge);
      // ORDER OF RECORD, region-sight.js H3 branch: query the field over the
      // WHOLE segment first, so a definite foreground solid bounds every
      // aperture query, and only then ask the apertures -- all of them on that
      // one identical horizon. queryHyperbolicAperture exports
      // uncertaintyFrom:0 for EVERY refusal, so an unresolved aperture inside
      // the horizon refuses the whole ray. A certified nearer hit does NOT win
      // over it; the earliest-possible-root relaxation used earlier was not an
      // equivalent policy and is gone.
      float fgAt;int fgOwner,fgSurface;
      int fg=sweep(p,u,r,region,full,1e20,fgAt,fgOwner,fgSurface);
      // A remote solid ambiguity may lie beyond a nearer portal. Keep it pending
      // until apertures establish the segment, then re-query that prefix. CPU
      // region-sight only short-circuits a work-budget refusal here.
      float horizon=fg==1?fgAt:full;
      // With the chart boundary inside the horizon, queryHyperbolicAperture's
      // own miss() reports unresolved domain-exit instead of a miss, so any
      // portal of this region makes the ray unresolved rather than empty.
      bool domainInside=edge<=horizon+E,domainRefusal=false;
      end=horizon;
      for(int g=0;g<8;g++){if(g>=uCounts.w)break;int base=132+g*10;vec4 info=D(base);if(int(info.x)!=region)continue;
        vec4 center=D(base+1),n=D(base+4);
        // Reverse-aperture suppression, before the root query, as region-sight
        // does: a ray that just emerged here starts exactly on this plane and
        // its own zero event is not an entering crossing. Any OTHER on-plane
        // start owns no side and refuses.
        if(abs(h3Pair(p,n))<E&&dist(center,p,r)<info.z+E){
          if(g!=reverse)return vec4(2,region,-1,traveled);
          continue;
        }
        vec4 ap=h3ApertureEntry(p,u,n,r.y);
        if(ap.x>1.5)return vec4(2,region,-1,traveled);
        if(ap.x<.5||ap.y>horizon+E){if(domainInside)domainRefusal=true;continue;}
        // The root band straddles the horizon: a range/domain ambiguity, and on
        // the CPU that too certifies nothing from arclength zero.
        if(ap.w>=horizon-E)return vec4(2,region,-1,traveled);
        float t=ap.z;vec4 q=at(p,u,t,r);
        if(abs(h3Pair(q,n))>4.*E||h3Radial(q,r.y)>r.z)return vec4(2,region,-1,traveled);
        // Rim decision with the root's own arclength uncertainty, as the CPU
        // helper does through the 1-Lipschitz property of distance.
        float radial=dist(center,q,r),rim=E+max(t-ap.y,ap.w-t);
        if(abs(info.z-radial)<=rim)return vec4(2,region,-1,traveled);
        if(radial>info.z){if(domainInside)domainRefusal=true;continue;}
        if(t>end+E)continue;
        if(gate>=0&&abs(t-end)<=E)return vec4(2,region,-1,traveled); // aperture tie
        gate=g;end=t;
      }
      // Keep coverage distinct from numeric failure. Inspect ALL apertures first:
      // a later numeric refusal must remain magenta regardless of array order.
      // CPU domain refusals have uncertaintyFrom:0; this is still unresolved,
      // never permission to cross a nearer gate or paint a confident sky.
      if(domainRefusal){refusalKind=1;return vec4(2,region,-1,traveled);}
      // Reuse rule of the CPU: a full-range miss or an unshortened segment keeps
      // the foreground answer; a strictly nearer gate re-queries only its prefix.
      if(fg==0){found=0;hitAt=end;}
      else if(fg==1&&end>=horizon-E){found=1;hitAt=fgAt;hitOwner=fgOwner;hitSurface=fgSurface;}
      else{found=sweep(p,u,r,region,end,1e20,hitAt,hitOwner,hitSurface);
        if(found==2)return vec4(2,region,-1,traveled);}
      solidGateTie=found==1&&gate>=0&&abs(hitAt-end)<=E;
    }else{
      if(r.x<.5){if(length(p)>r.z+E)return vec4(2,region,-1,traveled);float b=dot(p,u),c=dot(p,p)-r.z*r.z;edge=-b+sqrt(max(0.,b*b-c));}
      else if(r.w<.5){float boundary=cs(r.z/r.y);if(p.w<boundary-E)return vec4(2,region,-1,traveled);float h=length(vec2(p.w,u.w));if(h<E||boundary/h>1.+E)return vec4(2,region,-1,traveled);edge=r.y*(a2(u.w,p.w)+ac(boundary/h));}
      end=min(remain,edge);float portalUncertain=1e20;
      for(int g=0;g<8;g++){if(g>=uCounts.w)break;int base=132+g*10;vec4 info=D(base);if(int(info.x)!=region)continue;
        vec4 center=D(base+1),n=D(base+4);float t=1e20;
        float a=r.x<.5?dot(p-center,n):dot(p,n),b=dot(u,n);
        if(abs(a)<E&&dist(center,p,r)<info.z+E){if(g!=reverse)return vec4(2,region,-1,traveled);if(r.w<.5)continue;}
        if(r.w<.5&&a<=E)continue;
        if(r.x<.5){if(b< -E)t=-a/b;}else{float phase=a2(-a,b);for(int k=-1;k<=3;k++){
          float theta=phase+float(k)*PI,candidate=theta*r.y;
          if(candidate>E&&candidate<=end+E&&-a*sn(theta)+b*cs(theta)<-E){
            float radialCandidate=dist(center,at(p,u,candidate,r),r);
            if(abs(radialCandidate-info.z)<4.*E)portalUncertain=min(portalUncertain,max(0.,candidate-4.*E));
            else if(radialCandidate<info.z)t=min(t,candidate);
          }
        }}
        if(t>end+E)continue;vec4 q=at(p,u,t,r);float radial=dist(center,q,r);
        if(abs(radial-info.z)<4.*E){portalUncertain=min(portalUncertain,max(0.,t-4.*E));continue;}if(radial>info.z)continue;
        if(abs(t-end)<E){portalUncertain=min(portalUncertain,max(0.,t-4.*E));continue;}end=t;gate=g;
      }
      // Portal uncertainty is an event along the E3/S3 ray, not a whole-ray
      // veto: those producers do export a certified prefix. A certified nearer
      // hit wins; rays reaching the uncertain event still stop.
      found=sweep(p,u,r,region,end,portalUncertain,hitAt,hitOwner,hitSurface);
    }
    if(found==2)return vec4(2,region,-1,traveled);
    if(found==1){
      if(solidGateTie)return vec4(2,region,-1,traveled);
      if(hitSurface<0){hitPoint=p;return vec4(1,region,hitOwner,traveled);}
      vec4 q=at(p,u,hitAt,r),n=D(hitSurface*2),m=D(hitSurface*2+1);
      // H3 outward normal is the unit tangent at the hit AWAY from the centre,
      // i.e. -log_q(centre) normalized in the induced metric.
      normal=m.x>1.5?h3Unit(q,-h3Log(q,n,r.y)):m.x>.5?normalize(q-n):normalize(r.x<.5?n:n-dot(n,q)*q);
      for(int g=0;g<16;g++){if(g>=uCounts.z)break;ivec4 group=ivec4(D(112+g));if(group.x==hitOwner&&(group.y&(1<<int(m.y)))!=0)normal=-normal;}
      hitPoint=q;tangent=direction(p,u,hitAt,r);return vec4(1,region,hitOwner,traveled+hitAt);
    }
    if(gate<0){if(edge<=remain+E){refusalKind=1;return vec4(2,region,-1,traveled+end);}return vec4(0,region,-1,traveled+end);}
    if(h3Path&&abs(edge-end)<=E)return vec4(2,region,-1,traveled+end); // domain/aperture tie
    if(crossing==4)return vec4(2,region,-1,traveled+end);
    int base=132+gate*10;vec4 info=D(base),center=D(base+1),exitCenter=D(base+5),dest=D(128+int(info.y));
    vec4 newP,newU;bool stable=false;
    // Reuse the selected crossing distance; do not solve a second event with
    // a different clock. No rim, ordering or numerical guard is weakened.
    if(r.x<.5&&dest.x>.5&&!isH3(dest))
      stable=e3S3TransferSelected(p.xyz,u.xyz,center.xyz,D(base+2).xyz,D(base+3).xyz,D(base+4).xyz,
        exitCenter,D(base+6),D(base+7),D(base+8),dest.y,end,newP,newU);
    if(!stable){
      vec4 q=at(p,u,end,r),v=transport(q,center,direction(p,u,end,r),r),radial=logAt(center,q,r);
      vec4 mapped=-tdot(radial,D(base+2),r)*D(base+6)+tdot(radial,D(base+3),r)*D(base+7);
      newP=expAt(exitCenter,mapped,dest);
      vec4 newV=-tdot(v,D(base+2),r)*D(base+6)+tdot(v,D(base+3),r)*D(base+7)-tdot(v,D(base+4),r)*D(base+8);
      newU=unitize(newP,transport(exitCenter,newP,newV,dest),dest);
    }
    u=newU;p=newP;region=int(info.y);reverse=int(info.w);traveled+=end;
  }return vec4(2,region,-1,traveled);
}
${CONNECTED_MATERIAL_GLSL}
vec4 pixelRay(vec2 pixel){
  vec2 uv=(2.*pixel-uResolution)/uResolution.y;
  // Unitize in the REGION's own metric. The camera basis is orthonormal there,
  // not in the ambient Euclidean norm: at radial distance rho an H3 radial unit
  // tangent has ambient length cosh(rho), so an ambient normalize would hand
  // the tracer a ray of the wrong physical speed -- and, away from the radial
  // direction, a differently tilted ray as well.
  return unitize(uPosition,uForward*${CONNECTED_FOCAL_SCALE.toPrecision(17)}+uRight*uv.x+uUp*uv.y,D(128+uRegion));
}
vec3 displayColor(vec4 result,vec4 n,vec4 t){
  vec3 color=result.x==2.?vec3(.69,.125,.82):result.x==0.?vec3(.086,.098,.118):result.y==0.?vec3(.33,.47,.75):result.y==1.?vec3(.30,.65,.44):vec3(.89,.71,.30);
  // Screen-space pattern explicitly denotes unavailable extent, not terrain,
  // fog, or an asserted empty continuation of a spherical world.
  if(result.x==2.&&refusalKind==1&&uDiagnostics==0){float tile=mod(floor(gl_FragCoord.x/12.)+floor(gl_FragCoord.y/12.),2.);color=vec3(.09,.12,.16)+tile*.014;}
  if(result.x==1.){
    if(uPolished==1&&length(n)>.5)color=finishMaterial(hitPoint,n,t,int(result.y),int(result.z));
    else color*=.3+.7*abs(tdot(n,t,D(128+int(result.y))));
  }return color;
}
void main(){
  // Read the actual centre ray before traversal; no duplicate camera formula.
  if(uDebug>=4&&uDebug<=7){
    float value=pixelRay(gl_FragCoord.xy)[uDebug-4];uint bits=floatBitsToUint(value);
    frag=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;return;
  }
  // Four independent rays sample a pixel footprint; no hit epsilon changes.
  // Each follows its own portal chain and final-region material. Diagnostics
  // remain centre rays. No derivatives inside geometry-dependent control flow.
  int sampleCount=uAntialias==1&&uDebug==0&&uDiagnostics==0?4:1;
  vec3 sum=vec3(0);bool uncertain=false;
  for(int sampleIndex=0;sampleIndex<4;sampleIndex++){
    if(sampleIndex>=sampleCount)break;
    vec2 offset=sampleCount==1?vec2(0):vec2(float(sampleIndex%2),float(sampleIndex/2))*.5-.25;
    vec4 n,t;refusalKind=2;
    vec4 result=trace(uPosition,pixelRay(gl_FragCoord.xy+offset),uRegion,n,t);
    if(uDebug==1){frag=vec4(result.x,result.y+1.,result.z+1.,result.x==2.?float(refusalKind):0.)/255.;return;}
    if(uDebug==2){uint bits=floatBitsToUint(result.w);frag=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;return;}
    if(uDebug==3){
      // A unit H3 tangent has UNBOUNDED ambient components, so n*.5+.5 clips in
      // RGBA8 and the readback silently loses the normal. Emit the bounded local
      // orthonormal-frame coordinate instead (h3Local == hyperbolic-gpu.js
      // h3LocalFrame): its Euclidean length IS the metric norm, so every
      // component of a unit normal lands inside [-1,1] at any radius. Alpha 1
      // marks the hyperbolic encoding so a reader never has to guess.
      vec4 hr=D(128+int(result.y));
      frag=isH3(hr)?vec4(h3Local(hitPoint,n)*.5+.5,1):n*.5+.5;return;
    }
    vec3 color=displayColor(result,n,t);
    if(sampleCount==1){frag=vec4(color,1);return;}
    uncertain=uncertain||(result.x==2.&&refusalKind==2);sum+=color*color;
  }
  // Unknown coverage is not a confident averaged surface. Preserve the
  // numerical marker if even one sample is unknown, rather than dilute it.
  frag=vec4(uncertain?vec3(.69,.125,.82):sqrt(sum*.25),1);
}`;
