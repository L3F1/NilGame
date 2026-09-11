# Connected preview upright camera

The previous host called own-axis `turn` for both yaw and pitch. Mouse loops
therefore accumulated roll; the free-flight kernel behaved as designed, but this
was the wrong preview control policy. No shader or geometry repair was needed.

The host now obtains up from each declared floor: the plane normal in E3, or
the tangent projection of its great-sphere pole in S3. Yaw uses that horizon;
pitch clamps to ±1.5 radians. Successful motion still transports the full frame,
then aligns only roll to the destination floor. This preview applies immediate
alignment, not a promise of smooth roll transitions for arbitrary tilted portals.
Suspended/debt-bearing endpoints are not modified. Gravity remains disabled.
Singular floor up is an explicit error, not a fabricated global axis.

`connected-camera.test.js` failed on the old host at the roll assertion after
correcting an initial test-harness projection API mistake. It now checks 600
look updates in each geometry, constant-elevation yaw, sustained pitch clamping,
and upright frames through the complete E3/S3/E3 motion route.

The GPU packet test pins S3/radius 8/extent 6. Independently, distances between
orthogonal three-unit radial placements satisfy 8 acos(cos(3/8)^2), differing
from their E3 separation by more than .04. The fixture geometry was not changed
to exaggerate the effect. Its short route and great-sphere faces look subtle.

Real-GPU queued `page-check --connected-preview`: 13 checks passed, including
48,000 CPU/GPU ray comparisons and the look-loop check. Inspected regenerated
`page-check-shot-upright-look.png` and `page-check-shot-curve.png`: floor is
upright, the green room and far gold target remain visible. Known magenta chart
exits and numerical boundary speckles remain. Hardware: RTX 5070 Ti / ANGLE D3D11,
320×240. No renderer mathematics changed in this fix.

Full Node run: 82/82 suites passed (`node tools/test.js`), including the new
camera regression. Focused preview/packing tests and `git diff --check` passed.
