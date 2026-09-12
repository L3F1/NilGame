# MUSE-73 S3 refusal census (CPU-only, no repairs)

Tool: `tools/s3-refusal-census.js`. Scene `levels/fixtures/connected-global.nil.json`,
grid 65x49 = 3185 rays/view, range 64, via existing
`createConnectedGlobalPreview` + `pixelSight`. No geometry math copied; no
engine/app/schema/test changes.

## Command and measured output

`node tools/s3-refusal-census.js` (LeoPC linux/WSL, node v22.23.2):

- flat-spawn (flat [0,-2,0]): hit 137, miss 688, unresolved 2360
- sphere-spawn (sphere [0.1247,0,0,0.9922]): hit 490, miss 2670, unresolved 25
- antipode via actual movement (158x `advance(0.04,[0,1,0])`, nominal 25.28
  vs pi*R 25.1327, motion complete, not halted; sphere
  [-0.1247,-0.0184,0,-0.9920]): hit 546, miss 2614, unresolved 25
- approach-exit (`act('approach-exit')`, sphere [0,-0.9689,0,-0.2474]):
  hit 68, miss 2385, unresolved 732
- TOTAL: hit 1241, miss 8357, unresolved 3142 (12740 = 4x3185, asserted)

Top refusal causes (all views): `unresolved:domain-exit` 3142; zero
numerical/budget reasons (no range-boundary, aperture-query/tie,
work/crossing-budget, surface-candidate). Every unresolved is domain-only:
the ray certified travel out of the bounded flat region (extent 12) with
range 64, usually after a portal crossing (endRegion flat, crossings>=1).
Hits carry owner + method + region ownership, e.g. flat-spawn x=31 y=13
crosses into sphere, hits `return-landmark` (`global-s3-balls`) at 39.299.

## Reproducible individual rays (pose, x, y, reason, ownership)

- flat-spawn x=0 y=0: unresolved/domain-only/domain-exit, endRegion flat, 0 crossings
- sphere-spawn x=30 y=21: unresolved/domain-only/domain-exit, endRegion flat, 1 crossing
- approach-exit x=27 y=9: unresolved/domain-only/domain-exit, endRegion flat, 1 crossing

Rerun the command; poses print full camera frames, JSON `--out` holds samples.

## Stability and scope

Run twice, `diff` byte-identical (STABLE); no timings recorded, so none
compared. Asserts: per-view totals = 3185, grand total, every view has
resolved rays, overall hit and miss families nonempty. Unresolved is not an
error bucket: domain-exit is correct contract behavior at the flat extent.
CPU evidence only: it does not diagnose every purple GPU pixel, and four
poses do not establish editor-wide prevalence. host-probe verdict: browser
checks UNAVAILABLE here (no AF_UNIX/Chrome); none attempted, per task.

ACCEPTED WITH LEAD CORRECTIONS


## Lead review, 2026-09-12

ACCEPTED WITH LEAD CORRECTIONS at base26c90ce, LeoPC Windows Node24.20.0.
Unsupported features, invalid destination, aperture-side and event ties must
not be classified domain-only. An aperture-query is coverage-only only for a
nonempty all-domain-exit list. Projected provenance fields are retained (not a
verbatim query dump). No production query, shader or diagnostic color changed.

node refusal-census.test.js failed before the semantic fix on aperture-side,
then passed. Also checks mixed-list orders, empty/unknown reasons, invalid
status. Import is side-effect free. Pose dimensions and antipode completion
are checked; movement uses the imported flight-speed constant.

Two runs of node tools/s3-refusal-census.js --out <path> to
.agent-bridge/census-review-{a,b}.json reproduced the counts byte-identically:
SHA256 DE480A1F1ECF291C7FF6DEF69B1B3E585D1526EBF21A495E97D4BF80A1897BF8.
12740 rays: 1241 hits, 8357 misses, 3142 domain exits.
This CPU-only evidence does not clear GPU artifacts; no GPU change this turn.

Full approved-host validation: node tools/test.js, 126/126 suites passed;
log .agent-bridge/census-suite.log.
