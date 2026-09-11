# Connected complete-S3 host (Claude)

Base 518fd48, LeoPC Windows, Node v24.20.0, 2026-09-11. Uncommitted, isolated checkout.
No kernel, renderer, shader, fixture, geometry or tolerance changes.

## Files

- app/connected-global-model.js: `createConnectedGlobalPreview(doc)` compiles the fixture
  with `compileConnectedCoverWorld` (never calls renderData). Flight uses
  `moveRegionProbe` at speed 4 with body radius; buttons step 0.25. No gravity.
  Reference up is carried: before a move its coefficients in the camera axes are
  stored and reapplied to the returned axes, so it follows the solver's net frame map,
  including portals. Yaw turns about that up; pitch is clamped to ±1.5 against it.
  A halt or correction debt refuses motion/look; reset/spawn-flat/spawn-sphere recover.
  `sight`/`pixelSight` REQUIRE explicit maxDistance. `status()` says
  `COMPLETE S3 · radius 8 · no chart boundary, no floor`.
- app/connected-global-preview.js + tools/connected-global-preview.html: pointer
  flight, existing mouse-look lifecycle, buttons, spawns. `?check` uses
  `renderer.packed.maxDistance` (throws if absent). It runs a one-pixel sight through
  both portals, then 80×60 parity at spawn, quarter, antipode and return during actual
  `advance` flight. A noncentral turned sphere pose follows. Thresholds are
  status/region/owner, distance .001, normal .015, ≥95% of CPU hits. Also checks
  roll after 600 looks, shots, GPU times and `/__report`.

## Checks (this checkout)

- `node connected-global-model.test.js`: PASS. Covers roll after 600 E3 look loops and
  high-pitch yaw (elevation 1.5 and heading). A 602-frame pitched flat→S3→flat
  route passes the antipode, with up against analytic [0,0,1]/[0,0,1,0] at 1e-7.
  120 noncentral S3 frames with looks match `space.stepWithTransport` (1e-9).
  Also domain-exit halt refusal/reset, spawns, buttons and 64 vs 32 sight range.
- Existing connected-cover, connected-preview and connected-camera tests: PASS.
  camera-frame.test.js exits 0.
- Browser check: NOT RUN. The host probe allowed direct runs, but the mixed-world
  renderer packet is lead-owned and `renderData` still throws at this base.
- Fail-demos: BLOCKED. Running the isolated temp-copy mutation script needed approval,
  which was not given. Planned mutations: camera-own turn, endpoint frame up,
  chart-up look, uncarried up, unrefused halt and no clamp. Unproven whether the test
  catches each. One real failure did occur: a wrong wish in the test halted at frame 184.
- Scratch left outside the checkout (removal blocked by permissions):
  `%TEMP%/claude-global-probe.mjs`, `%TEMP%/claude-global-faildemo.sh`.

## Limitations / assumptions

- The GPU packet layout is assumed to match connected-preview. Channel 0 is status,
  1 is region+1, 2 is primitive+1, and 3 is the reason (1 = boundary). S3 normals are
  ambient components. The lead must confirm this.
- The empty sphere is likely visually uninformative. Off-axis rays mostly miss, so only
  portal discs and flat-target give hits. Each record carries `vacuous` if a view has
  no CPU hits. The noncentral pose may be vacuous.
- Menu links and queue wiring are not added (lead).

READY FOR REVIEW (fail-demo mutations BLOCKED by approval; browser check unrun)

## Lead acceptance - 2026-09-11

Accepted after integrated Node and NVIDIA/SwiftShader browser checks. Lead caught
and fixed native-trig shader error before acceptance. Lead mutation checks caught
removed pitch clamp and removed reference carry. The direct stepWithTransport
reference is independent of the host path, not independent of metric mathematics.
One bridge unexpected path was the lead-supplied contract; HEAD remained intact.
See connected-global-gpu-review.md. No model quota retry or automatic review ran.
