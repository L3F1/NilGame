# Geometry audit, 2026-09-08

Core geodesic equations pass independent numerical checks for all eight
geometries. This is evidence within the tested ranges, not a proof that the
whole renderer, collision system, or every quotient is correct.

`geometry-audit.test.js` checks E3/H3/S3 against the ambient geodesic equation
and both products against separate surface/height equations. Nil, Sol and
SL2R are checked against the Euler-Lagrange equation obtained from their
coordinate metric tensors, independently of the implemented velocity ODEs.
The audit differentiates positions twice, so numerical flows use a tighter
integration step to keep truncation noise out of the residual.

Existing tests additionally cover isometries, exponential/logarithm behavior,
product composition, quotient reduction, conserved quantities, and collision.
The audit has eight groups; the complete Node run now has 18 passing suites.

## Findings fixed

- Product lighting transformed directions as points, adding chart altitude.
  The flat component of a tangent must remain unchanged by that translation.
- Spherical shading raised the fourth covector component with a hyperbolic
  sign and projected using the hyperbolic formula. Both now use the selected
  metric; GPU tests require unit normals tangent to the model.
- H2R distance used cancellation-prone Minkowski differences. The shader now
  separates radial and angular contributions. Sampled dropper fields agree
  with CPU values through radial distance seven.
- Self-history rendering was enabled in worlds that do not maintain compatible
  history. It is now limited to H3 and the flat quotients, removing a source
  of phantom green bodies in the dropper.
- Flat checker parity failed to descend to the lattice quotient. Twenty tiles
  per period now preserve both colors across a wrap; GPU tests cover this.
- Nil column silhouettes now use exact ray intersections, checked against
  independent flow evaluations and on the GPU. This removes the close-up
  approximate-hit bands and frees columns from the beacon marcher's range.
- H2R baffle shading now projects onto the surface and transports the normal.
  Its underside uses a constant material instead of amplifying altitude
  roundoff with a discontinuous stripe texture. Saved ceiling views cover it.

## Limits still open

- GPU/CPU agreement alone cannot establish mathematical correctness. Independent
  metric tests cover core CPU motion, not every shader expression or long ray.
- Sol/SL2R use approximate integration and canonical camera frames. Long-ray
  convergence, transport, and multi-contact collision need further work.
- Nil columns have analytic hits with a 4096-unit numeric guard. Its decorative
  beacons remain approximate level sets with a 70-unit march limit. These are
  not true metric spheres. Very distant GPU flow still has finite precision.
- Turning fog off does not remove finite ray ranges or iteration budgets in
  the other marchers. A miss still shows background.
- H2R floor checks use Klein coordinates; large wedges of alternating color can
  be the texture itself. The confirmed lighting error was separate from this.
- Godot rendering parity should be regenerated after the spherical shading fixes.
