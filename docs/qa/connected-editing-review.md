# Connected editing review — 2026-09-11

Base377c012. Lead implemented author-data patches, model transactions and renderer
texture replacement. Claude implemented the property form and browser checks;
lead reviewed/integrated them and added delayed-file ordering protection.

The existing Full S3 portals page now edits balls, portal-anchor placements and
radii, and spawn positions. Paired radii change together. Undo/redo and JSON
download/file load preserve the connected document and current viewpoint.
See docs/engineering/CONNECTED_EDITING.md for the exact supported boundary.

Evidence on LeoPC Windows, Node24.20.0:

- connected-editor.test.js: snapshots/history, stable player/camera ownership,
  CPU-invalid and GPU-unsupported candidates, simulated host rejection including
  undo, body/spawn/aperture guards, no implicit geometry conversion, and a
  reloaded E3/S3/E3 movement route pass.
- Isolated reset-on-edit mutation fails the unchanged-position assertion. No
  engine files were changed for this mutation.
- Disabling renderer replacement temporarily fails the real browser check:
  S3 radius edit did not change the drawn canvas. Renderer restored immediately.
- check-queue page-check --connected-global: 32 checks passed on NVIDIA RTX5070Ti
  ANGLE/D3D11 and SwiftShader/Vulkan. Includes real form edits, visible change,
  sparse CPU/GPU queries after replacement, exact undo images, download blob and
  real file-input reload, invalid edits preserving state/image, paired endpoints,
  delayed-file races, and the full two-portal route after reload.
- Full Node suite: 98/98, recorded in .agent-bridge/connected-editor-final-suite.log.

Failures caught: the first aperture guard expanded the disc by player radius and
rejected the existing S3 spawn outside the actual disc. It now checks the centre
against the actual aperture plus numerical slack. All reset targets are also
checked against apertures. Moving the helper exit-approach position into an edited
ball now refuses without relocating the player. Older file reads cannot overwrite
a newer file selection or an applied property edit.

Limits: existing entities only in the form; orientation shown read-only. No
creation/deletion controls, gizmos, geometry/chart conversion or new global S3
surfaces. JSON import can replace supported entity sets in the existing regions.
Next: add/remove supported balls and explicit portal-pair creation/reconnection,
using the same transaction and capacity/clearance checks. No new geometry yet.
