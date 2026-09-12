# H3 refusal provenance

Lead, LeoPC/Node24.20.0, baseaab06b7 plus change, 2026-09-12.

H3 aperture queries reaching the domain limit kept their unresolved status but
lost their reason in the shader. A known chart-boundary refusal was rendered
as generic numerical magenta. The shader now accumulates domain-only refusals,
inspects every aperture for numeric ambiguity, then emits coverage kind1 if no
numeric refusal intervened. Numeric kind2 takes precedence regardless of portal
order. No ray is turned into a hit/miss; no tolerance or range changed.

Added GPU check for a sideways ray after actual E3/full-S3/H3 transit: CPU
aperture-query/domain-exit, GPU unresolved/coverage. A second fixture adds an
on-plane portal ambiguity alongside the domain refusal and reverses connection
order; both must remain unresolved/numeric. General pixel comparison rejects
coverage markers that conceal a CPU numerical refusal.

Fail-before: restored previous shader temporarily and ran the new check on
SwiftShader. It fails 'H3 coverage refusal lost its domain provenance'. Current
shader restored in finally. Script/log h3-provenance-before in .agent-bridge.

Final real RTX5070 Ti/D3D11 and SwiftShader/Vulkan checks both pass,23569 rays:
753 hits,16234 misses,1840 numerical refusals,4742 coverage refusals. One lost
CPU hit remains, no checked answer disagreements. This fix classifies existing
unknowns; it does not reduce the number of unresolved rays. Inspected edited-H3
image: former purple background now has the visible coverage checker, while
numerical patches remain. Diagnostics toggle still highlights coverage too.
Existing connected-global real-GPU52 passes. Full approved-host Node suite:
125/125 (h3-provenance-suite.log).

Scope: experimental H3. Remaining purple silhouettes/portal patches in the
currently visible E3/S3 editor were NOT repaired by this change. Next task is
a reproducible CPU census plus GPU reason review there, before changing guard
bands. Muse73 assigned the CPU census only; Claude still quota-limited.
