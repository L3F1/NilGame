# Spherical hit-band feasibility measurement

Date 2026-09-13. Base 3a0543a, LeoPC/Windows/Node 24.20.0.
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
| Degradation at the first failing inflation | 32 of 32 become `unresolved/first-event-uncertain`; none changes owner |

Separation is therefore real but not generous. The narrowest pixels tolerate only
about a doubling of the transfer box before the first event stops being provably
first. A float32 port has room only if its own operation bounds stay within that
factor, and that analysis does not exist yet.

## What this does not establish

- **Not a float32 result.** This is the binary64 reference model, carrying the
  64-epsilon engineering allowance in `spherical-root-bounds.js`. The inflation
  sweep widens the transfer box only; a GLSL port also widens every internal
  operation. The audit's list of missing float32 error terms stands.
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

Coverage gap found while doing this, reported and not fixed: replacing the
coefficient-rectangle phase term `asin(dh/h)` with the rounding allowance alone
is caught by neither `spherical-root-bounds.test.js` (241 roots) nor this suite.
The bands narrow only slightly at this scene's coefficients. That check needs a
case whose direction error dominates its amplitude.

## Next

The gate is passed on the CPU side, so the next step is the float32 question,
not more CPU measurement: derive operation bounds for a GLSL
`sphericalBallRootBounds` port and re-measure separation under those bounds in a
small separate program, keeping the current colours. If the derived float32
widths exceed roughly the 2x headroom above, ordering cannot carry these pixels
and the refusal stands.
