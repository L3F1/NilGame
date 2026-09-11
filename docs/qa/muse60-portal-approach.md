# MUSE-60 portal approach: sphere-exit probe (Node-only)

Owner: Muse 2026-09-11. Base 52b70fd. Fixture `levels/fixtures/connected-global.nil.json`,
`compileConnectedCoverWorld`, portal `leave-sphere` (sphere-exit -> flat-return,
aperture 0.9, body 0.25). host-probe: browser checks UNAVAILABLE (no worker);
all evidence below is Node. No engine changes.

## Pinned behavior (`portal-approach-truth.test.js`, passes)

Starts built physically: +/-1 unit along portal normal from center via
`space.expAt`, aimed with `space.transport`, cameras via `createCameraFrame`.
`moveRegionProbe` toward the plane, plus `portal.crossing` radius comparison
(sight path uses radius 0, `engine/world/region-sight.js:48`).

- Front-center exits sphere -> flat, crossing recorded.
- Tested backside approach stays in sphere, 0 crossings. The nearby plane
  meeting has the wrong derivative sign for entry. The later entering root
  lies at the antipodal disc and is rejected by the finite-aperture check.
- Front radial .6 exits (.6+.25=.85<.9). Front radial .7 refused for the body
  (.7+.25=.95>.9, `crossing` returns null, probe continues in sphere).
- Zero-radius sight crosses at radial .7 (`leave-sphere`) while the .25 body
  is refused: a visible rim ray passing while the body does not is intended.
- Straight `world.spawn` route still exits: 2+ crossings, ends in flat; the
  later stop against the flat-target ball is a benign `stopped`, not a refusal.

## Fail-demo (isolated /tmp copy, source preserved, scratch removed)

Local patched copy of the S3 crossing branch with the two radial body-fit
lines deleted, run against the real compiled world:

- Rim .7, radius .25: original `null`, no-guard admits at distance ~1.0.
- Backside, radius .25: original `null`, no-guard admits at ~26.13 (~pi*R+1,
  antipodal-disc teleport).

Lead correction: removing BOTH radial guards admits the invalid .7 body
crossing. Removing either alone still passes this corpus (the other check
retains protection). The S3 branch also checks the derivative sign for entering
roots; absence of the E3 start-side early-out does not remove orientation policy.

## Defects

None found in the probed path at this base: front exit, backside refusal,
rim sight/body split, and the spawn route all behave as pinned above. The
"S3 enter works, second portal fails" report was not reproduced from the
front-center approach; if the user approaches off-center (radial >.65) or
from behind, refusal is the intended behavior, not a bug. Not probed:
rendered/GPU-side aperture appearance.

Checks: `node portal-approach-truth.test.js` PASS (all 6 blocks).
No full suite per task scope; no existing files modified.

ACCEPTED after lead review, 2026-09-11. ScopeOK, unchanged HEAD verified.
Host Node24.20.0 focused test passed. Lead independently ran root-only / final-only
guard removal (both pass) and combined removal (exit1 at .7 body assertion), then
restored scratch (pass). Main engine unchanged. Radial .6/.7 values above are
construction offsets, not an exact derived plane-intersection radius. The tested
fit classifications have ample margins. No claim to reproduce the user's exact pose.
