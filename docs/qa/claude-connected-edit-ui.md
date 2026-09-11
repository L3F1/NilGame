# Connected global preview: bounded entity editing UI (Claude)

Base 377c012, LeoPC Windows, Node v24.20.0, 2026-09-11. Uncommitted, isolated checkout.
No renderer, engine or model changes. The model history API and `renderer.replaceWorld` are lead-owned.

## Files

- tools/connected-global-preview.html: `#editor` fieldset. It has region and entity selectors (id · kind ·
  chart/region), a chart-frame note (anchor forward/up shown read-only), number inputs x/y/z/radius,
  Apply/Undo/Redo, Download JSON, a file input for Load JSON, and a separate `#edit-message` role=status.
- app/connected-global-preview.js:
  - `let renderer`, then the model with `installWorld: w => renderer.replaceWorld(w)`, then the renderer.
  - Fields come from `model.document()`. Only changed properties are patched, in chart-local coordinates
    with no conversion. Ball/anchor: position and radius. Spawn: position.
  - An anchor radius change adds every endpoint joined to it by a base-scene or envelope connection,
    all in one `editEntities` call.
  - Each action stops flight and releases the mouse first. A refusal only writes the edit message:
    no `failure()`, no redraw. Success refreshes the form and redraws.
  - Apply/Undo/Redo/Load are disabled while halted. Undo/Redo follow `canUndo`/`canRedo`.
  - If the model has no `editEntities`, the fieldset is disabled.
- `?check` appends edit checks after the existing ones, which are unchanged. All go through the page controls:
  1. S3 `north-landmark` radius .6→.75. The document changes only that value, `model.world` is replaced,
     pose is kept, canvas and `readColor` differ, and a sparse CPU/GPU spot check passes.
  2. Undo gives the exact document and original image. Redo gives the edited document and image.
  3. The Download handler (blob captured, download suppressed) matches `document()`. A fresh model and
     the file-input handler (`DataTransfer` + `File`) reload it exactly. A malformed file is refused.
  4. Radius −0.5 and 1.2 are refused. Document, history, buttons, pose, world, image and status are unchanged.
  5. flat-entry radius .9→.7 also sets sphere-entry in one observed call. One undo restores both.
  6. Spawn y edit and undo. A halt disables controls; reset re-enables them.
  7. The original download is loaded and the flat→sphere→flat route is flown.

## Checks

- Host probe: browser checks run directly. Per handoff, no browser run or queue from this clone.
- `node --input-type=module --check < app/connected-global-preview.js`: PASS.
- `git diff --check`: PASS.
- Browser edit checks 1–7: **NOT RUN**. They need lead integration.
- Fail-demos: not run.

## Risks

- Radius 1.2 is refused only if the renderer's packer error (S3 angular radius > .1) reaches the model's
  candidate validation before commit.
- The checks assume `loadDocument` keeps the pose, and that the document keeps `baseScene`/`coverRegions`/`connections`.
- The landmark pose is found by a yaw/pitch sweep (≥20 pixels).
- Halting assumes backward flight from the flat spawn reaches the extent within 900 frames.

READY FOR REVIEW (pending lead integration; browser checks unrun)

Lead acceptance: integrated checks passed on real GPU and SwiftShader, 32 total.
Added stale-file ordering tests and nonfatal convenience-placement refusal handling.
The missing-renderer-update mutation fails on the unchanged drawn canvas. Report:
docs/qa/connected-editing-review.md. No original test thresholds were weakened.
