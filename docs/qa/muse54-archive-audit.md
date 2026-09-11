# MUSE-54 docs-bloat audit (no moves applied)

Scope: AGENTS.md, MUSE.md, MUSE_TASKS.md (71 lines; no MUSE-54 entry; "No agent jobs are scheduled", MUSE-53 archived), plus filename/headline/inbound-ref inventory only. No archive body was read whole. Base 7c3bc4c. host-probe: browser checks UNAVAILABLE here (Vsock bind fail, no queue worker); Node-only audit unaffected.

## Stale startup instructions

1. `MUSE.md` "Manual launch prompt" (lines 37-43): orders MUSE-06 POSIX revision + MUSE-07 ball QA via `docs/qa/astra-review-2026-09-09.md`. Both are accepted/integrated per `muse-log.md` and `opus-integration-2026-09-09.md`. Delete or replace with "read MUSE_TASKS.md current batch + TASK_ROUTER row".
2. `MUSE_TASKS.md` "Start every session": runs full `node tools/test.js` each session; contradicts TASK_ROUTER/WORKING_RULES ("select affected checks; avoid repeated full suites"). Change to host-probe + affected checks, full suite only before integration.
3. `MUSE_TASKS.md` order line ("MUSE-53 accepted… Next direction is NEXT_SESSION.md") describes an empty queue; harmless but rots the same way the file's own note warns about.
4. `docs/engineering/CLAUDE_NEXT.md` is self-marked "Completed 2026-09-11: do not rerun"; `NEXT_CAPABILITIES.md` (2026-09-10 staging order) is superseded by contracts. Neither belongs on a startup path.

## Archive candidates (max 8; inbound refs via grep, docs+MUSE_TASKS+MUSE.md+AGENTS.md)

| # | Candidate | Size | Inbound refs (non-self) | Replacement pointer |
|---|-----------|------|-------------------------|---------------------|
| 1 | `docs/qa/overnight-results.md` (MUSE-02-05 raw log) | 95 KB / 1610 ln | 8 historical citations only, zero startup refs | `docs/qa/muse-log.md` verdicts |
| 2 | `docs/qa/astra-review-2026-09-09.md` | 4.5 KB | MUSE.md stale prompt + 4 historical cites | `opus-integration-2026-09-09.md` + muse-log |
| 3 | `docs/qa/muse01-review-history.md` (self: "rev 2 accepted") | 3.9 KB | measurements, muse-log, stale-claims (evidence only) | `muse-log.md` |
| 4 | `docs/qa/ball-editor-checklist.md` (MUSE-07 closed) | 2 KB | 4 evidence cites, zero startup | `docs/ball-lab.md` + muse-log MUSE-07 |
| 5 | `docs/qa/editor-readiness.md` (self: "not today's tree") | 4.3 KB | 4 evidence cites, zero startup | `docs/ball-lab.md` |
| 6 | `docs/qa/godot-host-slice-plan.md` | 13 KB | zero inbound refs | `docs/host-capability-map.md`, `decisions/001-runtime-strategy.md` |
| 7 | `docs/engineering/CLAUDE_NEXT.md` (self: completed, do not rerun) | 2.2 KB | TASK_ROUTER-adjacent only | `NEXT_SESSION.md` |
| 8 | `docs/engineering/NEXT_CAPABILITIES.md` (2026-09-10 staging) | 9 KB | no live startup refs | `REGION_MOTION_CONTRACT.md`, `S3_EXCLUSION_CONTRACT.md` |

Already-archived `docs/archive/next-session-2026-09-09.md` has zero inbound refs; needs no action.

## Obsolete operational vs valuable evidence

Obsolete operational (safe to archive once pointers fixed): candidates 1-8 above plus `docs/archive/pre-*-handoff-2026-09-10.md` set (superseded shift notes).
Keep live: `muse-log.md` (designated verdict archive), `measurements.md` (reproduced numbers table), `stale-claims-2026-09.md` (sweep method), `legacy-agent-reference.md` (router-gated traps; 80 KB but only 4 inbound refs — keep, do not inline), live contracts, `check-runbook.md` (only host/duration dimension WORKING_RULES lacks).

## Ready-to-apply relocation list (not applied)

```sh
git mv docs/qa/overnight-results.md docs/archive/overnight-results-2026-09-09.md
git mv docs/qa/astra-review-2026-09-09.md docs/archive/
git mv docs/qa/muse01-review-history.md docs/archive/
git mv docs/qa/ball-editor-checklist.md docs/archive/
git mv docs/qa/editor-readiness.md docs/archive/
git mv docs/qa/godot-host-slice-plan.md docs/archive/
git mv docs/engineering/CLAUDE_NEXT.md docs/archive/
git mv docs/engineering/NEXT_CAPABILITIES.md docs/archive/
# then: remove MUSE.md manual-launch block; narrow MUSE_TASKS.md startup to host-probe + affected checks
```

Checks: host-probe run once (UNAVAILABLE browser verdict, recorded above); inbound-ref greps run; no test suite (docs-only audit); no other files written.

READY FOR REVIEW
