# Shared working rules

Applies to GPT-6 Astra, Claude Opus 5 and Muse Spark 1.3. The user's current
instructions take precedence. Keep this file small; history belongs in references.

## Direction and boundaries

- Build a first-person connected-geometry engine/editor. Small levels validate it.
  Godot remains under evaluation; retain the browser reference until equivalent.
- Separate metric, topology, region, connection policy and host. Scene JSON v1
  currently runs in tools/tests; mixed-geometry traversal is not implemented.
- Root runtime: plain JS ES modules + WebGL2/GLSL, Node tests, no package manager.
  Do not add frameworks/dependencies without a task that authorizes them.
- Math, physics, mode rules and networking modules stay DOM-free. GPU and CPU
  scene fields share authored data. Change the data, not generated literals.
- Keep geometry IDs and preset order stable. Use `optVal` for effective options.
  Preserve menu input isolation, reset behavior and the visible boot-error panel.
- Do not overwrite another agent's edits. Check status/diff first; stage explicit
  files. Use separate worktrees for concurrent changes to overlapping files.
- Explain geometry/graphics plainly. The developer knows Java/AP CS, not GLSL.

## Mathematical contracts

- H3: `<x,y>=x0*y0+x1*y1+x2*y2-x3*y3`; origin `(0,0,0,1)`.
  Points and placements differ; matrices are column-major. Reorthonormalize drift.
- E3/H3/S3 share `geom.js`; products use `product.js`. Product height is affine:
  translate points, never directions. Use product composition, not mat4 multiply.
- Normals must use the selected metric when raising/projecting gradients.
  Never compare tangent vectors at different points without transport.
- Sol/SL2R poses are packed positions, not isometries. Their canonical camera
  frames are not parallel transported. Do not feed them H3 transforms.
- Nil exact flow carries its evolving direction when rebased. Its columns have
  exact intersections; beacon level sets are approximate and non-colliding.
- Distinguish distance bounds, ray hits and shading samples. A footprint hit may
  stop outside a surface: do not evaluate discontinuous materials at that offset.
- Floating-point cancellation limits range. CPU/GPU agreement is not proof;
  use independent identities, metric equations and convergence tests.
- H3 folds attached anchors/history by the SAME group element. Bound carried
  coordinates before precision is lost; do not silently choose another lift.
- Clamp quotient travel by distance along the ray to the face. Step past it and
  use an outside tolerance; reduce until inside and rebase at crossings.
- Plane gravity descends to the octagon quotient, not the closed 3D quotient.
  Respect each world's chosen field; do not enable H3 abilities elsewhere.

## Graphics and runtime traps

- Shader compile success is insufficient. ANGLE/D3D may compile a different
  executable on the first draw. Verify real rendering and report driver logs.
- Countable loops and repeated scene calls can explode compiler work. Keep
  programs geometry-specific; profile link time after level/shader complexity changes.
- Shader strings: no unescaped backticks; avoid reserved GLSL identifiers.
- First frame must have nonnegative dt, including after a cold shader build.
- Self-history is only valid where maintained; H3 and flat quotients currently.
- Checker/material patterns on quotients must be invariant under their gluing.
- Run GPU checks sequentially; concurrent Chrome runs distort timings and caches.

## Required checks (choose those affected)

| Change | Checks |
| --- | --- |
| JS geometry/physics/rules | Relevant root tests; `node tools/test.js` before integration |
| Shader | `node tools/shader-check.js`; real `node tools/page-check.js --worlds` |
| Distance fields / GLSL math | `node tools/sdf-check.js` |
| Marcher / scene complexity | `node tools/march-check.js`; `node tools/link-time.js` |
| Scene documents / charts | `node tools/scene-check.js`; foundation tests |
| Network / relay | `node tools/net-check.js` |
| Reported visual issue | Saved fixture before/after, plus relevant numerical checks |

Keep test summaries last and exits after them. Never claim unrun checks passed.
UI/copy-only changes need focused visual verification, not irrelevant math tests.

## Read deeper only where relevant

The complete former AGENTS/CLAUDE text is preserved byte-for-byte in
`docs/engineering/legacy-agent-reference.md`. Before modifying a listed subsystem,
search/read its relevant headings there, not the whole document:

- H3 math/physics: **The math**, **Height and gravity**, **The quotient**, **Carried objects**.
- Rendering: **Rendering gotchas**, **Gotchas**, plus `docs/rendering-contract.md`.
- Menu/switching: **Modes take options away**, **Switching geometry**.
- Products/flat/courses/kit: the matching **Traps in the archived subsystems** heading.
- Authoring: **Level authoring**, `docs/scene-format.md`, `docs/architecture.md`.

Current code, current task and newer focused documents supersede stale historical
status claims. Keep the warnings and rationale available; do not reload them all
for a documentation task.
