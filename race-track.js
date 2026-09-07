// Shared track data and CPU/GLSL distance expressions. Coordinates are points
// on the S2 floor; height is the independent third component.
//
// Written once and emitted twice, exactly as every other world here does it,
// which is why the arithmetic on the two sides has to be the SAME arithmetic
// and not merely the same answer. `tools/sdf-check.js` compares them on a real
// GPU; this file is now one of the cases it checks.

// NO IMPORTS, deliberately. `s2r.js` imports this file to emit its GLSL, so
// importing `horizDist` back out of it makes a cycle -- one that happens to
// work, because nothing here calls it at module scope, and that is exactly the
// kind of thing that stops working when someone adds a constant. The identity
// is three lines; see product.js for why it is this one and not acos.

/**
 * Arc distance on the unit sphere, via <p-q,p-q> = 4 sin^2(d/2).
 *
 * The same form `product.js horizDist` uses, and for the same reason: acos of
 * the inner product is algebraically right and loses its precision exactly
 * where the two points are close, which is the only regime a collision test
 * ever runs in.
 */
const arcDist = (p, q) => {
  const w = [p[0] - q[0], p[1] - q[1], p[3] - q[3]];
  const c = Math.sqrt(Math.max(w[0] * w[0] + w[1] * w[1] + w[2] * w[2], 0)) / 2;
  return 2 * Math.asin(Math.max(-1, Math.min(1, c)));
};

/** Half-width of the road, in arc. The floor material inside this is tarmac. */
export const RACE_WIDTH = 0.29;

/**
 * The hurdles, and what makes them a decision rather than an obstacle.
 *
 * Measured against the jump the racer actually has -- apex 0.405, hang time
 * 0.600 s, and a top to clear at 0.14 + the player's own 0.10:
 *
 *     arc covered while clear of the top   0.413 at road speed
 *                                          0.728 on turbo
 *     arc a hurdle of radius r needs       2r + 0.20
 *
 * At r = 0.23 that is 0.66, which is comfortably inside the turbo figure and
 * comfortably OUTSIDE the cruising one. So:
 *
 *   **YOU CANNOT CLEAR A HURDLE AT CRUISING SPEED.** Drift through the turns
 *   to charge, boost, and jump it -- or leave the road and go round, at 40% of
 *   your speed. Measured on the real integrator: 6.65 s a lap on the boosted
 *   line against 9.91 s on the detour, and a run that does neither stops dead.
 *
 * That is the loop the mode was reaching for, and none of it was reachable
 * before because the HUD said "jump earlier or go around" while the on-road
 * gap beside a hurdle was 0.060 against a player 0.10 across -- a detour the
 * geometry does not permit, recommended by the only text on screen.
 *
 * The gap is left deliberately impassable rather than widened. A hurdle you
 * can thread on the tarmac is one nobody ever jumps.
 */
export const RACE_HURDLES = [Math.PI / 2, 3 * Math.PI / 2].map((t) => ({
  at: [Math.sin(t), 0, 0.07, Math.cos(t)], radius: 0.23, halfHeight: 0.07,
}));

/** Bright, because it is the one thing on the road you have to react to. */
export const RACE_HURDLE_MAT = 4;

/**
 * Distance to the nearest hurdle: a disc in the floor plan crossed with a
 * height slab, `max` of the two -- exact inside, an underestimate outside the
 * rim, the convention every primitive in this project uses.
 *
 * THROUGH `arcDist`, NOT `Math.acos`. This said `acos` of the inner product,
 * which is algebraically the arc distance and numerically the wrong way to get
 * it: acos loses its precision exactly where the argument is near 1, which is
 * where two points are CLOSE -- and close is the only regime a collision test
 * ever runs in. `arcDist` goes through `<p-q,p-q> = 4 sin^2(d/2)` for the
 * same reason every other distance here does. It also made the JS and the GLSL
 * do different arithmetic for the same number, which is the drift
 * `tools/sdf-check.js` exists to catch and could not, because this file was
 * not one of its cases. It is now.
 */
export function raceObstacleSDF(p) {
  let best = Infinity;
  for (const b of RACE_HURDLES) {
    best = Math.min(best, Math.max(arcDist(p, b.at) - b.radius,
      Math.abs(p[2] - b.at[2]) - b.halfHeight));
  }
  return best;
}

const num = (n) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
};

export function raceTrackGLSL() {
  return RACE_HURDLES.map((b) => `
  { float d = max(hHorizDist(p, vec4(${b.at.map(num).join(', ')})) - ${num(b.radius)},
      abs(p.z - ${num(b.at[2])}) - ${num(b.halfHeight)});
    if (d < m.x) m = vec2(d, ${num(RACE_HURDLE_MAT)}); }`).join('\n');
}
