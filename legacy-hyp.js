// legacy-hyp.js -- the hyperbolic primitives as hyp.js computed them BEFORE
// they were delegated to geom.js. A frozen reference, for tests only.
//
// WHY THIS FILE EXISTS
//
// geom.test.js's most important test was "at k = -1, geom.js agrees with
// hyp.js". The moment hyp.js started delegating to geom.js, that test became a
// tautology: it compared geom to geom and would have passed no matter what
// either did. A regression test that cannot fail is worse than no test,
// because it still reads like reassurance.
//
// So the pre-delegation implementations live on here, copied verbatim, and the
// comparison is made against these instead. This file is NOT imported by the
// game and must never be: it is the old answer, kept so the new one can be
// held against it.
//
// Do not "fix" or modernise anything below. Its only value is being exactly
// what the code used to be.

const SIG = [1, 1, 1, -1];

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
}

export function frameVec(M, i) {
  return [M[i * 4], M[i * 4 + 1], M[i * 4 + 2], M[i * 4 + 3]];
}

export function matMul(A, B) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[k * 4 + r] * B[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function apply(M, v) {
  const out = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let c = 0; c < 4; c++) s += M[c * 4 + r] * v[c];
    out[r] = s;
  }
  return out;
}

export function inv(M) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) out[c * 4 + r] = SIG[r] * SIG[c] * M[r * 4 + c];
  }
  return out;
}

export function reorthonormalize(M) {
  const col = [0, 1, 2, 3].map((i) => frameVec(M, i));
  let n = Math.sqrt(Math.max(-dot(col[3], col[3]), 1e-300));
  col[3] = col[3].map((x) => x / n);
  for (let i = 0; i < 3; i++) {
    const d3 = dot(col[i], col[3]);
    col[i] = col[i].map((x, j) => x + d3 * col[3][j]);
    for (let j = 0; j < i; j++) {
      const dj = dot(col[i], col[j]);
      col[i] = col[i].map((x, k) => x - dj * col[j][k]);
    }
    n = Math.sqrt(Math.max(dot(col[i], col[i]), 1e-300));
    col[i] = col[i].map((x) => x / n);
  }
  return [...col[0], ...col[1], ...col[2], ...col[3]];
}

export function translation(u, t) {
  const ch = Math.cosh(t), sh = Math.sinh(t);
  const uu = [u[0], u[1], u[2], 0];
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = r === c ? 1 : 0;
      v += (ch - 1) * uu[r] * uu[c];
      v += sh * (uu[r] * (c === 3 ? 1 : 0) + (r === 3 ? 1 : 0) * uu[c]);
      v += (ch - 1) * (r === 3 ? 1 : 0) * (c === 3 ? 1 : 0);
      out[c * 4 + r] = v;
    }
  }
  return out;
}

export function geodesicFromIdentity(f, t) {
  const s = Math.hypot(f[0], f[1], f[2]);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (s < 1e-14) return I;
  return translation([f[0] / s, f[1] / s, f[2] / s], s * t);
}

/** The old exp: build the whole matrix, then read its last column. */
export function exp(v) {
  const M = geodesicFromIdentity(v, 1);
  return [M[12], M[13], M[14], M[15]];
}

export function log(r) {
  const sp = Math.hypot(r[0], r[1], r[2]);
  if (sp < 1e-12) return [0, 0, 0];
  const d = Math.asinh(sp);
  const k = d / sp;
  return [r[0] * k, r[1] * k, r[2] * k];
}

export function dist(p, q) {
  const w = [p[0] - q[0], p[1] - q[1], p[2] - q[2], p[3] - q[3]];
  return 2 * Math.asinh(Math.sqrt(Math.max(dot(w, w), 0)) * 0.5);
}
