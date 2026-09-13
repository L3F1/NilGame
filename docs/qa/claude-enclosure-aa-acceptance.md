# Enclosure AA acceptance probe (Claude, 2026-09-12)

Base 52b907f, isolated checkout. Not wired into the app; not committed.

## Changes

- `app/aa-refinement-probe.js`: `checkAARefinement(args, referenceOptions={experimentalH3:true})`.
  The only change is that the 2x reference renderer's constructor options come
  from the new optional second argument. The default is the previous literal, so
  the existing caller (`connected-global-preview.js:509`, one argument) is
  unchanged. All numeric/refusal/colour guards, the 960x720 resource-limit
  fallback, recovery and timing are untouched.
- `app/enclosure-aa-probe.js`: `checkEnclosureAA(model,census,shots)` creates an
  `{experimentalH3:true,enclosureRefinement:true}` renderer on its own canvas,
  builds the census pose state (same as the integration probe), calls the shared
  checker with an explicit copy of those options for the reference, loses the GL
  context in `finally`, and returns label `enclosure-aa`.

## Checks

- `node --check app/aa-refinement-probe.js`: pass.
- `node --check app/enclosure-aa-probe.js`: pass.
- `node tools/host-probe.js`: browser checks available directly; not used (task is Node-only).
- UNRUN: GPU acceptance of `checkEnclosureAA` (hardware and software), existing
  `aa-refinement` browser check regression, full Node suite. Lead to run.

## Integration caveats

- Shot names are inherited (`aa-refinement-off/on`); running both probes in one
  session will produce duplicate names. Rename/prefix when wiring if needed.
- 960x720 four-sample AA exceeds the 64 MiB four-attachment cap, so the shared
  `resource-limit` expectation should hold; 320x240 timing (~20 MiB) and the
  320x240 reference are within the cap. Unverified on GPU.
- The reference is independent in context and resolution only: it shares the
  enclosure producer/consumer code, so agreement is not an independent proof of
  that code. The shared `recovered>0` requirement may fail if enclosure AA
  recovers nothing at this pose; do not weaken it to pass.
- Run the probe with the preview loop paused (timing attribution requirement).

READY FOR REVIEW

Lead verdict: implementation accepted after code review and hardware/SwiftShader
AA checks. See enclosure-acceptance-review.md for the integrated evidence,
unchanged guards, lead screenshot-prefix fix and incomplete software timings.
The original Node-only report above remains attributed to the isolated run.
