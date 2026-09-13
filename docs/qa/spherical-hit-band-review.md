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
- The census no longer carrying its envelope inputs, which would leave the
  accuracy probe measuring only its own sweep:
  `Ordered pixel 78,31 never reaches the accuracy probe`.
- The shading enclosure ignoring the band it is about, and then keeping the band
  but dropping its trigonometric reach: `No independent normal witness at 78,31`
  and `Shading enclosure 0.00036884662982047457 excludes its own band ends
  0.00861205850746445 at 78,31`.
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

## What the backends actually deliver (same day)

The requirement above was measured without knowing what a driver gives, so the
next step was to measure that too rather than argue about a specification.
`tools/glsl-transcendental-probe.js`, run through
`node tools/page-check.js --transcendental [--sw]`, evaluates `atan(y,x)` and
`acos(x)` in a highp fragment shader over 1615 binary32 samples - the envelope
inputs this census actually produces, plus a sweep over phase, amplitude and
ratios pressed against 1 - and compares each against binary64 `Math.atan2` /
`Math.acos` on the same binary32 input. Evidence:
[glsl-transcendental-evidence.json](glsl-transcendental-evidence.json).

| Backend | max abs atan error | max abs acos error | at the census coefficients |
| --- | --- | --- | --- |
| ANGLE / NVIDIA RTX 5070 Ti, D3D11 | 1.147e-5 rad | 6.755e-5 rad | atan 4.20e-6, acos 6.77e-7 |
| ANGLE / SwiftShader, Vulkan 1.3 | 2.533e-7 rad | 6.755e-5 rad | atan 6.10e-8, acos 7.34e-7 |

No sample was lost on either run. Both clear the 2^-10 rad requirement by 14.5x
overall, and by three orders at the coefficients the guarded pixels actually
produce, where the ratios sit within 1e-3 of 1. The worst `acos` error is
identical on both backends and falls at ratio 0, mid-range rather than near the
tangency the guard fires on - the two ANGLE paths plausibly share that
implementation, which is a reason to treat the pair as ONE data point about
ANGLE, not two independent backends.

## How much of the picture a band actually settles (same day)

The audit's section 3 asks what an ordered band leaves undecided about the
SHADING, and that is now measured rather than deferred. For each ordered entry
the census encloses the surface normal over everything still uncertain - the
whole band AND the transfer box - with binary32 intervals, using the Lipschitz
bounds |cos a - cos b| <= |a - b| and the same for sine, so no interval
trigonometry helper is introduced. The reported diameter bounds the distance
between any two normals in the box, and therefore bounds the change in n . L for
EVERY unit light direction: it is a lighting-independent number.

| Quantity | Worst over the 14 ordered pixels |
| --- | --- |
| Normal enclosure diameter | 0.0369 |
| Equivalent angular spread | 2.11 degrees |
| Lambert term, in 8-bit colour steps | 9.41 of 255 |
| From the root band alone | 0.0368 |
| From the transfer box alone | 3.69e-4 |

So a certified hit would settle the pixel's shading to within about nine colour
steps in the worst case and four to six typically. The table splits the DIRECT
effect of each input at the other one held fixed, and read that way the band
dominates. It does not say the transfer box is harmless: the box is what makes
the band, through coefficient error multiplied by the arccosine sensitivity near
tangency. The next section measures that path instead of inferring it.

Part of the nine steps is enclosure slack rather than real uncertainty. The two
band-end normals, evaluated directly as an independent witness, are 0.0086 apart
where the enclosure reports 0.0292, so a sharper trigonometric enclosure could
recover roughly a factor of three. The remaining question is a policy one and
belongs to the lead: is a normal pinned to about two degrees enough to call a
pixel decided, or must the band tighten first? Nothing here recolours anything.

## What a tighter ray would buy (same day)

The decomposition above is a partial-derivative view and invites a wrong
conclusion, so the dependency was measured directly: rerun the whole ordering
with the transfer box scaled down and watch the band and the shading follow.

| Transfer box | Ordered pixels | Worst band | Worst colour steps |
| --- | --- | --- | --- |
| 1x (today) | 14 | 6.58e-3 | 9.41 |
| 1/2 | 14 | 3.34e-3 | 4.80 |
| 1/4 | 14 | 1.73e-3 | 2.50 |
| 1/8 | 14 | 9.34e-4 | 1.37 |
| 1/16 | 14 | 5.42e-4 | 0.81 |
| 1/32 | 14 | 3.55e-4 | 0.54 |
| 1/128 | 14 | 2.31e-4 | 0.36 |

The transfer box drives everything, roughly linearly at first: each halving
halves the shading spread. **Four extra bits in the transfer put the worst pixel
inside a single 8-bit colour step**, and the series then flattens against a floor
near 0.36 steps set by the coefficient and rounding terms the box does not
control. Nothing beyond about 1/32 is worth paying for.

That reframes the precision question. This does not need binary64 - which GLSL ES
does not have anyway - and it does not need a different host or language, since
every renderer that draws this scene draws it in binary32. It needs about four
more bits in ONE place. Compensated (double-float) arithmetic over the handful of
dot products in the transfer supplies roughly twenty-four, at a few extra
operations each, and the existing transfer bound would report the improvement
without any new proof obligation. Whether to spend that is the lead's call; this
is the measurement it needs, not a decision.

## Are any of these pixels unavoidable?

The pixel centre is not where the hard cases live. Running the same census at the
renderer's four antialiasing offsets reaches 116 guarded subsamples, and **10 of
them are genuinely undecidable at today's precision** - the centre-only census
resolved all 32 of its samples and made the problem look solved. Two facts about
those ten:

- Every one of them is decided by a tighter ray: 4 at 1/4, 6 at 1/16, 8 at 1/64,
  and all 10 by 1/1024. None is undecidable in principle at this pose. The suite
  now fails if any guarded sample resists every precision in the series.
- No pixel has all four subsamples guarded; the worst has three. So even the
  undecidable ones are outvoted. A pixel's colour is an area integral, and an
  undecidable subsample can only spoil its own share of it: with N samples the
  pixel is still determined to within one Nth of the spread between the two
  answers. That is a bound, not a hope, and the antialiasing path that provides
  it already ships.

There will always be SOME precision at which some sample is undecidable - exact
tangency is a curve through the image, and a sample can land arbitrarily close to
it. The honest claim is not that the set is empty but that it shrinks with
precision, that it is currently reachable, and that antialiasing bounds whatever
survives. Nothing here needs a guess.

A learned reconstruction in the DLSS family is the wrong instrument for this,
for three separate reasons. It costs orders of magnitude more than the fix: the
exact answer is a handful of extra operations per ray, against a network per
frame. It cannot be checked, so it would replace a bounded error with an
unbounded one and remove the only signal that finds bugs like this one. And the
cheap version of the same idea needs no training at all - interpolating a
refused pixel from its certified neighbours is a few lines - so if a presentation
fill is ever wanted, it should be that, clearly labelled as a fill and never
mistaken for a rendered answer.

## Where the error lives, end to end

Every stage is now measured, so the budget can be written down instead of argued
about. All figures are the worst ordered pixel at the recorded pose.

| Stage | Contribution | Improvable? |
| --- | --- | --- |
| Primary ray direction, binary32 | 60-63% of the transfer box | yes, inside a producer program |
| Portal transfer arithmetic, binary32 | 37-40% of the transfer box | yes, same place |
| Transfer box -> band, via arccosine sensitivity near tangency | x75 amplifier | no, this is the geometry |
| Packed ball CENTRE, binary32 in the data texture | sets a 1.98e-4 floor | yes, at a format cost |
| Packed ball radius, binary32 | 1.96e-4 with an exact centre, so nearly nothing | not worth it |
| Everything else exact | 6.17e-10 | - |

Reading the table: today's 6.58e-3 band is ray-limited. Remove the ray as a limit
and the band lands at 1.98e-4, which is the packed centre, and that is already
0.32 of an 8-bit colour step. The radius packing barely matters; the centre
packing is 83x more of the residual.

## The plan

Four stages, each with a gate that can stop the next one.

1. **Tighten the ray inside the producer.** Compensated (double-float) arithmetic
   over the primary ray and the portal transfer in the SEPARATE band program,
   not the main shader. It buys about 24 bits where 4 are needed, and the main
   shader keeps its binary32 path untouched. Gate: the existing transfer bound
   reports the narrower box, and this census reports the worst pixel under one
   colour step.
2. **Produce the band on the GPU.** A separate program in the shape of the miss
   pass: certified outside start, one root query per ball, ordering, emitting the
   band and the normal. Gate: per-pixel agreement with this CPU census.
3. **Consume it.** The main shader accepts a certificate only at exact
   association. Note a trap: once the producer's proof box is tighter than the
   main shader's own binary32 error, the current `enclosureMember` association
   check would REJECT its own certificates. The producer must therefore export
   two boxes - a tight proof box and a wider association box that contains what
   the main shader computes - or export the shaded answer outright.
4. **Shade.** With the worst pixel under one colour step, the band midpoint plus
   its certified normal names a colour no more than one step from any other
   answer the band admits. That is a derived tolerance rather than a fitted one,
   and it is what finally lets a pixel stop being purple.

## Viable options, with what each costs

- **A. Compensated ray + the existing closed-form solver (recommended).** Smallest
  change, entirely inside a separate program, measured end to end above. Costs a
  handful of extra operations per ray. Still needs an admitted allowance for
  `atan`/`acos`, though the margin is 14x on both backends measured.
- **B. Certified sign brackets instead of the closed form.** Avoids `atan` and
  `acos` entirely by bracketing the curve value with the shared-sincos contract,
  so no transcendental accuracy has to be admitted. Costs iterations per ray and
  a new producer, and it does NOT fix the ray-precision problem, which dominates.
  Best combined with A rather than instead of it.
- **C. Admit a transcendental allowance and ship the closed form as is.**
  Cheapest, but leaves the band ray-limited at 9.4 colour steps, which is what
  makes the pixels purple in the first place. It resolves ordering, not shading.
- **D. Pack the ball centre at higher precision.** Only worth doing after A, and
  only if 0.32 of a colour step is somehow not enough. Costs a scene format
  change, which is a far larger commitment than A.
- **E. Supersampling.** Already shipped as an option and already recovers some
  fringe pixels. It reduces how MANY pixels are uncertain without making any
  individual answer decidable, so it is a mitigation, not a fix.
- **F. Keep the refusal.** Always available and currently correct. Purple is a
  visible, honest statement that the arithmetic is exhausted, and it is a better
  default than a guessed silhouette.

What this does NOT need: binary64, which GLSL ES does not provide; a different
host, since every renderer draws this scene in binary32; or a different language,
since the constraint is in the shader. A second machine or a non-ANGLE backend
would strengthen the transcendental evidence considerably, and that remains the
weakest link in option A.
