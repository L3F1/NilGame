// Outward binary32 interval arithmetic for a CPU reference execution model.
// Includes ideal inputs and one rounded result per operation. No GPU claim:
// backend reassociation, FTZ and transcendental implementations need admission.
const bytes=new ArrayBuffer(4),f=new Float32Array(bytes),u=new Uint32Array(bytes);
function adjacent(value,up){
  f[0]=value;const x=f[0];
  if(!Number.isFinite(x))throw Error('interval-overflow');
  if(x===0)return up?2**-149:-(2**-149);
  u[0]+=(x>0)===up?1:-1;
  if(!Number.isFinite(f[0]))throw Error('interval-overflow');
  return f[0];
}
export function interval(lo,hi=lo){
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>hi)throw Error('invalid-interval');
  return [adjacent(lo,false),adjacent(hi,true)];
}
export const add=(a,b)=>interval(a[0]+b[0],a[1]+b[1]);
export const sub=(a,b)=>interval(a[0]-b[1],a[1]-b[0]);
export function mul(a,b){const p=[a[0]*b[0],a[0]*b[1],a[1]*b[0],a[1]*b[1]];return interval(Math.min(...p),Math.max(...p));}
export function div(a,b){if(b[0]<=0&&b[1]>=0)throw Error('interval-zero-divisor');return mul(a,interval(1/b[1],1/b[0]));}
export function square(a){return interval(a[0]<=0&&a[1]>=0?0:Math.min(a[0]*a[0],a[1]*a[1]),Math.max(a[0]*a[0],a[1]*a[1]));}
export function sqrt(a){if(a[1]<0)throw Error('interval-negative-root');return interval(Math.sqrt(Math.max(0,a[0])),Math.sqrt(a[1]));}
export const dot=(a,b)=>a.reduce((sum,x,i)=>add(sum,mul(x,b[i])),interval(0));
export const norm=a=>sqrt(a.reduce((sum,x)=>add(sum,square(x)),interval(0)));
export const scale=(a,s)=>a.map(x=>mul(x,s));
export const plus=(a,b)=>a.map((x,i)=>add(x,b[i]));
export const minus=(a,b)=>a.map((x,i)=>sub(x,b[i]));
export const normalize=a=>{const length=norm(a);return a.map(x=>div(x,length));};
export function enclose(values,errors){
  if(!Array.isArray(errors)||errors.length!==values.length||errors.some(x=>!Number.isFinite(x)||x<0))throw Error('missing-input-error');
  return values.map((v,i)=>interval(v-errors[i],v+errors[i]));
}
