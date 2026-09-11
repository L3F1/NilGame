# Connected GPU preview boundary

2026-09-11. This is an experimental rendering host for the connected-sight
fixture, not a replacement for the CPU geometry/query contract or the editors.

The packer consumes compiled region packets and owned Boolean groups. E3 and
S3 have separate point/step/domain/transport operations. S3 charts must fit an
open hemisphere. Caps are 48 atomic surfaces, 16 primitives, 16 groups, four
regions and eight directional portals. A 224-texel RGBA32F nearest-filtered data
texture stores these records; this avoids assuming a large fragment-uniform
budget. Unsupported geometry/capacity is refused before drawing.

Per ray: find the next chart/portal limit; screen convex cells using a sufficient
whole-segment face witness; collect analytic surface roots within that leg;
evaluate the Boolean occupancy between sorted roots; traverse the closest
eligible portal if no earlier solid entry occurs. Subtracted cells retain their
conjunction and group scope. Portal maps use radial aperture coordinates and
parallel transport, with the same explicit speed-preserving policy as CPU sight.
Only the reverse endpoint just crossed is suppressed. There is no visual exit
offset, infinite portal loop or automatic sky policy.

The shader returns hit, miss or unresolved. Near-tangent roots, coincident events,
root/end ties, ambiguous occupancy, aperture rims/sides and exhausted traversal
remain unresolved. No small distance bound is promoted to a surface hit. Surface
normals come from the intersected primitive, flipped for subtraction when needed.

Root ambiguity carries an earliest affected distance. A solid hit strictly before
that distance can finish; occupancy intervals may not extend through it. This
avoids drawing an unresolved silhouette of a hidden ball through a nearer wall.
The uncertain interval still blocks every query that actually reaches it.

Precision policy is deliberately provisional: highp float32, a 3e-5 refusal
band with larger separation margins, bounded scene/range, explicit uncertainty.
These are engineering guards, NOT formally derived portable bounds for every
shader operation or authorable scene. Narrow geometry, large-coordinate scenes,
near tangencies and different hardware require further evidence. The browser
comparison requires every confident result to agree with CPU status/region/owner,
distance within .001 physical units, quantized normals within .015, and at least
95% of CPU hits to remain hits on each recorded view. Extra GPU refusals are
reported individually. Passing this finite corpus is not a global theorem.

The native inverse-angle path failed that distance check after two portals.
Range-reduced atan2 uses a half-angle reduction and nine Taylor terms; its series
truncation is below float32 roundoff on the reduced interval. This is not a bound
on accumulated rounding across the whole renderer. Diagnostic readback disables
dithering and keeps framebuffer alpha so packed distance bytes survive intact.

CPU motion remains authoritative. Input uses the existing spike-filtered mouse
accumulator; free-flight camera roll is intentional. Frame dt is capped at .04;
unspent refusal time is not replayed. Any unresolved/debt-carrying motion halts
and requires reset in this preview. Scene editing, walking support, assets,
lighting systems and multiplayer integration remain separate work.

Next: independent near-boundary and authored-plane GPU falsification, refinement
of refusal reasons/guards, then connected editor integration. Preserve the CPU
preview and recorded test packets. Do not expand the geometry/capacity envelope
merely because the demo is fast on one GPU.
