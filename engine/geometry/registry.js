// Playable geometry registration. No DOM, physics state, or shader imports.
// shaderId values are the existing GLSL #if ABI: keep them stable.
// A geometry is not a quotient or a game mode. H3's two quotients still share
// one program; e3t is the existing flat-quotient experience, not a metric ID.
// New scene documents describe the E3 metric separately from topology.
export const SPACES = Object.freeze([
  Object.freeze({ key: 'h3', option: 'hyperbolic', shaderId: 0,
    programName: 'scene (hyperbolic)', family: 'constant-curvature' }),
  Object.freeze({ key: 's3', option: 'spherical', shaderId: 1,
    programName: 'scene (spherical)', family: 'constant-curvature' }),
  Object.freeze({ key: 'h2r', option: 'H^2 x R', shaderId: 2,
    programName: 'scene (H^2 x R)', family: 'surface-product' }),
  Object.freeze({ key: 's2r', option: 'S^2 x R', shaderId: 3,
    programName: 'scene (S^2 x R)', family: 'surface-product' }),
  // E^3/Lambda is a family of its own: flat, and the only one here whose
  // quotient the renderer handles inside the distance function rather than
  // with a fundamental domain. Two worlds share the one program, chosen by
  // uOpen -- the slab (x, y glued) and the 3-torus (all three).
  Object.freeze({ key: 'e3t', option: 'flat torus', shaderId: 4,
    programName: 'scene (E^3 / lattice)', family: 'flat-quotient' }),
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
