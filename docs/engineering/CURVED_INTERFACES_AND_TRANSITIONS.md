# Curved boundaries and transition regions

Direction note, 2026-09-12. Future scope after the polished E3/full-S3/H3 editor;
no new runtime or saved-format capability is claimed here.

## Surface shape does not choose the connection policy

Keep three separate concepts: a boundary surface, correspondence across that
surface, and the geometry of any intervening volume.

For a controllable spherical ability, extend the gameplay correspondence family
first. Map directions on a closed sphere with an explicit orientation and scale
policy; transport/map camera and velocity under that policy. A disc's planar
radial coordinates do not cover a sphere: use unit directions or multiple charts,
specify seams, crossing side and repeated entry/exit. Terrain clipping, deformation
and safe expiry are separate from mapping the player or a ray.

For a seamless geometrical join, use the matched-interface family described by
[Celinska-Kopczynska and Kopczynski](https://archive.bridgesmathart.org/2022/bridges2022-297.pdf):
intrinsic surface metrics agree, with their additional extrinsic-curvature
condition. Curved surfaces are allowed; arbitrary pairs of shapes are not.
The paper's intrinsically spherical portals are not a ready implementation of a
closed E3-to-S3 bubble. Do not promise a distortion-free direct round interface.

For example, a geodesic sphere at physical radius r has angular scale
f(r)=r in E3, R sin(r/R) in S3, R sinh(r/R) in H3. Matching f matches the round
surface metric, but does not also match f'/f, its principal curvature (with
orientation accounted for). Matching aperture size alone is insufficient.
These are model-space deductions, not new implementation evidence.

## A transition is a new metric region

On compatible local coordinates, pull both positive-definite metrics back to
the SAME tangent bundle, then a smooth weight 0<=w<=1 gives
g=(1-w)g0+w*g1. This stays positive definite. Use smooth endpoint plateaus to
recover each side in a neighbourhood of the boundary. The chosen correspondence
is part of the construction; interpolation is not independent of that choice.
This standard metric-patching mechanism is explained in
[Freed's notes, Lecture 10](https://people.math.harvard.edu/~dafr/difftop.pdf).
Do not interpolate the ambient S3 Euclidean/H3 Lorentz four-vector forms: the
objects being blended here are positive-definite three-dimensional metrics.

This construction is local. It does not turn the global topology of R3 into S3,
nor guarantee completeness, navigability or a monotonic curvature gradient.
In dimension >=3, sectional curvature equal in all planes at each point must
be constant on a connected space (Schur). A genuine spatial transition therefore
cannot just assign an isotropic constant-curvature slider to every point.
See [Schmidt, Theorem 5.25](https://www.wim.uni-mannheim.de/media/Lehrstuehle/wim/schmidt/FSS2024/Riemannian_Geometry/Web/RGch5.html).

Candidate first experiment: one static symmetric corridor or shell with an
explicit smooth metric. Integrate geodesics and parallel transport from its
metric derivatives, with bounded numerical error and swept contact checks.
Do not blend endpoint distances, completed rays, camera frames or screenshots.
Distance bounds must be derived for the new metric rather than inherited from
either endpoint. Narrow transition layers may increase curvature and numerical
cost, so thickness is not purely a cosmetic parameter.

Reuse constant-curvature analytic paths outside the transition volume. Inside,
the region owns metric evaluation/derivatives, numerical advancement/transport,
domain events and field guarantees. This fits the existing region boundary but
requires a numerical adapter; it is not supported merely by another geometry ID.
Acceptance should include endpoint matching, positive definiteness, conserved
geodesic speed, transported-frame metric products, reversal/convergence, collision
and CPU/GPU comparisons. Moving or expanding bubbles add time dependence later.
