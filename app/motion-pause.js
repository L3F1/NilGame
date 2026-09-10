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
// Deliberately NOT pauses: `domain-exit`, `blocked-exit`, `stopped`, and a
// `budget-exhausted` carrying no debt. Each of those is an honest limit that
// leaves a fully settled state -- the contract's "budget exhaustion stays at
// the last validated state with remaining time reported" -- and the next frame
// asking again with a fresh budget is a new request, not a replayed one. They
// are reported loudly and they do not end the session.

/**
 * Should this result END the flying session?
 *
 * Returns `null` to carry on, or a frozen reason the host can put on screen.
 * `resumable` says whether an explicit retry is even offerable: a competing-event
 * conflict can be steered or edited away, whereas an owed correction cannot be
 * resumed by anything that exists yet, so its only sound exit is a reset to a
 * validated spawn.
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
    return Object.freeze({
      kind: 'debt',
      resumable: false,
      status: result.status,
      detail: result.detail ?? null,
      text: `Movement stopped owing a correction of ${result.pendingLift.distance.toExponential(3)} `
        + `in ${result.pendingLift.regionId} (${where}). The settle was never applied, and there `
        + 'is no correction-resume API, so flying on from here would spend the debt without '
        + 'paying it. Reset to the region spawn, or edit the scene that stranded the player.',
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
