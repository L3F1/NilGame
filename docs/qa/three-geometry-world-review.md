# Three-geometry saved world review

Lead, LeoPC / Node24.20.0, base4b75b3a plus this change, 2026-09-12 UTC.

`compileConnectedCoverWorld(document, {experimentalH3:true})` now composes
bounded E3/H3 base regions with the existing complete S3 cover. Default loading
still refuses H3. No scene format changed; the base compiler and portal compiler
are selected together. Render options are forwarded, but default GPU packing
still refuses H3. This is CPU groundwork, not a released three-geometry editor.

`levels/fixtures/connected-three-geometries.nil.json` connects E3 -> full S3 -> H3.
The focused test follows actual carried-frame movement both ways, passes the
spherical antipode, checks a two-crossing sight ray's physical distance, and
round-trips the document. It fails against the prior compiler at the H3 refusal
(`.agent-bridge/review-three-geometry.mjs`, isolated previous-module copy).

Validation: focused three-geometry and connected-cover checks pass; full
`node tools/test.js` passes 123/123 (`three-geometry-suite.log`). Queued
`page-check --connected-global` passes 52 checks on real GPU, cold shader cache,
no page error. This is existing E3/S3 regression evidence, not H3 GPU evidence.
Inspected the saved polished screenshot: sphere silhouette and shading intact;
it does not demonstrate the new route. No GPU performance improvement claimed.

Next: review Claude's explicit H3 GPU path, run rendered-ray readback checks,
then integrate this document into the existing editor transaction and preset
flow. Preserve complete S3 and rejected-edit rollback.
