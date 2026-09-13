# Four-sample refinement contract

AA uses offsets(-.25,-.25),(.25,-.25),(-.25,.25),(.25,.25), in lower-left
WebGL tile order. A2x2 atlas has physical dimensions2W,2H; each tile subtracts
its integer origin then adds its sample offset, with logical resolutionW,H.
The nominal transfer AND interval bound use that same logical sample pixel.
Main consumption selects the matching tile before each trace and still requires
the sample-index stamp plus exact portal, transferred point and tangent identity. Proofs expire on crossing.

Only actual AA color draws (and the AA evidence draw) use the atlas. Ordinary
debug packets/primary rays and diagnostic displays remain centre rays, regardless
of the UI checkbox. Layout participates in association; no temporal reuse.

Unsupported resources, invalid size, allocation failure or a64MiB certificate
attachment budget refuse refinement, preserving the original AA query/display
path. All three attachments count:48 bytes per atlas texel. Size bookkeeping
must be invalidated before reallocation and committed only on successful GL
allocation. Validate texture and viewport limits before allocation.

Acceptance: independent2x-resolution centre-ray reference, meaningful AA proof
consumption and visible recovery; no confident wrong answers; preserve numeric
uncertainty if any sample remains unresolved. Test centre/AA transitions, odd
viewport sizes, edit/resize, resource refusal and failure recovery. Quantized
color comparison allows at most2 bytes from reference averaging; domain-checker
pixels are excluded because that decoration is in screen coordinates.

No default enable or broader geometry capability is implied.

Debug 9 counts final-active certificates, omissions and numerical refusals
across the four samples. Debug 10 reports omissions by sample. These are
separate invocations, not certificates about a preceding display draw. Ordinary
centre evidence remains debug 8. Independent reference programs may safely
refuse different exact-identity matches; equal certificate counts are not a
correctness invariant. Checked resolved pixels must still agree.
