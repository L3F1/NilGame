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

## Claude usage correction

Recorded75,057 output tokens,24,413 thinking tokens and7,827,424 cached-input
tokens in17minutes; list-price estimate$7.31 is not subscription billing or a
quota percentage. Future launches set `--autocompact 100k` with medium effort,
smaller scopes, compact instructions and usage metadata. No extra model call
was made to summarize this run. The local CLI help and official
[CLI reference](https://code.claude.com/docs/en/cli-reference) support the flag;
[cost guidance](https://code.claude.com/docs/en/costs) explains context costs and
that compaction itself consumes tokens. Do not run compaction on a timer.
