# Connected global preview: portal creation and reconnection UI

Base d303482. Files changed: `app/connected-global-preview.js`,
`tools/connected-global-preview.html`, this report. No engine, model, math or
test changes; no existing assertion weakened (the halt check was strengthened).

## What the page now does

**New portal pair** (`#portal-form`). Three user-visible IDs (connection, endpoint
A, endpoint B, each suggested as `portal-N`/`-a`/`-b` and replaced only while the
author has not typed), one shared aperture radius, and per endpoint: its own
region select, chart select, position and local `forward`/`up` components.
`buildPortalPair` reads every numeric field through the existing `numberField`,
so a blank or non-finite entry is refused before the model is called; a cover
endpoint must name a chart explicitly; a bounded endpoint never sets `chartId`
(the key is absent, not empty), matching `addConnectedPortalPair`'s
`Object.hasOwn` rule. Construction vectors are passed through verbatim — no
normalization, re-orthogonalisation or world-up substitution. The panel states
the one-sided rule (enter from the side `forward` points out of, travel toward
−forward) and repeats that an S3 portal image may be the far end seen the long
way around, not a nearby physical endpoint.

**Reconnect existing portals** (`#reconnect-form`). One row per saved connection
(base scene and envelope, labelled by owner), with two selects over every anchor
in the document, preselected to the saved endpoints. Apply sends every *changed*
row in a single `model.reconnectPortals` batch, so two pairs can exchange
endpoints without an intermediate graph; untouched rows are left out of the batch
because rewriting a base connection migrates its ownership to the envelope, and
the contract keeps untouched base links where they are. No stealing, deletion or
silent disconnection anywhere.

Both forms reuse the existing `editAction` wrapper: pointer lock released, a
`loadGeneration` bump that cancels a pending file read, refusal text in
`#edit-message` (never a fatal failure or a stale redraw), and the shared
history/download/load path. Both buttons are disabled while halted and
re-enabled by Reset, and both fieldsets disable themselves with an explanatory
message if the model lacks `addPortalPair`/`reconnectPortals`. The existing
guide, hints and flight controls are unchanged.

## Browser checks added (in the existing `?check` path, via the real controls)

All use the coordinates from `portal-authoring.test.js`
(`bench-nook`, `flat-bench` in `flat` at `[6,0,0]` forward `[0,-1,0]`,
`sphere-nook` in `exit-chart` at `[1,1,0]` forward `[1,0,0]`, radius `.9`):

1. Rows list every connection with all four anchors as choices and the saved
   endpoints selected.
2. Refusals with document, history, pose, world and image unchanged: duplicate
   connection ID, duplicate endpoint ID, negative radius, blank forward
   component, cover endpoint with no chart, non-orthonormal frame, and a
   reconnection onto an endpoint another pair still owns (`already connected`,
   with the owning pair untouched). Unchanged rows apply nothing and create no
   history entry.
3. Creation: exact document entities (bounded anchor has no `chartId`, in the
   document, in the observed `addPortalPair` argument and in the downloaded
   JSON), connection written into the envelope with `preserve-speed`/`scale 1`,
   both directed portals wired, nothing else in the document touched, pose kept,
   history correct, ID suggestions refreshed.
4. GPU packet vs CPU ray *through the new aperture*: an explicit pose 3 units in
   front of `flat-bench` aimed at its centre. The axis ray must cross
   `flat-bench`, and its CPU status/owner/region/distance must match the GPU
   packet (hit ⇒ same owner and distance within 1e-3; miss ⇒ status 0;
   unresolved ⇒ status 2). An 80×60 read is then sampled at stride 3: every GPU
   hit must match the CPU ray's owner, region and distance, no GPU miss may
   cover a CPU hit, and some sampled ray must cross the new aperture. The same
   probe runs with the pair absent and then requires *no* crossing.
5. One Undo removes both anchors and the connection (aperture gone); Redo
   restores all three.
6. Final swap: `enter-sphere`/`leave-sphere` exchange endpoints in one observed
   `reconnectPortals` batch, `bench-nook` untouched, pose kept, rows redrawn
   from the new graph.
7. Download equals the swapped document, reloads identically in a fresh model
   and through the file input; undo/redo restore both graphs; loading the earlier
   file removes the pair and its aperture.
8. Halt now also disables Create portal pair and Apply connections until Reset.
9. The pre-existing final block still loads the original file and flies the
   original flat→sphere→flat route.

New evidence records: `portal-authoring` (per-probe axis ray, sampled GPU hits,
crossing counts, owners); new shots `portal-pair-created`, `portal-swap`.

## Checks run here

- `node --check app/connected-global-preview.js` — passes.
- `node portal-authoring.test.js` — passes (model contract unchanged).
- `node connected-ball-authoring.test.js` — passes.
- `node connected-global-model.test.js` — passes.
- Static ID audit of the page: every `querySelector('#…')` and every templated
  `edit-*`/`ball-*`/`portal-a-*`/`portal-b-*`/`reconnect-*` ID exists in the
  HTML; no duplicate IDs.
- `node tools/host-probe.js` — run once: "browser checks run DIRECTLY here",
  queue has no worker.

## Limits

- **The browser checks above were not executed.** The assignment forbids browser
  or full-suite runs from this clone (the root queue tests the wrong checkout),
  so the new `?check` code is statically verified only; the lead must run
  `tools/page-check.js` for the connected-global page on integrated main. Any
  failure there needs investigation; static review cannot locate it in advance.
- Aperture evidence is centre-route/sampled: the axis ray plus a stride-3 grid.
  It is not a proof that the whole opening is walkable; destination clearance is
  still decided per crossing by the engine.
- The reconnect form discards unapplied row choices whenever the document
  changes (any applied edit or entity-selection change rebuilds the rows); this
  is stated in the panel text.
- Removing pairs or anchors and visual endpoint manipulation remain out of
  scope, as the authoring doc specifies.

READY FOR REVIEW — Node checks listed above all pass; browser run deferred to
the lead on integrated main as instructed.

## Lead integration review — 2026-09-11

Resumed on d303482 after the first run hit quota with no edits. Reviewed the
three-file patch; 43 real-GPU checks passed on LeoPC through the host queue.
Lead tightened sampled misses to require CPU misses, required GPU surface hits
beyond the created aperture, and corrected the saved images to use the aperture
probe pose rather than the unchanged player pose. Rerun passed; created-pair
image inspected: destination green landmark visible through the opening. Known
magenta silhouette uncertainty remains visible and unfixed. Simplified form help
and corrected back-face wording: it does not transport, rather than necessarily
raising a refusal. No kernel changes. Software result and final suite recorded
in portal-ui-review.md.
