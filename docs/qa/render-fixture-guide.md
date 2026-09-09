# Render-fixture usage guide — MUSE-02

Three named camera views are stored as data in
`levels/fixtures/render-regressions.json` (format `version: 1`). They are
review images for the Nil exact-intersection and dropper surface-sampling
fixes, not automated assertions: the file holds no golden hashes and no
pixel-difference check runs.

## Commands

```sh
node tools/render-fixture.js nil-close-column /tmp/nil-close-column.png
node tools/render-fixture.js nil-horizon /tmp/nil-horizon.png
node tools/render-fixture.js dropper-ceiling /tmp/dropper-ceiling.png
```

With no arguments the tool prints
`Choose a fixture: nil-close-column, nil-horizon, dropper-ceiling` and
exits 1. With an unknown name it does the same. The output path is the
optional second argument; omitting it writes `<name>.png` in the
repository root (the runner spawns `tools/preview.js` with the root as
its working directory). (`tools/world-probe.js` is not runnable this
way: it has no standalone entry point and is injected into `main.js` by
`node tools/page-check.js --worlds`.)

## Resolution overrides

Render size comes from the environment, which the runner presets:

| Variable | Fixture default | `preview.js` alone |
| --- | --- | --- |
| `CW` / `CH` (render px) | 600 / 400 | 300 / 200 |
| `VW` / `VH` (viewport) | 800 / 500 | 560 / 360 |

Override with e.g. `CW=400 CH=300 node tools/render-fixture.js nil-horizon
/tmp/nil-horizon-small.png`. Keep renders small: output is software-rendered
(SwiftShader) and a full viewport takes minutes (`tools/preview.js:11-20`).
The wrapper pins the window to `VW=800 VH=500` and never forwards a
`--viewport=` override, so do not raise `CW`/`CH` past the 800x500 window:
a larger canvas is cropped by the captured viewport. Smaller values stay
fully visible and render faster.

## What each view reveals

| View | Preset | Coordinates | Camera | Meant to reveal |
| --- | --- | --- | --- | --- |
| nil-close-column | nil | nil (`NIL.transMat`) | `[10.23502525948995, 4.155661271504228, 55.7]`, yaw 0.5, pitch 0.1 | The nearby pink column keeps a single clean silhouette (exact cylinder intersection, no march-range fade). |
| nil-horizon | nil | nil | `[0, 0, 55.7]`, yaw 0, pitch 0 | Distant columns stay visible without the former range fade (4096-unit numeric guard still applies). |
| dropper-ceiling | dropper | h2r-floor (`H2R.placeAt`) | `[0, 0, 0.1]`, yaw 0, pitch 1 | The baffle underside shows no radial gray stripes (material sampled on the surface). |

Coordinate conventions are load-bearing: `nil` and `h2r-floor` select
different placement expressions (`tools/render-fixture.js:14-16`), and the
tool throws on non-finite or malformed coordinates. Never "fix" a view by
moving its camera, and never change shader code or tolerances to get a
nicer image.

## Software previews versus real-driver checks

`preview.js` bundles `main.js` into one classic script and renders it in a
headless Chrome/Edge found by `findBrowser()` — same code, same shader,
same GL calls, only the module wrapper differs. But SwiftShader is not a
GPU: ANGLE/D3D may compile a different executable on the first draw, so a
clean fixture image does not prove real-driver correctness. For driver
truth use `node tools/page-check.js --worlds`: it captures driver logs and
injects `tools/world-probe.js` into the live page, which checks GL errors
at uploads/draws. For compiler cost use `node tools/link-time.js`. See
`docs/rendering-contract.md:39-52`.

## Limitation on this client

The first observation was a missing browser: with no discoverable Chrome
or Edge, all three fixtures exit 2 with `no Chrome or Edge found; edit
findBrowser()` and produce no image. With Linux Chrome 153 installed, the
current blocker moved one layer down: Chrome cannot create sockets in this
sandbox (`socketpair: Operation not permitted`), so launches fail before
any page loads (details in `docs/qa/overnight-results.md`). Either way this
is an environment limitation, not a tool defect; editing `findBrowser()`
to reach Windows Chrome is out of scope for this guide. No fixture image
has been verified by Muse; image verification is left to a host where
Chrome can start, attributed separately from this code inspection.
