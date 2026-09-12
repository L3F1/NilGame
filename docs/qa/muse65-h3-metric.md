# MUSE-65: H3 metric independent corpus

New `hyperbolic-space-truth.test.js` exercises `createHyperbolicSpace` directly
(factory refusal asserted; no scene/portal/GPU claims). Expectations are
independent of production paths: distance via `R*acosh(-<p,q>)` (production
uses chord/asinh), transport via ambient-pair isometry/tangency/linearity/
inverse, exits via analytic radial/transverse lengths (production solves a
tanh-half-angle root). Tangents are never compared across points untransported.

Coverage: 8 fixed seeds at R=0.5/8/10000 (default 2R extent); step-length and
log-norm identities; frame orthonormality; custom 1.5R extent exits
(out 0.6R, in 2.4R, transverse acosh); near-boundary rho=1.99R first-exit fan
minimum; range truncation; non-axis points at radial 3.9 (envelope 4);
decode-2R vs representability-4R step-through (no wall); tiny extents 1e-9/1e-6;
300-leg transported-frame walk with out-and-back return and carry linearity.

Counterexample sought, reported not repaired: for wide envelope pairs
|log(p,q)|>4R, `logAt` succeeds but `expAt` throws per the <=4R per-step policy;
pinned as an explicit throw assertion plus a close-pair round trip.

Fail-demo (isolated /tmp copy, scratch removed): 0.1% distance mutation caught
(4.4e-4 vs 1e-9 gate). No live source mutated.

Worst scaled residuals (error/R): dist 3.3e-16, step 2.3e-16, log 3.6e-16,
exit 4.4e-16, frame 4.4e-16. Sampled, not proof: 8 seeds x 3 radii, one
envelope pair, one walk; browser checks unavailable (host-probe: no worker).

READY FOR REVIEW. `node hyperbolic-space-truth.test.js` PASS (above
residuals); `node hyperbolic-space.test.js` PASS (worst 7.3e-16).
