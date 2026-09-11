# MUSE-49: independent connected sight audit (2026-09-10)

Own fixtures throughout (offset E3 pair, E3-S3-E3 route, occlusion, ties,
budgets, inside starts, thin foil, S3 ball, range ends). Tangents
recomputed from compiled anchors and metric logAt — the one place the
first draft reused the implementation's own frame (author-vector diffs
instead of entry-based logAt) it threw, which is itself the lesson about
where S3 tangent spaces live. No engine/app changes. Durable test:
`connected-sight-truth.test.js` (6/6).

Host probe (required paste; environment not investigated further):

```text
host      : LeoPC (linux, WSL), node v22.23.2
repo      : /mnt/c/Users/lflyn/Projects/NilGame @ 556cd5f
```

## Findings (all hold)

- Distance accounting: E3 route crosses at 2.0100 of 22.0431 total;
  E3-S3-E3 legs total exactly 3.00/4.00/20.00; segment sums equal the
  total and distance + remaining equals maxDistance on every route.
- Segments chain within each region; crossing entry/exit match the
  compiled transit recomputed here; carried tangents agree with the
  outgoing legs to 1e-9 — both crossings, plus 3 S3 approach angles.
- The continuation past the exit (b-leg 20.82 from the exit point) is
  the within-call proof that the reverse self-hit is suppressed; a fresh
  call starting exactly at the mapped exit refuses as aperture-side,
  correctly — an unrelated on-plane start, not a suppressed reverse.
  (First misread as a defect during probing; the call boundary is the
  distinction.)
- Occlusion: source ball hit at 0.6031, zero crossings. Inside-solid
  starts hit at 0.0000 — never a confident miss.
- Competing gates at one distance tie with zero crossings. Closed gate,
  one-shot gate, and a shared work pool (maxWork 10/13 bite mid-route)
  all refuse exactly.
- Thin foil 0.59 past the exit: crossed first, then hit at 2.59.
- S3 ball: surface-candidate on all approaches (certified 2.4 against a
  2.2e-16 candidate field) — the bound nearly touches and still does not
  certify. Never a hit.
- Range ends: hit exactly at maxDistance counts; 1e-7 short is
  range-boundary with the miss assigned to the range; clean miss spends
  the full 30 to domain-exit. Ray input never mutated.

## Fail-demo (isolated copy, repo untouched, removed after)

Removing the aperture-tie check in a /tmp copy with absolute imports:
the tied scene crosses the first gate (0 → 1 crossings, domain-exit in
b) where the product ties. A side-tag-removal variant was attempted and
is itself informative: on fresh calls it changes nothing, because the
tag only exists within a call that already crossed — which is why the
fresh-call rule and the tag are two mechanisms, not one.

## Limits

Sampled routes: one E3 pair, one S3 route at R=8, three S3 angles, one
tie geometry, one foil thickness. Portal orientation coverage beyond
axis/tilted pairs is open.

## Revision (Astra review): crossings at R=0.5 and R=100

New check `E3-S3-E3 crossings at R=0.5 and R=100 with closed-form
lengths`; the six original checks are untouched. Same E3-S3-E3 shape with
in-domain charts (R=0.5: extent 0.7 < pi*R/2, anchors +-0.35, aperture
0.3; R=100: extent 8, anchors +-2, aperture 1.5). Two fixture facts were
learned by measurement, not assumed: portal links require matched
aperture radii on both anchors, and the link compiler requires the
aperture to admit the player (0.15 at R=0.5 refused with `does not admit
the player`), so the small-orb fixture uses 0.3 throughout.

The reference is test-local normal coordinates, written from the chart
definition: decode(a) sits at geodesic distance |a| from the chart center
along the author direction on the unit 3-sphere, so physical length is R
times the embedding angle. It is gated against space.decode at the
anchors (agree to 1e-12) and uses no other production geometry. Measured:

```text
R=0.5: legs 3.0000,0.7000,20.0000 angle=1.400000
R=100: legs 3.0000,4.0000,20.0000 angle=0.040000
```

Both legs match closed form (3 / 2*apos / 20) to 1e-9; the inter-anchor
angle matches 2*apos/R to 1e-12 (1.4 vs 0.04 rad — the same physical S3
leg through very different curvature). At each radius both carried
tangents agree compiler-carry vs travelled leg, and each travelled leg is
independently a unit tangent at its exit (own hypot/dot: |t| = 1, t.x = 0
on the orb side). connected-sight-truth.test.js 7/7.
