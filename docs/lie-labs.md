# Sol and SL2R navigation laboratories

Choose **Sol stretch chamber** or **SL2R twist chamber** from the worlds menu.
WASD flies in the view direction, space/shift moves in the third frame direction,
and R resets. Both chambers contain three solid blocks and a coordinate grid.
There is no gravity, quotient, objective timer or cross-geometry connection yet.

Sol uses `exp(2z) dx² + exp(-2z) dy² + dz²`. Moving vertically exchanges
which horizontal direction is cheap to travel. Its x-z slice is a hyperbolic
plane; the tests compare that slice against an independent closed-form curve.

SL2R uses the Sasaki metric on the lifted unit tangent bundle of H2:
`exp(-2z) dx² + dz² + (dtheta + exp(-z) dx)²`, where `y=exp(z)`.
Theta is unwrapped, never reduced modulo a turn. This normalization follows
the Sasaki case discussed by Bolsinov, Veselov and Ye in
[Chaos and integrability in SL(2,R)-geometry](https://arxiv.org/abs/1906.07958).
Horizontal travel and fibre travel interact; this is not the H2 x R product.

## Implementation boundaries

- Geometry kernels and a shared RK4 integrator live in `engine/geometry/`.
- `engine/world/lie-labs.js` owns authored boxes, collision fields and adapters.
- `engine/geometry/lie-shader.js` traces incrementally, with steps at most 0.04.
  It consumes the same box data as collision. It does not use the H3 marcher.
- Placements are transport containers: coordinates occupy the last column.
  The first three columns are placeholders, **not an isometry or transported
  frame**. The adapters and shader explicitly use each metric's canonical frame.
- Coordinate-plane distances give conservative intersection fields for boxes.
  Grid spacing is in coordinates; its physical spacing deliberately varies.
- Collision substeps are at most 0.01 seconds. Glancing contacts preserve
  tangent motion using metric-frame normals and a small separating speed.
  Rejected attempts restart in the original frame. Tight corners still stop
  motion when no safe slide is found; a full multi-contact solver is future work.
- Rendering has a finite step/range budget. Distant or expensive grazing rays
  can return background. No complete-distance or global visibility claim is made.
- The scene-document loader, native Godot fixtures, full H3 kit and multiplayer
  do not yet consume these lab worlds. Scene JSON validation stays restrictive.

## Verification and next work

`node tools/test.js` checks conserved energy/momenta, known geodesics,
reversibility, unwrapped fibre travel, clear spawns and repeated collisions.
`node tools/sdf-check.js` compares GPU fields and each position/velocity
component against CPU integration: 3,072 samples per case, flow lengths 0–4.
`node tools/page-check.js --worlds` covers menu transitions, movement and reset.
Run shader and real-GPU link checks after renderer changes.

Next: long-ray convergence and exhaustion measurements,
transported view frames, more legible route landmarks, then a small objective
course. Profile frame cost at full resolution before increasing scene complexity.
The new shader compile cost is small; that does not establish frame latency.
