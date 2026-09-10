# Refusal repair reviewed; scope for the first curved viewport

Base: 382ef0d, initially clean. Host: LeoPC Windows / Node v24.20.0.
Rerun: region-motion.test.js 46/46; region-motion-truth.test.js 21/21;
region-refusal-truth.test.js 8/8. Repeated refusals retain the source side,
unblock/retry works, and the sampled response/work budgets stay within caps.
Reviewed checkpoint prefixes, refund accounting and separate response counters.

Accept the finding-4 repair and MUSE-41 evidence. The staged uncertifiable
checkpoint tests its defensive branch; authored entry is guarded earlier.
Acceptance is for CPU motion scope, not a general curved walking/editor runtime.

One additional defect found and fixed here: a partially completed settle ignored
back.stalled, reported success and dropped its remaining correction. A valid
lower-bound floor (distance=z/2) at cap=29 returned no pending correction while
clearance was still 0.0013314 > skin. settle-budget.test.js failed 0/1 before,
passes 1/1 after. The result now reports exhaustion and transported residual
correction, without refunding already-consumed gameplay time. This is deliberately
separate from resuming corrections, which is not yet implemented.

Tie policy: retain deterministic refusal. The host ends that movement request,
shows the conflict, permits new steering/editing/reset and never retries old
unconsumed time automatically. Identical competing gates may remain blocked;
entity order is not a recovery policy. See REGION_MOTION_CONTRACT.md amendment.

MUSE-40 conclusion is narrowed to its evidence: no observed field defect in the
hallway, with genuine loss of geometric clearance. It does not prove whole-scene
exactness. CURVED_CLEARANCE_CONTRACT.md gives the analytic face relationship and
certified-clear / certified-blocked / unresolved semantics instead of fitting a
universal offset warning. No field change or nested-cutter resolution is claimed.

## Claude: next bounded task

Build the first usable SINGLE-REGION S3 viewport in tools/region-lab.html and
app/region-lab.js, adding engine/geometry/region-renderer.js and focused shader
helpers/tests as needed. Use a valid bounded S3 room fixture and shared compiled
render data. Initially support transported free flight through moveRegionProbe;
omit gravity/jump controls until a curved support policy is implemented.
Do not stub missing stepRegionPlayer/turnRegionPlayer exports to mimic E3 walking.
Wire the actual camera-frame API and preserve full roll in free flight.

One region, no connections for this slice: explicitly reject unsupported scenes
with a visible message instead of rendering a false destination. Keep the E3 lab.
Editor controls can retain current numeric placement/dimensions and transactional
undo/save/load. Validate the runtime patch before play; fix the new fixture, not
the global chart semantics by guessing. Report discrepancies to Astra.

Handle unresolved/domain/budget/pending-correction results visibly per the host
policy; do not replay leftover time. A reset uses a validated spawn. No clearance
certification UI required yet; the new clearance contract is for a separate task.

Acceptance: boot and first draw, correct field/render parity on the authored
room, free flight and collision, editing/undo/reload, explicit unsupported input
and unresolved states, saved images inspected, Node/scene/shader checks and
real-GPU checks through the existing queue. Record hardware/resolution and actual
frame-time evidence; do not substitute CPU query throughput. Stop after this
slice and leave a short report. No cross-region rendering or new geometry scope.

node tools/test.js: 56/56 suites passed, exit 0, including the new settle
regression. git diff --check clean. No browser/renderer verification claimed
for this CPU review; no UI or shader code changed. Work left uncommitted.
