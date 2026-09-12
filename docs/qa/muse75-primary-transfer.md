# MUSE-75: primary camera -> E3/S3 transfer independent audit

## Method
Gallery fixture `levels/fixtures/connected-three-geometries-gallery.nil.json`
compiled via `createConnectedGlobalPreview`; gate `flat-entry`, compiled
`gate.renderData()` frame, destination asserted S3 (`curvatureRadius` 8).
Independent truth per (camera, pixel): pinhole ray from image plane at unit
forward distance with `tan(35deg)` half-height (not the engine `1/tan`
focal scale), Euclidean-normalized; source-plane intersect; compiled
`gate.transit(at)`; carried direction normalized in destination S3 metric
at arrival. Bounds path: `e3PrimaryRayBounds` -> `e3S3TransferBounds` with
midpoint / component half-width direction conversion. Only containment
asserted. Camera station `[0,-2,0]`; 4 yaw-rotated frames
(-0.2,-0.07,0.07,0.2); 12 off-axis pixels each (160x120);
camera box 2e-4/component, station box 1e-6, `frameError` 0; 3 seeded
simultaneous camera+station perturbations per bounded crossing.
Perturbed bases used raw (never normalized; 102/102 nonunit);
only ray/transfer outputs normalized per transfer policy.

## Results (`node primary-transfer-truth.test.js`)
34/48 nominal crossings enclosed across 4 rotated frames; 102/102
simultaneous perturbations enclosed; 14 refusals, all `aperture-rim`
(edge pixels at yaw extremes), counted not weakened. No miss or
scene-safety claim inferred. Requirement (>=30 crossings, >=3 rotated
frames, boxed perturbations) met: 34 / 4 / 102.

## Fail-demo (isolated `/tmp/fail75.mjs`, no working-tree mutation)
Zeroed `directionError` with perturbed inputs: 15 unenclosed direction
components across 4 crossings (check fails as required). Note: omitting
only the destination-metric output normalization stayed enclosed here,
so the demo pins the uncertainty stage, not that stage.

## Environment
`node tools/host-probe.js`: LeoPC linux/WSL, node v22.23.2; VERDICT:
browser checks UNAVAILABLE (no worker serving; sandbox denies AF_UNIX).
Node-only task; no browser run required. No GPU jobs, commits, or pushes.

## Checks
- `node primary-transfer-truth.test.js` -> exit 0 (34 bounded, 102 perturbed, 14 rim refusals)
- `/tmp/fail75.mjs` (zeroed directionError) -> 15 unenclosed / 4 crossings
- Full suite `for f in *.test.js; do node $f; done` -> 134/134 pass, 0 fail
- `git status`: only `primary-transfer-truth.test.js` (+ this report) changed

Samples are not a universal proof; no engine defect found. No repairs made.

ACCEPTED by lead, 2026-09-12. Focused check rerun on LeoPC/Node24.20.0:
34 nominal /102 perturbed /14 rim refusals. Independent local-copy mutation
zeroing directionError fails at perturbed distance containment; source restored.
