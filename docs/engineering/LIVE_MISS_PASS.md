# First-transfer exclusion pass: implementation assignment

2026-09-12. One deliverable: reduce the gallery's false numerical fringes in
the live renderer. Claude implements; Astra reviews and runs the host GPU queue.

Implement behind `draw(..., { sphericalMissPass: true })`, default false until
measured acceptance. Reuse the test-only spherical-miss interval implementation;
do not put its interval arithmetic in CONNECTED_FRAGMENT. Move/re-export the
helper into the geometry layer if necessary, retaining experiment imports.

Eligibility is deliberately narrow: primary E3 ray, its FIRST selected stable
E3-to-full-S3 transfer, and additive S3 metric balls. A certificate is a miss for
one exact packed surface, not a replacement intersection. Preserve existing root
ordering, hits, fallback, diagnostic reasons and motion. Reverse BOTH packed
ball signs for the positive-c exclusion equation. No precision constant changes.

Use separately drawn exclusion texture(s), with explicit bounded portal/surface
index mapping. Consume only at the selected matching first transfer. Association
must include current packed world, pose/camera, range, viewport and sample offset.
First delivery may refuse this optimization when AA is enabled (render through
the existing path); never apply center-sample data to AA samples. Regenerate per
eligible draw; invalidate on world replacement/resize and skip on missing or
invalid resources. Never reuse stale certificates. Do not let debug/readback
draws consume data from a different pose or size. No vendor-string heuristic.

Restore GL framebuffer/program/texture/viewport state before the main draw.
Expose enough counters/timing evidence to distinguish disabled, unsupported,
candidate and consumed passes. A missing GPU timer is unknown cost, not free.
No automatic admission yet: opt-in allows measuring complete frame cost first.

Tests must cover wrong portal/surface identity, world replacement, pose/resize,
AA fallback and positive-c packing. Add check-mode before/after evidence using
the actual renderer: status/refusal counts, CPU disagreements, saved images and
total frame timings. Preserve the existing baseline. Report browser checks
UNRUN if unavailable in the isolated clone; never use the main checkout queue
from the clone. Lead runs candidate in the real checkout after review.

Avoid a general render graph or new dependency. If all-surface mapping makes
this bounded pass unaffordable or unrepresentable, report the concrete blocker;
do not broaden the mathematical scope or substitute an unproved miss.
