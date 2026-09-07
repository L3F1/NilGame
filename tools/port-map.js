// tools/port-map.js — take a FLAT floor plan and put it in a curved world.
//
//   node tools/port-map.js                        the built-in demo plan
//   node tools/port-map.js myplan.json
//   node tools/port-map.js myplan.json --embed=conformal --world=h2r --fill=0.8
//
// A plan is line segments in ordinary flat coordinates, the way anybody would
// draw one: on graph paper, in a vector editor, in a tile map. This ports it
// into the geodesic-polar coordinates `level.js` and `h2r.js` author in, says
// what the port cost, checks it fits the fundamental domain, and prints the
// WALLS array ready to paste.
//
// A plan file is JSON:
//
//   { "segments": [[[x1,y1],[x2,y2]], ...], "thickness": 0.07,
//     "low": 0.0, "high": 0.8 }
//
// Everything but `segments` is optional.
//
// WHAT TO EXPECT, because it decides whether the answer is usable: read the
// table it prints before the array. `straight` is how far a ported wall's
// middle strays from the geodesic its endpoints define -- if that is not zero,
// the wall you drew is not the wall you get, and only the PROJECTIVE embedding
// makes it zero. `shape` is 1 only for the conformal one. `worst`/`best` are
// what the distances cost. There is no embedding that is good at all three,
// and `port.js` has the argument for why there cannot be.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMBED, embedding, fitScale, compare, straightnessError, distanceReport,
  shapeReport,
} from '../port.js';
import { H3, E3 } from '../geom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The worlds a ported plan can go into, and the inradius each one allows.
// These are the numbers CLAUDE.md's clearance rule is stated against: plane
// distance is 1-Lipschitz, so a point d from the centre is at least
// (inradius - d) from every face, and centre distance plus thickness must stay
// under the inradius or the wall straddles a face and is CUT OFF at it.
const WORLDS = {
  octagon: { inradius: 1.5286, k: -1, note: 'floor (2D wrap), the genus-2 world' },
  dodeca: { inradius: 0.996, k: -1, note: 'open (3D wrap), Seifert-Weber' },
  h2r: { inradius: 4.0, k: -1, note: 'H^2 x R -- no quotient, so this is a soft budget' },
  flat: { inradius: 1.5286, k: 0, note: 'E^2, the control: the port is a scaling' },
};

// A plan you can see the point of. Two rooms off a corridor, a diagonal, and a
// small square: the diagonal is there because it crosses the grid, and the
// square is there because a square is the shape no hyperbolic port can keep.
const DEMO = {
  segments: [
    // corridor
    [[-1.6, -0.25], [1.6, -0.25]],
    [[-1.6, 0.25], [-0.5, 0.25]],
    [[0.5, 0.25], [1.6, 0.25]],
    // a room off the north side
    [[-0.5, 0.25], [-0.5, 1.3]],
    [[-0.5, 1.3], [0.5, 1.3]],
    [[0.5, 1.3], [0.5, 0.25]],
    // the ends
    [[-1.6, -0.25], [-1.6, 0.25]],
    [[1.6, -0.25], [1.6, 0.25]],
    // a free-standing square in the room, and a diagonal across the corridor
    [[-0.2, 0.6], [0.2, 0.6]], [[0.2, 0.6], [0.2, 1.0]],
    [[0.2, 1.0], [-0.2, 1.0]], [[-0.2, 1.0], [-0.2, 0.6]],
    [[-1.2, -0.25], [-0.6, 0.25]],
  ],
  thickness: 0.07,
  low: 0.0,
  high: 0.8,
};

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};

const plan = file ? JSON.parse(readFileSync(join(ROOT, file), 'utf8')) : DEMO;
const kind = opt('embed', EMBED.PROJECTIVE);
const worldName = opt('world', 'octagon');
const fill = Number(opt('fill', '0.9'));

if (!Object.values(EMBED).includes(kind)) {
  console.error(`unknown --embed=${kind}. One of: ${Object.values(EMBED).join(', ')}`);
  process.exit(1);
}
const world = WORLDS[worldName];
if (!world) {
  console.error(`unknown --world=${worldName}. One of: ${Object.keys(WORLDS).join(', ')}`);
  process.exit(1);
}

const segments = plan.segments;
const thickness = plan.thickness ?? 0.07;
const low = plan.low ?? 0.0;
const high = plan.high ?? 0.8;

// Every endpoint, deduplicated, is what the scale is fitted to and what the
// distance report is measured over.
const points = [];
const seen = new Set();
for (const [a, b] of segments) {
  for (const p of [a, b]) {
    const key = `${p[0]},${p[1]}`;
    if (!seen.has(key)) { seen.add(key); points.push(p); }
  }
}

// The wall has to fit INSIDE the inradius with its thickness, so the geometry
// it is fitted to is the inradius minus the thickness. Getting that the wrong
// way round is how a wall ends up cut off at a face, which nothing else
// notices: both SDFs still agree and the physics still collides correctly.
const target = world.inradius - thickness;
const G = world.k < 0 ? H3() : E3();

console.log(`plan: ${segments.length} segments, ${points.length} endpoints`);
console.log(`world: ${worldName} -- ${world.note}`);
console.log(`       inradius ${world.inradius}, wall thickness ${thickness},`
  + ` so the port is fitted to ${target.toFixed(4)} at fill ${fill}\n`);

const corners = [];
for (let i = 1; i + 1 < points.length; i++) corners.push([points[i - 1], points[i], points[i + 1]]);
console.log('all three embeddings, on this plan, in this world:');
console.table(compare(G, points, corners, segments, target, fill));

const scale = fitScale(points, kind, world.k, target, fill);
const f = embedding(kind, world.k, scale);
const d = distanceReport(G, f, points);

console.log(`\nchosen: ${kind}, scale ${scale.toFixed(6)}`);
console.log(`  distances come out ${d.best.toFixed(3)}x to ${d.worst.toFixed(3)}x`
  + ` (mean ${d.mean.toFixed(3)}x) of the flat ones`);
let straight = 0;
for (const [a, b] of segments) straight = Math.max(straight, straightnessError(G, f, a, b));
console.log(`  worst wall bend  ${straight.toExponential(2)}`
  + (straight < 1e-12 ? '   -- walls stay geodesics, exactly'
    : `   -- a wall's middle strays this far from the line its ends define`));
console.log(`  worst shape anisotropy ${shapeReport(kind, world.k, points, scale).toFixed(3)}`
  + (Math.abs(shapeReport(kind, world.k, points, scale) - 1) < 1e-12
    ? '  -- shapes are preserved' : '  -- a circle comes out as an ellipse'));

// --- clearance, which is the check that decides whether this can ship ------
//
// Same rule as everywhere else here, and it is checked rather than trusted.
// A wall is a geodesic segment, so the furthest any of it gets from the centre
// is at an endpoint -- convexity, in a form that happens to be useful.
let worstReach = 0;
const ported = segments.map(([a, b]) => {
  const pa = f(a[0], a[1]), pb = f(b[0], b[1]);
  worstReach = Math.max(worstReach, Math.hypot(pa[0], pa[1]), Math.hypot(pb[0], pb[1]));
  return [pa, pb];
});
const clear = world.inradius - (worstReach + thickness);
console.log(`\nclearance: furthest wall point ${worstReach.toFixed(4)} + thickness`
  + ` ${thickness} = ${(worstReach + thickness).toFixed(4)}`
  + ` against inradius ${world.inradius}`);
if (clear < 0) {
  console.log(`  FAIL by ${(-clear).toFixed(4)}. This plan straddles a face, and a`);
  console.log('  surface that straddles a face is CUT OFF at it -- both SDFs still');
  console.log('  agree, the physics still collides, and only the picture is wrong.');
  console.log('  Lower --fill, or use a world with a larger inradius.');
} else {
  console.log(`  ok, ${clear.toFixed(4)} to spare`);
}

// --- the array ------------------------------------------------------------

const num = (n) => {
  const v = Number(n);
  return (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).replace(/^-0\.0000$/, '0.0000');
};
console.log('\n// [a1, b1, a2, b2, thickness, low altitude, high altitude]');
console.log(`// Ported from a flat plan by tools/port-map.js:`);
console.log(`//   embedding ${kind}, world ${worldName}, fill ${fill}, scale ${scale.toFixed(6)}`);
console.log('export const WALLS = [');
for (const [pa, pb] of ported) {
  console.log(`  [${num(pa[0])}, ${num(pa[1])}, ${num(pb[0])}, ${num(pb[1])},`
    + ` ${num(thickness)}, ${num(low)}, ${num(high)}],`);
}
console.log('];');

process.exit(clear < 0 ? 1 : 0);
