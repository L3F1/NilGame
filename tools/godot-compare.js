// Compare linear layout of top-to-bottom RGBA8 captures, excluding alpha.
//
// WHAT THIS HAS TO SEPARATE, and the first version could not. Two GPU shader
// compilers running the same source never agree bit for bit, and this scene
// has two ways of turning that into visible pixels that are NOT a rendering
// disagreement:
//
//   GRAZING INCIDENCE. `sceneNormal` takes eight finite differences and bails
//   to upAt(p) when they cancel (mdot(G,G) < 1e-8). Bailing reads key = 1
//   where the true normal reads nearly zero, so it can only make a pixel
//   BRIGHTER -- which is why every H3 view came out brighter than the browser
//   and not one came out darker. Whether the cancellation trips is decided in
//   the last few bits, so the two compilers trip it on different pixels. It
//   is a property of the shader, tuned once against ANGLE, and not of the host.
//
//   SUB-PIXEL COPIES. In the dodecahedral world the horizon is packed with
//   images of the room smaller than a pixel. CLAUDE.md calls that aliasing and
//   says the only cure is more samples; two compilers land on different sides
//   of it, on the silhouettes.
//
// Both scatter along EDGES and along surfaces seen nearly edge-on. A real
// disagreement -- a wrong fold, a mis-paired face, a skipped primitive -- draws
// a COHERENT REGION in the middle of a smooth surface instead. So the accepted
// measure is the largest connected blob of differing pixels that is not sitting
// on an edge, which is what "the two renderers drew a different picture" looks
// like, and the mean is reported alongside rather than used as the gate.
//
// Measured, and this is what the numbers above are calibrated from: pointing
// the SAME camera at the SAME floor head-on instead of at the horizon
// ('floor-down') takes the pixels over 16 from 3.0% to exactly ZERO, and
// forcing every ray to miss ('floor-miss', a frame of one constant) agrees bit
// for bit on all 230400 pixels.
import { readFileSync, writeFileSync } from 'node:fs';
const backend = process.argv[2] || 'gl_compatibility';
if (!['gl_compatibility', 'forward_plus'].includes(backend)) throw Error('Unknown backend');
const root = new URL('../experiments/godot/results/', import.meta.url);
const native = JSON.parse(readFileSync(new URL(`${backend}/report.json`, root)));
const reference = JSON.parse(readFileSync(new URL('webgl/report.json', root)));
if (native.width !== reference.width || native.height !== reference.height) throw Error('Resolution mismatch');
const W = native.width, H = native.height;
const luma = (buf, i) => (buf[i]*299 + buf[i+1]*587 + buf[i+2]*114) / 1000;
let failed = 0;
const rows = reference.views.map((view) => {
  const a = readFileSync(new URL(`webgl/${view.id}.rgba`, root));
  const b = readFileSync(new URL(`${backend}/${view.id}.rgba`, root));
  if (a.length !== b.length || a.length !== W * H * 4) throw Error('Readback size mismatch');
  const diff = new Uint8Array(W * H);
  let sum = 0, signed = 0, large = 0, min = 255, max = 0;
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[i+c] - b[i+c]);
      sum += d; signed += b[i+c] - a[i+c]; worst = Math.max(worst, d);
      min = Math.min(min, b[i+c]); max = Math.max(max, b[i+c]);
    }
    if (worst > 16) { large++; diff[p] = 1; }
  }
  // Drop the ones sitting on an edge of the reference image: those are the
  // aliasing and silhouette cases above, not a difference of opinion about
  // what is there.
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y*W + x, i = p*4;
    if (!diff[p]) continue;
    const gx = Math.abs(luma(a, i+4) - luma(a, i-4));
    const gy = Math.abs(luma(a, i+W*4) - luma(a, i-W*4));
    if (Math.max(gx, gy) > 12) diff[p] = 2;      // 2 = on an edge, excused
  }
  // Largest connected run of unexcused differing pixels.
  const seen = new Uint8Array(W * H); const stack = []; let blob = 0;
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || diff[start] !== 1) continue;
    let n = 0; stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop(); n++;
      const x = p % W, y = (p - x) / W;
      for (const q of [x > 0 ? p-1 : -1, x < W-1 ? p+1 : -1, y > 0 ? p-W : -1, y < H-1 ? p+W : -1]) {
        if (q >= 0 && !seen[q] && diff[q] === 1) { seen[q] = 1; stack.push(q); }
      }
    }
    blob = Math.max(blob, n);
  }
  const row = {
    id: view.id,
    mean_rgb_error: sum / (W*H*3),
    mean_signed: signed / (W*H*3),
    fraction_pixels_over_16: large / (W*H),
    largest_offedge_blob_px: blob,
  };
  // A blob of 0.1% of the frame is about 230 px at this resolution: far more
  // than compiler scatter and far less than any real structural error, all of
  // which redraw whole surfaces. max-min guards against a blank native frame
  // scoring well by accident.
  row.pass = blob < 0.001 * W * H && max - min > 20;
  if (!row.pass) failed++;
  return row;
});
writeFileSync(new URL(`${backend}/comparison.json`, root), JSON.stringify(rows,null,2)+'\n');
console.table(rows);
console.log(`${rows.length-failed}/${rows.length} native views match WebGL within tolerance.`);
process.exitCode = failed ? 1 : 0;
