// Two couplings an authoring marker has with code in other modules, neither of
// which any browser check can see go wrong.
//
// `app/region-lab.js` places a marker badge at the pixel whose ray points at
// the entity, by inverting two lines of `REGION_S3_GLSL`:
//
//     vec2 uv  = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
//     vec4 dir = normalize(uFwd * uFocal + uRight * uv.x + uUp * uv.y);
//
// That inverse is checked end to end in the browser -- the pixel is rebuilt
// into a direction and must equal the one projected, to 1e-12. What the
// browser cannot tell you is whether the SHADER still does what the inverse
// assumes. Change `uRes.y` to `uRes.x` in the GLSL and every existing check
// still passes: the picture changes shape, the marker follows the projection,
// the projection follows the old convention, and the badge drifts off the
// thing it names with nothing failing anywhere.
//
// So this file pins the convention itself. It is a source check on purpose,
// and it is the only kind of check that can see this particular drift. The
// marker code lives in a page module that cannot be imported into Node -- it
// touches `document` at load -- so the inverse is restated here and both
// halves are exercised against each other numerically as well.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGION_S3_GLSL } from './engine/geometry/region-shader.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}

const lab = readFileSync('app/region-lab.js', 'utf8');

test('the shader still turns a pixel into a ray the way the marker assumes', () => {
  // Whitespace-insensitive, value-sensitive. `uRes.y` in BOTH terms of the uv
  // line is the aspect convention; `uFocal` multiplying forward, and uv.x/uv.y
  // multiplying right/up, is the basis convention.
  const squashed = REGION_S3_GLSL.replace(/\s+/g, '');
  assert.ok(squashed.includes('vec2uv=(2.0*gl_FragCoord.xy-uRes)/uRes.y;'),
    'the uv line changed; app/region-lab.js projectMarker inverts the old one');
  assert.ok(squashed.includes('vec4dir=normalize(uFwd*uFocal+uRight*uv.x+uUp*uv.y);'),
    'the ray line changed; app/region-lab.js projectMarker inverts the old one');
});

test('and the marker code still inverts that exact pair', () => {
  // If either of these disappears the pin above is guarding nothing, which is
  // the failure mode of a source check nobody re-read.
  const squashed = lab.replace(/\s+/g, '');
  assert.ok(squashed.includes('constpx=(x*canvas.height+canvas.width)/2;'),
    'the horizontal inverse moved or changed its aspect term');
  assert.ok(squashed.includes('constpy=(y*canvas.height+canvas.height)/2;'),
    'the vertical inverse moved or changed its aspect term');
  assert.ok(squashed.includes('top:1-py/canvas.height'),
    'gl_FragCoord counts up from the bottom and CSS counts down; that flip is load-bearing');
  assert.ok(/constscale=1\/Math\.tan\(focal\/2\)/.test(squashed),
    'uFocal is 1/tan(fov/2) in region-renderer.js and the inverse must use the same');
});

test('the pair round-trips for every pixel, not just the middle one', () => {
  // The algebra, on its own, with both directions written out as the two
  // modules write them. A sign or an aspect error shows up at the corners long
  // before it shows up at the centre, which is where a screenshot gets looked at.
  const W = 604, H = 505, focal = 1 / Math.tan((75 * Math.PI / 180) / 2);
  let worst = 0;
  for (let fx = 0.5; fx < W; fx += 37) {
    for (let fy = 0.5; fy < H; fy += 31) {
      // Forward, exactly as the GLSL: pixel -> uv -> direction components.
      const uvx = (2 * fx - W) / H, uvy = (2 * fy - H) / H;
      const f = focal, r = uvx, u = uvy;          // dir = f*fwd + r*right + u*up
      // Inverse, exactly as `projectMarker`: components -> pixel.
      const x = focal * r / f, y = focal * u / f;
      const px = (x * H + W) / 2, py = (y * H + H) / 2;
      worst = Math.max(worst, Math.abs(px - fx), Math.abs(py - fy));
    }
  }
  assert.ok(worst < 1e-9, `worst pixel round trip ${worst}`);
  console.log(`  pixel round trip over ${Math.ceil(W / 37) * Math.ceil(H / 31)} pixels: worst ${worst.toExponential(2)}`);
});

test('a marker is never a scene primitive, in the code as well as in the picture', () => {
  // `packRegionScene` builds from `renderData`, and `renderData` emits only
  // solids. If a spawn or an objective ever became a primitive it would spend
  // fragment uniforms that NEXT_CAPABILITIES section 4 reserves for geometry,
  // and the marker overlay would be drawing something twice.
  const shader = readFileSync('engine/geometry/region-shader.js', 'utf8');
  for (const kind of ['spawn', 'objective']) {
    assert.ok(!shader.includes(`'${kind}'`), `region-shader.js must not know about ${kind}`);
  }
  assert.ok(lab.includes("const MARKER_KINDS = ['spawn', 'objective'];"),
    'the overlay names the kinds it is responsible for');
});

// --- the visibility query's two unwatchable invariants -------------------
//
// The three-state query is checked hard in the browser: a thin occluder at the
// eye, a tiny positive bound, two flavours of exhaustion, a certified interior
// sample, and that an uncertain marker is styled and labelled as uncertain.
// Two properties survive every mutation of those checks, and both are pinned
// here instead, with the reason each is unfalsifiable at the page.

test('the march advances by the bound it sampled, never by a floor', () => {
  // WHY THIS IS NOT A BROWSER CHECK. An advance longer than the sampled bound
  // is no longer a radius proved free, so CLEAR stops being certified -- the
  // march could jump a solid thinner than the overshoot. Replacing
  // `travelled += here.gap` with `Math.max(here.gap, 1e-3)` changes NOTHING
  // observable, because the stall probes reach 4 to 256 skins ahead (up to
  // 2.56e-2) and that range strictly contains the 9e-4 an overshoot could
  // hide. Slabs of 4e-4, 6e-4, 1.2e-3, 3e-3 and 2.4e-2 were all reported
  // occluded by both versions. The probes mask it; the invariant is still the
  // thing that licenses the word "clear", so it is pinned rather than assumed.
  assert.ok(lab.replace(/\s+/g, '').includes('travelled+=here.gap;'),
    'the safe advance changed shape; CLEAR is only certified by advancing by the bound');
  assert.ok(!/travelled \+= Math\.max/.test(lab),
    'a floored advance is longer than the radius that was proved free');
});

test('occlusion is certified by a contract the field still declares', () => {
  // The ONLY thing that turns a negative sample into "behind geometry" is
  // `interior: 'sign-with-conservative-magnitude'` -- the sign is promised
  // inside a solid, the magnitude is not. The query reads that capability at
  // runtime and falls back to unknown without it, which is correct and
  // currently unreachable: no field in the tree declares anything else, so
  // hardcoding `true` passes every browser check. Pinning the declaration is
  // what makes the fallback mean something: change the contract and this
  // fails, pointing at the marker code that depends on it.
  const compiled = readFileSync('engine/world/region-world.js', 'utf8');
  assert.ok(/interior:\s*'sign-with-conservative-magnitude'/.test(compiled),
    'the interior sign contract changed; markerVisibility certifies occlusion from it');
  assert.ok(lab.includes("String(field.capabilities?.interior ?? '').startsWith('sign')"),
    'the query must READ that contract rather than assume it');
  // And a positive bound must never be a certificate, whatever its size.
  assert.ok(!/here\.gap <= MARKER_SKIN\)\s*\{\s*return \{ state: 'occluded'/.test(lab),
    'a small positive bound is a failure to prove clearance, not a proof of solid');
});

console.log(`marker projection: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
