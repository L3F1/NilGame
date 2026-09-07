// e3t.test.js — the flat 3-manifolds.
//
//   node e3t.test.js
//
// The control's tests are worth as much as the curved ones', and in one way
// more: the arithmetic here is checkable BY HAND. Distance is Pythagoras, a
// circle of radius 2 has circumference 4*pi, translations COMMUTE, and a
// square has four right angles. Every one of those is false in H^3 and in
// S^3, so a bug in the shared machinery shows up here first and in a form
// anyone can read.
//
// What the suite is actually pinning, in order:
//
//   1. the lattice is a group and reduction is CANONICAL
//   2. the minimum image is EXACT, checked against brute force over the orbit
//   3. the level obeys the clearance rule, and the street is clear
//   4. closed geodesics are DENSE and come in families -- the opposite of the
//      hyperbolic length spectrum
//   5. the course is flown, without steering, and it comes back
//   6. gravity in the 3-torus has a force and no potential
//   7. the flat facts that are false everywhere else

import * as E from './e3t.js';
import { H3 } from './geom.js';

let passed = 0, failed = 0;
function ok(name, cond, note = '') {
  if (cond) { passed++; console.log(`ok   ${name}${note ? `  (${note})` : ''}`); }
  else { failed++; console.error(`FAIL ${name}${note ? `  (${note})` : ''}`); }
}
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;
const section = (s) => console.log(`\n-- ${s}`);

// ---------------------------------------------------------------------------
section('the geometry is geom.js at k = 0, and it is the control');

{
  // Pythagoras, exactly. Not 2*asinK(...) of anything that cancels.
  const a = E.placeAt(1, 2, 2), b = E.placeAt(4, 6, 14);
  ok('distance is Pythagoras', near(E.dist(E.point(a), E.point(b)), 13, 1e-12),
     E.dist(E.point(a), E.point(b)).toFixed(12));
}

{
  // TRANSLATIONS COMMUTE, which they do in neither other geometry. This is the
  // single most useful property the control has, because the failure to
  // commute in H^3 is exactly the holonomy the dash banks.
  const A = E.translation([0.7, -0.3, 1.1]);
  const B = E.translation([-0.4, 0.9, 0.2]);
  const AB = E.matMul(A, B), BA = E.matMul(B, A);
  let worst = 0;
  for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(AB[i] - BA[i]));
  ok('translations commute, to the last bit', worst === 0, `worst ${worst}`);

  // And in H^3 they emphatically do not, which is what makes the check mean
  // something rather than being a tautology about matrix multiplication.
  const G = H3();
  const HA = G.translation([0.7, -0.3, 1.1]), HB = G.translation([-0.4, 0.9, 0.2]);
  const HAB = G.matMul(HA, HB), HBA = G.matMul(HB, HA);
  let hw = 0;
  for (let i = 0; i < 16; i++) hw = Math.max(hw, Math.abs(HAB[i] - HBA[i]));
  ok('and in H^3 they do not', hw > 0.1, `off by ${hw.toFixed(4)}`);
}

{
  // A placement stays an isometry under a long wandering walk. The point
  // cannot leave the model here -- it is the affine plane x3 = 1 -- so what is
  // being checked is that the FRAME stays in O(3), which drifts just the same.
  let M = E.IDENTITY.slice();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 400; i++) {
    M = E.reorthonormalize(E.geodesic(M, (() => {
      const v = [rnd(), rnd(), rnd()];
      const m = Math.hypot(...v);
      return [v[0] / m, v[1] / m, v[2] / m];
    })(), 0.3));
  }
  ok('400 steps leave the placement in the group', E.groupError(M) < 1e-12,
     E.groupError(M).toExponential(2));
  // AND THE RANGE LIMIT DOES NOT EXIST HERE, which is the point of saying it.
  // The same walk in H^3 is BALLISTIC and reaches d ~ 12, where <p,p> must come
  // out to -1 from terms of size 3.5e9. Flat coordinates are just the position.
  ok('and its coordinates are just where it is',
     Math.max(...E.point(M).slice(0, 3).map(Math.abs)) < 200,
     `max |coord| ${Math.max(...E.point(M).slice(0, 3).map(Math.abs)).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
section('the lattice, and reduction is canonical');

{
  const L = E.CELL;
  ok('wrap1 lands in the half-open cell',
     [0, 0.4, 1.49, 1.51, 3.0, -4.7, 100.3, -1e6]
       .every((x) => Math.abs(E.wrap1(x, 3)) <= 1.5 + 1e-12));
  ok('and it differs from the input by a lattice multiple',
     [0.4, 1.51, -4.7, 100.3].every((x) => {
       const k = (x - E.wrap1(x, 3)) / 3;
       return Math.abs(k - Math.round(k)) < 1e-12;
     }));
  ok('the cell is 3 across and its inradius is 1.5',
     L[0] === 3 && E.HALF[0] === 1.5);
}

{
  // CANONICAL, which is the property `reduceToDomain` has in hyp.js and the
  // one everything else rests on: reduce(g*p) is exactly reduce(p). The
  // network needs it, the tests need it, and getting it wrong would make two
  // names for one place disagree.
  let worst = 0, seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 500; i++) {
    const p = [rnd() * 20, rnd() * 20, rnd() * 20, 1];
    const g = [Math.round(rnd() * 8), Math.round(rnd() * 8), Math.round(rnd() * 8)];
    const q = [p[0] + g[0] * 3, p[1] + g[1] * 3, p[2] + g[2] * 3, 1];
    const a = E.foldPoint(p, E.MODE.CUBE), b = E.foldPoint(q, E.MODE.CUBE);
    for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(a[j] - b[j]));
  }
  ok('reduce(g*p) is exactly reduce(p), over 500 samples', worst < 1e-9,
     `worst ${worst.toExponential(2)}`);
}

{
  // THE MINIMUM IMAGE IS THE TRUE QUOTIENT DISTANCE, checked against brute
  // force over the orbit rather than against itself. This is the one claim the
  // whole renderer rests on: `hDist` in the flat shader is this and nothing
  // else, so if it is not the orbit distance then every marker, every self
  // copy and every level primitive is drawn in the wrong place.
  let worst = 0, seed = 29;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 300; i++) {
    const p = [rnd() * 12, rnd() * 12, rnd() * 12, 1];
    const q = [rnd() * 12, rnd() * 12, rnd() * 12, 1];
    // +-6 cells, not +-3: the points span 12 units, so the nearest image can
    // be four cells off and a narrower sweep MISSES IT -- which reads as
    // torusDist being wrong by 0.01 and is the brute force being wrong.
    let brute = Infinity;
    for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) for (let c = -6; c <= 6; c++) {
      brute = Math.min(brute, Math.hypot(
        p[0] - q[0] - a * 3, p[1] - q[1] - b * 3, p[2] - q[2] - c * 3));
    }
    worst = Math.max(worst, Math.abs(brute - E.torusDist(p, q, E.MODE.CUBE)));
  }
  ok('torusDist IS the orbit minimum, against brute force', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // The height is NOT glued in the slab, and that is the whole difference
  // between the two worlds.
  const p = [0, 0, 0, 1], q = [0, 0, 3, 1];
  ok('in the slab a cell up is 3 away', near(E.torusDist(p, q, E.MODE.SLAB), 3));
  ok('in the 3-torus it is the same point', near(E.torusDist(p, q, E.MODE.CUBE), 0));
}

// ---------------------------------------------------------------------------
section('the level, and the clearance rule the minimum image needs');

{
  // The minimum image is exact only while a primitive fits inside HALF a cell,
  // which is the same rule level.js states as "centre distance plus thickness
  // must stay under the inradius". Checked rather than trusted, because
  // nothing else would notice: both SDFs would still agree and the physics
  // would still collide correctly, and the picture would be quietly wrong.
  const bad = E.E3T_WALLS.filter((w) => w.half + E.WALL_T >= E.HALF[0]);
  ok('every wall fits inside half a cell', bad.length === 0,
     `worst ${Math.max(...E.E3T_WALLS.map((w) => w.half + E.WALL_T)).toFixed(3)} of 1.5`);
  ok('every pillar does too',
     E.E3T_PILLARS.every((c) => c.r < E.HALF[0]));
  ok('and every rod does', E.E3T_RODS.every((r) => r.r < E.HALF[0]));
}

{
  // THE STREET IS CLEAR ALL THE WAY ACROSS, and it joins its own image at the
  // faces, so it is a corridor with no end. That sightline is the cheapest
  // demonstration this world has: the copies down it recede like 1/d rather
  // than like e^{-2r}, so a dozen of them are visible at once.
  let worst = Infinity;
  for (let x = -1.5; x <= 1.5; x += 0.005) {
    worst = Math.min(worst, E.slabSDF([x, 0, 0.6, 1]));
  }
  ok('the street at y = 0 is clear for a walking player',
     worst > E.E3T_PLAYER_R + 0.2, `narrowest ${worst.toFixed(3)}`);
  // And it really does join up: the SDF at one face equals the SDF at the
  // other, because they are the same place.
  ok('and the two ends of it are the same place',
     near(E.slabSDF([-1.5, 0, 0.6, 1]), E.slabSDF([1.5, 0, 0.6, 1]), 1e-12));
}

{
  // Nothing at either spawn. A camera inside geometry makes every ray hit at
  // t = 0 and fills the screen with one flat colour, which looks exactly like
  // a shader that failed to compile. Both spawns have been blocked at some
  // point in this project, which is why this is a test and not a glance.
  ok('the slab spawn is clear', E.slabSDF(E.point(E.slabStart())) > E.E3T_PLAYER_R + 0.3,
     E.slabSDF(E.point(E.slabStart())).toFixed(3));
  ok('the 3-torus spawn is clear', E.cubeSDF(E.point(E.cubeStart())) > E.E3T_PLAYER_R + 0.5,
     E.cubeSDF(E.point(E.cubeStart())).toFixed(3));
}

{
  // The rods were SEARCHED for against the whole course line, and the margin
  // is asserted rather than assumed. A gate is a disc of radius HOOP_R about a
  // point of the line, so every point of every gate is within HOOP_R of it: a
  // rod further than that from the line cannot touch a gate at all.
  const c = E.hoopCourse();
  const N = E.hoopDir();
  let worst = Infinity;
  for (let s = 0; s < c.len; s += c.len / 4000) {
    worst = Math.min(worst, E.cubeSDF([N[0] * s, N[1] * s, N[2] * s, 1]));
  }
  ok('no rod comes within a gate radius of the course line', worst > E.HOOP_R,
     `clearance ${worst.toFixed(3)} against gate radius ${E.HOOP_R}`);
}

{
  // The two SDFs must agree with what the GLSL will compute, which
  // tools/sdf-check.js checks on the GPU. What is checkable here is that the
  // emitter produced something with the right shape and no holes in it.
  const g = E.e3tGLSL();
  ok('the GLSL emits every primitive',
     g.includes(`E3T_W[${E.E3T_WALLS.length}]`)
     && g.includes(`E3T_P[${E.E3T_PILLARS.length}]`)
     && g.includes(`E3T_R[${E.E3T_RODS.length}]`));
  ok('and no NaN or undefined reached it', !/NaN|undefined|Infinity/.test(g));
  ok('and the cell in it matches CELL',
     g.includes(`vec3(${E.CELL.map((x) => x.toPrecision(9)).join(', ')})`));
}

// ---------------------------------------------------------------------------
section('closed geodesics are DENSE here, and rigid in H^3');

{
  const dirs = E.closedDirs(E.MODE.CUBE, 3);
  ok('there are many of them', dirs.length > 100, `${dirs.length} up to n = 3`);
  // Six shortest, one per face, all of length exactly the cell.
  ok('the shortest are the six axes, at exactly the cell size',
     dirs.slice(0, 6).every((g) => near(g.len, 3)) && !near(dirs[6].len, 3),
     `${dirs[0].len} then ${dirs[6].len.toFixed(3)}`);
  // THEY COME IN CONTINUOUS FAMILIES, which is the real contrast: every
  // parallel translate of a closed geodesic closes, at the same length. In a
  // hyperbolic manifold each closed geodesic is isolated and rigid, and there
  // are finitely many below any bound -- Mostow, as a fact about level design.
  const d = E.hoopDir();
  let worst = 0;
  for (const off of [[0.4, 0, 0], [0, -0.7, 0], [0.2, 0.3, -0.5]]) {
    const from = [off[0], off[1], off[2], 1];
    const to = [from[0] + d[0] * E.closedLength(1, 1, 1),
      from[1] + d[1] * E.closedLength(1, 1, 1),
      from[2] + d[2] * E.closedLength(1, 1, 1), 1];
    worst = Math.max(worst, E.torusDist(from, to, E.MODE.CUBE));
  }
  ok('every parallel translate closes at the same length', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // In the SLAB there is no closed geodesic with any rise at all, because z is
  // not glued -- which is why the course is pinned to the 3-torus.
  ok('the slab has no closing direction with a vertical part',
     E.closedDirs(E.MODE.SLAB, 3).every((g) => g.n[2] === 0));
  // And its shortest are the two horizontal axes.
  ok('and its shortest are the two horizontal axes',
     E.closedDirs(E.MODE.SLAB, 3).slice(0, 4).every((g) => near(g.len, 3)));
}

{
  // The rational-approximation flavour of the boomerang problem: a careless
  // aim still comes back, and what it costs is TIME.
  const near0 = E.nearestClosedDir([1, 0, 0], E.MODE.CUBE, 4);
  ok('an aim straight down an axis takes that axis, exactly',
     near0.ang < 1e-12 && near(near0.len, 3), `len ${near0.len}`);
  const messy = E.nearestClosedDir([0.61, 0.55, 0.57], E.MODE.CUBE, 4);
  ok('and a messy aim still finds one within a few degrees',
     messy.ang < 0.12, `${(messy.ang * 57.2958).toFixed(1)} deg, len ${messy.len.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
section('the course: fly straight, take every gate, come back');

{
  const course = E.hoopCourse();
  ok('the course closes after L*sqrt(3)', near(course.len, 3 * Math.sqrt(3), 1e-12),
     course.len.toFixed(6));

  // Flown on the REAL integrator, with no steering whatsoever, for exactly one
  // closed lap -- which is the same claim the S^2 x R lap course makes and the
  // same one the bounded world's hoop course makes, in a third mechanism.
  const start = E.hoopStart();
  const d = E.hoopDir();
  const speed = 3.0;
  let M = start.M, next = 0, taken = 0;
  let prev = E.point(M);
  // An EXACT lap. Rounding the step count instead flies 5.19375 of a 5.19615
  // course and lands 2.4 mm short, which is discretisation rather than
  // anything about the manifold -- and a 2.4 mm tolerance would have hidden a
  // real 2.4 mm error later.
  const steps = 832;
  const dt = (course.len / speed) / steps;
  for (let i = 0; i < steps; i++) {
    [M] = E.e3tStep(M, [d[0] * speed, d[1] * speed, d[2] * speed], dt);
    const cur = E.point(M);
    if (next < course.hoops.length && course.crossed(prev, cur, course.hoops[next])) {
      taken++; next++;
    }
    prev = cur;
  }
  ok('a dead-straight flight takes every gate', taken === course.hoops.length,
     `${taken}/${course.hoops.length}`);
  ok('and one lap puts you back where you started',
     E.torusDist(E.point(M), [0, 0, 0, 1], E.MODE.CUBE) < 1e-9,
     E.torusDist(E.point(M), [0, 0, 0, 1], E.MODE.CUBE).toExponential(2));

  // The start already looks down the line, so the course needs no aiming --
  // which the hyperbolic one cannot manage, since its hoops have to lie on the
  // axis through the cell centre.
  ok('and the start is already looking down it',
     near(Math.cos(start.pitch) * Math.cos(start.yaw), d[0], 1e-12)
     && near(Math.cos(start.pitch) * Math.sin(start.yaw), d[1], 1e-12)
     && near(Math.sin(start.pitch), d[2], 1e-12));
}

{
  // A gate must not count from behind, or the course could be run backwards.
  const course = E.hoopCourse();
  const g = course.hoops[0];
  const back = [g.at[0] + g.N[0] * 0.1, g.at[1] + g.N[1] * 0.1, g.at[2] + g.N[2] * 0.1, 1];
  const front = [g.at[0] - g.N[0] * 0.1, g.at[1] - g.N[1] * 0.1, g.at[2] - g.N[2] * 0.1, 1];
  ok('forwards through a gate counts', course.crossed(front, back, g));
  ok('and backwards does not', !course.crossed(back, front, g));
  // And missing it wide does not, however exactly it crosses the plane.
  const off = 0.9;
  const a = [front[0] + off, front[1], front[2], 1];
  const b = [back[0] + off, back[1], back[2], 1];
  ok('and passing outside the ring does not', !course.crossed(a, b, g));
}

{
  // THE CROSSING TEST MUST RIDE ON WRAPPED DISPLACEMENTS. Comparing raw
  // coordinates makes a wrap look like a flight right across the room, and
  // every gate in between would count at once -- which is exactly the bug the
  // hyperbolic course has in its own spelling, and it is why hoopCrossed here
  // goes through torusDisp rather than through subtraction.
  const course = E.hoopCourse();
  const g = course.hoops[0];
  // The same crossing, named a whole cell away. It is the same event.
  const shift = (p) => [p[0] + 3, p[1] - 3, p[2] + 6, 1];
  const back = [g.at[0] + g.N[0] * 0.1, g.at[1] + g.N[1] * 0.1, g.at[2] + g.N[2] * 0.1, 1];
  const front = [g.at[0] - g.N[0] * 0.1, g.at[1] - g.N[1] * 0.1, g.at[2] - g.N[2] * 0.1, 1];
  ok('a crossing named a cell away is the same crossing',
     course.crossed(shift(front), shift(back), g));
  // The naive version, which is what this looked like before: subtracting the
  // coordinates makes that segment 7.3 long instead of 0.2.
  const naive = Math.hypot(shift(back)[0] - g.at[0], shift(back)[1] - g.at[1],
    shift(back)[2] - g.at[2]);
  ok('and a coordinate difference would have called it 7.3 away',
     naive > 7 && E.torusDist(shift(back), g.at, E.MODE.CUBE) < 0.2,
     `${naive.toFixed(2)} against ${E.torusDist(shift(back), g.at, E.MODE.CUBE).toFixed(3)}`);
}

{
  // The overlay needs the nearest image, or a gate down the diagonal draws
  // somewhere the marcher is not showing it.
  const course = E.hoopCourse();
  const last = course.hoops[course.hoops.length - 1];
  const me = [0, 0, 0, 1];
  const img = E.nearImage(last.at, me);
  const raw = Math.hypot(last.at[0], last.at[1], last.at[2]);
  const folded = Math.hypot(img[0], img[1], img[2]);
  ok('nearImage finds a nearer copy of the far gate', folded < raw - 0.5,
     `${raw.toFixed(2)} -> ${folded.toFixed(2)}`);
  ok('and it is the same point of the manifold',
     E.torusDist(img, last.at, E.MODE.CUBE) < 1e-12);
  const ring = E.gateRing(last, 40, me);
  ok('and the ring is drawn around it',
     ring.every((q) => Math.abs(Math.hypot(q[0] - img[0], q[1] - img[1], q[2] - img[2])
       - last.r) < 1e-12));
}

{
  // FOLDING THE PLACEMENT MUST BE INVISIBLE. It moves the player a whole cell
  // in coordinates, which is only safe because every other question here is
  // asked through torusDisp. Checked directly: the frame is untouched, the
  // point is the same point of the manifold, and the SDF agrees.
  const M = E.geodesic(E.placeAt(7.4, -5.1, 4.3), [0.3, 0.9, 0.31], 0.0);
  const F = E.foldPlacement(M, E.MODE.CUBE);
  ok('foldPlacement leaves the frame alone',
     [0, 1, 2, 4, 5, 6, 8, 9, 10].every((i) => M[i] === F[i]));
  ok('and lands inside the cell',
     E.point(F).slice(0, 3).every((x) => Math.abs(x) <= 1.5 + 1e-12),
     E.point(F).slice(0, 3).map((x) => x.toFixed(3)).join(' '));
  ok('and it is the same point of the manifold',
     E.torusDist(E.point(M), E.point(F), E.MODE.CUBE) < 1e-12);
  ok('and the world looks identical from it',
     near(E.cubeSDF(E.point(M)), E.cubeSDF(E.point(F)), 1e-12));
  // In the slab only x and y move, because z is not glued.
  const S = E.foldPlacement(E.placeAt(7.4, -5.1, 4.3), E.MODE.SLAB);
  ok('and in the slab the height is left exactly where it was',
     E.point(S)[2] === 4.3, `z ${E.point(S)[2]}`);
}

{
  // AND THE STEP MUST SURVIVE THE FOLD IT JUST DID. The whole point of folding
  // in `e3tStep` is that the run does not notice, so the course is flown again
  // from a start a long way out in the covering space -- where every substep
  // is folding -- and must still take every gate.
  const course = E.hoopCourse();
  const d = E.hoopDir();
  const speed = 3.0, steps = 832;
  const dt = (course.len / speed) / steps;
  // 12 cells out along each axis: nothing about the manifold has changed, and
  // without the fold the coordinates would stay there and keep growing.
  let M = E.translation([36, -36, 36]);
  let prev = E.point(M), next = 0, taken = 0, maxCoord = 0;
  for (let i = 0; i < steps; i++) {
    [M] = E.e3tStep(M, [d[0] * speed, d[1] * speed, d[2] * speed], dt, E.MODE.CUBE);
    const cur = E.point(M);
    maxCoord = Math.max(maxCoord, ...cur.slice(0, 3).map(Math.abs));
    if (next < course.hoops.length && course.crossed(prev, cur, course.hoops[next])) {
      taken++; next++;
    }
    prev = cur;
  }
  ok('the course flies the same from 36 cells out', taken === course.hoops.length,
     `${taken}/${course.hoops.length}`);
  ok('and folding kept every coordinate inside the cell', maxCoord <= 1.5 + 1e-9,
     `max |coord| ${maxCoord.toFixed(4)}`);
  // The fold is what makes that true, and it is worth saying what it saves:
  // without it the same flight ends at 38 and a long session ends at hundreds,
  // where float32 differences of small numbers start losing digits.
  let U = E.translation([36, -36, 36]);
  for (let i = 0; i < steps; i++) {
    [U] = E.e3tStep(U, [d[0] * speed, d[1] * speed, d[2] * speed], dt);
  }
  ok('where unfolded it would have stayed 36 cells out',
     Math.max(...E.point(U).slice(0, 3).map(Math.abs)) > 30,
     `max |coord| ${Math.max(...E.point(U).slice(0, 3).map(Math.abs)).toFixed(2)}`);
}

// ---------------------------------------------------------------------------
section('GRAVITY WITH A FORCE AND NO POTENTIAL, which only T^3 has');

{
  // The rule every world here is decided by: gravity must be the gradient of a
  // unit-gradient function INVARIANT under the group. The 3-torus splits it.
  //
  // The force survives: d/dz is fixed by every lattice translation, so "down"
  // is a perfectly good constant field on T^3.
  const g = [0, 0, -1];
  const moved = [g[0], g[1], g[2]];   // a translation acts trivially on a constant
  ok('the force field is lattice-invariant', moved.every((x, i) => x === g[i]));

  // The potential does not: z is not periodic, so z and z + Lz are the same
  // point with different heights. That is not a modelling choice, it is why
  // there is no height function on T^3 at all.
  const p = [0.3, -0.2, 0.0, 1];
  const q = [0.3, -0.2, 3.0, 1];
  ok('but the two are the same point of T^3',
     E.torusDist(p, q, E.MODE.CUBE) < 1e-12);
  ok('with heights 0 and 3, so no height function exists',
     p[2] !== q[2]);
}

{
  // FALLING THROUGH THE FLOOR AND ARRIVING FASTER, on the real integrator.
  // Energy is not conserved, because energy is only defined once you name a
  // lift and the lift changes every lap.
  let M = E.cubeStart(), v = [0, 0, 0];
  const dt = 1 / 8000;
  const speeds = [];
  // Count laps by how far has been fallen, not by the coordinate -- the point
  // never leaves the cell, which IS the phenomenon.
  let lapsDone = 0, lastZ = E.point(M)[2], fallen = 0;
  for (let i = 0; i < 8000 * 6 && lapsDone < 3; i++) {
    v = E.e3tFly(v, [0, 0, 0], dt, E.E3T_G);
    [M, v] = E.e3tStep(M, v, dt);
    const z = E.point(M)[2];
    fallen += lastZ - z;
    lastZ = z;
    if (fallen >= E.CELL[2] * (lapsDone + 1)) { lapsDone++; speeds.push(-v[2]); }
  }
  // And the point really did stay inside one cell the whole way down.
  const cell = E.foldPoint(E.point(M), E.MODE.CUBE);
  ok('the endless fall never leaves the room', Math.abs(cell[2]) <= 1.5 + 1e-9,
     `folded z ${cell[2].toFixed(3)}, fallen ${fallen.toFixed(2)}`);
  const want = [1, 2, 3].map((k) => Math.sqrt(2 * E.E3T_G * E.CELL[2] * k));
  ok('one cell of falling gives sqrt(2 g Lz)', Math.abs(speeds[0] - want[0]) < 0.05,
     `${speeds[0].toFixed(3)} against ${want[0].toFixed(3)}`);
  ok('and it keeps going: faster every lap, for ever',
     speeds[2] > speeds[1] && speeds[1] > speeds[0]
     && Math.abs(speeds[2] - want[2]) < 0.1,
     speeds.map((x) => x.toFixed(2)).join(' -> '));
  ok('which is exactly what fallLap says in closed form',
     Math.abs(E.fallLap(E.fallLap(0)) - want[1]) < 1e-9,
     `${E.fallLap(E.fallLap(0)).toFixed(4)} against ${want[1].toFixed(4)}`);
}

// ---------------------------------------------------------------------------
section('walking, jumping, and the frame that never tilts');

{
  // The apex and the hang time are exact, because the height is a Euclidean
  // line -- the same claim S^2 x R makes and for the same reason, one factor
  // further degenerated.
  const want = E.E3T_JUMP * E.E3T_JUMP / (2 * E.E3T_G);
  const hang = 2 * E.E3T_JUMP / E.E3T_G;
  const results = [];
  for (const run of [0, 0.7, 1.5, 2.2]) {
    let M = E.placeAt(-0.55, 0, E.E3T_PLAYER_R), v = E.jump([run, 0, 0]);
    const dt = 1 / 4000;
    let top = 0, t = 0;
    for (let i = 0; i < 4000 * 3; i++) {
      v = [v[0], v[1], v[2] - E.E3T_G * dt];
      [M, v] = E.e3tStep(M, v, dt);
      const z = E.point(M)[2];
      top = Math.max(top, z - E.E3T_PLAYER_R);
      t += dt;
      if (z <= E.E3T_PLAYER_R && t > 0.1) break;
    }
    results.push([top, t]);
  }
  const tops = results.map((r) => r[0]);
  ok('the jump apex is v^2/2g', Math.abs(tops[0] - want) < 2e-3,
     `${tops[0].toFixed(5)} against ${want.toFixed(5)}`);
  ok('and it is IDENTICAL at every running speed',
     Math.max(...tops) - Math.min(...tops) < 1e-9,
     `spread ${(Math.max(...tops) - Math.min(...tops)).toExponential(2)}`);
  ok('as is the hang time', Math.abs(results[3][1] - hang) < 3e-3,
     `${results[3][1].toFixed(4)} against ${hang.toFixed(4)}`);
}

{
  // THE FRAME NEVER TILTS, which is why there is no alignUp here. Parallel
  // transport in a flat space is componentwise and the frame is literally
  // constant along a geodesic. In H^3 that is false and physics.alignUp exists
  // precisely to re-pin it -- 111 degrees in one substep when it was left out.
  let M = E.IDENTITY.slice();
  let seed = 5, worst = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < 400; i++) {
    const v = [rnd(), rnd(), rnd()];
    const m = Math.hypot(...v);
    [M] = E.e3tStep(M, [v[0] / m * 2, v[1] / m * 2, v[2] / m * 2], 0.05);
    const up = E.frameVec(M, 2);
    worst = Math.max(worst, Math.hypot(up[0], up[1], up[2] - 1));
  }
  ok('E3 stays exactly vertical over a 400-step wandering walk', worst < 1e-12,
     `worst ${worst.toExponential(2)}`);
}

{
  // Collision pushes out and kills the inward velocity, and it must not push
  // through the floor. Walk hard into the street wall.
  let M = E.placeAt(-0.9, 0.8, 0.3), v = [0, 4, 0];
  for (let i = 0; i < 400; i++) {
    [M, v] = E.e3tStep(M, v, 1 / 240);
    [M, v] = E.e3tCollide(M, v, E.slabSDF);
  }
  ok('you cannot walk through the street wall',
     E.slabSDF(E.point(M)) >= E.E3T_PLAYER_R - 1e-6 && E.point(M)[1] < 1.05,
     `stopped at y = ${E.point(M)[1].toFixed(3)}, clear ${E.slabSDF(E.point(M)).toFixed(4)}`);
}

{
  // And the wrap is walkable: keep going in one direction and you come back.
  let M = E.placeAt(-0.55, 0, E.E3T_PLAYER_R), v = [E.E3T_WALK, 0, 0];
  const startP = E.point(M);
  const dt = 1 / 240;
  const laps = E.CELL[0] / E.E3T_WALK;
  for (let i = 0; i < Math.round(laps / dt); i++) {
    [M, v] = E.e3tStep(M, v, dt);
    [M, v] = E.e3tCollide(M, v, E.slabSDF);
  }
  ok('walking one cell down the street returns you to where you started',
     E.torusDist(E.point(M), startP, E.MODE.SLAB) < 0.02,
     `off by ${E.torusDist(E.point(M), startP, E.MODE.SLAB).toExponential(2)}`);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
