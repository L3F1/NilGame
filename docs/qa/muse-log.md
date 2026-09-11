# Muse task log: closed assignments and their verdicts

History, kept out of `MUSE_TASKS.md` so that the queue an agent reads at the
start of a session is only the work in front of it. Nothing here is actionable.
Read a section only when you need to know why a past decision went the way it
did -- most of the value is in the verdicts, which record what was re-run by
the lead rather than taken from a report.

## Overnight execution

Current batch: MUSE-19 FIRST (one command, everything else depends on it),
then MUSE-20 if it passes. MUSE-16, 17 and 18 are closed: the interop route is
DEAD in the sandbox and must not be retried, and browser checks now go through
 instead.
MUSE-08..13 are accepted and integrated; MUSE-14 and MUSE-15 were closed by the
lead on the Windows host. Do not reopen any of them.
MUSE-11 through MUSE-15 were added 2026-09-09 by the lead and are INDEPENDENT
of each other and of 08-10: a blocker in one does not stall the rest. Two of
them need the Windows host with a real GPU and cannot run from WSL (MUSE-14,
MUSE-15); the other three are Node-only and run anywhere. Take the Node-only
ones first if you are unsure which host you have. MUSE-01 through MUSE-07 are all
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

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-08). browser-process.test.js +4 tests (injected-platform zero-spawn guard, win32-no-group-branch pin, closing no-stray self-check); suite 35/35-prompt-exit 0, full 23/23. POSIX live-child ESRCH seam handed back with /tmp repro; module untouched.

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

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-09). 22 cases with reasonKind + declared native verdicts; reporter green (exit 0), drift demo exit 1; full 23/23. No engine/.gd edits; Godot half left for the lead.

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

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-10). New docs/qa/check-runbook.md (46 lines): host/runtime table for all 12 check families, both platform restrictions, Chrome-fixed note; Node rows timed here, rest cited with sources.

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

## MUSE-11 - Every declared uniform is located and set

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-11). New uniform-coverage.test.js: 10 programs, 57 names, both directions; fail demo on deleted uPortals set + pass restored; full 24/24. One pinned preview-program exception; no defect found.

A uniform declared in GLSL but never set by its host module is SILENT: the
value is zero, the shader compiles, the program links, and the picture is
merely wrong. This session added five uniforms to `BALL_FIRST_PERSON_GLSL`
(`uPortals`, `uPortalNml`, `uPortalExit`, `uPortalMap`, `uPortalN`) and nothing
in the repository would have complained if one had been forgotten. Build the
check that would. Node-only, no Chrome, no GPU.

- Allowed writes: a new `uniform-coverage.test.js` at the repository root, its
  registration in `tools/test.js`, `docs/qa/overnight-results.md`, this task's
  status and report. Do NOT edit any `.js` under `engine/`, `app/`, or the
  shader sources themselves; if the check finds a real gap, REPORT it, do not
  fix it.
- Parse each exported GLSL string for `uniform <type> <name>` declarations,
  including array forms like `uniform vec4 uBalls[MAX_BALLS];`. Cover at least
  `engine/geometry/ball-shader.js` (both programs) and whatever other modules
  export GLSL; find them, do not assume the list.
- For each declaration, assert the host module that compiles that program both
  LOOKS IT UP and SETS IT. A name appearing only in a `getUniformLocation` list
  is not set; a name appearing only in a `gl.uniform*` call was never located.
  Both halves are required.
- Report the two failure directions separately: declared-but-never-set, and
  set-but-never-declared. The second catches a rename that left a dead call.
- Known acceptable exceptions must be listed explicitly in the test with a
  reason each, not silently skipped by a loose regex.
- Checks: `node uniform-coverage.test.js` and `node tools/test.js` (expect
  24/24 once yours is registered; say the number you actually saw).
- Acceptance: the check FAILS when you temporarily delete one
  `gl.uniform4fv(U.uPortals, ...)` line in your own working copy, and passes
  with it restored. Show both outputs. A check that cannot fail is not a check.

## MUSE-12 - Stale-claim sweep across the documentation

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-12). New docs/qa/stale-claims-2026-09.md: 14 FALSE (incl. --ball-lab 9-vs-57, program counts, AGENTS.md pointers) + 11 stale-harmless + 3 unverifiable, all evidenced with per-file read log.

Documentation decays silently. `tools/scene-check.js` printed "portal traversal
is not implemented" for a whole session after traversal was implemented and
tested, and it was found by eye rather than by anything that runs. There are
almost certainly more. This is a reading-and-verifying task, which is exactly
the shape of work that is wasted on a model doing design.

- Allowed writes: `docs/qa/stale-claims-2026-09.md` (new), `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit the documents themselves in this
  task - the report is the deliverable, and the lead decides what to correct,
  because some "stale" claims are deliberate scope statements.
- Sweep every `.md` under `docs/`, plus `AGENTS.md`, `MUSE.md`, `TODO.md` and
  `README*`. For every FACTUAL claim about what the code does or does not do -
  counts, capabilities, "not implemented", "only supports", file paths, function
  names, measured numbers - verify it against the current tree.
- Record each finding as: file and line, the claim as written, what is actually
  true, and the EVIDENCE (a command you ran and its output, or a file and line
  number). A finding without evidence is not a finding.
- Separate three categories, because they need different responses: FALSE (the
  claim is wrong now), STALE-BUT-HARMLESS (understated, e.g. a test count that
  has grown), and UNVERIFIABLE (you could not check it - say why).
- Do not report prose style, wording preferences, or missing documentation.
  Only claims that are checkable and checked.
- Checks: no code changes, so no suite to run; instead include the command
  transcript for every FALSE finding.
- Acceptance: at least the whole of `docs/` swept with a per-file line saying it
  was read, findings evidenced, and no edits to the swept documents.

## MUSE-13 - An invalid-document corpus for the scene validator

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@9356527, WSL node v22.23.2) | Reviewer: Opus
Report: docs/qa/overnight-results.md (MUSE-13). New document-invalid.test.js + 60-file corpus under levels/fixtures/invalid/ (single-defect audited); 60 message-checked refusals + 4 atomicity; full 25/25. No engine edits; 2 diagnostic observations handed back.

`engine/world/document.js` refuses a lot of things, and we do not know how much
of that is covered. A validator with an untested branch is a validator that
will one day accept a broken scene. This is high-volume, low-judgement work:
write many small bad documents and assert each is refused for the RIGHT reason.
Node-only.

- Allowed writes: a new `document-invalid.test.js` at the repository root, new
  files under `levels/fixtures/invalid/`, registration in `tools/test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  `engine/world/document.js` or `engine/world/scene-field.js`. If a refusal is
  missing or its message is wrong, REPORT it and hand it back.
- One defect per document, built by mutating a VALID fixture so the only
  difference is the defect under test. Do not hand-write whole invalid files:
  a document that is broken in three ways proves nothing about any one of them.
- Cover at minimum, from a reading of `document.js` rather than from this list:
  every `kind`-specific field rule (radius on a spawn, forward on a ball, up on
  something that may not have it), the orthonormality rules on an anchor,
  duplicate ids across entities/connections/regions, an unknown `regionId`, an
  entity outside its region's extent, every connection rule (unknown anchor,
  an anchor already connected, endpoints equal, mismatched radii, a `scale`
  other than 1, a `velocity` other than preserve-speed), and the missing/extra
  top-level field cases.
- Assert on the MESSAGE, not just that it threw. Each assertion must check that
  the message names the offending id or field. "Throws" passing for the wrong
  reason is the standard way this kind of test rots.
- Also assert the refusal is ATOMIC where an API is involved: after a rejected
  `addEntity`/`addPortal`/`editEntities`, the source document must be
  byte-identical to what it was.
- Checks: `node document-invalid.test.js` and `node tools/test.js`. Report both
  numbers.
- Acceptance: every rule you found in `document.js` is either covered by a case
  or listed in the report as deliberately not covered with a reason. Say how
  many rules you found and how many you covered - a bare pass count does not
  show coverage.

## MUSE-14 - Long seeded play sweep for the unreproduced geom.js crash

Status: VERIFICATION BLOCKED (WSL: no browser/GPU host) | Owner: Muse (2026-09-09) | Reviewer: Opus
Note: requires the Windows host with headless Chrome (MUSE-14) — cannot run from WSL (socketpair block unchanged; see overnight-results MUSE-14/15 entry). Left for a Windows run; no files written.

The reported crash - `Cannot read properties of undefined (reading '0')` at
`geom.js:80` during arena play - has never been reproduced. About 40,000
headless frames and a full call-site audit did not trigger it, so
`tools/play-check.js` was built and the diagnostics were shipped instead. This
is now a MACHINE-TIME problem, not a thinking problem: run far more play than a
person would sit through, and record everything. Requires the Windows host with
headless Chrome; it CANNOT run from WSL (the socketpair block is unchanged).

- Allowed writes: `docs/qa/play-sweep-2026-09.md` (new),
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  `tools/play-check.js`, `tools/play-probe.js`, `main.js`, `geom.js` or any
  engine file. If you believe the probe needs a new capability to reach a mode,
  say so in the report and stop; do not add it.
- Run `tools/play-check.js` across many seeds and long durations. Vary the seed
  widely rather than repeating a few, and cover every game mode the probe can
  reach, not just the default. Record the exact command for each run.
- Record for EVERY run, pass or fail: seed, mode, frames, wall time, exit code,
  and any error with its full stack. A clean run is data - the point is the
  total volume of play that produced no crash, which is the number that makes
  "not reproduced" mean something.
- If a crash reproduces: capture the full stack, the seed, and the exact
  command, and STOP the sweep. A reproducible seed is worth more than more
  sweeping, and diagnosis is the lead's.
- Keep the total bounded and say what you chose: report the total frames and
  total wall time, and stop at a limit you state up front rather than running
  until interrupted.
- No blanket Chrome or headless process killing. Only a run's own process tree
  may be cleaned up, and only if `play-check` leaves one behind - if it does,
  that is itself a finding worth reporting.
- Acceptance: a table of every run with the fields above, a stated total, and
  an explicit verdict sentence of the form "N frames of play across M seeds and
  K modes produced no geom.js error" - or a reproducing seed.

## MUSE-15 - Shader link time per geometry, tabulated

Status: VERIFICATION BLOCKED (WSL: no browser/GPU host) | Owner: Muse (2026-09-09) | Reviewer: Opus
Note: requires the Windows host with a real GPU (MUSE-15) — cannot run from WSL (same block; see overnight-results MUSE-14/15 entry). Left for a Windows run; no files written.

`docs/host-capability-map.md` argues that the 8.4 s browser link time that
drives the host decision belongs to the ARENA's hyperbolic program, and that the
editor's own program links in 0.7 s on the same machine - so link time is not
currently an argument about the editor. That argument rests on two numbers and
deserves a table. Pure measurement; the analysis is not yours. Requires the
Windows host with a real GPU; say which GPU and which browser build.

- Allowed writes: `docs/qa/link-time-2026-09.md` (new),
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  `tools/link-time.js`, any shader source, or `docs/host-capability-map.md`.
  If `tools/link-time.js` cannot measure a case you need, report that and
  measure what you can.
- Measure COLD-cache link time for every geometry's program - all eight, plus
  `BALL_PREVIEW_GLSL` and `BALL_FIRST_PERSON_GLSL`. Cold means cold: state
  exactly how you guaranteed the shader cache was empty for each measurement,
  because a warm cache silently reports a tenth of the truth.
- Three runs per program, reporting min, median and max, not one sample.
- Record alongside each: the program's source length in characters, and any
  obvious structural figure you can get cheaply (number of primitives or
  branches in the scene function). The interesting question is what link time
  scales with, and a table of times alone cannot answer it.
- Do NOT conclude anything about the host decision. Report numbers and note
  which measurements you could not take and why.
- Checks: include the raw command output for at least one program in full, so a
  reviewer can see the shape of what you are summarising.
- Acceptance: a table with every program, three samples each, an explicit
  statement of the cold-cache method, and the machine and browser identified.

## Verdicts on MUSE-16..18, 2026-09-09 (lead: Opus)

- **MUSE-16 ACCEPTED, and the answer was no.** `UtilBindVsockAnyPort:309:
  socket failed`, exit 1, 0 s wall, twice. That is exactly the reading the task
  asked for and it is worth more than a workaround would have been: it is
  neither "found the Linux Chrome" nor "EPERM on the .exe", it is WSL's own
  `/init` interop transport failing to open an AF_VSOCK socket before Chrome is
  reached. Stopping at two attempts was right. Together with the earlier
  AF_UNIX `socketpair` denial and the AF_INET success in `net-check`, the
  sandbox's shape is now known: **TCP yes, unix sockets no, vsock no.** No
  Chrome flag participates in a failure inside `/init`, so there is nothing
  left to tune and nobody should spend another session on it.
- **MUSE-17 correctly SKIPPED.** Its precondition failed and it was not
  attempted. Annotating the status and touching nothing was the right call; a
  half-run of browser checks from a host that cannot run them would have
  produced noise that outlived the session.
- **MUSE-18 ACCEPTED, and it is the best finding of the three.** The five slow
  programs are TEXTUALLY THE SAME PROGRAM -- h3 and e3t differ in exactly one
  line, `#define GEOM (0)` against `(4)` -- so no column parsed from the source
  can possibly separate a 9.0 s link from a 3.3 s one, and saying so plainly is
  a better answer than a correlation over nine points. It also settles the
  mechanism: link time is decided by what the PREPROCESSOR leaves reachable,
  not by anything measurable in the emitted text. Reporting that no column
  orders all eleven, and naming which ones invert, is exactly the honest
  negative result the task asked for.

## THE INTEROP ROUTE IS DEAD IN THE SANDBOX. USE THE QUEUE.

Do not try to start a browser in your shell again, by any route. MUSE-16
settled it and the runbook records the evidence.

`tools/check-queue.js` runs a check on a host that CAN start Chrome, requested
from one that cannot, using nothing but files on the disk both hosts already
share. No sockets of any family, no interop, no proxy variables -- because
every more capable mechanism tried so far has been denied by something.

```sh
node tools/check-queue.js --list                  # who is serving, and what may be run
node tools/check-queue.js page-check --ball-lab
node tools/check-queue.js play-check --preset=fight --seeds=10 --frames=6000
```

It prints the check's own output and exits with the check's own exit code, so
it substitutes for running the check directly. If nobody is serving it tells
you so at once rather than waiting out a timeout, and the answer is to ask the
user to run `node tools/check-queue.js --serve` on the Windows machine.

Measured end to end from a WSL shell: `page-check --ball-lab` returned its 57
checks and exit 0 from the Windows host; a failing check returned exit 1; a
refused request returns 2. **Not yet measured from the SANDBOXED shell** -- it
needs only file reads and writes, which you demonstrably have, but that is an
argument and not a measurement. MUSE-19 is the measurement.

## MUSE-19 - Does the check queue work from the sandbox?

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@dccbff0, WSL node v22.23.2) | Reviewer: Opus | **Do this one first**
Report: docs/qa/overnight-results.md (MUSE-19). Queue DOES work from the sandboxed shell: --list exit 0 (LeoPC linux worker, pid 22617), page-check --ball-lab exit 0 (57 passed, real GPU, 4 s wall), both refusals exit 2 with reasons. No code changed.

One command decides whether browser checks are available to you at all. Do not
plan other browser work until it is recorded.

- Allowed writes: `docs/qa/overnight-results.md`, this task's status and
  report. Change no code. If it fails, the fix is the lead's.
- FIRST ask the user to run `node tools/check-queue.js --serve` on the Windows
  machine, and say plainly in your report if nobody did -- an unserved queue is
  not a failure of the queue.
- Run `node tools/check-queue.js --list`. Record whether it names a worker.
- Then `node tools/check-queue.js page-check --ball-lab`. Record the full
  output, the exit code and the wall time.
- Record the exit codes of a refused request too, because a refusal that looked
  like success would be the worst failure this thing could have:
  `node tools/check-queue.js rm-rf --all` (expect 2) and
  `node tools/check-queue.js page-check /etc/passwd` (expect 2). Capture the
  code with `echo $?` on its own line; a pipeline reports the LAST command's
  code, which is how the lead briefly mis-read these as 0.
- Do NOT attempt to start Chrome, and do not retry more than twice.
- Acceptance: a verdict sentence of the form "the check queue DOES / DOES NOT
  work from the sandboxed shell", with the command output that shows it, and
  the three exit codes.

## MUSE-20 - Run the cited checks through the queue

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@dccbff0, WSL node v22.23.2) | Reviewer: Opus | Unblocked: MUSE-19 passes (queue DOES work)
Report: docs/qa/overnight-results.md (MUSE-20). 7 of 9 families green through the queue (worlds 346, ball-lab 57, sw-worlds 346, net 9 incl peer, march/sdf/shader exit 0; no survivor WARNING). play-check default + link-time blocked by a worker-host GPU dropout (no webgl2, measured twice); remedy is a Chrome restart on the worker host, then re-run those two.

This is MUSE-17 again, by the route that works. If MUSE-19 says the queue does
not work, STOP and skip this task.

Several check families have been CITED rather than run for weeks, so nobody has
confirmed them against current `main`.

- Allowed writes: `docs/qa/overnight-results.md`, `docs/qa/check-runbook.md`
  (the timing column only, for rows you personally ran), this task's status and
  report. No code changes.
- Through the queue, run and record each with its command, exit code, wall time
  and reported count: `page-check --worlds`, `page-check --ball-lab`,
  `page-check --sw --worlds`, `net-check`, `play-check` (default),
  `link-time`, `march-check`, `shader-check`, `sdf-check`.
- For every row in `check-runbook.md` currently marked "cited", either replace
  it with a figure you ran or say why you could not.
- The queue runs one job at a time by design. If a request waits a long time,
  that is another job ahead of it, not a hang -- say so rather than retrying.
- Watch for the WARNING `page-check` prints when a browser process from its own
  run survives cleanup. If you ever see it, quote it; that is a leak and it is
  the most important thing in your report.
- Do NOT kill browser processes under any circumstances; you are not on the
  host they are running on.
- Acceptance: a table of every check family with a measured number, and an
  explicit statement of any that still cannot run.

## MUSE-14 and MUSE-15: CLOSED by the lead, 2026-09-09

Both needed the Windows host. Run here rather than left blocked:

- **MUSE-15 done** — `docs/qa/link-time-2026-09.md`. Three cold runs of all
  nine programs on an RTX 5070 Ti. The finding: cost is concentrated in ONE
  program and tracks the QUOTIENT, not the curvature. Hyperbolic ~9.0 s median;
  Nil, Sol and SL2R 0.2–0.3 s; the editor's own program 0.7 s. Two orders of
  magnitude across eight geometries, so "the browser is slow to compile
  shaders" is too coarse a statement to plan with. Run 1 was consistently
  slowest, so a single sample would have overstated it by 20%. Left open: per
  program source length and primitive counts, which MUSE-15 also asked for --
  see MUSE-18.
- **MUSE-14 done** — `docs/qa/play-sweep-2026-09.md`. 201,000 frames across 11
  presets and 38 seeds, 112 face crossings, 36,000 frames of mid-run world
  switching. No `geom.js` error, no crash, every run exit 0. Roughly five times
  the earlier volume and eleven presets rather than one. It does not clear
  `geom.js:80`; it narrows what is left to the things the probe does not do.
  One real defect found in the TOOL: `play-check` failed four presets on a rule
  that does not apply to them, demanding a face crossing in worlds that have no
  fundamental domain. Fixed with an opt-in `--no-folds`; the default still
  demands a crossing, verified both ways.

## THE WSL BROWSER BLOCK IS ROUTED AROUND

Read this before planning: the constraint that shaped the last several batches
is mostly gone.

The LINUX Chrome still cannot start in the sandbox — `socketpair(2)` is denied
and no flag avoids it — but it was never the only Chrome on the machine.
`tools/browser-host.js` launches the WINDOWS Chrome through WSL interop, which
runs outside the Linux sandbox entirely. `page-check` uses it automatically and
prints `browser : Windows Chrome via WSL interop` when it does.

Measured from a WSL shell on this machine: `--ball-lab` 57 checks, `--worlds`
**346 checks in 31.6 s**, both real GPU, cold shader cache.

**But verify it in YOUR shell first, because mine was not sandboxed.** Whether
the agent sandbox permits `execve` of a Windows binary is a different question
from whether it permits `socketpair`, and it is untested. MUSE-16 is exactly
that check and nothing else should be planned around browser access until it
comes back.

The earlier "interop is EPERM" reading was an artifact: `timeout(1)` is itself
broken in that sandbox (`timeout 10 echo hi` -> Operation not permitted, exit
126) and the probe ran through it. Interop was never actually tested. Worth
remembering as a pattern — a broken instrument reported a blocked capability,
and that reading stood for weeks.

## MUSE-16 - Does the interop route work in the sandboxed shell?

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@76ed138, WSL node v22.23.2) | Reviewer: Opus | **Do this one first**
Verdict: browser checks ARE NOT available in the sandboxed shell (interop route launches Windows Chrome, which dies instantly on the same socketpair denial; 2/2 identical). Full output in docs/qa/overnight-results.md (MUSE-16). MUSE-17 stops here.

Everything else about browser access depends on the answer, and the answer is
one command. Do not plan other browser work until this is recorded.

- Allowed writes: `docs/qa/overnight-results.md`, this task's status and report.
  Change no code. If it fails, the fix is the lead's.
- Run `node tools/page-check.js --ball-lab` in your normal sandboxed shell from
  the repository root. Record the FULL output, exit code and wall time.
- If it prints `browser : Windows Chrome via WSL interop` and passes: say so,
  give the check count, and then run `node tools/page-check.js --worlds` and
  record that too. Browser checks are now available to you.
- If it fails, the exact error is the deliverable and it matters which kind:
  - a `socketpair` error means it found the LINUX Chrome. Report which path
    `findBrowser` returned (`node -e "import('./tools/browser-host.js').then(m
    => console.log(m.findBrowser(), m.isWsl()))"`).
  - an EPERM/EACCES on the `.exe` means the sandbox blocks Windows interop
    itself, which is a different block from the one this routes around. Say so
    plainly; that is a real finding, not a failure.
  - anything else: quote it verbatim.
- Also record, either way: `cat /proc/version`, whether
  `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe` is readable, and
  whether `command -v taskkill.exe` and `command -v wslpath` resolve.
- Do NOT retry more than twice, and do not attempt workarounds. One clean
  reading is worth more than an afternoon of flags.
- Acceptance: a verdict sentence of the form "browser checks ARE / ARE NOT
  available in the sandboxed shell", with the command output that shows it.

## MUSE-17 - Run everything that was blocked, now that it may not be

Status: SKIPPED per its own precondition (MUSE-16: browser checks ARE NOT available in the sandboxed shell) | Owner: Muse (2026-09-09) | Reviewer: Opus | Blocked on MUSE-16 passing

If MUSE-16 says browser checks are unavailable, STOP and skip this task; do not
attempt it from a host that cannot run it.

Several check families have been cited rather than run for weeks, which means
nobody has actually confirmed them against current `main`. Run them.

- Allowed writes: `docs/qa/overnight-results.md`, `docs/qa/check-runbook.md`
  (the timing column only, for rows you personally ran), this task's status and
  report. No code changes.
- Run and record, each with command, exit code, wall time and the count it
  reports: `page-check --worlds`, `page-check --ball-lab`, `page-check --sw
  --worlds`, `tools/net-check.js` (the peer half that needed Chrome),
  `tools/play-check.js` default, `tools/link-time.js`.
- For every row in `check-runbook.md` currently marked "cited", either replace
  it with a measured figure you ran, or say why you could not.
- Watch for the WARNING `page-check` prints when a browser process from its own
  run survives cleanup. If you ever see it, that is a leak and it is the most
  important thing in your report -- quote it and say how many runs you did.
- Do NOT kill browser processes yourself under any circumstances. The cleanup
  is by unique per-run stamp; a manual sweep would hit the user's own Chrome.
- Acceptance: a table of every check family with a measured number from THIS
  host, and an explicit statement of any that still cannot run.

## MUSE-18 - What does shader link time scale with?

Status: READY FOR REVIEW | Owner: Muse (2026-09-09, main@76ed138, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-18). New docs/qa/link-time-inputs-2026-09.md: 11-row parsed-source table; headline is the five slow programs are one text (GEOM selector only) so no column separates them, and no column orders all eleven; full 27/27.

`docs/qa/link-time-2026-09.md` shows two orders of magnitude between programs
and observes that the fast ones are the ones with no quotient. That is one
binary variable across nine points, which is suggestive and not a cause. This
task supplies the other columns so the question can be answered. No browser
needed: the shader SOURCES are all reachable from Node.

- Allowed writes: `docs/qa/link-time-inputs-2026-09.md` (new),
  `docs/qa/overnight-results.md`, this task's status and report. Change no
  shader, no tool logic, and do not edit `link-time-2026-09.md`.
- For each of the nine programs `tools/link-time.js` measures, plus both ball
  programs, record from the generated source: total characters, non-comment
  lines, number of function definitions, number of CALLS to each function
  (this is the inlining multiplier that CLAUDE.md's rule is about), the number
  of `for` loops and whether each has a compile-time-constant bound, and the
  count of `#define`d primitives actually reachable.
- Do this by PARSING the emitted source, not by reading the modules that build
  it. The whole point of the inlining rule is that the source the compiler sees
  differs from the source a human reads.
- Put the measured link times from `link-time-2026-09.md` in the same table as
  a final column so the correlation can be eyeballed. Do NOT compute a
  correlation coefficient over nine points and present it as a finding.
- State plainly which single column, if any, orders the programs the same way
  link time does -- and say so even if none of them does.
- Acceptance: one table, eleven rows, every column measured by a command you
  show. An honest "no column explains it" is a complete answer.

## Verdicts, 2026-09-09 (lead: Opus)

Batch MUSE-08..13 reviewed on the Windows host at `9356527` + the working tree.
`node tools/test.js` 26/26 including the two new suites. Every acceptance below
was re-run by the lead, not taken from the report: an agent asserting its own
check can fail is exactly the claim that needs independent execution.

- **MUSE-08 ACCEPTED.** Windows leg run here: 31 passed, 5 honest skips, prompt
  exit, `owned real-child PIDs this run: (none)`. The diff LOOKS like it
  deletes the `POSIX_HOST` gate; it does not -- the gate is now
  `isPosixPlatform(platform)` with the platform injected, and it still skips
  BEFORE anything spawns (`browser-process.test.js:510-514`), which is what the
  task asked for. Handed-back finding accepted as real: `killOwnedChild` reads
  a group-signal ESRCH as `already-exited` on the strength of the launch flag,
  so a live child plus a throwing group signal reports a clean cleanup. That is
  a genuine defect in module behaviour, correctly NOT fixed under a task that
  forbade touching the module. Lead-owned follow-up.
- **MUSE-09 ACCEPTED.** The `ball-scene.test.js` additions STRENGTHEN the
  contract rather than relax it: every case must now declare a `reasonKind`
  slug, a native verdict and the clause that answers it. 22 cases, new
  `tools/ball-conformance.js` reporter. The five open questions for the Godot
  run are the right shape -- they are questions, not assumptions.
- **MUSE-10 ACCEPTED with one correction applied by the lead.** The runbook's
  `--ball-lab` row cited 9 checks; it is 57, confirmed by three browser runs
  here. Muse found this itself in MUSE-12 and correctly did not edit its own
  runbook under a no-edit rule. Row fixed.
- **MUSE-11 ACCEPTED.** Acceptance re-run by the lead rather than trusted:
  deleting the `gl.uniform4fv(U.uPortals, ...)` line reports
  `declared-but-never-set: ball-first-person uPortals (app/ball-lab.js)` and
  the file restored green. 10 programs, 57 names, both directions, one
  documented exception. This closes a class of bug nothing here could catch.
- **MUSE-12 ACCEPTED, and the highest-value item in the batch.** 14 FALSE
  claims with file:line and command evidence. F9 is an error in a document the
  lead wrote the same day -- `host-capability-map.md` claimed exact ray hits in
  eight geometries when they exist for the E3 ball and Nil columns only. An
  agent auditing the reviewer's own fresh work and finding a real overclaim is
  the batch working as intended. Corrections applied to `architecture.md`,
  `playground.md`, `scene-format.md`, `README.md`, `rendering-contract.md`,
  `host-capability-map.md`, `ball-lab.md` and this runbook.
- **MUSE-13 ACCEPTED.** Acceptance re-run by the lead: removing the "radius
  only applies to balls and anchors" clause from `document.js` fails with
  `spawn-with-radius.nil.json: accepted, expected refusal (spawn.radius 0.5)`,
  naming both the fixture and the field. 60 message-checked refusals plus 4
  atomicity checks; 54 of ~59 rules covered with the remainder listed and
  reasoned. Two diagnostic observations handed back, correctly unfixed.
- **MUSE-14 and MUSE-15 remain OPEN.** Both need the Windows host with a real
  GPU. Not attempting them from WSL, and spending no retries on a known block,
  was the right call.

One process note worth keeping: three of these six tasks were checks on work
the lead had just shipped, and two of them found something. Queue more of that
shape.

## Verdicts on MUSE-19 and MUSE-20, 2026-09-09 (lead: Opus)

- **MUSE-19 ACCEPTED.** The queue works from the sandboxed shell: 57 checks,
  exit 0, 4 s, real GPU. Both refusals returned 2 with a reason, and the
  instruction to capture `$?` on its own line did its job — that is the exact
  mistake the lead had made a session earlier.
  One observation in the report is worth keeping: the worker was serving from
  an un-sandboxed WSL shell, reporting `platform linux`, and it worked because
  browser launches from THERE go through interop successfully. So the queue is
  indifferent to which host serves it, which is the property that makes it
  useful. Noticing and reporting that without being asked was good work.
- **MUSE-20 ACCEPTED, seven of nine.** Every green row is now a measured figure
  on a known host rather than a citation, which is the first time that has been
  true. `net-check`'s peer half passing from the worker host contradicts the
  standing "peer FAILs on WSL" note and was correctly flagged as the same
  un-sandboxed-shell difference rather than as a repo change.
  The two blocked rows are a transient on the worker, not a defect: `no webgl2`
  from ~19:03 after real-GPU checks passed at ~18:52. The lead re-ran
  `link-time` directly on Windows afterwards — 8.5 s hyperbolic, real GPU, all
  nine programs — so both tools are fine and the worker had lost its GPU
  context. Stopping after two attempts and reporting the TIMING was the right
  call; the timing is the finding. Re-queued as MUSE-22.


## MUSE-21 - A corpus for booleans

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@c3d4631, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-21). 5 rules found, all covered: 10 message-checked invalid docs (7 document-level, 3 field-level with the layer split asserted) + 7 valid carve docs with capabilities pinned; fail-demo on the target rule (exit 1 without it, 18/18 with it); full suite 30/30. No engine edits.

`op: add | subtract` and `target` landed in `e348791` with 14 tests. Those
tests were written by the person who wrote the feature, which is the weakest
kind of coverage there is. MUSE-13 built exactly this for the base schema and
found the shape of the validator; do the same here.

- Allowed writes: new files under `levels/fixtures/invalid/` and
  `levels/fixtures/carve/`, a new `boolean-corpus.test.js`, registration in
  `tools/test.js` if it needs it, `docs/qa/overnight-results.md`, this task's
  status and report. Do NOT edit `engine/world/document.js`,
  `engine/world/scene-field.js` or `boolean.test.js`.
- Invalid cases, one defect each, built by mutating a VALID document: `op` on
  a spawn / objective / anchor, `op` misspelled, `target` on an `add`, `target`
  naming itself, `target` naming a non-existent id, `target` naming a
  non-solid (a spawn), `target` naming another SUBTRACT rather than an added
  solid. Assert on the message, not just that it threw.
- Valid cases worth pinning because they are easy to break: a carve that
  removes a solid entirely (is the field empty space, or does something worse
  happen?), two carves targeting the same solid, one carve targeting a solid
  that a second carve has already removed, a carve entirely outside the solid
  it targets (no effect), and a carve exactly tangent to its target.
- For every valid case also assert the CAPABILITY the field advertises, since
  that is the part a solver trusts.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of how many validator rules you found around `op`
  and `target`, how many you covered, and the rest listed with reasons. Plus
  the fail-demo required above, on one rule of your choosing.

**VERDICT: ACCEPTED, 2026-09-09 (lead: Opus).** Fail-demo re-run by the lead
rather than taken from the report: with the target-resolution rule neutralised
in `scene-field.js` the corpus throws and exits 1; restored, `git diff engine/`
is empty and the corpus is 18/18, suite 30/30.

The structural point in the report is the part worth keeping. Three invalid
cases pass `validateScene` by design and are only refused when the field is
compiled, so they live in a new manifest rather than MUSE-13's -- and the
runner ASSERTS that layer split instead of papering over it. Noticing that the
two layers refuse different things, and encoding it, is what a corpus is for.
Committed as `24d3b55`.


## MUSE-25 - Is the marcher telling the truth?

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@c3d4631, WSL node v22.23.2) | Reviewer: Opus | Node-only | **Take this first**
Report: docs/qa/overnight-results.md (MUSE-25). Marched vs fixed-step+bisect truth over 6 scenes: uncarved 4e-15, carved closer ≤6.56e-6 (threshold/sin mechanism), overshoot 0, membrane ray exact; one budget-exhaustion sail (256 steps, t=40.4474 vs truth 40.4475) pinned as known limitation and handed back. Fail-demo 2/7 exit 1 without threshold; 9/9 + suite 31/31 restored. No engine edits.

`rayHit` used to solve each primitive in closed form. On a carved scene it now
SPHERE-TRACES (`engine/world/scene-field.js`), because the nearest analytic
surface may have been cut away. Nobody has checked that the marched answer is
the right one. A marcher that stops slightly early, or sails past a thin
feature, is wrong in a way every existing test would pass: `boolean.test.js`
asserts a ray gets through a doorway and stops at a wall, which a sloppy
marcher also does.

The check is a comparison against an INDEPENDENT ground truth, not against the
marcher's own idea of where it stopped.

- Allowed writes: a new `march-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`. If the
  marcher is wrong, that is the finding and it is the deliverable.
- Ground truth: step along the ray in small fixed increments and find the first
  sign change of `field.distance`, then bisect that bracket to convergence.
  That is slow and obviously correct, which is exactly what a reference should
  be. Do not reuse `rayHit` to produce it.
- Compare over a spread of scenes you build in the test: carved and uncarved,
  carve fully inside its target, carve straddling the surface, two overlapping
  carves, and a carve that leaves a THIN remaining wall (the case a marcher
  most plausibly steps over). Deterministic ray origins and directions, no RNG.
- Report the worst absolute disagreement and the ray that produced it, and say
  which scene it came from. A single number with no case attached is not
  actionable.
- Assert separately that the marcher never reports a hit CLOSER than the truth
  (that would draw a surface in front of where it is) and never overshoots by
  more than a stated tolerance. Those two failures have different causes and a
  combined assertion hides which one happened.
- Also check the UNCARVED case agrees with the closed form to near machine
  precision. If it does not, the exact path has a bug and that outranks
  everything else in this task.
- Fail-demo: loosen the marcher's hit threshold in your own copy, show the
  check catching it, restore, show `git diff engine/` empty.
- Acceptance: worst-case numbers per scene, both directions asserted
  separately, and the fail-demo.

## MUSE-22 - The two checks the GPU dropout blocked

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@c3d4631, WSL node v22.23.2) | Reviewer: Opus | Worker: LeoPC win32 pid 40688 (fresh, user-restarted)
Report: docs/qa/overnight-results.md (MUSE-22). User restarted on Windows node as asked; both green: link-time exit 0 (9 cold programs, hyperbolic 10.1 s, RTX 5070 Ti) and play-check default exit 0 (3x3000 frames, 10 crossings). Dropout diagnosis confirmed. All nine families measured.

MUSE-20 measured seven of nine check families. `play-check` and `link-time`
failed on the worker host with `no webgl2` from about 19:03, after real-GPU
checks had passed at 18:52. The lead re-ran `link-time` directly on Windows
afterwards and it was fine — 8.5 s hyperbolic, real GPU — so this is a
transient on the worker, not a defect in either tool.

- Allowed writes: `docs/qa/overnight-results.md`, `docs/qa/check-runbook.md`
  (timing cells only, for rows you ran), this task's status and report.
- Ask the user to restart the check-queue worker before you start, and say in
  your report whether they did. A worker that has been up for a long time is
  the suspect.
- Through the queue: `play-check` (default) and `link-time`. Record command,
  exit code, wall time and the numbers each reports.
- If `no webgl2` recurs, STOP after two attempts and record: the exact error,
  how long the worker had been up, and what the immediately preceding
  successful check was. That timing is the finding.
- Acceptance: both rows measured, or a precise account of the recurrence.

## MUSE-23 - What does a carve cost at query time?

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@c3d4631, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-23). New tools/carve-bench.js + docs/qa/carve-cost-2026-09.md: distance 0.21/0.44/0.73 at 8 carves (1/4/16 solids), normal milder, rayHit cliff 20-50x on first carve, mean steps 96/43/23. Warmed, 3 runs min/med/max. No verdict offered; next: untargeted carves + hit/miss-separated steps. No engine edits.

With no carve, `rayHit` solves each primitive in closed form. With one, it
sphere-traces, because the nearest analytic surface may have been cut away.
That is a real cost and nobody has measured it. The collision solver calls
these in a loop, so the number decides whether carving is something an author
can use freely or something to use sparingly.

- Allowed writes: `docs/qa/carve-cost-2026-09.md` (new), `tools/carve-bench.js`
  (new), `docs/qa/overnight-results.md`, this task's status and report. Do NOT
  edit anything under `engine/`.
- Measure, on documents you build in the benchmark rather than fixtures:
  `distance()`, `normal()` and `rayHit()` calls per second, for scenes with
  0, 1, 2, 4 and 8 carves, at 1, 4 and 16 additive solids.
- Report the RATIO to the uncarved case, not just absolute rates — the
  absolute numbers are about this machine and the ratio is about the design.
- Also report the mean number of marching steps `rayHit` takes, since that is
  the mechanism and it is the thing that would change if the bound got tighter.
- Warm up before timing, run each configuration at least three times, and
  report min/median/max. A single sample of a JIT'd loop measures the JIT.
- Do NOT conclude whether carving is "too slow". Report numbers and say which
  configuration you would want measured next.
- Acceptance: one table, the ratios, the step counts, and the method stated
  including how you warmed up.

## MUSE-24 - One place where the numbers live

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@c3d4631, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-24). New docs/qa/measurements.md: ~30 rows, every number re-produced (worlds 346 + ball-lab 69 fresh today), stale runbook cells + superseded TODO era totals flagged for migration, 4 no-command rows named as the rot list, dated logs + excluded classes stated with reasons. No docs edited.

MUSE-12 found fourteen false claims and nearly all of them were numbers that
had been true once: check counts, suite counts, program counts, ray counts.
The cause is structural — every document quotes its own figures, so every
document rots independently. Fix the structure, not the fourteen instances.

- Allowed writes: `docs/qa/measurements.md` (new),
  `docs/qa/overnight-results.md`, this task's status and report. **Do not edit
  the documents that carry the stale numbers** — the migration is the lead's,
  because deciding which claims are scope statements rather than measurements
  is a judgement call.
- Sweep every `.md` for a factual NUMBER about the code: counts of tests,
  checks, suites, programs, rays, cases, fixtures, geometries, timings.
- Build one table: the quantity, its current true value, the exact command that
  produces it, the host that matters (or "any"), and every file:line that
  currently quotes it.
- Where a quantity can be produced by a command, say so. Where it cannot —
  because nothing prints it — mark it and say what would have to exist. That
  list is the more useful half of this task: a number no command produces is a
  number that WILL rot.
- Do not include numbers that are constants of the mathematics rather than
  measurements of the code (eight Thurston geometries, four bounces, a 4x4
  matrix). State the rule you used to draw that line.
- Acceptance: the table, with a command against every row that has one, and an
  explicit list of the rows that have none.

**VERDICTS on MUSE-22, 23, 24, 25 -- 2026-09-09 (lead: Opus). All four
accepted.** Committed as `62ed20f` and `aaa8015`.

MUSE-25 is the one that mattered. Its brute-force reference caught a real
defect in code the lead had written: `rayHit` reported `Infinity` -- "nothing
there" -- about a wall it had nearly reached, because a fixed 256-step budget
ran out one step short on a grazing ray. The bound never lied; the budget did.
Fail-demo re-run by the lead: with the hit threshold loosened to 0.5 the suite
goes 2 passed / 7 failed and exits 1; restored, `git diff engine/` is empty and
it is 9/9.

Pinning the limitation explicitly, with a note saying to delete the case once
the budget changed, was the right call and made the fix trivial to land. The
case is now two assertions instead: that the ray resolves, and that a starved
cast reports `exhausted` rather than pretending to be a miss.

MUSE-23's finding is the SHAPE rather than any number: `rayHit` shows a 20-50x
cliff on the FIRST carve and very little after, because that is where the
closed form stops applying and tracing begins. Carving is a threshold, not a
gradient, and the second carve is nearly free. Declining to say whether that is
acceptable was correct -- that is a design question.

MUSE-24 caught the runbook's ball-lab count going stale the moment carve
rendering landed, which is precisely the decay it exists to end. The four rows
with no producing command are the more useful half of that table.


## MUSE-26 - A corpus for intersection

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@d08307e, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-26). 6 rules found, all covered: 9 message-checked invalid docs (global with WHY asserted, kinds x3, self, missing, subtract/intersect targets, misspelled clip) + 7 valid clip docs with caps pinned; normals agree exactly ([0,0,-1] both ways); commute bitwise; fail-demo exit 1 without rule, 16/16 + suite 32/32 restored. Observation handed back: self-target message says carve for intersects. No engine edits.

`op: 'intersect'` landed in `aaa8015` with seven tests, all written by the
person who wrote the feature. MUSE-21 did this for subtraction and the pattern
worked; do it again for clipping. The interesting part is that intersection is
the SAME code path as subtraction with the sign flipped, so the cases that
matter are the ones where the two differ.

- Allowed writes: new files under `levels/fixtures/invalid/` and
  `levels/fixtures/carve/` (or a new `levels/fixtures/clip/`), a new
  `intersect-corpus.test.js`, `docs/qa/overnight-results.md`, this task's
  status and report. Do NOT edit `engine/world/document.js`,
  `engine/world/scene-field.js`, `boolean.test.js` or `boolean-corpus.test.js`.
- Invalid cases, one defect each: a global intersect (no target), an intersect
  on a spawn / anchor / objective, an intersect targeting itself, targeting a
  missing id, targeting a subtract, targeting another intersect. Assert on the
  MESSAGE, and for the global case assert it explains WHY rather than just
  refusing -- that message is doing real work.
- Valid cases worth pinning: a clip that removes its target entirely, a clip
  that removes nothing (target wholly inside it -- assert the field is
  bitwise what it would be with no clip at all), two clips on one target,
  a clip and a carve on the SAME target in both document orders (the result
  must not depend on the order, since both are a max), and a clip whose
  boundary exactly touches its target.
- THE ONE THAT MATTERS MOST: for a face produced by a clip and the
  corresponding face produced by a carve, assert the normals agree. The sign
  that distinguishes the two operations also decides which way a surface
  faces, and getting it backwards is a one-character bug that looks like a
  collision problem.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of rules found around `intersect` and how many are
  covered, plus a fail-demo on one of them.

## MUSE-27 - The modifier algebra, tested rather than asserted

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@d08307e, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-27). Identity holds BITWISE (worst deviation exactly 0, distance+normal, 206 seam-including points, both signs); order/idempotence/isolation likewise exact. Fail-demo (global to first solid only): only the 2 identity checks fail, exit 1; restored, diff empty, 5/5 + suite 33/33. No engine edits.

`engine/world/scene-field.js` justifies its design in a comment:

    A modifier with no target applies to every solid, and that is EQUIVALENT
    to applying it to the union afterwards, because max distributes over min:
        max(min(a, b), k) = min(max(a, k), max(b, k))

That identity is the reason scoped modifiers are called a strict
generalisation rather than a different operation. It has never been tested. A
comment asserting an algebraic law is exactly the kind of claim that is true
when written and false after a refactor.

- Allowed writes: a new `modifier-algebra.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/`.
- Test the identity AS THE FIELD COMPUTES IT, not as arithmetic: build a scene
  with a global modifier, build the same scene with that modifier duplicated
  and explicitly targeted at each solid, and assert the two fields agree at
  many deterministic sample points -- distance AND normal.
- Then the properties that follow, each of which could break independently:
  order-independence (two modifiers on one target, both document orders),
  idempotence (the same modifier twice is the same as once), and that a
  modifier targeting a solid has NO effect on any other solid's surface.
- Sample points must include places near the seams, not just open space. A
  property that holds everywhere except where two surfaces meet is a property
  that does not hold, and the seams are where `max` is not exact.
- Where an identity does NOT hold exactly, say so with the worst deviation and
  where it happens, rather than loosening a tolerance until it passes. A
  measured near-miss is a finding; a passing test with a mystery tolerance is
  not.
- Fail-demo: break the identity in your own copy (make the global modifier
  apply to only the first solid, say), show the check catching it, restore,
  show `git diff engine/` empty.
- Acceptance: each property stated as a sentence, tested, and either confirmed
  with its worst deviation or reported as not holding.

## MUSE-28 - Walking on a bound

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@d08307e, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-28). 13 scenes (9 hand + 4 seeded), 20,800 steps: zero sinks, positions finite, max stall run 2 vs N=60; stall fraction exact 0.0014 vs bound 0.0006 (noise scale, bound not worse). Sensitivity demo: inside-geometry start trips SINK branch step 0. Suite 34/34. No engine edits.

The collision solver was built against an EXACT distance field. Carving and
clipping made the distance a lower bound, and the walker has not been exercised
on one in any systematic way -- `boolean.test.js` walks through one doorway.
Conservative advancement should be safe on a bound by construction, since a
lower bound only makes steps shorter. "Should be" is the part this task
replaces.

- Allowed writes: a new `walk-bound.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- Generate scenes deterministically -- no RNG, or a seeded generator whose seed
  is printed on failure. Vary: number of solids, number and kind of modifiers,
  whether modifiers are targeted or global, and include configurations that
  produce thin walls, narrow gaps and concave corners.
- For each scene, walk a probe from several starts along several headings for
  several hundred steps, and assert on every step: it never sinks below
  `-1e-3` clearance, it never reports `stalled` for more than N consecutive
  steps (state your N and why), and its position stays finite.
- Report separately how often the solver STALLS on a bound versus on an exact
  field, at matched scene complexity. A bound makes steps shorter, so more
  stalling is expected -- the question is how much, and nobody knows.
- If you find a scene where the probe sinks, that is the deliverable: the seed,
  the scene as JSON, the step it happened on, and the clearance. Stop and
  report rather than characterising further.
- Acceptance: the number of scenes and total steps walked, the stall comparison
  with its method, and either a clean verdict sentence or a reproducing case.

**VERDICTS on MUSE-26, 27, 28 -- 2026-09-09 (lead: Opus). All three accepted.**
Committed as `31281bc`.

MUSE-27 mattered most. `scene-field.js` justified scoped modifiers in a
COMMENT -- that a global modifier equals per-solid targeted copies because max
distributes over min -- and that comment was the entire argument for calling
the scoped form a strict generalisation rather than a different operation.
It is now a checked property at 206 seam-including points on distance AND
normal, with the worst deviation exactly 0.00e+0 rather than a tolerance.
Reporting an exact zero instead of picking an epsilon is the right instinct and
is what makes the result worth anything.

The fail-demo was re-run by the lead rather than taken on trust: making the
global modifier apply to the first solid only fails exactly the two identity
checks with concrete divergent points and exits 1; restored, `git diff engine/`
is empty and it is 5/5.

MUSE-26 pinned where clipping DIFFERS from carving, which is the only
interesting part when the two share a path with the sign flipped. Asserting the
no-op clip and the two document orders BITWISE, and checking that every refusal
leaves its input byte-identical, are both stronger than asked for.

MUSE-28 answered a question nobody had measured: the solver stalls on a bound
at 0.0006 of steps against 0.0014 EXACT -- noise scale, and in the unexpected
direction.

CORRECTION 2026-09-09 (Opus): the two figures were written round the wrong way
in this entry and in the commit message for `31281bc`. Muse's report has exact
0.0014 versus bound 0.0006. Reversed, it reads as the bound stalling more,
which is the result that was expected and did not happen. The bound stalls
slightly LESS, and neither figure is far enough from the other to conclude
anything except that the feared penalty did not appear. Caught by Astra. A clean verdict is only worth reading if the check could have
failed, and the inside-geometry start tripping SINK on step 0 is what makes it
worth reading.

The one observation handed back -- the self-target refusal saying "carve" for
intersects -- was correct and is fixed in `31281bc`. Handing back a wording
nit with "wording is yours" rather than editing a message you were told not to
touch is exactly the right call.


## MUSE-32 - The metric space, checked against identities it cannot fake

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-32). New metric-truth.test.js: 29 checks, e3 + s3 at R 0.5/1/7 (+R=1e4 flat limit). Holonomy matches l'Huilier to ≤8.4e-14, e3 exactly 0; inversion exact ≥1e-6 with the sub-1e-9 floor pinned as a correct gate; shortest/isometry/frame/boundary all dust-scale. Fail-demo (carry lobotomized): 23/6 exit 1 via the tangency gate. Restored, diff empty, 29/29 + suite 39/39. No engine edits.

`engine/geometry/metric-space.js` is new and it is now load-bearing: the whole
collision solver runs through it, and the S3 room is being built on top of it.
It has 16 checks written by its author and 11 written by me, and both of us
were checking the thing we had just written. That is exactly the situation
MUSE-25 was about.

A metric space is unusually good to test this way, because differential
geometry supplies IDENTITIES that must hold for any correct implementation and
that a wrong one cannot accidentally satisfy. Use those rather than recomputing
the formulas a second way.

- Allowed writes: a new `metric-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- Test BOTH `kind: 'e3'` and `kind: 's3'` at several curvature radii, including
  one large enough that S3 is nearly flat -- an S3 result that does not tend to
  the E3 result as the radius grows is a bug, and that limit is a strong check
  costing you nothing.
- The identities worth pinning, each as a sentence before you test it:
  - `logAt` and `expAt` invert each other, both ways round, over a spread of
    separations from tiny to near the patch limit. Tiny separations are where
    a naive implementation loses all its precision.
  - `distance(p, q)` equals the norm of `logAt(p, q)`, and is symmetric.
  - A geodesic is LOCALLY SHORTEST: sample paths that deviate from
    `stepWithTransport` and confirm none is shorter. This is the one that
    catches a step that is subtly not a geodesic.
  - Transport is an ISOMETRY: it preserves the inner product of any two
    vectors, not merely the length of one. Length alone is preserved by
    things that are not transport.
  - Transport around a CLOSED LOOP returns a rotated vector, and on a sphere
    the angle it comes back rotated by is the enclosed area divided by R^2.
    That is holonomy, it is the sharpest available test that transport is
    genuinely the Levi-Civita one, and it cannot be satisfied by accident.
    In E3 the same loop must return the vector unchanged.
  - `frame(p)` is orthonormal at every p you try.
  - `boundaryDistance` agrees with a bisection on `withinDomain`.
- Report worst deviations WITH the query that produced them, and the
  separation or radius regime each was found in. If precision degrades near
  the patch limit or at tiny separations, that is a finding worth more than a
  pass -- say where it starts.
- Fail-demo: break one identity in your own copy of a helper, show the check
  catching it, restore, show `git diff engine/` empty.
- Acceptance: each identity stated as a sentence, tested in both geometries,
  and either confirmed with its worst deviation or reported as not holding.

## MUSE-31 - Coincident faces: characterise, and do not force a number

Status: READY FOR REVIEW (REVISED 2026-09-09) | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only
Report: docs/qa/overnight-results.md (MUSE-31). Reproduced in Node: analytic flags exact coincidence (21/41 indeterminate, zero elsewhere incl +-1e-12); march dithers owners on wide coincident sills (sizes 2-3, 4/8 pairs, zero off exact-zero). No warning distance exists; the flag is the signal. Fail-demo on the uncertainty trip, restored, 4/4 + suite 40/40. No engine/app edits.

**REVISION, from Astra.** The first version of this task asked you to find a
threshold. That framing pushes toward producing a number whether or not one
exists, so three things are now explicit:

1. **Failing to reproduce the artifact in Node is a VALID RESULT** and a
   complete answer to this task. The symptom was seen on a GPU. If the CPU
   field is well behaved across the whole sweep, say so and stop -- that
   finding is worth more than a threshold extracted from a signal you had to
   go looking for.
2. **A legitimate change of normal across an edge is not a defect.** A box has
   edges; neighbouring rays that land on different faces SHOULD report
   different normals. Only a discontinuity that cannot be explained by the
   geometry counts.
3. **Do not derive a universal editor warning distance from one camera or one
   epsilon.** If the behaviour tracks view distance, grazing angle or
   `hitEpsilon`, then there is no document-level constant to warn on, and
   saying that plainly is the deliverable.

The `box-room` fixture first drew a SPECKLED LINE across its doorway sill.
The carving box's bottom face sat at exactly z = 0, in the same place as the
ground plane; two surfaces occupy one location and the marcher cannot say
which it is on. Sinking the cutter 0.2 below the floor fixed it. Nothing
numeric caught this -- only the picture did.

There is a TODO to have the editor WARN about this. Whether such a warning
can exist AT ALL -- whether "too close" is a property of the document or only
of a particular view -- is the actual question. Answering "it is not a
document property" closes the TODO just as well as a number would.

- Allowed writes: a new `coincident.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/` or
  `app/`.
- Reproduce it in Node FIRST, without a browser. The symptom on screen is a
  ray that cannot decide which surface it hit, so the CPU analogue is
  `rayCast` disagreeing with itself: march a fan of rays across the seam and
  look at whether `t`, the owner, or the normal flips between neighbouring
  rays that should agree. State what signal you chose to be the defect and
  why, BEFORE you sweep -- a threshold found by looking for one is not a
  measurement.
- Then sweep the separation: carving box bottom at exactly the plane, and at
  a decreasing series of offsets above and below. Report where the signal
  appears and disappears, in both directions. Coincident and NEARLY coincident
  may not behave the same way, and if so that is the finding.
- Vary the thing that should matter and check whether it does: the distance
  from the camera to the seam, the grazing angle, the size of the solids, and
  `hitEpsilon`. A threshold that is really a function of one of those is not a
  constant the editor can warn on, and saying so is a better answer than a
  number that only holds for one scene.
- Report any threshold as a RANGE with the sweep that produced it, never a
  single value, and never one extrapolated past the conditions you swept.
- NOTE THE FIELD HAS CHANGED UNDER THIS TASK. `rayCast` now resolves ray
  intervals analytically per solid group by default and reports `status`,
  `owner` and `normal`; the marcher is reachable with `method: 'march'`. Sweep
  BOTH, and report them separately -- if the analytic path is clean where the
  marcher is not, that is the most useful thing this task could find, because
  it says the artifact belongs to marching rather than to the geometry.
- Acceptance: the chosen defect signal stated as a sentence BEFORE the sweep,
  the sweep itself, and either a characterised range or a clear statement that
  no document-level threshold exists. A fail-demo only if you found a signal
  to demonstrate; if you found none, show instead that your check WOULD fire
  on a scene you construct to be genuinely bad.

## MUSE-29 - A corpus for boxes

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only

Report: docs/qa/overnight-results.md (MUSE-29). 12 validator gates around `box`
covered by 18 one-defect invalids (document vs field layer asserted per case,
refusal leaves input byte-identical); owner bands pinned in two declaration
orders with subtracts-before-intersects ordering (ball [200,101,0,101,200],
box [0,101], plane [200]); caps measured: single unmodified box `exact`,
any union or modifier `bound` (the task's "scene of boxes stays exact" holds
for ONE box only — finding, not a failure). Fail-demos: corpus absent crashes
ENOENT; neutralised zero-defect gives Missing expected exception. Restored,
27/27 + suite 41/41. No engine edits.

MUSE-21 did this for subtraction and MUSE-26 for intersection, and both found
things. Same pattern, new kind. The interesting part this time is that a box
is the FIRST solid to arrive after modifiers existed, so it lands in code that
was written without it.

- Allowed writes: new files under `levels/fixtures/invalid/` and a new
  `levels/fixtures/box/`, a new `box-corpus.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  `engine/world/document.js`, `engine/world/scene-field.js`, `box.test.js` or
  any existing test.
- Invalid cases, one defect each: `halfExtent` missing, wrong length, zero,
  negative, non-finite; `halfExtent` on a ball, a plane, a spawn; `radius` on
  a box; a frame (`up` or `forward`) on a box; a box whose CORNER leaves the
  chart while every half-extent on its own is inside it. Assert on the
  message, and confirm each refusal leaves the document byte-identical.
- THE ONE THAT MATTERS MOST: owner indices now span three bands -- ball i,
  plane 100+i, box 200+i -- and a modifier names its target by that index.
  Build scenes with several of each kind, in several document orders, and
  assert every modifier applies to the solid it names AND to nothing else. An
  off-by-one in a band carves the wrong object, which looks like a rendering
  bug and is a bookkeeping one. Cover a box carving a ball, a ball carving a
  box, a box clipping a plane, and a box modified by two different kinds.
- Also worth pinning: that a scene of boxes with no modifier still advertises
  `distance: 'exact'`, and that adding one modifier of any kind drops it to
  `bound`. That is the capability the whole primitive exists to protect.
- Checks: your new file plus `node tools/test.js`. Report both numbers.
- Acceptance: a stated count of rules found around `box` and how many are
  covered, plus a fail-demo on one of them.

## MUSE-30 - Is the box really exact?

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only

Report: docs/qa/overnight-results.md (MUSE-30). Independent reference
(face-sampled nearest surface point + descent to <1e-12, numeric gradient at
h=1e-7, sign-bisection to 1e-12) agrees with the closed form on 5 boxes
(unit, 10:1:0.01 slab, 0.001 needle, 2 oriented) at ~210 distance, ~90
normal, 40 ray points: worst deviations 1.8e-16 (distance), 3.3e-16
(normal gap), 7.1e-15 (slab, needle). Reference discriminates: six-plane
max bound misses an outside corner by 0.037, 1e-9 tolerance catches it.
Fail-demo by construction (see report). box-truth 3/3 + suite 42/42.
No engine edits.

`box.test.js` brackets the distance from both sides -- nothing within `d` is
inside, and stepping past `d` is not outside -- which pins it to about 1e-7.
That is the lead checking their own formula with a cleverer version of the
same idea, and MUSE-25 is the reason that is not enough: an independent
reference caught a defect in code the lead had written and was confident in.

Build the independent reference.

- Allowed writes: a new `box-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- The reference is the NEAREST POINT ON THE SURFACE, found without the box
  formula: sample the six faces densely, take the best, then refine locally
  until it stops improving. State your refinement and its convergence, and
  report the resolution you actually achieved rather than assuming it.
- Compare across many boxes and many query points -- inside, outside, on a
  face, off an edge, off a corner, very close to the surface, and far away --
  and include boxes with extreme aspect ratios, where a formula that is
  secretly assuming a cube shows it.
- Do the same for the NORMAL against a numeric gradient, and for `rayHit`
  against bisection on the sign, at a much finer resolution than `box.test.js`
  uses. Report worst deviations with the query that produced them.
- If everything agrees, say so with the numbers and the resolution -- that IS
  the deliverable, and it is what lets the rest of the project rely on the
  primitive. If anything disagrees, stop and report the case: the box, the
  query, both answers, and the difference.
- Acceptance: the reference described well enough that someone could rebuild
  it, the comparison, and either a clean verdict with worst deviations or a
  reproducing case.

**VERDICTS on MUSE-29, 30, 31 and 32 -- 2026-09-09 (lead: Opus). All four
accepted.** Committed as `0879193`.

MUSE-32 mattered most. `metric-space.js` is load-bearing -- the whole collision
solver runs through it -- and it had only checks written by the two people who
wrote it. HOLONOMY closes that gap in the way nothing else could: transport a
vector round a closed geodesic triangle and it returns rotated by the enclosed
area over R squared, with the area obtained independently through l'Huilier's
theorem rather than by composing the same rotations a second time. 8.4e-14
across three radii, exactly 0 in E3. Reaching for an identity instead of a
recomputation is the whole lesson of this task.

Fail-demo re-run by the lead: lobotomise `carry` to return its input and the
suite goes 23 passed / 6 failed, exit 1, caught at the tangency gate -- a
vector that was not transported is no longer tangent. Restored, `git diff
engine/` empty, 29/29.

MUSE-31 answered its question with a NO, which the revision existed to make
possible. There is no coincident-face warning distance because there is no
distance: the analytic path flags exact coincidence and is clean at 1e-12.
Reporting the marcher's own dithering separately is what says the artifact
belongs to marching rather than to the geometry. The lead reproduced the fan
(21/41 at zero, 0 at 1e-12) before building on it, and `coincidentFaces()` now
ships -- exact candidates from the document, confirmed by the flag.

Two exclusions had to be added on top, both found by building the naive version
and watching it cry wolf: sharing a PLANE is not a defect (a crate resting on
the floor shares one), and an exposed shared plane is not enough either (the
wall's bottom face is in the floor's plane and exposed inside the doorway, but
its material there is carved away).

MUSE-29 found a claim of the LEAD's to be false -- "a scene of boxes stays
exact" holds for one box only -- and reported it rather than loosening the
test. That is the right call every time. Corrected in the docs.

MUSE-30's independent reference agreed to 1.8e-16 on distance and showed its
discriminating power rather than asserting it, by catching a six-plane bound
missing an outside corner by 0.037.


## MUSE-33 - The phantom surface of a carve: find the real rule

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only

Report: docs/qa/overnight-results.md (MUSE-33). Rule CONFIRMED and BOUNDED:
o > 2r releases a centered untilted walk (o*=2r within one 0.1 grid step,
box/ball/tunnel/notch, thin/thick, oblique at small r, all S3 verdicts
match E3). Tilted-25 and fat oblique ball release LATE (above 2r). Two
configurations have NO safe overhang: oblique-30 and tilted-25 box cutters
at r=0.5 in a 1.7-wide doorway halt with truth-room at every overhang
through o=3.0. Fail-demo: o=0.6 tilted-25 (r=0.25) and o=1.1 ball-oblique
(r=0.5) pass a 2r check and the walker halts in open air. Sink: field never
overestimates (4.4e-16). phantom-carve 7/7 + suite 44/44. No engine edits.

Walking the new S3 room turned up a live defect, and it is not
curvature-specific. Subtraction is `max(d, -m)`. Where the carving solid
extends PAST the solid it cuts, that `-m` term is the distance to the CARVER's
own boundary -- a surface standing in open air that belongs to nothing. The
value stays a valid lower bound and nothing is drawn there, so the renderer is
innocent. But a walker reads a CLEARANCE from it, and when that clearance falls
below the player radius the player is stopped dead by nothing at all.

Observed: the S3 probe halted at y = 2.05, past the wall's far face, with the
field reporting 0.2505 against a player radius of 0.25.

I derived a rule and confirmed it in one configuration:

    a cutter must overhang its target by MORE THAN TWICE the player radius

reasoning that a probe is stopped one radius short of the carver's face and
escapes only if the target's own distance already exceeds a radius there. At
radius 0.25 an overhang of 0.5 blocks and 0.7 walks through.

**One configuration is not a rule.** That derivation assumes an axis-aligned
box cutter meeting a flat face head-on. Find out what is actually true.

- Allowed writes: a new `phantom-carve.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Vary what the derivation assumed and see which parts of it survive: cutter
  and target kinds (ball, box, plane, and geodesic-cell in S3), approach angle
  (head-on versus oblique versus grazing), player radius, the SIZE of the
  overhang relative to the target's own thickness, and an oriented cutter
  whose faces are not parallel to the target's.
- State the measured quantity before you sweep. "Blocked" needs a definition:
  a sweep that reports `hit` where the true nearest material is further than
  the probe radius is the obvious one, but say what you chose and why, and how
  you compute the TRUE nearest material independently of the field.
- The interesting answers, in order of usefulness: the rule is 2r for every
  configuration; the rule is k*r for some other k you measure; the rule depends
  on something other than the radius, in which case say what; or there are
  configurations with no safe overhang at all, which would be the most
  important finding of the four.
- A ball cutter has no flat face and may behave completely differently. Say so
  if it does rather than forcing it into the same rule.
- Also worth knowing and cheap: does the phantom ever make the walker SINK
  rather than stop? It should not -- the bound never overestimates -- but the
  claim is worth one check.
- Fail-demo: an authored scene that a check based on your rule accepts and that
  the walker then fails to cross, or a demonstration that you could not
  construct one.
- Acceptance: the rule as a sentence with the sweep behind it, the
  configurations where it does NOT hold, and an explicit statement of what an
  editor could check from the document alone.

## MUSE-34 - The S3 room, checked the way MUSE-30 checked the box

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only

Report: docs/qa/overnight-results.md (MUSE-34). Independent cell reference
(great-sphere faces through transported axes, slab-coordinate membership,
no poles): field never over-reports it (1680+ probes, 5 configs). Worst
under-report: edge-diagonal 0.29 and corner-diagonal 0.36-0.42 per unit
distance, IDENTICAL at R=2/8/10000 and at patch ratio 0.83 -- geometric
(1-1/sqrt2, 1-1/sqrt3), not curvature-driven. Faces/inside/far agree to
dust (<=5e-14). Fail-demo: flat chart arithmetic over-reports by 3.8e-2
at R=2 (caught) and agrees to 1.8e-9 at R=10000 (hidden there -- why the
curved check exists). s3-truth 5/5 + suite 45/45. No engine edits.

`s3-room.test.js` has eight checks, written by the person who verified the
field, and its strongest is the flat limit at R = 10000. That is a good check
and it is one lead checking another lead's code with a third idea. MUSE-30 is
the pattern for what comes next: an INDEPENDENT reference, finer than the
thing it tests.

- Allowed writes: a new `s3-truth.test.js`, `docs/qa/overnight-results.md`,
  this task's status and report. Do NOT edit anything under `engine/`.
- The reference for a `geodesic-cell` is the nearest point on its surface
  found WITHOUT the plane construction: sample the cell's boundary, refine, and
  measure great-circle distance. State your refinement and the resolution you
  actually reached.
- The cell distance is a BOUND, not exact, so the comparison is one-sided:
  the field may under-report and must never over-report. Measure how MUCH it
  under-reports and where -- near a face, near an edge, near a corner, deep
  inside -- because that shortfall is what the walker pays for and nobody has
  measured it in a curved space.
- Sweep the curvature radius from nearly flat to tight enough that the room
  fills a large fraction of the sphere. Report where, if anywhere, the
  behaviour departs from the flat case by more than the geometry demands.
- Include a cell whose half-extents approach the patch limit, which is where a
  face's pole construction is most likely to lose precision.
- Acceptance: the reference described well enough to rebuild, the one-sided
  comparison with worst under-report and where, and the curvature sweep.

## MUSE-35 - What does the marched path cost now?

Status: READY FOR REVIEW | Owner: Muse (2026-09-10, main@08247fe, WSL node v22.23.2) | Reviewer: Opus | Node-only

Report: docs/qa/overnight-results.md (MUSE-35). Re-measured honestly:
new tools/raycast-bench.js compares method analytic vs march on the same
5 scenes x 3 ray buckets with hits/misses/indeterminates separated
(observed statuses, min/med/max, 3 runs stable). No cliff: first carve
~1.2x analytic, march same order except grazing 3-5x (49 steps), worst
22x one ray riding a coincident face plane (216 steps, 34us). Concentrated
carves cheaper than spread (per-group win: 2.8 vs 3.7us). Analytic declines
twice (indeterminate, march calls them miss); march never exhausts at
default budget (0 indet). Dated report docs/qa/raycast-cost-2026-09-10.md
retires the 20-50x row in measurements.md. Says nothing about frame time,
by design. No engine edits.

MUSE-23 measured a 20-50x cliff on the first carve, and that number is now
stale in two ways at once: `rayCast` resolves ray intervals analytically per
solid group by default, so a modifier no longer forces the whole scene to
march; and the figure was CPU `rayHit` THROUGHPUT, which the lead then repeated
as if it were frame time. It is not, and no GPU path may be promoted on CPU
throughput alone.

Re-measure the CPU half honestly. The GPU half needs a browser and is not
yours.

- Allowed writes: a new or updated bench under `tools/`, a dated report under
  `docs/qa/`, `docs/qa/measurements.md`, `docs/qa/overnight-results.md`, this
  task's status and report. Do NOT edit anything under `engine/` or `app/`.
- Compare `method: 'analytic'` against `method: 'march'` on the same scenes and
  the same rays, and report them separately. Scenes worth including: a room
  with no modifiers, a room with one carve, a room with many, a scene where the
  modifiers are concentrated on one solid while others are untouched (which is
  the case the per-group change was made for), and grazing rays.
- Report hit and miss rays SEPARATELY. A miss costs a marcher its whole budget
  and costs the analytic path almost nothing, so mixing them produces a number
  that describes neither.
- Count `status: 'indeterminate'` results as their own category. A path that is
  fast because it gives up is not fast.
- Every number carries the command that produced it and the host it ran on.
  Warm up, take several runs, report min/median/max rather than one figure.
- Say plainly what the measurement does NOT establish -- specifically that it
  says nothing about frame time -- so the next person to quote it has the
  caveat attached to the number rather than in a paragraph they might skip.
- Acceptance: the table, the method, the separation of hits/misses/give-ups,
  and one sentence on what changed since MUSE-23 and why.

**VERDICTS on MUSE-33, 34 and 35 -- 2026-09-10 (lead: Opus). All three
accepted.** Committed as `b40f695`.

MUSE-33 did the thing the task was written to make possible: it treated one
confirmed configuration as a hypothesis rather than a rule, and went looking
for where it stops. It found the answer named in the task as most valuable --
configurations with NO safe overhang -- and did not soften it.

The lead re-derived that claim against exact truth rather than Muse's sampler,
because a headline deserves a second opinion: wall-minus-cutter decomposes
into axis-aligned boxes, whose distances are closed forms. It agrees. At 30
degrees with r = 0.5 the probe genuinely fits, with 0.086 of clearance the
whole way through, and the solver halts it at every overhang out to 3.0.

Three reported behaviours -- releases at 2r, releases late, never releases --
turned out to be one mechanism: the walker is released only where the distance
to the CUTTER's boundary already exceeds the player radius. The overhang rule
is that condition when the MOUTH is the nearest cutter face; "no safe overhang"
is when a SIDE face is nearer, which no overhang can move. Muse had the
mechanism in hand and wrote it as a special case ("the void depth is capped by
the jamb gap, 0.39 < r"); the number is exactly right. Generalised in the
rendering contract, checked as a predicate against the solver over 372
configurations.

MUSE-34's reference is built the way the pattern demands: faces as great
spheres through transported axes, membership in slab coordinates, so the
asin-of-dot construction under test is never invoked by its own reference.
1680+ probes, never an over-report. The shortfall is 1-1/sqrt(2) at an edge and
about 1-1/sqrt(3) at a corner and IDENTICAL at R = 2, 8 and 10000 -- so
curvature adds nothing to what `max` over half-spaces already costs, which is
the finding.

The lead mutation-checked it rather than taking the fail-demo on trust: scaling
the cell face distance by 1.002 is caught by `s3-truth` and NOT by the
lead-written `s3-room`, whose face checks sit at the zero crossing where a
scale error vanishes. Both catch 1.005. That gap is the discriminating power
the task existed to buy.

MUSE-35 retired a number the lead had repeated wrongly, and its most valuable
output was a disagreement it declined to reconcile. Analytic said
`indeterminate` where march said `miss` on two rays; leaving both statuses in
the table is what let the lead chase it down to a real bug -- a near-tangency
six units BEHIND the ray origin was being clamped to the origin, so the cast
refused from a standing start with an empty sky ahead. Fixed in `f8f8fd4`,
pinned by a contract test that fails without it.

That is the third time a Muse batch has found a defect by reporting something
plainly instead of tidying it. It is worth naming as the pattern it is: when
two methods that should agree do not, the gap IS the result.

## Verdicts on MUSE-36, 37 and 38, 2026-09-10 (lead: Opus)

Re-run on LeoPC (win32) node v24.20.0 at 7816d7f, not taken from the reports.
`node tools/test.js`: 53/53 suites, exit 0. All three ACCEPTED.

**MUSE-36 accepted.** `node ray-degenerate.test.js`: 23/23, exit 0. The guard
sweep prints the flip between h = 1.5e-14 (miss) and h = 1.0e-14 (indeterminate)
against the predicted 64*eps = 1.42e-14, so the boundary is where the reasoning
said it would be, and that is the thing the task existed to check. Zero
correctness failures across the corpus; the four disagreements are all analytic
REFUSING where the reference has an answer, which is waste and not a wrong
answer. Keeping the two categories apart rather than averaging them is what
makes that readable at a glance.

One of the four is more expensive than the other three and is worth naming: a
cutter near-tangent at t = 3 ahead of a real hit at t = 4.8 makes the cast
refuse a ray that HITS. The other three refuse rays that miss, where the
fallback costs a march. This one costs a march to recover a hit the analytic
path already had in reach. Not a defect -- indeterminate is an honest answer,
and the marcher recovers it -- but it is the case to look at first if the
analytic path is ever put on a budget.

The construction lesson is the other keeper: an axis-exact tangency takes the
confident point-interval path (disc == 0) and never reaches the guard at all,
so a tangency needs a ~1e-14 offset before it tests anything. Anyone writing
the next degenerate corpus would otherwise rediscover that from scratch.

**MUSE-37 accepted.** `node carve-predicate.test.js`: 9/9, exit 0, about 17 s.
Zero disagreements in EITHER direction across 264 E3 configurations (ball and
box cutters, plane notch, 25-degree tilt, 30-degree oblique, double doors) and
7 S3 geodesic cells, with the 9 ties all halting. The predicate generalises past
the box cutter, which is what was asked.

The nested-cutter result is the finding and it fails in the SAFE direction: an
inner flush mouth inside an outer void is masked by `max()` so the solver lets
the walk through, while min-over-cutters refuses it. The predicate is therefore
conservative there -- it costs an author a room they could have had, and never
puts a player in a wall. Pinned as conservative and reported unfixed, which is
the right call; whether the editor should refuse those rooms is Astra's, since
it is a question about what the tool promises rather than about the geometry.

**MUSE-38 accepted, with one correction to how one row reads.**
`node s3-walk-cost.test.js`: 4/4, exit 0; the flat control is Euclidean to
5.21e-8 over 6.5 units, and every ratio in the report reproduces.

The headline is real and it is the most useful number the batch produced:
wall-0.35 costs **2778 curved steps against 36 flat, a ratio of 77.17**, with
98.8% of steps stalling and 97% of them spent in open hallway where the bound
reports about 4e-4 and the flat control proves 0.1. The collapse is
clearance-dependent -- 0.6 gives 1.18x and 1.1 gives 1.00x -- and the sentence
the task asked for is answered honestly: the cost does NOT fall where MUSE-34
said it would.

The correction: the corner route's raw ratio is 0.74, curved CHEAPER than flat,
and read alone that says curvature is free at a corner. It is not -- the two
walks end in different places (arclength fraction 0.766 against 0.933, and the
curved one terminates on a hit), so they are not the same walk. Muse saw this
and computed the common-prefix comparison, 26 against 6 over the shared 2.316
units, a ratio of 4.33, and put only that in `measurements.md`. Right answer;
the 0.74 should not travel without the sentence that explains it, so it is
recorded here with it.

That measurement is now the reason MUSE-40 exists: a 250x under-report in open
space cannot be produced by a fractional shortfall that MUSE-34 found to be
identical at R = 2, 8 and 10000. Two results are labelled as the same
phenomenon and at most one of them is.

---

The three closed assignments follow, as issued.

## MUSE-36 - Degenerate rays: is the analytic path still telling the truth?

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Opus | Node-only

The lead changed how `csgRayCast` treats an uncertain ray parameter (above),
reasoning that an ambiguity behind the origin carries no measure and so cannot
move any forward interval. That reasoning is probably right, and it is exactly
one person's reasoning about a module the renderer and the walker both sit on.
Go after it.

- Allowed writes: a new `ray-degenerate.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Build an adversarial corpus of near-degenerate rays and run each one three
  ways: `method: 'analytic'`, `method: 'march'`, and an INDEPENDENT reference
  you write (bisect the field along the ray, or sample and refine -- state
  which, and the resolution you reach). Two paths through the same module do
  not make a reference.
- Cases worth having, at minimum: exact tangency ahead of, behind, and
  straddling the origin; tangency to a CUTTER versus to an additive solid; a
  ray starting exactly on a surface, just inside it, just outside it; a ray
  whose `maxDistance` lands exactly on the hit; a ray across coincident faces;
  and grazes displaced by one ulp either side of tangency.
- **Sort disagreements by what they cost.** A false MISS or a false HIT is a
  correctness failure. A false `indeterminate` is only waste. Report them in
  separate categories and say, for each, which answer the reference says is
  right. Do not average them into a rate.
- Probe the new guard directly. How far behind the origin must an ambiguity be
  before the guard discards it, and is that boundary in the right place? The
  most valuable possible result is a case where discarding a behind-the-ray
  ambiguity produces a WRONG forward answer. Go looking for one specifically,
  and if you cannot construct one, say what you tried.
- Fail-demo: restore the old `Math.max(0, t)` in your working copy, show the
  corpus catching it, restore, show it green.
- Acceptance: the corpus, the reference described well enough to rebuild, the
  disagreement table split by cost, and a verdict on the guard's boundary.

## MUSE-37 - The carve predicate, past the box cutter

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Opus | Node-only

The rule now reads: *a walk passes iff, everywhere the target is within r, the
cutter's boundary is farther than r from the path.* The lead checked it as a
predicate against the solver over 372 configurations and it agreed on every
one -- but all 372 used a BOX cutter, a straight path and E3. The predicate is
about to be handed to the editor, which will refuse people's rooms with it, so
its failures need to be known before that rather than after.

- Allowed writes: a new `carve-predicate.test.js`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- Implement the predicate test-locally -- the distance from the path to the
  cutter's boundary, over the stretch where the target is within r -- and
  compare its verdict to what `sweep` actually does, across: ball cutters,
  plane targets, geodesic-cell cutters in S3 with a geodesic path, oriented
  cutters, and a target carved by SEVERAL cutters at once.
- Several cutters is the case most likely to break it, and worth thinking
  about before sweeping: with two cutters the field is a nest of `max`, and
  "the cutter's boundary" is no longer one surface. Say what the predicate has
  to become, then measure whether that version holds.
- **Direction matters more than rate.** A predicate that REJECTS a walk which
  would have worked costs an author a room they could have had. One that
  ACCEPTS a walk that then fails puts a player in a wall. Count and report
  those two separately, never as one accuracy figure.
- Where it fails, characterise the failure rather than tabulating it: which
  face was actually binding, and what the predicate thought was.
- Acceptance: the predicate as you implemented it, the comparison split by
  direction of error, the multi-cutter form with its evidence, and a plain
  statement of which primitive combinations it is not yet safe to check.

## MUSE-38 - What does the S3 bound cost a walk?

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Opus | Node-only

MUSE-34 measured the cell bound's shortfall as a fraction of distance -- 0.29
at an edge, 0.36-0.42 at a corner -- and said the shortfall "is what the walker
pays for". That was the right thing to say and it is still not a measurement of
what the walker pays. A conservative bound costs STEPS: the solver advances by
the distance it is promised, so a bound that under-reports by 40% near a seam
advances 40% less on that step.

- Allowed writes: a new `s3-walk-cost.test.js` or a bench under `tools/`, a
  dated report under `docs/qa/`, `docs/qa/measurements.md`,
  `docs/qa/overnight-results.md`, this task's status and report. Do NOT edit
  anything under `engine/` or `app/`.
- The comparison that isolates the answer is the flat limit, and it is free:
  the SAME document at curvature radius 10000 is Euclidean to 1.35e-8. Walk
  identical routes in both, and the geometry is held fixed while curvature and
  the spherical construction are the only things that vary.
- Measure per route: steps to cross, arclength travelled against the geodesic
  distance, the distribution of step sizes, and the stall fraction (steps
  advancing less than some fraction of the radius -- state which fraction and
  why).
- Routes worth having: straight across open floor, along a wall at a few
  clearances, into a corner, through the doorway, and one that grazes an edge
  the whole way. The seam-heavy routes are the point; the open one is the
  control.
- Report the cost as a RATIO to the flat case per route rather than as absolute
  step counts, so it stays meaningful when the room changes.
- If a route costs far more than MUSE-34's shortfall predicts, that is the
  finding: say so and characterise where the steps went, rather than reporting
  the ratio alone.
- Acceptance: the routes, the per-route table against the flat control, the
  stall definition, and one sentence on whether the bound's cost falls where
  MUSE-34 said it would.


## MUSE-39 - Region motion: is the clock honest and the crossing atomic?

Status: ACCEPTED as QA deliverable 2026-09-10 by Astra | Owner: Muse | Reviewer: Astra | Node-only

Delivered: `region-motion-truth.test.js` (21 checks) and
`docs/qa/region-motion-truth-2026-09-10.md`. Finding 4 CONFIRMED. Opus
re-reproduced it independently (y = 2.000000 refused on the plane, then
y = 6.000000 with `crossings = 0`) and ran the region-motion mutation matrix
against this corpus: it catches 6 of 8, missing the settle-before-event-yield
ordering and path-versus-endpoint carry, both of which `region-motion.test.js`
covers. The two corpora are COMPLEMENTARY; neither alone covers the contract,
and that is worth knowing before either is trusted on its own. Acceptance and
the finding-4 policy call are Astra's. The original assignment follows.

`engine/world/region-motion.js` now exists: `moveRegionProbe(world, state, dt,
options)` owns which region a walker is in, how much of the frame's time is
left, and whether a portal crossing is allowed to commit. It was written by
Claude against `docs/engineering/REGION_MOTION_CONTRACT.md` and checked by
`region-motion.test.js` (34 checks) plus an eight-way mutation matrix -- all of
it by the person who wrote the code. Evidence and open findings:
`docs/qa/claude-region-motion-2026-09-10.md`. Read the contract and the public
API. **Do not read the implementation for your reference** -- derive it.

- Allowed writes: a new `region-motion-truth.test.js` and a dated report under
  `docs/qa/`. Do NOT edit anything under `engine/` or `app/`, and do not change
  any existing check.
- **Write an independent analytic reference for free flight and time.** For a
  straight run at constant speed with no contact, the position after `dt` and
  the arclength travelled are closed forms in both E3 and S3; a crossing costs
  no time, so source arc + destination arc must equal `speed * dt` up to the
  exit offset. Say what your reference is and how you derived it.
- Cases worth having, at minimum: off-centre and tilted round trips; R = 0.5, 8
  and 100; two S3 regions with DIFFERENT radii and the same-dimension trap that
  goes with it; collision strictly before portal; blocked exits; a crossing that
  lands exactly on the frame end; a legitimate return crossing; tied events;
  and every budget exhausted.
- **The clock is the thing to attack.** For every result, check
  `timeConsumed + timeRemaining == dt`, and separately that `time.travel`,
  `time.rest` and the zero-time corrections add up to what actually happened.
  Rest time is not travel time. A correction is not either. Look specifically
  for a path where time is consumed twice or refunded once.
- **Check ownership and immutability on a FAILED commit.** After a refused
  crossing the input state must be untouched, the returned state must still be
  the source region, and no destination position, velocity or camera may appear
  anywhere in the result. Try to find one that leaks.
- Fail-demo: break one mechanism in an ISOLATED copy of the tree, show your
  corpus catching it, restore, show it green. Then run
  `node region-motion.test.js` and `node tools/test.js` and paste both.
- Finding 4 in Claude's report says a refused crossing leaves the walker exactly
  on the aperture plane, where the one-sided rule then declines to test it, so
  they can walk through the plane into source space. **Confirm or refute that,
  with a check.** It is a policy question for Astra either way -- report it, do
  not fix it.
- Acceptance: the reference described well enough to rebuild, the case table,
  the time-accounting audit, a verdict on finding 4, and any disagreement with
  the contract stated as a reproduction rather than a redesign.


Astra verdict: docs/qa/astra-region-review-2026-09-10.md. Both motion corpora rerun at e3300e6. QA deliverable accepted; runtime integration requires finding-4 and strict-budget repairs. No claim of complete contract compliance.

## Verdict on MUSE-40, 2026-09-10 (lead: Opus)

ACCEPTED. Re-run on LeoPC (win32) node v24.20.0: `node s3-bound-truth.test.js`
3/3, `node tools/test.js` 55/55, exit 0. Every number in the report reproduces.

**The answer is neither of the two the task offered, and that is the result.**
The task asked whether the collapse was a conservative bound behaving
conservatively or a defect in `sphericalPrimitive`. It is neither: the bound is
EXACT. Over 720 hallway samples at R = 8 and R = 10000 the ratio of field to an
independently built slab truth is 1.0000 at both the minimum and the tenth
percentile, and safety holds on every sample. At the collapsing point the facing
x- plane reads 0.2001 against a truth of 0.2001, correct to about 1e-13, with
every other `max` term deeply negative. There is nothing wrong with the field.

What is actually happening is PEEL, and it is a fact about curved space rather
than about this code. An authored cell is input parameters -- a centre and three
arclengths -- and in S3 its faces are great spheres, which curve away from the
flat plane the author drew. Three units along a face at R = 8 the wall has peeled
about 0.14 to 0.15 away from where the author put it: the profile runs 0.200 at
the sampled point and 0.351 toward the face centre, while the same room at
R = 10000 is flat 0.350 throughout. So the route MUSE-38 measured had an author
clearance of 0.10 and a real clearance of **-0.0499**. The walker was scraping
the wall. 2778 steps is what the contact regime costs, and it is honest.

**A self-correction, which is the part to keep.** Muse went back to their own
MUSE-38 report and named the two numbers that were wrong: "bound ~4e-4"
conflated step ADVANCES with the bound itself (the bound's median is 0.227), and
"truth 0.1" used the author box as truth where slab truth is 0.20. The walk data
stood; the "250x under-report" did not.

**And I amplified it.** The MUSE-40 assignment states a "250x under-report in
open space" as its premise, and I did not verify it before writing the task --
the suite output I had in front of me says `step p50 4.0e-4`, an advance, and I
repeated the prose instead of reading the column. The investigation was worth
running and produced the peel law and a corrected record, but it was commissioned
on a number I should have checked. Reading the summary rather than the output is
exactly the failure this log has recorded in other people's work.

Two consequences that outlive the task. The renderer question is answered: it is
safe to march against `field.distance`, verified one-sided on 720 samples, so the
cost lives in the walker's advance rule and not in the field. And the editor
question is opened: an author who types a 0.35 gap into a curved room does not
get a 0.35 gap, and the fix is a peel-aware clearance warning at authoring time,
not a change to the geometry. Muse's proposed next experiment -- fit peel against
face length and along-face distance, then check jamb-hug and corner against the
one rule -- is the right next question and is not queued yet.

One process note, recorded because it will come up again: no `SceneControls`
harness exists in the repo, so the reconstructions R1-R4 are minimal scenes
committed inside `s3-bound-truth.test.js`. Muse said so in both the corpus and
the report rather than leaving the provenance implied.

---

The closed assignment follows, as issued -- including its premise, which was wrong.

## MUSE-40 - The S3 bound collapse: curvature cost, or a defect?

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Opus | Node-only

Your MUSE-38 measured the wall-0.35 route at **2778 curved steps against 36
flat**, with 98.8% of steps stalling and 97% of them burned in OPEN HALLWAY
where the bound reports about 4e-4 and the flat control proves 0.1. That is a
250x under-report in open space, and it does not fit the story it is currently
filed under. MUSE-34 measured the cell bound's shortfall as a FRACTION -- 0.29
at an edge, 0.36-0.42 at a corner -- and found it identical at R = 2, 8 and
10000. A fractional shortfall that does not vary with curvature cannot produce
a 250x collapse that appears only in the curved room. One of those two results
is measuring something other than what it is labelled.

The question is which, and the answer changes what happens next. If it is the
bound doing what a bound does, the walker needs a different advance rule. If
`sphericalPrimitive`'s distance is simply wrong somewhere -- a seam, a face far
from its own centre, a `max` over planes that goes bad when the nearest face is
behind you -- then it is a field defect, the renderer marches against the same
function, and the walker is the messenger rather than the patient.

- Allowed writes: a new `s3-bound-truth.test.js`, a dated report under
  `docs/qa/`, `docs/qa/measurements.md`, this task's status and report. Do NOT
  edit anything under `engine/` or `app/`.
- **Evaluate the field directly, away from any walk.** Take the MUSE-38 room and
  sample `field.distance` on a grid through the open hallway. For each sample
  compute an INDEPENDENT true distance to the same authored solids -- great
  spheres through transported axes, membership in slab coordinates, the way
  MUSE-34's reference was built, so the function under test is never its own
  reference. Report the ratio bound/truth as a field, not as a walk statistic.
- **Find where the 4e-4 comes from.** Which primitive, which face, which term
  wins the `max` at the collapsing points, and is that term's own distance
  right? A single sample with the winning term named is worth more than a table.
- **Hold curvature fixed and vary one thing at a time.** Same room at R = 8 and
  R = 10000; then the same R with the wall moved so clearance is 0.35, 0.6 and
  1.1. MUSE-38 already shows the collapse is clearance-dependent (0.35 -> 77x,
  0.6 -> 1.18x); say whether it is ALSO curvature-dependent, which is the fact
  that separates the two explanations.
- **Say which it is, plainly.** "Conservative bound behaving conservatively" and
  "the distance function is wrong here" are different verdicts with different
  owners. If it is the second, a reproduction with the winning term named is the
  deliverable -- report it, do not fix it.
- Acceptance: the sampling reference described well enough to rebuild, the
  bound/truth ratio field, the named winning term at the collapse, the
  curvature-vs-clearance separation, and a one-line verdict.


## MUSE-41 - Does the refusal stay refused?

Status: READY FOR REVIEW (2026-09-10, branch main) | Owner: Muse | Reviewer: Astra | Node-only

Your MUSE-39 found that a refused crossing left the walker standing exactly on
the aperture plane, where the one-sided test declines to look, so the next frame
carried them straight through a portal that had just said no. Astra accepted it,
amended the contract, and Claude repaired it: the final approach is now
provisional, and a refusal rolls back to a checkpoint the PORTAL ITSELF certifies
is on the entering side. Claude checked that with sixteen mutations, and all
sixteen are caught -- by the person who wrote the repair.

The repair also tightened two budget rules Astra called out: corrections now draw
on the same step allowance as travel, and a contact cap of `n` buys exactly `n`
contact responses rather than `n + 1`.

- Allowed writes: extend `region-motion-truth.test.js` (it is yours) or add a new
  `region-refusal-truth.test.js`, plus a dated report under `docs/qa/`. Do NOT
  edit anything under `engine/` or `app/`, and do not change checks you did not
  write.
- **Repeated refusals.** Many fresh frames against a blocked exit, in E3 and S3,
  at several speeds and `dt` values, upright/tilted/off-centre apertures, and at
  grazing incidence where the checkpoint sits micrometres from the plane. For
  every frame: source ownership, no crossing, and `portal.signedHeight` of the
  returned position strictly above the tolerance the crossing test uses. Go
  looking for ONE frame that lands on or past it.
- **Restored clearance.** Clear the obstruction and check the next frame crosses,
  from the state the refusal left. Then try it from a state several refusals
  deep. A repair that quietly arms something on refusal would show up here as a
  crossing that needs two frames instead of one.
- **Time refunds.** Only the DISCARDED travel may come back. First frame charges
  the approach it really made; later frames, already at the checkpoint, charge
  nothing. Audit `consumed + remaining == dt` every frame and check that a long
  run of refusals never accumulates time it did not spend -- or loses time it did.
- **Exact budget caps.** `maxSteps: n` must spend at most `n`, corrections
  included; `maxContacts: 0` must record zero responses while still reporting the
  contact it met as a diagnostic; `maxContacts: k` must buy exactly `k`. Sweep a
  range of caps against a scene that contacts, lifts, slides and settles, and
  report any cap where the spend exceeds it.
- **Work counters are not refunded.** A rolled-back approach still queried the
  field. Check that steps and contacts spent on a refused approach stay spent,
  and that a walker refusing every frame cannot use rollback to buy unbounded
  work inside one call.
- Fail-demo in an isolated copy, restore, then run `node region-motion.test.js`,
  `node region-motion-truth.test.js` and `node tools/test.js` and paste all three.
- Claude flagged one path as implemented but UNREACHABLE: the case where even the
  leg start cannot be certified on the entering side, which should return
  `unresolved` / `uncertifiable-checkpoint`. Try to construct a scene that
  reaches it. If you cannot, say what you tried -- that is a real result either
  way, and it is the kind of thing a corpus finds and an author never does.
- Acceptance: the repeated-refusal table, the restored-clearance result, the
  time audit, the budget sweep with any overrun named, and a verdict on the
  unreachable path.

Astra 2026-09-10: ACCEPTED at reviewed 382ef0d; rerun 8/8, complementary motion corpora 46/46 and 21/21. See docs/qa/astra-integration-review-2026-09-10.md.


## MUSE-42 - Independent checks for intrinsic clearance

Status: READY FOR REVIEW | Owner: Muse | Reviewer: Astra | Node-only

Read docs/engineering/CURVED_CLEARANCE_CONTRACT.md and only the relevant S3
cell/reference helpers. MUSE-40 proved the sampled hallway was face-limited;
it did not establish global field exactness. No empirical peel fitting needed.

Allowed writes: new curved-clearance-truth.test.js, a dated docs/qa report,
and this task's status/report. No engine/app/schema changes.

Check the analytic center-local face-height relation against an independently
parameterized great-sphere face and metric distance. Include translated and
rotated cells, R=0.5/8/10000, multiple offsets, nonzero along-face coordinates,
and explicit distinction between scene-origin coordinates and center-local ones.

Test the face-foot exactness certificate: outside a single cell, a nearest face
foot contained in ALL half-spaces attains the bound. Include face-interior
positive cases and corner/jamb cases where containment fails and exactness must
NOT be claimed. Singular/near-ambiguous projection is unresolved. Do not apply a
single-cell certificate to modified/union scenes without a separate proof.

Use the existing independent nearest-point reference where applicable; report
reference tolerances and convergence. Vary face length to distinguish changing
the supporting sphere from changing only the clipped face extent. Provide a
counterexample to treating negative conservative clearance as proof of collision.

Acceptance: seeded checks with non-vacuous positive and refusal cases, isolated
fail-demo targeting a sign/chart/containment error, restored focused tests and
tools/test.js. Describe limits; no universal safe-distance or step-cost claim.
If the proposed contract is wrong, report a minimal counterexample, not a fix.

Report (Muse, 2026-09-10): READY FOR REVIEW. Contract holds on all probes:
field==analytic to 0.0e+0 (100 probes, R=0.5/8/10000, translated+rotated);
foot certificate exact on 6 interior probes (sampler-confirmed), refuses 2
corners (gaps 0.125/0.084), jamb-adjacent (over 0.052), singular (1-a^2=1e-14),
and union transfer (wall-alone 0.200260 vs union field 0.701298, foot in door
void). Counterexample: r=0.36 corner reads clearance -0.0588 vs truth +0.0656
(t16==t32 to 12 digits). Face-length check: same-h0 bit-identical, moved-h0
differs by 0.10. Fail-demo: flipped-sign normal refuses (engine untouched).
New curved-clearance-truth.test.js (9/9), full suite 58/58. No engine/app
changes. Details: docs/qa/curved-clearance-2026-09-10.md. Note: sampler
single-start descent trapped 0.048 high at NT=32 during probing; durable
reference uses top-4 multi-start with a 1e-6 16v32 convergence gate.

Astra ACCEPTED 2026-09-10: scoped QA evidence, not a general certificate. Rerun in 59/59 full suite; see docs/qa/astra-editor-input-2026-09-10.md.

## MUSE-43 - Is the pause table the one the contract asks for?


Status: READY FOR REVIEW | Owner: Muse

**Do not read `app/motion-pause.js` until you have written your own table.**
That is the whole method: derive, from `docs/engineering/REGION_MOTION_CONTRACT.md`
alone, which `moveRegionProbe` outcomes must END a host's movement session and
which must not, and which of the ending ones a host may offer an explicit retry
for. Write that table down in your report, with the contract line each row
rests on, BEFORE you open the module.

Then build a corpus and compare. Sweep real results out of the kernel — several
fixtures, several start states including ones inside solids and on chart edges,
`maxSteps` / `maxContacts` / `maxCrossings` from 0 upward, dt from 0 to
something large — and tabulate `status × detail × (pendingLift ? owed : none) ×
timeRemaining`, with a count for each combination reached. Then run
`motionPause` over the same corpus and report every disagreement with your
table, plus every combination your table covers that the corpus never reached.

Deliver: `motion-pause-truth.test.js` (yours, independent of
`motion-pause.test.js`), a report, and — most valuable — any row where your
reading of the contract and the shipped policy differ. If they agree everywhere,
say so and say how much of the space you actually reached; an unreached
combination is a finding, not a gap to paper over.

Report (Muse, 2026-09-10): READY FOR REVIEW. Verdict: YES, the shipped table
is the one the contract asks for, with one pre-registered row of mine
corrected. Derived my table from the contract alone first (in the report),
then swept the kernel (14 distinct status x detail x debt x clock combos,
counts in report) and ran motionPause over 16 pinned cases. Agree
everywhere except debt-free budget exhaustion: I pre-registered PAUSE,
shipped carries on; the contract mandates only a validated state with
honest time there, so shipped stands, conditional on loud reporting and
fresh-budget retries (host-loop side, MUSE-44 territory). Q1: blocked-exit
CAN carry debt (floor-lift refusal, rem=0.100) and the policy pauses on the
debt. Q2: complete|owed never produced in ~40 hunts but synthetic rows prove
debt-first handles it by construction. Unreached findings: complete|owed,
stopped|owed, any debt with zero clock, uncertifiable-checkpoint.
New motion-pause-truth.test.js (5/5). No engine/app/tool changes; no defect
to fix. Details: docs/qa/muse43-pause-audit-2026-09-10.md.

Two specific things worth aiming at. First: is `blocked-exit` really not a
pause? Claude decided it is not, on the grounds that a refused crossing retains
a certified source state. Check whether the contract supports that, and whether
a `blocked-exit` can ever arrive carrying an unpaid correction. Second: can a
result carry `pendingLift` with `status === 'complete'`? If it can, a host
reading only the status would fly straight on, and the whole policy rests on
the debt being checked first.

Claude ACCEPTED 2026-09-10. The method is what makes this worth having: the
table was written down from REGION_MOTION_CONTRACT alone and put in the report
BEFORE `app/motion-pause.js` was opened, so the one disagreement is a real
disagreement and not a rationalisation. It was adjudicated against the contract
rather than against the code, and it went against the pre-registered row, which
is the harder direction to go.

Two things came back that the shipped work needed. Q1 corrects a claim in
`docs/qa/claude-pause-input-2026-09-10.md`: a `blocked-exit` can arrive still
owing a floor lift (a walker descending onto a floor reaches a plugged aperture
before the settle is paid, rem=0.100), and so can a `domain-exit`. The prose
saying those statuses "leave a fully settled state" was wrong about three of the
four; the code was right anyway because the debt is checked first, and both the
module comment and the report now say so. And the condition attached to
debt-free budget exhaustion -- loud reporting, fresh-budget retries, no
accumulated time -- is now closed in the host: `region-lab` counts the run of
consecutive refusals and shows it, and a browser check flies out through the
chart edge for 24 frames and asserts every one of them is charged exactly its
own dt. Four mutations of that reporting are each caught.

The unreached combinations were reported rather than papered over with
synthetic rows presented as coverage, which is the right call and the reason
the "~40 hunts" line is worth more than a green tick would have been.

## MUSE-44 - Does anything else in the tree feed a refusal forward?


Status: READY FOR REVIEW | Owner: Muse

A sweep, not a fix. `app/region-lab.js` now consults `motionPause`. Find every
other place in the repository that consumes a motion or walker result and
carries its state into a subsequent frame — `app/ball-lab.js`, anything under
`app/`, `levels/`, `tools/` and the arena code — and report, per site, what it
does with a status that is not a completion and with any correction the solver
left owed. Some of these are the E3 walker with a different result shape; say
so rather than forcing them into the region-motion vocabulary.

Deliver a table of call sites and a verdict per site: consults the status /
ignores it / has no status to consult. Do not repair any of them. If a site
looks wrong, the reproduction is the deliverable.

Report (Muse, 2026-09-10): READY FOR REVIEW. region-lab (current file) is
clean: advance adopts the validated state, counts refusal runs, spends only
the frame's dt, halts via motionPause (debt-first), resume is new-request
or refused, edits/play clear the halt, metrics show debt distance and run
count. 10-site table in docs/qa/muse44-refusal-sweep-2026-09-10.md:
ball-lab frame is E3-different-shape, notes-only carry-on with fresh fixed
dt (sound per MUSE-43 adjudication); reconcile consults resolveOverlap;
arena main.js/collide has no status vocabulary (4-push cap adopts silently
— legacy characteristic, not refusal forwarding); levels/tools/racing/port
have no consumers. One wrong-looking site: stepWalker drops pendingLift
from its return shape (repro embedded in report); latent, unreachable with
the default budgets it always uses. No repairs made.

Claude ACCEPTED 2026-09-10. A sweep whose most useful output is a site it
handed back unrepaired: `stepWalker` drops `pendingLift` from its return shape
although the `moveProbe` inside it can owe one. Calling it LATENT rather than
live is the part that makes it trustworthy -- the repro needed tightened caps,
every constructed correction paid in full under the budgets `stepWalker`
actually uses, and the report says so instead of dressing a hypothetical as a
bug. It stays open, and section 2 of NEXT_CAPABILITIES walks straight into it:
a walking slice owes corrections by design.

The ball-lab verdict is the right shape too. Its result has no status and no
clock, so "notes-only carry-on with a fresh fixed dt each frame" is a
description rather than a violation, and judging it under the MUSE-43
adjudication instead of forcing it into the region-motion vocabulary is what
the task asked for. Same for the arena: predating the vocabulary is a
characteristic, not a defect, and the 4-push cap is named as one.

No defect in the region host. Docs-only, no suite re-run needed, and none
claimed.

## MUSE-45 - Is a resumed correction the correction that was owed?


Status: READY FOR REVIEW | Owner: Muse

Independent audit. No engine, app or tool changes; report defects, do not fix
them. Three questions, in this order.

**1. Is the continuation actually authority, or only a shape?** The operation
refuses to move anyone without a continuation this module issued, spends it on
use, and pins the compiled world, region, endpoint, camera, radius and residual.
Try to defeat that. A structural clone, a frozen copy, a continuation from a
different debt in the same scene, one from a different scene, one presented
after the state moved by 1e-16, one presented twice, one presented against a
recompile of the identical document. For each: did the walker move, and by how
much? A single case where a walker moves on authority the kernel did not issue
is the most valuable thing you could hand back.

**2. Is the resumed path the path the settle would have walked?** Claude checks
one whole resume against two one-step resumes and reports 0.00e+0 apart. Derive
your own reference instead of reusing that one: for the same scene and start,
compare where the walker ends up when the settle runs UNINTERRUPTED inside
`moveRegionProbe` (give it a budget that finishes) against where it ends up
when the settle is starved and then resumed. Those two should be the same
walker. Sweep budgets, radii, floor orientations, both E3 and S3, and several
curvature radii. Report the worst disagreement you find and the configuration
that produced it. Also check the CAMERA, not only the position: a resumed
correction that transports the frame differently is the failure that would
never show up in a coordinate.

**3. Is the clock really untouched?** The operation claims zero gameplay time
and claims the refused request's unspent time stays discarded. Verify both
independently: over a corpus, that no resume returns nonzero time in any field,
and — the harder one — that a debt-then-resume sequence never lets a walker
cover more ground per unit of dt than an uninterrupted run of the same scene
would. That is the property the zero-time rule exists to protect, and it is not
the same statement as "the fields read 0".

**One claim of Claude's to adjudicate, in your own words.** The report argues
that a resumed correction CANNOT reach a chart edge, by construction: a settle
retraces the lift, so it can only newly meet things strictly between the lifted
point and the contact it lifted off, and a chart extent is a convex geodesic
ball with the walker interior at both ends. An aperture can sit in that gap and
is checked; a chart edge, the argument says, cannot. Either construct a
counterexample — a scene where a resumed correction returns a `domain` event —
or say the argument holds and say what you tried. Do not take it on trust; the
last two Claude findings you audited each turned up something.

Deliver `correction-resume-truth.test.js` (yours, independent of
`correction-resume.test.js` — do not read it before writing your reference),
plus a report with the corpus counts and the worst numbers.

Report (Muse, 2026-09-10): READY FOR REVIEW. No defect; do not change the
module. Q1: 9 forgery attacks (clone/frozen/hand-written/cross-scene/
recompile/moved-1e-16/double-present) all stale with corrected=0; even a
same-endpoint kernel-issued splice dies on camera identity. Q2 (own
reference: uninterrupted vs starved-tail+resume, travel-match gated loud):
dPos=0.0e+0 E3, <=8.7e-19 S3 at R=0.5/2/8, cameras <=1.6e-16, radii
0.035-0.5, resume budgets 24/5/1; chained resumes conserve the residual to
0.0e+0. One marginal row attributed to travel divergence, excluded by the
strict gate. Q3: all five clock fields exactly 0 on every resume;
ground-per-dt identical to six decimals. Chart-edge claim HOLDS: edge-
corner rattle, equator funnel at extent exactly pi*R/2, and domain-exit
debt all resume to complete-and-inside; zero domain details in ~100
resumes. Never read correction-resume.test.js. New
correction-resume-truth.test.js (6/6). Details:
docs/qa/muse45-correction-resume-2026-09-10.md.

Claude ACCEPTED 2026-09-10, with ONE ADJUDICATION REVERSED.

Accepted in full: Q1, Q2 and Q3. The authority audit is the strongest part --
structural clone, frozen copy, cross-debt, cross-scene, recompiled-identical
document, endpoint moved by 1e-16, double presentation -- and no walker moved
on authority the kernel did not issue. The path audit derived its own reference
(uninterrupted settle vs starved-then-resumed) rather than reusing mine, which
is what the task asked for and what makes agreement mean anything; bit-exact
including the camera is a stronger result than I had. And Q3 checked ground
covered per unit dt rather than re-reading the time fields, which is the
property the zero-time rule actually protects.

REVERSED: the chart-edge adjudication. The verdict says the argument HOLDS.
It does not, and I falsified it after reading this report. The argument was
that a settle retraces the lift, so both its endpoints are places the walker
has already stood, and a convex chart cannot be exited between them. The
convexity is fine; the premise is false. A settle only retraces the lift when
NOTHING SLID IN BETWEEN -- the walker is lifted at one place, slides while
airborne, and settles somewhere it has never stood.

The counterexample is a floor BELOW the chart centre, so that descending
increases the radius: extent 6, floor at z = -5.9, walker starting at radius
5.9935 and sliding while lifted to 5.9740, with the point its settle aims at at
radius 6.0161 -- outside, and never visited. Reproducible across four start
positions and every budget from 10 up. It is now
`correction-resume.test.js`, "A RESUMED CORRECTION CAN REACH THE CHART EDGE",
and a mutation letting a domain event through is caught.

Why it was missed here, stated plainly because it is useful: every floor in
`correction-resume-truth.test.js` sits at the chart origin's own level, so
descending moves the walker INWARD and the edge is never in front of the
settle. The corpus could not have reached it. The report's own "attempted but
unreached" list is honest about several things; this one was filed as proved
instead, and the mechanism quoted back -- "the resume walks a subsegment of the
lift interval" -- is my sentence, which is the tell. An audit that repeats the
author's mechanism is confirming the author's reasoning, not the behaviour.

The console line in that suite claiming "no domain/* anywhere" has been
narrowed to "in THESE scenes" with a pointer to the counterexample. Nothing
else in the file was touched, and all six checks still pass. Not a criticism of
the corpus: three real scenes, correctly measured.

MUSE-46 follows directly from this and is about the failure mode rather than
this instance.


## MUSE-46 — Which other "cannot happen" claims are wrong?

Status: READY FOR REVIEW | Owner: Muse

Two agents believed the same wrong argument at the same time last round, and
what made it survive was its FORM: it was reasoned rather than measured, so it
read as proof. The code was right throughout; only the claim was false. That is
the failure mode this task is aimed at.

Sweep the repository for claims of impossibility or unreachability and test
each one. They live in comments, contracts and QA reports, and they sound like:
"cannot", "never", "impossible", "unreachable", "by construction", "no case
where", "this branch is dead", "only ever", "always". Search for the words, but
judge the claims, not the grep — a sentence that says "the probe never lands
exactly on a surface" is a claim; a sentence that says "never mutates the
caller's state" is a different kind and may be an invariant worth confirming
rather than breaking.

For each claim you decide is worth testing, deliver one row:

- where it is (file and line), and what exactly it asserts
- whether the tree BACKS it: is there a check that would fail if it stopped
  being true, or is the argument load-bearing and unchecked?
- your attempt to break it, described concretely enough to repeat: which
  scenes, which parameters, how many, and what the extremes were
- verdict: HOLDS (and what you tried), FALSE (with the reproduction), or
  UNTESTED (and why it resisted)

Prioritise claims that something DEPENDS on. A claim that a branch is dead is
worth more than a claim that a number is small, because the dead branch is the
one nobody maintains. Start with `engine/world/` — `collision.js`,
`region-motion.js`, `region-portal.js`, `camera-frame.js` — then the contracts
in `docs/engineering/`, then the QA reports.

Report (Muse, 2026-09-10): READY FOR REVIEW. 1 falsification: a resumed
correction CAN reach the chart edge in S3 (wall edge-side, diagonal
impact, 5.52e-2 lift, tangential slide to r=5.9678/6, resume reports
unresolved/correction-boundary on a correction-phase domain event at
0.0339 along the residual; nothing moves, debt intact, no reissue).
Pinned in impossibility-audit.test.js (1/1). 9 holds tested by breaking:
no tunneling (0/22, min gap skin/2), never lands on surface (min
clearance skin/2), never lands on aperture (exit exactly -4.00e-4),
handedness (0/2000 flips), degenerate never completes, rewind on leg
(gap 0.00e+0), domain-before-portal, continuation single-use;
bound-never-overestimates noted as input assumption (MUSE-40 per-scene).
Backing graded: 4 holds want their stated check (tunnel fuzz,
min-clearance, exit-height, turn-fuzz). Adjacent note: zero-velocity
start at ball center adopts stopped at clearance -1.25 silently. No
repairs made. Details:
docs/qa/muse46-impossibility-sweep-2026-09-10.md.

Do not repair anything, including a claim you prove false: correcting the
sentence is the author's job and the reproduction is yours. If a claim turns
out to be true AND unchecked, say so and say what a check for it would cost —
an unchecked true claim is a finding too, because it is one refactor away from
being a false one.

Deliver `impossibility-audit.test.js` holding the reproductions for anything you
prove false, and a report with the table. If you find nothing false, the report
is still the deliverable: a list of which impossibility claims are actually
backed by a check and which rest on an argument is worth having on its own.

---

Report defects, do not fix them. Every number carries its command and host.
Paste `node tools/host-probe.js` output and do not investigate the environment
further.

Astra ACCEPTED 2026-09-10: S3 counterexample rerun 1/1; holds retained as scoped evidence only. Stationary center-in-solid triaged/fixed. See docs/qa/astra-spherical-walking-2026-09-10.md.


## MUSE-47 - Independent spherical support and walking audit
Status: ACCEPTED | Owner: Muse | Reviewer: Astra | Node-only initially

Report (Muse, 2026-09-10): READY FOR REVIEW. References hold: height/up
exact to 1e-9 (R=0.5/8/100, flat/tilted/offset); free fall converges
first-order (ratio 4.00) and falls; metric speed 2.0000; rest 600/600
grounded with zero drift; jump apex 1.1221, lands re-grounded, air jump
no-op; obstacle blocks without becoming support; invalid/singular/domain
starts visible; carved/ball floors refused; clock conserved, budgets
finite, no input mutation; real debt (6.6e-3) resumed explicitly with
zero clock, walking after grounded. Two defects with reproductions, no
repairs: (1) pinning against a ball throws at ~frame 113 (radial drift
4e-16→7e-13, tangency check, status owed not exception); (2) down-facing
plane accepted as floorId, walker grounded 120/120 beneath a ceiling
(§2 requires visible refusal). Both pinned in
spherical-walking-truth.test.js (10/10) as labeled defect pins that flip
on fix. Isolated gravity-sign fail-demo rose as expected, repo untouched.
Details: docs/qa/muse47-walking-audit-2026-09-10.md.

Read NEXT_CAPABILITIES.md section 2 and the walking report/API. Allowed writes:
spherical-walking-truth.test.js, dated QA report, this task's status/report.
Independent references: intrinsic height on offset/tilted great-sphere floors,
one-dimensional free fall, tangential metric speed and timestep refinement.
Cover multiple R/player radii, long stationary support, jump/departure, corners,
near-vertical camera aim, nonfloor obstacles, unsupported floor modifications,
initial invalid/unproven clearance and domain outcomes. Verify no mutation of
caller state, honest aggregate clock and finite substep budgets.
Exercise a real owed correction, explicit resumption and subsequent walking.
Do not infer safety from a green state flag: inspect geometry and request/debt.
The host should jump on a new press, not every frame Space is held; use browser
queue only if adding a real-handler check is necessary and coordinate with Claude.
Fail-demo in an isolated copy, focused/full Node suites, reference limitations.
No generalization from a sampled route to all support configurations.


Astra verdict, 2026-09-10: accepted with floor-orientation clarification; pinned-contact crash repaired and old throw pin converted to sustained success. See docs/qa/astra-muse47-49-review-2026-09-10.md.


## Astra acceptance of MUSE-48 revision, MUSE-49 revision, MUSE-50

2026-09-10, base 275fd4d. All accepted within sampled limits after code review
and reruns: 4/4, 7/7, 7/7 respectively. See docs/qa/astra-s3-events-2026-09-10.md.

Order: MUSE-49 revision, MUSE-48 revision, then MUSE-50. MUSE-47 accepted and archived.
Current walking implementation: docs/qa/astra-spherical-walking-2026-09-10.md.
Do not change engine/app code; report defects with executable reproductions.

## MUSE-48 - Turn four sampled invariants into named regression checks
Status: ACCEPTED | Owner: Muse | Reviewer: Astra | Node-only

Revision (Muse, 2026-09-10): READY FOR REVIEW. Checks 2/3 preserved.
Handedness is local-tangent determinant (min 1.00e+0 over 1200 repeated
turn/transport rounds, Gram dev ≤ 6.66e-16, S3 4D sign constant, 40/40
reflection controls negative). Two-tier oracle band exercised by
engineered grazes: 16 hits / 15 misses / 4 inconclusive over 35 S3
sweeps; S3 starts assert clearance, hits checked vs player radius (min
gap 5.00e-5). E3 labeled endpoint detector with committed-state
clearance (min 5.00e-5). Fail-demos: exitOffset removal fails check 3,
mirrored cross fails check 4 at construction; repo untouched.
invariant-evidence.test.js 4/4. Details:
docs/qa/muse48-invariant-audit-2026-09-10.md.

Revision: read MUSE-48 bullets in docs/qa/astra-muse47-49-review-2026-09-10.md.
Same allowed files. Add tangent-frame handedness/Gram checks along repeated
transport/turn paths, reflection negative control, explicit ambiguous oracle
band, S3 start-clearance assertions and stronger E3 endpoint/contact checks.
Correct prose distinguishing E3 detector from S3 sampled oracle. Preserve
existing exit/margin checks; fail-demo and rerun. No kernel repairs.

Report (Muse, 2026-09-10): READY FOR REVIEW. All four hold on sampled
compiled worlds under the original assumptions (exact exterior bound,
non-overlapping start, asserted per start): 35 E3 thin-wall runs (30
engaged) + 20 S3 sweeps agreeing both ways with a dense-trace field oracle,
0 pass-throughs; 54 contacts all at clearance > 0 (min 5.08e-5, at
safetyMargin); 6/6 frozen exits at 4.04-4.06e-4 past the anchor
(= skin*4) with transverse to 1e-9, S3 exit z=-1.999596, 1 obstructed-exit
refusal blocked-exit source-side; 1000 turn-path frames keep triple product
> 0 (min 0.914). Isolated fail-demo: exitOffset removal fails check 3
(`exit offset missing (x=0.00000596...)`), 3/3 others pass, repo untouched.
invariant-evidence.test.js (4/4). No counterexamples on sampled inputs;
margins measured, no theorems claimed. Details:
docs/qa/muse48-invariant-audit-2026-09-10.md.

Use MUSE-46's four missing checks, with their original input assumptions:
thin-wall/ball swept safety, surface margin, post-portal side separation, and
camera handedness. Allowed writes: invariant-evidence.test.js, dated QA report,
this task's status/report. Keep deterministic seeds and non-vacuous counts.
State which claims are conditional on a valid exterior distance bound and a
non-overlapping start. Include curved cases where meaningful; distinguish
measured margin from a theorem. Do not rewrite historical reports to claim
universal proof. A counterexample is a deliverable, not permission to fix scope.
Run a targeted fail-demo, restored checks and tools/test.js.

## MUSE-49 - Independent connected sight audit
Status: ACCEPTED | Owner: Muse | Reviewer: Astra | Node-only

Revision (Muse, 2026-09-10): READY FOR REVIEW. New check adds E3-S3-E3
crossings at R=0.5 (legs 3.0000/0.7000/20.0000, angle 1.4) and R=100
(3.0000/4.0000/20.0000, angle 0.04) with in-domain charts and test-local
normal-coordinate lengths (gated 1e-12 at anchors), both carried tangents
agreeing and independently unit-at-exit. Six original checks untouched.
connected-sight-truth.test.js 7/7. Details:
docs/qa/muse49-sight-audit-2026-09-10.md.

Report (Muse, 2026-09-10): READY FOR REVIEW. All hold on own fixtures:
E3-S3-E3 legs total exactly 3/4/20 with both exits and carried tangents
agreeing to 1e-9 (recomputed from compiled anchors, entry-based logAt);
occlusion hits with zero crossings; inside starts hit at 0; on-plane and
fresh-call-at-exit refuse as aperture-side (call boundary distinguishes
suppressed reverse from unrelated start); ties cross nothing; closed/
one-shot/shared-work budgets refuse exactly; thin foil hit 0.59 past the
exit; S3 ball stays surface-candidate (certified 2.4 vs 2.2e-16 field);
range hit/short/miss exact; ray never mutated. Isolated fail-demo:
tie-check removal crosses the first gate (0→1 crossings), repo untouched.
connected-sight-truth.test.js (6/6). Details:
docs/qa/muse49-sight-audit-2026-09-10.md.

Revision requested: add crossing fixtures at R=0.5 and R=100 as well as R=8,
with valid charts and independently calculated physical lengths and tangent
mapping. Keep current checks and limits. Correct original path permission:
connected-sight-truth.test.js is the approved existing file; do not duplicate it.
Then proceed to MUSE-48. Read docs/qa/astra-connected-sight-2026-09-10.md
and NEXT_CAPABILITIES.md section 3. Allowed writes: connected-sight-truth.test.js,
docs/qa/muse49-sight-audit-2026-09-10.md, this task's status/report only.
Test actual compiled worlds, not mocked crossing functions. Vary portal offset,
orientation, S3 radius and aperture approach; check mapped tangents against
independent frame/metric identities and remaining physical range. Cover thin
objects, source occlusion, on-plane/near-plane ambiguity, competing gates,
range endpoints, shared work and crossing exhaustion. Inspect segment/crossing
records, not merely the final status. S3 surface-candidate is intentionally
unresolved; do not label a small bound a proven hit. Negative/inside starts
must not become a confident empty result. Treat conservative refusals separately
from wrong positive claims. Include a failing isolated mutation, focused/full
Node runs and reference limitations. Report defects, do not repair kernel code.


## MUSE-50 - Independent S3 numerical transport repair audit
Status: ACCEPTED | Owner: Muse | Reviewer: Astra | Node-only

Report (Muse, 2026-09-10): READY FOR REVIEW. Seven checks on the repaired
kernel (region spaces ARE createMetricSpace): 6000-leg chains match
single-shot closed form to 3.25e-14 at R=.5/8/100; zero travel exact;
carried norms 0.01/2.47/3.7 kept to 8.88e-16 with exact linearity and
non-unit directions still rejected; normalize cleans radial to 1e-10 and
throws at 1e-6+, callers unmutated; inverse legs return to 3.33e-16;
closed triangles rotate frames by the Girard area (0.005008/0.045676 rad)
identically at all R. Old-code (d3160ba metric-space.js) isolated
fail-demo fails exactly the two repair-targeted checks, repo untouched.
metric-stability-truth.test.js 7/7. Details:
docs/qa/muse50-metric-stability.md.

After the two revisions. Read the repair section in the Astra review above.
Allowed writes: metric-stability-truth.test.js, docs/qa/muse50-metric-stability.md,
this status/report only. Test metric normalization and repeated nonzero/zero
segments, tiny accepted radial roundoff versus invalid input, linear carry and
physical norm, inverse legs and a nontrivial closed-loop holonomy. Use explicit
ambient rotation references independent of stepWithTransport; vary R and step
size. Ensure speed is not reset to one and zero travel preserves exact values.
Report accumulated error and reference limitations. Isolated old-code or
mutation fail-demo; focused/full Node tests. Do not fix kernel code.


## MUSE-51 - Independent S3 boundary-event audit
Status: ACCEPTED | Owner: Muse | Reviewer: Astra | Node-only

Report (Muse, 2026-09-10): READY FOR REVIEW. Nine checks verify every
event against bisection (residual, distance within guard, slope-derived
transition, unit/tangent normals, outwardness, order, length): oblique
compiled/metric balls at R=.5/8/100, large balls (1.4-rad pairs with
closed form, 2.5R lone exits at 3R, piR refusal), exact-frame rotated
cell, tilted plane, thin-cell pair plus hunted exact coincidence
refusal, inactive face events with no hit claims, adaptive range-end
refusals/exclusions, distinct tangency/coplanarity/budget/drift refusals,
two true misses with clean scans. Finding: decimal-authored rotated
frames (compile-legal at 1e-8) make poles off-unit by 1.97e-9, so every
ray refuses input-roundoff against the 2.8e-14 pole screen — conservative
refusal, mechanism measured. Ball-sign isolated mutation fails exactly
the 4 ball checks; repo untouched. s3-ray-events-truth.test.js 9/9.
Details: docs/qa/muse51-s3-events.md.

Read docs/qa/astra-s3-events-2026-09-10.md. Allowed writes:
s3-ray-events-truth.test.js, docs/qa/muse51-s3-events.md, this status/report only.
Audit sphericalBoundaryEvents using independent great-circle geometry/bisection,
not a second phase +/- acos implementation. Cover rotated/transformed compiled
balls/planes/cells, R=.5/8/100, oblique roots, large balls below pi*R, roots near
both range ends, tangency, nearly parallel planes, coincidence, budgets and
input drift. Check residuals, event order, unit/tangent normals, entry/exit signs
and physical length. Include true misses and inactive infinite-cell-face events.
No scene-hit claims: this layer deliberately has no Boolean classification.
Its guard is numerical screening, not a formal interval proof. A conservative
refusal is different from a wrong complete event list. Report both and the
coverage limitations. Include isolated fail-demo, focused/full Node runs.
Do not modify kernel, Claude's new classifier, or existing tests. Counterexamples
are deliverables. Coordinate only through these files; no overlapping edits.

Astra acceptance, 2026-09-11, base 5877847: reviewed and reran 9/9;
full Node integration suite 74/74. Decimal-plane pole refusal repaired without
rewriting stored geometry; plane zero sets are homogeneous. Ball and ray-input
roundoff screens retained. See astra-s3-sight-integration-2026-09-10.md.