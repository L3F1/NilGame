# MUSE-01 first review (historical)

Baseline: main at b9b42e7. These were the rev 1 change requests and checks.
Rev 2 has since been accepted; see MUSE_TASKS.md for the current verdict.

### Astra review verdict

F1 and F3 identify real inconsistencies. F2 identifies a missing menu explanation,
but its proposed Nil explanation is stale. F4 is now a confirmed runtime defect;
F5's assumption of an unconditional normal default is false. Revise the report
only, then mark MUSE-01 ready for review again. Do not fix application code.

Required corrections:

1. **F1:** distinguish advertised 1-8 shortcuts, the handler's 1-9 path, and
   the focused-control guard that swallows Digit9 (`main.js:1307-1308,1325-1328`).
   A footer saying 1-9 requires a corresponding handler fix; do not present it
   as a copy-only correction. Presets 10-13 currently need card activation.
2. **F2 / Nil controls:** `engine/geometry/nil-renderer.js:20,29` limits beacon
   marching to 70 and analytic column hits to 4096; the generic `uMaxT` upload
   does not define the new Nil renderer's column range. The climb rises 60,
   not 70 units. Fog off removes fog, not these guards. Existing technical
   documentation explains this in `docs/rendering-contract.md`; narrow the
   missing-help finding to player-facing menu/controls documentation. Include
   Space/Shift flight controls (`main.js:1958-1974`), not just WASD/mouse/R/K.
   Also distinguish native select arrow behavior from the legacy `optSel`
   branch; that branch does not retune whichever DOM option is focused.
3. **F4:** replace the open question with the executable findings below. Course
   off does not prevent `beginRun()` from executing. This needs lead-owned
   runtime follow-up, not just a status note or a claim that no run starts.
4. **F5:** presets preserve unspecified settings (`main.js:1200-1240`), rather
   than resetting them to defaults. Close the normal-default hypothesis with
   the transition checks below. An aesthetic preference for a fixed lab fog
   setting is a separate optional design proposal, not a verified omission.

Checks and evidence:

- Spot-checked all five findings against `app/menu.js`, `levels/presets.js`,
  `main.js`, `docs/playground.md`, the Nil renderer and rendering contract.
- Ran the existing `tools/preview.js` in `MODE=dom`, with a review-only injected
  probe, on Windows Node v24.20.0 / headless Chrome / SwiftShader. It exercised
  the actual application key listener and read effective settings plus menu
  select values. Final output: `FRAMES_DONE`, `error: (none)`. No tests changed.
  This is a bundled executable check, not a manual Brave/localhost:8000 test or
  a real-driver visual assessment. Browser discovery exposed no connected tabs.
- **K, both labs:** offset position from spawn to `[-0.95,-1.2,0]` and yaw to
  `0.95`, then dispatch KeyK. Position resets to `[-1.2,-1.2,0]`; yaw becomes
  `0` (normal spawn yaw is `0.7`). Raw course becomes `hoops`, effective course
  stays `off`, and `run.phase` becomes RUNNING with six hoops. The fallback in
  `buildCourse()` (`main.js:2031-2036`) and unconditional `beginRun()` path
  (`main.js:1367-1374,2089-2113`) explain the hidden H3 course state. No playable
  lab course is enabled. F4's behavior question is resolved; its defect is open.
- **Fog, both labs:** explicit normal remains normal; Nil -> lab preserves off;
  dropper -> lab preserves thin. Effective values and the Fog select agree.
  The four off/thin transition checks asserted that preservation in the probe.
- Muse's earlier `/tmp/muse01-probe.py` 27/27 result is reported by Muse, not
  independently reproduced or credited as a reviewer-run check.
- At review start the queue change was UNSTAGED, despite the handoff describing
  it as staged; the report and `.codex/` were untracked. `.codex/` predated this
  review and was left untouched. No files were staged, committed or merged.
