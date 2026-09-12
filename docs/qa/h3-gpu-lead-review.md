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
