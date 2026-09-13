# Optional improved refinement in the editor (2026-09-13)

Base ee1f1a1. The three-geometry preset now offers Improved spherical refinement
beside Open preset and restart. It opens refinement=enclosure explicitly; ordinary
URLs retain the standard renderer. The restart warning still tells authors to
download unsaved edits. Classic E3/S3/E3 does not expose this experimental variant.

The opt-in starts with refinement checked. Smooth edges retains its hardware-based
initial preference. The help and resource refusal name the candidate's actual
480x360 AA limit, not the standard path's 640x480. Oversized requests use ordinary
rendering; lowering resolution regenerates the pass. The in-editor checkbox can
turn refinement off without restarting. Changing renderer selection requires
opening the preset again and therefore restarting, as the controls state.

A top-of-page status is painted before synchronous compilation via two animation
frames. It warns that setup may pause the page. This is loading feedback, not
asynchronous compilation or a promise of responsive input during driver work.
Errors during setup remain visible. Successful first draw hides the banner.

The browser probe loads the ACTUAL opt-in page in a same-origin iframe without
check mode, avoiding recursion. It checks selected controls, guidance, 640x480 AA
refusal, 480x360 recovery, and toggle-off. Existing image/query/editor checks are
unchanged. The iframe is removed and its GL context released after the check.

Hardware real-page smoke passed (119.1 ms startup after earlier shader tests).
That number includes iframe fetch/first draw, but is WARMED and not representative
of first-ever compilation. Historical roughly17-second constructor costs remain
relevant. The top loading-banner adjustment landed during the first hardware run;
the software run uses the final complete source. No shader changes in this batch.
Software real-page smoke passed on final source (5132.5 ms warmed startup).
Hardware/software full browser checks completed in90.4 /242.5 seconds through
node tools/check-queue.js page-check --three-geometry --timeout=300 (plus --sw).
[Evidence](enclosure-ui-evidence.json) records the real-control assertions.
These timings are not cold-cache promises or frame-rate measurements.
Node-suite verdict follows below.

Next: remaining hit-side sphere/portal fringes. Do not keep expanding the miss-only
acceptance corpus. This optional UI delivery does not claim those artifacts fixed.

Final validation: 139/139 Node suites passed; syntax and git diff --check passed.
