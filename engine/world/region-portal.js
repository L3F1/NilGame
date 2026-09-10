// Finite apertures are geodesic discs. Position correspondence preserves radial
// length/angle; tangent transport preserves physical speed, NOT the differential
// of an isometry between distinct metrics. That is an explicit gameplay policy.
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const scale=(v,s)=>v.map(x=>x*s);
function anchorFrame(entity,space) {
  const center=space.decode(entity.position),base=space.frame(center);
  const lift=v=>base[0].map((_,i)=>base.reduce((sum,b,j)=>sum+b[i]*v[j],0));
  const normal=lift(entity.forward),up=lift(entity.up),right=lift(cross(entity.up,entity.forward));
  return {entity,space,center,normal,up,right};
}
export function compileRegionPortals(scene,regions) {
  const entities=new Map(scene.entities.map(e=>[e.id,e]));
  const portals=[];
  for(const connection of scene.connections) {
    const ends=[connection.a,connection.b].map(id=>{
      const e=entities.get(id),r=regions.get(e.regionId);
      if(e.radius<=scene.units.playerRadius)throw new Error(`Portal ${connection.id} does not admit the player`);
      if(r.space.kind==='s3'&&e.radius>=Math.PI*r.space.curvatureRadius/2)throw new Error('S3 aperture must fit an open hemisphere');
      return anchorFrame(e,r.space);
    });
    for(let i=0;i<2;i++) {
      const a=ends[i],b=ends[1-i];
      const fromFrame=v=>[-dot(v,a.right),dot(v,a.up),-dot(v,a.normal)];
      const toFrame=v=>b.center.map((_,j)=>v[0]*b.right[j]+v[1]*b.up[j]+v[2]*b.normal[j]);
      portals.push(Object.freeze({id:connection.id,fromId:a.entity.id,toId:b.entity.id,
        fromRegionId:a.entity.regionId,toRegionId:b.entity.regionId,
        radius:a.entity.radius,center:a.center.slice(),normal:a.normal.slice(),
        crossing(p,u,maxTravel,radius=0) {
          const s=a.space;
          let t=Infinity;
          if(s.kind==='e3') {
            const h=dot(p.map((x,j)=>x-a.center[j]),a.normal),speed=dot(u,a.normal);
            if(h<=1e-9||speed>=-1e-12)return null;
            t=-h/speed;
          } else {
            const A=dot(p,a.normal),B=dot(u,a.normal),R=s.curvatureRadius;
            if(A*R<=1e-9)return null;
            const root=Math.atan2(-A,B);
            for(let k=-1;k<=3;k++) {
              const theta=root+k*Math.PI,candidate=theta*R;
              if(candidate>1e-9&&candidate<=maxTravel+1e-9&&-A*Math.sin(theta)+B*Math.cos(theta)<0)t=Math.min(t,candidate);
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
