# Connected pixel sampling review — 2026-09-11

Base 8a9428c. Lead implemented the shared four-ray display path; Claude supplied
UI and independent browser checks. Lead extended them to entry, spherical quarter
orbit and return views. See CONNECTED_APPEARANCE.md for the sampling contract.
Geometry/collision/portal queries and debug packets retain their guarantees.

Verification on LeoPC, Windows Node24.20.0, Chrome/ANGLE through check-queue:

- Full Node suite 97/97, including Muse61's reviewed 72-approach contact corpus.
- Global browser 24 checks on both NVIDIA and SwiftShader. Bounded connected
  browser also passed. No boot or GL errors.
- 320x240 smoothed images match independently rendered 640x480 centre samples:
  3180/4308/5560 all-hit comparison pixels by pose, two styles. Worst error
  <0.84/255 (limit2/255). Status/distance/normal debug bytes unaffected.
- Numerical-unknown footprints: 250/116/16 pixels retain full magenta. This is
  measured coverage, not a count of centre-ray errors. No epsilon reduction.
- Disabling the AA uniform intentionally fails at entry pixel131,48: a missing
  uncertainty marker. Original renderer restored before final checks.
- Inspected same-pose before/after screenshots: sphere contour and bands are
  smoother, no displaced geometry. Images regenerate through the browser check.

75 GPU timer samples per mode and pose at 320x240, warm-up and drain separated.
NVIDIA GeForce RTX5070Ti / ANGLE D3D11 GPU times in milliseconds:

| View | Centre median / p90 | Four samples median / p90 |
|---|---|---|
| Entry through portals | .152 / .158 | .220 / .227 |
| Spherical quarter orbit | .164 / .173 | .269 / .284 |
| Flat return | .082 / .155 | .127 / .132 |

CPU submission medians .20ms, measured separately. GPU clock/load variation is
visible in the return distribution; these are observations, not speed promises.
Cold-ready wall time3.84s includes compilation/first draw, not steady frame time.
Raw records: .agent-bridge/pixel-sampling-real-final.json (local, ignored).

SwiftShader Vulkan software median GPU times centre/four samples:
entry28.7/113.2ms, quarter46.4/182.9ms, return22.5/89.6ms; cold-ready .317s.
Raw records: .agent-bridge/pixel-sampling-sw-final.json. Therefore known software
renderers start with smoothing disabled; the user can enable it. Hardware starts
enabled. Unknown hardware is not benchmarked by this heuristic. These are GPU
execution measurements, not end-to-end input latency or target-resolution claims.

Limits: four point samples are not exact coverage; fine detail can still alias.
Unknown rays stay visible and may mark more pixels than centre sampling. No new
geometry support or global-editor integration is claimed. Next milestone:
docs/engineering/CONNECTED_NEXT_MILESTONE.md.
