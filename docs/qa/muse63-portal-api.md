# MUSE-63 portal authoring API checks

Base d3034824, Node-only, no source edits. host-probe: browser UNAVAILABLE
here; no browser/queue/full-suite work attempted.

## New test: portal-authoring-api-truth.test.js (passes)

Exercises the real `addPortalPair`/`reconnectPortals` plus undo/redo/load, on
the deterministic bench-nook E3/S3 pair. Nominal create, radius/frame,
player/spawn, capacity and host-refusal cases stay with portal-authoring.test.js
(still passing, untouched).

- Invalid final-graph corpus (8, each refused with doc/world/state/packet and
  undo/redo stacks bit-identical): cover endpoint without chart, base endpoint
  with chart, unknown chart, unknown region, duplicate anchor id, self-loop
  reconnect (`a == b`), convergent batch (two connections claiming one
  endpoint), reconnect to unknown anchor. Self-loop and convergent-batch
  reconnects are the missing adversarial cases the lead suite never sends.
- History: create, undo, failed add, then redo still restores the exact created
  document; the failed edit preserves the redo stack.
- Ownership/metadata: rewritten base link migrates to the envelope keeping its
  full record (`kind`/`velocity`/`scale`); untouched base link keeps ownership;
  undo/redo replay the migration. Base anchor lands chart-free in baseScene,
  cover anchor keeps `exit-chart`.
- Crossings via real `moveRegionProbe`: created pair crosses flat->sphere and
  back after JSON save/load into a fresh model, and crosses forward again after
  a neighbouring two-pair fixture swap.
- Camera: expected exit direction rebuilt independently from author records
  (own dot/cross/chart-decode code, half-turn frame map, never
  `portal.transit/carry`); carried camera forward aligns dot > 0.999 both ways,
  unit and S3-tangent within 1e-9, camera space transported. Unit checks alone
  are not claimed as transport proof; the frame-map alignment is the evidence.
- Fail-demo (in-memory copy only): un-migrated baseScene record pointing at a
  cover anchor fails `unknown anchor sphere-nook`; live model unchanged.

## Defects

None found. Two test-side mistakes fixed during drafting (untouched pair
colliding with migration targets; global-S3 decode needing the author chart);
both were wrong expectations, not product behavior.

READY FOR REVIEW — `node portal-authoring-api-truth.test.js`: all sections
pass; neighbours `portal-authoring.test.js`, `portal-authoring-truth.test.js`
re-ran green. No commits.

## Lead review — 2026-09-11

Accepted after source review and focused rerun on Windows Node24.20.0.
The lead tightened forward alignment to 1-1e-9 and added independently mapped
up-vector checks in both directions. Isolated mutation adds 180 degrees of roll
to the portal frame map while preserving centre-ray forward; the up check fails
as intended (`node .agent-bridge/muse63-roll-fail.mjs`). Main engine untouched.
Chart decoding and transport still use production metric primitives: this is
independent portal-frame assembly evidence, not an independent S3 math proof.
History flags alone do not expose full stack contents; actual redo restoration
is the stronger observed history check. No product defects found in this corpus.
