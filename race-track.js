// Shared track data and CPU/GLSL distance expressions. Coordinates are points
// on the S2 floor; height is the independent third component.
export const RACE_WIDTH = 0.29;
export const RACE_HURDLES = [Math.PI / 2, 3 * Math.PI / 2].map((t) => ({
  at: [Math.sin(t), 0, 0.07, Math.cos(t)], radius: 0.23, halfHeight: 0.07,
}));
export function raceObstacleSDF(p) {
  let best = Infinity;
  for (const b of RACE_HURDLES) {
    const d = Math.acos(Math.max(-1, Math.min(1, p[0] * b.at[0] + p[1] * b.at[1] + p[3] * b.at[3])));
    best = Math.min(best, Math.max(d - b.radius, Math.abs(p[2] - b.at[2]) - b.halfHeight));
  }
  return best;
}
export function raceTrackGLSL() {
  return RACE_HURDLES.map((b) => `
  { float d = max(hHorizDist(p, vec4(${b.at.map((x) => x.toFixed(9)).join(',')})) - ${b.radius.toFixed(9)},
      abs(p.z - ${b.at[2].toFixed(9)}) - ${b.halfHeight.toFixed(9)});
    if (d < m.x) m = vec2(d, 8.0); }`).join('\n');
}
