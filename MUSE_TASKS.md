# Muse task queue

Prepared assignments, not automatically running jobs. Shared rules: MUSE.md
and docs/engineering/WORKING_RULES.md. Current overnight authorization is below.

## Overnight execution

Current batch: MUSE-08 -> MUSE-09 -> MUSE-10. MUSE-01 through MUSE-07 are all
accepted and integrated; do not reopen them. Read
docs/qa/opus-integration-2026-09-09.md for the current verdicts and the one
defect found at integration; docs/qa/astra-review-2026-09-09.md and the older
batch review are history.

Baseline has moved: this queue's work is committed and pushed to origin/main.
Start from a pull and the new HEAD, not from b9b42e7. Two environment facts
changed and are worth knowing before you plan: headless Chrome now WORKS on the
Windows host (real-GPU cold page-check --worlds gave 346 checks, exit 0), and
the WSL socketpair block is unchanged, so browser checks still cannot run from
WSL. Node-only work still runs anywhere.
The user authorizes
these bounded tasks while Astra is unavailable. Mark each READY FOR REVIEW
with evidence, then continue to the next independent task without waiting for
acceptance. Do not self-accept or expand the queue.

Use this checkout serially while the lead is idle. Inspect status first and
preserve pre-existing edits, the accepted report and .codex/. If another agent
is editing an assigned file, stop that task and move to an independent one.
Do not stage, commit, merge, push, switch branches or reset this shared tree
during this overnight batch. Integration remains with the reviewer.

Before substantive work, record branch/hash, OS, Node executable/version and
available browser/backend in docs/qa/overnight-results.md. Run
`node tools/test.js` and `node tools/scene-check.js` once for a baseline.
For this continuation, reuse the already recorded unchanged baseline; do not
restart the earlier environment investigation. The reported WSL socketpair
block remains a prerequisite failure even though Linux Chrome is now installed.
Do not use the broken timeout(1) utility or repeatedly ask for cold host runs.
Attribute any Windows output supplied by the user as user-executed. No blanket
Chrome/headless-process killing. Only a test's own process tree may be cleaned up.
These are real executions, not string-presence checks. Do not install packages
or modify system/browser configuration to get a green result. WSL and Windows
executables can have different paths and browser discovery; record which ran.

For every task, record changed files, exact commands, exit codes, summary,
artifact paths and limitations in that results file. A process exiting zero
does not override PAGE_ERROR, a boot error, failed assertions or a missing image.
Inspect generated images. Label code reading, synthetic browser events, manual
play and software versus hardware rendering separately. Never copy Astra's
previous results as your own. Keep logs concise; no secrets or full environment dumps.

Run browser/GPU checks sequentially. If a prerequisite is unavailable, diagnose
one concrete cause and try a reasonable existing-tool remedy. After two failed
setup attempts, mark VERIFICATION BLOCKED with the error and continue independent
work. Do not weaken tests, disable failures or spend the night installing tools.
Failures in your in-scope code should be debugged and fixed, then retested.

## MUSE-01 — Controls/menu QA

Status: ACCEPTED rev 2 | Owner: Muse | Reviewer: Astra
Baseline: main at b9b42e7; report SHA256:
385C93CE2977F75A1861680E2E3FB5C4B0F234D9A49AAE3D3F4183CAA9D680C0

Accepted report: docs/qa/controls-review.md. Rev 2 correctly separates Muse's
static inspection from Astra's executable K/fog probe and resolves the requested
F1/F2/F4/F5 corrections. F1/F3 remain valid; F4 is a confirmed lead-owned defect;
F5's unconditional-normal hypothesis is closed. Acceptance is of the QA report,
not of fixes to the application. No integration has occurred.

Rev 2 review: re-read the report and spot-checked the menu guard, preset
preservation, Nil renderer limits, flight controls and prior runtime evidence.
Application code is unchanged from b9b42e7, so no duplicate runtime suite was run.
First-review details: docs/qa/muse01-review-history.md.

Nonblocking erratum: the dropper paragraph calls it a 60-unit shaft; actual
height is 44 (h2r.js H2R_TOP_Z), while 60 is its renderer ray range. Correct that
sentence in MUSE-03. No third review round is required for this wording alone.
MUSE-02 is explicitly UNBLOCKED.

## MUSE-02 — Render-fixture guide

Status: ACCEPTED | Owner: Muse | Reviewer: Astra (2026-09-09)
Acceptance: main b9b42e7 + working tree; corrected guide inspected and
nil-close-column rendered/viewed on Windows. See astra-review-2026-09-09.md.
Review: docs/qa/astra-batch-review.md, MUSE-02. Correct the standalone probe
command, viewport example and current environment description. Image verification
may remain explicitly blocked; do not keep retrying the known sandbox failure.
Report: revised per review — literal /tmp commands, fitting CW=400/CH=300 example with the VW/VH pin stated, probe noted inject-only, env paragraph updated to the socket block. Fixture names verified against JSON (exit 0). Image verification still blocked, left for a capable host. Evidence: `docs/qa/overnight-results.md` (MUSE-02 revision). No shader/coordinate/tolerance/tool changes.

- Read docs/rendering-contract.md, tools/render-fixture.js, tools/preview.js
  and levels/fixtures/render-regressions.json; use the existing scratch draft
  only after checking it against these current sources.
- Allowed writes: docs/qa/render-fixture-guide.md, overnight-results.md in the
  same directory, and this task's status/report.
- Document the three actual fixture commands, output locations, resolution
  overrides supported by the tool and what each image is meant to reveal.
  Explain software previews versus real-driver checks without claiming pixel tests.
- Execute at least one fixture and inspect its image. Attempt the remaining
  views if that works; record missing rendering/image access honestly.
- Acceptance: another contributor can reproduce a view from the guide.
  No shader, coordinate, tolerance or tool changes.

## MUSE-03 — Player-facing documentation and Fog help

Status: ACCEPTED | Owner: Muse | Reviewer: Astra (2026-09-09)
Acceptance: main b9b42e7 + working tree; controls and hint checked, real-GPU
world probe green, desktop 1200x900 and narrow 500x844 images inspected.
390px phone emulation remains unverified. See astra-review-2026-09-09.md.
Review: docs/qa/astra-batch-review.md, MUSE-03. Finish flight controls, visible
Fog description and final 1-9 wording. All edits stay within this task's files.
Report: revised per review — free-flight Space/Shift rows + paragraph (facts re-verified in s3Want/adapters), 1–9/cards-10+ wording, Nil 60-unit rise with Sol/SL2R bounded chambers, visible `hint-fog` element tied to the select's accessible description (title kept; survives re-renders). Syntax OK; no stale 1–8. `page-check --worlds` and narrow/desktop inspection VERIFICATION BLOCKED (known socket block, not retried). Evidence: `docs/qa/overnight-results.md` (MUSE-03 revision). No option/callback/gameplay changes.

- Read accepted MUSE-01, current preset data, flight controls and relevant
  playground sections. Reconfirm facts rather than copying numeric claims.
- Allowed writes: docs/playground.md; app/menu.js (Fog help/accessible hint
  only); docs/qa/controls-review.md (44-unit shaft erratum only);
  docs/qa/overnight-results.md; this task's status/report.
- Update the stale seven-world and missing-geometries statements. Distinguish
  Nil's climb from Sol/SL2R's bounded labs and the H3-only kit. Repair moved
  module links in the sections touched. Preserve historical mathematical discussion.
- Explain Fog off in one short player-facing sentence: fog disappears but
  finite view limits remain. Keep renderer internals out of the menu.
- Correct flight controls and preset setting-preservation wording where needed.
  Leave the shortcut footer/handler for MUSE-04; do not advertise a fix early.
- Verify current file links and controls; check the Fog hint and menu at narrow
  and desktop widths if a browser is available. Record actual viewport sizes.
  Run node tools/page-check.js --worlds after the UI change. No math/shader suites
  are needed again for prose alone.
- Acceptance: current, readable controls; accessible Fog explanation; no changes
  to options, preset order, callbacks, focus handling or gameplay.

## MUSE-04 — Focused menu digit shortcut fix and behavioral regression

Status: ACCEPTED | Owner: Muse | Reviewer: Astra (2026-09-09)
Acceptance: main b9b42e7 + working tree; strengthened probe fails with original
guard and passes 346/346 after restoring fix. See astra-review-2026-09-09.md.
Review: docs/qa/astra-batch-review.md, MUSE-04. The guard fix is reasonable;
reset the starting preset for every test target and verify actual focus. The
reported passes cannot establish select/summary coverage while their expected
preset is already selected. Do not repeat all backend runs after the revision.
Report: 1-line guard fix + truthful footer + focused-shortcut probe block written; syntax OK, `test.js` 18/18 on fixed code. Behavioral fail-before/pass-after runs need `page-check --worlds`, blocked here (no browser; interop probe fails) — evidence and pending runs recorded in `docs/qa/overnight-results.md`. Report: fail-before + pass-after captured on Windows (PowerShell, node v24.20.0, real Chrome). Reverted guard, realGPU warm: 2.0 s, `FAIL` on `shortcut: Digit9 from button selects street` (301 checks green before it). Fixed guard: realGPU COLD 26.8 s + 30.5 s, SwiftShader COLD 158.8 s — 323/323 each, clean page, hidden boot, live HUD. Preset order (13) and native/menu-isolation controls unchanged. `test.js` 18/18 (WSL). Full evidence in `docs/qa/overnight-results.md`; reviewer note there on headless-orphan cleanup between cold runs. Revision: per-target start-away reset, activeElement focus asserts, details open/restore, full 13-name order check, Digit1/menu-isolation controls kept, change-event check relabeled — probe syntax OK, order replayed against presets.js (match, ninth = street). Strengthened fail-before/pass-after left for one healthy reviewer-host run; no retry series run here.

This is an explicitly delegated, narrow runtime subtask. F4 and other course
behavior remain lead-owned.

- Allowed writes: main.js (menu-open digit guard/selection block only);
  app/menu.js (shortcut footer only); tools/world-probe.js (focused shortcut
  regression checks only); docs/qa/overnight-results.md; this task's status/report.
- Product policy: while the world menu is open, digits 1-9 select presets 1-9
  consistently from a focused button, select or summary. Presets 10-13 remain
  available through cards/Tab+Enter; do not introduce 0 or multi-key shortcuts.
  Keep native arrows, Tab, Enter, Space, O/Esc and closed-menu kit input intact.
- Fix the guard mismatch and make the footer truthful. Preserve input/textarea
  exclusions and busy/network behavior. No broad input refactor.
- Add behavioral tests to the existing real-page probe: Digit9 from each of
  button/select/summary focus must select the ninth preset. Include one existing
  digit and native select-change/menu-isolation controls. Dispatch on the actual
  focused element so the target-tag guard is exercised; window-only events would
  bypass the bug. Do not use source-string checks or assert only labels.
- Run the new regression on the original handler and record its expected failure
  before applying your fix. Restore only your own small edit if needed; never
  reset someone else's working tree. Then run node tools/page-check.js --worlds
  and node tools/test.js on the fixed code. Check output for errors as well as
  exit status. If browser verification is blocked, leave the change unaccepted.
- Acceptance: evidence that the behavioral check catches the original defect
  and passes with the fix, with unchanged preset ordering and other input behavior.

## MUSE-05 — Facts needed for the first native editable primitive

Status: ACCEPTED (baseline inventory) | Owner: Muse | Reviewer: Astra (2026-09-09)
Acceptance: main b9b42e7 + reviewed working tree. The corrected trace informed
the now-working ball lab; docs/ball-lab.md supersedes its implementation status.
Review: docs/qa/astra-batch-review.md, MUSE-05. Include the test consumer and
existing ORBS primitive path; distinguish fixture uniforms from scene entities;
capture scene-check's actual exit status. No native implementation requested.
Report: `docs/qa/editor-readiness.md` (77 lines, ≤ 100) revised per review — engine-foundation.test.js consumer added, ORBS→ORB_POINTS CPU/GPU path traced as the authored pattern, views.json narrowed to no scene-v1 entity feed, scene-check run directly with SCENE_CHECK_EXIT=0. Evidence in `docs/qa/overnight-results.md` (MUSE-05 revision). No native/schema work.

- Allowed writes: docs/qa/editor-readiness.md (maximum 100 lines),
  docs/qa/overnight-results.md and this task's status/report.
- Read docs/scene-format.md, engine/world/document.js, tools/scene-check.js,
  tools/godot-export.js, experiments/godot/main.gd and relevant ball-field code.
- Produce a small source-linked inventory tracing a scene-v1 ball: validation,
  prepared coordinates, CPU distance evaluation, browser shader data, Godot
  export and runtime uniform upload. Mark missing connections explicitly;
  do not invent a working scene loader or claim Godot physics parity.
- Identify which ball position/radius values are authored data, emitted shader
  constants or editable uniforms today. List factual blockers to editing one
  ball and seeing both its render and collision field update without relinking.
- Reuse the baseline scene-check results only if the inputs are unchanged;
  say so. Record actual native export coverage from code, not the eight-world
  browser list. No Godot implementation, new schemas or architecture decisions.
- Acceptance: a concise evidence map Astra can use to build the vertical slice;
  distinguish measured facts from suggestions and unresolved questions.

## MUSE-06 — Bounded browser-test process lifecycle

Status: ACCEPTED WITH LEAD FIX (POSIX design accepted; Windows regression
fixed during integration) | Owner: Muse (2026-09-09) | Reviewer: Opus (2026-09-09)

Opus verdict: the POSIX group design is right and is now verified on a real
POSIX host — WSL Ubuntu, node v22.23.2, `node browser-process.test.js` →
**29 passed, 0 failed, 0 skipped, exit 0**, with the grandchild reaped and the
out-of-group sentinel surviving. `killOwnedChild`'s ESRCH-means-already-exited
reading is correct on POSIX and was left alone.

**Defect found on Windows, and it blocked integration.** The real-worker block
was not gated by platform: `supportProbe()` spawned a `detached: true` worker
and then called `killOwnedChild(..., platform: 'posix', posixProcessGroup: true)`
on a **win32 host**, where `process.kill(-pid, ...)` throws ESRCH (measured
directly). `killOwnedChild` correctly read that as `already-exited` for a child
that was still running, the probe assert failed, and `reapStray(worker, true)`
then tried the same negative-PID kill and swallowed its ESRCH. Consequences,
all measured on this host:

- the live detached worker held the suite's stdout pipe open, so
  `node browser-process.test.js` **never exited** (killed at 180 s);
- `node tools/test.js` reported `spawnSync ... ETIMEDOUT` and **19/20 suites**,
  breaking the existing green contract;
- every run **leaked an orphaned `browser-worker.js` node process** — two were
  found still resident from two suite runs and had to be cleaned up by hand.

Lead fix, inside this task's allowed file `browser-process.test.js` only:
(1) a `POSIX_HOST` gate so the four real-worker tests skip with an explicit
reason **before spawning anything** on win32, and (2) `reapStray` now falls back
to a direct `child.kill('SIGKILL')` when the group address fails, so a stray can
never be orphaned. `tools/browser-process.js`, `tools/page-check.js` and the
worker fixture were not touched. After the fix: Windows **25 passed, 0 failed,
4 honest skips, exit 0 in 0.34 s**; WSL still **29/29, 0 skips**; full suite back
to **20/20**; no orphaned worker processes remain.

POSIX warm-profile publication stays **off**, deliberately. The group-exit
evidence you were asked for now exists, but warm reuse also needs one real
Chrome run on POSIX to prove the profile is safe to republish, and WSL's
socketpair block still prevents that. Not a defect in your change.

Regression guard for the platform split is assigned as MUSE-08.

Lead verdict: docs/qa/astra-review-2026-09-09.md. Successful Windows reports,
owned taskkill cleanup and profile isolation now work. The headless-host-health
diagnosis was incorrect for Windows; do not restart that investigation.

**Current revision scope, superseding the historical task wording below:**
- POSIX cleanup currently sends child.kill() and immediately returns success.
  It neither awaits exit nor owns/terminates the descendant tree. Correct this
  with an explicitly owned POSIX process group (or return an honest cleanup
  failure when ownership cannot be established). Never guess a group from an
  arbitrary PID, sweep process names, or change Windows termination behavior.
- Allowed files: tools/browser-process.js, tools/page-check.js (POSIX launch
  and cleanup plumbing only), browser-process.test.js, new
  tools/fixtures/browser-worker.js if needed, this task's status/report and
  docs/qa/overnight-results.md. Leave tools/browser-profile.js and GPU flags
  unchanged. Do not enable POSIX warm publication in this revision; the lead
  will do so after reviewing actual group-exit evidence.
- Tests must cover normal exit, bounded forced termination, signal failure,
  descendants and an unrelated sentinel. Use Node child workers without
  sockets/Chrome. Include a real POSIX worker check where sandbox permissions
  permit; report an EPERM skip explicitly rather than substituting a mock pass.
- Run node browser-process.test.js and node tools/test.js. Preserve Windows
  assertions and exactly-once cleanup. Stop after two environment setup failures
  and continue MUSE-07; no installs, security changes or user-run Chrome requests.

Historical assignment and evidence follow for context; the revision above is
the active scope.

Concrete tool-engineering assignment; no application or geometry changes.
The current page-check only calls child.kill(), waits the full report timeout
on early browser failure, and lacks a spawn-error handler. Make these failure
paths explicit and limit cleanup to resources created by this invocation.

- Allowed writes: tools/page-check.js (startup/report/cleanup lifecycle only),
  new tools/browser-process.js if a helper is useful, new browser-process.test.js,
  docs/qa/overnight-results.md, this task's status/report. Do not change other
  browser tools, world-probe assertions, driver flags or shader-cache policy.
- Preserve --worlds, --sw, --warm, the normal report fields, and nonzero exits
  on page/assertion/startup/timeout failures. Add an optional bounded timeout
  argument only if useful for reproducible failure tests; retain the default.
- On spawn error or browser exit before a report, fail promptly with the actual
  reason. On every completion path clear timers, close the HTTP server, and
  clean up the owned browser process tree before returning. Preserve failure
  diagnostics and report cleanup failure rather than silently claiming success.
- Track the exact child PID/handle created by this run. Windows tree termination
  must target that owned child, never process names or 'all headless' matches.
  Validate identifiers; use structured executable arguments, not a shell-built
  command. If ownership cannot be established after an early exit, report the
  limitation instead of killing guessed/reused PIDs. Do not kill user browsers
  or another test's children. No global process sweeps or recursive profile deletes.
- Separate lifecycle decisions from launching Chrome so tests can run under
  WSL without browser sockets. Use controlled child/event substitutes or small
  Node workers, not real Chrome. Cover normal report, spawn failure, early exit,
  timeout, cleanup failure and exactly-once completion during racing events.
  Verify a cleanup target is the owned PID and an unrelated sentinel remains
  untouched. Test observable completion/error results, not source strings.
- Run node browser-process.test.js and node tools/test.js. Do not use timeout(1)
  or a trailing pipe that hides the producer's exit status. Leave Windows-specific
  process-tree termination explicitly unverified if it cannot execute here;
  mocked Windows calls alone are not Windows integration evidence.
- Acceptance: Node tests exercise success/failure lifecycle and resource release;
  no 300-second wait after an immediate spawn error; unchanged successful browser
  report semantics. One host smoke test may be supplied later by the reviewer.
  Do not demand a new matrix of cold Chrome runs from the user overnight.
Report: owned-session helper (`tools/browser-process.js`) + `--timeout=SECONDS` (default 300 s) wired into `page-check.js`; lifecycle tests in root `browser-process.test.js` (fakes only) 14/14; full suite 19/19; `--timeout=8` smoke fails in 0.37 s with the real reason (was: 300 s wait), invalid flag exits 2. Same flags/report fields/exits otherwise. Windows user runs: warm code-0 / cold code-21 instant exits, no report either way (environmental); already-exited cleanup tolerance added from that evidence. Windows taskkill path mocked-args only. Evidence: `docs/qa/overnight-results.md` (MUSE-06). POSIX revision: owned group cleanup (SIGTERM/await/bounded SIGKILL) via launch-established flag, detached POSIX spawn, 6 fake + 4 real-worker tests — `browser-process.test.js` 29/29, full suite 20/20, 0 EPERM skips. POSIX warm publication stays off for lead review.

## MUSE-07 — Ball document rejection and persistence QA

Status: ACCEPTED | Owner: Muse (2026-09-09) | Reviewer: Opus (2026-09-09)

Opus verdict: accepted as delivered, with no changes requested. The 18 cases are
self-contained documents carrying separate `general` / `ballHost` verdicts and
literal `errorContains` substrings, which is the right shape — it records where
the general schema and the deliberately narrower ball host disagree instead of
flattening them into one pass/fail. The runner also asserts that validation never
mutates its source document, which is the check most likely to catch a real
adapter bug later.

**The cases were mutation-tested rather than taken on trust**, since a test set
that cannot fail is worse than none:

- dropped the host's one-ball / entity-count restriction in
  `engine/world/ball-scene.js` → `doc-case no-ball` failed, exit 1;
- made `uniform()` return its internal array instead of a copy →
  `uniform results are copies` failed, exit 1.

`engine/world/ball-scene.js` was restored from a byte copy taken before the
mutations and re-verified green; no engine file is changed by this task.

Verified on Windows, node v24.20.0: `node ball-scene.test.js` → 18 cases pass,
exit 0; `node tools/scene-check.js levels/fixtures/ball-lab.nil.json` → 1 region,
2 entities, exit 0; `node tools/test.js` → 20/20, exit 0. The checklist's
separation of executed Node steps from cited lead browser/Godot evidence is
accurate — it claims no run it did not make.

An explicitly delegated test-only task that runs under Node without Chrome.
Read docs/ball-lab.md, engine/world/ball-scene.js, engine/world/document.js
and ball-scene.test.js. The new adapter deliberately accepts only one E3 cover,
one spawn, one ball and no connections; the general schema accepts more.

- Allowed writes: ball-scene.test.js; new
  levels/fixtures/ball-document-cases.json; new docs/qa/ball-editor-checklist.md
  (at most 80 lines); docs/qa/overnight-results.md; this task's status/report.
- Add a small language-neutral set of valid and invalid document cases with
  expected acceptance and plain-language reasons. Exercise these in Node.
  Include unknown fields/version, duplicate IDs, wrong region ownership,
  unsupported geometry/content, absent/extra balls or spawns, invalid radius,
  chart-boundary clearance and malformed coordinates. Use representative cases,
  not hundreds of near-identical permutations. Keep the original fixture intact.
- Check that rejected edits leave the source unchanged, compiled snapshots
  cannot be mutated through document()/uniform() results, and JSON round trips
  preserve nontrivial decimal coordinates, radius and IDs. Do not alter tolerances
  or add a second geometry implementation. If a real adapter bug appears, record
  the minimal case and hand back the core fix; do not silently change expectation.
- Run node ball-scene.test.js and node tools/test.js directly and record exit
  codes. Run node tools/scene-check.js levels/fixtures/ball-lab.nil.json.
  Mark general-schema acceptance separately from ball-host acceptance.
- Checklist: exact browser/Godot launch commands, edit/undo/redo, rejected edit,
  save/load and cross-host file checks. Distinguish executable Node evidence
  from unexecuted native/browser steps. Use the current lead evidence by citation,
  never as your own run. No Chrome retries are needed for this assignment.
- Acceptance: useful independent cases, green unchanged regressions, honest
  evidence, and no engine/shader/schema/architecture/UI implementation edits.
Report: 18 self-contained cases in `levels/fixtures/ball-document-cases.json` with separate general/ballHost verdicts; runner + immutability + round-trip checks appended to `ball-scene.test.js`; 43-line checklist citing lead browser/Godot evidence without re-running it. `ball-scene.test.js` exit 0, `scene-check` on the fixture exit 0, full suite 20/20. Evidence: `docs/qa/overnight-results.md` (MUSE-07).

## MUSE-08 - Cross-platform guard for the browser-test lifecycle

Status: OPEN | Owner: Muse | Reviewer: Opus

Integration found that the MUSE-06 real-worker block ran its POSIX probe on
Windows, hung `node browser-process.test.js` and leaked a detached worker (full
detail in the MUSE-06 verdict above). The lead fixed the behavior; what is
missing is the regression that would have caught it. Node-only, no Chrome.

- Allowed writes: `browser-process.test.js`, new `tools/fixtures/` helpers if
  genuinely needed, `docs/qa/overnight-results.md`, this task's status/report.
  Do not change `tools/browser-process.js`, `tools/browser-profile.js`,
  `tools/page-check.js` or GPU flags.
- Add a test asserting that on a simulated win32 host the real-worker path
  SPAWNS NOTHING. Inject the platform rather than reading `process.platform`
  again: a counting spawn stub that must be called zero times is the assertion,
  not a string check for the skip message.
- Add a self-check that the suite leaves no child process of its own alive when
  it finishes, on whichever platform it runs. Record each PID the suite spawns
  and assert each is gone at the end. Keep it bounded - no sweeps, no
  process-name matching, only PIDs this suite created.
- Confirm `killOwnedChild`'s ESRCH -> `already-exited` reading stays POSIX-only
  in its effect: a test that a LIVE child plus a throwing group signal is never
  reported as a clean cleanup. Do not change the module to make this pass; if it
  genuinely cannot hold, record the minimal case and hand it back.
- Checks: `node browser-process.test.js` (expect the current 29 on POSIX, or 25
  plus honest skips on Windows, plus your additions) and `node tools/test.js`
  (must stay 20/20). Run on whichever host you have and SAY WHICH; if you can
  reach both WSL and Windows, run both, because this task is precisely about the
  platform split.
- Acceptance: the new guard fails against the pre-fix behavior (demonstrate it
  by temporarily removing the `POSIX_HOST` gate in your own working copy, then
  restoring it), the suite exits promptly, and no process outlives it.

## MUSE-09 - Shared validator conformance cases for the two ball runtimes

Status: OPEN | Owner: Muse | Reviewer: Opus

`docs/engineering/NEXT_SESSION.md` asks for shared conformance cases before
either ball runtime is extended, because `engine/world/ball-scene.js` (JS) and
`experiments/godot/ball_document.gd` (GDScript) are two implementations of the
same small subset and will drift. MUSE-07's case file is the right seed; this
task makes it consumable by both hosts. Fixture and test work only - no schema
design, no geometry, no GDScript logic changes.

- Allowed writes: `levels/fixtures/ball-document-cases.json` (additions and a
  documented shape only), `ball-scene.test.js`, a new `tools/ball-conformance.js`
  REPORTER, `docs/qa/overnight-results.md`, this task's status/report. Do not
  edit `engine/world/ball-scene.js`, `engine/world/document.js`,
  `tools/scene-check.js` or any `.gd` file.
- Read `experiments/godot/ball_document.gd` and record, per existing case, what
  its validator would have to answer. Where its rejection reason differs in
  wording from the JS one, do NOT force either string: add a `reasonKind` field
  (a short stable slug such as `radius-not-positive`) that both runtimes can
  match, and keep the existing literal `errorContains` for the JS side.
- `tools/ball-conformance.js` runs every case through the JS validators and
  writes a language-neutral expectations file the native adapter can later be
  checked against. It reports, it does not mutate fixtures. Exit nonzero on any
  JS mismatch.
- Add cases for anything MUSE-07 left uncovered that the native subset can
  express - at minimum a non-`cover` topology, a region `extent` of zero or
  negative, and a ball exactly tangent to the extent boundary (state which side
  of the boundary the adapter treats as legal, from the code, and mark it as an
  observation if the two runtimes could disagree).
- Do NOT run Godot or claim native results. This task produces the shared cases
  and the JS half of the evidence; the lead runs the native half.
- Checks: `node ball-scene.test.js`, `node tools/ball-conformance.js`,
  `node tools/scene-check.js levels/fixtures/ball-lab.nil.json`,
  `node tools/test.js` (20/20). Record exit codes.
- Acceptance: one case set, two declared verdicts per case plus a stable reason
  slug, a reporter that fails loudly on JS drift, and an explicit list of the
  questions only a Godot run can answer.

## MUSE-10 - Which checks run on which host

Status: OPEN | Owner: Muse | Reviewer: Opus

The repository's checks are now split across two hosts in a way nothing states
plainly, and integration lost time rediscovering it: Node suites run anywhere,
GPU/browser checks run ONLY on Windows (WSL's socketpair block), and one test
suite's real-worker cases run ONLY on POSIX. Documentation and reproducible QA -
squarely in scope.

- Allowed writes: new `docs/qa/check-runbook.md` (at most 90 lines),
  `docs/qa/overnight-results.md`, this task's status/report. Do not edit
  `WORKING_RULES.md`, `AGENTS.md`, `CLAUDE.md` or any tool.
- One table: each check command, what it proves, which host it runs on, rough
  runtime, and what a failure usually means. Take the runtimes from your own
  runs or cite the run you took them from - do not invent numbers.
- Cover `tools/test.js`, `scene-check`, `shader-check`, `sdf-check`,
  `march-check`, `link-time`, `page-check` (`--worlds`, `--ball-lab`, `--sw`,
  `--warm`, `--timeout=`), `net-check`, `render-fixture`, `world-probe` and
  `browser-process.test.js`.
- State the two platform restrictions explicitly, with the reason for each, and
  note that headless Chrome on the Windows host was broken and is now working -
  so a past "browser verification blocked" note is not evidence about today.
- Do not duplicate `WORKING_RULES.md`'s required-checks table; link to it and
  add only the host/runtime dimension it does not carry.
- Checks: run at least the Node-only commands you document and record exit
  codes. Mark any command you did not run as cited, with its source.
- Acceptance: a new contributor can tell, without asking, which checks their
  machine can run and which need the Windows host.

## Lead-owned next work

See docs/engineering/NEXT_SESSION.md. F4 and the first E3 ball slice are done.
Astra/Opus owns primitive/query contracts, further scene-to-native integration, numerical
convergence, collision/transport, host choice and cross-geometry connections.

Stop after this queue. Leave every output ready for review with a short handoff;
do not invent more tasks or wait indefinitely for the lead to return.

Note on the batch above: MUSE-08 is the highest value of the three, because it
closes a defect that reached integration. MUSE-09 and MUSE-10 are independent of
it and of each other, so a blocked prerequisite in one does not stall the rest.
