# Fresh-chat handoff for Astra

2026-09-10, base d3160ba plus reviewed Muse work. Start with git status/log,
WORKING_RULES and relevant TASK_ROUTER row; do not load old chat/history.

Latest review/fix: docs/qa/astra-muse47-49-review-2026-09-10.md.
MUSE-47 accepted with clarification: designated floorId determines gravity;
negative author-Z orientation is valid. Other surfaces never become supports.
The real pinned-walking crash was fixed in metric-space.js: validate then remove
radial roundoff before normalizing tiny tangents; retract nonzero geodesic legs,
carry vectors linearly without speed normalization. Zero travel stays identity.
Regression: 1200 ball-contact frames, 2733 contacts, radial error 1.11e-16.
Old implementation in temp copy fails both new metric tests and walking check.

MUSE-49 needs multiple curvature radii; MUSE-48 needs transported-frame/Gram
checks, explicit ambiguous oracle band and precise evidence scope. Their current
untracked suites/reports are preserved, not accepted. Full-suite totals include
these pending deliveries, so green is not a review verdict. MUSE-50 is the
independent transport-repair audit, after those revisions.

Claude markers: real-GPU region-lab 113 checks pass and marker test 4/4 passes,
but visibility Boolean confuses conservative proximity/exhaustion with truth.
Bounded correction assigned in CLAUDE_NEXT.md. No shader changes authorized by
that assignment. Godot plan corrected: executable exists on Windows; radial
chart vector norm is origin distance; JSON semantic parity, not byte identity.

Next Astra task: certified S3 surface intersections for traceRegionSight.
Read NEXT_CAPABILITIES section 3 and astra-connected-sight report. Source fields
already expose ball centers and great-sphere plane lists. Solve geodesic roots
then classify scoped Boolean occupancy, inside starts, tangencies, coincident
roots, subtraction normals, degenerate cases and range uncertainty. Do not call
a tiny positive bound a hit. Keep conservative fallback and explicit unresolved.
GPU connected sight must wait; no removing one-region editor gate yet.
Nested-cutter conservatism remains separate. Browser reference stays active.
Host probe still routes through queue PID38432, RTX5070Ti; direct sandbox Chrome
failed. Read final validation counts in current review report, not old summaries.
