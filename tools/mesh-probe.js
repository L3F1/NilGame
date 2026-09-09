// tools/mesh-probe.js -- can a triangle mesh represent a curved surface?
//
//   node tools/mesh-probe.js
//
// This exists to answer one decision question with a number instead of an
// opinion: **can imported assets be used in non-Euclidean space, or at least
// approximated well enough to be worth having?** The answer decides whether a
// host's asset pipeline is worth migrating for, so it should not rest on
// recollection of the literature.
//
// THE CLAIM UNDER TEST. In the projective model of a constant-curvature space
// -- Klein for k < 0, gnomonic for k > 0, which is the same formula
// p |-> (p0/p3, p1/p3, p2/p3) -- geodesics are STRAIGHT LINES. If that holds,
// an ordinary GPU rasterizer, which interpolates linearly between projected
// vertices, draws exact geodesic EDGES for free. Only the triangle's INTERIOR
// is then wrong, because a flat filling is not the geodesic surface, and that
// error shrinks with subdivision.
//
// So the probe measures two different things and must not conflate them:
//
//   EDGE error      does the projective midpoint of two vertices lie on the
//                   geodesic between them? If this is not ~0 the whole
//                   technique is wrong and no amount of subdivision helps.
//   INTERIOR error  how far off the true surface is a point inside a flat
//                   triangle, as a function of subdivision?
//
// WHAT THIS DOES NOT COVER, and the honest limit on the answer: Nil, Sol and
// SL~(2,R) have NO projective model in which geodesics are straight. Sol's
// geodesics are not even planar. So the good news below applies to E3, H3, S3
// and (edge-wise, per factor) the product geometries -- and does not transfer
// to the twisted three, which is where this project's distinctive content is.
import { geometry } from '../geom.js';

/** p |-> p/p3: Klein for k<0, gnomonic for k>0, identity-ish for k=0. */
const project = (p) => [p[0] / p[3], p[1] / p[3], p[2] / p[3]];
/** The inverse, pushed back onto the model by the geometry itself. */
const unproject = (G, c) => G.normalize([c[0], c[1], c[2], 1]);

/** An icosahedron subdivided `level` times, vertices on the unit 2-sphere. */
export function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let i = 0; i < level; i++) {
    const mid = new Map(), next = [];
    const midpoint = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (mid.has(key)) return mid.get(key);
      const m = verts[a].map((x, j) => x + verts[b][j]);
      const n = Math.hypot(...m);
      verts.push(m.map((x) => x / n));
      mid.set(key, verts.length - 1);
      return verts.length - 1;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

/**
 * Measure a sphere of metric radius `r` in curvature `k`, meshed at `level`.
 *
 * The mesh's vertices sit exactly on the true surface by construction -- they
 * are exp of a tangent vector of length r -- so any error found is the error
 * of the FLAT FILLING between them, which is precisely the question.
 */
export function measure(k, r, level) {
  const G = geometry(k);
  const { verts, faces } = icosphere(level);
  const onSurface = verts.map((u) => G.exp([u[0] * r, u[1] * r, u[2] * r]));
  const projected = onSurface.map(project);

  let edgeError = 0, interiorError = 0, shortest = Infinity, longest = 0;
  const seen = new Set();
  for (const f of faces) {
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const len = G.dist(onSurface[a], onSurface[b]);
      if (!seen.has(key)) {
        seen.add(key);
        shortest = Math.min(shortest, len); longest = Math.max(longest, len);
        // THE PREMISE. The projective midpoint of the two vertices must be the
        // geodesic midpoint: equal distance to both ends, summing to the edge.
        const m = unproject(G, projected[a].map((x, j) => (x + projected[b][j]) / 2));
        const da = G.dist(m, onSurface[a]), db = G.dist(m, onSurface[b]);
        edgeError = Math.max(edgeError, Math.abs(da - db), Math.abs(da + db - len));
      }
    }
    // The filling. A rasterizer interpolates the projected vertices linearly,
    // so sample the flat triangle in projective coordinates -- sampling the
    // model coordinates instead would measure a technique nobody uses.
    for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.25, 0.25],
      [0.25, 0.5, 0.25], [0.25, 0.25, 0.5], [0.5, 0.5, 0], [0.2, 0.4, 0.4]]) {
      const c = [0, 1, 2].map((j) =>
        projected[f[0]][j] * wa + projected[f[1]][j] * wb + projected[f[2]][j] * wc);
      interiorError = Math.max(interiorError, Math.abs(G.dist(G.ORIGIN, unproject(G, c)) - r));
    }
  }
  return {
    triangles: faces.length, vertices: verts.length,
    edgeError, interiorError, shortest, longest,
    relative: interiorError / r,
  };
}

export function report() {
  const NAMES = { '-1': 'H3 (k=-1)', 0: 'E3 (k=0)', 1: 'S3 (k=+1)' };
  const rows = [];
  for (const k of [-1, 0, 1]) {
    // Radii chosen against the curvature radius, which is 1 here: 0.3 is small
    // (nearly flat), 1.5 is comparable, 2.5 is large enough that hyperbolic
    // volume growth is doing real work. A technique that only survives tiny
    // objects is not an asset pipeline.
    for (const r of [0.3, 1.5, 2.5]) {
      if (k > 0 && r >= Math.PI / 2) continue;   // past the gnomonic horizon
      for (const level of [0, 1, 2, 3, 4]) {
        rows.push({ k, r, level, ...measure(k, r, level) });
      }
    }
  }

  let worstEdge = 0;
  console.log('  geometry      radius  level     tris   edge err   interior err   rel');
  for (const row of rows) {
    worstEdge = Math.max(worstEdge, row.edgeError);
    console.log(`  ${NAMES[row.k].padEnd(12)} ${row.r.toFixed(2).padStart(6)}`
      + `  ${String(row.level).padStart(5)} ${String(row.triangles).padStart(8)}`
      + `  ${row.edgeError.toExponential(2).padStart(9)}`
      + `  ${row.interiorError.toExponential(2).padStart(13)}`
      + `  ${(row.relative * 100).toFixed(3).padStart(7)}%`);
  }

  // The verdict, stated as the thing a decision needs rather than as a pass.
  const finest = rows.filter((row) => row.level === 4);
  const worstFine = Math.max(...finest.map((row) => row.relative));
  console.log(`\n  Edges: worst deviation from the geodesic ${worstEdge.toExponential(2)}`
    + ' -- straight lines in the projective model ARE geodesics.');
  console.log(`  Interiors: at 5120 triangles the worst radius error is `
    + `${(worstFine * 100).toFixed(3)}% of the radius.`);
  console.log('  Not covered: Nil, Sol, SL~(2,R) have no projective model in which');
  console.log('  geodesics are straight, so none of the above transfers to them.');
  if (!(worstEdge < 1e-9)) {
    console.error('\nFAIL: the projective model did not preserve geodesics.');
    process.exit(1);
  }

}

// Only when run directly: importing this for a test must not print a table.
if (process.argv[1] && process.argv[1].endsWith('mesh-probe.js')) report();
