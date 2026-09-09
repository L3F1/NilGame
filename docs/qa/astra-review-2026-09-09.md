# Lead review and host recovery — 2026-09-09

Reviewed on Windows/PowerShell, Node v24.20.0, branch `main`, HEAD `b9b42e7`
plus the uncommitted Muse/lead working tree. No staging, commit, merge or push.
`.codex/` was not changed. Earlier Muse/user executions remain separately
attributed in overnight-results.md.

## Browser diagnosis correction

The Windows failure was reproducible as exit 21, Chrome's PROFILE_IN_USE.
Read-only process inspection found an old headless test process holding the
fixed `pagecheck-gpu` profile. A fresh-profile preview worked on the same host.
The old cold-start path silently ignored profile deletion failures and reused
that possibly live directory. This is a runner defect; the evidence does not
establish antivirus/endpoint protection as the cause. Chromium's
[exit-code definitions](https://raw.githubusercontent.com/chromium/chromium/main/tools/metrics/histograms/metadata/stability/enums.xml)
identify code 21.

The lead added unique cold profiles and leased warm profiles published only
after successful Windows cleanup. No browser/security settings were changed;
no old or personal browser process was killed. Fixed server cleanup when
browser discovery/launch throws, recognized signal exits, bounded taskkill,
and rejected timer values that overflow Node's timeout range.

Windows real-GPU cold run: 331 checks, 28.9 s, clean report and cleanup.
After F4, warm run: 346 checks, 2.2 s. Successful-report confirmation is closed
on Windows. Muse's separate WSL socketpair permission failure is not repaired
by these repository changes. No more installation or PowerShell diagnosis loops
are needed for this Windows failure.

## Verdicts

- **MUSE-02 accepted.** Revised commands, viewport limits and injected-probe
  explanation match the tools. Lead ran `node tools/render-fixture.js
  nil-close-column`, exit 0, and inspected `nil-close-column.png`. The nearby
  silhouette is clean. The other two fixture names/commands were checked in
  source, not rerendered during this review.
- **MUSE-03 accepted.** Controls/fog facts and accessible hint checked in code;
  current world probe passes. Lead inspected `menu-fog-desktop.png` (1200x900)
  and `menu-fog-narrow.png` (500x844), with settings expanded and scrolled to
  Fog. Hint wraps and remains readable. A requested 390-pixel headless window
  cropped a wider layout; it is not evidence of the 390px media query. True
  phone-viewport emulation remains unverified.
- **MUSE-04 accepted.** Per-target reset/focus and full preset order are now
  meaningful. Lead temporarily restored only the old guard: strengthened
  real-GPU probe failed at `Digit9 from button selects street` (318 preceding
  checks, exit 1). Restored the fix: 346/346, exit 0. Select and summary each
  start away from the target preset and assert actual focus. Synthetic events
  do not claim physical keyboard timing or native arrow behavior.
- **MUSE-05 accepted as a baseline inventory.** Corrected ORBS/test-consumer
  trace is useful and accurate for its reviewed baseline. The new ball lab
  now fills some of those gaps; docs/ball-lab.md describes current coverage.
- **MUSE-06 Windows path verified; POSIX changes requested.** Windows successful
  report/cleanup and prompt failures work. Node lifecycle/profile suite passes
  19/19. POSIX currently only signals the parent and does not await exit or
  establish child-tree cleanup. Do not call that cross-platform tree cleanup.
  Warm cache publication is disabled there pending its bounded revision.

## Lead implementation checks

F4: Sol/SL2R K preserves raw options, restarts at the correct spawn and heading,
and cannot create an H3 course/run. Direct course construction rejects an
unsupported world. Supported Nil/dropper/hoop restart controls still pass.

`node tools/test.js`: 20/20 suites. `node tools/shader-check.js`: all 10
programs compile/link, including the editable ball. `node tools/sdf-check.js`:
all 21 cases pass, including 3,072 scene-ball field/first-hit samples.
`node tools/page-check.js --ball-lab --timeout=60`: 9 checks, real GPU.
Godot 4.7.2 Compatibility / RTX 5070 Ti: native ball editor 10 checks; rendered
image inspected. Both fixture and native-saved JSON pass scene-check.
See docs/ball-lab.md for commands and limits. First native save/load check
exposed rounding through host vectors/default JSON formatting; authored scalars
and full-precision serialization fixed it without weakening assertions.
