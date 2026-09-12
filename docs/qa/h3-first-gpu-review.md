# First H3 GPU draft readback

Lead, LeoPC, 2026-09-12. Main basefd955aa; reviewed draft is the isolated
claude-h3-gpu-repair checkout in run2026-09-12T04-47-57-924Z-a0051ef0, including
the lead pending-foreground correction documented in h3-gpu-lead-review.md.
No renderer draft was installed in main.

Ran the actual draft module graph through the existing host queue. Scratch
run-h3-draft-review.mjs temporarily supplied a review page to page-check's
connected-global route, invoked the draft runProbe, then restored the original
HTML in finally. Used it once normally and once with --sw, sequentially, cold
shader caches. This collected evidence; exit0 is NOT GPU admission and is not
the ordinary connected-global52 regression run. No tests or tolerances changed.

| Backend | Rays / views | Answer disagreements | GPU answers to CPU refusals | Extra GPU refusals | CPU hits refused |
| --- | --- | --- | --- | --- | --- |
| RTX5070 Ti / ANGLE D3D11 | 23569 / 13 | 0 | 0 | 331 | 191 |
| SwiftShader / ANGLE Vulkan | 23569 / 13 | 0 | 0 | 331 | 191 |

Largest measured distance discrepancy among compared hits: .0001021 physical
units on NVIDIA, .0001121 on SwiftShader. Largest local-normal differences:
.004364 and .004071 respectively (RGBA8 encoding included). These are sampled
comparisons within the probe's existing tolerances, not exact agreement.

Inspected entry/exit sweep image: shaded ball exists, but much of the view is
magenta. This image has diagnostics enabled; some purple is expected CPU
refusal, so the image alone cannot attribute it to GPU error. The readback
establishes the additional loss separately: that view has119 CPU hits,90 GPU
hits,32 extra refusals. Off-axis ball view has130 CPU hits,96 GPU hits.

Timing harness performs90 draws with finish() per view at320x240. Driver timer
samples were null despite extension availability; no GPU-timer distribution
is claimed. Synchronous wall time is not an interactive frame/latency benchmark.
Next timing work needs asynchronous query polling and presentation intervals.

Evidence in scratch: h3-draft-real.json / h3-draft-sw.json and corresponding
logs; images named page-check-shot-h3-*.png. Repro script imports the preserved
draft by its exact checkout path. Main HTML restored and git status checked.

Verdict: compilation/readback now demonstrated on both backends; NOT accepted
for the editor. Next priority: attribute/refine H3 ball/aperture float32 refusal
bands using stable expressions and explicit error estimates, replay these
views and the nearer-portal/remote-uncertain-solid case. Do not merely lower E
or recolour unresolved pixels. Then verify main E3/S3 regressions and full Node
suite before any runtime integration.
