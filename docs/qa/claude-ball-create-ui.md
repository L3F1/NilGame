# Ball creation/removal UI — connected global preview (Claude)

Base 4efd6b3. Files: `app/connected-global-preview.js`, `tools/connected-global-preview.html`, this report.
No model/engine edits, commits or agents.

## UI
- **New ball** form (inside the editor): editable ID pre-filled with a unique `ball-N` (checked against every
  world ID; refreshed only if the author hasn't typed their own), chart dropdown, x/y/z, radius, Create.
  - Cover region: chart list comes from the selected region and refreshes when the region changes. The
    placeholder "Choose chart…" must be replaced, so `chartId` is always an explicit choice.
  - Base E3 region: the chart dropdown is disabled and `chartId` is left out entirely.
  - Blank x/y/z/radius is refused. The player's position is never used as a default.
- Calls `model.addBall({id,regionId,chartId?,position,radius})` through `editAction`, so pointer release,
  async-file cancellation, refusal message and history behave as before. The new entity is selected on success.
- **Remove selected ball**: enabled only for `kind:'ball'` with no `op` or `op:'add'`. It calls `model.removeBall(id)`
  with no confirmation (Undo restores it). Disabled while halted or if the model lacks addBall/removeBall.
- Existing fields and checks are unchanged. `spotCheck` gained an optional pose.

## Browser checks added (`?check`, before the original-file round trip and route flight)
- Remove is disabled for flat/sphere spawns and all four anchors, and enabled for flat-target/north-landmark.
  Chart options per region. Suggested ID is fresh.
- E3 ball created through the form: no `chartId` in the observed addBall call, document or download. Undo restores the document.
- Refused with document, history, pose, world and image unchanged: ball over the current body (flat, ≥0.5 from spawn),
  duplicate ID, radius −0.5, radius 1.2, missing chart, blank x.
- `authored-ball` (sphere, north-chart [3,2,0], r .6) is selected and appears in the document, `world.regions`,
  `renderData` and the GPU packet (ids +1).
- Explicit pose 2.5 units from the ball centre (from world data; no chart conversion in the page): CPU centre ray
  distance matches analytic 1.9 within 1e-4, and the GPU ray matches owner/region/distance within .001. The aimed
  80×60 view and the player's view pass sparse CPU/GPU owner checks, so owner indices are re-decoded.
- Remove → Undo → Redo → Undo → Download → Undo → load saved (ball present) → load earlier download (ball absent).
  Each step checks the exact document, packet ids, centre ray, sparse views, pose and buttons.
- The original fixture is then reloaded and the original flat/sphere/flat route still flies.

## Results
- `node --check app/connected-global-preview.js` (Node v24.20.0): **OK**.
- DOM id cross-check (all referenced `edit-*`/`ball-*` ids exist, no duplicates): **OK**.
- `host-probe`: browser available directly, but per the handoff **no browser run from this clone**.
- **PENDING integrated checks**: full browser `?check` and Node suite after the lead's `addBall`/`removeBall`.
  Until then the check stops with "Ball create/remove checks pending lead integration".

Uncertainty: exact refusal wording for body overlap (the check matches `/player clearance|overlap/i`). The expected
cover-entity shape `{id,kind,chartId,position,radius}` and base shape `{id,regionId,kind,position,radius}` are assumed.

READY FOR REVIEW

Lead acceptance: 37 integrated checks passed on real GPU and SwiftShader. Added
chart IDs to suggested-ID collision checks, reset creation chart on region change,
and an actual earlier-owner removal/reindex test. The independent Node southern
chart reference and wrong-chart mutation also pass/fail as intended. Details:
docs/qa/connected-ball-authoring-review.md. No thresholds weakened.
