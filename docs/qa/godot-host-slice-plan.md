# The smallest Godot slice worth building, and what would prove it

Claude, 2026-09-10. Assignment: item 2 of `docs/engineering/CLAUDE_NEXT.md`.

A plan, not an implementation. No math ported, no dependency added, no
migration started, and nothing under `experiments/godot/` was edited. Read
against `experiments/godot/ball_document.gd`, `ball_lab.gd`, the exporters in
`tools/`, and `docs/host-capability-map.md`.

**Unexecuted, and it has to be said first.** There is no Godot binary on this
host — `tools/godot-check.ps1` takes the executable path as a mandatory
parameter, supplied by whoever has one. Every claim below is from reading the
source. Nothing here has been run, and no number in it is a measurement.

## What the existing experiment actually is

`ball_lab.gd` is a better starting point than its scope suggests, because the
*discipline* is already right even though the *document* is v1:

- **Validate on a separate instance, then commit** (`_commit`, line 93): a
  fresh `Document` validates the candidate before the live one is replaced, so
  a rejected edit leaves the editor exactly as it was. That is the same rule as
  `install()` in `app/region-lab.js`, arrived at independently.
- **`UndoRedo` over whole documents** (lines 99-102), not over field deltas.
  Matches the browser editor's undo stack, and is the model that survives an
  edit which changes entity count.
- **The check runs the real callbacks** (`_check`, line 124): it sets
  `SpinBox.value`, which fires `value_changed`, which goes through `_edit`. It
  does not poke the adapter directly. That is the property that made the
  browser checks worth having.
- **A golden corpus already exists**: `tools/ball-lab-export.js` writes 80
  points with JS-computed distances, and the Godot side compares at 2e-6.

Two things in it are worth more than they look:

1. **`get_viewport().get_texture().get_image()` captures the whole Control,
   panel and all.** That closes an evidence gap the browser has: `toDataURL`
   returns the WebGL drawing buffer only, so the S3 editor cannot photograph
   its own DOM overlays — today's marker image is a traced diagram for exactly
   that reason (`docs/qa/claude-markers-2026-09-10.md`). A Godot host would
   screenshot the real editor.
2. **The id pattern is already identical.** `ball_document.gd` line 27 compiles
   `^[a-z][a-z0-9_-]*$`; `engine/world/document.js` line 22 tests the same
   expression. It is the one rule that transfers with no work at all.

## The gap to a version-2 S3 room, from the code

Not a list of missing features — a list of things that are the wrong *shape*.

| # | Where | What is wrong for v2 |
|---|---|---|
| 1 | `_fields`, line 9 | `value.size() != names.size()` means "exactly these keys, all present". The JS `fields()` means "no unknown keys", with requiredness enforced separately per kind. v2 entities have OPTIONAL `radius`, `halfExtent`, `frame`, `op`, `target`, `forward`, `up`, so this predicate cannot express them. **Adding names to the array does not fix it**; required and allowed have to become two different sets, as they are in JS. |
| 2 | `_valid`, line 34 | `source.version != 1` rejects every current document. |
| 3 | `_valid`, lines 39-41 | Exactly one region, exactly two entities, zero connections — all hardcoded counts. |
| 4 | `_valid`, line 46 | `region.geometry.kind != "e3"` rejects S3 outright. |
| 5 | `_valid`, line 51 | Kinds limited to `ball` and `spawn`, one of each. v2 needs `plane`, `geodesic-cell`, `anchor`, `objective`, and repeats. |
| 6 | `_valid`, line 63 | Bounds are `sqrt(x²+y²+z²) + clearance > extent` in the authored chart. In S3 the document check is `chart.decode(position)` and a domain test in the metric; the Euclidean norm of a chart triple is not the S3 distance from the chart origin. |
| 7 | `distance_to`, line 83 | A single-ball closed form. v2 needs the compiled field: MIN over groups of MAX within a group, carves as negated distance, great-sphere faces. This is **kernel, not adapter** — see "what stays ours". |
| 8 | `parameters()` / `edited()` | Both assume one ball and return a `Vector4`. v2 edits are patches merged into a named entity. |
| 9 | `error`, line 68 | One canned sentence. JS refusals name the path and the reason. |

Direction matters for #1: this predicate **over-rejects and never
over-accepts**, which is the safe way round. A native adapter that accepted
something the JS refuses would be the dangerous failure, and none of the gaps
above are of that kind. Worth preserving as a property, not just as an accident.

## The slice

**One version-2 S3 room, displayed in our own viewport, edited through native
controls.** `levels/fixtures/s3-room.nil.json` — it has an S3 region, a plane
floor, four `geodesic-cell` walls, a carve, a ball, a spawn and an objective,
which exercises every v2 shape above in one file.

Build, in this order:

1. **`region_document.gd`** — a v2 adapter. Required/allowed split, all seven
   entity kinds, `frame` orthonormality, `op`, S3 domain via the chart, and a
   refusal string that names the path. Structural validation only.
2. **A custom viewport** — `ColorRect` + `ShaderMaterial`, carrying
   `REGION_S3_GLSL` translated the way `tools/ball-lab-export.js` already
   translates `BALL_PREVIEW_GLSL`. **Not Godot's 3D viewport**, per the
   capability map: a curved room is not a scene tree of transforms.
3. **The inspector** — entity list plus the property fields, on
   `Tree`/`SpinBox`/`OptionButton`, driven through `UndoRedo` and `_commit` as
   `ball_lab.gd` already does.
4. **Save/load** — `FileAccess` first, matching the browser's JSON exactly.

**Out of this slice, deliberately**: all motion (`moveRegionProbe`, walking,
correction resumption), portals and connected sight, authoring markers, picking
and gizmos, and any Godot physics or `CharacterBody3D` whatsoever. The slice is
document → picture → edit → document. If that does not round-trip, nothing
built on top of it can.

## Parity checks

Each is an addition to the existing exporter pattern. **Deciding parity in JS
and asserting it in GDScript** is the shape: the reference computes, the host
compares, and neither reimplements the other's judgment.

1. **Document identity.** Load the fixture in both; re-serialise the Godot
   side and byte-compare against `world.document()`. Every id, `frame`,
   `halfExtent`, `op`, unit and extent survives. Then edit, undo, save, reload,
   and byte-compare again — a round trip that changes one float must change
   exactly that float.

2. **Refusal parity, and its direction.** A corpus of invalid documents (bad
   frame, non-orthonormal `frame`, duplicate id, unknown field, out-of-domain
   position, `geodesic-cell` in E3, `box` in S3, missing spawn) exported with
   the JS verdict for each. Both must refuse all of them — and the check should
   report **accepts-that-JS-refuses separately from refuses-that-JS-accepts**,
   because only the first is unsafe. Message text need not match; the decision
   must.

3. **Field parity.** A sample corpus through the authored room with
   `field.distance` and the winning owner id per point. Compare worst absolute
   difference and owner agreement, skipping `feature === 'seam'` samples, which
   `region-render.test.js` already establishes are ties the field itself does
   not claim to break. State the tolerance and why; both sides are float64 on
   the CPU, so exact agreement is the honest expectation, as it already is
   between the JS field and the packed scene (0.0 over 3388 samples).

4. **Shader parity.** Same uniforms, same resolution, compare images through
   `tools/godot-compare.js`, which already knows the two legitimate reasons two
   compilers disagree. Run both Godot backends: `gl_compatibility` and
   `forward_plus` are different compilers and a uniform-array limit may differ
   between them.

5. **Capacity, measured not assumed.** `REGION_RENDER_LIMITS` is 16 primitives
   / 72 planes / 12 groups against the **WebGL2 guarantee** of 224 fragment
   uniform vectors. Godot's limits are its own. Print what the host reports and
   refuse over-capacity scenes by name, exactly as `packRegionScene` does.

6. **The check harness stays.** `--ball-check` user args, a `report.json`, and
   a non-zero exit — the same contract `tools/page-check.js` has, so one runner
   can consume both.

## Native services worth reusing

| Service | Replaces | Note |
|---|---|---|
| `UndoRedo` | the editor's `undo`/`redo` arrays | already used, already document-level |
| `Tree`, `SpinBox`, `OptionButton`, `LineEdit` | the hand-built inspector | keeps the same one-transaction rule |
| `FileAccess` + `ProjectSettings.globalize_path` | Blob/`URL.createObjectURL` | a custom `Resource` later, for editor integration |
| `ShaderMaterial` + `ColorRect` | the full-screen triangle | the analogue is exact; the 3D viewport is not |
| `get_viewport().get_texture().get_image()` | `canvas.toDataURL` | **captures UI as well as the render** |
| `EditorPlugin` main screen / dock | the standalone HTML page | the eventual integration boundary |
| `Input.mouse_mode = MOUSE_MODE_CAPTURED` | pointer lock | see the trap below |
| export templates | serving a directory | packaging, later |

## Three specific traps, from this codebase

**The shader y-flip is already applied once.** `tools/ball-lab-export.js`
translates `gl_FragCoord.xy` into `(vec2(UV.x, 1.0-UV.y) * uRes)`. Any code
that inverts the shader's pixel→ray mapping — which is exactly what the new
authoring-marker projection does, and what picking will do — must invert the
**translated** convention, not the GLSL one. Porting
`projectMarker` unchanged flips y twice and lands markers mirrored about the
horizon, which looks plausible in a small room. `marker-projection.test.js`
pins the browser convention; the Godot side needs its own pin, against the
translated source.

**Pointer lock is not `MOUSE_MODE_CAPTURED` with a rename.** `app/mouse-look.js`
carries a 250 ms acquisition settle, a 250 px/axis spike rejection, one
accumulation per frame and a 0.6 rad/axis cap, and each exists because of a
real reported symptom. Godot delivers relative motion through a different path
with different warm-up behaviour. Port the policy AND its checks, and treat the
constants as re-measurable rather than given.

**`document.js` is the authority and must not be forked.** Two validators
drifting apart is a scene that loads in one host and not the other, which is
the worst bug in this list because it appears as data corruption. The refusal
corpus in check 2 is the guard, and it is worth running in CI on both sides
from the first commit of the adapter.

## What stays ours regardless of host

The metric spaces, the compiled field and its Boolean composition, the motion
coordinator, camera transport and holonomy, correction resumption and its
continuation authority, clearance semantics, and the refusal vocabulary
(`domain-exit`, `blocked-exit`, `unresolved`, `stale-continuation`). Neither
engine's character controller is a metric-aware walker, and a curved connection's
ownership cannot be delegated to a scene tree.

Keep the browser runnable throughout. It is the executable reference the
parity checks compare against, and a host experiment that breaks it has removed
the thing that would have told it it was wrong.

## What I could not determine

- **Anything requiring execution.** No Godot here, so no frame times, no
  uniform limits, no shader-link behaviour, no confirmation that the translated
  `REGION_S3_GLSL` compiles at all. The capability map's item 4 — cold
  preparation, frame-time distributions, input behaviour at identical
  resolution and hardware — remains entirely open, and the historical H3
  shader-link numbers in the archive are not evidence for today's smaller S3
  shader.
- **Whether `experiments/godot/results/` reflects the current tree.** Those
  PNGs and logs predate the region work; I read the sources, not the artefacts,
  and did not rerun anything.
- **Whether `godot-compare.js`'s tolerances suit the S3 editor shader.** They
  were tuned against the H3 dodecahedral scene, whose two failure modes
  (grazing-incidence normal bail-out, sub-pixel copies) the S3 room may not
  have at all. Re-derive rather than inherit.
