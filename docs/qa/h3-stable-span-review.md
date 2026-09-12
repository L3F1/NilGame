# Stable H3 GPU ball spans

Lead, LeoPC / Node24.20.0, 2026-09-12; integration based on0fb8101 plus Claude's
repaired draft and the lead pending-foreground correction. Experimental opt-in
only; the visible editor still uses its existing E3/full-S3 world.

The old span formed A*A-B*B and compared its square root to cosh(radius/R).
For small balls both coefficients are nearly1; its absolute coefficient band
removed many otherwise visible hits. The replacement inverse-boosts the centre
into the ray origin frame, resolves longitudinal z and perpendicular length b,
and uses rho=sinh(radius/R). The closest parameter is asinh(z/sqrt(1+b*b));
the half chord is asinh(sqrt((rho-b)*(rho+b))/sqrt(1+b*b)). Both entry and exit
roots remain available to the shared occupancy sweep.

Float32 refusal widths now scale with spatial boost/projection operations.
The128-epsilon multiplier is retained. Physical E is applied to physical
start clearance, not used as an absolute near-unit cosh coefficient error.
The bands are conservative engineering estimates, NOT formal interval proofs.
Tangencies, uncertain starts and event ordering still refuse. No tolerance in
the CPU/GPU answer comparison was loosened; CPU query code is unchanged.

## Measured before / after

Same13 fixed views,49x37 each (23569 rays per backend), cold caches. Before:
331 extra refusals including191 CPU hits. After on both RTX5070 Ti/ANGLE D3D11
and SwiftShader/ANGLE Vulkan:22 extra refusals including1 CPU hit. No checked
answer disagreements or GPU answers to CPU refusals in either run.
Maximum compared hit-distance error after: .000004181 physical units NVIDIA,
.000007995 SwiftShader. This is sampled evidence, not a whole-envelope proof.
Inspected the off-axis ball image: the broad refusal band around the ball is
removed; sparse magenta pixels remain. Expected CPU refusals are still visible.

The new durable command is:

    node tools/check-queue.js page-check --h3-gpu
    node tools/check-queue.js page-check --h3-gpu --sw

Both passed after root integration. The check refuses disagreement, confident
answers to CPU refusals, vacuous hit coverage, or regression beyond22 extra
refusals /1 lost hit on THESE views. It is not a universal quality threshold.
The preceding shader would fail these ceilings (331/191), using the recorded
same-pose fail-before evidence in h3-first-gpu-review.md. Evidence is written to
.agent-bridge/h3-gpu-real.json and h3-gpu-sw.json; images use page-check-shot-*.png.
The queue worker was restarted to load the new allowed flag; current PID32728.

Existing page-check --connected-global passes52 on real GPU after integration.
Focused hyperbolic-gpu and three-geometry-world tests pass. Full Node suite:
125/125 on the approved host (h3-stable-suite.log). No fresh GPU timer distribution is
claimed: the synchronous probe still does not collect driver query samples.

Next: independently broaden precision cases (translated/far centres, radii and
grazing rays), add the near-portal/remote-solid GPU fixture, implement H3-specific
material shading (current polished material was authored for E3/S3), then expose
the three-region editor. Default packing/renderData still reject H3; explicit
experimentalH3 admits the trial envelope only. Do not silently widen it.
