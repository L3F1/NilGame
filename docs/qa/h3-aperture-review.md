# H3 aperture and short-distance review

Lead implementation on base 6bad7f9, Windows LeoPC Node24.20.0.
Experimental only: no scene admission, traversal integration or GPU changes.

`node hyperbolic-aperture.test.js`: 27 constructed intersections at R=.5/8/10000,
including translated/rotated frames and oblique incidence. Intersection is chosen
first, then the ray is constructed backwards; expected travel does not use the
production root formula. Shared metric transport/step remain a reference dependency.
Checks include entry direction, body/rim, range/domain, asymptote and invalid input.

The first run threw `H3 distance lost spacelike chord` at an off-origin centre
intersection. Subtraction of rounded time coordinates was unstable for nearly
identical points. Rationalizing that difference fixes it without clamping an
invalid chord. `hyperbolic-space.test.js` adds radial separations 1e-8/1e-10/1e-12
at rapidities .4/1.9/3.9; existing metric identities pass unchanged.

`node .agent-bridge/h3-aperture-mutations.mjs` (local isolated modules): four
mutations caught with exit1: back-side false hit, omitted body radius, ball hit
distance biased by .01R, and restored unstable time subtraction. Main sources
untouched. MUSE-67 rerun gives 66 observed hit agreements, 33 sampled miss
agreements, 21 inside-start unknowns. Wording changed from certified to observed;
result vocabulary assertion added. No proof of all ray misses or guard adequacy.

Unresolved apertures export uncertaintyFrom:0; diagnostic distance is not a
permission to move. Consumers still need refusal ordering before H3 admission.
No browser check required for these isolated host-free modules.

Full validation: `node tools/test.js > .agent-bridge/h3-aperture-suite.log`,
112/112 suites passed. No deadlines or existing assertions weakened.
