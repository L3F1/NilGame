# Read by task

Read shared working rules once. Select the actual task's row; read relevant
headings/ranges, not every linked document. Use rg -n '^#' to locate headings
and rg -n '<symbol>' to locate implementations. Follow another reference only
to resolve a specific uncertainty. Current code and newer contracts supersede
historical status claims.

| Task | Contract / safeguards | Starting implementation |
| --- | --- | --- |
| Next milestone | NEXT_SESSION.md; PLAN-curved-authoring.md relevant item | current status/log |
| Distance / CSG / rays | docs/rendering-contract.md; SUBSYSTEM_RULES.md Mathematical contracts | scene-field.js; e3-ray-intervals.js |
| S3 movement / camera / portals | REGION_MOTION_CONTRACT.md; SUBSYSTEM_RULES.md Mathematical contracts | metric-space.js; collision.js; walker.js; camera-frame.js; region-portal.js |
| Schema / construction / persistence | docs/scene-format.md; docs/architecture.md relevant boundary | document.js; region-world.js |
| Renderer | docs/rendering-contract.md; SUBSYSTEM_RULES.md Graphics and runtime traps / Required checks | affected shader and browser queue |
| Connected GPU preview | CONNECTED_GPU_PREVIEW.md; docs/qa/connected-gpu-preview-2026-09-11.md | engine/geometry/connected-shader.js; connected-renderer.js; app/connected-preview.js |
| Connected materials / lighting / AO | CONNECTED_APPEARANCE.md | engine/geometry/connected-material.js; app/connected-global-preview.js |
| Complete S3 coverage / full loop | GLOBAL_S3_CONTRACT.md | engine/geometry/spherical-cover.js; spherical-cover.test.js; global-s3-transport-truth.test.js |
| Saved global regions / E3-global-S3 connections | COVER_REGION_FORMAT.md; GLOBAL_S3_CONTRACT.md | engine/world/connected-cover-world.js; cover-region-document.js; connected-cover.test.js; global-portal-truth.test.js |
| Editor | docs/ball-lab.md relevant controls/transactions; scene-format for schema edits | app/ball-lab.js; tools/ball-lab.html |
| Arena geometry / gameplay | SUBSYSTEM_RULES.md math/checks; matching headings in legacy-agent-reference.md | geom.js, product.js, affected geometry/mode |
| Menu / switching | legacy-agent-reference.md: Modes take options away / Switching geometry | app/menu.js; main.js |
| Browser tooling | current host-probe verdict; COORDINATION.md instrument rule | affected tool and tests |
| Review / integration / delegation | COORDINATION.md; assigned MUSE_TASKS.md section only | changed diff and referenced tests |
| Docs / context maintenance | this router; affected source for status claims | no automatic math/archive read |
| Host migration | docs/what-this-is.md; docs/decisions/001-runtime-strategy.md; docs/host-capability-map.md | current parity evidence |

Kernel files above are under engine/world/ or engine/geometry/.
Select code checks from SUBSYSTEM_RULES.md's Required checks table.
Root *.test.js suites run automatically under node tools/test.js.

## Bound the session

- Use an outcome and stop condition: one contract/fix with its checks. A single
  request for four milestones can consume a session despite being one message.
- At a task boundary, start a new chat from NEXT_SESSION.md plus the relevant
  row, without pasting the entire conversation. Compaction is not a usage reset.
- Avoid repeated full-suite runs without new changes or unresolved failures.
  Keep successful output to summaries; inspect full logs on failure.
- Do not spawn internal agents just to read routine files. Give Muse/Claude
  bounded assignments through their existing clients, with allowed files and checks.
- Keep mathematical warnings behind this router rather than deleting them.
