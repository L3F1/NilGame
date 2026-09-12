// Finite apertures are geodesic discs. Position correspondence preserves radial
// length/angle; tangent transport preserves physical speed, NOT the differential
// of an isometry between distinct metrics. That is an explicit gameplay policy.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(v,s)=>v.map(x=>x*s);
const clamp1=x=>Math.max(-1,Math.min(1,x));
/**
 * How close to the aperture plane still counts as ON it, in PHYSICAL units.
 *
 * One constant, shared by `crossing` and by `signedHeight`, because a
 * checkpoint that a caller believes is on the entering side while `crossing`
 * reads it as on-plane is exactly the disagreement that lets a walker through
 * a refused portal. Exported so a coordinator can certify a point against the
 * same number the crossing test used.
 */
export const PORTAL_PLANE_TOLERANCE=1e-9;
function anchorFrame(entity,space) {
  const center=space.decode(entity.position),base=space.frame(center);
  const lift=v=>base[0].map((_,i)=>base.reduce((sum,b,j)=>sum+b[i]*v[j],0));
  const normal=lift(entity.forward),up=lift(entity.up),right=lift(cross(entity.up,entity.forward));
  return {entity,space,center,normal,up,right};
}
export function decodeRegionAnchor(entity,space) {
  const f=anchorFrame(entity,space);
  return {id:entity.id,regionId:entity.regionId,radius:entity.radius,space,center:f.center,normal:f.normal,up:f.up};
}
export function compileRegionPortals(scene,regions) {
  const endpoints=new Set(scene.connections.flatMap(c=>[c.a,c.b]));
  const anchors=scene.entities.filter(e=>endpoints.has(e.id)).map(e=>decodeRegionAnchor(e,regions.get(e.regionId).space));
  // Legacy programmatic callers omit scene-document policy defaults. Keep that
  // adapter compatible; the new physical-frame API requires explicit policies.
  const connections=scene.connections.map(c=>({kind:'portal',velocity:'preserve-speed',scale:1,...c}));
  return compileFramedPortals(connections,anchors,scene.units.playerRadius);
}

// Shared physical-frame boundary: global cover placements need no fake decode
// through the origin chart. Scene-v2 continues to decode through its own adapter.
export function compileFramedPortals(connections,anchors,playerRadius) {
  if(!Number.isFinite(playerRadius)||playerRadius<=0)throw Error('Invalid player radius');
  const entities=new Map(),used=new Set(),ids=new Set();
  for(const anchor of anchors){
    const {space,center,normal,up}=anchor;
    // Plane roots and ambient frame projections below are E3/S3 only. A new
    // metric must implement these operations before it can enter this path.
    if(!space||!['e3','s3'].includes(space.kind))throw Error(`Unsupported portal geometry: ${space?.kind}`);
    if(!anchor.id||!anchor.regionId||entities.has(anchor.id))throw Error('Invalid or duplicate anchor ID');
    space.validatePoint(center);space.validateTangent(center,normal);space.validateTangent(center,up);
    if(Math.abs(space.norm(center,normal)-1)>1e-8||Math.abs(space.norm(center,up)-1)>1e-8||Math.abs(space.dot(center,normal,up))>1e-8)throw Error('Aperture frame must be orthonormal');
    if(!Number.isFinite(anchor.radius)||anchor.radius<=0)throw Error('Invalid aperture radius');
    const basis=space.frame(center),u=basis.map(e=>space.dot(center,up,e)),n=basis.map(e=>space.dot(center,normal,e)),r=cross(u,n);
    const right=center.map((_,i)=>basis.reduce((s,b,j)=>s+b[i]*r[j],0));
    entities.set(anchor.id,{entity:{id:anchor.id,regionId:anchor.regionId,radius:anchor.radius},space,
      center:center.slice(),normal:normal.slice(),up:up.slice(),right});
  }
  const portals=[];
  for(const connection of connections) {
    if(!connection.id||ids.has(connection.id)||connection.kind!=='portal'||connection.velocity!=='preserve-speed'||connection.scale!==1||connection.a===connection.b)throw Error('Invalid portal connection');
    ids.add(connection.id);
    const ends=[connection.a,connection.b].map(id=>{
      const frame=entities.get(id);
      if(!frame||used.has(id))throw Error('Unknown or already connected anchor');
      if(frame.entity.radius<=playerRadius)throw Error('Aperture does not admit player');
      if(frame.space.kind==='s3'&&frame.entity.radius>=Math.PI*frame.space.curvatureRadius/2)throw Error('S3 aperture must fit an open hemisphere');
      used.add(id);return frame;
    });
    if(ends[0].entity.radius!==ends[1].entity.radius)throw Error('Aperture radii must match');
    for(let i=0;i<2;i++) {
      const a=ends[i],b=ends[1-i];
      const fromFrame=v=>[-a.space.dot(a.center,v,a.right),a.space.dot(a.center,v,a.up),-a.space.dot(a.center,v,a.normal)];
      const toFrame=v=>b.center.map((_,j)=>v[0]*b.right[j]+v[1]*b.up[j]+v[2]*b.normal[j]);
      portals.push(Object.freeze({id:connection.id,fromId:a.entity.id,toId:b.entity.id,
        fromRegionId:a.entity.regionId,toRegionId:b.entity.regionId,
        radius:a.entity.radius,center:a.center.slice(),normal:a.normal.slice(),
        // PHYSICAL signed distance to the aperture's plane: positive on the
        // entering side. In E3 that is the plane offset; on S3 the aperture is
        // a great sphere and the physical height is R*asin(p.n), not the dot
        // product itself -- the two agree only near the plane, which is the one
        // place a tolerance must not be approximated.
        signedHeight:p=>a.space.kind==='e3'
          ?dot(p.map((x,j)=>x-a.center[j]),a.normal)
          :a.space.curvatureRadius*Math.asin(clamp1(dot(p,a.normal))),
        crossing(p,u,maxTravel,radius=0) {
          const s=a.space;
          s.validatePoint(p);
          if(Math.abs(s.norm(p,u)-1)>1e-8||!(maxTravel>=0)||(!Number.isFinite(maxTravel)&&maxTravel!==Infinity)||!Number.isFinite(radius)||radius<0)throw Error('Invalid aperture crossing query');
          let t=Infinity;
          if(s.kind==='e3') {
            const h=dot(p.map((x,j)=>x-a.center[j]),a.normal),speed=dot(u,a.normal);
            if(h<=PORTAL_PLANE_TOLERANCE||speed>=-1e-12)return null;
            t=-h/speed;
          } else {
            const A=dot(p,a.normal),B=dot(u,a.normal),R=s.curvatureRadius;
            if(s.coverage!=='s3-cover'&&R*Math.asin(clamp1(A))<=PORTAL_PLANE_TOLERANCE)return null;
            const root=Math.atan2(-A,B);
            for(let k=-1;k<=3;k++) {
              const theta=root+k*Math.PI,candidate=theta*R;
              if(candidate>1e-9&&candidate<=maxTravel+1e-9&&-A*Math.sin(theta)+B*Math.cos(theta)<0){
                // A great sphere meets the orbit twice; the finite aperture
                // occupies only its local disc, not the antipodal disc.
                const at=s.step(p,u,candidate);
                if(s.distance(a.center,at)+radius<=a.entity.radius-1e-7)t=Math.min(t,candidate);
              }
            }
          }
          if(t>maxTravel+1e-9)return null;
          const at=s.step(p,u,t),radial=s.distance(a.center,at);
          if(radial+radius>a.entity.radius-1e-7)return null;
          return {distance:t,at};
        },
        transit(at) {
          const radial=a.space.logAt(a.center,at),local=fromFrame(radial);
          // The cross point lies in the aperture; numerical normal residue is
          // not an invitation to transport a sliver of the adjacent volume.
          local[2]=0;
          const position=b.space.expAt(b.center,toFrame(local));
          const carry=v=>b.space.transport(b.center,position,toFrame(fromFrame(a.space.transport(at,a.center,v))));
          return {position,carry,normal:b.space.transport(b.center,position,b.normal)};
        },
        renderData:()=>({id:connection.id,fromRegionId:a.entity.regionId,toRegionId:b.entity.regionId,radius:a.entity.radius,
          center:a.center.slice(),right:a.right.slice(),up:a.up.slice(),normal:a.normal.slice(),
          exitCenter:b.center.slice(),exitRight:b.right.slice(),exitUp:b.up.slice(),exitNormal:b.normal.slice()}),
      }));
    }
  }
  return portals;
}
