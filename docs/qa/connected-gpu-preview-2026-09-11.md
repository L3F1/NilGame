# Real-time connected preview verification

Base a98780d plus this change. Host LeoPC, Windows 10.0.26200, Node 24.20.0,
Ryzen 7 9800X3D. Chrome runs through the existing host queue. Commands:

```
node tools/check-queue.js page-check --connected-preview
node tools/check-queue.js page-check --connected-preview --sw
node tools/check-queue.js shader-check
node connected-render.test.js
node connected-preview.test.js
node tools/test.js
```

Hardware: ANGLE/D3D11, NVIDIA GeForce RTX 5070 Ti. GPU query timing at 320x240,
three recorded views, 15 warmup then 75 timed draws each. Disjoint samples are
discarded. CPU submission and headless requestAnimationFrame intervals are
recorded separately; neither is asserted to be visible display FPS.

| Pose | GPU min / median / p90 / max, ms |
| --- | --- |
| Entry | .180320 / .208320 / .236448 / .264544 |
| Curve | .211936 / .232448 / .247104 / .257568 |
| Far | .162368 / .185280 / .193408 / .199616 |

Median instrumented CPU submission was about .30 ms. First shader creation,
link and completed draw took 1392.3 ms wall time with the cold test profile;
that is not GPU-only compile time or an OS-cold benchmark.

Ten 80x60 ray grids (48,000 comparisons): entry, turned entry, curve, far,
and six positions during continuous flight. Every confident GPU result matched
CPU status, region and additive owner; hit distance error <=.000025925 units
on the hardware run. Normal error <=.00636 including 8-bit readback quantization.
Additional unresolved pixels per grid: 25,2,0,3,19,5,0,7,2,3. These are visible
magenta; they were not reclassified to make the image look complete.

SwiftShader also passed the distance/status/owner/normal checks. Worst recorded
distance error .00080035. It is a software backend: final measured medians
roughly 45-88 ms, not hardware performance.

Images saved for all ten views. Entry, curve, far and selected flight images
inspected: portal silhouettes, destination objects, curved room and headlight
normals are visible. Thin magenta rims/speckles remain near uncertain boundaries.
This is an honest preview limitation, not evidence those cases are solved.

Browser checks include E3-S3-E3 via actual step buttons, the return route, and
260 continuous motion updates. The shared mouse spike/lifecycle policy is reused;
physical pointer-lock use still benefits from user playtesting. Node checks pin
packing/scoped masks/reverse portal indices, unsupported chart refusal, continuous
crossing, dt clamp, obstacles and left-button direction.

Failures caught during implementation: alpha-disabled/dithered byte readback
corrupted diagnostic floats; fixed in the diagnostic framebuffer setup. Native
inverse-angle approximation produced .001047 distance error at a far-floor ray;
the new range-reduced implementation passed the unchanged .001 criterion.
No CPU kernel/query tolerances were relaxed. The existing shader-check passed;
the new shader's compilation/first draw is exercised by the preview page check.

Image review caught hidden-ball tangencies poisoning nearer wall hits. Ambiguity
now has an earliest affected distance: a proven earlier hit may finish, while
interval evaluation stops before uncertainty. The curve pose previously had six
extra unresolved samples and now has zero; that regression is explicitly pinned.
The last full Node suite passed 81/81; subsequent shader changes were checked by
the GPU browser comparisons (Node does not execute those shaders).

Evidence JSON remains under .agent-bridge/; tools regenerate it. Current precision
and scope limits: ../engineering/CONNECTED_GPU_PREVIEW.md. The fixed preview is
now real-time; neither editor has gained cross-region editing in this change.
