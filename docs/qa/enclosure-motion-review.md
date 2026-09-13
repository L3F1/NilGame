# Enclosure motion acceptance (2026-09-13)

Base beacbb1; candidate remains unexposed in the UI. The probe now runs the
real host camera/flight policy in an isolated model: 12 frames each from flat,
sphere and approach-exit starts, sampling frames 0, 5 and 11 at 65x49.
The existing census at 65x49 and 160x120 remains unchanged.

Each pose compares ordinary renderer against candidate-off, then candidate-off
against candidate-on. Status/owner/region/distance changes on already resolved
pixels fail the browser check; no tolerance was added. Every recovered answer
uses the existing CPU owner/region/distance check. Starting inside S3 correctly
returns outside-scope for the E3-transfer-only certificate producer.

The first run failed a NEW harness assumption that every starting region should
produce certificates. Corrected that expectation, without changing rendering.
Hardware rerun passed all 11 records with zero offChanged/settledChanged.
Moved E3 views recovered 3, 4 and 0 pixels; census recovered 1 and 30.
The six S3-start views consumed zero certificates, as required.

Hardware: ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11). Candidate constructor 17269 ms.
Command: node tools/check-queue.js page-check --three-geometry --timeout=300.
SwiftShader passed the same 11 records with identical recovery counts and zero
changes to resolved packets (same command plus --sw; 197.8 seconds).
Hardware browser run: 85.2 seconds. The hard-failure check for nonzero change
counts was added after the hardware run; its recorded counts were already zero.
Software ran with that check enabled. No GPU implementation changed.
[Machine-readable evidence](enclosure-motion-evidence.json) stores both runs.
These repeated probe timings do not close the prior incomplete AA timing item.
Full Node-suite result follows below.

Limitations: short local motion only; these trajectories do not cross portals.
Existing separate checks cover portal expiry. This does not establish sustained
movement safety, arbitrary-pose correctness, edit invalidation, full-resolution
performance or acceptable startup latency. Next: edited worlds with undo/load
and world-revision invalidation, then interactive-resolution/startup decision.
No new renderer algorithm or user-facing control is introduced by this batch.

Final validation: 139/139 Node suites passed. Syntax and git diff --check passed.
