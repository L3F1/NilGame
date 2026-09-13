# Enclosure interactive-size review (2026-09-13)

Base 23d2393. Added a configurable viewport to the existing isolated AA timing
helper (default unchanged), plus p90. Candidate probe captures off/on images
at 480x360 AA and requires atlas generation. This is the largest current AA
menu size admitted by its 64 MiB cap; 640x480 AA remains refused.

Larger timing is attempted only after the existing 320x240 timing reports a
complete measurement. An incomplete smaller run explicitly skips the larger
workload; it is not permission to mix late samples or claim performance passed.

Hardware RTX 5070 Ti, ANGLE D3D11, twelve samples per case at 480x360:
baseline GPU p50 0.8656 ms / p90 0.886016 / max 0.892448;
refined GPU p50 1.182336 ms / p90 1.198496 / max 1.202112.
These are total renderer GPU draw times, not presented-frame FPS. The corpus
is one fixed gallery pose. Constructor/startup behavior is a separate open item.

Lead inspected both saved 480x360 images: sphere and aperture fringes remain
purple. This is an acceptable sampled hardware cost, not visual-polish
acceptance. Remaining hit-side root uncertainties still need actual fixes.
Do not spend another batch expanding this same miss-only acceptance corpus.

Commands: node tools/check-queue.js page-check --three-geometry --timeout=300,
and the same with --sw. Hardware browser run passed in 89.3 seconds.
SwiftShader browser check passed in 215.3 seconds, including 480x360 AA atlas
generation and images. Lead inspected its refined image too: fringes remain.
Larger software timing was SKIPPED because 320x240 timing was incomplete.
This does not establish an affordable software frame rate.
[Evidence](enclosure-interactive-evidence.json) retains that status and prior
software timing. [Hardware off image](images/enclosure-interactive-off.png)
and [on image](images/enclosure-interactive-on.png) are saved for comparison.
Full-suite result follows below.

## Readiness and next delivery

The three-geometry property editor, connected traversal, collision, undo and
persistence are functional. This is a usable prototype, not a polished editor.
Three remaining deliverables for this slice:
1. Expose the candidate as an explicit optional path with truthful loading and
   memory limits; review first-use build cost without claiming GPU time is startup.
2. Fix remaining visible hit-side sphere/portal fringes; retain diagnostic purple
   wherever queries are still unresolved. More miss certificates cannot do this.
3. Walk and edit a representative saved E3/S3/H3 route at normal viewing sizes,
   then address concrete usability/appearance issues found there.

No meaningful completion percentage or guaranteed prompt count follows from
these tests. Most basic editor functionality is in; the numerical visual defects
are the uncertain part. Avoid host migration/new geometries until this slice is
usable and visually convincing. Direct gizmos/general asset import are later scope.

Final validation: 139/139 Node suites passed; timing attribution suite 37 checks. git diff --check passed.
