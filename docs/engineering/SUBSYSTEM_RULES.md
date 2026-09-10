# Subsystem safeguards

Read only the heading relevant to the task, selected by TASK_ROUTER.md.
These rules were extracted unchanged from shared working rules on 2026-09-10.

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
| Gameplay / input / carried objects | `node tools/play-check.js` (seeded sustained play; `--switch` for world changes) |
| Distance fields / GLSL math | `node tools/sdf-check.js` |
| Marcher / scene complexity | `node tools/march-check.js`; `node tools/link-time.js` |
| Scene documents / charts | `node tools/scene-check.js`; foundation tests |
| Network / relay | `node tools/net-check.js` |
| Reported visual issue | Saved fixture before/after, plus relevant numerical checks |

`page-check --worlds` proves each world STARTS; `play-check` proves one
SURVIVES BEING PLAYED. A bug needing a face crossing, a carried object and an
ability to coincide is invisible to the first. A play-check run reporting zero
face crossings has not exercised the fold path and is not evidence.

Keep test summaries last and exits after them. Never claim unrun checks passed.
UI/copy-only changes need focused visual verification, not irrelevant math tests.

