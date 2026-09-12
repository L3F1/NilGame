# MUSE-66 — H3 camera numerical envelope (Node only)

Independent stress checks at radial rho 1.9 (inside author extent 2R) and 3.9
(representation-only; extent 2R, range 4R), R in {0.5, 8, 10000}, three fixed
seeded non-axis directions. Points built as `(sinh(rho)*d, cosh(rho))` and
forward/up by a file-local Lorentz projection + Gram-Schmidt; the oracle is a
file-local Lorentz form, never the adapter's `dot`. No triangle holonomy
corpus duplicated. Suite: `node hyperbolic-camera-envelope.test.js` — 7/7 pass.

## Worst measured residuals (bound 1e-10; handedness volume 1e-9)

| Check | Worst |
|---|---|
| Projector identity on valid tangents | 1.9e-11 (input-construction noise; adapter basis alone exact to 0) |
| Gram / tangency of assembled cameras | 2.3e-13 |
| Handedness oriented-volume gap | 8.0e-13 |
| Short carried turns (yaw 0.2, pitch -0.1, carry 0.05R inward, rho stays < 4) | 2.3e-13 |
| Radial drift repair (0.02·p dirtied input, re-aim vs clean) | 6.6e-13 |
| Euclidean-projector fail shape | 78.2 deg worst aim error (old path wrong, still tangent) |
| Degenerate refusal (zero forward, parallel up) | throws at all 18 points |

Domain flags behave: rho 1.9 authored, rho 3.9 refused by `encode` while the
camera still assembles (representation-only use). No counterexample found; per
instructions no repair was attempted.

## Limitations

Sampled evidence only: 18 points, short inward carries; outward steps near rho
3.9 and long walks were not probed. R enters only through travel scaling —
coordinates are rho-native, so the R sweep is thin. Browser/GPU, schema,
portal, and full-suite checks out of scope and unrun (host-probe: no Chrome
worker here). Base 2e44c7b; no source edits.
