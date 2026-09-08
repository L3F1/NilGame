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
  // NIL, the Heisenberg group: the first of the three Thurston geometries this
  // project was missing, and its own family. Not constant curvature and not a
  // product -- a Lie group with a left-invariant metric, so its isometries are
  // affine and a placement is an ordinary mat4. It has NO QUOTIENT here, on
  // purpose and for the same reason S^3 and both products have none: the
  // fundamental-domain apparatus needs the ray/face crossing solved, and
  // against a helix that is transcendental. One thing changes at a time.
  Object.freeze({ key: 'nil', option: 'Nil', shaderId: 5,
    programName: 'scene (Nil)', family: 'lie-group' }),
  Object.freeze({ key: 'sol', option: 'Sol', shaderId: 6,
    programName: 'scene (Sol)', family: 'lie-group' }),
  Object.freeze({ key: 'sl2r', option: 'SL2R', shaderId: 7,
    programName: 'scene (SL2R cover)', family: 'lie-group' }),
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
