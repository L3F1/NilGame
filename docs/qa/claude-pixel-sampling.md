# Connected pixel sampling UI and browser check (Claude)

Base 8a9428c, LeoPC Windows, Node v24.20.0, 2026-09-11. Uncommitted, isolated checkout.
No renderer, shader, query, model or threshold changes. The antialias implementation is lead-owned.

## Files

- tools/connected-global-preview.html: checked **Smooth edges** checkbox (`#smooth`) with a note.
  If any sample is uncertain, the pixel stays magenta. The unresolved-ray highlight uses one centre ray.
- app/connected-global-preview.js: `draw()` passes `antialias: smooth && !diagnostics`.
  `appearance()` is unchanged, so existing checks and pose timings keep antialias at its default.
  `?check` adds, at the return pose (flat-target silhouette):
  1. Checkbox starts checked and diagnostics unchecked. Debug packets at 320×240 stay
     byte-identical for default, `antialias:false/true`, the UI options and diagnostics+antialias,
     with the checkbox off and on.
  2. `readColor` default is byte-identical to `antialias:false`. The smoothed read is repeatable.
  3. A separate renderer reads 640×480 centre-ray debug and non-AA colour. High-res pixel
     (2x+dx, 2y+dy) is exactly low-res sample (x+.25+dx/2, y+.25+dy/2). If all four samples
     hit, AA colour must equal 255·sqrt(mean((c/255)²)) within 2/255 per channel. If any
     sample is a numerical refusal (status 2, kind ≠ 1), the pixel must match that sample's
     uncertainty colour within 2. Required: ≥256 eligible and ≥32 pixels differing ≥12/255
     from centre sampling. Runs for polished+AO and basic.
  4. Screenshots `smooth-edges-off` and `smooth-edges-on` at the same view must differ.
     With the highlight on, the canvas must be identical with smoothing on or off.
  5. Timing record `smooth-edges-timing` (return pose, `dimensions()` resolution): separate
     `antialiasFalse` and `antialiasTrue` arrays of `gpuMs` and `cpuSubmitMs`. Each gets 15
     warm-up, 75 timed and 10 drain frames, plus hardware and timer support.

## Checks

- Host probe: browser checks run directly here. Per handoff, no browser run or queue from this clone.
- `node --input-type=module --check < app/connected-global-preview.js`: PASS.
- `git diff --check`: PASS.
- Renderer-dependent checks 1–5, screenshots and timings: **NOT RUN**. They need the lead's
  antialias renderer and an integrated browser run.
- Fail-demos: not run.

## Risks

- Thresholds (256, 32) come from 348 flat-target hits at 80×60 in earlier QA, not a measurement here.
- If the shader computes sample rays differently, grazing silhouette samples could hit in one
  path and miss in the other. A failure names the pixel and its samples.
- If a query resolves over 25 frames late, it could fall into the other mode's array.
- Existing check screenshots now show the smoothed display.

READY FOR REVIEW (renderer-dependent browser checks unrun)

Lead integration: extended reference checks and separate timings to spawn,
spherical quarter-orbit, and return poses. Existing thresholds retained.
Integrated real-GPU checks passed; uncertainty is exercised (not vacuous).
Lead disabled the antialias uniform in a temporary mutation: browser check failed
on the missing numerical marker at pixel 131,48. Renderer restored immediately.
Final acceptance and measurements: docs/qa/connected-pixel-sampling-review.md.
Lead also disabled the initial checkbox on known software renderers after
SwiftShader measurement; browser tests verify that backend-dependent default.
