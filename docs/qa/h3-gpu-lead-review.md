# H3 GPU draft: changes requested

Lead review, 2026-09-12 UTC. Draft in bridge run
2026-09-12T04-27-14-201Z-b8cb8cc5, claude-h3-gpu checkout, base4b75b3a.
Not integrated. Browser and shader compilation remain unrun.

1. `pixelRay` still uses ambient Euclidean `normalize`. H3 advancement requires
   a unit tangent in the Lorentz metric. At radial distance R, a radial unit
   tangent has ambient norm sqrt(cosh(2)), not 1. Use geometry-aware unitization
   at uPosition. Non-origin radial and oblique cameras must be tested.
2. H3 `solve` inserts only the entry root. The shared occupancy sweep samples
   halfway between that root and the next event/end. A ray entering a radius
   .5 ball at t=1.5 and exiting at 2.5, with end=6, samples t=3.75 outside;
   no hit is emitted. Supply both boundaries with honest ambiguity handling,
   or implement an explicitly separate additive-entry selection path. Do not
   pretend the shared sweep accepts entry-only primitives.
3. Debug normals encoded as ambient n*.5+.5 in RGBA8 can clip H3 components
   outside [-1,1]. Use a bounded local orthonormal-frame encoding for H3 or a
   lossless component readback. Compare in the corresponding tangent metric.
4. The reported aperture uncertainty policy is NOT accepted as equivalent to
   CPU sight. A perturbed earliest root is not the CPU's uncertaintyFrom=0.
   Preserve foreground-bounded query semantics, including their range/domain
   ordering. Any intentional relaxation requires its own proof/contract first.

Fix within existing allowed files, keep default E3/S3 unchanged, and strengthen
the browser harness with these cases. Node/source checks are not GPU evidence.
No editor exposure until lead runtime readback review passes.

## Partial repair recovery, 2026-09-12

Claude hit its session limit; do not redispatch until user renews availability.
Preserved checkout: run2026-09-12T04-47-57-924Z-a0051ef0,
claude-h3-gpu-repair/checkout. Seven draft files exist; final report was not
written. The checkout index contains Claude's partial repair; the lead's later
two-hunk shader correction is unstaged there. Nothing copied into main runtime.

Source inspection: metric pixel unitization, entry/exit span roots and bounded
local normal encoding are present. The new H3 foreground branch incorrectly
returned on fg==2 before querying nearer portals. CPU region-sight intentionally
keeps non-budget uncertainty pending and re-queries a shortened segment. Lead
removed that early return and restricted hit reuse to fg==1. The existing
MUSE-71 nearer-portal/remote-solid case is the regression scenario to add to GPU
readback, not a claim that its image has passed.

Reran node hyperbolic-gpu.test.js and node hyperbolic-sight.test.js in that
checkout on LeoPC/Node24.20.0: both pass. These are source/CPU checks only.
Remaining: finish review, connect probe to the browser queue, run actual shader
compilation/readback, repair any disagreement, full suite before integration.
