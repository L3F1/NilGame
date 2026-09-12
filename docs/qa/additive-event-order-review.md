# Interval-aware additive event ordering, 2026-09-12

Base017901c. Added selectAdditiveEntry and matching GLSL firstAdditiveEntry in
engine/geometry/additive-event-order.js. These remain separate from the live
connected trace. No shader refusal threshold or display color changed.

Contract: all solids are additive, their starting occupancy is certified outside,
and the supplied root intervals enclose their possible boundary events. The
selected entry's entire band must precede every other event band. Overlapping
bands and touching endpoints refuse; uncertain later events do not erase a
certified foreground entry. Unknown queries with no exported events conservatively
block from distance0. Source/target horizon contact refuses. CPU output retains
lower/upper bounds and owner, not a fabricated exact hit distance or normal.

This is not a Boolean CSG occupancy sweep. The GPU accepts prevalidated packets
of at most32 bands and refuses capacity overflow; callers must not truncate.
Explicit outside-start and candidate completeness checks remain caller duties.
Geometry, aperture and range errors must be represented in those packets before
this helper can replace existing event selection.

Evidence on LeoPC/Windows/Node24.20.0:

- additive-event-order.test.js checks overlaps, equality, endpoints, uncertain
  prefixes, empty scenes and missing outside certification.42 strict-order
  cases are checked by independently sampling actual times at band endpoints.
- `node tools/check-queue.js page-check --three-geometry` and the same with
  `--sw`:9 browser checks pass each. The isolated ordering shader matches CPU
  results in8 cases (including order reversal, overlap, endpoint equality and
  range refusal), on RTX5070Ti/ANGLE D3D11 and SwiftShader.
- Both backends reject a shader mutation that removes the interval-overlap test.
  The production shader is not modified during this check.
- Existing transfer probe:60 cases/540 components still enclosed on each backend.
  Gallery census unchanged:52 numerical refusals, zero confident disagreements
  in19200 center rays. The purpose is safe ordering, not a claimed visual fix.

Next: GPU propagation of upstream uncertainty plus spherical root intervals,
then one explicitly supported connected path can consume this selector. Do not
shrink E, reuse interval midpoints as exact events, or silently treat a partial
list of events as complete.

## Muse review and delegation

MUSE-74 rev1 returned36 passing samples and no counterexample. Lead review found
its raw perturbed direction is nonunit, but it compared raw carry(v) against the
interval API's normalized output. Broad intervals masked the oracle mismatch.
Rev1 is NOT accepted. A bounded revision was launched in a new isolated clone:
keep the raw input inside its declared box, normalize transported output at its
destination under the S3 metric, rerun checks and explain the correction.
Do not confuse that output normalization with modifying the declared input.
Its new task/report remains pending review; no Muse code integrated here.

Full approved-host Node validation:131/131 suites passed, node tools/test.js;
log .agent-bridge/additive-event-suite.log. Muse revision still running at review.
