# Next experiment: consume the state enclosure that was proved

The arithmetic prototype and experimental serialized producer/consumer are now
implemented; see [integration evidence](../qa/enclosure-integration-review.md).
The candidate uses the constructor option enclosureRefinement and is NOT exposed
in the UI. Keep today's default consumer until the remaining acceptance checks
pass: broader poses and measured interactive cost. Payload rejection/expiry and
independent AA comparison now pass; see ../qa/enclosure-acceptance-review.md.
Software AA timing is still incomplete. The steps below remain its design contract.

The exclusion pass proves a miss over point/tangent intervals, but exports only
one nominal point/tangent and accepts only an exact match. Small valid shader
evaluation differences can therefore discard useful proofs. The joint E3
captures show why forcing all programs to return identical floats is not a
reliable organizing principle. Do not replace exact matching with a guessed
epsilon: export a representation of the actual proved enclosure instead.

## Smallest candidate

Keep exact world/draw/sample/portal association, first-crossing scope, eligible
owners and expiration. The main shader still determines the gate and all events
before it. A certificate never establishes that a portal was reached.

1. Compute the existing point and tangent bands, Bp and Bu.
2. Choose the nominal stored points qp and qu. Outward-bound scalar radii rp
   and ru large enough to contain each original band component around those
   centres. Nonfinite or invalid arithmetic refuses the candidate.
3. Construct outward-rounded symmetric boxes Cp = qp +/- rp and Cu = qu +/- ru.
   RECOMPUTE each ball exclusion over Cp and Cu. Merely attaching radii to a
   proof about the smaller original bands is unsound.
4. Export the nominal vectors, radii and the existing certificate metadata.
   The consumer accepts only if a conservative upper bound on each absolute
   component difference is <= its exported radius. This establishes that the
   actual state lies in the box used by the proof. Ordinary rounded subtraction
   alone is insufficient at the acceptance boundary; underflow, signed zero,
   nonfinite values and the existing float-error assumptions need explicit tests.
5. Any unsupported or failed step retains ordinary tracing. No root, normal,
   hit ordering, world extent or collision behavior changes.

Reprove using the serialized binary32 centres/radii, not higher-precision
temporaries. The amplitude argument covers p*cos(t/R) + u*sin(t/R), even for
boxed vectors that are not exactly unit/orthogonal. Do not project or normalize
the accepted state again before using that certificate. Explicitly settle how
this intended curve relates to the renderer's polynomial/native trigonometry
and rounded position/occupancy evaluation; the ideal amplitude bound alone
does not automatically enclose those implementation errors. This is an inherited
assumption to audit, not a new guarantee supplied by storing radii.

The prototype restricts nonzero state/radius magnitudes to [2^-100,2^100]. Tiny
NORMAL original endpoints now widen outward into that domain after validating
the original interval. Subnormal endpoints still refuse. Actual gallery transfer
bands exercise this encoding; see ../qa/refinement-transfer-enclosure-review.md.
Never clamp the actual state. Consumer classification uses bits: hardware
admitted a subnormal into a zero-radius box before that repair.

The conditional curve-error predicate is now implemented and checked; see
SPHERICAL_CURVE_ERROR.md. Use enclosureCurveExterior with an outward angle bound
and a single shared sincos pair in the consumer. This still needs serialized
integration and image/cost acceptance. The ideal-only predicate is not a
substitute for the evaluated-curve predicate. Strict computed exterior can
refine UNKNOWN; old occupancy classification equivalence would require >E.

This uses one extra RGBA32F attachment for the two radii (four attachments
total), not interval evaluation per object in the main shader. The main work is
one small state-membership check at an otherwise eligible crossing. Check
MAX_DRAW_BUFFERS and MAX_COLOR_ATTACHMENTS before compiling/allocating.
Also check float renderability and capacity for five fragment samplers including
the world texture.

At 64 bytes per atlas texel, the current 64 MiB cap would admit the 480 x 360
AA menu size but refuse 640 x 480. This is a real memory/UX tradeoff, not a
reason to silently raise the cap. Measure a tiny GPU prototype before editor
integration or designing compressed bounds. An exact-identity fast path may
remain, but must not bypass association/expiration checks.

## Acceptance and division

Lead reviews the exported-box construction and conservative membership rule.
Claude can implement the bounded producer/consumer prototype after that review.
Muse can independently test inside/on/outside enclosure states, stale samples,
wrong gates, mutation failures, allocation limits and repeated resize recovery.
No external jobs have been launched for this proposal.

Use independent reference arithmetic and surface-sign brackets, not just a JS
copy of the shader. Include a case where the represented states differ but both
are inside the certified box, and reject states just beyond its faces. Preserve
the existing image and settled-pixel guards while evaluating the candidate.
Measure total frame cost and proof participation on both backends; fewer exact
identity refusals is useful only if exclusions remain valid and the visible
image improves. Report incomplete software timing honestly.

If this does not pay for its extra storage, retain today's exact consumer and
move to the remaining hit-side root intervals. Do not turn cross-driver bitwise
determinism into an unbounded prerequisite for the editor.
