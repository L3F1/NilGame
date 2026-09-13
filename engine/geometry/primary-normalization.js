// Primary E3/S3 rays only. Keep the arithmetic shared with the exclusion pass.
// Explicit length/division avoids relying on the native normalize expansion.
// This is a stabilization candidate, not a cross-program determinism proof.
// H3 uses its metric normalization; transported directions are unchanged.
export const PRIMARY_NORMALIZATION_GLSL=`
vec4 euclideanPrimaryUnit(vec4 raw){
  float squared=((raw.x*raw.x+raw.y*raw.y)+raw.z*raw.z)+raw.w*raw.w;
  return raw/sqrt(squared);
}`;
