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

## Continuation baseline (Muse, 2026-09-09, overnight batch 08-15)

- Branch/hash: `main` at `9356527` (post-integration HEAD; earlier entries
  in this file were recorded against `b9b42e7`).
- OS: Linux LeoPC 6.18.33.2-microsoft-standard-WSL2 (WSL2, x86_64).
- Node: `/usr/bin/node`, v22.23.2 (WSL Linux executable).
- Browser/backend from WSL node: none runnable. The WSL socketpair block is
  unchanged, so browser/GPU checks still run only from the Windows host;
  per the queue, Linux Chrome presence was not re-investigated and no
  browser launches, installs, or user-run requests were made.
- Baseline (real executions, this host, new HEAD, before MUSE-08 edits):
  `node tools/test.js` → 23/23 suites, exit 0 (includes
  `browser-process.test.js` at 31 passed, 0 failed, 0 skipped);
  `node tools/scene-check.js` → connected-lab 2 regions, 6 entities,
  1 portal definition, exit 0. Prior suite/test counts of 20/20 and 29/29
  in older queue text are stale; the numbers above are what this HEAD gives.
- Pre-existing tree state: clean (`git status --short` empty at start).

## MUSE-08 — Cross-platform guard for the browser-test lifecycle

- Changed files: `browser-process.test.js` only (+4 tests, helper
  refactor); `MUSE_TASKS.md` (this task's status line only).
  `tools/browser-process.js`, `tools/page-check.js`,
  `tools/browser-profile.js`, GPU flags untouched, as ordered.
- What was added:
  1. `isPosixPlatform(platform)` pure gate + `realTestWith(state, opts,
     name, fn)` with INJECTED platform/spawn and explicit per-call state;
     `realTest` is now a thin wrapper over shared state, behavior on this
     host unchanged. `supportProbe(spawnFn)` takes the spawner as a
     parameter so a stub can observe it.
  2. `simulated win32 host: real-worker path spawns nothing` — counting
     spawn stub must see zero calls and the worker body must not run;
     uses fresh state so it cannot pollute the shared probe.
  3. `win32 never takes the posix-group branch, even when flagged` — live
     fake child + ESRCH-throwing group signal + `posixProcessGroup: true`
     on injected win32 must take the structured taskkill path with zero
     group signals (module-side pin for the integration defect).
  4. `suite leaves no owned child alive` (runs last) — every PID the
     suite really spawns is recorded in `spawnWorker`; asserts each is
     gone via `kill(pid, 0)`, with EPERM/uncheckable counted as live
     (fail, never silent pass). On non-POSIX it additionally asserts zero
     real spawns. No sweeps, no process-name matching.
- Bullet 3, second half — HANDED BACK, module deliberately unchanged: a
  scratch probe (`/tmp/muse08-esrch-probe.mjs`, not in the repo) gave a
  demonstrably LIVE child (`exitCode null`) + throwing POSIX group
  signal to `killOwnedChild` and got back
  `{"target":99991,"method":"already-exited"}` (probe exit 1). The
  group-ESRCH reading trusts the launch-established `posixProcessGroup`
  flag; it cannot distinguish "group reaped" from "no group ever
  existed" (e.g. flag passed for a non-detached child). Suite safety
  therefore rests on the caller-side gate + detached spawn, which guards
  1-3 pin — not on the module detecting a wrong flag. Minimal repro is
  the probe file above; `tools/browser-process.js:86-94` is the seam.
- Fail-against-pre-fix demonstration: with the gate temporarily forced to
  `if (false)` in the working copy, the new win32-simulation test FAILS
  (`'skipped-nosupport' == 'skipped-platform'`, probe spawned once via
  the stub), suite still exits promptly (1 s wall). Gate restored from a
  byte copy; `diff` confirms restoration; re-run green. Pre-fix code
  would have hung/leaked only on Windows; this simulation shows the
  regression is caught on either host.
- Commands (WSL node v22.23.2, repo root):
  `node --check browser-process.test.js` → OK;
  `node browser-process.test.js` → 35 passed, 0 failed, 1 skipped
  (the skip is the simulated-win32 case's own SKIP line), exit 0,
  2 s wall — prompt exit, no hang;
  `node tools/test.js` → 23/23 suites, exit 0.
  Stray check: suite's own PID list (6 PIDs this run, all gone) plus
  `ps -ef | grep -F browser-worker` → no lines. (Bare `pgrep -f` in this
  sandbox matches its own wrapper PIDs 1-2; not a signal — the PID-list
  check and the ps grep are the evidence.)
- Host: WSL only. The Windows leg (25 + skips + additions) is left for a
  Windows run; nothing in the change is Windows-specific beyond the
  injected-platform simulation, which runs anywhere.
  Status: READY FOR REVIEW.

## MUSE-09 — Shared validator conformance cases for the two ball runtimes

- Changed files: `levels/fixtures/ball-document-cases.json` (18 cases
  annotated + 4 added = 22), `ball-scene.test.js` (slug/native shape
  asserts in the case loop), new `tools/ball-conformance.js` reporter,
  new `levels/fixtures/ball-conformance-expectations.json` (reporter
  output). `engine/world/ball-scene.js`, `engine/world/document.js`,
  `tools/scene-check.js`, no `.gd` file touched, as ordered.
- Code reading (no Godot run, none claimed): `ball_document.gd _valid`
  accepts exactly one E3 cover + one spawn + one ball + no connections,
  with the same field/shape/positivity/bounds rules as the JS side and a
  SINGLE generic rejection literal for every document refusal — so no
  `errorContains` wording can ever match natively. Hence per case:
  `reasonKind` slug (both runtimes can match; JS `errorContains` kept),
  `native` declared verdict, `nativeRule` citing the answering `_valid`
  clause by line (L33 scene-shape … L63 bounds). Native answers: accept
  only valid-lab + tangent-ball; reject the other 20.
- Boundary finding, from the code (marked OBSERVATION in the case):
  tangent equality is LEGAL in both adapters — JS `<=`
  (`document.js:62`), GDScript `not >` (`ball_document.gd:63`) — with the
  tangent case constructed exactly representable (hypot 3.5 + 0.5 === 4,
  verified by execution). Whether the native float path lands exactly on
  4.0 is open question 2 below, for the Godot run.
- New cases: non-`cover` topology (`topology-not-cover`), extent zero and
  negative (`extent-not-positive` × 2), exactly-tangent ball (`ok`,
  accept/accept/accept). Each new reject differs from valid-lab by one
  defect; JS messages re-verified by execution, not copied.
- Reporter behavior: shape checks (slug format, verdict enums, nativeRule
  line in range, errorContains iff ballHost-reject, source non-mutation),
  runs all 22 through the JS validators, pins tangent exactness, extracts
  the native generic literal textually (anchored lone-literal pattern;
  the 3 file-I/O concatenations excluded — the first draft of that regex
  over-matched 4 literals and the reporter refused to run, which is the
  loud failure working as designed), writes the expectations file, exit 1
  on any mismatch. Drift demo: one broken `errorContains` in a scratch
  copy → `FAIL case non-cover-topology: wrong JS rejection`, exit 1;
  fixture restored byte-identical (`diff` clean).
- Commands (WSL node v22.23.2): `node tools/ball-conformance.js` → 22
  cases, 2 ball-host accepts, no drift, exit 0;
  `node ball-scene.test.js` → 22 document cases passed, exit 0;
  `node tools/scene-check.js levels/fixtures/ball-lab.nil.json` → 1
  region, 2 entities, exit 0; `node tools/test.js` → 23/23, exit 0.
- Questions only a Godot run can answer (also in the expectations file):
  the 20 reject + 2 accept native verdicts as declared; native sqrt at
  the tangent boundary; decimal fidelity through parse_string/save_file;
  duplicate-kind rule firing; generic literal unchanged.
  Status: READY FOR REVIEW.

## MUSE-10 — Which checks run on which host

- Deliverable: new `docs/qa/check-runbook.md` (46 lines, at most 90).
  No tool, rule, or doc edits besides this file, the results entry, and
  the task status line.
- One table covering every required command: test.js, scene-check,
  shader-check, sdf-check, march-check, link-time, net-check,
  render-fixture, world-probe, browser-process.test.js, page-check
  --worlds/--ball-lab/--sw/--warm/--timeout=. Each row: what it proves,
  host, rough time, usual failure meaning. Links to (not copies of)
  WORKING_RULES' required-checks table; all 4 file links verified to
  resolve. Both platform restrictions stated with reasons (WSL
  socketpair block; no Windows process groups + measured ESRCH), plus
  the headless-Chrome fixed note so old BLOCKED notes read as history.
- Ran here (WSL node v22.23.2, exit codes): `node tools/test.js` → 23/23,
  exit 0, 6 s; `node tools/scene-check.js` → exit 0, <1 s;
  `node tools/march-check.js` → 0 exhausted everywhere, exit 0, 3 s;
  `node browser-process.test.js` → 35/0/1, exit 0, 2 s (MUSE-08);
  `node tools/ball-conformance.js` → exit 0, <1 s.
  `node tools/net-check.js` is SPLIT: relay half passes here ONLY with
  the sandbox proxy vars stripped (6/6 socket checks; with them, even
  localhost fetch fails — environment artifact, diagnosed once, not a
  repo verdict); peer half FAILs without Chrome as expected (exit 1,
  42 s). Cited, with sources: shader-check 10/10, sdf-check 21 cases,
  page-check --worlds 346 checks/28.5 s cold real-GPU, --ball-lab 9
  checks (all opus-integration-2026-09-09); link-time 0.7 s editor vs
  8.4 s arena (host-capability-map.md:102,149); --sw 158.8 s cold and
  warm-346 (MUSE-04 evidence + integration). render-fixture and
  world-probe marked browser-only with their guide/task pointers; no
  runtime invented where none was measured.
  Status: READY FOR REVIEW.

## MUSE-11 — Every declared uniform is located and set

- Changed files: new `uniform-coverage.test.js` (root; auto-discovered
  by tools/test.js, so no runner edit needed). No `engine/`, `app/`, or
  shader-source edits. No defect found: coverage is complete, so nothing
  to hand back.
- Scope found, not assumed: 10 compiled programs — 8 world programs
  (`VERT` + `fragFor(key)` per SPACES entry: h3 s3 h2r s2r e3t nil sol
  sl2r), `lines` (LINE_VERT + LINE_FRAG), ball-first-person
  (BALL_FIRST_PERSON_GLSL, host app/ball-lab.js). Chunks without their
  own host (NIL_CYLINDER_GLSL via nil.js, lie/nil fragments, level and
  geometry GLSL helpers) ride inside the assembled world sources, so
  they are covered through them.
- Method: comment-stripped parse of `uniform <type> <a>[N], <b>, ...;`
  — comma groups matter (nil/sol/sl2r pack 5–8 names per declaration; a
  first-name-only parse drops most of them). main.js hosts by alias
  (`U.<short>` via the sceneUniforms table + `UL.color`; aliases mapped
  through the table, unknown aliases fail); ball-lab.js hosts by GLSL
  name directly. Both directions asserted: declared-but-never-located,
  declared-but-never-set (per program), set-but-never-declared plus
  set-through-unknown-alias (per host over its program union — main.js
  sets all scene uniforms every frame, so per-program set-checks would
  false-positive on geometry-specific names).
- One documented exception: BALL_PREVIEW_GLSL (uBall, uRes) has NO WebGL
  host in-repo — nothing compiles it in a page; its string is consumed
  by shader-check, SDF/parity fixtures and the Godot text exporter.
  Pinned executably two ways: the declared set must stay exactly
  {uBall, uRes}, and a `'uBall'` literal appearing in main.js/app
  sources fails with "register the host". (uRes is intentionally not
  pinned; it is hosted under other pairs.)
- Fail/pass demo: deleted the `gl.uniform4fv(U.uPortals, …)` line in a
  working copy → exit 1 with exactly
  `declared-but-never-set: ball-first-person uPortals (app/ball-lab.js)`
  (the location-table entry alone does not satisfy it — the task's
  list-is-not-set case). Restored byte-identical (`diff` clean) → pass.
- Commands (WSL node v22.23.2): `node uniform-coverage.test.js` → 10
  programs, 57 declared names, 1 exception, exit 0;
  `node tools/test.js` → 24/24 suites, exit 0.
- Limitation: textual source contract, not driver behavior — a uniform
  the compiler optimizes out still needs both halves here. Stated in
  the test header.
  Status: READY FOR REVIEW.

## MUSE-12 — Stale-claim sweep across the documentation

- Deliverable: new `docs/qa/stale-claims-2026-09.md` (14 FALSE, 11
  STALE-BUT-HARMLESS, 3 UNVERIFIABLE, each with file:line + evidence
  command). No swept document edited, per the task rule.
- Heaviest findings: `--ball-lab: 9 checks` in two lead reviews, the
  checklist, and (by citation) this batch's own runbook + MUSE-10 entry
  is contradicted by the tree — `app/ball-lab.js` runs one linear flow
  of 57 `check(` sites and `page-check.js` prints `checks.length`, so a
  green run reports ~57. CORRECTION to the MUSE-10 entry above: replace
  "cited: 9 checks" with "57 check sites in code; 9 in integration —
  conflict, needs one browser run". `check-runbook.md` itself is left
  untouched (MUSE-12 no-edit rule); the stale-claims report is its
  correction pointer. Other FALSEs: architecture "connections authoring
  data only" / "collision still pending" / "six programs"; playground
  "both shader programs" / "twelve thousand rays"; scene-format "no
  traversal/visibility"; capability-map "exact ray hit, eight
  geometries"; README + architecture pointers to AGENTS.md (an 18-line
  router — the table is WORKING_RULES); controls-review 1–8/F1/F4-open
  superseded by MUSE-04/F4-closure; ball-lab "portals not authorable"
  contradicted in-file; rendering-contract "next step" already done;
  "10 programs" in both reviews vs 11-entry array.
- Method: 28 docs + 4 roots covered (full reads except archive/targeted
  ones noted with depth in the report's per-file log; legacy reference
  headings-only by WORKING_RULES design). Verified-true spot list
  included (Nil 60, shaft 44, inradii, 13 presets × 8 geometries, chart
  bounds, 13 Godot views, lie-lab numbers, crash-doc lines incl. the
  still-open `remote.cut.N` hole at `main.js:2893`).
- Commands: all evidence commands in the report (node evals, greps,
  suite runs); no suite run needed (no code changes).
  Status: READY FOR REVIEW.

## MUSE-13 — An invalid-document corpus for the scene validator

- Changed files: new `document-invalid.test.js` (root; auto-discovered,
  no runner edit), 60 files under `levels/fixtures/invalid/` (59 mutated
  docs + `manifest.json` with base/change/errorContains per case).
  `engine/world/document.js`, `scene-field.js` untouched, as ordered.
- Construction: `/tmp/muse13-gen.mjs` (scratch, stays out of the repo)
  clones a valid fixture and applies exactly one defect; single-defect
  audited mechanically — all 59 based files touch exactly ONE field
  (57 differ in one leaf; 4 replace one array field: two ball positions,
  two anchor forwards). No hand-written broken-in-three-ways docs.
- The test asserts the MESSAGE per file (must contain the manifest's
  literal, which names the offending id/field), that validation never
  mutates its input, and that the untouched BASE validates — proving the
  defect, not the base, refuses. Plus 4 atomicity checks: rejected
  addEntity / editEntities ×2 / addPortal leave the source
  byte-identical.
- Rule census from reading `document.js` (+ `charts.js` bounds it calls
  into): ~59 distinct refusal rules; 54 covered by a case each.
  Deliberately not covered, with reasons: H3 chart budget (no h3 region
  in any fixture — covering it needs two simultaneous mutations);
  same-line single-samples (units-shape, arrays-non-array variants,
  connection-missing-field, entity-missing-position, objective-with-
  radius, anchor-forward-non-array — same message, one sample each).
- Two findings from building it (no engine fix attempted — both are
  refusal-path observations, refusals exist in all cases):
  1. `chart.decode` (document.js:57) runs BEFORE the straddle pre-check
     (:62): a far-outside point is refused with "Point lies outside
     chart extent", which names neither id nor field (new fixture
     ball-far-outside-extent + the addPortal atomicity case). My first
     draft expected the straddle message and failed — the suite caught
     my assumption, kept as the pinned expectation.
  2. charts.js value messages ("Unsupported chart geometry: e4", "E3 has
     no curvature radius; use 1") name the constraint/value, not the
     document path. Pinned as stable substrings; a path-naming message
     would be friendlier but that is the lead's call.
- Commands (WSL node v22.23.2): `node document-invalid.test.js` → 60
  refusal cases + 4 atomicity, exit 0; `node tools/test.js` → 25/25,
  exit 0. No missing/wrong refusal found: every rule sampled refuses,
  for the right reason, atomically.
  Status: READY FOR REVIEW.

## MUSE-14 / MUSE-15 — VERIFICATION BLOCKED (no Windows host this session)

- Both require the Windows host with headless Chrome + real GPU
  (play sweep; cold-cache link-time table) and cannot run from WSL:
  the socketpair block is unchanged — reconfirmed this session by
  `node tools/net-check.js` (peer half: "nothing within 40 s", exit 1)
  and the standing `no Chrome found` / `socketpair: Operation not
  permitted` evidence cited in the queue. No setup retries spent (the
  prerequisite failure is already diagnosed and recorded); no tool,
  engine, or doc files touched for either task.
- Concrete cause (one, per queue): WSL Linux node cannot spawn Chrome
  (seccomp-level socketpair denial), so `play-check`/`link-time` have
  no browser to drive. Remedy exists only on the other host.
- Left for a Windows run with the exact commands in MUSE_TASKS.md.
  Status: VERIFICATION BLOCKED for both; nothing else in the queue
  depends on them.
  (Update: the lead has since closed both — see MUSE_TASKS.md
  "MUSE-14 and MUSE-15: CLOSED by the lead".)

## MUSE-16 — Interop route in the sandboxed shell: NOT available

Verdict: **browser checks ARE NOT available in the sandboxed shell.**

- Environment (this shell, repo root, node v22.23.2):
  `findBrowser()` → `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`,
  `isWsl()` → true. `/proc/version`: WSL2 kernel 6.18.33.2-microsoft-standard.
  chrome.exe readable + executable (`-r-xr-xr-x`). `taskkill.exe` resolves;
  `wslpath` does NOT resolve. Linux Chrome still dead as documented
  (`socketpair: Operation not permitted`, `Trace/breakpoint trap`).
- Command (twice, identical, no workarounds): `node tools/page-check.js
  --ball-lab` → exit 1, wall 0 s both times. Full output (run 1; run 2
  identical apart from the run id and profile suffix):
  `browser           : Windows Chrome via WSL interop`
  `<3>WSL (15 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1`
  `WARNING: undefined browser process(es) from this run survived cleanup
  (could not resolve: Command failed: .../powershell.exe -NoProfile
  -Command $all = @(Get-CimInstance Win32_Process -Filter
  'Name="chrome.exe"' | Where-Object { $_.CommandLine -like
  '*--nilgame-run-id=98228c7d-...*' }); ...)`.
  `<3>WSL (15 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1`
  `backend: real GPU, COLD shader cache`
  `test profile: /tmp/nilgame-pagecheck/gpu-OfnFoH`
  `FAIL the browser stopped before reporting: browser exited before
  report (code 1, signal null)`
- Reading: this is the task's "anything else" kind, but precise. It is
  NOT finding the Linux Chrome (findBrowser returns the Windows path)
  and NOT EPERM on the .exe (it launches — the backend line prints and
  it exits code 1). The Windows Chrome starts via interop and dies
  instantly on the same socketpair denial, so the sandbox's syscall
  denial follows the launch (or breaks the channel Chrome needs). Two
  identical runs; no third attempt per the task's retry budget.
- Note for MUSE-17's watch item: the survived-cleanup WARNING fired on
  both runs, but as "could not resolve" — the powershell CIM query
  itself fails from this sandbox, so this is an UNRESOLVED check, not a
  confirmed leak. No processes were killed or touched (read-only
  observation; the task forbids cleanup action).
- Consequence: MUSE-17 stops here (its precondition fails). Node-only
  work (MUSE-18) is unaffected.
  Status: READY FOR REVIEW.

## MUSE-18 — What shader link time scales with

- Deliverable: new `docs/qa/link-time-inputs-2026-09.md` (11-row table).
  No shader, tool, or prior-doc edits. Link medians copied from
  `link-time-2026-09.md` (lead, RTX 5070 Ti), not re-measured; no
  browser ran here.
- Method: `/tmp/muse18-analyze.mjs` (scratch) parses the EMITTED
  program texts (`VERT` + `fragFor(key)` etc., what the compiler links):
  chars, non-comment non-blank lines, `name(` function definitions
  (control keywords excluded), call sites of defined functions,
  `for` bounds classified const iff only numbers/operators/ALL_CAPS
  remain after removing the loop variable, `#define` directives present
  in the emission.
- Headline: the five slow programs are TEXTUALLY ONE program — h3 vs
  e3t emissions differ in exactly one line (`#define GEOM (0)` vs
  `(4)`; 2213 lines each). Every parsed column ties across the
  9.0 → 3.3 s spread by construction; the difference lives in
  preprocessor-kept branches, which this parse does not evaluate.
  Across groups size comes closest but inverts Nil (12386 chars, 0.3 s)
  vs ball-FP (6638 chars, 0.7 s, other tool) — and fn-defs inverts
  worse (FP 2 fns at 0.7 s vs Sol 5 at 0.2 s). Verdict as tasked:
  NO single column orders all eleven rows.
- Non-const loop bounds observed: `uMarkN`, `uCutN`, locals, `rolled()`,
  `depth`. Define sets listed per program in the doc.
- Commands: analyzer + h3/e3t diff shown in the doc; `node
  tools/test.js` → 27/27 suites, exit 0 (WSL node v22.23.2).
  Status: READY FOR REVIEW.

## MUSE-19 — Check queue from the sandboxed shell: WORKS

Verdict: **the check queue DOES work from the sandboxed shell.**

- Environment (this shell): branch `main` at `dccbff0`, WSL2 Linux
  (6.18.33.2-microsoft-standard), Node `/usr/bin/node` v22.23.2.
  No Chrome was started from this shell; no retries were needed
  (every command below behaved on its first attempt).
- Worker (user-started, as the task asks): `LeoPC (linux)`, pid 22617,
  heartbeat fresh (≤1 s old at every step), queue
  `/mnt/c/Users/lflyn/Projects/NilGame/.check-queue` empty before
  and after. Note plainly: the serving worker reports platform
  `linux`, i.e. the user's `--serve` runs in their own un-sandboxed
  WSL shell on the same machine, not Windows node. Browser launches
  from that shell go through WSL interop, which works there — the
  run below is the proof. An unserved queue was never observed, so
  the "nobody serving" branch was not exercised.
- `node tools/check-queue.js --list` → exit 0. Names the worker and
  the seven runnable checks with their allowed flags.
- `node tools/check-queue.js page-check --ball-lab` → exit 0,
  wall 4 s. Full worker-side output:
  `browser : Windows Chrome via WSL interop` /
  `backend: real GPU, COLD shader cache` /
  `ball editor checks : 57 passed` /
  `[page-check ran on LeoPC, exit 0, 2.8 s]`
  (page error none, boot panel hidden, HUD `E3 scene authoring lab`,
  screenshot `page-check-shot.png`). The queue printed the check's
  own output and exited with the check's own code, as designed.
- Refusals (each `echo $?` on its own line, no pipeline):
  `node tools/check-queue.js rm-rf --all` →
  `unknown check "rm-rf". Allowed: page-check, play-check, link-time,
  net-check, march-check, shader-check, sdf-check`, exit **2**;
  `node tools/check-queue.js page-check /etc/passwd` →
  `page-check does not accept "/etc/passwd". Flags: --worlds
  --ball-lab --sw --warm --timeout=`, exit **2**.
  Both refused client-side with a reason; a refusal looking like
  success (the worst failure mode) was not observed.
- No code changed; no files written outside this report and the
  task's status line. Status: READY FOR REVIEW.

## MUSE-20 — Cited checks through the queue

Worker throughout: `LeoPC (linux)`, pid 22617 (same user-started
`--serve` as MUSE-19). Full per-check logs in `/tmp/muse20-*.log`
(scratch, not committed). No browser process was touched from here;
no survivor-cleanup WARNING appeared in any `page-check` output
(explicitly grepped `--worlds` and `--sw --worlds`; none in the
`--ball-lab` output either).

| Check (queue command) | Exit | Wall | Count / verdict |
| --- | --- | --- | --- |
| `page-check --worlds` | 0 | 31 s | 346 passed, real GPU cold, no page error |
| `page-check --ball-lab` | 0 | 4 s | 57 passed (MUSE-19 run, reused here) |
| `page-check --sw --worlds` | 0 | 172 s | 346 passed, SwiftShader cold, no page error |
| `net-check` | 0 | 7 s | 9 passed, 0 failed; relay AND peer data-channel connect |
| `play-check` (default: fight, 3000 frames, seeds 1..3) | 1 (worker) / 4 (requester timed out at 900 s, result retrieved after) | 900 s worker | all 3 seeds FAIL: page never reported back within 300 s, browser refusing a 3D context |
| `link-time` | 1, twice | 0.7 s / 0.6 s worker | `FAIL no webgl2 - rerun with a real GPU available` |
| `march-check` | 0 | 4 s | 0 / 29913 exhausted, mean steps 18.2, worst folds 4 |
| `shader-check` | 0 | 2 s | every program compiled+linked (incl. ball first-person with uPortals*) |
| `sdf-check` | 0 | 7 s | every world's two SDFs agree (worst ~7e-7 vs tol 2e-5) |

- Seven of nine families are now measured through the queue instead
  of cited, all green. `check-runbook.md` timing cells for those
  rows carry the queue figures; `link-time` keeps its cited figure
  (see next point) and there is no runbook row for `play-check`.
- Two families explicitly still without a green number: `play-check`
  default and `link-time`. Both are blocked by the same environmental
  cause, measured twice for link-time: the worker host's Chrome lost
  WebGL between ~18:56 (shader-check linking under ANGLE: exit 0)
  and ~19:03 (play-check seeds timing out on no-3D-context).
  Real-GPU `page-check` runs passed on the same worker minutes
  earlier, so this is a host-side GPU dropout (GPU process died,
  driver blocklist, or acceleration toggled), not a game or queue
  defect. Remedy is on the worker host: restart Chrome, check
  `chrome://gpu` WebGL2 row, reboot if needed — then re-run just
  these two commands. No third probe was spent here (two failed
  setup observations is the stop line); a `play-check --sw` run
  could meanwhile confirm the probe under software GL if the lead
  wants it.
- Notable aside for the runbook: `net-check`'s peer half PASSES
  from the worker host (9/9 in 7 s), against the standing "peer
  FAILs on WSL" note — the difference is the worker's un-sandboxed
  shell, same as MUSE-19's interop finding.
- No code changed; writes are this report, runbook timing cells,
  and the task's status line. Status: READY FOR REVIEW.

## MUSE-21 — A corpus for booleans

- Environment (this shell): `host-probe` verdict "browser checks run
  THROUGH THE QUEUE here" (sandbox denies AF_UNIX + AF_VSOCK; worker
  LeoPC linux pid 22617 still serving — pasted in full in the session,
  not re-investigated per the queue). Baseline `node tools/test.js`
  at `c3d4631` → 29/29, exit 0, before edits.
- Rule inventory around `op`/`target`, read from the code: FIVE
  rules. document.js: op on non-solids, misspelled op value, target
  without a subtract, self-target. scene-field.js: target must name
  an ADDED solid (one rule covering missing ids, non-solids, and
  carve-on-carve). All five covered.
- New files: `boolean-corpus.test.js` (auto-discovered by
  tools/test.js, no registration edit needed), 7 valid docs under
  `levels/fixtures/carve/` + manifest, 10 single-defect docs under
  `levels/fixtures/invalid/` (NOT in the MUSE-13 manifest: its runner
  only calls validateScene and the 3 field-level cases pass
  validation by design — stated in the new manifest).
- Invalid: op on spawn/objective/anchor, misspelled op, target on an
  add, target with no op, self-target (all document-level,
  message-checked); target naming nonexistent id, a spawn, another
  subtract (all field-level: validateScene passes, compile refuses,
  and the runner asserts that split). Refusals leave input
  byte-identical; every base compiles.
- Valid, each with capabilities asserted bound/marched: slab room;
  fully-removed nub reads 0.5 free space with the floor unmoved;
  two carves one target (carveCount 3, wall stands between);
  carve-after-carve consistent (larger dominates); outside carve
  bitwise identical to uncarved at 6 points; tangent carve reads 0
  at the touch with solid beneath; explicit `target: null` cuts
  globally — floor under the doorway holed (+0.2), far floor intact.
  All spot numbers probed BEFORE pinning (`/tmp/probe-booleans.mjs`,
  scratch).
- Deliberately not cased, with reasons: `target: null` on an add
  (same rule+message as target-without-op); target naming an anchor
  (same code path as the spawn case, which is representative); the
  pre-booleans default (boolean.test.js already pins op-absent).
- Fail-demo (rule 5, scene-field.js target check neutralised in the
  working copy): corpus refuses to pass —
  `Missing expected exception: wrong refusal for [backface targets
  nonesuch]`, exit 1. Rule restored, `git diff engine/` empty,
  corpus 18/18, full suite 30/30 exit 0.
  `engine/world/document.js`, `engine/world/scene-field.js`,
  `boolean.test.js` unedited.
- Checks: `node boolean-corpus.test.js` → 18 checks, exit 0;
  `node tools/test.js` → 30/30, exit 0 (WSL node v22.23.2).
  Status: READY FOR REVIEW.

## MUSE-25 — Is the marcher telling the truth?

- Ground truth is an independent reference, never rayHit: fixed
  0.002 steps for the first sign change of field.distance, then
  60-iteration bisection (tmax 100; farthest real hit in the spread
  is 40.4). Six scenes built in the test: uncarved, doorway, carve
  fully inside, straddling carve, two overlapping carves, and a
  0.02 membrane. ~65 deterministic rays each: grid, tilted, grazing,
  void-origin, into-void.
- Worst per scene (printed by the test, ray attached):
  uncarved over 4e-15 (closed form exact); every carved scene closer
  6.56e-6 on the same grazing ray (origin [-3,0,1.5], 8.5° incidence
  — the 1e-6 stop threshold amplified by 1/sin, mechanism confirmed)
  and over exactly 0. Zero hallucinated hits anywhere.
- Thin membrane ray: truth 0.18, marched agrees to 3e-17. The
  membrane is a hit, not a step-over.
- FINDING, handed back: one ray per carved scene returns Infinity
  for a wall face at truth 40.4475. Replicated loop shows 256/256
  steps used, reaching t=40.4474 — the bound never steps past, the
  fixed 256-step budget runs out one step short (grazing run with
  steps capped by a near-parallel floor). Pinned in the test as an
  explicit KNOWN LIMITATION (fails if the budget changes, says to
  delete it then), not as correctness.
- Tolerances, all stated in the test with the measurement behind
  them: closer 1e-4 (15x over measured 6.56e-6), overshoot 1e-9
  (measured 0), uncarved 1e-12 (measured 4e-15). Both directions
  asserted separately; misses must agree.
- Fail-demo (hit threshold 1e-6 → 0.5 in working copy): 2 passed,
  7 failed, exit 1. Restored, `git diff engine/` empty, 9/9,
  full suite 31/31 exit 0. Nothing under `engine/` edited.
- Checks: `node march-truth.test.js` → 9 checks, 1 s wall, exit 0;
  `node tools/test.js` → 31/31, exit 0 (WSL node v22.23.2).
  Status: READY FOR REVIEW.

## MUSE-22 — The two blocked checks, on the fresh worker

- The user restarted the worker as asked: `LeoPC (win32)`, pid
  40688, uptime minutes at run time (heartbeat current). Report
  says so: yes, they did, and on Windows node as the lead
  suggested. No `no webgl2` recurrence — the dropout diagnosis
  (worker lost its GPU context) is confirmed by both rows going
  green on the fresh worker.
- `node tools/check-queue.js link-time` → exit 0, wall 30 s
  (worker 29.7 s). Driver ANGLE NVIDIA RTX 5070 Ti D3D11. Nine
  programs cold: hyperbolic link 10.1 s (lead's direct-Windows
  re-run gave 8.5 s median — same order, cold-cache variance, run 1
  slowest per MUSE-15), spherical 4.4, H2R 6.2, S2R 4.1, E3T 3.4,
  Nil/Sol/SL2R 0.2–0.3, lines 0.0. Full log `/tmp/muse22-link.log`.
- `node tools/check-queue.js play-check` (default: fight, 3000
  frames, seeds 1..3) → exit 0, wall 30 s (worker 29.8 s), real
  GPU cold. 10 face crossings total (5/2/3), nothing broke. Full
  log `/tmp/muse22-play.log`. (There is no runbook row for
  play-check, so no timing cell to update; link-time's cell now
  carries this figure.)
- All nine MUSE-20 families are now measured. No code changed;
  writes are this report, the link-time timing cell, and the task's
  status line. Status: READY FOR REVIEW.

## MUSE-23 — What a carve costs at query time

- New `tools/carve-bench.js` (docs built in code, not fixtures) and
  `docs/qa/carve-cost-2026-09.md` (both tables in full). WSL node
  v22.23.2. Warmup 5000 untimed calls, adaptive sizing to >= 250 ms,
  three timed runs (min/med/max). Step counts replicate rayHit's
  loop against public `distance()` with a counter; the bench throws
  on any replica disagreement (none observed). Nothing under
  `engine/` edited.
- Headline ratios to uncarved (median): `distance()` 0.21 / 0.44 /
  0.73 at 8 carves for 1 / 4 / 16 solids — roughly (S+K)/S, since
  each targeted carve evaluates once per query. `normal()` milder
  (0.33 / 0.59 / 0.75). `rayHit()` is a cliff not a slope: the
  first carve switches closed form to marching, 20-50x (0.02-0.05),
  further carves cost little. Mean march steps 96 / 43 / 23 (fall
  as rays terminate sooner; means include the budget-capped miss).
- No "too slow" verdict offered. Next configuration wanted:
  untargeted (global) carves, which evaluate against every solid
  instead of one, plus hit/miss-separated step means.
- Checks: `node tools/carve-bench.js` → exit 0 (full log
  `/tmp/muse23-bench.log`, scratch). Status: READY FOR REVIEW.

## MUSE-24 — One place where the numbers live

- New `docs/qa/measurements.md`: every factual number about the
  current tree, re-produced 2026-09-10, with the exact command, the
  host where it matters, and every live file:line quoting it.
  Yesterday's queue figures kept only where marked (sw-worlds,
  net/sdf/shader compile counts); everything else is fresh today,
  including worlds 346 (32 s, win32) and ball-lab 69 (2 s, win32).
- Two findings for the migration, not fixes: runbook:34 still says
  23 suites (true: 31) and the ball-lab row says 57 (true: 69 since
  the carve render); TODO:257-262's Sol/SL2R-era totals (16 suites,
  316 checks, 7 programs) are superseded (31 / 346 / 11). No
  swept document edited.
- Four rows have NO producing command — the structurally useful
  half: 70 transits/200 steps (no transit printer), lie-lab GPU
  sample counts (no per-case counter), the 0.01 s substep (constant
  not located; the audit's lie-labs.js:6 pointer lands on
  LAB_BOXES), link-inputs columns (scratch parser, never
  committed). A number no command produces is a number that WILL
  rot; each names what would have to exist.
- Line drawn in the doc: rows only for claims about the current
  tree a command can re-produce; dated QA logs stay as evidence
  (file list given, not per-line); math constants, host identity,
  example params, readout examples, anecdotes/hypotheticals,
  line pointers, archive/legacy, and design targets excluded with
  reasons. 41 project docs swept (node_modules excluded as
  third-party).
- Checks: no code changed, so no suite re-run for this task; the
  table's Node rows were each freshly executed above
  (test.js 31/31 at 9 s wall among them). Status: READY FOR REVIEW.

## MUSE-26 — A corpus for intersection

- Environment: `host-probe` pasted at session start (sandboxed WSL,
  Chrome dead both routes, win32 worker pid 40688 serving — not
  re-investigated per the queue). Baseline `node tools/test.js` at
  `d08307e` → 31/31 before edits.
- Rule inventory around `intersect`, read from the code: SIX rules.
  document.js: op on non-solids (shared), the three-valued op set,
  intersect-must-name-target (new), target scope (shared), self
  target (shared). scene-field.js: target-must-be-an-added-solid,
  now covering both modifier kinds. All six covered.
- New files: `intersect-corpus.test.js` (auto-discovered, no
  registration edit), 9 valid docs under `levels/fixtures/clip/` +
  manifest, 9 single-defect docs under `levels/fixtures/invalid/`
  (in neither the MUSE-13 nor the MUSE-21 manifest, for the same
  layer-split reason stated in both). The lead's 7 behavioral tests
  cover slab/scoping/walk/global/capability/give-up; this corpus
  covers refusal messages and clip-vs-carve geometries.
- Invalid, all message-checked with inputs byte-identical after
  refusal: global intersect (full WHY clause asserted, not just the
  refusal), op on spawn/anchor/objective, self-target, missing id,
  subtract target, intersect-on-intersect target (all three
  field-level: validation passes, compile refuses, split asserted),
  op `clip` misspelled (pins the three-valued message).
- Valid, each with bound/marched asserted: clip-room base;
  clipped-away (centre free); clip-noop (bitwise identical to base
  at 5 points); two-clips (centre exactly 0); clip+carve in both
  document orders (bitwise identical — max commutes); tangent clip
  (touch reads 0, neighbours and old centre open — an external
  tangent leaves one point); carve-face vs clip-face normals agree
  EXACTLY ([0,0,-1] both ways at the matched sphere point).
  Spot numbers probed before pinning (`/tmp/probe-clip.mjs`).
- Deliberately not cased: target on an add for intersects (same
  rule+message as MUSE-21's subtract case). One observation handed
  back, not fixed: the self-target refusal says "carve" even when
  the offender is an intersect or clip — shared message, stale
  noun. Wording is the lead's.
- Fail-demo (must-name-target neutralised): global intersect
  accepted, `Missing expected exception`, exit 1. Restored,
  `git diff engine/` empty, 16/16, full suite 32/32 exit 0.
  `document.js`, `scene-field.js`, `boolean.test.js`,
  `boolean-corpus.test.js` unedited.
- Checks: `node intersect-corpus.test.js` → 16 checks, exit 0;
  `node tools/test.js` → 32/32, exit 0 (WSL node v22.23.2).
  Status: READY FOR REVIEW.

## MUSE-27 — The modifier algebra, tested rather than asserted

- New `modifier-algebra.test.js` (scenes built in-test, no fixtures).
  Two added balls + ground; one global modifier vs the same modifier
  duplicated per solid (ground copy included — the decomposition must
  cover every added solid). 206 deterministic points per comparison:
  grid over both solids and the gap plus a ±0.07 band hugging the
  modifier boundary, where max is not exact. Distance AND normal.
- Each property as a sentence: global-subtract EQUALS targeted
  copies; global-intersect EQUALS targeted copies; carve-then-clip
  EQUALS clip-then-carve on one target; the same carve twice EQUALS
  once; a carve on A leaves B bitwise alone. All five CONFIRMED with
  worst deviation exactly 0.00e+0 on both distance and normal — not
  a near-miss with a tolerance, bitwise identity, seams included.
- Fail-demo (global applies to the first solid only, in working
  copy): exactly the 2 identity checks fail with concrete divergent
  points (e.g. -0.057 vs -0.004 on the neglected solid), order /
  idempotence / isolation still pass, exit 1. Restored, `git diff
  engine/` empty, 5/5, full suite 33/33 exit 0. Nothing under
  `engine/` edited.
- Checks: `node modifier-algebra.test.js` → 5 checks, exit 0;
  `node tools/test.js` → 33/33, exit 0 (WSL node v22.23.2).
  Status: READY FOR REVIEW.

## MUSE-28 — Walking on a bound

- New `walk-bound.test.js` (scenes built in-test). 13 scenes: exact
  boulder/wall/corner; bound doorway, clipped doorway,
  global carve, thin membrane, narrow gap, carved corner; 4 seeded
  scenes (mulberry32 seeds 11/22/33/44, printed in walk labels).
  3-4 walks each (traverses, grazes, fast corner traps), 400 steps
  at 1/60, probe radius 0.25. Every step asserts clearance ≥ -1e-3,
  stall runs ≤ 60, finite position. A sink prints seed, scene JSON,
  step and clearance and exits 1 immediately.
- N=60 (one second at 60 Hz): walks are built to keep moving and
  exact-field calibration never exceeds a run of 2, so a run past
  60 means stuck, not trapped. Genuine head-on traps are excluded
  by walk design — including the corner trap, which both fields
  slide out of.
- Verdict: NO SINK in 20,800 steps, all positions finite, max stall
  run 2 anywhere. Stall fraction exact 0.0014 vs bound 0.0006 at
  matched solid counts — noise scale, and in the unexpected
  direction: the feared excess stalling did not appear. Resting
  contact reports no stalls on either field (blocked sweeps return
  hit, not stalled); stalled means step-budget exhaustion only.
- Sensitivity is demonstrated, not asserted: a probe started inside
  geometry reads clearance -0.14 and trips the SINK branch on step
  0 (scratch probe, same check expression). The branch is live.
- Calibration note: two probe walks that started inside a wall
  solid sank as any solver must; both were walk-design errors
  (starts outside free space), fixed by moving the starts, not the
  solver. Thin-notch walks rest 0.075 short of the mouth with
  clearance exactly 0 — conservative, safe, static.
- Checks: `node walk-bound.test.js` → 13 scenes, 20800 steps,
  13 walk checks, exit 0; `node tools/test.js` → 34/34, exit 0
  (WSL node v22.23.2). Status: READY FOR REVIEW.
