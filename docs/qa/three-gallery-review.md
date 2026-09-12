# Three-geometry navigation landmarks, 2026-09-12

Base5a251a4. The visible experimental preset now opens
levels/fixtures/connected-three-geometries-gallery.nil.json. Its original sparse
fixture remains unchanged for numerical corpora. No shader or geometry query
changes were made and diagnostic refusals remain visible.

The authored variant adds eight solid radius0.4 balls: a pair beside each of the
four portal endpoints, plus one radius0.6 return landmark in E3. Marker centers
are 1.8 physical author units off the aperture center in its face directions.
These are saved, editable objects, not screen-space decorations. The north-S3
spawn is close enough that naive marker placement at1.5 would be unsafe; the
chosen placement is validated by the existing spawn compiler and route check.
The scene uses14 of the16 supported primitive slots; large additional object
sets will still be refused by the renderer's capacity check.

`node three-gallery.test.js` flies flat/sphere/hyperbolic and back, checking
positive sampled player clearance along the actual motion path. Its final
center ray must hit flat-return-landmark. Removing that landmark temporarily
produces unresolved instead of hit and exits1; restored fixture passes. This
tests the visual destination as well as unobstructed movement; sampled clearance
is not a new theorem about continuous collision.

On LeoPC/Windows/Node24.20.0:

- `node tools/check-queue.js page-check --three-geometry`:6 passed, RTX5070Ti
  via ANGLE D3D11, cold compilation/ready about14.7s.
- Same command with `--sw`:6 passed, SwiftShader, ready about638ms.
- These browser checks exercise actual bidirectional motion, H3 form edit and
  image change, GPU hit agreement, undo/redo, download/file-input load and atomic
  refusal. Ready times are not frame-time measurements.

Inspected regenerated E3-return image at320x240: the previously empty view now
has a blue destination ball. The entry image from the same probe was also inspected: paired markers
are visible, with near side markers partly clipped by the viewport. Magenta
fringes remain on distant ball silhouettes and the aperture. More visible solids
mean more possible refusal silhouettes; no before/after refusal-rate improvement
is claimed. Use this saved spawn view for the next GPU provenance census.
PNG artifacts remain generated/ignored, not frozen numerical references.

This is orientation and scale support, not completed architecture. Existing
purple-patch attribution, richer supported primitives and frame-time work remain
open. No claims that this addresses every view or numerical refusal.

Full approved-host Node suite:127/127 passed, node tools/test.js;
log .agent-bridge/gallery-suite.log.
