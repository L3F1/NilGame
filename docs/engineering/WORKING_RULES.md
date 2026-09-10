# Shared working rules

Applies to GPT-6 Astra, Claude Opus 5 and Muse Spark 1.3. The user's current
instructions take precedence. Keep this file small; history belongs in references.

## Direction and boundaries

- Build a first-person connected-geometry KERNEL and editor; small levels validate
  it. The kernel (metric, transport, distance fields, collision) is the part no
  host supplies; Godot is a candidate host, not a rival. See docs/what-this-is.md.
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

## Working with more than one agent

Added 2026-09-09 after a batch where each of these cost something real.

**Probe the host, do not diagnose it.** `node tools/host-probe.js` is the first
command of any session. It reports what this machine can do, checks its own
instruments before it checks anything else, and ends with a one-line verdict on
how to get browser checks here. Three separate sessions have rediscovered the
same block; one recorded the wrong reason, and the wrong reason then shaped a
queue of work for weeks. If the probe and your intuition disagree, the probe is
the evidence.

**A broken instrument reports a blocked capability.** `timeout(1)` is denied in
the sandboxed shell, and a probe that ran through it read EPERM on Chrome and
concluded WSL interop was blocked. Interop had never been tested. Before
believing a negative result, check the tool that produced it.

**Ship a check that fails without the change.** Acceptance is then one command
rather than a conversation, and the reviewer can re-run it instead of trusting
a report. Demonstrate the failure explicitly: break it in your own copy, paste
the failing output, restore, paste the passing output. "I verified it" is not
evidence, and a check that cannot fail is not a check.

**Measure, never cite.** Any number in a report or a document carries the
command that produced it and the host it ran on. One sweep found fourteen false
claims and nearly all were numbers that had been true once. If you are
repeating a figure from a document rather than running it, say so and mark it
unverified.

**Report defects, do not fix them out of scope.** A task that forbids touching
a file and then finds that file wrong has produced a finding, and the finding
is the deliverable. Some of the most valuable results here were handed back
unfixed.

**Split the work by shape, not by seniority.** If a task can be stated as *make
this check exist and make it fail without X* — corpora, sweeps, static
analysis, measurement, auditing claims against the tree — it belongs to the
bounded agent. If the hard part is deciding what the answer should BE —
contracts, formats, what a capability promises, what an error should say — it
belongs to the lead. An agent that finds itself designing rather than
measuring should stop and say so.

**Stage explicitly when the tree is shared.** `git add -A` in a checkout where
another agent has uncommitted work sweeps that work into your commit. It
happened in `e348791`, which carries a batch's report edits inside a commit
about booleans. Nothing was lost, but the history now says something untrue
about when that work happened. Check `git status` before staging, and name the
paths you mean.

**Keep the queue short.** `MUSE_TASKS.md` holds only OPEN work; closed
assignments and their verdicts live in `docs/qa/muse-log.md`. A queue file that
had grown to 977 lines was being read in full at the start of every session,
almost all of it history.
