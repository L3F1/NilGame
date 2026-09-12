# Connected global preview: portal pair removal and anchor reorientation UI

Base c3e1078. Files changed: `app/connected-global-preview.js`,
`tools/connected-global-preview.html`, this report. No kernel, model, shader or
test changes; no existing assertion weakened (the halt check was strengthened
again). `model.removePortalPair` and anchor `forward`/`up` in
`patchConnectedEntities` already exist on this base and are used as they are.

## What the page now does

**Remove a portal pair** (`#remove-form`). One button per SAVED connection,
built from `model.document()` in `refreshRemovals` and labelled
`Remove <connection>: <a> ↔ <b>` with the endpoints the document records, plus
the owning container. The reconnect rows above are never consulted: the saved
record is re-read again at click time, so an unapplied draft cannot rename or
redirect a removal. `model.removePortalPair(id)` then deletes that connection
and its two anchors as one transaction. Zero pairs still render, as an explicit
`#remove-empty` sentence. The panel states plainly that you are not moved and no
route is promised — removing the last exit can leave a region with no way in or
out while you stand inside it — and that Undo, a saved file or a spawn is the
recovery, with no auto-teleport; it also warns that Undo itself is refused while
your body is on the restored aperture.

**Anchor orientation.** `EDITABLE.anchor` gains `orientation`; six
`#edit-fx…#edit-uz` fields are enabled only for anchors and show the saved
frame. `buildEdits` sends both vectors explicitly and verbatim through the
existing `editEntities` call — no normalization, no re-orthogonalisation, no
world up, no chart conversion, no camera rebuild — for the selected anchor
ONLY; unlike radius, the partner is never rotated. A frame that is not
orthonormal is refused by the document validator (`anchor …: forward and up must
be orthonormal`) and nothing is written.

Both reuse `editAction`: pointer lock released, `loadGeneration` bump that
cancels a pending file read, refusal text in `#edit-message` (never fatal, never
a stale redraw), shared history/download/load. Removal buttons are disabled
while halted and re-enabled by Reset; `#remove-form` disables itself with a
message if the model lacks `removePortalPair`.

## Browser checks added (existing `?check` path, via the real controls)

1. One removal button per saved pair, naming the connection and both saved
   endpoints; a stride-3 CPU/GPU probe three units in front of `flat-entry`
   before any removal.
2. Undo safety: remove `enter-sphere`, walk the eight quarter-unit steps onto
   `[0,0,0]`, Undo refused (`aperture`) with document, history, pose, world and
   image unchanged, then accepted one step back.
3. Removal on the SWAPPED saved graph while the reconnect rows hold a
   disagreeing draft: exactly `flat-entry`, `sphere-exit` and their connection
   go; no anchor left behind; world and GPU-packet (`packed.counts[3]`) portal
   links each drop by two; the surviving pair, pose and history are intact; the
   removed connection leaves the reconnect rows and the entity list; no ray
   crosses the removed aperture.
4. Last pair removed: zero world and packet portal links, empty removal and
   reconnect lists still rendered, `renderGuide()` reports no portal, the
   portal-free view still draws (screenshot at the probe pose) with CPU/GPU
   parity over the sampled grid, and `approach-exit` refuses without moving the
   player. A view with no GPU hits is recorded as vacuous, not claimed as parity
   evidence.
5. Undo/redo of both removals, JSON download, fresh-model load and file-input
   load, then reloading the two-pair file restores both apertures.
6. Orientation fields appear for anchors only (ball and spawn disabled) and show
   the saved frame; parallel frame, non-unit forward and blank component refused
   with nothing normalized.
7. `flat-entry` turned to forward `[-.6,-.8,0]` in its own frame: one observed
   `editEntities` edit with exactly `{forward,up}`, partner anchor, partner
   aperture normal, other pair, connection record and player pose unchanged, and
   the directed portal normal equal to the typed components.
8. CPU/GPU sight through the rotated aperture at the new axis
   (`[-1.8,-2.4,0]` looking `[.6,.8,0]`): the axis ray crosses `flat-entry` and
   `sphere-exit` to `flat-target`, and its length must equal the saved-frame
   route plus exactly one unit, GPU within 1e-3, with the stride-3 grid in
   agreement. Screenshots use the probe pose, not the player pose.
9. Rotation undo/redo, download and file reload; halt now also disables every
   removal button until Reset.

New evidence record `portal-removal`; new shots `portals-removed`,
`portal-rotated-aperture`.

## Checks run here

- `node --check app/connected-global-preview.js` — passes.
- `node portal-removal.test.js` — passes.
- `node portal-authoring.test.js`, `node connected-ball-authoring.test.js`,
  `node connected-global-model.test.js`, `node connected-editor.test.js` — pass.
- Static ID audit (temporary script): 74 unique HTML ids, no duplicates, all 70
  static `#…` selectors present, and the three generated ids the checks query
  (`reconnect-*`, `remove-portal-*`, `remove-empty`) are assigned by the page.
- Scratch Node probe of the geometry the browser check asserts, on the real
  model: saved-frame axis ray `hit flat-target` via `['flat-entry',
  'sphere-exit']` at `42.099111843077516`; after
  `editEntities([{id:'flat-entry',patch:{forward:[-.6,-.8,0],up:[0,0,1]}}])` the
  directed normal is `[-0.6,-0.8,0]` and the new-axis ray gives the same owner
  and route at `43.099111843077516` — difference from saved + 1 is exactly `0`.
  The same pose before the rotation hits `north-landmark` after one crossing,
  so the probe really does depend on the anchor's frame. Both refusal messages
  match `/orthonormal/` with the document unchanged.
- `node tools/host-probe.js` — run once: LeoPC, Chrome starts, "browser checks
  run DIRECTLY here", queue has no worker.

## Limits and unrun checks

- **The nine browser checks above were not executed.** The assignment forbids
  browser, full-suite and queue runs from this clone even though host-probe says
  a direct run is possible; the lead must run `tools/page-check.js` for the
  connected-global page on integrated main. Static review cannot locate a
  failure there in advance.
- Highest-risk unrun assertions, in order: the required GPU surface hit beyond
  an aperture on the long two-portal route (`before-removal`, `reloaded`,
  `rotated-aperture`) if the GPU refuses more of that route than the CPU; the
  exact `saved + 1` axis length on the GPU side (CPU verified above in Node);
  and the zero-portal view, which is allowed to be vacuous but is recorded.
  The `after-undo` probe on the rewired swapped graph deliberately does not
  require a destination surface.
- Aperture evidence stays centre-route and sampled (axis ray plus a stride-3
  grid); it is not proof that a whole opening is walkable. Destination clearance
  is still decided per crossing by the engine.
- Undo of a removal remains subject to the existing body/spawn/host checks; the
  page reports the refusal and keeps the history entry, it does not force it.
- Three scratch scripts were written to `%TEMP%` (`nil-id-audit.mjs`,
  `nil-rotate-probe.mjs`, `nil-refusal-probe.mjs`); this session may only delete
  files inside the checkout, so they remain there. No repository file outside
  the three allowed paths was touched, and nothing was committed.
- Visual endpoint manipulation and generic dangling deletion remain out of
  scope, as the authoring doc specifies.

READY FOR REVIEW — Node checks listed above all pass; the browser run is
deferred to the lead on integrated main as instructed.

## Lead acceptance — 2026-09-11

Reviewed the three-file patch against the committed model API. Queued connected
global checks: 52 passed on real GPU and 52 on SwiftShader, no page errors.
Inspected portal-rotated-aperture image: destination visible through rotated
opening; known magenta numerical silhouettes remain. Zero-portal rendering,
saved-versus-draft removal, unsafe Undo and original route all passed. Lead
shortened the form help and corrected the old blanket claim that anchors cannot
be removed. No behavior/assertion changes after browser runs.
Core/Muse/geometry-gate Node suites: 105/105 this session, before UI integration;
Claude's DOM module also passes node --check. Logs: .agent-bridge/portal-removal-gpu.log
and portal-removal-sw.log. H3 is specified but not yet implemented.
