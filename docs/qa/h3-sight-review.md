# Connected H3 sight

Lead on LeoPC / Node24.20.0, base41f1548. region-sight explicitly dispatches H3
to the compiled field's analytic rayCast, preserves hit owner/normal and query
refusals, and charges primitive tests to the shared work budget. Unknown metrics
and unsupported H3 fields refuse; neither inherits S3 events or marching.

The first integration reproduced a foreground occlusion bug: with a ball .75
units into H3 and an exit portal 2 units away exactly at the requested limit,
the portal's range ambiguity hid the ball. H3 now obtains a definite field hit
before querying portals and bounds all aperture queries by that foreground
distance. A tie still refuses. No uncertainty interval was relabelled safe.
If a nearer portal shortens an unresolved field query, the field is queried on
the shorter segment, charging the additional work. Otherwise reuse its result.

hyperbolic-sight.test.js checks E3/H3/E3 ownership and 4.75-unit total sight
distance (no gameplay exit offsets), foreground hits despite remote range/domain
ambiguity, reversed portal order, near portals before remote uncertain solids,
solid/portal ties, every smaller work budget, crossing budget, and R=.5/8/10000
field hit/range/domain/inside/normal behavior. Both s3Method choices use the H3
analytic path. Existing region-sight.test.js 17/17 and aperture-refusal pass.

Isolated omission of the foreground bound fails the new test: aperture-query /
unresolved instead of hit. Script .agent-bridge/review-h3-sight.mjs; production
untouched by mutation. The original first integration failed the same assertion.

MUSE-70 delivered without reported production failures, but remains unaccepted;
report inspected only. Review source and reproduce its mutation next. The new
foreground ordering also needs an independent corpus before GPU promotion.

No GPU H3 path or browser preset in this change. Future GPU work must reproduce
the bounded query policy, including unknowns, rather than painting every refusal
as sky or using spherical formulas for the hyperbolic region.

Integration: node tools/test.js 119/119 suites, h3-sight-suite.log. Queue
page-check --connected-global 52 checks on LeoPC, cold real GPU, 8.1s, no boot
error. Existing E3/S3 regression evidence only; no H3 GPU path tested.
