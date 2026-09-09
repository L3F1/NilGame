# Overnight results — MUSE-02 through MUSE-05

## Lead correction and review — 2026-09-09

Astra subsequently reproduced Windows exit 21 as PROFILE_IN_USE, found an
old test browser holding the reused profile, and fixed cold/warm profile
ownership in the runner. A fresh profile worked on this same host. The later
antivirus/host-health diagnosis below is historical and is superseded by
[the lead review](astra-review-2026-09-09.md); the repository was not exonerated.
No security settings, installations or blanket process kills were needed.

Astra-executed Windows results: real GPU cold 331 checks, final warm 346;
strengthened Digit9 fail-before confirmed; Node 20/20 suites including 19
lifecycle tests; native ball editor 10 checks. MUSE-02 through MUSE-05 accepted.
MUSE-06 needs POSIX tree cleanup, which is separate from the fixed Windows
profile problem. Muse's WSL socket restriction remains; MUSE-07 needs only Node.
Commands, artifacts and attribution are in the linked review. These are lead
executions, not additional Muse or user runs.

## Baseline environment (recorded before substantive work)

- Branch/hash: `main` at `b9b42e7` (matches MUSE-01 acceptance baseline).
- OS: Linux LeoPC 6.18.33.2-microsoft-standard-WSL2 (WSL2, x86_64).
- Node: `/usr/bin/node`, v22.23.2 (WSL Linux executable).
- Browser/backend from WSL node: none. `google-chrome`,
  `google-chrome-stable`, `chromium`, `chromium-browser` all absent from
  PATH; `tools/preview.js findBrowser()` also checks Windows
  `%ProgramFiles%`/`%LOCALAPPDATA%` paths, which are unset under WSL Linux
  node. Windows-side Chrome exists at
  `C:\Program Files\Google\Chrome\Application\chrome.exe` but is not
  reachable from the WSL Linux node runtime. Software rendering
  (SwiftShader) therefore unavailable here; all browser/GPU-dependent tool
  outcomes below are `"not runnable on this client"`, not failures of the
  tools themselves.
- Pre-existing tree state preserved: staged `M MUSE.md`, `M MUSE_TASKS.md`,
  `M TODO.md`; untracked `.codex/`, `docs/engineering/NEXT_SESSION.md`,
  `docs/qa/`. None reverted, staged, or committed by Muse.

## Baseline checks (real executions)

- `node tools/test.js` → 18/18 suites passed, exit 0 (WSL node v22.23.2).
- `node tools/scene-check.js` → `connected-lab: 2 regions, 6 entities,
  1 portal definitions`; transfer samples passed; portal traversal not
  implemented (expected). Exit 0.

## MUSE-02 — Render-fixture guide

- Deliverable: `docs/qa/render-fixture-guide.md` (new).
- Commands run (WSL node v22.23.2, repo root):
  `node tools/render-fixture.js` → usage list, exit 1;
  `node tools/render-fixture.js nil-horizon /tmp/muse02-probe.png` → exit 2;
  `node tools/render-fixture.js nil-close-column /tmp/muse02-a.png` → exit 2;
  `node tools/render-fixture.js dropper-ceiling /tmp/muse02-b.png` → exit 2.
  All failures: `no Chrome or Edge found; edit findBrowser()`, no PNG
  produced (verified absent). No image to inspect; recorded honestly.
- Outcome: guide written from current sources (contract, runner, preview,
  regressions JSON — all unmodified vs baseline). Reproduction steps,
  output locations, resolution overrides, per-view intent, and
  software-vs-driver limits documented. No shader, coordinate, tolerance
  or tool changes. Status: READY FOR REVIEW.

## MUSE-03 — Player-facing documentation and Fog help

- Changed files: `docs/playground.md` (missing-geometries rewrite,
  thirteen/1–8 shortcuts, preset-preservation + Fog-off sentences, lab/kit
  distinction, `spaces.js`→`engine/geometry/registry.js` and
  `world-motion.js`→`engine/runtime/world-motion.js` link repair);
  `app/menu.js` (Fog `title` hint only, 3 added lines);
  `docs/qa/controls-review.md` (44-unit shaft erratum only).
- Fact re-verification (not copied): `H2R_TOP_Z = 44` (`h2r.js:238`);
  renderer ray range 60 (`main.js:2955-2957`); footer 1–8
  (`app/menu.js:25`); handler ≤13 with Digit9 swallowed on focused
  controls (`main.js:1307-1308,1325-1328`); presets preserve unspecified
  (`main.js:1201-1206`); Fog off = density ×0 (`main.js:2952`).
- Commands: `node --check app/menu.js` → OK; `node --check main.js` → OK
  (syntax only, no behavior change outside the Fog `title`).
  `node tools/page-check.js --worlds` → `no Chrome found;
  edit findBrowser()`, no worlds exercised. Remedy probe: Windows
  `chrome.exe --headless --disable-gpu --dump-dom about:blank` via WSL
  interop → `UtilBindVsockAnyPort:309: socket failed`, no DOM. Two setup
  attempts spent; browser verification (page-check, narrow/desktop menu
  inspection) marked VERIFICATION BLOCKED on this client, errors recorded
  above. No options, preset order, callbacks, focus handling or gameplay
  touched. Status: READY FOR REVIEW (minus blocked browser leg).

## MUSE-04 — Focused menu digit shortcut fix and behavioral regression

- Changed files: `main.js` (1-line guard fix, line 1308:
  `/^Digit[1-8]$/` → `/^Digit[1-9]$/`); `app/menu.js` (footer `1–8` →
  `1–9`); `tools/world-probe.js` (focused-shortcut regression block only).
- Fix rationale: handler already accepted digits ≤13 (`main.js:1325-1328`);
  only the focused-control guard swallowed Digit9. Native arrows/Tab/Enter/
  Space/O/Esc untouched (guard still returns early for all non-digit keys);
  INPUT/TEXTAREA exclusions, menuBusy and network behavior untouched;
  closed-menu kit input untouched (guard is optOpen-gated). No 0/multi-key
  shortcuts added; presets 10–13 still card-only.
- Regression design (unexecuted — no browser on this client): with menu
  open, Digit9 dispatched on the focused card button, the Fog select and
  the settings summary must each select `PRESET_KEYS[8]`; Digit1 control
  selects `PRESET_KEYS[0]`; fog select `change` still applies
  (`rawVal('fog') === 'off'`); KeyW while open moves nothing. Events are
  dispatched on the element (bubbling) so `e.target.tagName` exercises the
  guard; `worlds-button` is an opener (`setMenuOpen(true)`), preset
  selection neither closes the menu nor steals focus — verified in code
  (`main.js:1641-1655`).
- Commands: `node --check` OK on all three files; `node tools/test.js` →
  18/18 pass on fixed code; `node tools/page-check.js --worlds` → blocked
  (`no Chrome found`), so the fail-on-original / pass-on-fixed behavioral
  runs could not execute here. Per task orders the change is left
  UNACCEPTED pending a browser host. Status: VERIFICATION BLOCKED.
- Follow-up if accepted: `docs/playground.md` MUSE-03 sentence "cards 9
  and above need click" becomes "cards 10 and above"; footer and handler
  then agree at 1–9.

## MUSE-05 — Facts needed for the first native editable primitive

- Deliverable: `docs/qa/editor-readiness.md` (new, 71 lines ≤ 100).
- Sources read: `docs/scene-format.md`, `engine/world/document.js` (109
  lines, full), `tools/scene-check.js` (25, full),
  `tools/godot-export.js` (109, full), `experiments/godot/main.gd` (128,
  full), `levels/fixtures/connected-lab.nil.json` (full); ball-field
  grep over `level.js`/`physics.js`/`shader.js` (hits are player-model and
  blast effects, unrelated to scene entities).
- Trace outcome: validation and prepared coordinates exist
  (`document.js:28-109`); CPU collision field, browser shader feed and
  Godot entity path are all MISSING (marked explicitly, not invented).
  Only importer of `prepareScene` is `scene-check.js`. Native export
  covers h3/s3 render fixtures only; `main.gd` uploads fixture-camera
  uniforms, no scene data. No Godot implementation, schemas or
  architecture decisions added. Status: READY FOR REVIEW.
- Command: `node tools/scene-check.js` re-run → output identical to
  baseline, exit clean. Inputs unchanged (no scene-path file in the
  working-tree diff), so the baseline is reused and stated as such.

## MUSE-04 re-probe (2026-09-09, same WSL client, branch main at b9b42e7)

- Browser still unavailable; no setup changes made. `node -e
  existsSync`: `/usr/bin/google-chrome` false, `/usr/bin/chromium`
  true — but it is a snap wrapper (`/usr/bin/chromium →
  /usr/bin/chromium-browser`, 2020 script) and `/usr/bin/chromium
  --version` fails (`snap-confine ... cap_dac_override ... Operation
  canceled`). Windows `chrome.exe` exists at `C:\Program
  Files\Google\Chrome\Application\chrome.exe` but executing it from
  WSL fails (`Operation not permitted`), same interop barrier as the
  two spent attempts. Full 300 s `page-check --worlds` not launched
  against the known-broken binary.
- Non-browser checks on the fixed tree: `node --check` OK on
  `main.js`, `app/menu.js`, `tools/world-probe.js`; `node
  tools/test.js` → 18/18 suites passed, exit 0 (WSL node v22.23.2).
- Behavioral fail-before (original `/^Digit[1-8]$/` handler) /
  pass-after plus `page-check --worlds` remain unexecuted here.
  Change stays UNACCEPTED; status VERIFICATION BLOCKED stands.
  Pending on a browser host: run the focused-shortcut probe block on
  the original guard (expect Digit9-from-button/select/summary
  failure), re-run on the fix (expect pass), then `page-check
  --worlds` and `test.js`.

## MUSE-04 browser runs with real Chrome 153 (2026-09-09, same WSL client)

- Install verified correct: `google-chrome --version` → `Google
  Chrome 153.0.8010.36`; `/usr/bin/google-chrome` resolves via
  `/etc/alternatives` to `/opt/google/chrome/google-chrome` (bash
  wrapper) + `/opt/google/chrome/chrome` (real ELF). The old
  `/usr/bin/chromium` snap stub is no longer what `findBrowser()`
  hits. No packages installed by Muse; install was the user's own.
- Fail-before attempt (guard temporarily reverted to
  `/^Digit[1-8]$/`, my own MUSE-04 edit, restored immediately
  after): `node tools/page-check.js --worlds` → `backend: real GPU,
  COLD shader cache` then `FAIL the page never reported back within
  300 s`. Retry `node tools/page-check.js --sw --worlds` →
  `backend: SwiftShader, COLD shader cache`, same 300 s no-report.
- Root cause, drilled to the bottom: Chrome cannot start in this
  sandboxed shell at all. Standalone `google-chrome --headless
  --dump-dom about:blank` fails (`Failed to create headless user
  data directory container` without `--user-data-dir`; with an
  explicit dir: `socketpair: Operation not permitted` +
  `Trace/breakpoint trap`). Persists with `--no-sandbox
  --single-process --disable-crashpad --disable-dev-shm-usage` —
  seccomp-level block on a syscall Chrome fundamentally needs, not
  flag-fixable, and `page-check.js` flags are outside MUSE-04's
  allowed files anyway.
- Correction to the earlier re-probe: the `timeout(1)` utility
  itself is broken here (`timeout 10 echo hi` → `Operation not
  permitted`, exit 126), so the EPERM readings on `chrome.exe` /
  `cmd.exe` in the previous probe are artifact, not evidence about
  Windows interop. The `socketpair` finding above replaces them.
- Tree state after probing: fix restored (`main.js:1308`
  `/^Digit[1-9]$/`, 1-line diff only); `node --check main.js` OK;
  `node tools/test.js` → 18/18 pass. Behavioral fail-before /
  pass-after still unexecuted — needs a host where Chrome can
  create sockets (unsandboxed shell, or Windows-side Node +
  Chrome from PowerShell). Status VERIFICATION BLOCKED stands.

## MUSE-04 Windows runs (user-executed, PowerShell + Windows node v24.20.0)

- Pass-after (fixed `[1-9]` guard): `page-check.js --worlds` →
  `backend: real GPU, COLD`, `world suite time: 26.8 s`, page
  error none, boot hidden, HUD live, `world/input checks: 323
  passed`, `ok all world transitions and input checks passed`.
  Banked as the fixed-code evidence.
- Fail-before attempts (guard reverted to `[1-8]`, my own edit):
  two consecutive `page-check.js --worlds` runs → both `FAIL the
  page never reported back within 300 s` (no Digit9 assertion
  text, no report at all). Revert verified byte-clean
  (`git diff` empty vs HEAD, `node --check` OK), so not file
  corruption.
- Discriminator (fix restored, same command): two more consecutive
  runs → both 300 s no-report on the FIXED tree. Verdict:
  content-independent cold-start flake on the real-GPU path
  (tally: 1 cold pass + 4 cold hangs across both guard states —
  a one-char regex cannot cause pre-report silence). First run
  likely got a clean cold shader build; later builds hang.
- Next: retry behavioral runs on the SwiftShader backend from
  PowerShell (`--sw --worlds`), which avoids the real-GPU driver
  path; cache warmth cannot affect a JS key guard, so `--warm`
  is also acceptable for the fail-before leg if cold keeps
  hanging. Tree left with the fix applied.
- SwiftShader pass-after (fixed guard): `--sw --worlds`, COLD →
  158.8 s, no page error, boot hidden, HUD live, 323 checks
  passed. Second-backend confirmation banked.
- Fail-before leg (reverted guard): `--sw --worlds` COLD → 300 s
  no-report; `--sw --warm --worlds` → 300 s no-report; plain
  `--sw --warm` (no world suite) → 300 s no-report. Reverted
  tally 0/4 reports vs fixed 2/4 — but the plain-probe hang
  (a one-regex keydown difference cannot affect 20-frame boot)
  points at wedged shared state, not content: the `--warm`
  runs reuse the `pagecheck-sw` profile, and runs killed at the
  300 s timeout can leave it mid-build; timed-out headless
  Chrome orphans may also be holding GPU/profile resources.
  Fix restored; next step is orphan cleanup + one healthy-env
  confirmation run before any further fail-before attempt.
- Orphan theory confirmed in practice: after headless-cleanup the
  fixed tree passed realGPU COLD in 30.5 s (323 checks) — third
  pass-after point (2x realGPU cold 26.8/30.5 s + 1x sw cold
  158.8 s). `menuBusy` audited (`main.js:612,1301,1644,1658-1666`):
  set only in `queueMenuChange` with a `finally` clear — no
  digit-dependent hang path exists in the app, and the probe's
  `catch` always reports, so reverted-silence has no in-page
  mechanism. Best explanation remains `child.kill()` reaping only
  the parent Chrome while timed-out GPU/renderer orphans hold
  D3D/compiler locks for the next run. Final attempt runs the
  reverted guard warm immediately after orphan cleanup.
- FAIL-BEFORE CAPTURED (reverted guard, realGPU warm, user-run):
  `world suite time: 2.0 s`, `page error: Error: shortcut:
  Digit9 from button selects street` (thrown at the first
  focused-shortcut assertion, 301 checks passed before it —
  full preset sweep green), `FAIL the page threw`. The probe
  catches the original defect as designed: Digit9 dispatched on
  the focused card button is swallowed by `/^Digit[1-8]$/`.
- PASS-AFTER (fixed guard, user-run): realGPU COLD 26.8 s and
  30.5 s, SwiftShader COLD 158.8 s — all 323/323 checks, no page
  error, boot hidden, HUD live. Preset order unchanged (13),
  native select-change/menu-isolation controls green in-suite.
- Non-browser: `node --check` OK on all three files;
  `node tools/test.js` 18/18 (WSL node). Tree left with the fix
  (`main.js:1308` `/^Digit[1-9]$/`); footer `1–9` agrees.
  Status: READY FOR REVIEW. Environment note for the reviewer:
  kill headless-Chrome orphans between repeated cold runs
  (CIM `CommandLine -like '*headless*'`), else later runs hang
  past the 300 s report timeout.

## Revision pass (2026-09-09, same WSL client, main at b9b42e7)

Baseline reuse: environment, `test.js` 18/18 and `scene-check.js`
baselines above are unchanged and not re-run as discovery. No browser
launches were repeated for already-covered behavior; one bounded
`page-check --timeout=8` smoke ran for the new MUSE-06 failure path
only (0.37 s, below). No cold-run matrix requested or run.
Windows-specific process-tree termination is explicitly unverified
here (mocked taskkill args only, not Windows integration).

## MUSE-02 revision (review: standalone probe, viewport, env)

- Changed: `docs/qa/render-fixture-guide.md` only.
- Literal copyable commands with `/tmp/*.png` outputs; `world-probe.js`
  noted as inject-only (runs via `page-check --worlds`, not standalone).
- Resolution: `CW=400 CH=300` example that fits; VW/VH pinned at
  800/500 with no `--viewport=` forwarding stated; 900/600 crop warning.
- Driver-truth sentence now routes through `page-check --worlds`
  (which injects world-probe for GL-error checks).
- Environment paragraph: missing-browser observation kept as history;
  current blocker is sandbox socket creation; image verification left
  to a capable host, attributed separately.
- Command: `node -e` fixture-name check vs
  `render-regressions.json` → version 1, three names match, exit 0.
  Status: READY FOR REVIEW.

## MUSE-03 revision (review: flight rows, 1-9 wording, Nil rise, Fog help)

- Changed: `docs/playground.md` (Nil 60-unit rise, not helix length;
  Sol/SL2R bounded chambers, Nil not called bounded; 1–9 shortcuts,
  cards 10+ click; Space rise / Shift sink rows plus a free-flight
  paragraph naming S3 flythrough, three-torus, Nil climb, Sol/SL2R
  labs); `app/menu.js` (visible `hint-fog` small in the Fog row,
  `aria-describedby` extended, title kept; `update()` only touches
  reason/select, so the hint survives re-renders).
- Flight facts re-verified in code, not copied: `s3Want`
  (`main.js:1964-1973`, Space/Shift along view-up); flight adapters
  s3 / e3t-open / nil (`world-motion.js:26,66,99`) and sol/sl2r
  (`lie-labs.js:66`); Nil finish 60 overhead, helix 26.7
  (`main.js:1883-1885`); six gates (`presets.js:84`).
- Commands: `node --check app/menu.js` → OK; `node --check main.js`
  → OK; no stale `1–8` remains in playground (grep empty).
  `page-check --worlds` and narrow/desktop menu inspection remain
  VERIFICATION BLOCKED on this client (known socket block, not
  retried). Status: READY FOR REVIEW (minus blocked browser leg).

## MUSE-04 revision (review: per-target independence + focus + order)

- Changed: `tools/world-probe.js` (focused-shortcut block only).
  No application change; guard stays `/^Digit[1-9]$/`.
- Per target (button/select/summary): clicks the fight card first,
  asserts start is not street, focuses, asserts
  `document.activeElement`, dispatches Digit9 on the element,
  asserts street. Details opened before select focus, prior
  open-state restored afterward. Full 13-name preset-order check
  replaces the length-only check. Digit1 and menu-isolation controls
  kept; Digit1 start asserted away; change-event check relabeled as
  a select-change handler check (synthetic event, not native arrows).
- Commands: `node --check tools/world-probe.js` → OK; preset-order
  assertion replayed under WSL node vs `levels/presets.js` →
  match true, ninth = street, exit 0. Browser fail-before/pass-after
  on the strengthened block left for the reviewer host (one healthy
  run suffices; no retry series run here).
  Status: READY FOR REVIEW.

## MUSE-05 revision (review: consumers, ORBS path, fixture scope, exit)

- Changed: `docs/qa/editor-readiness.md` (71 → 77 lines, ≤ 100).
- `engine-foundation.test.js` listed as the second `prepareScene`
  consumer (both import sites verified by grep). `level.js` ORBS
  (:62) → ORB_POINTS (:165) with CPU (:272-273) / GLSL (:432-433)
  radius subtraction traced as the authored primitive pattern —
  not scene-v1, not player/blast-only. `views.json` narrowed to
  camera + rendering-setting + marker-count uniforms with no
  scene-v1 entity feed (`uMarkN`/`uCutN` int conversion in
  `main.gd:67-68` verified).
- Command: `node tools/scene-check.js` run directly (no pipe) →
  output identical to baseline, `SCENE_CHECK_EXIT=0` via `;`.
  Status: READY FOR REVIEW.

## MUSE-06 — Bounded browser-test process lifecycle (new)

- Changed: `tools/page-check.js` (startup/report/cleanup lifecycle
  only — same flags, same driver flags, same report fields);
  new `tools/browser-process.js` (owned-session helper: prompt
  spawn-error/early-exit, bounded report wait, exactly-once
  settlement, owned-PID-only cleanup); new root
  `browser-process.test.js` (13 tests, fakes only, no Chrome, no
  sockets). Default stays 300 s; optional `--timeout=SECONDS`
  added (positive only, else exit 2).
- Cleanup rule: POSIX signals only the owned child; Windows
  `taskkill /PID <owned> /T /F` via execFile args (never names,
  never shell); unestablished PID refuses instead of guessing.
  Cleanup failure joins the failure list — a clean page with a
  failed cleanup still exits nonzero.
- Commands (WSL node v22.23.2, repo root):
  `node browser-process.test.js` → 13 passed, 0 failed, exit 0;
  `node tools/test.js` → 19/19 suites passed, exit 0;
  `node tools/page-check.js --timeout=nope` → usage error, exit 2;
  `node tools/page-check.js --timeout=8` → 0.37 s,
  `FAIL the browser stopped before reporting: browser exited
  before report (code null, signal SIGTRAP)` + socketpair stderr
  tail, exit 1 (was: 300 s silent wait). Server closed, process
  exited promptly — no hang.
- Limitation: no successful-browser report semantics changed, but
  none re-verified here (Chrome cannot start in this sandbox);
  Windows `taskkill` path covered by mocked-arg test only.
  Status: READY FOR REVIEW.

## MUSE-06 Windows runs (user-executed, PowerShell, 2026-09-09)

- Guard states verified by the user's own `git diff`: leg 1 ran with
  the guard reverted (`[1-8]`, empty diff vs HEAD), leg 2 with the fix
  restored (one-line `[1-8]`→`[1-9]` diff). Tree left correct.
- Leg 1 (`--warm --worlds`, reverted): browser exited code 0 before
  any report — no behavioral FAIL captured. Leg 2 (`--worlds` cold,
  fixed): browser exited code 21 before any report — no 323 pass.
  Both are instant startup exits, unrelated to page content (a
  one-char key guard cannot cause pre-report silence); the previous
  cold-start flake note applies, now with fail-fast evidence instead
  of 300 s waits. No MUSE-04 behavioral evidence either way; the
  strengthened block still awaits one healthy-host run.
- Tool wart found by these runs and fixed same session:
  `killOwnedChild` now short-circuits to `already-exited` when the
  owned child reaped itself, instead of taskkilling a dead PID and
  reporting a bogus cleanup failure. Covered by a new unit test
  (14/14 in `browser-process.test.js`).
- Follow-up diag (user-executed): `--version` opened a desktop window
  instead of printing; `--dump-dom about:blank` exited silently with
  no output. With all desktop Chrome closed (Get-Process confirms
  none) and fresh profiles, headless still prints nothing (exit 0
  once logging flags are present). Both the exact real-GPU flag set
  and the exact SwiftShader flag set die silently on `about:blank`
  with exit 0 and no DOM dump. Verdict: the shared headless
  navigation/render path is broken host-side; page-check flags,
  server and probe are exonerated. Prime suspect is a pending
  Chrome update or broken headless component — desktop Chrome
  itself runs.
- Post-update retry (user-executed): user updated desktop Chrome
  successfully, re-ran `page-check --worlds` cold on the fixed tree
  → same instant code-0 exit, no report. Update did not restore
  headless page loads; stdout silence persists even for
  `--dump-dom about:blank`. Notably the bogus taskkill failure is
  gone — the `already-exited` short-circuit is confirmed in the
  field.
- Screenshot probe (user-executed): SwiftShader `--screenshot`
  of `about:blank` → exit 1, no stderr, no PNG written. Dump,
  screenshot, and page-load paths all die silently while desktop
  Chrome works: headless as a whole is non-functional on this
  host.
- Verdict (user-executed): no `chrome_debug.log` under any fresh
  profile, and `chrome://crashes` shows nothing fresh. Headless
  processes die before logging and crash-reporting initialize, on
  both GPU flag sets, after a successful update, while desktop
  Chrome works. Not diagnosable further from outside (AV/endpoint
  kill or broken headless component; needs admin or reinstall,
  both out of scope). Diagnosis stopped here by agreement.
  page-check flags, server, probe, and the MUSE-06 lifecycle code
  are exonerated; the field-confirmed `already-exited` fix stands.
  Browser verification of the strengthened MUSE-04 block and the
  MUSE-06 report path stays BLOCKED on host health, unrelated to
  the deliverables.

## MUSE-06 POSIX revision (2026-09-09, WSL node v22.23.2, main at b9b42e7)

- Changed: `tools/browser-process.js` (owned POSIX process-group
  cleanup: SIGTERM the owned PGID, await exit, bounded SIGKILL
  escalation, honest failure; group address only via the caller's
  launch-established flag, never derived), `tools/page-check.js`
  (POSIX-only `detached: true` spawn + group flag; Windows spawn,
  taskkill, profile and flag behavior byte-identical; POSIX warm
  publication stays off), new `tools/fixtures/browser-worker.js`
  (linger/ignore-term/exit-now modes, no sockets/Chrome/shell),
  `browser-process.test.js` (+10: 6 fake group tests, 4 real-worker
  tests with explicit EPERM skips).
- Environment: a `/tmp` probe first established detached spawn +
  group signal + grandchild reaping work in this sandbox (1 setup
  attempt, success) — so real-worker tests ran, 0 skips, 0 EPERM.
  The WSL Chrome socketpair block is unchanged and separate; no
  browser launches, installs, or user-run requests in this revision.
- Commands: `node browser-process.test.js` → 29 passed, 0 failed,
  0 skipped, exit 0; `node tools/test.js` → 20/20 suites, exit 0.
  Status: READY FOR REVIEW.

## MUSE-07 ball-document QA (2026-09-09, same client)

- Changed: new `levels/fixtures/ball-document-cases.json` (18
  self-contained cases: valid lab; unknown field/version; shared-
  namespace duplicate ID; unknown region; negative/missing radius;
  ball + spawn extent straddles; missing spawn; schema-valid but
  host-rejected no-ball/extra-ball/extra-spawn/h3-region/portal;
  unknown kind; short/non-finite positions — each with separate
  general/ballHost verdicts and literal rejection substrings),
  `ball-scene.test.js` (case runner asserting both verdicts,
  reason substrings and source immutability; rejected-edit
  source-unchanged; snapshot immutability via document()/uniform();
  full-precision JSON round trip), new
  `docs/qa/ball-editor-checklist.md` (43 lines, Node steps executed
  here, browser/Godot steps cited from docs/ball-lab.md).
  Original `ball-lab.nil.json` untouched; no tolerance, schema,
  engine, shader or UI changes.
- All 18 declared verdicts matched the validators on first run; no
  adapter discrepancies found, so no core fix to hand back.
- Commands: `node ball-scene.test.js` → 18 cases pass, exit 0;
  `node tools/scene-check.js levels/fixtures/ball-lab.nil.json` →
  1 region, 2 entities, exit 0; `node tools/test.js` → 20/20,
  exit 0. Browser/Godot steps unexecuted here (lead evidence cited
  in the checklist, never claimed as own runs).
  Status: READY FOR REVIEW.


## Lead note appended at integration (Opus, 2026-09-09)

The Muse and user records above are left exactly as written. Two of their
conclusions have since been overtaken by events, and are corrected here rather
than edited above:

- The "headless as a whole is non-functional on this host" verdict no longer
  holds. Real-GPU cold `node tools/page-check.js --worlds --timeout=180` ran to
  a clean 346-check report in 28.5 s during integration, and `--ball-lab` gave
  9 checks. Astra's unique-cold-profile fix plus the user's Chrome update
  account for it. Earlier "VERIFICATION BLOCKED (browser)" notes are history.
- The MUSE-06 POSIX revision's "29/29, full suite 20/20" holds on POSIX only.
  On Windows the same suite hung and leaked a detached worker until a platform
  gate was added at integration.

Verdicts, measurements and the full verification table:
docs/qa/opus-integration-2026-09-09.md.
