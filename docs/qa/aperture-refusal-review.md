# Sight aperture refusal integration

Base b88788b; Windows LeoPC Node24.20.0. H3 remains scene/GPU gated.

Sight accepts legacy crossings plus explicit hit/miss/unresolved packets.
Unknown diagnostic distance never becomes a prefix: missing uncertaintyFrom
defaults to zero. Invalid packets refuse at zero. Explicit misses must cover
the queried range. All apertures receive the same segment, preventing array
order from changing a producer's range-boundary classification.

Solids/gates strictly before the uncertainty band can win; ties refuse before
advancing the ray. Result metadata preserves aperture IDs and producer reasons.
Current H3 helper exports zero prefixes, so it gains no optimistic advancement.

`node aperture-refusal.test.js`: nearer solids/gates, zero-prefix unknown, ties,
array order, invalid packets, bounded misses and unchanged ray input pass.
`node .agent-bridge/aperture-refusal-before.mjs`: isolated HEAD sight module
fails the new test with actual hit versus expected unresolved. Main untouched.
`node region-sight.test.js`:17/17 unchanged checks pass.
Queue `page-check --connected-global`:52/52, cold real GPU on LeoPC, no boot
error. Inspected noncentral-turned image; known thin magenta uncertainty remains.

MUSE-68 has delivered; report inspected, no counterexample reported, not yet
accepted/integrated. Movement handling and independent audit review are next.

Full validation: `node tools/test.js > .agent-bridge/aperture-refusal-suite.log`,
113/113 suites passed, unchanged runner deadlines and existing assertions.
