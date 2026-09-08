# Muse task queue

Prepared handoffs, **not running jobs**. One task at a time. Initial scope is
deliberately small; architecture and math remain with Astra/Opus.

## MUSE-01 — User controls and menu QA

Status: READY | Owner: unclaimed | Reviewer: Astra or Opus

- Read: `MUSE.md`, shared rules, `README.md`, `levels/presets.js`, `app/menu.js`.
  Consult the relevant controls/options sections of `main.js` as needed.
- Allowed writes: `docs/qa/controls-review.md` and this task's status/report only.
- Check the displayed controls, preset labels, keyboard navigation and explanation
  of Fog off. Compare visible behavior with documentation; do not fix core code.
- At minimum cover Nil, dropper, Sol and SL2R. Report exact steps and expected/
  actual behavior. If no browser is available, label results static review only.
- Acceptance: concise actionable findings, no invented playtests, no claims that
  all geometries have full gameplay kits or cross-geometry portals.
- Verification: verify referenced files/controls exist; run UI checks only if
  your client can. Do not repeatedly run GPU/math suites for prose changes.

## MUSE-02 — Render-fixture usage guide

Status: READY after MUSE-01 review | Owner: unclaimed | Reviewer: Astra or Opus

- Read: `docs/rendering-contract.md`, `tools/render-fixture.js`,
  `levels/fixtures/render-regressions.json`.
- Allowed writes: `docs/qa/render-fixture-guide.md` and this task's status/report.
- Write a short guide to reproducing the three named views, output locations,
  what each catches, and why visual inspection does not prove numerical accuracy.
- If tools permit, run one existing fixture and report the command/result.
  Do not change fixture coordinates, shader code or acceptance tolerances.
- Acceptance: commands match the tool; distinguish software previews from real
  GPU checks, and image review from automated pixel comparisons.

## Lead-owned work — not delegated to Muse

- Nil exact-ray/math review and dropper surface-shading correctness.
- Numerical convergence/range policies, transported frames and multi-contact collision.
- Godot editable primitive and scene-data bridge; native networking evaluation.
- Mixed-geometry connections, topology changes and editor architecture.

Add further Muse tasks only after reviewing these two. Each needs an explicit
file boundary, acceptance criterion and reviewer; avoid a broad “finish UI” task.
