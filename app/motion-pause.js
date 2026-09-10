// What a host must do when a movement request does not simply complete.
//
// `moveRegionProbe` never replays its own leftover time, and it never guesses:
// it hands back a status, a validated state, and the unspent clock. Deciding
// what that MEANS for a session is the host's job, and REGION_MOTION_CONTRACT
// is explicit about two cases the obvious host gets wrong:
//
//   "An exhausted zero-time correction can coexist with timeRemaining=0. Hosts
//   must inspect status and pendingLift, not just the clock. Until a
//   correction-resume API is implemented, pause play and offer an explicit
//   reset to a validated spawn; do not silently drop debt or feed only
//   out.state back as if the move completed."
//
//   "An unresolved competing-event result ends this movement request. Do not
//   retry its unconsumed time in a tight loop, choose the first portal, or
//   erase source state. Show the competing IDs and retain the edit controls.
//   New steering away from the conflict, a scene edit or an explicit retry is
//   a NEW request; the old time is discarded, never accumulated."
//
// The state inside a paused result is still the kernel's LAST VALIDATED state,
// so it is safe to stand on and safe to draw. What a pause denies is
// CONTINUING from it. An owed correction fed into the next frame is a debt
// spent without ever being paid; an unresolved query replayed each frame is a
// walker who eventually arrives somewhere no single motion could have taken
// them. Both look like ordinary flight right up until they are wrong.
//
// Deliberately NOT pauses: `domain-exit`, `blocked-exit`, `stopped` and
// `budget-exhausted` -- WHEN THEY CARRY NO DEBT, which is a real condition and
// not a turn of phrase. MUSE-43 produced a `blocked-exit` still owing a floor
// lift (a walker descending onto a floor reaches a plugged aperture before the
// settle is paid) and a `domain-exit` owing one as well. This function pauses
// on those, because the debt is checked FIRST and before any status is looked
// at. An earlier draft of this comment said each of these statuses "leaves a
// fully settled state"; that was wrong about three of the four, and only the
// ordering below made the code right anyway.
//
// Debt-free, they are honest limits -- the contract's "budget exhaustion stays
// at the last validated state with remaining time reported" -- and the next
// frame asking again is a new request, not a replayed one. That carry-on is
// sound ONLY while the host reports the refusal loudly and starts each retry
// with a fresh budget and no accumulated time; `region-lab.js` counts the run
// of consecutive refusals for exactly that reason.

/**
 * Should this result END the flying session?
 *
 * Returns `null` to carry on, or a frozen reason the host can put on screen.
 *
 * Two different questions, and a host needs both answers:
 *
 *   `resumable` -- may NORMAL PLAY start again from here? A competing-event
 *   conflict can be steered or edited away, so yes, as a new request. An owed
 *   correction never can: the walker is somewhere the solver had not finished
 *   putting them, and flying on spends the debt without paying it.
 *
 *   `finishable` -- can the DEBT ITSELF be discharged? That is
 *   `resumeRegionCorrection`, a separate operation with its own budget and no
 *   gameplay time at all, and it needs the continuation the kernel issued
 *   alongside the debt. A debt without one -- the scene was recompiled, or the
 *   residual could not be turned into a usable direction -- has exactly one
 *   recovery left, and it is a reset to a validated spawn.
 *
 * Only after the debt clears does `resumable` become the live question again.
 */
export function motionPause(result) {
  if (!result || typeof result !== 'object' || typeof result.status !== 'string') {
    throw new Error('motionPause needs a region motion result');
  }
  const where = result.status + (result.detail ? `/${result.detail}` : '');
  // DEBT FIRST, and regardless of status. A correction can go unpaid under an
  // exhausted budget, under a refused crossing, or beside a clock that already
  // reads zero, and in every one of those the walker is standing somewhere the
  // solver had not finished putting them.
  if (result.pendingLift) {
    const owed = `${result.pendingLift.distance.toExponential(3)} in ${result.pendingLift.regionId}`;
    const finishable = !!result.continuation;
    return Object.freeze({
      kind: 'debt',
      resumable: false,
      finishable,
      status: result.status,
      detail: result.detail ?? null,
      text: `Movement stopped owing a correction of ${owed} (${where}). The settle was never `
        + 'applied, so flying on from here would spend the debt without paying it. '
        + (finishable
          ? 'Finish the correction first -- it is a separate operation with its own budget and '
            + 'no gameplay time -- and only then resume play. A reset to the region spawn also '
            + 'clears it.'
          : 'No continuation was issued for this debt, so it cannot be finished from here: the '
            + 'scene changed under it, or the residual has no usable direction. Reset to the '
            + 'region spawn, or edit the scene that stranded the player.'),
    });
  }
  if (result.status === 'unresolved') {
    // The competing IDs are what the author has to act on: the contract
    // requires them shown, and requires the editor to keep letting either gate
    // be edited or removed. A tie is a persistent authoring conflict, not a
    // number the solver should eventually round in someone's favour.
    const competing = (result.events ?? []).flatMap((event) => event.competitors ?? [])
      .map((c) => (c.kind === 'portal' ? `portal ${c.portalId} to ${c.toRegionId}` : c.kind));
    return Object.freeze({
      kind: 'unresolved',
      resumable: true,
      finishable: false,
      status: result.status,
      detail: result.detail ?? null,
      competing: Object.freeze(competing),
      text: competing.length
        ? `Two events the walker cannot be shown to reach in a definite order (${where}): `
          + `${competing.join(' and ')}. Nothing was crossed and the unspent time is discarded. `
          + 'Edit or remove either gate, steer away, or resume as a new request.'
        : `The movement request ended unresolved (${where}), so nothing was committed past the `
          + 'refusal and the unspent time is discarded. Steering away, editing the scene, or '
          + 'resuming are each a NEW request; the refused one is not retried.',
    });
  }
  return null;
}
