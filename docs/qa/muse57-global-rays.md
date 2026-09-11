# MUSE-57: global S3 ray truth (accepted)

Independent check of EXISTING `castSphericalBalls`
(`engine/geometry/spherical-cover.js`)
against test-local chord-membership sampling + bisection. No kernel edits.

## Files

- `global-s3-ray-truth.test.js` (new, 81 cases, 0.11 s on Muse's host)
- `engine/geometry/*` untouched (`git diff -- engine/` empty)

## Coverage (R = 0.5/8/10000, deterministic mulberry32 poses)

Per R: 8 rotated-pose hits (theta 0.5–5.8 rad) with entry/normal/surface
asserts; 4 two-ball nearest selections in both input orders; 2 beyond-piR
far-side hits with distance > piR; 2 finite-range misses (range cut,
off-orbit periodic); later-tangency-behind-kept, tangency-ahead-refuses,
lone-tangent refusal; coincident owners; zero budget.

## Results

- `node global-s3-ray-truth.test.js` — 81/81 pass, worst entry err/R
  5.33e-15, surface err/R 4.04e-15.
- `node spherical-cover.test.js` — existing suite still passes.
- Fail-demo (isolated /tmp copy, engine restored, scratch removed):
  piR-cap mutant (`end=min(maxDistance,pi*R)`) returns `miss` on the
  1.3piR far-side ball, and the committed test fails against it
  (`theta=3.6: expected hit, got miss`). Test fails without the behavior.
- No counterexample found; nothing to repair. One test-side construction
  bug was fixed during authoring: lateral offsets must be transverse to
  the ray direction or a "grazer" becomes a clean hit.

## Host / limitations

Host: LeoPC (linux, WSL), node v22.23.2 @ a10ab65.
`node tools/host-probe.js` verdict: browser checks UNAVAILABLE (no
AF_UNIX/VSOCK, no queue worker) — Node-only per task, no browser run.
Sampled-not-proven boundary: the 720-step reference brackets radius-0.1R
balls (hard throw if it cannot) but could miss grazing entries narrower
than the grid; tangency paths are asserted by status/reason, not by the
sampling oracle. Full suite not run (Node-only scope).

Accepted by Astra after host rerun (81/81, Windows Node 24.20.0) and an isolated
hemisphere-cap mutation failing on the expected far-side hit. No assertions changed.
