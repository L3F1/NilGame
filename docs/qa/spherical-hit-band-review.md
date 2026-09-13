# Spherical hit-band feasibility measurement

Date 2026-09-13. Bases 3a0543a and 6e86c98, LeoPC/Windows/Node 24.20.0.
Evidence: [spherical-hit-band-evidence.json](spherical-hit-band-evidence.json)
(regenerate with `node tools/spherical-hit-band-evidence.js`).
Check: `node spherical-hit-band.test.js`. Contract:
[SPHERICAL_ROOT_PRECISION.md](../engineering/SPHERICAL_ROOT_PRECISION.md) hit-side
decision; independent audit: [claude-s3-hit-contract-audit.md](claude-s3-hit-contract-audit.md).

## What was asked

The hit-side decision permits no smaller global E and no band midpoint promoted
to a root. Before any production packet format or a wider main shader, it asks
one question: after the certified E3 -> S3 transfer box, do the root bands of
this scene separate enough for additive event ordering to name a first entry at
all? This is that measurement, and nothing else.

## What was measured

`app/spherical-hit-band-census.js` walks the recorded 160x120 gallery-entry pose
(flat spawn, 60 range) and keeps the pixels whose first crossing is E3 -> S3 and
whose transported ray trips the live shader's tangency guard, replayed in
binary64. For each kept pixel it builds the transfer box with
`e3S3TransferBounds`, certifies the S3 leg start strictly outside EVERY ball in
the destination region with the new `sphericalBallExterior`, builds one root
query per ball with `sphericalBallRootBounds`, and orders them with the existing
`selectAdditiveEntry`. No new numerical constant, no new interval helper family,
no change to the miss path, the renderer or any shader.

| Measurement | Result |
| --- | --- |
| Guard-tripping pixels at this pose | 32 (14 traced hits, 18 traced misses) |
| Traced hits given a definite ordered entry | 14 of 14, owner equal to the traced owner |
| Entry bands containing the traced root | 14 of 14 |
| Entry band width | 0.00287 to 0.00658 world units, at leg distances 2.1 and 37.4 |
| Traced misses promoted to entries | 0 (all 18 certify as misses) |
| Legs whose start failed the exterior certificate | 0 (smallest margin 0.063) |
| Input-box inflation still giving the same answer | 2x on 2 pixels, 4x on 4, 8x on 4, 16x on 11, 32x on 11 |
| Binary32 coefficient model | same 14 entries and 18 misses, bands at most 1.129x wider |
| Consumer atan/acos allowance still giving the same entry | 2^-10 rad on 2 pixels, 2^-8 rad on 12 |
| Degradation at the first failing inflation | 32 of 32 become `unresolved/first-event-uncertain`; none changes owner |

Separation is therefore real but not generous. The narrowest pixels tolerate only
about a doubling of the transfer box before the first event stops being provably
first. The second section below spends part of that margin on a binary32
coefficient model and turns the rest into an explicit accuracy requirement on the
consumer's arctangent and arccosine.

## What this does not establish

- **Not an executed float32 result.** The binary32 columns model a consumer's
  coefficient arithmetic rigorously and its transcendentals by assumption. No
  GLSL runs here, no backend was measured, and the envelope's own float32
  arithmetic rounding is covered only because it is orders below the swept
  allowances. The audit's remaining gaps - portal/edge band, shading tolerance,
  FMA and backend model - stand.
- **Not a shading certificate.** A band certifies owner and order. Hit position,
  normal, facing at grazing incidence and a declared shading tolerance remain
  underived, so no pixel may be recoloured on this evidence.
- **Not the GPU unresolved set.** The 32 pixels are a binary64 replay of the
  shader's tangency guard. The hardware census recorded 52 unresolved sampled
  pixels (34 miss-side, 18 hit-side) at this pose; the difference is refusals
  with other causes, and the GPU census still owns the real count.
- **One pose, one fixture, one region.** Additive single-surface balls only; no
  subtractive group, no H3 leg, no second crossing, no motion.

## Meaningful failure

Each mutation below was applied to the working copy, run, and reverted:

- Additive ordering selecting the last event instead of the first:
  `Traced hit left unordered at 78,31: first-event-uncertain`.
- Entry band dropping the lower angular spread:
  `Band 37.42992774919895..37.429997106784924 misses traced root 37.42734419623724,37.42735468665472 at 78,31`.
- Exterior certificate ignoring its own input error: the blind-point case returns
  `outside` where the suite requires `unresolved`.
- Binary32 coefficients computed without the binary32 dot:
  `Binary32 band narrower than the binary64 band at 78,31`.
- `phaseAllowance` dropped before the phase band, then `angleAllowance` dropped
  before the angular spread: `phaseAllowance did not widen the bands` and
  `angleAllowance did not widen the bands`. The first version of that check used
  both allowances at once and missed each of them individually.

Coverage gap found while doing this, reported and not fixed: replacing the
coefficient-rectangle phase term `asin(dh/h)` with the rounding allowance alone
is caught by neither `spherical-root-bounds.test.js` (241 roots) nor this suite.
The bands narrow only slightly at this scene's coefficients. That check needs a
case whose direction error dominates its amplitude.

## Binary32 coefficients and the consumer transcendental requirement (same day)

The float32 question splits in two, and only one half is hard.

**The coefficient stage is nearly free.** Dotting the SAME transfer boxes with
the outward-rounded binary32 intervals in `float32-interval.js`, and using the
packed float32 surface constant, reproduces every decision: 14 of 14 ordered
entries with the same owner, 18 of 18 misses, every start still certified
outside. Bands widen by at most 1.129x (0.0032 to 0.0074 world units). The
transfer box, not the dot rounding, sets the width - the binary32 dot is only
about 1.05x wider than the binary64 model's own error term on these rays.

**The envelope's transcendentals are the whole risk.** `sphericalRootBounds`
now takes optional `phaseAllowance` and `angleAllowance`: absolute-radian models
of the arctangent and arccosine a consumer will execute, defaulting to 0.
Supplying one is an assumption about that implementation, not a proof of it, and
nothing in this measurement executes GLSL. Sweeping both together over the
binary32 coefficients gives the requirement:

| Pixels | Largest allowance still giving the same ordered entry |
| --- | --- |
| 2 traced hits (the tightest) | 2^-10 rad (0.00098) |
| 12 traced hits | 2^-8 rad (0.0039) |
| 18 traced misses | no failure anywhere in the swept range to 2^-6 |

Misses never fail because a certified miss compares amplitude against the
constant and never forms a phase. Every hit-side failure is
`overlapping-events` - the entry and exit bands of the same ball merge - and
resolves to unresolved. None names a different owner at any allowance.

So a GLSL port must guarantee its `atan` and `acos` to better than about
**2^-10 rad absolute** to keep every pixel, or 2^-8 to keep all but two. That is
the same order as the minimum precision commonly quoted for those built-ins in
the ES shading language, so the design cannot simply assume it: either the
target backends' accuracy is admitted with evidence, or the port avoids the two
transcendentals altogether. The second route already has machinery here - the
shared-sincos curve-error contract in SPHERICAL_CURVE_ERROR.md certifies the
VALUE of the curve at a time, which is what a sign-bracketed root band needs,
and `spherical-root-bounds.test.js` already brackets its 241 roots that way.

## Next

Decide the envelope route before writing GLSL, because the two routes need
different evidence:

1. **Admit transcendental accuracy.** Measure `atan`/`acos` absolute error on
   both backends against a binary64 oracle over the actual coefficient range,
   and admit a constant only if it clears 2^-10 rad with margin. A driver
   measurement is sampled evidence, not a portable guarantee.
2. **Avoid them.** Produce the entry band by certified sign brackets on the
   curve value, reusing the shared-sincos contract and the existing binary32
   interval GLSL, so no arctangent or arccosine appears in the proof.

Either way the shading question in the audit's section 3 is still open, so the
current colours stand until a hit position and normal tolerance is derived.
