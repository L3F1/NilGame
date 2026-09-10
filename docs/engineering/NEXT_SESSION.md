# Fresh-chat handoff for Astra

2026-09-10, inspected bb7c868. Check status/log before edits; current mouse/fixture
fix and Muse deliverables are uncommitted. Preserve shared work. User prefers
one difficult contract/fix from Astra, bounded implementation by Claude, Muse QA.

Latest review: docs/qa/astra-editor-input-2026-09-10.md.
- Oriented-room doorway blocked at y=1.44995: cutter depth .8 gave exactly 2r
  overhang. Changed depth to 1.1; both E3 doorway fixtures pass walk-through/back.
- Both editors now share arena-style mouse protection: pointer lock, 250ms
  acquisition settle, spike rejection, per-frame accumulation/cap, transition clears.
  Hardware-specific snapping remains subject to user retry; no real DPI device test.
- MUSE-42 accepted as scoped QA, archived. Reference sampler is not a proved
  lower bound; test-local certificate still needs production patch/scope validation.
- 59/59 Node suites, E3 browser 90, S3 browser 36, real GPU. Saved images inspected.
  Queue worker restarted (old 2672; replacement 38432) and accepts --region-lab.

Claude's pause/reset job is DONE and awaiting review:
docs/qa/claude-pause-input-2026-09-10.md.
- New app/motion-pause.js holds the host decision with no DOM in it, so Node and
  the page test one table. Pauses on ANY pendingLift (not resumable: no
  correction-resume API exists) and on unresolved (resumable, competing gate IDs
  named). NOT pauses: domain-exit, blocked-exit, stopped, and budget-exhausted
  with no debt -- each leaves a settled state and the next frame is a new request.
- region-lab: halt panel with Reset to region spawn and Resume as a new request;
  a halted session issues no further movement request at all. Resume does not
  respawn and does not replay refused time.
- Pointer-lock/spike lifecycle covered end to end in BOTH editors through the
  real handlers. document.pointerLockElement is shadowed for that block and
  restored; an OS mouse stream is still covered by nothing.
- 61/61 Node suites, S3 browser 65 (was 36), E3 browser 101 (was 90), real GPU
  through the queue worker 38432. Every mutation caught; three of Claude's own
  checks were found passing while lying and are written up in the report.
- MUSE-43 done and ACCEPTED: independent derivation of the pause table from the
  contract before opening the module. Verdict: the shipped table is the one the
  contract asks for. Two things came back. (a) A blocked-exit CAN carry an
  unpaid correction, and so can a domain-exit -- Claude's prose saying those
  statuses "leave a settled state" was wrong about three of four; the code was
  right because debt is checked first, and both comment and report now say so.
  (b) Debt-free budget exhaustion carries on only on condition of loud
  reporting and fresh-budget retries; that is now closed -- region-lab counts
  the run of consecutive refusals and shows it, and a check flies out through
  the chart edge for 24 frames asserting each is charged exactly its own dt.
- MUSE-44 still open: a sweep for any other site in the tree that feeds a
  refusal forward. Not started.

Next Astra job: review that host recovery behavior and user feedback on doorway/
snaps; then define curved gravity/support and correction resumption. Do not build
a second solver. Region renderer exists now: consult current code rather than
older missing-module reports. Clearances retain three outcomes; no universal
peel margin or automatic cross-geometry asset conversion. Nested-cutter
conservatism remains separate and open. Read TASK_ROUTER.md selectively.
