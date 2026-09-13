# S3 ball hit contract audit (review only)

Base 57bcce5. Read-only review of SPHERICAL_CURVE_ERROR.md, SPHERICAL_ROOT_PRECISION.md,
connected-shader.js solve/sweep/trace (171-379), additive-event-order.js. No code changed.
No new constants are claimed proven.

## 1. Shared-sincos error gives no phase/time bound

The bound `C·x <= H + 2^-16 W + 256 MIN_NORMAL` holds for ANY common x, so it says nothing
about x versus t/R. It can prove a **leg-wide exterior**: an upper bound on H below c is also
an ideal miss. That can turn some tangency refusals into misses. It cannot place a root in
time. Root bands still need:
- float32 error for a,b,c (dots, packed sign conversion, portal-transfer input error);
- error of `a2(b,a)` and `ac(ratio)` in solve. These are separate from sincos and have no derivation;
- the unbounded `1/sqrt(h^2-c^2)` sensitivity. Tangency stays an ambiguous band;
- `c>0` from sphericalRootBounds. solve takes negative ratio via +PI; balls with radius >= πR/2 need a derivation.

The `4E` threshold and spread at line 210 are tuned, not derived.

## 2. Reusing firstAdditiveEntry

No engine code calls it yet. It is sound only with:
- **Additive-only region:** single-surface additive balls (`pr.y==1`, `pr.w>.5`) and no
  subtractive groups.
- **Certified outside start:** `occupancy` uses ±E thresholds, which is not a proof. Each ball
  needs an outward exterior proof at p that includes input error, including reverse-portal starts.
- **All periods enumerated:** `k=-1..2` needs a certified horizon/R < 2π. More than 32 bands
  must refuse, never truncate.
- **Portal/edge time as a band [gL,gU]:** today `t`, `portalUncertain` and `edge` are
  E-tolerance point estimates. `horizon=gL` is safe for status 1, because the chosen
  band's upper bound lies below every discarded band. Status 0 does **not** certify a
  crossing if any band has lower <= gU, so check that explicitly. The portal rim band
  (4E) has no derivation.
- A tangency band on a nearer ball still refuses. The only gain is a certified nearer entry
  or a proven miss.

The H3 path is not a band-ordered precedent. It inserts `enterBand.y` midpoints separated by
4E, which SPHERICAL_ROOT_PRECISION forbids. Reuse its enter/exit packet shape, not that sweep.

## 3. A band midpoint does not certify the shaded hit

A certified entry band proves ordering and owner only. Shading at the midpoint q also needs:
- position error <= half the band width plus evaluation error. at() still calls cs/sn separately;
- normal error of `normalize(n-(n·q)q)`, amplified by about 1/sin(radius/R);
- sign/facing stability at grazing incidence;
- bounds on the `tangent` and `traveled+hitAt` handed downstream;
- a declared shading tolerance. None exists.

## Smallest safe integration

1. A default-off variant for S3 regions with only additive single-surface balls.
2. A float32 GLSL port of sphericalBallRootBounds with its own operation analysis. The JS
   64-epsilon allowance does not transfer. Refuse on overflow.
3. A certified exterior check at the start. Otherwise use the existing sweep.
4. firstAdditiveEntry with `horizon=gL`, plus a band check against gU before any crossing.
5. On status 1, emit the band as a diagnostic. Keep the current colors until section 3 is
   derived and approved.
6. Check parity with the existing sweep and count the 52 gallery refusals. Recolor none.

## Missing assumptions

Float32 a/b/c error; a2/ac error; portal-transfer error; c<=0 case; period-count bound;
certified outside start; portal/edge band; shared-pair at(); normal and shading tolerance;
binary32/FMA model on the target backends.

## Checks

`node tools/host-probe.js`: BLOCKED (needed approval in this non-interactive session). No
browser or Node suites run (review only).

READY FOR REVIEW
