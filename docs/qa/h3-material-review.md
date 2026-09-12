# H3 materials and three-geometry rendering

Lead on LeoPC, Node24.20.0, base88f582c plus this change, 2026-09-12.

Replaced accidental S3 material paths on H3 with metric-aware ball fields,
domain checks, light transport, band coordinates and tangent dot products.
Geometry queries and refusal thresholds are unchanged.

Durable page-check --h3-gpu now probes isolated H3 ball AO without any portals
(so near-portal suppression cannot make it vacuous) and a neighbouring-ball
contact. Both RTX5070 Ti/ANGLE D3D11 and SwiftShader produce129 isolated hits,
zero AO byte change,20 contact-darkened pixels and no brightening. Fail-before:
temporarily restored HEAD's material module, ran the same check on SwiftShader;
it failed 'H3 contact AO missing: 0 shaded pixels'. Restored current module in
finally. The isolated check alone also passed old code; the contact check is
the non-vacuous defect detector. Scratch script h3-material-before.mjs.

Probe also compiles the saved E3/full-S3/H3 fixture with the existing editor
model and renderer. A centre ray crosses twice, hits h3-target, CPU physical
distance42.099111843077516. GPU:42.09911346435547 NVIDIA,
42.0991096496582 SwiftShader. Actual model flight reaches H3, a target radius
edit preserves position, undo/redo succeed and the renderer draws afterward.
This verifies model/renderer integration, not the yet-unexposed preset form.

The13-view ray regression still has1 lost hit and no checked disagreements.
Existing queued connected-global E3/S3 regression passes52 on real GPU.
No performance claim: timer collection remains separate work. Full Node
suite passes125/125 on the approved host (h3-material-suite.log).

Inspected saved three-geometry H3 edited image: target shape and bands render,
but background remains largely magenta. A sampled sideways CPU ray reports
aperture-query with nested domain-exit from h3-entry, uncertaintyFrom0. Next
task is preserve/refine refusal provenance (numerical vs coverage) and add
classification checks before exposing the preset. Do not turn it into sky or
assume every purple pixel has that same cause. Source/CPU queries must keep
their honest unresolved status. The current probe compares unresolved status
but does not yet enforce reason-kind parity; add that check first.
