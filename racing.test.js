// racing.test.js — the orbital sprint, and the dropper's lethal baffles.
//
//   node racing.test.js
//
// Both modes shipped playable-looking and were not playable, and neither had a
// test. What each of them needed was the thing every other mode here got: the
// layout SIMULATED on the real integrator against criteria that say what the
// mode is for. Written down, those are:
//
//   THE RACE     a hurdle cannot be cleared at cruising speed, CAN be cleared
//                on turbo, can be gone round off the road at a real cost, and
//                stops you dead if you do neither.
//   THE DROPPER  an aimed line takes every gate, a lazy one does not, a
//                no-input drop takes none, and the lethal baffles bind
//                TIGHTER than the gates -- otherwise they are decoration.
//
// Both were failing all of it. The race stopped at arc 1.241 on the first
// hurdle while the HUD recommended a detour the road is too narrow for; the
// dropper scored 0/5 at every input from 0.0 to 1.0, because its baffles were
// holed over the gate they followed rather than over the path to the next one,
// and because the column field had been made lethal after the gate ring was
// searched on the footing that it was scenery.

import * as S2R from './s2r.js';
import * as H2R from './h2r.js';
import {
  makeRacer, raceStep, raceCourse, raceSDF, onRoad,
  RACE_SPEED, TURBO_SPEED, RACE_LAPS, RACE_JUMP, BOOST_COST, OFF_ROAD,
  RACE_GATES, RACE_GATE_R, RACE_GATE_Z,
} from './racing.js';
import { RACE_HURDLES, RACE_WIDTH, raceObstacleSDF } from './race-track.js';

let passed = 0, failed = 0;
function ok(name, cond, note = '') {
  if (cond) { passed++; console.log(`ok   ${name}${note ? `  (${note})` : ''}`); }
  else { failed++; console.error(`FAIL ${name}${note ? `  (${note})` : ''}`); }
}
const section = (s) => console.log(`\n-- ${s}`);
const H = 1 / 60 / 4;                      // main.js's substep
const PR = S2R.S2R_PLAYER_R;

// ---------------------------------------------------------------------------
section('the hurdle is a DECISION, and the arithmetic says which');

{
  // The jump the racer actually has, against the hurdle it has to clear.
  const G = S2R.S2R_G;
  const top = RACE_HURDLES[0].at[2] + RACE_HURDLES[0].halfHeight;
  // Time with the centre above top + PR, launching from PR at RACE_JUMP.
  const disc = RACE_JUMP * RACE_JUMP - 2 * G * top;
  const span = (v) => (disc <= 0 ? 0 : (2 * Math.sqrt(disc) / G) * v);
  const need = 2 * RACE_HURDLES[0].radius + 2 * PR;
  ok('cruising speed CANNOT clear a hurdle', span(RACE_SPEED) < need,
     `${span(RACE_SPEED).toFixed(3)} of arc against the ${need.toFixed(3)} needed`);
  ok('and turbo can, with room to spare', span(TURBO_SPEED) > need + 0.05,
     `${span(TURBO_SPEED).toFixed(3)} against ${need.toFixed(3)}`);
  // That gap is the whole mechanic, so it is asserted rather than admired.
  ok('so turbo is the only way over one',
     span(RACE_SPEED) < need && span(TURBO_SPEED) > need);
}

{
  // And the detour is a detour: the on-road gap is deliberately too small.
  const gap = RACE_WIDTH - RACE_HURDLES[0].radius;
  ok('the on-road gap beside a hurdle is too small to thread', gap < PR,
     `${gap.toFixed(3)} against a player ${PR} across`);
  ok('so going round means leaving the road, at a real cost', OFF_ROAD < 0.5,
     `off-road speed is ${(OFF_ROAD * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------------------------
section('driven on the real integrator');

/** Drive a lap. `mode` picks the line; returns how it went. */
function drive({ boost = false, detour = false, laps = 1, cap = 200 }) {
  let M = S2R.lapStart(), vel = [0, 0, 0], st = makeRacer();
  let t = 0, arc = 0, stuck = false;
  const target = 2 * Math.PI * laps;
  const jumped = new Set();
  for (let i = 0; i < 240 * cap && arc < target; i++) {
    const p = S2R.point(M);
    // Nearest hurdle, and how far ahead it is.
    let near = RACE_HURDLES[0], nd = Infinity;
    for (const b of RACE_HURDLES) {
      const d = S2R.horizDist(p, b.at);
      if (d < nd) { nd = d; near = b; }
    }
    const lap = Math.floor(arc / (2 * Math.PI));
    const key = `${RACE_HURDLES.indexOf(near)}:${lap}`;
    // Hold the road, or swing wide of the hurdle when detouring.
    const lat = Math.asin(Math.max(-1, Math.min(1, p[1])));
    const want = detour && nd < 1.1 ? near.radius + PR + 0.08 : 0;
    const steer = Math.max(-1, Math.min(1, (want - lat) * 6));
    // Drift the wide part of the swing to earn the charge back.
    const drift = Math.abs(steer) > 0.3;
    const jump = boost && !detour && nd < 0.60 && nd > 0.40 && !jumped.has(key);
    if (jump) jumped.add(key);
    [M, vel, st] = raceStep(M, vel, st, {
      throttle: 1, steer, drift,
      jump, boost: boost && !detour && nd < 0.95 && st.charge >= BOOST_COST,
    }, H);
    arc += Math.hypot(vel[0], vel[1]) * H;
    t += H;
    if (t > 1 && Math.hypot(vel[0], vel[1]) < 0.04) { stuck = true; break; }
  }
  return { t, arc, stuck: stuck || arc < target, charge: st.charge };
}

{
  const none = drive({});
  ok('a run that neither boosts nor detours STOPS at the first hurdle',
     none.stuck, `reached arc ${none.arc.toFixed(3)} of ${(2 * Math.PI).toFixed(3)}`);
  ok('and it stops where the hurdle is, not somewhere random',
     Math.abs(none.arc - (Math.PI / 2 - RACE_HURDLES[0].radius - PR)) < 0.25,
     `stopped at ${none.arc.toFixed(3)}, hurdle edge at `
     + `${(Math.PI / 2 - RACE_HURDLES[0].radius - PR).toFixed(3)}`);

  const boosted = drive({ boost: true });
  ok('the boosted line completes a lap', !boosted.stuck,
     `${boosted.t.toFixed(2)}s`);

  const round = drive({ detour: true });
  ok('and so does the detour, off the road', !round.stuck,
     `${round.t.toFixed(2)}s`);
  ok('but the detour is slower, and by a lot', round.t > boosted.t * 1.25,
     `${round.t.toFixed(2)}s against ${boosted.t.toFixed(2)}s`);
}

{
  // Three whole laps, which is what the mode actually asks of a player.
  const r = drive({ boost: true, laps: RACE_LAPS });
  ok(`${RACE_LAPS} laps complete on the boosted line`, !r.stuck,
     `${r.t.toFixed(2)}s`);
}

// ---------------------------------------------------------------------------
section('the course, and the ordering that stops a backwards lap');

{
  const c = raceCourse();
  ok(`there are ${RACE_GATES} gates a lap, ordered, for every lap`,
     c.hoops.length === RACE_GATES * RACE_LAPS);
  // A GATE MUST NOT OVERLAP ITS NEIGHBOUR, which twelve of radius 0.40 did:
  // 0.80 of diameter in a 0.524 gap, so the course was a tunnel of
  // interpenetrating rings rather than a line of checkpoints.
  const gap = 2 * Math.PI / RACE_GATES;
  ok('and no gate overlaps the next', 2 * RACE_GATE_R < gap,
     `diameter ${(2 * RACE_GATE_R).toFixed(3)} in a gap of ${gap.toFixed(3)}`);
  // NOR MAY A GATE'S CROSSING PLANE PASS THROUGH A HURDLE, or the run is asked
  // to cross a checkpoint from inside solid rock. Any gate count that divides
  // the lap into quarters puts one exactly on a hurdle, since they sit at a
  // quarter and three quarters of the way round; ten does not.
  //
  // The margin is small on purpose. A gate is a vertical DOORWAY -- its ring
  // has no extent along the track at all -- so it only has to clear the
  // hurdle's arc, and sitting just before and just after one is what puts the
  // jump between two checkpoints instead of across one.
  const clear = Math.min(...c.hoops.map((g) =>
    Math.min(...RACE_HURDLES.map((b) => S2R.horizDist(g.at, b.at) - b.radius))));
  ok('and no gate plane passes through a hurdle', clear > 0.05,
     `closest gate sits ${clear.toFixed(3)} clear of a hurdle's edge`);
  // And the ring stands ON the floor rather than half buried.
  ok('and every ring stands on the floor', RACE_GATE_Z >= RACE_GATE_R,
     `centre height ${RACE_GATE_Z} against radius ${RACE_GATE_R}`);
  // Forwards counts, backwards does not -- and that is what makes running the
  // lap the wrong way round score nothing rather than score everything.
  const g = c.hoops[0];
  const step = 0.06;
  const at = (a) => [Math.sin(g.t + a), 0, RACE_GATE_Z, Math.cos(g.t + a)];
  ok('crossing a gate forwards counts', c.crossed(at(-step), at(step), g));
  ok('and crossing it backwards does not', !c.crossed(at(step), at(-step), g));
  // The same plane is met again at the antipode; the radius test rejects it.
  const far = (a) => [Math.sin(g.t + Math.PI + a), 0, RACE_GATE_Z,
    Math.cos(g.t + Math.PI + a)];
  ok('and the antipodal crossing of the same plane does not count',
     !c.crossed(far(-step), far(step), g) && !c.crossed(far(step), far(-step), g));
}

{
  // The gates stand ON the road, or the line through them leaves the tarmac.
  const c = raceCourse();
  const worst = Math.max(...c.hoops.map((g) =>
    Math.abs(Math.asin(Math.max(-1, Math.min(1, g.at[1]))))));
  ok('every gate centre is on the road', worst < RACE_WIDTH,
     `worst latitude ${worst.toFixed(3)} of ${RACE_WIDTH}`);
  ok('and a gate is no wider than the road, so the two rules agree',
     RACE_GATE_R <= RACE_WIDTH + 0.01,
     `gate radius ${RACE_GATE_R}, road half-width ${RACE_WIDTH}`);
  ok('and no gate sits inside a hurdle',
     c.hoops.every((g) => raceObstacleSDF(g.at) > 0),
     `nearest ${Math.min(...c.hoops.map((g) => raceObstacleSDF(g.at))).toFixed(3)}`);
}

// ---------------------------------------------------------------------------
section('the track SDF, and the arithmetic it must share with the GLSL');

{
  // raceObstacleSDF used Math.acos of the inner product, which is the arc
  // distance and is the wrong way to compute it: acos loses precision exactly
  // where the argument is near 1, which is where two points are CLOSE -- the
  // only regime a collision test runs in. Against the 4 sin^2(d/2) form:
  let worst = 0;
  for (const b of RACE_HURDLES) {
    for (let e = 1e-7; e < 1e-2; e *= 2) {
      const p = [Math.sin(Math.PI / 2 + e), 0, 0.07, Math.cos(Math.PI / 2 + e)];
      const viaAcos = Math.acos(Math.max(-1, Math.min(1,
        p[0] * b.at[0] + p[1] * b.at[1] + p[3] * b.at[3])));
      const viaHalf = S2R.horizDist(p, b.at);
      if (Math.abs(viaAcos - e) > Math.abs(viaHalf - e)) {
        worst = Math.max(worst, Math.abs(viaAcos - e) / Math.max(e, 1e-30));
      }
    }
  }
  ok('acos is relatively worse than the half-angle form near contact',
     worst > 1e-6, `relative error up to ${worst.toExponential(2)}`);
  // And what ships now agrees with s2r's own distance to the last bit.
  let dis = 0;
  for (let i = 0; i < 3000; i++) {
    const t = Math.random() * 2 * Math.PI, w = (Math.random() - 0.5) * 1.2;
    const p = [Math.sin(t) * Math.cos(w), Math.sin(w), Math.random(), Math.cos(t) * Math.cos(w)];
    const mine = raceObstacleSDF(p);
    const theirs = Math.min(...RACE_HURDLES.map((b) => Math.max(
      S2R.horizDist(p, b.at) - b.radius, Math.abs(p[2] - b.at[2]) - b.halfHeight)));
    dis = Math.max(dis, Math.abs(mine - theirs));
  }
  ok('raceObstacleSDF now uses exactly s2r\'s distance', dis === 0,
     `worst ${dis.toExponential(2)} over 3000 points`);
}

{
  // The road test is one constant in one place now; it used to be a bare 0.29
  // in racing.js and RACE_WIDTH in race-track.js.
  ok('onRoad agrees with RACE_WIDTH at the boundary',
     onRoad([Math.cos(RACE_WIDTH - 1e-6), Math.sin(RACE_WIDTH - 1e-6), 0, 0])
     && !onRoad([Math.cos(RACE_WIDTH + 1e-6), Math.sin(RACE_WIDTH + 1e-6), 0, 0]));
  ok('the world SDF is the floor and the hurdles together',
     raceSDF([0, 0, 0.5, 1]) === Math.min(S2R.s2rSDF([0, 0, 0.5, 1]),
       raceObstacleSDF([0, 0, 0.5, 1])));
}

// ---------------------------------------------------------------------------
section('THE DROPPER: the baffles, and what they are for');

const COURSE = H2R.dropperCourse();

/** The greedy policy, at `gain` of full input. Returns how far it got. */
function drop(gain) {
  let M = H2R.dropperStart(), vel = [0, 0, 0];
  let next = 0, t = 0, worstGate = 0, tightestHole = Infinity;
  for (let s = 0; s < 60 * 4 * 40 && next < COURSE.hoops.length; s++) {
    const g = COURSE.hoops[next];
    const lv = H2R.logTo(M, g.at);
    const m = Math.hypot(lv[0], lv[1]);
    const want = m > 1e-9 ? [lv[0] / m * gain, lv[1] / m * gain] : [0, 0];
    const v = H2R.h2rFall(vel, want, H);
    if (H2R.dropperImpact(M, v, H)) return { next, t, died: 'baffle', worstGate };
    const p0 = H2R.point(M);
    [M, vel] = H2R.stepFall(M, v, H);
    [M, vel] = H2R.h2rCollide(M, vel, H2R.h2rSDF);
    const p1 = H2R.point(M);
    for (const b of H2R.DROP_BAFFLES) {
      if (Math.abs(p1[2] - b.at[2]) < H2R.DROP_THICK + 0.25) {
        tightestHole = Math.min(tightestHole,
          H2R.DROP_OPENING - H2R.horizDist(p1, b.at) - H2R.H2R_PLAYER_R);
      }
    }
    if (COURSE.crossed(p0, p1, g)) {
      worstGate = Math.max(worstGate, H2R.horizDist(p1, g.at));
      next++;
    } else if (p1[2] < g.z - 1) return { next, t, died: 'missed', worstGate };
    t += H;
  }
  return { next, t, died: null, worstGate, tightestHole };
}

{
  const aimed = drop(1.0);
  ok('the aimed line takes every gate', aimed.next === COURSE.hoops.length,
     `${aimed.next}/${COURSE.hoops.length} in ${aimed.t.toFixed(2)}s`);
  ok('and the baffles cost a correct line nothing',
     Math.abs(aimed.t - 11.35) < 0.05,
     `${aimed.t.toFixed(2)}s against the 11.35s it took before they existed`);

  const lazy = drop(0.55);
  ok('a LAZY line does not', lazy.next < COURSE.hoops.length,
     `${lazy.next}/${COURSE.hoops.length}, ${lazy.died}`);
  const none = drop(0.0);
  ok('and a no-input drop takes none at all', none.next === 0,
     `${none.next}/${COURSE.hoops.length}, ${none.died}`);

  // THE BAFFLE MUST BIND TIGHTER THAN THE GATE, or it is decoration: the gate
  // already says "be here", and the only thing a baffle adds is "and be on the
  // way there". Measured as the fraction of each opening the aimed line uses.
  const gateUse = aimed.worstGate / H2R.DROP_GATE_R;
  const holeUse = (H2R.DROP_OPENING - aimed.tightestHole - H2R.H2R_PLAYER_R)
    / H2R.DROP_OPENING;
  ok('the aimed line uses more of a hole than of a gate', holeUse > gateUse,
     `hole ${(holeUse * 100).toFixed(0)}% against gate ${(gateUse * 100).toFixed(0)}%`);

  // And a nearly-good line dies ON A BAFFLE rather than merely missing a gate,
  // which is the difference between a hazard and a checkpoint.
  const near = drop(0.85);
  ok('a nearly-good line is killed by a baffle, not by a missed gate',
     near.died === 'baffle',
     `${near.next}/${COURSE.hoops.length}, died: ${near.died}`);
}

{
  // THE COLUMNS ARE NOT LETHAL, and that is the fix rather than an oversight.
  // The gate ring was searched against them as SCENERY -- a gate's rim comes
  // within 0.220 of one, with the player 0.10 across -- so making them deadly
  // retroactively broke the search. Measured before the fix: 0/5 at every
  // input, the aimed run dying at altitude 42.6, above every baffle, having
  // flown out to the 1.70 column ring on its way to a gate at radius 1.5.
  let rim = Infinity;
  for (const g of COURSE.hoops) {
    for (const q of H2R.gateRing(g, 64)) {
      for (const c of H2R.H2R_COLUMNS) rim = Math.min(rim, H2R.horizDist(q, c.c) - c.r);
    }
  }
  ok('a gate rim really does come close to a column', rim < 0.30,
     `closest ${rim.toFixed(3)}, player ${H2R.H2R_PLAYER_R}`);
  const onColumn = H2R.H2R_COLUMNS.map((c) => c.c)
    .map((c) => H2R.dropperObstacleSDF(c));
  ok('and standing at a column centre is not lethal',
     onColumn.every((d) => d > H2R.H2R_PLAYER_R),
     `nearest baffle from a column centre ${Math.min(...onColumn).toFixed(3)}`);
  ok('but a column is still SOLID, through h2rSDF',
     H2R.h2rSDF(H2R.H2R_COLUMNS[0].c) < 0,
     `${H2R.h2rSDF(H2R.H2R_COLUMNS[0].c).toFixed(3)}`);
}

{
  // The hole must clear the column field, or a correct line is blocked by
  // scenery. This is the criterion that chose 0.50/0.95 from the six that
  // passed the other four.
  let worst = Infinity;
  for (const b of H2R.DROP_BAFFLES) {
    const A = H2R.translation(H2R.log(b.at));
    for (let i = 0; i < 64; i++) {
      const th = 2 * Math.PI * i / 64;
      const q = H2R.rayPoint(A, [Math.cos(th), Math.sin(th), 0], H2R.DROP_OPENING);
      for (const c of H2R.H2R_COLUMNS) worst = Math.min(worst, H2R.horizDist(q, c.c) - c.r);
    }
  }
  ok('every hole rim clears the column field', worst > 0.15,
     `closest ${worst.toFixed(3)}`);
}

{
  // A baffle sits BETWEEN two gates, at the midpoint of the geodesic and of
  // the height. The first version holed it over the gate it followed, which is
  // the same as not having one: the next gate is 2.937 sideways, so the hole
  // was nowhere near the path.
  const g = COURSE.hoops;
  ok('there is one baffle between each pair of gates',
     H2R.DROP_BAFFLES.length === g.length - 1);
  H2R.DROP_BAFFLES.forEach((b, i) => {
    const mid = (g[i].z + g[i + 1].z) / 2;
    if (i === 0) {
      ok('a baffle sits midway in height between its two gates',
         Math.abs(b.at[2] - mid) < 1e-9, `${b.at[2].toFixed(2)} against ${mid.toFixed(2)}`);
      const da = H2R.horizDist(b.at, g[i].at), db = H2R.horizDist(b.at, g[i + 1].at);
      ok('and midway along the geodesic between them',
         Math.abs(da - db) < 1e-9, `${da.toFixed(3)} each side`);
      // The meaningful statement is that the hole lies ON the line between the
      // gates in the floor plan, so a straight run threads it. (Asking
      // instead whether a gate CENTRE is inside the hole asks nothing: a
      // baffle is four units of height from both gates, so the player is
      // never at a gate's position while inside one.)
      const span = H2R.horizDist(g[i].at, g[i + 1].at);
      ok('and the hole lies exactly on the line between the two gates',
         Math.abs(da + db - span) < 1e-9,
         `${da.toFixed(3)} + ${db.toFixed(3)} = ${span.toFixed(3)}`);
      // Which the first version did not: it was holed over the gate above, and
      // the next gate is a whole span sideways from there.
      ok('where holing it over the gate above would have put the path outside',
         span > H2R.DROP_OPENING,
         `gates are ${span.toFixed(3)} apart, hole radius ${H2R.DROP_OPENING}`);
    }
  });
}

{
  // THE TEST MUST BE SWEPT, and the slab is what makes that non-negotiable: it
  // is 0.16 thick against a player 0.20 across, so the whole hit zone is 0.36
  // and a single fast substep can start above it and end below it with neither
  // endpoint inside. A point test would report a clean pass through solid rock.
  const b = H2R.DROP_BAFFLES[0];
  const A = H2R.translation(H2R.log(b.at));
  // A column of air over the SOLID part of the slab, well outside the hole.
  const over = (dz) => {
    const q = H2R.rayPoint(A, [1, 0, 0], H2R.DROP_OPENING + 0.5);
    const lv = H2R.log(q);
    return H2R.translation([lv[0], lv[1], b.at[2] + dz]);
  };
  // Sanity: that really is over solid slab, and clear of it at +0.25.
  ok('the tunnelling probe starts over solid slab and clear of it',
     H2R.dropperObstacleSDF(H2R.point(over(0.25))) > H2R.H2R_PLAYER_R
     && H2R.dropperObstacleSDF(H2R.point(over(0))) < 0,
     `clear ${H2R.dropperObstacleSDF(H2R.point(over(0.25))).toFixed(3)} above,`
     + ` ${H2R.dropperObstacleSDF(H2R.point(over(0))).toFixed(3)} inside`);
  // 0.60 of travel from +0.25 ends at -0.35: both ends outside, the middle
  // solid. This is the case a point test gets wrong.
  const dt = 0.01, v = [0, 0, -0.60 / dt];
  ok('a substep that would tunnel clean through the slab is caught',
     H2R.dropperImpact(over(0.25), v, dt),
     `swept 0.600 across a hit zone `
     + `${(2 * H2R.DROP_THICK + 2 * H2R.H2R_PLAYER_R).toFixed(2)} deep`);
  ok('and a point test at either end would have missed it',
     H2R.dropperObstacleSDF(H2R.point(over(0.25))) > H2R.H2R_PLAYER_R
     && H2R.dropperObstacleSDF(H2R.point(over(-0.35))) > H2R.H2R_PLAYER_R);
  // The same plunge straight down the HOLE is not a collision, or the mode is
  // unplayable in the other direction.
  const inHole = H2R.translation([H2R.log(b.at)[0], H2R.log(b.at)[1], b.at[2] + 0.25]);
  ok('while the same plunge down the hole passes clean through',
     !H2R.dropperImpact(inHole, v, dt));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
