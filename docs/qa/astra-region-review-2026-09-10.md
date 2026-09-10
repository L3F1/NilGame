# Astra review: refusal must remain blocked across frames

Reviewed e3300e6, clean tree, LeoPC Windows / Node v24.20.0.
Commands rerun: node region-motion.test.js (34/34),
node region-motion-truth.test.js (21 checks passed, 0 failed).
The second reproduces blocked-exit at y=2, followed by y=6 in the same source
region with zero crossings. These are current results, not copied historical counts.
Host probe: browser checks available through worker PID 2672; no GPU check needed
for this contract-only review. Full suite not rerun; no executable changes made.

## Verdict

Request changes on runtime integration. Accept MUSE-39 as an independent QA
deliverable, not as certification of every contract clause. Its finding 4 is
valuable; its 'no disagreements' statement does not supersede the explicit
pre-aperture return requirement. Its two documented mutation gaps remain covered
by Claude's complementary tests. Original reports remain intact as evidence.

Finding 4 is a defect against the intended policy, not permission to require
walls: free-standing portals remain supported. Keep a validated source-side
checkpoint and make the final approach provisional until destination commit.
Refund only discarded gameplay travel; preserve work counters. This is now
specified in REGION_MOTION_CONTRACT.md, including grazing and retry behavior.

Also request correction of findings 5/6 before integration: global budgets were
explicit acceptance requirements. Pre-existing correction loops are not exempt.
Do not raise the cap or rename an overrun to preserve old tests. Fix tests that
pin the superseded behavior with fail-before evidence for the actual cap.

Other items remain separate: nested-cutter conservatism is unresolved and fails
in the conservative direction; MUSE-40 owns investigation of S3 bound collapse.
Neither is fixed or dismissed here. Broken region-lab imports and the invalid
connected fixture also remain; correcting refusal alone will not make a playable
or visually validated connected room.

## Claude follow-up: bounded repair, then stop

Read REGION_MOTION_CONTRACT.md's finding 4 amendment. Allowed writes:
engine/world/collision.js, region-motion.js and region-portal.js; focused motion
tests; a dated QA report. No shader, editor, schema or geometry-field redesign.

1. Add checkpoint/rollback and shared source-side classification; preserve the
   actual path prefix, pending correction state and clock. Do not replay a move
   with a shortened dt: that can choose a different lift/contact path.
2. Apply the same protection to uncommitted budget/tie/correction stops.
3. Bound lift/settle/offset work by the actual remaining budget. Zero contacts
   permits detecting a limiting contact but no contact-response processing;
   distinguish detection diagnostics from the counted response list.
4. Add repeated-frame regressions, unblock-and-retry, retreat, S3 grazing,
   checkpoint camera/time and exact budget assertions. Update the old finding-4
   reproduction to assert the repaired behavior; preserve this report's old numbers.
5. Demonstrate fail-before/pass-after. Run both motion corpora plus focused
   collision/camera suites and tools/test.js. Stop with a short review report.

Muse follow-up after repair: independently check repeated refusals, restored
destination clearance, time refunds and exact budget caps. Test/report only;
no engine fixes. Keep MUSE-40 independent. Astra then reviews the repair before
renderer/editor integration, rather than silently treating this decision as a pass.
