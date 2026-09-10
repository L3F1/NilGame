# Fresh-chat handoff for Astra

Updated 2026-09-10. Base inspected: 7c68a62; Astra's two latest tasks remain
uncommitted in the shared tree. Claude/Muse may have progressed since this note:
check git status and recent log before editing. Preserve .codex/ and shared work.

User wants one difficult contract/fix from Astra, bounded implementation by
Claude, independent checks by Muse, and small task-specific context loads.
Do not resume the entire four-milestone plan in one turn.

Read WORKING_RULES.md, REGION_MOTION_CONTRACT.md and Claude's latest short report.
CLAUDE_REGION_HANDOFF.md is the assigned implementation scope. Other documents
are selected via TASK_ROUTER.md, not a mandatory full-file reading list.

Completed by Astra:
- camera-frame.mapFrame now takes an explicit destinationSpace; roll and metric
  ownership survive E3/S3 and distinct-radius transfers. cross-region-frame.test.js.
- moveProbe now returns actual path carry, including lift/settle, separate from
  velocity projection; contactSamples retain contact point/normal. motion-carry.test.js
  uses an independent per-leg transport formula and distinguishes endpoint transport.
- Shared rules split without losing detailed safeguards; stale handoff archived.
- Accepted region-motion policy written in REGION_MOTION_CONTRACT.md. Implementation
  is pending Claude, NOT a completed connected-room runtime.

Delivered by Claude, 2026-09-10 (CPU only, awaiting review):
- engine/world/region-motion.js: moveRegionProbe(world, state, dt, options).
  Event-limited movement, one clock, transactional crossings, shared budgets.
- collision.js sweep/moveProbe take an optional event provider queried on each
  ACTUAL geodesic leg (travel, nudge, lift, settle) and carry explicit time.
- region-world.spawn converts the construction basis into a carried camera once.
- region-motion.test.js: 34 checks; tools/test.js 49/49. Evidence and six
  findings in docs/qa/claude-region-motion-2026-09-10.md (with a same-day addendum on
MUSE-39) and docs/qa/region-motion-truth-2026-09-10.md. Finding 4 is the one
  open POLICY question: a refused crossing leaves the walker on the aperture
  plane, where the one-sided rule then declines to test it.

Important remaining gaps: walker.js is still three-component; legacy collision
portals are E3-only; domain exits are not walls; lower-bound clearance failure is
not proof of overlap. app/region-lab.js still imports stepRegionPlayer/
turnRegionPlayer and engine/geometry/region-renderer.js, none of which this task
was scoped to write; the lab does not load. levels/fixtures/connected-lab.nil.json
does not compile (S3 extent 2 exceeds a hemisphere; charts.js and metric-space.js
disagree about that limit).
Do not build a second solver or assume a full region renderer already exists.

MUSE-39 is DELIVERED and awaiting you: region-motion-truth.test.js (21 checks,
independent reference) found no disagreement with the contract and CONFIRMED
finding 4. Claude re-reproduced finding 4 without reading Muse's corpus, and
mutation-checked that corpus: it catches 6 of the 8 mechanisms, so the two
suites are complementary rather than either being sufficient. MUSE-36, 37 and 38
are accepted and moved to docs/qa/muse-log.md; MUSE-40 is the only open Muse task.

Next Astra job: accept or reject Claude's region-motion implementation, then
DECIDE FINDING 4 -- a refused crossing leaves the walker exactly on the aperture
plane, where the one-sided rule declines to test it, so they walk through it into
source space (reproduced twice: y=2.000000 then y=6.000000, crossings 0). That is
the one open policy question blocking renderer/editor integration. Two more open
items, both reported unfixed and neither Claude's to decide: the carve
predicate is conservative for NESTED cutters (MUSE-37, refuses rooms max() allows),
and the S3 distance bound collapses to ~4e-4 in open hallway at 0.35 clearance
(MUSE-38, 77x step cost) -- MUSE-40 asks whether that is bound cost or a field
defect, because MUSE-34's curvature-independent fractional shortfall cannot
produce it.
After acceptance, define the curved gravity/support policy; renderer/editor work
can then be assigned separately. S3 bubble, host migration and new modes stay later.

Evidence: docs/qa/astra-boundary-2026-09-10.md,
docs/qa/astra-motion-contract-2026-09-10.md and
docs/qa/claude-region-motion-2026-09-10.md. Browser availability is dynamic; run
host-probe in the new execution session. Last probe found no queue worker.
Existing MUSE-36..38 statuses were not changed or accepted by these tasks.
