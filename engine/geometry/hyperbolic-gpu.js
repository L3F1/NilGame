// Bounded experimental H3 support for the EXISTING connected GPU path: envelope
// admission, row encoding and the geometry-level GLSL block. This is not a new
// renderer, host or plugin system; connected-shader.js composes the block and
// connected-renderer.js keeps owning GL state.
//
// The CPU adapters are the semantics of record. hyperbolic-space.js supplies the
// metric operations, hyperbolic-balls.js the entry root and its guard bands, and
// hyperbolic-aperture.js the entering-crossing policy. Every formula below is
// the float32 transcription of those, with the SAME refusal structure: an
// uncertain root, an inside/on-surface start, a rim or range ambiguity and a
// domain exit are distinct answers, and none of them is a miss or a sky.
//
// Guard bands here are heuristic float32 refusals, not interval proofs, and are
// deliberately wider than the double-precision CPU bands. The GPU may therefore
// refuse where the CPU answers; it must never answer where the CPU refuses.

// Starting trial envelope only (THREE_GEOMETRY_MILESTONE.md). Not an established
// float32 accuracy bound: broaden it with measurements, not with hope.
export const H3_GPU_ENVELOPE = Object.freeze({
  curvatureRadius: 8, maxExtent: 12,
  ballRadius: Object.freeze([.25, 1]), apertureRadius: Object.freeze([.35, 1]),
});
// Region row selector (region kind) and surface row type code.
export const H3_REGION_CODE = 2;
export const H3_SURFACE_TYPE = 2;
// float32 machine epsilon and the coefficient-band multiplier, shared with GLSL.
export const H3_FLOAT32_EPSILON = 1.1920928955078125e-7;
export const H3_COEFFICIENT_TERMS = 128;

const inRange = (x, [lo, hi]) => Number.isFinite(x) && x >= lo && x <= hi;

// Refuse the whole world BEFORE any live GL state is touched, exactly like the
// existing E3/S3 capacity refusals.
export function validateH3GpuRegion(region) {
  if (region.kind !== 'h3') throw Error('Expected an H3 region descriptor');
  if (region.coverage === 's3-cover') throw Error('H3 GPU has no global cover mode');
  if (region.curvatureRadius !== H3_GPU_ENVELOPE.curvatureRadius)
    throw Error(`Experimental H3 GPU requires curvature radius ${H3_GPU_ENVELOPE.curvatureRadius}`);
  if (!(region.extent > 0) || region.extent > H3_GPU_ENVELOPE.maxExtent)
    throw Error(`Experimental H3 GPU requires extent at most ${H3_GPU_ENVELOPE.maxExtent}`);
  return region;
}
export function validateH3GpuPrimitive(primitive) {
  if (primitive.kind !== 'ball' || (primitive.op && primitive.op !== 'add'))
    throw Error('Experimental H3 GPU supports additive balls only');
  if (!inRange(primitive.radius, H3_GPU_ENVELOPE.ballRadius))
    throw Error(`Experimental H3 GPU ball radius must be ${H3_GPU_ENVELOPE.ballRadius.join('..')}`);
  return primitive;
}
export function validateH3GpuPortal(portal) {
  if (!inRange(portal.radius, H3_GPU_ENVELOPE.apertureRadius))
    throw Error(`Experimental H3 GPU aperture radius must be ${H3_GPU_ENVELOPE.apertureRadius.join('..')}`);
  return portal;
}
// One ball becomes one surface row: the ambient centre and its PHYSICAL radius.
// The shader reads the signed physical metric distance, matching the CPU sample;
// cosh(radius/R) is formed at solve time so the row stays geometry-independent.
export function h3BallSurfaceRow(primitive) {
  validateH3GpuPrimitive(primitive);
  const center = primitive.center;
  if (!Array.isArray(center) || center.length !== 4 || !center.every(Number.isFinite))
    throw Error('H3 ball centre must be an ambient 4-vector');
  return { n: center.slice(), coefficient: primitive.radius, type: H3_SURFACE_TYPE };
}

// The bounded debug encoding for an H3 tangent, shared with the GLSL h3Local
// below and with tools/h3-gpu-probe.js. It is the inverse radial boost to the
// chart origin: an orthonormal-frame coordinate whose Euclidean length equals
// the tangent's metric norm at p (hyperbolic-space.js local()). Ambient
// components of a unit H3 tangent grow with radius and do NOT fit an RGBA8
// n*.5+.5 packing; these three do, exactly, for every unit tangent.
export function h3LocalFrame(point, tangent) {
  if (!Array.isArray(point) || point.length !== 4 || !Array.isArray(tangent) || tangent.length !== 4)
    throw Error('h3LocalFrame needs ambient 4-vectors');
  return [0, 1, 2].map(i => tangent[i] - point[i] * tangent[3] / (1 + point[3]));
}

// ---------------------------------------------------------------- GLSL block
//
// Geometry-level operations only: metric pairing, point/tangent pairing,
// advancement, transport, domain boundary, sphere intersection/normal and
// aperture entry. The connected shader dispatches to these explicitly; there is
// no H3-as-S3 else branch anywhere in that dispatch.
//
// `E` is the host shader's bounded float32 refusal band; this block never
// invents a second one.
export const H3_GEOMETRY_GLSL = `
// Lorentz signature (+,+,+,-); points satisfy <p,p>=-1 with w>0, tangents
// satisfy <p,v>=0 and carry the induced POSITIVE definite metric <v,v>.
const float H3_EPS=${H3_FLOAT32_EPSILON};
const float H3_TERMS=${H3_COEFFICIENT_TERMS}.;
float h3Pair(vec4 a,vec4 b){return dot(a.xyz,b.xyz)-a.w*b.w;}
// Recover the time coordinate instead of trusting an advanced w component.
vec4 h3Lift(vec4 q){return vec4(q.xyz,sqrt(1.+dot(q.xyz,q.xyz)));}
vec4 h3Tangent(vec4 p,vec4 v){return v+h3Pair(p,v)*p;}
// Inverse radial boost to the origin: a short tangent is measured without
// subtracting large squared ambient components (hyperbolic-space.js local()).
// This is also the BOUNDED orthonormal-frame coordinate used for debug readback:
// for a metric-unit tangent every component lies in [-1,1] at any radius, which
// the ambient components do not.
vec3 h3Local(vec4 p,vec4 v){return v.xyz-p.xyz*v.w/(1.+p.w);}
float h3Norm(vec4 p,vec4 v){return length(h3Local(p,v));}
// Project onto the tangent space BEFORE unitizing: an ambient combination of
// tangent basis vectors is only tangent up to float32 rounding, and a Euclidean
// normalize would divide by the wrong length entirely.
vec4 h3Unit(vec4 p,vec4 v){vec4 t=h3Tangent(p,v);float n=h3Norm(p,t);return n<E?vec4(0):t/n;}
vec4 h3At(vec4 p,vec4 u,float t,float R){float x=t/R;return h3Lift(p*cosh(x)+u*sinh(x));}
vec4 h3Direction(vec4 p,vec4 u,float t,float R){float x=t/R;return p*sinh(x)+u*cosh(x);}
// Rationalized spacelike chord: differencing two rounded time coordinates can
// exceed the chord for nearly coincident points and lose the distance entirely.
float h3Distance(vec4 a,vec4 b,float R){
  vec3 delta=a.xyz-b.xyz;float s=length(delta);
  float t=abs(dot(delta,a.xyz+b.xyz))/(a.w+b.w);
  if(t>=s)return 0.;
  return 2.*R*asinh(sqrt((s-t)*(s+t))*.5);
}
vec4 h3Transport(vec4 a,vec4 b,vec4 v){
  float d=1.-h3Pair(a,b);if(abs(d)<E)return h3Tangent(b,v);
  return h3Tangent(b,v+h3Pair(b,v)/d*(a+b));
}
vec4 h3Log(vec4 a,vec4 b,float R){
  float d=h3Distance(a,b,R);if(d<E)return vec4(0);
  vec4 t=h3Tangent(a,b-a);float n=h3Norm(a,t);if(n<E)return vec4(0);
  return t*(d/n);
}
vec4 h3Exp(vec4 p,vec4 v,float R){float n=h3Norm(p,v);return n<E?p:h3At(p,v/n,n,R);}
float h3Radial(vec4 p,float R){return R*asinh(length(p.xyz));}
// Chart exit: p.w cosh(t/R)+u.w sinh(t/R)=cosh(extent/R), solved in tanh(t/2R)
// so the cosh difference does not cancel near the boundary. A non-exiting ray
// reports a large sentinel, never a silent zero.
float h3Boundary(vec4 p,vec4 u,float R,float extent){
  float a=p.w,b=u.w,e=extent/R,rho=asinh(length(p.xyz));
  float gap=2.*sinh((e+rho)*.5)*sinh((e-rho)*.5);
  if(gap<=0.)return 0.;
  float root=sqrt(b*b+gap*(cosh(e)+a));
  float z=b>=0.?gap/(root+b):(root-b)/(a+cosh(e));
  if(z>=1.)return 1e20;
  return 2.*R*atanh(z);
}
// BOTH boundary roots of A cosh(t/R)+B sinh(t/R)=cosh(radius/R) for an additive
// ball, transcribing castHyperbolicBalls and then extending it with the far
// root. The extension is not cosmetic: the shared occupancy sweep samples
// halfway between consecutive events, so an entry-only primitive makes it sample
// OUTSIDE a ball the ray has already left and emit no hit at all.
// Return value is a CODE:
//   0 no event on this ray, 1 definite entry and exit, 2 uncertain band,
//   3 refuse ray (inside/on-surface start, or conditioning lost)
// enterBand and exitBand each carry (earliest possible, root, latest possible).
int h3BallSpan(vec4 p,vec4 u,vec4 center,float radius,float R,out vec3 enterBand,out vec3 exitBand){
  enterBand=vec3(0);exitBand=vec3(0);
  // Inverse boost the centre to the ray origin. Work with spatial quantities:
  // cosh(radius/R) and the closest cosh distance are both almost 1 for small
  // balls; subtracting their squares amplifies rounding and refusal bands.
  float boost=dot(p.xyz,center.xyz)/(1.+p.w)-center.w;
  vec3 c=center.xyz+p.xyz*boost,v=normalize(h3Local(p,u));
  float z=dot(c,v),b=length(c-z*v),rho=sinh(radius/R),H=sqrt(1.+b*b);
  // Operation-scale float32 envelopes, not a formal interval certificate.
  // The multiplier is unchanged. E is a physical ray tolerance, not an error
  // on an almost-unit cosh coefficient. Apply it after conversion to length.
  float dc=H3_TERMS*H3_EPS*(1.+length(center.xyz)+length(p.xyz)*(abs(center.w)+abs(dot(p.xyz,center.xyz))/(1.+p.w)));
  dc*=1.+length(c); // direction projection and spatial norm rounding
  float dr=H3_TERMS*H3_EPS*(1.+rho);
  if(R*asinh(length(c))<=radius+R*dc+4.*E)return 3;
  if(z< -dc)return 0;
  if(b>rho+dc+dr)return 0;
  float low=max(0.,b-dc),high=b+dc;
  float wide=asinh(sqrt(max(0.,(rho+dr)*(rho+dr)-low*low))/sqrt(1.+low*low));
  float narrow=asinh(sqrt(max(0.,max(0.,rho-dr)*max(0.,rho-dr)-high*high))/sqrt(1.+high*high));
  float closest=asinh(z/H),dt=4.*dc*(1.+abs(z))+H3_TERMS*H3_EPS;
  if(b>=rho-dc-dr||z<=dc){float band=max(0.,(closest-dt-wide)*R);enterBand=vec3(band,band,band);return 2;}
  float mid=asinh(sqrt(max(0.,(rho-b)*(rho+b)))/H),t0=(closest-mid)*R;
  if(t0<0.)return 3;
  enterBand=vec3(max(0.,(closest-dt-wide)*R),t0,(closest+dt-narrow)*R);
  exitBand=vec3((closest-dt+narrow)*R,(closest+mid)*R,(closest+dt+wide)*R);
  return 1;
}
// Entering aperture crossing, transcribing queryHyperbolicAperture: the signed
// height <gamma(t),n> = A cosh(t/R)+B sinh(t/R) must go positive to negative.
// Result x is a CODE: 0 no entering crossing, 1 root, 2 uncertain from y.
// y earliest possible crossing, z root, w latest possible crossing.
vec4 h3ApertureEntry(vec4 p,vec4 u,vec4 n,float R){
  float A=h3Pair(p,n),B=h3Pair(u,n);
  float eps=max(4.*E,H3_TERMS*H3_EPS*(1.+abs(A)+abs(B)));
  // B>|A|: the derivative A sinh+B cosh stays positive, so no future entering
  // crossing exists even from the plane. This admits a destination's outward
  // offset without suppressing the reverse aperture.
  if(B>abs(A)+eps)return vec4(0);
  if(abs(A)<=eps)return vec4(2,0,0,0);     // ambiguous on-plane start
  if(A<0.)return vec4(0);                  // a back-side start cannot enter later
  if(B>-A+eps)return vec4(0);
  float lo=R*atanh(clamp((A-eps)/max(E,-B+eps),0.,1.-H3_EPS));
  if(B>=-A-eps)return vec4(2,lo,0,0);      // asymptotic approach to the plane
  float upper=(A+eps)/max(E,-B-eps);
  float hi=upper<1.?R*atanh(upper):1e20;
  return vec4(1,lo,R*atanh(-A/B),hi);
}
`;
