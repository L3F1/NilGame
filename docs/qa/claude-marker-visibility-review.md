# Marker visibility: clear, occluded, or honestly unknown

Claude, 2026-09-10. Assignment: `docs/engineering/CLAUDE_NEXT.md`, following the
Claude review section of `docs/qa/astra-muse47-49-review-2026-09-10.md`.

Base 3207536. Host LeoPC (win32), Node v24.20.0. `node tools/host-probe.js`:
Chrome starts, browser checks run directly here, queue worker pid 38432 — every
browser number below went through the queue on a real RTX 5070 Ti / ANGLE D3D11.

Written: `app/region-lab.js`, `tools/region-lab.html`,
`marker-projection.test.js`, this file. No kernel, schema or renderer-primitive
change. Muse's uncommitted MUSE-48/49 suites are present in the tree, run in
the full suite, and are **not** staged here.

## What was wrong

Astra found two, and reading the field's own contract turns up a third thing
the original could not have done at all.

1. **A small positive bound was read as a surface.** `field.capabilities`
   declares `distance: 'bound'`, and in this room `exteriorDistance` is
   `'bound'` too, because carves and geodesic cells make the composition
   inexact. Every value is a conservative LOWER bound. So a small positive
   number means "I could not prove much clearance here" — a failure to prove
   clearance, not a proof of solid. The old query returned `true` (occluded)
   for anything under 1e-3.

2. **Exhaustion was reported as clear.** The loop ran 48 iterations and
   returned `false`. Running out of steps and seeing nothing is not seeing
   nothing.

3. **The march began 0.05 past the eye**, so an occluder thinner than that and
   close to the camera was stepped over and the marker showed through it.

And the one that follows from the contract: **a safe-advance march can never
certify occlusion at all.** Advancing by a conservative bound converges onto a
surface and never crosses it, so it never samples an interior. Occlusion needs
something the old shape did not have.

## What it is now

`markerVisibility` returns `clear`, `occluded` or `unknown`, each with a reason.

- **Starts at the eye.** No skip.
- **Advances by exactly the sampled bound**, never a floor. A bound is a radius
  proved free, so the union of those balls covers the segment — and covering
  the whole range is the only thing that certifies **clear**.
- **A strictly negative sample certifies occupancy**, and only because the
  field says so: `interior: 'sign-with-conservative-magnitude'` promises the
  sign inside a solid and nothing about the magnitude. The query **reads that
  capability at runtime** and answers `unknown` without it.
- **Occlusion is found by an explicit probe past a stall**, at 4/16/64/256
  skins. Where to probe is a guess; what a negative sample proves is not. If no
  probe comes back negative, the answer stays `unknown`.
- **Probes never run at or past the target.** A solid behind a marker does not
  occlude it — an objective placed flush on a floor would otherwise be reported
  as hidden behind the floor it is sitting on.
- **Everything else is unknown**: a bound too small to advance on, a domain
  exit, a non-finite sample, an exhausted budget.

**Every marker stays selectable in every state.** An uncertain one is amber,
dotted, glyphed `?`, labelled *visibility unknown* in its accessible name, and
carries its reason on the list row — because "unknown" without a reason is a
shrug, and an author deciding whether to move an objective needs to know
whether the query ran out of steps or ran into a bound it could not advance on.

This is an editor hint and says so. It does not import the connected-sight
reference and makes no claim about S3 surface intersection.

## Evidence

| check | result |
|---|---|
| `node tools/test.js` | **70/70 suites**, exit 0 |
| `node marker-projection.test.js` | **6/6** (4 before) |
| `node tools/check-queue.js page-check --region-lab` | **129 checks** (113 before), no page error, no boot panel |
| `node tools/check-queue.js page-check --ball-lab` | 101 checks — the flat editor is untouched |
| `git diff --check` | clean |

The 70 includes Muse's uncommitted `invariant-evidence.test.js` and
`connected-sight-truth.test.js`, which I ran and did not touch.

Pinned in the browser, each in a real scene edited through `install`:

- **A thin occluder at the eye is found.** A slab 0.024 thick, 0.010 away — the
  whole of it inside the 0.05 the old query skipped. Occluded. Remove the slab
  and the same sightline is clear, so the check is about the slab and not the
  viewpoint.
- **A tiny positive bound is unknown, never occluded.** An objective flush on
  the floor: at the default budget the shallow approach exhausts; with a budget
  of 4000 it gets further and stalls on a bound of **9.7e-5**. Raising the
  budget moves the reason and does not turn either into a claim.
- **Exhaustion is unknown.** One step cannot cover the room, and the row says
  so rather than implying it looked.
- **An uncertain marker is styled as uncertain** — `unknown`, not `occluded` —
  **and is still selectable**, and clicking it still selects through the entity
  dropdown's own transaction.
- **Occluded keeps its certificate**: the objective moved behind the far wall,
  found by an interior sample, and undo returns it to clear.

### Mutation matrix, browser

| mutation | stopped by |
|---|---|
| a small positive bound read as occlusion *(the original defect)* | with room to reach it, a tiny POSITIVE bound is still unknown, never occluded |
| exhaustion reported as clear *(the original defect)* | a marker resting ON a surface is UNKNOWN, not declared hidden by it |
| the march starts past the eye again | A THIN OCCLUDER AT THE EYE IS FOUND, not stepped over |
| probes run past the target | with room to reach it, a tiny POSITIVE bound is still unknown, never occluded |
| unknown styled as occluded | an uncertain marker is styled as uncertain, not as a solid claim |

### Mutation matrix, Node

| mutation | stopped by |
|---|---|
| the advance is floored instead of the sampled bound | the march advances by the bound it sampled, never by a floor |
| the interior sign contract is assumed rather than read | occlusion is certified by a contract the field still declares |
| the field stops declaring an interior sign | occlusion is certified by a contract the field still declares |
| a small positive bound certifies occlusion | occlusion is certified by a contract the field still declares |

## Two mutations the browser could not catch, and why

Both survived every browser check and are pinned at the source instead. Naming
them is the point; a pin nobody explains is a pin nobody re-reads.

**The floored advance.** Replacing `travelled += here.gap` with
`Math.max(here.gap, 1e-3)` breaks the invariant that licenses the word
"clear" — an advance longer than the proved-free radius could jump a solid
thinner than the overshoot. It changes **nothing observable**, because the
stall probes reach 4 to 256 skins ahead (up to 2.56e-2) and that range strictly
contains the 9e-4 an overshoot could hide. I tried: slabs of 4e-4, 6e-4, 1.2e-3,
3e-3 and 2.4e-2 were all reported occluded by both versions. The probes mask
it. The invariant still has to hold, so it is asserted against the source.

**The assumed sign contract.** Hardcoding `signCertifies = true` passes
everything, because no field in the tree declares anything other than
`sign-with-conservative-magnitude`. The runtime fallback is correct and
currently unreachable. Pinning the declaration in `region-world.js` is what
makes the fallback mean something: change the contract and the test fails,
pointing at the marker code that depends on it.

## Images — diagrams, not screenshots

Three, one per state, all inspected. **Each is a TRACE and the filename says
`diagram` for that reason.** `canvas.toDataURL` returns the WebGL drawing
buffer and cannot contain DOM, so a screenshot of this editor shows the room
with no badges at all. The page draws the frame into a 2D canvas and then
traces each badge at the rectangle `getBoundingClientRect` reports it actually
occupies: **the positions are the browser's, the font and corners are mine.**
A projection or state error puts the box in the wrong place here exactly as it
would on screen.

- `page-check-shot-s3-markers-diagram-clear.png` — `◎ s-goal · 6.101` in the
  doorway opening, dashed, full opacity.
- `page-check-shot-s3-markers-diagram-occluded.png` — `◍ s-goal · 6.533` on
  the far wall right of the door, dotted and visibly faded. Taken from the
  behind-the-wall case rather than the thin-slab one: pressed against a slab
  0.010 away the entire frame is that slab, which proves the query and shows
  the reader nothing.
- `page-check-shot-s3-markers-diagram-unknown.png` — `? s-goal · 6.107` amber
  and dotted at floor level, the objective resting on the floor.

## Limitations

1. **No cost measurement, and none invented.** The query is a CPU march per
   marker per redraw, bounded at 96 steps plus up to four probes, and it does
   not run while playing. I did not time it and there is no GPU number
   attached to it, because it is not GPU work.

2. **The two source pins are source pins.** They cannot see a rewrite that
   preserves the text and changes the meaning. They are the strongest available
   check for two properties that are behaviourally invisible here, not a
   substitute for a behavioural one.

3. **`unknown` is now common, and that is the honest outcome.** A shallow
   approach to a floor exhausts a 96-step budget in this room. Raising the
   budget is a tuning decision with a cost, and I have not made it — the
   default stays 96 and the reason is on the row.

4. **Nothing here says anything about S3 surface intersection.** The probe
   certifies a point is inside a solid; it does not locate a surface, and it is
   not evidence toward the certified intersection contract Astra owns.

5. Untouched and still open: renderer capacity caps, `connected-lab.nil.json`
   not compiling, nested-cutter conservatism, connected GPU rendering.
