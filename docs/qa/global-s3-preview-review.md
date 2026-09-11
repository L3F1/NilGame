# Full-sphere preview: lead integration review

2026-09-11. Claude candidate based on a10ab65; Muse MUSE-57 accepted separately.
Claude owned GPU/browser/tool integration, Muse the 81-case independent CPU ray
corpus, Astra the flight model, numerical scope and host verification.

Live entry: tools/spherical-cover.html, linked from Worlds and connected preview.
R=8, eight colored metric balls, one clear great-circle route. Run full loop
resets only at start and then advances 2πR=50.2654824574 physical units. Manual
flight carries a reference frame; yaw/pitch do not accumulate artificial roll.
This has no collision/gravity and is not yet the connected E3/S3 route.

Lead changes: constrain GPU to R8 and angular ball radii .05–.1 (fixed tangent
guards are not adequate for arbitrarily large/tiny balls); remove claims of
exact float packing/universal conservatism; Escape cancels loop with visible
status; add direct Worlds link. Test thresholds were not relaxed.

Cold `node tools/check-queue.js page-check --spherical-cover` and `--sw`:
28,800 sampled rays over six poses, including exact antipode, full return and
an off-route turned pose. Every confident status/owner agrees. All 1,064 CPU
hits retained; 602 are beyond πR. One GPU refusal of a CPU miss, no other extra
refusals. Worst distance errors: RTX .000154106, SwiftShader .000060155 against
unchanged .001 threshold. Quantized normal errors below .011 versus .02 limit.

Hardware: RTX 5070 Ti, ANGLE D3D11, Windows Node 24.20.0; software: SwiftShader
Vulkan. Display images 320×240; parity grid 80×60. Inspected start/antipode/return
and off-route images: landmarks visible, colors change around orbit, no chart
cutoff. Some near-tangent boundary pixels may still refuse at display resolution.
Uniform sphere silhouettes are not by themselves evidence of Euclidean geometry.

The same button/step code is exercised with 780 synthetic 1/60-second ticks
(13 simulation seconds, NOT a measured 13-second wall-time benchmark).
Maximum step .06444293, no travel decrease or endpoint reset; position returns
within 5.48e-13 physical units. Automatic runner stays at the completed endpoint.
Additional tests cover unsupported renderer inputs and Escape cancellation.
No GPU frame-time distribution was measured in this task.

Node and legacy-browser final checks are recorded below. Claude's original
unrun-GPU statements remain historical attribution in claude-global-s3-preview.md.
Remaining: global region serialization/construction ownership, collision and
E3 portal integration; broader scenes and numerical error bounds.

Final: 86/86 Node suites; 13/13 spherical browser checks on each backend;
16 connected-preview checks; 346 legacy Worlds/input checks; git diff check clean.
