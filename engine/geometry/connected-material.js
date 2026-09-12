// Display-only material code. These fields are heuristic AO inputs, never
// collision/ray guarantees. Points and normals belong to the final hit region.
export const CONNECTED_MATERIAL_GLSL=`
float materialField(vec4 p,int region){
  vec4 r=D(128+region);float fields[16];
  for(int j=0;j<16;j++){
    fields[j]=1e10;if(j>=uCounts.y)break;vec4 pr=D(96+j);if(int(pr.z)!=region)continue;
    float f=-1e10;
    for(int k=0;k<6;k++){
      if(k>=int(pr.y))break;int i=int(pr.x)+k;vec4 n=D(2*i),m=D(2*i+1);float d;
      if(isH3(r))d=h3Distance(p,n,r.y)-m.z;
      else if(r.x<.5)d=m.x>.5?length(p-n)-m.z:dot(p,n)-m.z;
      else if(pr.w>.5)d=r.y*(ac(clamp(-dot(p,n),-1.,1.))-ac(clamp(-m.z,-1.,1.)));
      else d=r.y*(PI*.5-ac(clamp(dot(p,n),-1.,1.)));
      f=max(f,d);
    }fields[j]=f;
  }
  float result=1e10;
  for(int g=0;g<16;g++){
    if(g>=uCounts.z)break;ivec4 group=ivec4(D(112+g));if(group.w!=region)continue;
    float f=fields[group.x];
    for(int j=0;j<16;j++){
      if(j>=uCounts.y)break;
      if((group.y&(1<<j))!=0)f=max(f,-fields[j]);
      if((group.z&(1<<j))!=0)f=max(f,fields[j]);
    }result=min(result,f);
  }return result;
}
float localAO(vec4 p,vec4 normal,int region){
  vec4 r=D(128+region);
  // No local field may invent a shadow across a portal or unsupported extent.
  for(int g=0;g<8;g++){
    if(g>=uCounts.w)break;int base=132+10*g;vec4 info=D(base);
    if(int(info.x)==region&&dist(p,D(base+1),r)<info.z+.65)return 1.;
  }
  float deficit=0.,weight=0.;
  for(int j=0;j<4;j++){
    float h=.06*pow(2.15,float(j)),w=1./(1.+float(j));vec4 q=at(p,normal,h,r);
    if(isH3(r)?h3Radial(q,r.y)>=r.z:r.x<.5?length(q)>=r.z:r.w<.5&&q.w<=cs(r.z/r.y))continue;
    deficit+=w*clamp((h-materialField(q,region))/h,0.,1.);weight+=w;
  }
  return weight>0.?1.-.65*deficit/weight:1.;
}
// Smooth construction-frame light field on S3 (not a globally parallel vector).
vec4 lightField(vec4 p,vec4 r){
  if(r.x<.5)return normalize(vec4(-.45,-.6,.9,0));
  if(isH3(r))return h3Unit(p,h3Transport(vec4(0,0,0,1),p,normalize(vec4(-.45,-.6,.9,0))));
  vec4 e0=vec4(p.w,p.z,-p.y,-p.x),e1=vec4(-p.z,p.w,p.x,-p.y),e2=vec4(p.y,-p.x,p.w,-p.z);
  return normalize(-.45*e0-.6*e1+.9*e2);
}
vec3 finishMaterial(vec4 p,vec4 normal,vec4 viewRay,int region,int owner){
  vec4 r=D(128+region),pr=D(96+owner),light=lightField(p,r);
  vec3 base=region==0?vec3(.16,.38,.72):region==1?vec3(.12,.58,.38):vec3(.74,.40,.12);
  float marking=0.;
  if(pr.w<.5&&r.x<.5&&abs(normal.z)>.9){
    // One-unit flat-floor tiles help communicate scale. Pattern uses the hit
    // region's coordinates, so viewing it through a portal cannot swap phase.
    float tile=mod(floor(p.x)+floor(p.y),2.);
    base*=mix(.72,1.,tile);
  }
  if(pr.w>.5){
    vec4 center=D(2*int(pr.x));
    vec3 local;
    if(isH3(r))local=normalize(h3Local(center,h3Log(center,p,r.y)));
    else if(r.x<.5)local=normalize((p-center).xyz);
    else{
      center=-center;
      vec4 axis0=vec4(center.w,center.z,-center.y,-center.x),axis1=vec4(-center.z,center.w,center.x,-center.y),axis2=vec4(center.y,-center.x,center.w,-center.z);
      local=normalize(vec3(dot(p,axis0),dot(p,axis1),dot(p,axis2)));
    }
    // Object-attached equatorial bands. Fixed smooth width: derivatives inside
    // divergent per-ray hit/CSG control flow are not a dependable footprint.
    float band=abs(abs(local.z)-.22),aa=.012;
    marking=1.-smoothstep(.026-aa,.026+aa,band);
    base=mix(base,vec3(.68,.78,.77),marking*.8);
  }
  float diffuse=max(0.,tdot(normal,light,r)),fill=max(0.,-tdot(normal,light,r));
  vec4 halfRaw=light-viewRay;float halfNorm=isH3(r)?h3Norm(p,halfRaw):length(halfRaw);
  float spec=halfNorm>1e-5?pow(max(0.,tdot(normal,halfRaw/halfNorm,r)),48.):0.;
  float fresnel=pow(1.-clamp(-tdot(normal,viewRay,r),0.,1.),4.);
  float ao=uAO==1?localAO(p,normal,region):1.;
  vec3 color=base*(vec3(.16,.21,.30)*ao+vec3(1.05,.90,.73)*diffuse*.85+vec3(.12,.20,.31)*fill*.35);
  color+=vec3(1.,.88,.69)*spec*.5+base*fresnel*.11;
  // Gentle display transform, no distance fog or hidden geometry cutoff.
  // Monotone gamma-2 display transform.
  color=color/(color+vec3(.7));return sqrt(max(color,vec3(0)));
}
`;
