# Experimental H3 metric — 2026-09-11

Base2dc1d47, Windows LeoPC Node24.20.0. New host-free hyperbolic-space.js;
scene factory, portal gate and renderer still reject H3. Arena geometry(-1).exp
is reused for origin decoding; distances use Lorentz chord half-distance and
transport uses the endpoint formula for the unique H3 geodesic. Frame products
use inverse radial-boost coordinates to reduce cancellation. No host changes.

Author extent <=2R; numerical representative <=4R; signed step travel <=4R.
These deliberately narrow limits remain provisional numerical policy. Tests
sample near3.9R and small domains; they do not prove a global error bound.
Boundary first-exit solves in tanh(t/2), with sinh-product gap to avoid subtracting
nearly equal cosh values. Invalid representations/range loss throw explicitly.

Focused hyperbolic-space.test.js passed: independent right-triangle distance
identity at R=.5/1/8/10000, worst scaled error7.28e-16; Lorentz transport
norm/tangency, round trips, reverse motion, captured segment inputs, 2000 short
out/back legs, 50 near-envelope probes, tiny extent and large-radius flat limit.
Isolated sign mutation in transport fails an independent metric assertion
(`node .agent-bridge/h3-metric-fail.mjs`); main sources untouched.

Next reviews: MUSE-65 independent corpus and Claude metric-aware camera. Neither
scene support nor a playable H3 portal is claimed by this increment.

Full host `node tools/test.js`: 106/106 suites passed, with unchanged deadlines.
Log: .agent-bridge/h3-metric-suite.log. No browser run required for this isolated,
unreachable-from-scenes adapter; future integration requires CPU/GPU validation.
