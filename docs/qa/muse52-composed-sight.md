# MUSE-52: independent composed S3 sight audit (2026-09-10)

`castSphericalRegion` and default `traceRegionSight` (s3Method 'events')
audited against independent geodesic/sign references on compiled scenes:
own cos/sin stepping, dot-product predicates, bisection roots, closed
forms on central rays. Claude's fixture/tool files not imported. No
kernel, renderer, schema, or old-test changes. Durable test:
`connected-s3-query-truth.test.js` (9/9). No wrong hit/miss found; one
known completeness limit recorded with a constructed repro.

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ a1c0da7
VERDICT: browser checks run THROUGH THE QUEUE here.
```

(Node-only task; no browser checks needed.)

## References (measured)

```text
R=0.5: hit at 0.335085 (bisected 0.335085), owners b/b
R=8: hit at 2.175759 (bisected 2.175759), owners b/b
R=100: hit at 2.180753 (bisected 2.180753), owners b/b
global hit 5.1000 (carve/b reversed); scoped hit 4.2000 (b/b)
carved entry hits carve-exit 3.0169 (bite/box reversed); low ray hits wall 2.4976 (box/box)
scaled pole dev 5.0e-9, distances 4.220803 == 4.220803; drift screens refuse
empty miss (work 1), inside hit at 0 with owners [bl], guard-close ambiguous-origin
total 3.4000 = 3 + local 0.4000 (bisected); work 11; zero-remaining exit misses at 3
cast refuses at 0/1/2, hits at 4; sight work 4 = 1 + cast 3; sight zero refuses
ball-only hit at 0.6170; with coincident faces: unresolved/primitive-events over coincident-events (known limit)
cutter-face origin: unresolved/primitive-events
inside-two-balls origin: hit/inside at 0, owners [ba,bb], owner null
```

- Oblique compiled balls: cast distance equals the bisected root to
  1e-9 at all radii; entry normals oppose travel; owners exact.
- Scoped vs global cutters distinguished by behavior, not code: A ball
  half-carved by a global subtractor is entered through the carve (no
  hit) and exited at the carve boundary (hit, normal reversed, owned
  carve-in-B); the same carve targeted at A never bites B (hit at B
  entry, unreversed, owned b/b). Reversed means exactly negated
  outward: outward is (E.C)*E - C (the EC factor matters; EC != 1).
- Subtracted cell with partial face coverage: carved entry misses the
  wall, carve exit inside the cell hits reversed (bite/box); an
  uncarved ray hits the wall normally (box/box) at a bisected face root.
- Decimal plane poles: stored pole keeps its 5e-9 scale (nothing
  renormalized it), hit distance identical to 9 decimals, normals
  identical. Drifted ball centers and drifted rays still refuse
  input-roundoff.
- Zero casts: empty origin misses (work 1 = one classification),
  occupied origin hits inside at 0 with null normal and named owners,
  guard-close origin is ambiguous-origin.
- E3-S3-E3 route through an obstacle just past the exit: total 3.4 =
  gate 3 + local 0.4, local bisected from the crossing exit, segments
  chain, route work exactly 11. Zero remaining at the exit keeps the
  crossing and misses exactly at maxDistance.
- Work: cast refuses at allowance 0/1 upfront and 2 while applying,
  hits at 4; the coordinator charges back exactly (sight 4 = 1 + cast
  3); sight allowance 0 refuses work-budget.
- Cutter-face origin (exactly on a subtractor face bounding nothing)
  refuses primitive-events, never a confident miss. Origin inside two
  balls names both owners with a null single owner.

## Known completeness limit (recorded, no repair demanded)

A ball-only hit at 0.6170 becomes `unresolved/primitive-events` (detail:
coincident-events) when a cell with exactly coincident later faces is
added: the merged guard screen runs before the walk, so a distant
coincidence refuses an earlier valid hit. The hit is real (control
without the cell), the refusal is conservative, and per the task this
stays a documented limit.

## Fail-demo (isolated /tmp copy, repo untouched, removed after)

Removing the subtraction reversal (`reversed ? -x : x` → always `x`)
in the copy only: 7 pass, 2 fail — exactly the reversed-normal checks:

```text
FAIL global cutter carves both groups; scoped cutter bites one: global: subtraction normal reversed
FAIL subtracted cell: partial faces, reversed normal, owning solids: carve-exit normal reversed
```

## Reference limitations

- References share cos/sin geodesic evaluation with production; root
  independence is analytic-solve vs bisection, not a second geometry.
- Dense scans (misses) are sampled evidence, not thin-solid proofs.
- The coincidence aim is re-derived in-test; deterministic given
  identical float arithmetic. Multi-region work pin (11) counts
  coordinator spends; a spending change fails it by design.
- Out of scope: E3 cutters, intersect modifiers, portals inside S3
  solids, near-antipodal rays, browser rendering.
