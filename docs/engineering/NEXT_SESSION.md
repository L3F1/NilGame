# Fresh-chat handoff for Astra

2026-09-11. Start with git status/log, WORKING_RULES and relevant TASK_ROUTER row.
Claude remains paused while weekly quota is full: no prompts or quota probes.
Muse's last job was accepted MUSE-55. No external jobs are scheduled. Bridge
manifest names completed work; replace before dispatch. Read AGENT_BRIDGE only
for orchestration. Idle watchers consume no model tokens; avoid duplicate review.

Real-time connected preview now uses WebGL2 analytic E3/S3 rays, CPU collision
and carried camera motion. Open tools/connected-preview.html (linked in menu and
editors); click to capture mouse, WASD/Space/Shift flight, Escape release. CPU
step reference retained at tools/connected-cpu-preview.html. No connected editing.

Camera follow-up: the preview now uses floor-relative upright look, pitch ±1.5,
and removes only roll after transported motion. It is still flight without
gravity. See docs/qa/connected-camera-2026-09-11.md and connected-camera.test.js.
HUD names E3/S3 and R=8; actual S3 packing/metric and GPU parity are checked.

Read CONNECTED_GPU_PREVIEW.md before renderer edits: provisional float guards,
bounded capacities, explicit unresolved results, no sky policy. GPU is a tested
preview, not a formally certified universal query backend. Field/root/portal
algorithms remain separate from the CPU authority. Texture packets reuse compiled
primitives and owned groups. Closest hits may finish before later root uncertainty;
that prevents hidden ball outlines poisoning opaque walls.

Evidence: docs/qa/connected-gpu-preview-2026-09-11.md. Hardware and SwiftShader
comparisons, 48k rays over ten poses, status/owner/distance/quantized normal,
continuous motion and round trip. Actual GPU timing measured, separate from CPU
submission/headless frame intervals. Magenta rims remain at uncertain boundaries.
Native inverse-angle approximation failed; range-reduced version fixed it without
relaxing the hit-distance test. Full Node 81/81, shader-check, preview checks pass.

Next hard task: independent near-boundary/near-parallel GPU falsification and
scale/error bounds, then connected editor integration. Muse can independently
check float32 packet signs/scopes and build bounded ray corpora; reserve numerical
policy for Astra. Do not broaden supported scenes because one fixture is fast.

Godot remains a candidate host. This renderer removes a prerequisite, not the
need for scene-v2/motion parity and host shader/resource adaptation. Existing
single-region editors, legacy arena and numerical evidence remain intact.

Push completed user-facing work; locally committed is not deployed. Verify Pages
content after push rather than asking the user to keep reloading stale builds.
