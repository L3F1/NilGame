# Claude next: truthful marker visibility labels

Read WORKING_RULES and docs/qa/astra-muse47-49-review-2026-09-10.md Claude
review section. Your marker selection/projection work remains; correct only
its visibility query and labels. No kernel/schema/renderer primitive changes.

Allowed files: app/region-lab.js, tools/region-lab.html, focused marker test,
docs/qa/claude-marker-visibility-review.md.

Replace markerOccluded's Boolean with clear / occluded / unknown:
- Start at the actual eye; the 0.05 skip can hide thin nearby occluders.
- A positive conservative bound below epsilon is unknown, not proven occlusion.
- A negative field sample certifies solid occupancy (subject to field sign
  contract); boundary/near-zero samples may remain unknown.
- Only certify clear when safe exterior advances cover the target range.
- Exhausted work, stall, invalid field or domain exits are unknown.
- Keep every marker selectable. Style/label unknown as uncertain editor aid;
  do not turn an uncertain occlusion query into a solid visual claim.
- Do not import the connected sight API as if it solved S3 surface hits.

Pin thin-eye obstruction, tiny positive conservative bound, exhaustion and
clear/occupied cases, plus existing selection/undo/play-hiding handlers. Use
host-probe and queue, save evidence; distinguish DOM screenshot from diagram.
No invented GPU timing for the CPU hint. Report commands and limitations,
commit explicit allowed paths once tested. Preserve all Muse work.

Host proposal received review corrections: Windows Godot binary exists;
normal-chart vector length equals physical origin distance; JSON parity is
structural/numeric, not serializer-byte identity. No native migration task yet.
Astra's next kernel step remains certified S3 surface intersection after the
walking-stability repair. Connected GPU rendering stays blocked.
