# Connected preview appearance review - 2026-09-11

Lead implementation after4c51c4d; Claude appearance UI/checks isolated at that
base. Host LeoPC Windows Node24.20.0, RTX5070Ti ANGLE/D3D11 and SwiftShader.
See engineering/CONNECTED_APPEARANCE.md for scope and sampling policy.

Delivered: polished local lighting, specular highlights, object-attached sphere
bands, flat-floor tiles, optional normal-probe AO. Geometry query outputs and
collision untouched. Controls default on in the global preview; shared shader
also improves bounded rooms. AO is intentionally subtle on isolated spheres.
No fog, hidden diagnostic pixels, physical shadows, or new scene/material schema.

## Verification

- NVIDIA and SwiftShader queue page-check --connected-global:12 checks passed.
  Includes previous24,000-ray five-view corpus, two-portal ray, actual flight,
  camera/exit control checks, and new appearance checks.
- At fixed80x60 return pose, all four polished/AO switch combinations preserve
  status/distance/normal debug packets byte-for-byte.328/348 hit pixels visibly
  change with polished style (>=12/255 in a colour channel).
- Test-only floor atz=-.65 under radius.6 target:160x120 view hits floor8202 times,
  target1396. Sparse CPU checks agree owner and distance. NVIDIA AO darkens96
  hit pixels by>=6/255 luminance (38floor,58sphere), brightens none. It changes
  neither query packets nor the main scene. Floor fixture exists only in checks.
- Before/after/contact images inspected at320x240. Highlights/bands and floor
  scale cues are visible; AO is subtle in the .05-unit contact gap. Magenta
  silhouette refusal outlines still exist and are not recoloured as successful hits.
- NVIDIA GPU timing:75 samples/view,320x240, median .125-.142ms,
  p90 .130-.160ms. GPU time only; no end-to-end latency or speedup claim.
- Final bounded-preview regression16 checks, shader-check passed, Worlds346.
  Final Node result below.

## Real failure caught by the new checks

Initial NVIDIA run passed. SwiftShader failed:AO brightened10/348 hit pixels.
Using a gamma2 square-root transform reduced but did not eliminate it (2 then6
pixels in subsequent runs, up to9/255 in one channel). Removing derivative-based
pattern smoothing resolved it: band smoothing now has a fixed width. Derivatives
inside divergent ray/material branches are not a dependable screen footprint.
No brightening threshold was weakened. Both backends then passed the AO test.
Gamma2 remains a simple monotone display transform; it alone was not the fix.
Future antialiasing needs a defined footprint or sample integration, not those
implicit derivatives. Flat-floor tiles may alias at distant grazing angles.

## Agent acceptance and limits

Claude's three paths scopeOK, HEAD unchanged; snapshot matches final agent code
before lead adds richer failure diagnostics and concise UI copy. Accepted after
lead browser runs. Agent reported95/95 on rerun but had an unidentified earlier
94/95; that is attributed, not substituted for lead evidence. Its attempted
clone browser run hit EADDRINUSE and is not validation (task had barred clone
browser runs). Lead validated the correct tree through the queue. No agent retry.

Next: defined pixel footprints/silhouette handling and more authored geometry,
then editable material properties. Existing arena graphics remain unchanged.

Final verification: node tools/test.js exited0, 95/95 suites passed after the derivative fix. Worlds346 passed; git diff --check passed.
