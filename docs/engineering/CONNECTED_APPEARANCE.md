# Connected preview appearance

Display-only module: engine/geometry/connected-material.js, inserted after the
connected ray solver. Query status, hit region/owner, distance and normal debug
packets return before material evaluation. The solver records its final hit point
so lighting and patterns use that region, including after multiple portals.

Default polished style: warm diffuse/specular key, cooler fill, gentle display
transform, object-attached ball bands and one-unit E3 floor tiles. S3 uses a smooth
quaternion-frame light field, not a claimed globally parallel sunlight vector.
Ball pattern axes live at the ball center; repeated images sample the same surface
pattern. E3 tile phase lives in the destination region. No fog or range expansion.
Primitive texture row.w now tags balls (1), other primitives (0); capacities and
serialized scene formats are unchanged. Colours/materials are preview defaults,
not yet authorable or saved per-entity materials.

Optional AO is a normal-probe heuristic: four physical normal-geodesic offsets
(.06 through about .60 units), field shortfall weighted into ambient intensity.
It evaluates local additive/scoped Boolean fields, using physical spherical ball
and half-space heights. Conservative Boolean/box fields may exaggerate shading
near corners. These samples are NEVER ray hits or collision certificates.
No secondary shadow rays, inter-region occlusion or physical illumination claim.
Sampling is disabled within aperture radius+.65 of a portal and excludes samples
outside the hit region's supported extent. AO affects ambient light only, does
not brighten surfaces, and should have little effect on isolated spheres.

Renderer draw accepts polished/ao booleans; read's fourth argument accepts the
same options for debug-packet invariance checks. readColor returns RGBA8 display
pixels. CPU geometry and the old arena renderers are unchanged. Unresolved pixels
retain their diagnostic colour/pattern rather than receiving material shading.

## Explicit pixel sampling

`antialias` on draw/readColor defaults false; the global preview's Smooth edges
control enables it. The UI starts enabled except on known software renderers
(SwiftShader/llvmpipe/softpipe/software names), where measured cost is too high.
This heuristic is not a hardware performance certificate; the toggle stays usable.
Four rays at pixel-centre offsets (+/-0.25,+/-0.25) each
perform ordinary traversal and shading. Colours resolve as sqrt(mean(c*c)),
consistent with the current gamma-2 display approximation. This is finite
supersampling, not an analytic pixel integral or a new ray-distance guarantee.
No hit epsilon, world geometry, movement or implicit shader derivative changes.

Any numerical/traversal uncertainty among the four samples retains a full magenta
pixel. Domain-boundary patterns may average, but are never replaced with sky.
This can reveal MORE uncertain pixels than centre sampling; it does not repair
grazing-ray uncertainty. All debug packets and the diagnostics view remain single
centre rays, unaffected by antialias. Future geometry adapters can reuse this
sampling/resolve boundary without new geometry-specific smoothing code.

The four rays are more work. Keep the toggle and report GPU/CPU times separately;
do not infer input latency from GPU timings. Reference checks compare with an
independent 2x-resolution centre-ray image and keep uncertainty markers explicit.
