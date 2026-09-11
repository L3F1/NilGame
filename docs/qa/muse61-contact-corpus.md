# MUSE-61 contact recovery corpus — report

72-case corpus over the published fixture via `createConnectedGlobalPreview`
only: region (flat E3 / sphere S3) x aim (head-on -0.5, glancing -0.2, wide
0.3) x dt (.008/.016/.033/.04) x steering (straight, lateral drift, mid-run
veer). Frames scale as ceil(3.2/dt). Per frame: camera orthonormality and
upright-vs-carried-reference (<1e-9, observed <=2.2e-16), independent metric
ball clearance >= -1e-9 (observed min +0.0001, no tolerance loosening).
Refusals (unresolved/domain halt) are logged, never asserted away; retreat
(20 reverse frames, same-region step tape, >0.3) runs only for unrefused
cases.

Result: 72/72 pass, 13 debt-free `budget-exhausted/steps` stops with steering
intact, 1 `correction:complete` (flat head-on dt=.016 straight), 0 refusals,
retreat everywhere without reset. No out-of-scope defects found; nothing
fixed. One corpus-draft bug caught pre-green: hand-reconstructed S3 centers
are wrong (south/return landmarks are antipodal); the metric now uses
kernel-authored `region.balls` with independent great-circle math.

Fail-before (isolated /tmp copy, scratch removed; checkout untouched):
reverting host policy to latch halt on any budget-exhaustion with no
correction resume makes the corpus fail
(`corpus must pin at least one completed correction`, exit 1), and an
attributed minimal old-host harness fails at sphere frame 68 with
`halted=true` — the exact frame in connected-contact-recovery.md.

Host: LeoPC linux/WSL, node v22.23.2, checkout @8a9428c. Commands:
`node connected-contact-corpus.test.js` (pass),
`node connected-contact.test.js` (pass: 2 stops + 1 correction, retreats
pass). `node tools/host-probe.js`: browser checks UNAVAILABLE here (no
AF_UNIX/Chrome, no queue worker) — Node-only per task; lead owns browser
queue. Full suite not run per task scope.

Limitations: single fixture, one body radius (0.25), no browser/page-check;
coarse-dt correction paths beyond the pinned case unexercised.

READY FOR REVIEW

## Lead review

Accepted with corrections, 2026-09-11, based on 8a9428c. Re-ran focused test
on Windows Node 24.20.0: 72 cases, 13 work limits, one completed correction,
zero halts. Changed the corpus to assert zero unexpected halts: the delivered
harness called every halt legitimate and skipped retreat, which was not justified.
Renamed fixed yaw labels near-target/offset; -0.5 is not an exact head-on ray.
These are approaches, not 72 confirmed contacts. Clearance math is independent
of the field but consumes compiled centers; it does not validate chart decoding.
Re-ran an isolated old-host mutation: exits 1 for missing completed correction.
No app/kernel repair in this review. Earlier measurements above are Muse's report.
