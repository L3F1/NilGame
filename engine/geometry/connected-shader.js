// Bounded float32 GPU reference for E3/S3. Surface candidates are analytic;
// uncertain roots, intervals, portal rims and chart exits stay unresolved.
export const CONNECTED_LIMITS = Object.freeze({ surfaces:48, primitives:16, groups:16, regions:4, portals:8 });
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const v4=a=>[...a,...Array(4-a.length).fill(0)];
export function packConnectedWorld(world) {
  const data=world.renderData(), ids=data.regions.map(r=>r.id);
  if(data.regions.length>4||data.primitives.length>16||data.portals.length>8) throw Error('Connected GPU capacity exceeded');
  for(const r of data.regions) if(!['e3','s3'].includes(r.kind)||r.kind==='s3'&&r.extent>=Math.PI*r.curvatureRadius/2)
    throw Error('Connected GPU requires E3 or an open-hemisphere S3 chart');
  const rows=Array.from({length:224},()=>[0,0,0,0]), surfaces=[], primitives=[];
  for(const p of data.primitives) {
    const region=ids.indexOf(p.regionId), r=data.regions[region], owner=primitives.length, start=surfaces.length;
    const add=(n,c,type=0)=>surfaces.push({n:v4(n),meta:[type,owner,c,region]});
    if(p.kind==='ball') {
      if(r.kind==='e3') add(p.center,p.radius,1);
      else add(p.center.map(x=>-x),-Math.cos(p.radius/r.curvatureRadius));
    } else if(r.kind==='s3') for(const n of p.planes) add(n,0);
    else if(p.kind==='plane') { const n=p.planes[0]; add(n.slice(0,3),-n[3]); }
    else if(p.kind==='box') for(let a=0;a<3;a++) for(const sign of [-1,1]) {
      const n=p.axes[a].map(x=>x*sign);add(n,dot(n,p.center)+p.halfExtent[a]);
    } else throw Error(`Unsupported connected primitive ${p.kind}`);
    primitives.push([start,surfaces.length-start,region,0]);
  }
  if(surfaces.length>48) throw Error('Connected GPU surface capacity exceeded');
  surfaces.forEach((s,i)=>{rows[i*2]=s.n;rows[i*2+1]=s.meta;});
  primitives.forEach((p,i)=>rows[96+i]=p);
  let groups=0;
  for(const [id,r] of world.regions) for(const g of typeof r.field.groups==='function'
    ?r.field.groups().map(g=>({base:{entity:g.entity},modifiers:g.modifiers.map(entity=>({entity}))})):r.field.groups) {
    const index=p=>data.primitives.findIndex(q=>q.id===p.entity.id);
    let sub=0,intersect=0;
    for(const m of g.modifiers) {const bit=1<<index(m);if(m.entity.op==='subtract')sub|=bit;else intersect|=bit;}
    if(groups>=16)throw Error('Connected GPU group capacity exceeded');
    rows[112+groups++]=[index(g.base),sub,intersect,ids.indexOf(id)];
  }
  data.regions.forEach((r,i)=>rows[128+i]=[r.kind==='s3'?1:0,r.curvatureRadius,r.extent,0]);
  data.portals.forEach((p,i)=>{
    const reverse=world.portals.findIndex(q=>q.fromId===world.portals[i].toId&&q.toId===world.portals[i].fromId);
    rows[132+i*10]=[ids.indexOf(p.fromRegionId),ids.indexOf(p.toRegionId),p.radius,reverse];
    ['center','right','up','normal','exitCenter','exitRight','exitUp','exitNormal'].forEach((key,k)=>rows[133+i*10+k]=v4(p[key]));
  });
  return {texture:new Float32Array(rows.flat()),ids,primitiveIds:data.primitives.map(p=>p.id),
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
out vec4 frag;
const float PI=3.141592653589793;
// Numerical refusal bands for bounded float32 data, not a portable libm proof.
const float E=0.00003;
// Query status stays unresolved. Kind 1 identifies a reached chart boundary;
// kind 2 is numerical/traversal uncertainty, never silently painted as sky.
int refusalKind=2;
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
vec4 D(int i){return texelFetch(uData,ivec2(i,0),0);}
vec4 at(vec4 p,vec4 u,float t,vec4 r){return r.x<.5?p+u*t:p*cos(t/r.y)+u*sin(t/r.y);}
vec4 direction(vec4 p,vec4 u,float t,vec4 r){return r.x<.5?u:-p*sin(t/r.y)+u*cos(t/r.y);}
vec4 transport(vec4 a,vec4 b,vec4 v,vec4 r){return r.x<.5?v:v-dot(v,b)/(1.+dot(a,b))*(a+b);}
float dist(vec4 a,vec4 b,vec4 r){return r.x<.5?length(a-b):r.y*a2(length(b-dot(a,b)*a),dot(a,b));}
vec4 logAt(vec4 a,vec4 b,vec4 r){if(r.x<.5)return b-a;vec4 v=b-dot(a,b)*a;float m=length(v);return m<E?vec4(0):v/m*dist(a,b,r);}
vec4 expAt(vec4 p,vec4 v,vec4 r){float m=length(v);return r.x<.5?p+v:m<E?p:p*cos(m/r.y)+v/m*sin(m/r.y);}
float value(int i,vec4 p){vec4 m=D(2*i+1),n=D(2*i);return m.x>.5?length(p-n)-m.z:dot(p,n)-m.z;}
int combine(int a,int b){return a==0||b==0?0:a==2||b==2?2:1;}
bool omitted[16];
int occupancy(vec4 p,int region,out int owner){
  int inside[16];
  for(int j=0;j<16;j++){inside[j]=0;if(j>=uCounts.y)break;vec4 pr=D(96+j);if(int(pr.z)!=region||omitted[j])continue;
    int v=1;for(int k=0;k<6;k++){if(k>=int(pr.y))break;int i=int(pr.x)+k;float f=value(i,p);v=combine(v,f>E?0:f< -E?1:2);}inside[j]=v;}
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
  if(r.x<.5){
    if(m.x>.5){vec4 v=p-n;float b=dot(v,u),c=dot(v,v)-m.z*m.z,d=b*b-c;if(d< -4.*E)return;if(d<4.*E){float s=sqrt(max(0.,d)+4.*E);ambiguity(-b-s,-b+s,end);return;}float s=sqrt(d);root(-b-s,i,end);root(-b+s,i,end);}
    else {float a=dot(p,n)-m.z,b=dot(u,n);if(abs(b)<E){float last=a+b*end;if(abs(a)<E||abs(last)<E||a*last<0.)ambiguity(0.,end,end);return;}root(-a/b,i,end);}
  }else{
    float a=dot(p,n),b=dot(u,n),h=length(vec2(a,b)),c=m.z;
    if(h<E){if(abs(c)<E)ambiguity(0.,end,end);return;}float ratio=c/h;
    if(abs(ratio)>1.+4.*E)return;
    if(abs(ratio)>1.-4.*E){float center=a2(b,a)+(ratio<0.?PI:0.),spread=ac(clamp(abs(ratio)-4.*E,0.,1.));
      for(int k=-1;k<=1;k++)ambiguity((center-spread+float(k)*2.*PI)*r.y,(center+spread+float(k)*2.*PI)*r.y,end);return;}
    float phase=a2(b,a),angle=ac(ratio);
    for(int k=-1;k<=1;k++){root((phase-angle+float(k)*2.*PI)*r.y,i,end);root((phase+angle+float(k)*2.*PI)*r.y,i,end);}
  }
}
bool excluded(int j,vec4 p,vec4 u,vec4 r,float end){
  vec4 pr=D(96+j);if(pr.y<2.)return false;
  for(int k=0;k<6;k++){if(k>=int(pr.y))break;int i=int(pr.x)+k;vec4 n=D(2*i);float c=D(2*i+1).z;
    float a=dot(p,n),b=dot(u,n),minimum;
    if(r.x<.5)minimum=min(a-c,a+b*end-c);
    else{float L=end/r.y;minimum=min(a,a*cos(L)+b*sin(L));float phase=a2(b,a)+PI;
      for(int z=-1;z<=1;z++){float t=phase+float(z)*2.*PI;if(t>=-E&&t<=L+E)minimum=min(minimum,-length(vec2(a,b)));}minimum-=c;}
    if(minimum>4.*E)return true;
  }return false;
}
// status 1 hit, 0 miss, 2 unresolved; region/owner retain provenance.
vec4 trace(vec4 p,vec4 u,int region,out vec4 normal,out vec4 tangent){
  float traveled=0.;int reverse=-1;normal=vec4(0);tangent=u;
  for(int crossing=0;crossing<5;crossing++){
    vec4 r=D(128+region);float remain=32.-traveled,edge=1e20;
    if(r.x<.5){if(length(p)>r.z+E)return vec4(2,region,-1,traveled);float b=dot(p,u),c=dot(p,p)-r.z*r.z;edge=-b+sqrt(max(0.,b*b-c));}
    else{float boundary=cos(r.z/r.y);if(p.w<boundary-E)return vec4(2,region,-1,traveled);float h=length(vec2(p.w,u.w));if(h<E||boundary/h>1.+E)return vec4(2,region,-1,traveled);edge=r.y*(a2(u.w,p.w)+ac(boundary/h));}
    float end=min(remain,edge),portalUncertain=1e20;int gate=-1;
    for(int g=0;g<8;g++){if(g>=uCounts.w)break;int base=132+g*10;vec4 info=D(base);if(int(info.x)!=region)continue;
      vec4 center=D(base+1),n=D(base+4);float a=r.x<.5?dot(p-center,n):dot(p,n),b=dot(u,n);
      if(abs(a)<E&&dist(center,p,r)<info.z+E){if(g==reverse)continue;return vec4(2,region,-1,traveled);}
      if(a<=E)continue;float t=1e20;
      if(r.x<.5){if(b< -E)t=-a/b;}else{float phase=a2(-a,b);for(int k=-1;k<=2;k++){float theta=phase+float(k)*PI,candidate=theta*r.y;if(candidate>E&&-a*sin(theta)+b*cos(theta)<-E)t=min(t,candidate);}}
      if(t>end+E)continue;vec4 q=at(p,u,t,r);float radial=dist(center,q,r);
      if(abs(radial-info.z)<4.*E){portalUncertain=min(portalUncertain,max(0.,t-4.*E));continue;}if(radial>info.z)continue;
      if(abs(t-end)<E){portalUncertain=min(portalUncertain,max(0.,t-4.*E));continue;}end=t;gate=g;
    }
    // Portal uncertainty is an event along the ray, not a whole-ray veto.
    // A certified nearer hit wins; rays reaching the uncertain event still stop.
    count=0;uncertainAt=portalUncertain;
    for(int j=0;j<16;j++){omitted[j]=false;if(j>=uCounts.y)break;if(int(D(96+j).z)==region)omitted[j]=excluded(j,p,u,r,end);}
    int owner;int start=occupancy(p,region,owner);if(start==2)return vec4(2,region,-1,traveled);if(start==1)return vec4(1,region,owner,traveled);
    for(int i=0;i<48;i++){if(i>=uCounts.x)break;vec4 m=D(2*i+1);if(int(m.w)==region&&!omitted[int(m.y)])solve(i,p,u,r,end);}
    float previous=-1.;
    for(int step=0;step<100;step++){
      float nearest=1e20;int chosen=-1;for(int j=0;j<100;j++){if(j>=count)break;if(roots[j]>previous&&roots[j]<nearest){nearest=roots[j];chosen=j;}}
      if(chosen<0)break;if(uncertainAt<=nearest+4.*E)return vec4(2,region,-1,traveled);float next=min(end,uncertainAt);for(int j=0;j<100;j++){if(j>=count)break;if(j!=chosen&&abs(roots[j]-nearest)<E)return vec4(2,region,-1,traveled);if(roots[j]>nearest)next=min(next,roots[j]);}
      if(next-nearest<4.*E)return vec4(2,region,-1,traveled);int after=occupancy(at(p,u,(nearest+next)*.5,r),region,owner);
      if(after==2)return vec4(2,region,-1,traveled);
      if(after==1){int i=rootSurface[chosen];vec4 q=at(p,u,nearest,r),n=D(i*2),m=D(i*2+1);normal=m.x>.5?normalize(q-n):normalize(r.x<.5?n:n-dot(n,q)*q);
        for(int g=0;g<16;g++){if(g>=uCounts.z)break;ivec4 group=ivec4(D(112+g));if(group.x==owner&&(group.y&(1<<int(m.y)))!=0)normal=-normal;}
        tangent=direction(p,u,nearest,r);return vec4(1,region,owner,traveled+nearest);}
      previous=nearest;
    }
    if(uncertainAt<=end+E)return vec4(2,region,-1,traveled);
    if(gate<0){if(edge<=remain+E){refusalKind=1;return vec4(2,region,-1,traveled+end);}return vec4(0,region,-1,traveled+end);}
    if(crossing==4)return vec4(2,region,-1,traveled+end);
    int base=132+gate*10;vec4 info=D(base),center=D(base+1),exitCenter=D(base+5),dest=D(128+int(info.y));
    vec4 q=at(p,u,end,r),v=transport(q,center,direction(p,u,end,r),r),radial=logAt(center,q,r);
    vec4 mapped=-dot(radial,D(base+2))*D(base+6)+dot(radial,D(base+3))*D(base+7);
    vec4 newP=expAt(exitCenter,mapped,dest),newV=-dot(v,D(base+2))*D(base+6)+dot(v,D(base+3))*D(base+7)-dot(v,D(base+4))*D(base+8);
    u=normalize(transport(exitCenter,newP,newV,dest));p=newP;region=int(info.y);reverse=int(info.w);traveled+=end;
  }return vec4(2,region,-1,traveled);
}
void main(){vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
  vec4 ray=normalize(uForward/tan(35.*PI/180.)+uRight*uv.x+uUp*uv.y),n,t;
  vec4 result=trace(uPosition,ray,uRegion,n,t);
  if(uDebug==1){frag=vec4(result.x,result.y+1.,result.z+1.,result.x==2.?float(refusalKind):0.)/255.;return;}
  if(uDebug==2){uint bits=floatBitsToUint(result.w);frag=vec4(float(bits&255u),float((bits>>8)&255u),float((bits>>16)&255u),float(bits>>24))/255.;return;}
  if(uDebug==3){frag=n*.5+.5;return;}
  vec3 color=result.x==2.?vec3(.69,.125,.82):result.x==0.?vec3(.086,.098,.118):result.y==0.?vec3(.33,.47,.75):result.y==1.?vec3(.30,.65,.44):vec3(.89,.71,.30);
  // Screen-space pattern explicitly denotes unavailable extent, not terrain,
  // fog, or an asserted empty continuation of a spherical world.
  if(result.x==2.&&refusalKind==1&&uDiagnostics==0){float tile=mod(floor(gl_FragCoord.x/12.)+floor(gl_FragCoord.y/12.),2.);color=vec3(.09,.12,.16)+tile*.014;}
  if(result.x==1.)color*=.3+.7*abs(dot(n,t));frag=vec4(color,1);
}`;
