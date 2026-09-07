// Playable geometry registration. No DOM, physics state, or shader imports.
// shaderId values are the existing GLSL #if ABI: keep them stable.
// A geometry is not a quotient or a game mode. H3's two quotients still share
// one program; E3 has math support but is not yet a playable scene.
export const SPACES = Object.freeze([
  Object.freeze({ key: 'h3', option: 'hyperbolic', shaderId: 0,
    programName: 'scene (hyperbolic)', family: 'constant-curvature' }),
  Object.freeze({ key: 's3', option: 'spherical', shaderId: 1,
    programName: 'scene (spherical)', family: 'constant-curvature' }),
  Object.freeze({ key: 'h2r', option: 'H^2 x R', shaderId: 2,
    programName: 'scene (H^2 x R)', family: 'surface-product' }),
  Object.freeze({ key: 's2r', option: 'S^2 x R', shaderId: 3,
    programName: 'scene (S^2 x R)', family: 'surface-product' }),
]);

export function spaceFor(key) {
  const space = SPACES.find((entry) => entry.key === key);
  if (!space) throw new Error(`Unknown geometry: ${key}`);
  return space;
}

export function spaceForOption(option) {
  const space = SPACES.find((entry) => entry.option === option);
  if (!space) throw new Error(`Unknown geometry option: ${option}`);
  return space;
}
