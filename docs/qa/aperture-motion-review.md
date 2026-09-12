# Explicit aperture refusal in movement

Lead review on LeoPC, Node v24.20.0; base ad7b7cb.

region-motion now normalizes explicit aperture packets on every solver leg.
Unknowns compete by uncertaintyFrom, never diagnostic distance. Existing event
rollback preserves the clock, carried frame and correction debt. A definitely
earlier contact/gate can win; a tied or earlier unknown cannot transit. Unknown
destination-offset queries refuse the whole transaction and retain their IDs.

`node aperture-motion-refusal.test.js`: origin/malformed packets, nearer contact,
gate/domain ties, portal order, nearer successful gate, destination refusal,
clock/input preservation and real S3 correction debt pass. The replay check uses
the API's stale-continuation result, not an exception (initial harness corrected).
`node region-motion.test.js`: 46/46. `node correction-resume.test.js`: 11/11.

Isolated old ad7b7cb movement module fails the new origin-uncertainty assertion:
actual complete, expected unresolved. Main source untouched by this fail-demo.
Script: .agent-bridge/review-aperture-motion.mjs (also checks Muse's body mutant).

This is consumer plumbing, not H3 scene admission or a geometric proof. Synthetic
query producers cover the new protocol on real compiled E3/S3 fields; H3 portal
factory integration and broader independent movement cases remain next work.

Integration: node tools/test.js passed 115/115 suites (aperture-motion-suite.log).
Queue page-check --connected-global passed 52 checks on LeoPC real GPU, cold
shader cache, 8.2 seconds, no page/boot error. This is a runtime regression
check, not new H3 rendering evidence or a visual-artifact repair.
