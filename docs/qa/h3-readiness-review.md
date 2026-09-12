# H3 readiness review — 2026-09-11

Base c3e1078. H3 is the next adapter, not yet a supported connected preset.
Found raw Euclidean frame products in camera-frame.js, region-portal.js and
connected-global-model.js; portal height/root dispatch treated all non-E3 kinds
as S3. The schema and metric factory currently prevent ordinary H3 authoring,
but the public physical-anchor compiler lacked its own refusal boundary.

Added explicit E3/S3 admission in compileFramedPortals before adapter operations.
portal-geometry-gate.test.js failed before with `adapter invoked too early`,
then passed after the fix for h3/nil/sol/unknown tags and an empty graph. Fake
adapters test dispatch only; they are not mathematical H3 implementations.

Reviewed MUSE-64 and added explicit expected normals; focused checks passed.
`node tools/test.js` on Windows LeoPC Node24.20.0: 105/105 suites passed.
No rendering algorithm or supported E3/S3 numeric behavior changed, so no new
visual result is claimed. Claude's removal/orientation UI remains isolated and
requires separate browser validation. Follow H3_CONNECTED_CONTRACT.md before
changing geometry admission, camera metrics or connected shaders.
