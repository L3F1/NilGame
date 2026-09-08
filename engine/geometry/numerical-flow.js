// Shared RK4 reference for coordinate position plus orthonormal-frame velocity.
export function integrate(rhs, p, v, t, step = 0.01) {
  if (p.length !== 3 || v.length !== 3 || ![...p,...v,t,step].every(Number.isFinite) || step <= 0)
    throw new Error('Expected finite 3-vectors, time and positive step');
  const n = Math.max(1,Math.ceil(Math.abs(t)/step));
  if (n > 100000) throw new Error('Integration budget exceeded');
  const h=t/n;
  let s=[...p,...v];
  const add=(a,b,k)=>a.map((x,i)=>x+k*b[i]);
  for(let j=0;j<n;j++) {
    const a=rhs(s), b=rhs(add(s,a,h/2)), c=rhs(add(s,b,h/2)), d=rhs(add(s,c,h));
    s=s.map((x,i)=>x+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
    if(!s.every(Number.isFinite)) throw new Error('Integration left numerical range');
  }
  return [s.slice(0,3),s.slice(3)];
}
