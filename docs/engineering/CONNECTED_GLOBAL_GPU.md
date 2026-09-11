# Connected complete-S3 GPU increment

Lead owns connected-shader.js, connected-renderer.js and connected-cover-world.js.
Renderer API remains createConnectedRenderer(canvas,world); draw/read same APIs.
Packed result gains maxDistance: 64 for mixed cover worlds, 32 for old previews.
CPU comparisons MUST use renderer.packed.maxDistance. Region records distinguish
bounded coverage from s3-cover. R8, additive balls angular radius .05-.1 only in
global GPU subset. No weakening of scene-v2 chart refusals, no global CSG.

Host task: create app/connected-global-model.js, app/connected-global-preview.js,
tools/connected-global-preview.html and connected-global-model.test.js. Compile
fixture connected-global.nil.json with compileConnectedCoverWorld. Do not call
renderData in Node model. Lead implements that render packet. Real-time flight
uses moveRegionProbe, radius and existing mouse-look lifecycle. No gravity.
Use a carried reference-up camera policy: store up in previous camera coordinates
and reconstruct it in returned transported camera axes AFTER actual motion; this
uses the solver's net linear frame map (including portal), not endpoint transport.
Yaw about reference up, clamp pitch against same up; do not world-up clamp.
Halts/debt refuse, reset recovers. Provide forward/back/buttons, pointer flight,
spawn buttons flat/sphere, and status explicitly saying COMPLETE S3. World has
no spherical floor or chart boundary. Existing bounded preview untouched.

Check mode ?check uses /__report protocol same as connected-preview.js. Compare
80x60 CPU/GPU rays at spawn, quarter, antipode, return and noncentral turned pose,
plus one-pixel straight sight through BOTH portals. CPU is traceRegionSight.
Require all confident GPU hits/misses agree status/region/owner, distance .001,
normal .015; at least95% CPU hits retained per view. Never loosen thresholds.
Exercise actual model advance through flat/sphere/flat, not teleported test only.
Collect screenshots via existing report shots protocol and GPU times if available.
No root browser queue from agent clone; lead runs integrated browser test.
Node model tests must catch roll/high-pitch look regressions and verify traversal.
Do not add fixture solids: lead will do that separately. Report if empty sphere
makes poses visually uninformative. Lead owns test queue/menu link wiring.
