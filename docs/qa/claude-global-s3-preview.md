# Whole-sphere S3 GPU preview (Claude)

Base a10ab659, Windows, Node v24.20.0, 2026-09-11. Uncommitted in the isolated
checkout. No changes to the model, kernel or fixture.

## Files

- engine/geometry/spherical-cover-renderer.js: WebGL2 first-hit renderer for
  static metric balls over one full 2πR orbit. At most 16 balls (a 17th is
  refused). Draws surface normals and landmark colours; unresolved rays are magenta.
  `read()` returns status/owner/refusal kind, float-bit physical distance and
  normal. Hits beyond πR keep their physical distance.
  `packSphericalCamera` expresses each ball in the ambient basis (position,
  forward, right, up) in double precision, so the shader forms
  (a²−c²)+b² rather than subtracting nearly equal float32 values.
  `pixelRay` gives the CPU the same pixel convention as the shader.
- The float32 guards are provisional bands, deliberately wider than the CPU's
  1e-10: tangency band on the discriminant, a wider tangent interval, a
  range/wrap band, a tie band and a nearer-hit ordering band. A start near or
  inside a ball refuses the whole frame. A later tangent does not erase a clearly
  nearer hit. These bands are not a portable GPU error bound.
- app/spherical-cover-preview.js: builds on `createSphericalFlight`. Pointer
  lock, WASD, Space/Shift and `createMouseLook` reset/spike lifecycle. Escape,
  pointer-lock change, blur and hidden-tab events clear keys and mouse input.
  `createLoopRun`: Run full loop resets once, then animates `stepLoop` legs
  (dt capped at 0.05 s) to exactly 2πR over 13 s, and never resets or snaps at the
  finish. Mouse capture stops the run where it is. The HUD shows circuit fraction,
  travel, shortest distance home and the CPU centre ray.
- tools/spherical-cover.html: labelled "No gravity and no collision". Linked
  from tools/connected-preview.html.
- `--spherical-cover` added to tools/page-check.js (writes
  .agent-bridge/spherical-cover-evidence.json and per-pose screenshots) and to
  the tools/check-queue.js page-check allowlist. check-queue.test.js gains an
  accepted/refused test for it; no existing assertion changed.

## `?check` (written, NOT run)

The check first confirms a 17th ball is refused. It then compares CPU
`castSphericalBalls` with the GPU readback at 80×60 for these poses: start,
quarter, exact antipode (w < −0.999999999), three-quarter, return, and a
noncentral turned pose (≥ 0.5 off route).

For each pose:
- A GPU hit must be a CPU hit with the same owner, distance within 0.001 and normal within 0.02.
- A GPU miss must be a CPU miss.
- GPU hits must be at least 95% of CPU hits, and the pose must have some CPU hits.
- Extra refusals, refused CPU misses and refusal kinds are recorded, and a screenshot is saved.

At least one hit beyond πR is required. Closure (position, travel and carried
frame within 1e-9) is checked after quarter steps and after clicking the loop
button. The loop-button run must take 13 s ± 1 tick, with no travel decrease and
no leg longer than speed·dt. The pose must not move after the finish, and the HUD
must show 100.0% finished.

## Evidence

- `node --check` on the 5 changed JS files: ok. The preview module imports in
  Node (the DOM boot is guarded).
- `node check-queue.test.js`: 8 passed, 0 failed.
- `node spherical-flight.test.js`, `node spherical-cover.test.js`: passed.
- `node tools/test.js`: 85/85 suites passed.
- Scratch float32 transcription of the shader decision logic (Math.fround) vs
  the CPU, same six poses at 80×60:
  - Central poses: 132/132 hits each. Noncentral pose: 404/404 hits, plus 1 GPU refusal where the CPU missed.
  - 0 confident disagreements and 0 extra refusals of CPU hits.
  - Worst distance error 5.5e-5. 602 hits beyond πR.
  - Quarter-step closure: return distance 2e-15, frame error 2e-16.
  - Loop runner: 780 legs = 13.00 s, 0 travel decreases, travel error 0, return distance 5.5e-13, frame error 6.8e-14, no movement after the finish.
  - 56 crafted near-tangent rays: 34 GPU refusals, 0 confident disagreements.
- Fail demonstrations in the same scratch:
  - With the tangent/tie bands removed, the crafted near-tangent rays give 18 confident disagreements.
  - Forming the discriminant in float32 without the double-precision packing
    did NOT fail on these poses: that packing is a safety margin I could not
    show was needed.
- Limits: this emulation uses JS atan/sqrt, not driver GLSL. It checks the
  logic, not GPU precision or GLSL compilation.

## Unrun / uncertainty

- GPU unrun: no browser, shader compile or real readback. The handoff limited
  this work to Node checks. Note that `node tools/host-probe.js` here reported
  "browser checks run DIRECTLY here" (Chrome starts; no queue worker). I
  followed the handoff and did not launch a browser.
- The GLSL is uncompiled. It indexes uniform arrays with a variable, which
  GLSL ES 3.00 allows.
- The fixture's quarter steps map the landmarks onto themselves, so the four
  central poses have identical counts. The noncentral pose is the asymmetric
  case.
- Scratch left behind: C:\Users\lflyn\AppData\Local\Temp\nil-s3-scratch\emulate.mjs.
  Deletion outside the checkout was blocked by sandbox permission; it is not in the repo.

Next task: lead integrates, then
`node tools/check-queue.js page-check --spherical-cover` on real GPU, and reviews
the saved images and the extra-refusal counts.

READY FOR REVIEW

Lead acceptance: integrated and verified on real GPU and SwiftShader. See
global-s3-preview-review.md for measured results and the lead's scope/input
corrections. The unrun statements above describe the original isolated handoff.
