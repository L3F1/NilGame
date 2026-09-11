# MUSE-62 report: portal-authoring truth (pre-implementation)

Contract: docs/engineering/CONNECTED_PORTAL_AUTHORING.md. No kernel/app
edits, no new authoring API, no false-claim repairs needed: every tested
contract claim HELD on the current compiler. New corpus uses one explicit
pair throughout: flat-bench (E3 [6,0,0], fwd [0,-1,0]) + sphere-nook
(exit-chart [1,1,0], fwd [1,0,0]) + bench-nook, r=0.9, body 0.25.

## Checks (all in portal-authoring-truth.test.js, all passing)

- Atomic create: anchors + connection compile as one graph (6 directional
  portals, IDs/regions/radius pinned); pristine fixture still yields 4;
  removing all three records restores the original set (undo analogue).
- E3/S3 centre crossing via moveRegionProbe flat->sphere with crossing
  counted; camera carried (space identity, sits at walker, forward unit).
  Reverse sphere->flat through the same pair via movement API, camera
  carried back to flat space.
- Rejections: occupied endpoint (`already connected`), radius mismatch
  (`radii must match`), parallel forward/up (`orthonormal`), duplicate
  connection ID (`Duplicate world ID bench-nook`), unknown chart
  (`unknown chart`).
- Swap: rewriting enter-sphere alone fails on the doubly-used sphere-exit;
  completing the batch compiles with stable connection IDs.
- Migration: pair record in baseScene.connections fails in validateScene
  (`connection bench-nook: unknown anchor sphere-nook` — even earlier
  than the contract's "base compiler cannot resolve"); envelope form
  compiles; untouched base connections stay put.
- Obstructed destination: blocker ball at the nook chart point compiles
  fine (compiler is not walkability proof; independent gap<0 pinned via
  portal.transit), then movement refuses with
  blocked-exit/destination-clearance-insufficient and retains flat.
- Fail-demo: ID-uniqueness + radii-match naive check passes an
  endpoint-stealing graph the compiler rejects. Round-trip: pair survives
  JSON serialization with 6 portals.

## Commands, host, limitations

- `node portal-authoring-truth.test.js` -> full pass (see console line).
- `node tools/host-probe.js` -> browser UNAVAILABLE (no worker serving);
  Node-only task, no browser required. No full suite/queue run per brief.
- Transaction/undo are compile-boundary only (no pair-authoring or undo
  API exists yet); GPU capacity, spawn/current-player placement, and UI
  one-sided-direction display are NOT covered here. Fail-demos used
  in-memory structuredClone only; no scratch files to remove.

READY FOR REVIEW
