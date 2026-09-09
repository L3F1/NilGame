# Ball editor checklist — MUSE-07

Node steps executed on WSL Linux node in this session (exit codes in
overnight-results.md). Browser/Godot steps cite the lead's 2026-09-09
evidence in docs/ball-lab.md and were not re-run here; no Chrome retries.

## Node — executed

- `node ball-scene.test.js` — 18 document cases, immutability, round trip.
- `node tools/test.js` — full suite, no regressions.
- `node tools/scene-check.js levels/fixtures/ball-lab.nil.json` — fixture valid.

## Browser reference — lead evidence, not re-run

Serve the repo root as usual, then:

- Open `tools/ball-lab.html`; Apply edit updates preview and field.
- Undo/Redo restore the previous valid scene.
- Rejected edit (e.g. radius −1) retains the previous valid scene.
- Save JSON, reload via the file picker; Godot-saved files load here
  and vice versa. The original fixture is never overwritten.
- `node tools/page-check.js --ball-lab --timeout=60` — lead: 9 checks,
  real GPU, exit 0.

## Godot native — lead evidence, not re-run

- `node tools/ball-lab-export.js`; open `experiments/godot/project.godot`,
  open `ball_lab.tscn`, F6 (run current scene).
- Inspector edit/undo/redo; save (default `user://ball-lab.nil.json`,
  absolute paths accepted); Load is undoable; invalid loads/edits
  retain the previous valid scene.
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/ball-lab-check.ps1 -Godot 'C:\path\Godot_console.exe'`
  — lead: 10 checks incl. 80 CPU samples (worst 1.47e-7), RTX 5070 Ti.
- `node tools/scene-check.js experiments/godot/results/ball-lab/saved.nil.json`
- Inspect `experiments/godot/results/ball-lab/editor.png`; saves use
  scalar values at full precision (no Godot-vector rounding).

## Cross-host files

- Browser-saved and Godot-saved JSON each load on the other host.
- Fixture and native-saved JSON both pass scene-check (lead evidence).
- WebGL field/first-hit: 3,072 samples, worst 7.33e-7 vs 2e-5 tolerance
  (lead evidence; analytic E3 identities back it independently).
