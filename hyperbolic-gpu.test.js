import {CONNECTED_FOCAL_SCALE} from './engine/geometry/primary-ray-bounds.js';
// Focused Node checks for the BOUNDED experimental H3 GPU path. No GL context
// exists here: this file checks admission gates, the packed rows, two pieces of
// real metric arithmetic that the shader must respect, and the shader SOURCE's
// explicit dispatch. Compilation and rendering are NOT verified here;
// tools/h3-gpu-probe.html does that on a real GPU with readback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileRegionWorld,compileHyperbolicRegionWorld} from './engine/world/region-world.js';
import {packConnectedWorld,CONNECTED_FRAGMENT} from './engine/geometry/connected-shader.js';
import {H3_GPU_ENVELOPE,H3_REGION_CODE,H3_SURFACE_TYPE,h3BallSurfaceRow,h3LocalFrame,
  validateH3GpuRegion,validateH3GpuPortal} from './engine/geometry/hyperbolic-gpu.js';

const source=JSON.parse(fs.readFileSync('levels/fixtures/connected-h3-cpu.nil.json'));
const world=compileHyperbolicRegionWorld(source);

// ---- default gates stay closed -------------------------------------------
assert.throws(()=>world.renderData(),/H3 region rendering is not implemented/);
assert.throws(()=>packConnectedWorld(world),/H3 region rendering is not implemented/);
assert.throws(()=>compileRegionWorld(source),/does not support h3/);
// E3/S3 packing is untouched by the opt-in flag.
const flat=compileRegionWorld(JSON.parse(fs.readFileSync('levels/fixtures/connected-sight.nil.json')));
assert.deepEqual([...packConnectedWorld(flat).texture],[...packConnectedWorld(flat,{experimentalH3:true}).texture]);

// ---- explicit opt-in packs the H3 region ---------------------------------
const data=packConnectedWorld(world,{experimentalH3:true});
const row=i=>[...data.texture.slice(i*4,i*4+4)];
assert.ok(data.texture.every(Number.isFinite));
const h3Index=data.ids.indexOf('hyperbolic');
assert.deepEqual(row(128+h3Index),[H3_REGION_CODE,8,12,0],'H3 needs its own region code, not the S3 selector');
for(const id of ['flat','return'])assert.equal(row(128+data.ids.indexOf(id))[0],0);
// The landmark ball packs its ambient Lorentz centre and PHYSICAL radius.
const space=world.regions.get('hyperbolic').space,center=space.decode([1,1,0]);
const owner=data.primitiveIds.indexOf('landmark'),primitive=row(96+owner);
assert.deepEqual(primitive.slice(1),[1,h3Index,1],'one additive surface in the H3 region');
const surface=primitive[0],meta=row(2*surface+1);
assert.equal(meta[0],H3_SURFACE_TYPE);
assert.equal(meta[2],.25);
assert.deepEqual([meta[1],meta[3]],[owner,h3Index]);
// float32 storage only; the packed row must still be the decoded hyperboloid point.
row(2*surface).forEach((x,i)=>assert.ok(Math.abs(x-center[i])<1e-6,'H3 surface row must be the decoded centre'));
assert.ok(Math.abs(space.ambientDot(row(2*surface),row(2*surface))+1)<1e-6,'packed centre must stay on the hyperboloid');
// Exactly one group row, additive, with no Boolean mask.
let h3Groups=0;
for(let g=0;g<data.counts[2];g++){const group=row(112+g);if(group[3]!==h3Index)continue;
  h3Groups++;assert.deepEqual(group,[owner,0,0,h3Index]);}
assert.equal(h3Groups,1);
// Independent hyperbolic right-triangle identity, visibly different from E3:
// the packed centres belong to a curved chart, not a flat or spherical one.
const mirror=space.decode([1,-1,0]),separation=space.distance(center,mirror);
assert.ok(Math.abs(separation-8*Math.acosh(Math.cosh(Math.SQRT2/8)**2))<1e-9);
assert.ok(separation-2>1e-3,'hyperbolic separation must exceed the flat chord');

// ---- envelope refusals happen before any GL state ------------------------
const variant=patch=>{const next=structuredClone(source);patch(next);return next;};
const pack=doc=>packConnectedWorld(compileHyperbolicRegionWorld(doc),{experimentalH3:true});
assert.throws(()=>pack(variant(d=>{d.regions[1].geometry.curvatureRadius=4;d.regions[1].extent=8;})),/curvature radius 8/);
assert.throws(()=>pack(variant(d=>{d.regions[1].extent=13;})),/extent at most 12/);
assert.throws(()=>pack(variant(d=>{d.entities.find(e=>e.id==='landmark').radius=.2;})),/ball radius must be 0.25..1/);
assert.throws(()=>pack(variant(d=>{const b=d.entities.find(e=>e.id==='landmark');
  b.radius=1.5;b.position=[3,3,0];})),/ball radius must be 0.25..1/);
assert.throws(()=>pack(variant(d=>{for(const e of d.entities)if(e.kind==='anchor')e.radius=.3;})),/aperture radius must be 0.35..1/);
assert.throws(()=>pack(variant(d=>{for(const e of d.entities)if(e.kind==='anchor')e.radius=1.2;})),/aperture radius must be 0.35..1/);
assert.throws(()=>validateH3GpuRegion({kind:'h3',curvatureRadius:8,extent:12,coverage:'s3-cover'}),/global cover/);
assert.throws(()=>validateH3GpuPortal({radius:.34}),/aperture radius/);
assert.throws(()=>h3BallSurfaceRow({kind:'ball',radius:.5,center:[0,0,0]}),/ambient 4-vector/);
assert.throws(()=>h3BallSurfaceRow({kind:'ball',op:'subtract',radius:.5,center:[0,0,0,1]}),/additive balls only/);
assert.deepEqual(H3_GPU_ENVELOPE.ballRadius,[.25,1]);

// ---- finding 1: an ambient normalize is measurably the wrong unitization --
// Real arithmetic from the CPU adapter, not a shader transcription. At radial
// distance R a radial unit tangent has ambient Euclidean norm sqrt(cosh 2)
// ~= 1.9416, so `normalize()` in pixelRay produced a ray of roughly HALF the
// physical speed. The shader must unitize with the metric instead.
const R=space.curvatureRadius,origin=space.decode([0,0,0]);
const far=space.decode([R,0,0]),basis=space.frame(far);
const euclid=v=>Math.hypot(...v);
const negate=v=>v.map(x=>-x);
for(const tangent of basis)
  assert.ok(Math.abs(space.norm(far,tangent)-1)<1e-9,'construction frame is metric-orthonormal');
const radialTangent=space.normalize(far,negate(space.logAt(far,origin)));
assert.ok(Math.abs(space.norm(far,radialTangent)-1)<1e-12);
assert.ok(Math.abs(euclid(radialTangent)-Math.sqrt(Math.cosh(2)))<1e-6,
  'radial unit tangent at distance R must have ambient norm sqrt(cosh 2), not 1');
// A camera basis vector, and an oblique pixel combination of two of them, are
// mis-scaled by an ambient normalize in the same way.
assert.ok(basis.some(v=>euclid(v)>1.5),'some camera axis is far from ambient unit length');
const oblique=basis[0].map((x,i)=>x*.6+basis[1][i]*.8);
assert.ok(Math.abs(space.norm(far,oblique)-1)<1e-9);
assert.ok(Math.abs(euclid(oblique)-1)>.2,'oblique camera rays are mis-scaled by normalize() too');

// ---- finding 3: the bounded local-frame normal encoding ------------------
// h3LocalFrame is the encoding the shader writes for debug normals. Its
// Euclidean length IS the metric norm, so a unit normal always fits [-1,1];
// the ambient components do not, which is exactly the RGBA8 clipping reported.
const hit=space.step(far,basis[1],.4),outward=space.normalize(hit,negate(space.logAt(hit,origin)));
assert.ok(Math.abs(space.norm(hit,outward)-1)<1e-9);
const encoded=h3LocalFrame(hit,outward);
assert.ok(Math.abs(euclid(encoded)-space.norm(hit,outward))<1e-9,
  'local-frame encoding must preserve the metric norm exactly');
assert.ok(encoded.every(x=>Math.abs(x)<=1+1e-12),'encoded components must fit the RGBA8 range');
assert.ok(outward.some(x=>Math.abs(x)>1),'the ambient normal does NOT fit that range: n*.5+.5 clips');
assert.throws(()=>h3LocalFrame([0,0,0,1],[1,0,0]),/ambient 4-vector/);

// ---- the shader dispatches H3 explicitly ---------------------------------
// H3 must never be the spherical else branch: every geometry-dependent
// operation has to name its own hyperbolic implementation.
for(const op of ['h3At','h3Direction','h3Transport','h3Distance','h3Log','h3Exp',
  'h3Boundary','h3BallSpan','h3ApertureEntry','h3Unit','h3Pair','h3Local'])
  assert.ok(CONNECTED_FRAGMENT.includes(op+'('),`shader must call ${op}`);
for(const dispatch of ['isH3(r)?h3At','isH3(r)?h3Direction','isH3(r)?h3Transport',
  'isH3(r)?h3Distance','tdot(radial','h3Radial(p,r.y)'])
  assert.ok(CONNECTED_FRAGMENT.includes(dispatch),`missing explicit dispatch: ${dispatch}`);
// A hit must report the hyperbolic outward normal, not the Euclidean difference.
assert.ok(/normal=m\.x>1\.5\?h3Unit\(q,-h3Log\(q,n,r\.y\)\)/.test(CONNECTED_FRAGMENT));
// An H3 start inside a solid refuses, as the CPU adapter does.
assert.ok(CONNECTED_FRAGMENT.includes('start==1&&(r.w>.5||isH3(r))'));

// Finding 1: pixelRay unitizes in the region metric, and the ambient normalize
// of the camera combination is gone.
assert.ok(CONNECTED_FRAGMENT.includes(`return unitize(uPosition,uForward*${CONNECTED_FOCAL_SCALE.toPrecision(17)}+uRight*uv.x+uUp*uv.y,D(128+uRegion))`),
  'pixelRay must unitize with the region metric');
const pixelBody=CONNECTED_FRAGMENT.slice(CONNECTED_FRAGMENT.indexOf('vec4 pixelRay('),CONNECTED_FRAGMENT.indexOf('vec3 displayColor('));
assert.ok(!/return normalize\(/.test(pixelBody),'no ambient normalize left in pixelRay');

// Finding 2: BOTH ball boundaries reach the shared sweep, so its halfway
// occupancy sample cannot land beyond an exit the ray already passed.
assert.ok(CONNECTED_FRAGMENT.includes('root(enterBand.y,i,end)')&&CONNECTED_FRAGMENT.includes('root(exitBand.y,i,end)'),
  'H3 solve must insert the entry AND the exit root');
assert.ok(/int h3BallSpan\(vec4 p,vec4 u,vec4 center,float radius,float R,out vec3 enterBand,out vec3 exitBand\)/
  .test(CONNECTED_FRAGMENT),'the span solver must return both boundary bands');
// No GLSL reserved or future-reserved identifier in the new declarations.
for(const reserved of ['entry','exit','half','input','output','sample','filter','partition'])
  assert.ok(!new RegExp(`(?:float|int|vec[234]|bool)\\s+${reserved}\\b`).test(CONNECTED_FRAGMENT),
    `${reserved} must not be declared as a GLSL identifier`);
assert.ok(!CONNECTED_FRAGMENT.includes('h3BallEntry'),'the entry-only primitive must be gone');
// The sweep is genuinely shared with E3/S3, not a private H3 copy.
assert.equal(CONNECTED_FRAGMENT.split(/int sweep\(/).length-1,1,'exactly one occupancy sweep');
assert.ok(CONNECTED_FRAGMENT.split('=sweep(').length-1>=3,'both geometries and the H3 re-query use it');

// Finding 3: the debug normal packet uses the bounded encoding for H3.
assert.ok(/frag=isH3\(hr\)\?vec4\(h3Local\(hitPoint,n\)\*\.5\+\.5,1\):n\*\.5\+\.5/.test(CONNECTED_FRAGMENT),
  'debug normals must use the bounded local frame for H3');

// Finding 4: CPU foreground-bounded aperture ordering, and NO perturbed-root
// relaxation. The field is swept first; every H3 aperture refusal vetoes the
// whole ray, because queryHyperbolicAperture exports uncertaintyFrom:0.
const foreground=CONNECTED_FRAGMENT.indexOf('int fg=sweep(');
const apertureQuery=CONNECTED_FRAGMENT.indexOf('h3ApertureEntry(p,u,n,r.y)');
assert.ok(foreground>0&&apertureQuery>foreground,'solids must be swept before H3 apertures are asked');
assert.ok(!/(portalUncertain|uncertainAt)=min\([^)]*,max\(0\.,ap\./.test(CONNECTED_FRAGMENT),
  'an H3 aperture refusal may not be downgraded to an earliest-possible-root event');
assert.equal(CONNECTED_FRAGMENT.split('ap.x>1.5').length-1,1);
for(const guard of ['bool domainInside=edge<=horizon+E','if(ap.w>=horizon-E)return vec4(2,region,-1,traveled)',
  'if(abs(info.z-radial)<=rim)return vec4(2,region,-1,traveled)','g!=reverse'])
  assert.ok(CONNECTED_FRAGMENT.includes(guard),`missing H3 aperture guard: ${guard}`);
// E3/S3 keep their own certified-prefix policy; that producer does export one.
assert.ok(CONNECTED_FRAGMENT.includes('found=sweep(p,u,r,region,end,portalUncertain,hitAt,hitOwner,hitSurface)'));

// Balanced braces, so the appended branches did not truncate a function.
const balance=(text,open,close)=>[...text].reduce((n,c)=>n+(c===open?1:c===close?-1:0),0);
assert.equal(balance(CONNECTED_FRAGMENT,'{','}'),0);
assert.equal(balance(CONNECTED_FRAGMENT,'(',')'),0);

console.log('hyperbolic GPU: default refusal, opt-in packing, envelope gates, metric unitization and bounded normal encoding, foreground-bounded aperture order and explicit shader dispatch passed (no GL here)');
