# Claude next: connected sight fixture and CPU diagnostic view

Read WORKING_RULES and docs/qa/astra-s3-sight-integration-2026-09-10.md.
Classifier accepted with zero-range, accounting and numerical-input corrections.
No GPU promotion or runtime gate removal yet.

Build a NEW scene-v2 E3 -> S3 -> E3 acceptance fixture at
levels/fixtures/connected-sight.nil.json. Do not replace the historical v1
connected-lab fixture. Use valid open-hemisphere extents, one clear spawn per
region, a passage cut from a cell, an off-route obstacle and an identifiable
far-room target. Anchor directions must support actual forward traversal.
Keep the geometry small enough for existing compile limits, with intrinsic
player clearance checked along a specified route. Do not assume coordinate
width is off-axis physical clearance. No new schema or primitive kinds.

Add tools/connected-sight-probe.js: sample traceRegionSight on a small image
(e.g. 96x72) from a documented pose, save PNG plus a JSON packet of selected
rays. Use current compiled frames and physical ray directions. Colors must
separate hit region/owner, miss-within-range and unresolved reason. Never color
unresolved as sky. Report reason counts, work distribution, CPU query timing,
resolution and host; these are not GPU frame times. Save exact scene/pose/range
with the packet so another host can repeat it. Use existing dependencies/Node
builtins only. The image is a CPU diagnostic, not a screenshot of the game.

Allowed writes: that fixture and tool, connected-sight-fixture.test.js,
docs/qa/claude-connected-sight-fixture.md. Tests must compile/reload the fixture,
execute the route with real movement and query selected rays through portals.
Prove the passage ray reaches the intended region while an off-passage ray
hits the wall; inspect the saved image. Report refusals instead of shrinking
ranges just until a preferred answer appears. Keep accepted kernel unchanged;
hand back unexpected cases with exact rays. Focused/full Node checks, explicit
commit paths. Coordinate Muse's independent audit through separate files.
