# Live first-transfer exclusion pass (opt-in) — Claude

Base 94f0a44, isolated clone `.agent-bridge/runs/…/claude-live-miss-pass/checkout`,
host LeoPC (win32), node v24.20.0. `node tools/host-probe.js` run once:
`VERDICT: browser checks run DIRECTLY here` (no queue worker serving).
No commits, pushes or queue work from this clone.

## Files

- `engine/geometry/spherical-miss-pass-glsl.js` (new) — the interval helper,
  moved verbatim from the app experiment, plus the exclusion program source.
- `app/spherical-miss-experiment-glsl.js` — now re-exports it; the experiment's
  import path and behaviour are unchanged (asserted by identity in the suite).
- `engine/geometry/spherical-miss-pass.js` (new) — the separately drawn pass.
- `engine/geometry/connected-shader.js` — consumption only.
- `engine/geometry/connected-renderer.js` — `sphericalMissPass` draw option.
- `app/connected-global-preview.js` — check-mode before/after evidence.
- `spherical-miss-pass.test.js` (new) — 131 checks.

## Behaviour

`draw(state, {sphericalMissPass:true})` draws one extra full-screen pass into
its own MRT framebuffer before the main draw: RGBA32UI (portal index + 1, a
48-bit packed-surface bitset, tag 21393) plus two RGBA32F attachments holding
the transferred point and direction. Default is false; there is no automatic
admission and no vendor heuristic anywhere.

The pass certifies only: E3 source chart → its nominated first entered aperture
→ a stable `e3S3TransferSelected` to an S3 destination → `firstTransferBands()`
→ `sphericalMiss(-D(2i), -m.z)` (both packed signs reversed) for surfaces that
are additive one-surface metric balls of that destination, never a group base
with modifiers and never in any subtract/intersect mask.

`CONNECTED_FRAGMENT` gained no interval arithmetic, no root, no hit point and no
epsilon or precision constant. It accepts a certificate only when `uMissPass==1`,
`uAntialias==0`, `crossing==0`, the transfer was `stable`, the tag matches, the
portal index equals its own selected `gate`, **and** its own `newP`/`newU` equal
the certificate's bitwise. A certificate only omits its own surface's primitive,
only in the region it was proved for, and any further crossing retires it. The
effect is `omitted[j]`, the existing half-space-exclusion path — so root
ordering, hits, fallback, diagnostic reasons and motion are untouched, and the
only reachable change is an unresolved pixel becoming a settled one.

Association is the whole draw description (world revision, region, pose,
viewport, range, centre-sample offset). Certificates are regenerated for every
eligible draw and never cached, so staleness is impossible; world replacement
bumps the revision and invalidates, resize invalidates. Refusals — `disabled`,
`unsupported`, `antialias-refused`, `unknown-region`, `incomplete-framebuffer`,
`gl-error`, `offset-samples`, `invalid-size`, `invalid-range`, `missing-world`,
`program-failed` — are counted in `renderer.missPass.stats` and always render
through the existing path. Framebuffer, draw buffers, viewport, program and
texture unit 0 are restored before the main draw. A missing GPU timer reports
`gpuStatus:'unsupported'`, never zero cost.

Evidence hooks: `renderer.readMissPass` (debug 8: accepted certificates and
omissions per pixel) and `pass.readCertificates` (candidates produced), so
disabled / unsupported / candidate / consumed are all distinguishable.

## Checks run

- `node spherical-miss-pass.test.js` — **131 checks passed**. Covers wrong
  portal/surface identity, world replacement, pose/resize/range/region
  association, AA fallback, positive-c packing, injective surface→primitive
  mapping, carved-primitive ineligibility, GL state restore ordering, refusal
  counters and uniform coverage of both programs.
- `node tools/test.js` — **135/135 suites passed** (full Node suite, after the
  candidate was complete; not repeated since, only the new suite changed).
- Negative checks, scratch mutations, each restored (`git status` clean after):
  9/9 caught — drop portal-identity check; drop transfer-result identity; drop
  AA refusal; drop certificate region gate; drop world-replacement invalidation;
  drop revision from the association; consume regardless of pass status; ignore
  an incomplete framebuffer; leave the exclusion framebuffer bound.
- Scratch headless-ANGLE (SwiftShader) compile: both programs compile and link,
  all four new consumer uniforms survive optimisation, `EXT_color_buffer_float`
  present, RGBA32UI + 2×RGBA32F MRT framebuffer-complete.

## UNRUN / BLOCKED

- **Browser check mode UNRUN.** The gallery `livePass` block in
  `connected-global-preview.js` (before/after packets, CPU disagreements, saved
  images, frame timings) has not been executed; this clone must not use the
  queue and no browser run was required here. Its numbers are therefore absent,
  not zero.
- **Real-GPU behaviour UNPROVEN.** Node has no WebGL2, so every GPU predicate is
  checked as source and through a recording WebGL2 double. SwiftShader proves
  compilation, not rendering.

## Remaining risks

1. **The optimisation may do nothing on real hardware.** Acceptance requires the
   main program's `newP`/`newU` to be *bitwise* equal to the pass's. Both
   evaluate the same `E3_S3_TRANSFER_GLSL` on the same inputs, but that is not
   guaranteed across two separately compiled programs. A mismatch is safe — the
   certificate is discarded — but yields zero recovered pixels. `readMissPass`
   candidates-vs-accepted is exactly the measurement for this; if the gap is
   large, the fix is to export the interval band and compare containment, which
   costs more attachments. This is the first thing to measure.
2. Cost is one extra full-screen pass per eligible draw with no caching. That is
   deliberate (staleness-free), but it is a real per-frame cost that only the
   host GPU run can price.
3. The pass nominates its own first aperture with the live E3 rules but is more
   conservative (any rim or tie ambiguity refuses outright). A nomination that
   disagrees with the tracer is discarded, so this is a hit-rate question, not a
   soundness one.
4. `uniform-coverage.test.js` does not reach the connected programs at all
   (pre-existing; outside allowed writes). The same rule is enforced for both
   programs inside `spherical-miss-pass.test.js` instead.

## READY FOR REVIEW
