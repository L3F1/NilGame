# Ball authoring review — 2026-09-11

Base4efd6b3. Lead implemented add/remove document operations and model APIs;
Claude implemented form controls and browser checks. Lead review added chart IDs
to ID suggestions, reset chart selection on region changes, tightened unresolved
ray comparison, and tested removing an earlier GPU owner index.

Create requires ID, selected region, explicit cover chart, position and radius.
Bounded-region records omit chartId. Remove affects additive balls only; spawns,
anchors, modifiers and referenced solids are protected. Both operations reuse
the existing transaction/clearance/capacity/history path. No renderer changes.

Evidence, LeoPC Windows Node24.20.0:

- 99/99 Node suites. Focused connected-ball-authoring.test.js also verifies
  independent S3 exponential placement in the southern chart; detached input;
  IDs/ownership; body overlap; GPU capacity; deletion/history/save/load; protected
  references; undo refusing to restore a ball around the player, then succeeding
  after moving away without losing the history entry.
- Isolated mutation forcing northern-chart placement fails the independent
  chart-position assertion. Main implementation untouched by that mutation.
- Queued global browser: 37 checks passed on NVIDIA RTX5070Ti ANGLE/D3D11 and
  SwiftShader/Vulkan. Real form creation/removal/undo/redo and file reload checked.
  New-ball centre ray: analytic1.9, CPU1.89999999999998, GPU1.90000534 (software).
  Removing an earlier primitive shifts the new ball's GPU index and still yields
  the correct owner/distance; undo restores the packet. Original portal route
  still works after reloading the original file.
- Inspected ball-created-aimed.png: created surface and bands visible; existing
  magenta silhouette uncertainty remains marked, not fixed by this change.

The capacity test initially placed its extra balls beyond the chosen chart;
corrected the test inputs to stay within that chart, not the domain check.
UI does not create charts, change geometry, or build/remove portal pairs yet.
Next contract: docs/engineering/CONNECTED_PORTAL_AUTHORING.md. MUSE-62 will
independently check final-graph swaps and base-to-envelope migration before UI work.
