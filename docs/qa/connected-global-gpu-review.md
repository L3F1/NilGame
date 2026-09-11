# Connected complete-S3 browser review - 2026-09-11

Integrated after f85a53f, agents based on 518fd48. Windows LeoPC, Node24.20.0,
RTX5070Ti ANGLE/D3D11; software check uses Chrome SwiftShader. This report ships
with the final implementation commit. Historical CPU-only evidence is separate.

Delivered: tools/connected-global-preview.html, Worlds link Full S3 portals.
Coverage-tagged region packets, R8 additive global balls, four-region/eight-portal
caps retained. Global runtime bypasses chart bounds; finite aperture roots search
future entry from either starting side, excluding the antipodal disc. Range64,
maximum four crossings; bounded preview retains range32 and chart ownership.
CPU moveRegionProbe handles collision/transit. Camera reference-up follows the
actual returned frame map, including portals. No gravity/editor integration.
Three off-route spherical landmarks make the saved route visible.

## Reproduced renderer defect and repair

First NVIDIA run passed. First SwiftShader run FAILED at spawn pixel57,25:
GPU4.237447738647461 vs CPU4.192670902026949, error .04477683662051213.
Replacing native sin/cos with reduced polynomial evaluation fixed this without
changing the .001 physical-distance or .015 normal tolerance. Native trig error
was amplified by small-ball root solving. The reduction's approximation error is
small, but total float32 error is still empirically guarded, not formally proven.
After repair, worst error over five recorded views: NVIDIA .00005579, SwiftShader
.00003425 physical units. GPU cost increased, measured below; no hidden fallback.

## Verification

- node connected-global-model.test.js: 602-frame pitched E3/S3/E3 route through
  antipode, repeated look/high-pitch camera checks, same-space direct transport
  reference, halts/reset, explicit-range sight passed. The transport reference
  calls the metric primitive directly: it is not independent mathematics.
- node connected-global-truth.test.js (Muse59): range ladder, crossing budgets,
  inside/grazing refusal and blocked destination ownership passed. Lead changed
  balls[0] to find by ID after adding landmarks; test intent unchanged.
- node connected-global-render.test.js: coverage packet, additive groups,
  unsupported radius/size refusal before GL, snapshot and queue routing passed.
- Lead isolated mutations: crossing-budget removal, pitch-clamp removal and
  reference-carry removal each fail. Restored scratch tests pass; main untouched.
- Queue page-check --connected-global: 8 checks on NVIDIA and SwiftShader, cold.
  Five80x60 views (24,000 rays), no vacuous view, 1286 CPU hits /1275 GPU hits;
  11 additional hit refusals, no confident wrong hit/miss in corpus. Straight
  ray crosses both portals: CPU42.0991118431 /GPU42.0991134644. Actual host motion
  traverses route; 600 look updates preserve roll relative to carried reference.
- NVIDIA GPU queries at320x240,75 samples/view: median .168-.182 ms,
  p90 .177-.195 ms. These are GPU timings, not full frame or input latency.
  Cold first draw wall time and CPU-submit/present samples in ignored evidence.
- Queue page-check --connected-preview:16 checks passed after shader repair.
  shader-check passed; page-check --worlds:346 passed. Full Node result below.
- Saved spawn/quarter/antipode/return/noncentral images inspected. Magenta
  silhouette rims remain (numerical refusal), not fixed or recolored as a miss.
  At the quarter-orbit pose, rays focus toward the return aperture near its
  antipode: much of the view sees the FLAT region's boundary through that portal.
  This is not a newly introduced S3 chart wall. CPU/GPU provenance agrees.

## Agent acceptance

Claude five allowed deliverables accepted after integration and host tests.
Bridge flagged one unexpected file: CONNECTED_GLOBAL_GPU.md was supplied by the
lead after initial staging was denied and the bridge started on518fd48. It is
exactly the lead contract, not an unauthorized Claude edit. Checkout HEAD intact.
Codec/renderer work stayed with lead. Claude's own fail-demo was blocked; lead
ran the meaningful mutations above rather than treating planned checks as done.
Muse59 two-path scopeOK and unchanged HEAD verified; report accepted after rerun.

## Next

Reduce genuine silhouette uncertainty through measured root error bounds;
do not lower tolerance just to remove magenta. Build a connected grazing-ray GPU
corpus around the saved landmarks/portals, including near-surface player poses.
Then integrate this coverage-aware world with editor transactions/save controls.
Current global GPU scope remains R8, ball angular radii .05-.1, no global CSG.
No general whole-S3 walking floor, asset pipeline or Godot migration is implied.

Final integration: node tools/test.js exited0, 93/93 suites passed. Git diff --check passed.
