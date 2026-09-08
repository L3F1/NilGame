// Generate the native rendering experiment from the browser's shader/data.
// Generated shader text is never hand-edited. No new renderer implementation.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fragFor } from '../shader.js';
import { geometry } from '../geom.js';
import { placeAt, setSolid, SOLID, reduceToDomain, OCT_SIDE, OCT_R, DOD_DIRS, DOD_R } from '../hyp.js';

const output = new URL('../experiments/godot/generated/', import.meta.url);
mkdirSync(output, { recursive: true });
for (const key of ['h3', 's3']) {
  let code = fragFor(key)
    .replace(/^#version .*\n/, '')
    .replace(/^precision .*;\s*$/gm, '')
    .replace(/^out vec4 fragColor;\s*$/gm, '')
    // Helper functions cannot access Godot fragment-stage built-ins. For a
    // positive resolution this is still exactly zero and remains a uniform.
    .replaceAll('min(gl_FragCoord.x, 0.0)', 'min(uRes.x, 0.0)')
    .replaceAll('gl_FragCoord.xy', '(vec2(UV.x, 1.0 - UV.y) * uRes)')
    .replace('void main()', 'void fragment()')
    .replaceAll('fragColor =', 'COLOR =');
  // Godot accepts column vectors, but not GLSL's N*N scalar constructors.
  code = code.replace(/mat([234])\(([^()]+)\)/g, (full, size, args) => {
    const n = Number(size), values = args.split(',');
    if (values.length !== n * n) return full;
    return `mat${n}(${Array.from({ length: n }, (_, col) =>
      `vec${n}(${values.slice(col * n, (col + 1) * n).join(',')})`).join(', ')})`;
  });
  code = 'shader_type canvas_item;\nrender_mode unshaded, blend_disabled;\n' + code;
  if (/gl_FragCoord|void main\(|out vec4 fragColor/.test(code.replace(/\/\/[^\n]*/g, ''))) {
    throw new Error('Untranslated GLSL built-in');
  }
  writeFileSync(new URL(`${key}.gdshader`, output), code);
}
const H = geometry(-1), S = geometry(1);
setSolid(SOLID.OCTAGON);
const theta = Math.atan2(OCT_SIDE[0][1], OCT_SIDE[0][0]);
const floorPose = (r) => placeAt(Math.cos(theta) * r, Math.sin(theta) * r, 0.3);
const floorAfter = reduceToDomain(floorPose(OCT_R + 0.04));
setSolid(SOLID.DODECAHEDRON);
const openAfter = reduceToDomain(H.translation(DOD_DIRS[0].map((n) => n * (DOD_R + 0.04))));
setSolid(SOLID.OCTAGON);
const common = {
  uRes: [640, 360], uYaw: 0, uPitch: 0, uRoll: 0, uSteps: 220,
  uTime: -1, uRace: 0, uFog: 0.16, uMaxT: 12, uOpen: 0,
  uZoom: 1, uEdges: 1, uSolid: 0, uSelfR: 0, uSuper: 0,
  uLightC: 0, uAO: 1, uFoeHurt: 0, uMarkN: 0, uCutN: 0,
  uPortalOn: 0, uPortalR: 0.2, uCutR: 0.1, uCutT: 0.02,
  uHistDt: 0.2, uSelfLip: 1,
};
const view = (id, geometry, M, extra = {}, folds = 0) => ({
  id, geometry, folds, uniforms: { ...common, uPlayer: M, ...extra },
});
const fixture = {
  format: 'nil-render-fixture', version: 1, width: 640, height: 360,
  views: [
    view('floor-start', 'h3', placeAt(0, 0, 0.3)),
    view('floor-before-seam', 'h3', floorPose(OCT_R - 0.04)),
    view('floor-after-seam', 'h3', floorAfter[0], {}, floorAfter[2]),
    view('open-start', 'h3', H.IDENTITY, { uOpen: 1, uSolid: 1, uEdges: 0 }),
    view('open-after-seam', 'h3', openAfter[0], { uOpen: 1, uSolid: 1, uEdges: 0 }, openAfter[2]),
    view('sphere-start', 's3', S.IDENTITY, { uEdges: 0 }),
    // DIAGNOSTIC PAIR: the same two H3 viewpoints with ambient occlusion off.
    // Every H3 view disagreed with the browser by a small amount that was
    // always POSITIVE -- Godot brighter, never darker, on every pixel -- while
    // S3 matched bit for bit across 106540 background pixels. A signed bias is
    // a shading difference, not a geometry one, and `ambient` is the only term
    // that is compiled differently in the two programs: its sample-dropping
    // guard sits under #if HAS_QUOTIENT, which is 1 only for H3. Turning it off
    // separates "the marcher disagrees" from "the occlusion term disagrees".
    view('floor-start-noao', 'h3', placeAt(0, 0, 0.3), { uAO: 0 }),
    view('open-start-noao', 'h3', H.IDENTITY, { uOpen: 1, uSolid: 1, uEdges: 0, uAO: 0 }),
    // SPLIT THE REMAINING DIFFERENCE IN TWO. Everything downstream of the
    // marcher is either a function of the hit DISTANCE (the two fog terms) or
    // of the surface SHADING (material, normal, key and headlight). These two
    // views turn each off in turn, so whichever still disagrees is the half
    // that owns the bug.
    //   nofog  -- ext becomes exactly 1 and the distance drops out, leaving
    //             material and lighting alone.
    //   fogged -- fog swamps everything, so the image is very nearly a pure
    //             picture of exp(-hit), and disagreement means `hit` differs.
    view('floor-start-nofog', 'h3', placeAt(0, 0, 0.3), { uAO: 0, uFog: 0 }),
    view('floor-start-fogged', 'h3', placeAt(0, 0, 0.3), { uAO: 0, uFog: 1 }),
    // THE CONSTANT-FRAME TEST, and it is the one that localises the bug rather
    // than narrowing it. uMaxT below the first step makes every ray exceed its
    // range before it can hit anything, so `trace` takes the hit < 0 branch for
    // every pixel and the whole frame is the compile-time constant FOG_COL,
    // gamma encoded: exactly [56, 62, 79]. No marching, no shading, no fog
    // blend, no geometry of any kind. Two runtimes that disagree HERE disagree
    // about the constant, which is a translation or output problem and not a
    // renderer one. Both geometries, because S3 already matches on its 106540
    // genuine background pixels and H3 has none to compare.
    view('floor-miss', 'h3', placeAt(0, 0, 0.3), { uMaxT: 0.001, uAO: 0 }),
    view('sphere-miss', 's3', S.IDENTITY, { uMaxT: 0.001, uAO: 0, uEdges: 0 }),
    // GRAZING versus HEAD-ON, the last split. What survives is a bias that is
    // never negative, and `sceneNormal` has exactly one mechanism that can only
    // brighten: when the eight finite differences cancel, mdot(G,G) falls under
    // 1e-8 and it bails to upAt(p), which reads key = 1 where the true normal
    // reads nearly 0. Bailing makes a pixel brighter, never darker.
    // That is a property of the SHADER, not of Godot -- 0.0015 and 1e-8 were
    // tuned against one compiler -- and it predicts the disagreement follows
    // grazing incidence. floor-before-seam already bears that out: its
    // differing pixels run 0, 0, 11, 76, 607, 952, 1379, 1679 down the frame,
    // piling up exactly where the floor flattens out toward the horizon.
    // Pitching down puts the same floor head-on, where the gradient is strong.
    view('floor-down', 'h3', placeAt(0, 0, 0.3), { uPitch: -1.4, uAO: 0, uFog: 0 }),
  ],
};
writeFileSync(new URL('views.json', output), JSON.stringify(fixture, null, 2) + '\n');
console.log(`Exported two Godot shaders and ${fixture.views.length} matching camera views.`);
