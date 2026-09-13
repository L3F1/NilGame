// Conditional binary32 contract, not yet consumed by the live renderer.
// A shared sin/cos pair about ONE reduced argument needs amplitude accuracy,
// not phase accuracy. See docs/engineering/SPHERICAL_CURVE_ERROR.md.
export const CURVE_COMPONENT_ERROR=2**-17;
export const CURVE_DOT_FACTOR=2**-16;
export const CURVE_FTZ_ALLOWANCE=256*2**-126;
export const CURVE_REDUCED_LIMIT=1.575;

// Exact rational arithmetic only for deriving the fixed contract. No rounded
// JS coefficient, transcendental function or GPU agreement supplies the proof.
const Q=(n,d=1n)=>({n:BigInt(n),d:BigInt(d)});
const add=(a,b)=>Q(a.n*b.d+b.n*a.d,a.d*b.d);
const mul=(a,b)=>Q(a.n*b.n,a.d*b.d);
const power=(a,k)=>Q(a.n**BigInt(k),a.d**BigInt(k));
const factorial=n=>{let f=1n;for(let k=2;k<=n;k++)f*=BigInt(k);return f;};
const less=(a,b)=>a.n*b.d<b.n*a.d;
const number=a=>Number(a.n)/Number(a.d);
export function deriveCurveErrorBudget(){
  const x=Q(63,40),gamma32=Q(32,2n**24n-32n),gamma9=Q(9,2n**24n-9n);
  const delta=Q(1,2n**17n),factor=Q(1,2n**16n),one=Q(1);
  const component=odd=>{
    let sum=Q(0);for(let k=odd?1:0;k<=(odd?13:14);k+=2)sum=add(sum,mul(power(x,k),Q(1,factorial(k))));
    const degree=odd?15:16,remainder=mul(power(x,degree),Q(1,factorial(degree)));
    // Very generous absolute FTZ allowance for the short polynomial DAG;
    // remains far below the unused normal-rounding margin.
    const bound=add(add(mul(gamma32,sum),remainder),Q(2n**20n,2n**126n));
    return {holds:less(bound,delta),upper:number(bound)};
  };
  const sine=component(true),cosine=component(false);
  const combined=add(delta,mul(gamma9,add(one,delta)));
  return {sine,cosine,dot:{holds:less(combined,factor),upper:number(combined)},
    componentError:CURVE_COMPONENT_ERROR,dotFactor:CURVE_DOT_FACTOR,
    reducedLimit:CURVE_REDUCED_LIMIT,ftzAllowance:CURVE_FTZ_ALLOWANCE};
}
