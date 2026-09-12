// EXPERIMENT ENTRY POINT. The interval exclusion helper now lives in the
// geometry layer (engine/geometry/spherical-miss-pass-glsl.js) so the live
// exclusion pass and this experiment share one implementation; the experiment's
// import path is retained. Still not imported by the production connected
// shader: no roots, hit points or event ordering are changed by this path.
export {SPHERICAL_MISS_GLSL} from '../engine/geometry/spherical-miss-pass-glsl.js';
