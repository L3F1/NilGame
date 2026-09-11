# Claude assignment: implement the accepted region-motion contract

Historical assignment, completed. Correction resumption and first spherical
walking are now implemented. Current Claude follow-up:
docs/engineering/CLAUDE_NEXT.md (editor overlays and bounded host-service proposal).
Do not restart the old assignment below.

From Astra, 2026-09-10. One bounded CPU kernel task; no full milestone expansion.

## Read

Shared working rules, REGION_MOTION_CONTRACT.md, then current collision.js,
region-portal.js, region-world.js and camera-frame.js. Read metric-space.js as
needed. Do not reload old QA logs, the whole backlog or the chat history.
Check git status: Astra's current work is uncommitted in this shared tree.
Preserve it and other agents' work. Run host-probe; this task requires only Node.

## Implement

Implement host-free moveRegionProbe and event-limited movement by extending the
existing sweep/moveProbe loops. Contract is in REGION_MOTION_CONTRACT.md.
Preserve legacy callers and E3-only legacy portal behavior. Do not duplicate the
collision solver or wire the three-component walker into S3.

Allowed implementation files:
- engine/world/collision.js (event stops, time accounting, shared budgets)
- engine/world/region-motion.js (new region coordinator)
- engine/world/region-portal.js (validated crossing inputs/range/event behavior)
- engine/world/region-world.js (spawn conversion to the settled runtime state)

Allowed supporting files: new region-motion.test.js and focused root tests,
levels/fixtures/connected-motion.nil.json if needed, a dated docs/qa report,
NEXT_SESSION.md and the relevant TODO item. Changes to metric mathematics,
schema, camera policy or the accepted contract require a concrete finding for
Astra rather than an improvised design. No app/shader/UI edits in this task.

Sequence:
1. Add tests for event stops on actual legs and remaining time after sliding.
2. Extend the existing solver; keep all previous checks meaningful.
3. Add atomic region coordination, mapped camera/velocity, source/destination
   clearance, domain exits and global budgets.
4. Run the acceptance cases in the contract, focused suites and tools/test.js.
   Demonstrate fail-before for representative new behavior. No weaker tolerances
   or deleted assertions merely to make a previous suite pass.
5. Report exact files, command/host/results, unresolved issues and next task.
   Mark CPU implementation ready for independent review; do not claim a playable
   connected room, browser validation or renderer parity.

Stop here. Gravity walking, editing integration, renderer and portal images are
separate tasks. If a contract is inconsistent, provide a minimal reproduction
and stop the dependent portion rather than designing a second policy.

## Independent Muse follow-up (blocked until implementation is ready)

Do not interrupt Muse's existing MUSE-36..38 work or mark it accepted.
After this implementation is stable, assign a separate bounded review:
- Allowed writes: region-motion-truth.test.js and a dated docs/qa report only.
- Read the contract and public API; no engine/app fixes.
- Independent analytic free-flight/time reference, off-center/tilted round trips,
  R=0.5/8/100 and same-dimension distinct radii; collision-before-portal;
  blocked exits, exact end crossing, return crossing, tied events and exhaustion.
- Check source ownership/input immutability on failed commits. Verify elapsed
  plus remaining time, distinguish rest time from travel and zero-time corrections.
- Demonstrate a failing mutation in an isolated copy, restore, run focused/full
  Node checks. Report findings without weakening tests or changing policy.

Have Astra review the result before renderer/editor integration. Supply the
short report path and current revision/diff, not this entire conversation.
