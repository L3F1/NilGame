// Exact intersection of a Nil geodesic with an infinite vertical cylinder.
// Half-angle substitution turns the horizontal circle equation into a quadratic
// without subtracting two huge circle radii near horizontal directions.
export function cylinderHit(p,u,column) {
  const x=p[0]-column[0],y=p[1]-column[1],c=u[2];
  const a=u[0]*u[0]+u[1]*u[1],b=x*u[0]+y*u[1],d=x*x+y*y-column[2]**2;
  if(d<=0)return 0;
  if(a<1e-20)return Infinity;
  if(Math.abs(c)<1e-8) {
    const disc=b*b-a*d;
    return disc>=0 && -b-Math.sqrt(disc)>=0 ? (-b-Math.sqrt(disc))/a : Infinity;
  }
  const A=d*c*c+4*(a+c*(-x*u[1]+y*u[0])), B=4*c*b,C=d*c*c;
  const disc=B*B-4*A*C;
  if(disc<0)return Infinity;
  const q=-.5*(B+(B<0?-1:1)*Math.sqrt(disc));
  const roots=Math.abs(A)<1e-20?[-C/B,Infinity]:[q/A,C/q];
  return Math.min(...roots.map(w=>{
    let t=2*Math.atan(w)/c;
    if(t<0)t+=2*Math.PI/Math.abs(c);
    return Number.isNaN(t)?Infinity:t;
  }));
}

export const NIL_CYLINDER_GLSL = `
float nilCylinderHit(vec3 p,vec3 u,vec4 column) {
  vec2 xy=p.xy-column.xy;
  float c=u.z,a=dot(u.xy,u.xy),b=dot(xy,u.xy),d=dot(xy,xy)-column.z*column.z;
  if(d<=0.0)return 0.0;
  if(a<1e-20)return 1e20;
  if(abs(c)<1e-8){float disc=b*b-a*d; if(disc<0.0)return 1e20;
    float t=(-b-sqrt(disc))/a; return t>=0.0?t:1e20;}
  float A=d*c*c+4.0*(a+c*dot(xy,vec2(-u.y,u.x))),B=4.0*c*b,C=d*c*c;
  float disc=B*B-4.0*A*C;
  if(disc<0.0)return 1e20;
  float q=-.5*(B+(B<0.0?-1.0:1.0)*sqrt(disc));
  vec2 roots=abs(A)<1e-20?vec2(-C/B,1e20):vec2(q/A,C/q);
  vec2 times=2.0*atan(roots)/c;
  if(times.x<0.0)times.x+=6.28318530718/abs(c);
  if(times.y<0.0)times.y+=6.28318530718/abs(c);
  return min(times.x,times.y);
}
`;
