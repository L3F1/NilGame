# Astra review: MUSE-02 through MUSE-05

Baseline: main at b9b42e7 plus the current uncommitted Muse changes.
This is source/evidence review, not integration. No new GPU runs were needed
to identify the issues below. The reported Windows runs were user-executed;
they are not new Astra or Muse executions. Application fixes remain uncommitted.

## MUSE-02: changes requested

- Remove `node tools/world-probe.js` as a runnable command. That file is injected
  into main.js by `node tools/page-check.js --worlds`; it needs browser/module
  bindings and cannot run as a standalone Node program.
- Explain that render-fixture fixes VW/VH at 800/500. Increasing CW/CH to 900/600
  can crop the captured viewport; use an example that fits or explicitly state
  this limitation. The wrapper does not forward arbitrary viewport overrides.
- Give literal copyable commands rather than an unexplained `[output.png]`
  argument. Update the environment paragraph: browser absence was the initial
  observation; the latest reported blocker is socket creation in Muse's sandbox.
- The missing image is an acknowledged verification gap, not a reason to keep
  repeating known-blocked Chrome launches. A reviewer/available host can supply
  image verification; attribute that separately from Muse's code inspection.

## MUSE-03: changes requested

- Complete the requested Space/Shift free-flight explanation. The current
  controls table still describes only jump/reel and does not explain Nil flight.
- Make the combined docs agree with MUSE-04: shortcuts 1-9, cards 10 onward.
  The previous 1-8 text made sense before that fix, but not in the final batch.
- Say Nil's climb rises 60 units, rather than describing a 60-unit helix length;
  its helical travel distance is different. Sol/SL2R are bounded chambers;
  avoid implying that Nil's infinite columns form such a chamber.
- Provide visible Fog help associated with the select's accessible description.
  A title-only tooltip is not visible help for keyboard/touch users. Preserve
  fixed-setting explanations when the menu updates; do not overwrite other rows.

## MUSE-04: implementation reasonable; regression changes requested

The one-character guard change matches the existing digit dispatch and keeps
the surrounding exclusions intact. The reported button fail-before and three
pass-after runs support the fix. Do not repeat all three backend runs.

The select and summary assertions can currently pass without processing a key:
the preceding button case has already set lastPreset to the ninth preset.
For EACH target, first select a different preset, settle, and assert the
starting preset is not the expected result. Then focus and dispatch Digit9.
Open the details before focusing its select; assert document.activeElement
matches each intended target instead of excusing failed focus. Restore details
state afterward so the added test does not change later Tab-trap expectations.

Verify the complete stable preset order, not just length === 13. A count alone
cannot prove ordering. Keep the Digit1 and menu-isolation controls. Label a
synthetic change event as a select-change handler check, not proof of native
arrow-key behavior. Per-target independence and focus assertions are meaningful
test changes even if the test count grows.

Use one healthy existing-host run after revisions, if available. Do not run
another series of 300-second retries. If browser access remains blocked, leave
the strengthened tests ready for reviewer execution with that limitation.

## MUSE-05: useful inventory; narrow factual corrections requested

- Include engine-foundation.test.js among prepareScene consumers; a repository
  import search finds both that test and tools/scene-check.js.
- level.js already has authored ORBS, ORB_POINTS and CPU/GPU radius subtraction
  (around lines 62, 165, 272 and 432). They are not scene-v1 entities, but they
  are also not just player/blast effects. Trace that existing primitive path
  briefly; it is relevant to the planned adapter.
- Native fixtures contain camera AND other rendering settings/marker uniforms;
  narrow the claim to 'no scene-v1 entity feed', rather than 'camera-only'.
- A zero exit code from tail is not evidence of the upstream tool's exit code.
  Run the short scene-check directly and record its real status, or preserve
  the producer's pipeline status explicitly. No math or schema changes.

## Environment and follow-up

Treat timeout(1) EPERM output as unreliable in the reported WSL environment.
Treat orphaned test Chrome processes as a plausible contributor supported by
the cleanup/retry observation, not proof of an exclusive driver root cause.
Never recommend killing all Chrome or even all headless Chrome: other work may
own those sessions. MUSE-06 is a scoped lifecycle fix for the test's own child.

Requested revisions are confined to the existing deliverables. MUSE-06 is the
next independent coding task. Core geometry, F4 and the editor contract remain
with Astra/Opus. No acceptance or merge is implied by reported green counts.
