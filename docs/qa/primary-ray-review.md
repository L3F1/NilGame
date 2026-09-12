# Primary ray precision, 2026-09-12

Working change after 80392df. LeoPC, Node24.20.0. Browser checks through the
existing queue worker; hardware RTX5070Ti/ANGLE D3D11 and SwiftShader Vulkan.

The live shader now uses a shared host-computed focal scale for its existing
70-degree vertical FOV, eliminating native GPU tan from camera construction.
Metric normalization remains geometry-owned (especially H3). Debug modes4-7
read the actual primary ray before traversal. They do not replace it with a
second formula or affect normal display modes.

`e3PrimaryRayBounds` encloses camera encoding, pixel arithmetic and Euclidean
normalization using the existing binary32 interval reference. Explicit camera
error is mandatory; zero still includes float32 encoding. Scope is E3 primary
rays and viewports up to16384; H3/S3 primary bounds are not implemented.

## Evidence

- `node primary-ray-bounds.test.js`:620 directions, including all512 corners
  of a nine-component camera uncertainty box; independent pinhole construction.
- `node tools/check-queue.js page-check --three-geometry` and `--sw`:9 checks
  each. All19200 entry-view GPU primary rays enclosed on each backend.
  Largest component deviation from ideal CPU ray:1.321e-7 real,1.195e-7
  software. Widest reference component interval:3.756e-6.
- Mutation: replace live shader focal scale with1.44. Software check fails at
  pixel0,0,component0 (-.603983 vs [-.606129,-.606126]); restored run passes.
- Candidate analysis includes primary bounds through the E3/S3 transfer and
  spherical ball root reference. All52 sampled old-guard candidates classify:
  18 root sets,34 misses. Neither whole-scene ordering nor traversal is thereby
  certified. Primitive float32 packing is included; CPU root calculations use
  their documented binary64 allowance, not an assumed GPU transcendental bound.
- Both backends retain52 numerical refusals and0 confident census disagreements.
  Entry screenshot inspected: portal landmarks and existing purple edges remain.

- `page-check --h3-gpu` and `--connected-global` also passed on the real GPU.
- First full Node run:131/133; source-text assertion still required native tan,
  census mock lacked world/primary readback. Updated the assertion to require
  the shared focal value AND metric dispatch; expanded mock and added a bad-ray
  rejection. These changes preserve the original owner/range/refusal checks.

- Final `node tools/test.js`:133/133 suites passed.

Artifacts: .agent-bridge/primary-{real,sw,mutant,suite,suite-final}.log and the existing
three-editor-{real,sw}.json packets (local, ignored).

## Next implementation

Propagate error alongside live primary/transfer evaluation, then use a scoped
spherical coefficient/root evaluator with bounded transcendental error and
interval-aware event ordering. Do not substitute point roots or shrink globalE.
The interval model encloses sampled executables; reassociation, FTZ and native
normalize are not universally certified by this sample. Test further camera
poses through Muse's bounded composition task. No visible fringe repair claimed.
