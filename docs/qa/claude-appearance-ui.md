# Appearance UI and browser checks (Claude)

Base 4c51c4d, host LeoPC (win32, node v24.20.0). Uncommitted.

## Changes
- `tools/connected-global-preview.html`: checkboxes `#polished` and `#ao`, both
  checked by default. The AO text says it is a local same-region heuristic, not
  shadowing, and does not see across portals. The diagnostics and
  approach-exit controls are unchanged.
- `app/connected-global-preview.js`: `draw()`, the change handlers and the
  timing loop pass `{polished,ao}` to `renderer.draw`. New `?check` block at the
  flat return pose:
  1. Fails with an explicit error if `renderer.readColor` is missing.
  2. Toggles the checkboxes by `click()` through all four combinations. Debug
     packets (status, distance bytes, normals; 80x60) must match a default
     `read()` byte for byte, both with explicit options and without options.
  3. `readColor` must return a Uint8Array RGBA and be repeatable. Basic vs
     polished (both no-AO): at least 10% of hit pixels must change by at
     least 12/255 in some channel. AO must not raise any channel on hit pixels.
  4. The drawn canvas must differ between basic and polished. Screenshots:
     `appearance-basic`, `appearance-polished-noao`, `appearance-polished`.
  5. AO fixture: a `structuredClone` of the scene with an E3 plane `ao-floor`
     at z=-.65 (up +z) under `flat-target` (checked to be z=0, r=.6). It uses
     its own model, canvas and renderer, and the check fails if `ao-floor`
     leaks into the main packet. At 160x120 the floor packets must not depend
     on appearance, the GPU must hit both the floor and the target, and a
     CPU spot check every 6 pixels must agree on owner and distance (≤.001).
     AO must brighten no hit pixel and darken at least 16 hit pixels by
     ≥6/255 luma. Shots: `ao-floor-basic`, `ao-floor-polished-noao`,
     `ao-floor-polished`. No AO effect is required on distant isolated balls.

## Evidence
- `node tools/host-probe.js`: browser checks run directly.
- Node-only probe (temp script outside the repo) with the return pose from
  real flight (flat,sphere,flat; 602 frames): the clone compiles, and CPU gives
  2050 `ao-floor` hits, 348 `flat-target` hits and 2402 domain-exit pixels out
  of 80x60. The main scene keeps 4 base entities.
- `node --check` on the preview module: OK.
- `node tools/test.js`: first run 94/95 (I didn't capture which suite
  failed). The immediate rerun passed 95/95. My files are browser-only.
- `node tools/page-check.js --connected-global`: **UNRUN**. Port 8771 is
  already in use (EADDRINUSE), probably by a concurrent run. The base renderer
  also has no `readColor` or appearance options, so this check stops at step 1
  until the lead renderer lands. The thresholds are unvalidated against it.

## Notes
- I couldn't delete my scratch file
  `%TEMP%\claude-floor-probe.mjs` (sandbox policy). It is outside the repo.
- Next task: run `page-check --connected-global` on the integrated renderer
  and inspect the six appearance screenshots.

READY FOR REVIEW (browser checks pending lead renderer)

## Lead verdict - ACCEPTED, 2026-09-11

Three allowed paths and unchanged HEAD verified. Integrated browser checks pass
on NVIDIA and SwiftShader. They caught a real material-derivative portability
failure; lead fixed it without weakening assertions. Final effect96 darkened
contact hit pixels, zero brightened, debug packets invariant. See
connected-appearance-review.md. Clone browser attempt and unidentified initial
suite failure are attributed only; neither is accepted as integration evidence.
