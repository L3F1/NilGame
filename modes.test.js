// modes.test.js -- the round system, the hoops, and the course.
//
// Run with: node modes.test.js
//
// The summary line goes LAST and process.exit after IT. physics.test.js once
// carried an exit in the middle of the file and silently skipped the last 59
// tests on any failure; see CLAUDE.md.

import {
  dot, dist, point, geodesic, apply, IDENTITY, setSolid, SOLID,
  closedGeodesicDirs, closedGeodesicLength, placeAt, OCT_GEN,
  reduceToDomain, reorthonormalize,
} from './hyp.js';
import {
  HOOP_R, hoopAt, geodesicCourse, hoopCrossed, carryCourse, hoopRing,
  hoopNear, hoopFolded, grappleCourse, gateOpen, gateProgress,
  PHASE, makeRun, startRun, resetRun, runStep, runProgress, formatTime,
} from './modes.js';
import { levelSDF, setMode, MODE } from './level.js';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}  ${detail}`); }
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

setSolid(SOLID.OCTAGON);

console.log('a hoop is a disc of geodesic plane');
{
  // The same primitive as the sightline cutter. Its three invariants are what
  // make asinh(<p,N>) an exact signed distance, so they are worth pinning
  // rather than assuming: get any of them wrong and the plane is still A
  // plane, just not the one through the hoop.
  const u = [1, 0, 0];
  for (const t of [0.2, 0.9, 1.7]) {
    const h = hoopAt(IDENTITY, u, t);
    check(`at t=${t} the centre is on the hyperboloid`, close(dot(h.at, h.at), -1));
    check('  the normal is unit spacelike', close(dot(h.N, h.N), 1));
    check('  and orthogonal to the centre, so the plane passes through it',
      close(dot(h.at, h.N), 0, 1e-12));
    check('  and the centre is exactly t along the geodesic',
      close(dist(h.at, point(IDENTITY)), t, 1e-9));
  }
}

console.log('');
console.log('the ring drawn round it lies IN the plane');
{
  const h = hoopAt(IDENTITY, [0, 1, 0], 0.8);
  const ring = hoopRing(h, 24);
  check('the ring closes', dist(ring[0], ring[ring.length - 1]) < 1e-12);
  check('every point is on the hyperboloid',
    ring.every((p) => close(dot(p, p), -1, 1e-9)));
  check('every point is exactly HOOP_R from the centre',
    ring.every((p) => close(dist(p, h.at), HOOP_R, 1e-9)));
  // The one that matters for drawing: the ring must be IN the hoop's plane, or
  // it is a circle somewhere else and the gate you see is not the gate you fly
  // through.
  check('and every point is IN the plane the crossing test uses',
    ring.every((p) => close(dot(p, h.N), 0, 1e-9)));
}

console.log('');
console.log('crossing a hoop');
{
  const h = hoopAt(IDENTITY, [1, 0, 0], 1.0);
  const on = (t) => point(geodesic(IDENTITY, [1, 0, 0], t));
  check('a segment straight through the middle counts',
    hoopCrossed(on(0.9), on(1.1), h));
  check('and it counts from the other side too - a gate, not a door',
    hoopCrossed(on(1.1), on(0.9), h));
  check('a segment that stops short does not',
    !hoopCrossed(on(0.7), on(0.95), h));
  check('nor one that starts past it',
    !hoopCrossed(on(1.05), on(1.4), h));
  // Through the plane but outside the rim. Offset sideways by more than the
  // radius, which in this geometry means measured with dist, not coordinates.
  const side = (t) => {
    const M = geodesic(IDENTITY, [1, 0, 0], t);
    return point(geodesic(M, [0, 1, 0], HOOP_R * 2.2));
  };
  check('crossing the plane OUTSIDE the rim does not count',
    !hoopCrossed(side(0.9), side(1.1), h));
}

console.log('');
console.log('a course laid along a closed geodesic');
{
  const c = geodesicCourse(0, 6);
  const u = closedGeodesicDirs()[0];
  const L = closedGeodesicLength();
  check('it has the hoops asked for', c.hoops.length === 6);
  check('the axis really is a closed geodesic of this manifold',
    close(c.length, L, 1e-12) && L > 0);
  check('every hoop sits on that geodesic',
    c.hoops.every((h, k) =>
      dist(h.at, point(geodesic(IDENTITY, u, ((k + 1) * L) / 7))) < 1e-9));
  // Evenly spaced, and none of them on the start line -- a hoop at arclength
  // zero would be taken on the first substep, before anyone had flown.
  check('none of them is on the start line',
    c.hoops.every((h) => dist(h.at, point(IDENTITY)) > 0.1));

  // THE property the mode is built on. Fly dead straight for one translation
  // length and you are back where you began, having turned nothing.
  const home = point(IDENTITY);
  const lap = point(geodesic(IDENTITY, u, L));
  const back = reduceToDomain(reorthonormalize(geodesic(IDENTITY, u, L)))[0];
  check('flying straight for one length returns you to the start',
    dist(point(back), home) < 1e-9,
    `off by ${dist(point(back), home).toExponential(2)}`);
  check('  and it really did go somewhere - it is a lap, not a no-op',
    dist(lap, home) > 2.0);
}

console.log('');
console.log('flying the course');
{
  // The integration test: fly straight down the axis in substeps and take
  // every hoop, in order, without steering.
  const c = geodesicCourse(0, 6);
  const run = startRun(makeRun(c));
  const u = closedGeodesicDirs()[0];
  const dt = 1 / 240, speed = 2.0;
  let s = 0, prev = point(IDENTITY), taken = [];
  for (let i = 0; i < 20000 && run.phase === PHASE.RUNNING; i++) {
    s += speed * dt;
    const now = point(geodesic(IDENTITY, u, s));
    const k = runStep(run, dt, prev, now);
    if (k >= 0) taken.push(k);
    prev = now;
  }
  check('flying straight takes every hoop', taken.length === 6);
  check('  in order', taken.every((k, i) => k === i));
  check('  and the run finishes', run.phase === PHASE.DONE);
  check('  with a split per hoop, increasing',
    run.splits.length === 6 && run.splits.every((t, i) => i === 0 || t > run.splits[i - 1]));
  check('  and a best time that matches the clock',
    close(run.best, run.t, 1e-12) && run.best > 0);
  check('  taking about the time the distance implies',
    Math.abs(run.best - (closedGeodesicLength() * 6 / 7) / speed) < 0.05,
    `got ${run.best.toFixed(3)}`);
}

console.log('');
console.log('the ordering is what stops the wrap being a cheat');
{
  // In a compact manifold a straight line eventually reaches EVERYTHING, so
  // without ordering you could fly through hoop five on the way to hoop two
  // and have the course credit it. Only run.next may be taken.
  const c = geodesicCourse(0, 6);
  const run = startRun(makeRun(c));
  const h4 = c.hoops[4];
  const u = closedGeodesicDirs()[0];
  const L = closedGeodesicLength();
  const t4 = (5 * L) / 7;
  const before = point(geodesic(IDENTITY, u, t4 - 0.05));
  const after = point(geodesic(IDENTITY, u, t4 + 0.05));
  check('that segment really does pass through hoop 4',
    hoopCrossed(before, after, h4));
  const got = runStep(run, 0.01, before, after);
  check('but taking it out of order counts for nothing', got === -1);
  check('  and the course still wants hoop 0', run.next === 0);
}

console.log('');
console.log('the round state machine');
{
  const run = makeRun(geodesicCourse(0, 3));
  check('a fresh run is idle', run.phase === PHASE.IDLE && run.t === 0);
  check('  and an idle run ignores the clock',
    runStep(run, 0.5, point(IDENTITY), point(IDENTITY)) === -1 && run.t === 0);
  startRun(run);
  check('starting sets it running', run.phase === PHASE.RUNNING);
  runStep(run, 0.25, null, null);
  runStep(run, 0.25, null, null);
  check('  and the clock accumulates', close(run.t, 0.5, 1e-12));
  check('progress reads 0 before any hoop', runProgress(run) === 0);
  run.next = 2;
  check('  and part way through', close(runProgress(run), 2 / 3, 1e-12));
  resetRun(run);
  check('resetting puts it back to idle',
    run.phase === PHASE.IDLE && run.t === 0 && run.next === 0);

  check('the clock formats as mm:ss.hh', formatTime(83.456) === '01:23.45',
    formatTime(83.456));
  check('  and reads as blank before there is a time', formatTime(null) === '--:--.--');
}

console.log('');
console.log('a course is a CARRIED object, like the anchor and the beacon');
{
  // The rule from CLAUDE.md: things that live in the universal cover are
  // carried by the SAME group element the player was folded by, never snapped
  // to whichever copy is nearest. Snapping would move a gate out from under a
  // player mid-flight.
  const c = geodesicCourse(0, 4);
  const g = OCT_GEN[0];
  const was = c.hoops.map((h) => ({ at: h.at.slice(), N: h.N.slice() }));
  carryCourse(c, g);
  check('every hoop centre moves by g',
    c.hoops.every((h, k) => dist(h.at, apply(g, was[k].at)) < 1e-9));
  // The bug foldElement exists to prevent, in its other form: fold the normal
  // by anything other than the centre's own element and the plane stops
  // passing through the centre, so the gate draws in one place and is crossed
  // in another.
  check('  and the normal moves by the SAME g, so the plane still holds',
    c.hoops.every((h) => close(dot(h.at, h.N), 0, 1e-9)));
  check('  the normal stays unit spacelike, because g is a Lorentz map',
    c.hoops.every((h) => close(dot(h.N, h.N), 1, 1e-9)));

  // And the answer the game actually asks must not change. Carry the player's
  // segment by the same element and the crossing verdict is identical -- which
  // is what "the hoop is a thing in the manifold" means.
  const c2 = geodesicCourse(0, 4);
  const u = closedGeodesicDirs()[0];
  const L = closedGeodesicLength();
  const t0 = L / 5;
  const p0 = point(geodesic(IDENTITY, u, t0 - 0.05));
  const p1 = point(geodesic(IDENTITY, u, t0 + 0.05));
  const before = hoopCrossed(p0, p1, c2.hoops[0]);
  carryCourse(c2, g);
  const after = hoopCrossed(apply(g, p0), apply(g, p1), c2.hoops[0]);
  check('a fold does not change whether you went through the hoop',
    before === true && after === true);
}

console.log('');
console.log('it works in the 3D world too');
{
  // The dodecahedral world is where this mode is at its best: its closed
  // geodesics are the SPOKES the level already draws, so the scenery shows you
  // the line before you know there is a race. Different group, same code.
  setSolid(SOLID.DODECAHEDRON);
  const c = geodesicCourse(0, 5);
  const L = closedGeodesicLength();
  check('the dodecahedral world has its own closed geodesics',
    L > 0 && Math.abs(L - 2 * 0.9964) < 0.01, `length ${L.toFixed(4)}`);
  check('and a course lays out along one', c.hoops.length === 5
    && c.hoops.every((h) => close(dot(h.at, h.N), 0, 1e-12)));
  // A course laid along a closed geodesic SPANS THE MANIFOLD - that is the
  // whole point of it - so most of its hoops are far outside the fundamental
  // domain in coordinates. Asking them to fit in one cell would be asking the
  // course not to wrap.
  check('  the course deliberately runs outside a single cell',
    c.hoops.some((h) => dist(h.at, point(IDENTITY)) > 0.9964));
  // What must hold instead: every hoop has a copy inside the domain, with its
  // normal carried by the SAME element, so it can be drawn whole where it is
  // actually seen.
  const folded = c.hoops.map(hoopFolded);
  check('  but every hoop has a copy inside the domain',
    folded.every((h) => dist(h.at, point(IDENTITY)) < 1.86));
  check('  with its plane still passing through its own centre',
    folded.every((h) => close(dot(h.at, h.N), 0, 1e-9)
                     && close(dot(h.N, h.N), 1, 1e-9)));
  // And the copy nearest the player is the one the overlay should draw.
  const me = point(placeAt(0.1, 0.05, 0.2));
  const near = c.hoops.map((h) => hoopNear(h, me));
  check('  and hoopNear picks a copy at least as close as the original',
    near.every((h, k) => dist(me, h.at) <= dist(me, c.hoops[k].at) + 1e-12));
  check('  which also keeps centre and normal together',
    near.every((h) => close(dot(h.at, h.N), 0, 1e-9)));
  setSolid(SOLID.OCTAGON);
}

console.log('');
console.log('the grapple course, and its charge gates');
{
  setSolid(SOLID.OCTAGON);
  setMode(MODE.BOUNDED);
  const c = grappleCourse();
  check('it is a ring of gates', c.hoops.length === 5 && c.closed === false);
  check('  every gate is a proper disc of plane',
    c.hoops.every((g) => close(dot(g.at, g.N), 0, 1e-9)
                      && close(dot(g.N, g.N), 1, 1e-9)));

  // The ring is SEARCHED for, not written down. The obvious choice - floor
  // radius 1.0 - puts a gate inside a wall, because the walls are a pinwheel
  // at exactly that radius. A gate you cannot fly through reads as a broken
  // course rather than a hard one, which is the same failure the opponent
  // spawn had when it was hand-picked.
  const clear = c.hoops.map((g) => levelSDF(g.at));
  check('  and stands clear of the level, which the obvious ring does NOT',
    Math.min(...clear) > 0.3, `min clearance ${Math.min(...clear).toFixed(3)}`);
  const naive = grappleCourse(5, 1.0, 0.55, 0.8, 0);
  check('  (the naive ring really does put a gate inside a wall)',
    Math.min(...naive.hoops.map((g) => levelSDF(g.at))) < 0,
    `${Math.min(...naive.hoops.map((g) => levelSDF(g.at))).toFixed(3)}`);
  check('  and every gate stays inside the cell',
    c.hoops.every((g) => dist(g.at, point(IDENTITY)) < 1.5286));

  // The signs alternate, which is the mechanic: to go from +0.8 to -0.8 you
  // must unwind the 0.8 you banked and then bank 0.8 the other way round.
  check('the first gate is free, so a run can start', !c.hoops[0].needs);
  check('  and after that the required sign alternates',
    c.hoops[1].needs > 0 && c.hoops[2].needs < 0
    && c.hoops[3].needs > 0 && c.hoops[4].needs < 0);
}

{
  const c = grappleCourse();
  const g1 = c.hoops[1], g2 = c.hoops[2];      // wants +0.8, wants -0.8
  check('an uncharged gate is shut', !gateOpen(g1, 0));
  check('  and enough charge opens it', gateOpen(g1, 0.9));
  // THE point of the whole mechanic. A big bank of the WRONG sign is not
  // "nearly enough" - it is as far from open as you can get. Circling the
  // other way does not charge this gate, it discharges it.
  check('  but a large bank of the WRONG sign does not', !gateOpen(g1, -5.0));
  check('a negative gate wants the other direction round', gateOpen(g2, -0.9));
  check('  and is not opened by a positive bank', !gateOpen(g2, 5.0));
  check('a free gate opens with nothing banked', gateOpen(c.hoops[0], 0));
  check('and a gate with no reading at all stays shut', !gateOpen(g1, null));
  check('gateProgress reads part way', close(gateProgress(g1, 0.4), 0.5, 1e-12));
  check('  and clamps at both ends',
    gateProgress(g1, -3) === 0 && gateProgress(g1, 99) === 1);
}

{
  // In the run: flying through a shut gate does not count, and it does not
  // silently advance the course either.
  const c = grappleCourse();
  const run = startRun(makeRun(c));
  run.next = 1;                                 // standing at the charged gate
  const g = c.hoops[1];
  // A segment straight through its middle, along its own normal.
  const back = point(geodesic(placeAt(0, 0, 0), [0, 0, 1], 0));
  const thru = (s) => {
    const q = [0, 1, 2, 3].map((k) => g.at[k] + s * g.N[k]);
    const n = Math.sqrt(Math.max(-dot(q, q), 1e-18));
    return q.map((x) => x / n);
  };
  const p0 = thru(-0.05), p1 = thru(0.05);
  check('the segment does pass through the gate', hoopCrossed(p0, p1, g));
  check('  but uncharged it counts for nothing',
    runStep(run, 0.01, p0, p1, 0.0) === -1 && run.next === 1);
  check('  and the refusal is recorded, so a HUD can say why', run.refused === 1);
  check('  charged the wrong way round, still nothing',
    runStep(run, 0.01, p0, p1, -9.0) === -1 && run.next === 1);
  check('  charged the right way, it opens', runStep(run, 0.01, p0, p1, 0.9) === 1);
  check('  and the course moves on', run.next === 2);
  void back;
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
