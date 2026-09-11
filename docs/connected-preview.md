# Connected portal preview

Open tools/connected-preview.html on the game's HTTP server (also linked from
Worlds and both editors). It loads levels/fixtures/connected-sight.nil.json:
E3 entry, spherical room, E3 far room.

Click the canvas for real-time flight. WASD moves, Space/Shift rises/descends,
mouse looks, Escape releases capture. Focus loss clears input. Flight carries
roll; there is no gravity or upright-camera policy. Reset recovers from a refused
motion request. Buttons retain quarter-unit steps for touch and reproducibility.
Choose 160x120, 320x240 (default), or 480x360 resolution.

The WebGL2 renderer follows analytic E3/S3 rays through the portal frames. CPU
motion retains collision, transported camera frames and explicit refusal/debt
handling. This is a fixed-scene preview, not yet a connected-region editor.
Blue/green/gold identify regions; surface orientation supplies headlight shading.
Magenta is unresolved (including chart exit), not sky or a collision wall. Small
magenta rims/speckles can remain near ambiguous numerical boundaries.

The CPU step reference remains at tools/connected-cpu-preview.html. Existing
single-region editors are unchanged. GPU code has no dependency on Godot or the
browser input host beyond the WebGL wrapper; future host migration still needs
resource/shader adaptation and parity checks.

Checks: node connected-render.test.js; node connected-preview.test.js;
node tools/check-queue.js page-check --connected-preview (and --sw).
The browser check compares 48,000 rays across ten views against the CPU,
including owner, distance and quantized normals. It exercises both portal
crossings, return, and 260 continuous motion frames. It measures three views
with 15 warmup and 75 timed draws each, writes images and a local evidence JSON.

See docs/qa/connected-gpu-preview-2026-09-11.md for measured hardware, results,
precision limits and remaining work. No claim of universal float32 correctness
or a finished renderer for every authored scene is made.
