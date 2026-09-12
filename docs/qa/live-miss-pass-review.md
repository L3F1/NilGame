# Live miss-pass review — 2026-09-12

Claude candidate:94f0a44 isolated checkout, received after80 turns. Accepted as
an **opt-in renderer path**, not automatic admission. No new agent dispatched.

The candidate's first browser run was vacuous: its camera faced away after the
return route, yielding zero certificates/recoveries. Lead changed it to the
recorded gallery-entry pose. Candidate timings excluded the prepass and sampled
queries without yielding: lead moved the GPU timer around both draws, disabled
nested prepass timers and drained each12-sample case before the next case.
Recovered misses now require CPU misses; a generated pass recovering nothing
fails this fixture. Default play and AA retain the existing renderer path.

## Evidence

Windows LeoPC, Node24.20.0,160x120, fixed gallery-entry pose, no AA. Actual live
renderer, all eligible balls; not the earlier one-ball experiment. Commands via
the host queue: `page-check --three-geometry --timeout=90`, then the same with
`--sw`. Final logs: `.agent-bridge/live-pass-final-real.log` and
`live-pass-final-sw.log`. GPU timings are elapsed queries; draw/finish call
durations are separately labelled and are not completion latency.

Both backends recover34 formerly unresolved pixels out of52 in the entry census,
with no settled-pixel change and no CPU disagreement.18 remain unresolved.
Saved `page-check-shot-live-miss-pass-off.png` / `-on.png` were inspected: the
purple edges shrink, with the same visible scene structure.160x120 images and
this one pose are limited evidence, not a whole-editor visual acceptance.

RTX5070Ti ANGLE D3D11: total GPU median approximately0.084ms baseline versus
0.110ms opt-in (12 ready samples in the initial corrected-pose run).
SwiftShader Vulkan, final fully drained12-sample run:24.5472ms versus42.3275ms,
max25.9944 versus45.1546ms. Do not enable this unconditionally. Hardware result
precedes the timing-drain tightening; its12 queries were already available.

Full final integration `node tools/test.js`: **136/136 suites passed**, log
`.agent-bridge/live-pass-integrated-suite.log`. Bridge focused suite10/10.
Focused spherical-miss-pass suite:131 checks. Most are source/mock checks,
not independent GPU proofs. Existing helper mutation checks and actual browser
queries supplement them.

## Remaining gate

Cost-aware user opt-in/default policy, higher resolutions, sustained camera/edit
and resize GPU checks, and AA sample handling before promotion. The separate
pass is deliberately off by default; a missing/unsupported pass retains refusal.
No repair for the18 hit-side tangency cases is claimed. No native host migration.

## Precedent and the earlier timeout

Follow-up UI delivery (same date): checkbox exposed under Experimental rendering,
off by default. Browser tests exercise enable, AA refusal with explanation and
disable; screenshot `page-check-shot-three-gallery-refinement.png` inspected.
Both backends still recover34 entry-census pixels. Total320x240 GPU timings,
12 fully drained samples each, baseline -> refinement median (max):
RTX5070Ti .196224(.208288) -> .273472(.285824)ms;
SwiftShader107.5794(110.1284) ->166.1422(176.4721)ms.
Logs `.agent-bridge/refine-ui-{real,sw}.log`; same fixed pose, no AA, not a
sustained walking/frame-presentation benchmark. This justifies opt-in, not a
universal performance default. No additional math or shader changes this step.
Final follow-up suite `node tools/test.js`:136/136 passed
(`.agent-bridge/refine-ui-suite.log`).

Primary sources checked2026-09-12:
- [PBRT rounding-error management](https://www.pbr-book.org/4ed/Shapes/Managing_Rounding_Error):
  error bounds and interval arithmetic for ray/shape intersections.
- [NVIDIA self-intersection analysis](https://developer.nvidia.com/blog/solving-self-intersection-artifacts-in-directx-raytracing/):
  derived error bounds and safe origins for triangle rays, not a solution for
  spherical portal tangencies.
- [Shewchuk adaptive predicates](https://www.cs.cmu.edu/~quake/robust.html):
  escalate precision only when needed; determinant predicates, not our
  transcendental/geodesic intersection implementation.
- [Megakernels Considered Harmful](https://research.nvidia.com/sites/default/files/pubs/2013-07_Megakernels-Considered-Harmful/laine2013hpg_paper.pdf):
  splitting GPU work can reduce divergence/register pressure. This does not
  prove what our compiler did or imply every split renderer is faster.

Established numerical techniques do not establish that embedding them throughout
our connected fragment program was a good execution plan. That choice was ours.
Our interval multiply evaluates four endpoint products, minima/maxima and outward
rounding instead of one product. Portal transfer carries many such intermediates;
the original shader already has surface, event ordering, crossing and sample loops.
Inlining/unrolling and compiler optimization of the expanded graph are plausible
startup-cost causes, not measured causes: earlier timeout runs did not isolate
compile versus link versus deferred first-draw work. Do not describe those
timeouts as measured slow frame times. A small separate program did complete;
the live pass now provides actual frame measurements. No outside code copied.

## Scheduling follow-up

Follow-up scheduling investigation: a cheap near-tangent filter reduced tagged
interval-pass pixels4668 ->112 at the160x120 gallery, preserving34 recoveries in
initial real/software checks. At320x240, median total times filtered/unfiltered
were .268288/.274912ms hardware and159.1546/162.5514ms software (12 samples).
This small difference is not persuasive evidence of a meaningful speedup.
Expanded hardware runs then twice failed settled-distance invariance at(6,43):
2.594223976135254 ->2.594233274459839, same hit/region/owner. Exact cause remains
unresolved; do not claim the scheduling heuristic itself mathematically moved
the hit. Candidate rejected, saved locally in
`.agent-bridge/rejected-refine-filter.patch`; production source restored and
hardware browser check passed. Logs `refine-filter-{real,sw,final-real,distance-real,restored-real}.log`.

Landed alternative: host skips the refinement draw for non-E3 camera regions,
where the existing pass cannot apply. Main rendering/uncertainty is unchanged;
UI explains it is waiting for a flat-region view. Focused regression verifies
one draw, no generation/consumption in S3; removing the guard fails that check.
Browser route verifies H3 also skips it. No claimed measured frame-rate gain.
Final validation: real/software `page-check --three-geometry --timeout=90`
passed (`refine-scope-{real,sw}.log`), focused135 checks, full136/136 suites
(`.agent-bridge/refine-scope-suite.log`).

## Fixed eligibility precomputation (follow-up)

The pass now receives an integer owner mask computed once per packed world.
Only unmodified, additive, single-surface ball owners qualify; any use as a
cutter/intersection or modified base disqualifies the owner. Surface geometry
and destination-region checks remain in the shader. World replacement updates
the mask with the same packet transaction. No ray arithmetic or epsilon changed.
The old per-owner shader group scan is replaced by one bit test. Behavioral
tests cover high owner bits, shared uses, modifiers, shapes and changed-world
uploads; suppressing the replacement assignment fails the stale-mask check.

Hardware first run FAILED the same settled-distance check as the rejected
scheduling experiment: (6,43),2.594223976135254 ->2.594233274459839. Two later
runs passed, as did SwiftShader. This is unresolved intermittent evidence, NOT
a repaired distance regression. Failure diagnostics now include primary rays
and a repeated unrefined distance to distinguish baseline instability. Keep
strict acceptance and default-off refinement; investigate before promotion.

Logs `.agent-bridge/eligible-owners-{real,rays-real,repeat-real,sw}.log`.
Successful runs retain34 recoveries.320x240/12 GPU samples: hardware median
.266176ms; software177.1323ms. Cross-run timings do not demonstrate a speedup;
this change removes fixed scene scans, not a claimed frame-rate improvement.
Final Node validation: focused144 checks and full136/136 suites passed
(`.agent-bridge/eligible-owners-suite.log`). These do not close the intermittent
GPU observation above.

## Claude usage correction

Recorded75,057 output tokens,24,413 thinking tokens and7,827,424 cached-input
tokens in17minutes; list-price estimate$7.31 is not subscription billing or a
quota percentage. Future launches set `--autocompact 100k` with medium effort,
smaller scopes, compact instructions and usage metadata. No extra model call
was made to summarize this run. The local CLI help and official
[CLI reference](https://code.claude.com/docs/en/cli-reference) support the flag;
[cost guidance](https://code.claude.com/docs/en/costs) explains context costs and
that compaction itself consumes tokens. Do not run compaction on a timer.
