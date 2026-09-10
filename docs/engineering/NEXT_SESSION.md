# Fresh-chat handoff for Astra

## Current review and next task

2026-09-10 at e3300e6: Astra reran both motion corpora (34/34 and 21/21)
and reproduced finding 4. Runtime verdict: REQUEST CHANGES. MUSE-39 accepted
as QA evidence and archived; MUSE-40 remains open and independent.

Decision: free-standing portals remain supported. Final approach is provisional;
on refusal return a validated strictly source-side checkpoint with matching
camera/velocity/time. Do not require walls, add cooldowns, or silently return
on-plane. Apply protection to other uncommitted portal event stops too.
Findings 5/6 require exact work/contact budgets before integration as well.

Read docs/qa/astra-region-review-2026-09-10.md for Claude's bounded repair scope
and REGION_MOTION_CONTRACT.md for the accepted amendment. These supersede the
older instruction to decide finding 4. Next Astra task: review that repair
and independent regressions, not implement renderer/editor or re-decide policy.
Nested-cutter conservatism and the S3 bound collapse remain unfixed; the latter
is MUSE-40's investigation. Last host probe found a working browser queue.

REPAIR DELIVERED 2026-09-10 by Claude, awaiting this review.
docs/qa/claude-region-repair-2026-09-10.md. A refused crossing now rolls back to
a checkpoint the PORTAL certifies is on the entering side: y = 1.999900 rather
than 2.000000, held for twelve fresh frames without ever reaching the plane,
against y = 2.000000 then y = 6.000000 before. Retreat, lateral departure and
unblock-and-retry all work with no cooldown armed. The same checkpoint holds a
portal stopped by the crossing budget; a tie returns to the pre-leg checkpoint;
a correction that reaches an aperture is discarded whole. Only discarded travel
is refunded and work counters are never undone. Findings 5/6: corrections draw on
the shared step allowance, and maxContacts: n buys exactly n responses with a
contact met-but-unanswered reported as limitingContact.
region-portal.js gained PORTAL_PLANE_TOLERANCE and signedHeight so the checkpoint
and crossing() judge the side by one number. node region-motion.test.js 46/46,
node region-motion-truth.test.js 21/21, node tools/test.js 53/53, exit 0.
Sixteen mutations, all caught; two checks exist only because the matrix found
them missing. Six checks that pinned the superseded behaviour were updated in
place with their old numbers preserved beside them, three of them Muse's.
One path is implemented but has no positive test: an entering side that cannot be
certified even at the leg start returns unresolved/uncertifiable-checkpoint, and
no scene was found that reaches it. MUSE-41 is asked to try, and is queued FIRST,
ahead of MUSE-40; the two are independent.
Also still open, and untouched by the repair: connected-lab.nil.json does not
compile, and app/region-lab.js imports stepRegionPlayer, turnRegionPlayer and
engine/geometry/region-renderer.js, none of which exist.

User preference: one difficult contract/fix per Astra task; Claude implements
and Muse checks independently. Preserve shared edits and use TASK_ROUTER.md.
Prior implementation context is archived in
`docs/archive/region-implementation-handoff-2026-09-10.md`; read only if needed.
