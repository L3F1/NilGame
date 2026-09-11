# Authoring markers: visible, selectable, and not geometry

Claude, 2026-09-10. Assignment: item 1 of `docs/engineering/CLAUDE_NEXT.md`,
under `NEXT_CAPABILITIES.md` section 4.

Base 9c10f9e. Host LeoPC (win32), Node v24.20.0. `node tools/host-probe.js`:
Chrome starts, browser checks run directly here, queue worker pid 38432 — every
browser number below went through the queue on a real RTX 5070 Ti / ANGLE D3D11.

Written: `app/region-lab.js`, `tools/region-lab.html`,
`marker-projection.test.js`, this file. Nothing else — no kernel, schema,
geometry or shader edit, and no new app module. Muse's work untouched.

## What a marker is here

A spawn and an objective are authoring facts. They are in no distance field,
they occlude nothing, and section 4 reserves the fragment uniform budget for
geometry — so they are drawn **over** the viewport as DOM badges, never as
primitives.

Each on-screen marker is a dashed translucent badge carrying the entity id and
its **intrinsic** distance. Every marker, on screen or not, also gets a
selectable list row with the same distance and a reason when it has no badge:
`behind the camera`, `off screen`, `antipodal`, `at the camera`. That list is
the fallback section 4 allows, and it is also what keeps an objective reachable
when it is behind you.

A marker with a solid in the way is **dimmed and dotted and labelled "behind
geometry"** rather than hidden. An author still needs to find it; what it must
never do is sit there looking like a solid drawn in front of the wall.

Both the badges and the panel **disappear while you play**, in either
locomotion mode.

**Selection reuses the entity dropdown's transaction and adds no second path**:
a marker click sets `$('entities').value` and dispatches its change event. The
property form, undo, redo and save are the ones that were already there — an
objective is moved by typing a position and pressing Apply, exactly like a ball.

**Persistence the form cannot reach is said out loud.** `editRegionEntity`
merges, so unpatched fields survive an edit untouched — but an author who
cannot see a field has no way to tell "preserved" from "dropped". The inspector
now names them: *"Preserved but not editable here: op. An edit merges, so these
are written back unchanged."*

## The load-bearing bit: a marker must land on the pixel whose ray points at it

The badge position is the exact inverse of the two lines the fragment shader
uses to turn a pixel into a ray:

```glsl
vec2 uv  = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
vec4 dir = normalize(uFwd * uFocal + uRight * uv.x + uUp * uv.y);
```

Derived any other way — a field of view read off the HTML, a hand-rolled
projection matrix — the badge is nearly right and drifts with the aspect ratio,
which is worse than no badge at all. `logAt` throws at the antipode, where no
shortest geodesic is unique; that is a real ambiguity and it falls back to the
list rather than being papered over.

## Evidence

| check | result |
|---|---|
| `node tools/test.js` | **67/67 suites**, exit 0 (66 before, plus `marker-projection`) |
| `node marker-projection.test.js` | 4/4 |
| `node tools/check-queue.js page-check --region-lab` | **113 checks** (88 before), no page error, no boot panel |
| `node tools/check-queue.js page-check --ball-lab` | 101 checks — the flat editor is untouched |
| `git diff --check` | clean |

Checked through the actual handlers: both markers listed with distances;
neither present in `packRegionScene` nor in `world.renderData()`; a click
selects through the dropdown and is not an edit; the objective moved by the
property form and the marker follows; undo restores it exactly; a save/reload
round trip keeps both with their fields; the unsupported-field note appears for
a carve and stays silent for the objective; hidden and gone in both `fly` and
`walk`, back when play stops.

**The projection round trip is exact.** The badge pixel is rebuilt into a ray
the way the shader would, and it equals the direction that was projected to
better than **1e-12**. Marching that same ray arrives at the ball.

### Mutation matrix, browser (each applied, run through the queue, reverted)

| mutation | stopped by |
|---|---|
| the CSS y flip is dropped | AND THE PIXEL REBUILDS THE EXACT DIRECTION IT WAS PROJECTED FROM |
| the aspect term uses width instead of height | AND THE PIXEL REBUILDS THE EXACT DIRECTION IT WAS PROJECTED FROM |
| occlusion never reported | and the SAME objective moved behind the far wall is |
| everything reported occluded | the objective down the OPEN DOORWAY is not reported as occluded |
| markers stay up while playing | authoring markers are hidden while flying |
| markers select outside the entity transaction | clicking a marker selects it through the existing entity path |
| unsupported fields not reported | a field the inspector cannot edit is named as preserved |
| the off-screen fallback drops the row | every one of them has a list row carrying an intrinsic distance |

### Mutation matrix, Node

| mutation | stopped by |
|---|---|
| the shader's aspect convention changes under the marker | the shader still turns a pixel into a ray the way the marker assumes |
| the shader swaps right and up | the shader still turns a pixel into a ray the way the marker assumes |
| the marker drops the CSS y flip | and the marker code still inverts that exact pair |
| a marker kind leaks into the shader module | a marker is never a scene primitive |

## Two things I got wrong

**I assumed the objective was behind the wall.** The check asserting it was
reported as occluded failed, correctly: `s-goal` sits straight down the open
doorway and is genuinely visible. The check is now the **pair** — visible down
the doorway, occluded when moved sideways behind the wall, visible again after
undo — which is strictly stronger, because asserting either half alone would
pass on a marker that reported every entity the same way.

**"It hit the right solid" was not a real round trip.** The projection check
first marched the rebuilt ray and required it to arrive at the ball. A mutation
using the wrong aspect term — a 20% horizontal error — still landed inside a
ball that large, and passed. The check now requires the rebuilt direction to
EQUAL the projected one to 1e-12, and keeps the march as the end-to-end
statement rather than as the proof.

## The image, and what it is

`page-check-shot-s3-authoring-markers.png`, inspected: the room from the spawn,
and the badge `◎ s-goal · 6.101` sitting inside the doorway opening at floor
level — which is where the objective is, 6.1 away through the open door. The
dashed border reads as an aid rather than a solid. `s-start` has no badge
because the player is standing on it; its list row reads *at the camera*.

**That image is a TRACE, not a pixel capture of the page.** `canvas.toDataURL`
returns the WebGL drawing buffer and nothing else, so a screenshot of this
editor shows the room with no badges on it at all — an image that cannot show
the feature it is evidence for. `page-check.js` only accepts data URLs the page
hands it, and it is not in this assignment's allowed writes, so a real page
screenshot was not available. Instead the page draws the frame into a 2D canvas
and traces each marker at the rectangle `getBoundingClientRect` reports it
actually occupies. **The positions are the browser's; the font and the corners
are mine.** A projection error puts the box in the wrong place here exactly as
it would on screen.

## Findings — reported, not fixed

1. **A real page screenshot would be better than a trace**, and it is one flag
   away: `page-check.js` launches `--headless=new` and could pass
   `--screenshot` alongside `--dump-dom`. That file is outside this
   assignment's allowed writes. Until then, any editor feature that lives in
   DOM rather than in the canvas has this same evidence gap.

2. **Occlusion is a CPU sphere trace per marker per draw**, capped at 48 steps
   and only run while not playing. With two markers that is nothing; it is
   linear in marker count and would want revisiting if a scene had dozens.

3. **The marker layer is `pointer-events: none` with `auto` on each badge**, so
   a click on the view still reaches the canvas and still requests pointer
   lock. Badges are hidden during play, so they cannot intercept anything then.

4. **No objective gameplay was added**, as instructed: an objective is an
   authored position with a marker, and what it does in a running game is a
   separate decision.

5. Untouched and still open: renderer capacity caps,
   `connected-lab.nil.json` not compiling, nested-cutter conservatism, and the
   unresolved S3 surface candidates in `region-sight.js` — which this work does
   not read, colour or enable.
