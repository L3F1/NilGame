// MUSE-23: what does a carve cost at query time?
//
// Measures distance(), normal() and rayHit() throughput on documents built
// HERE (not fixtures) with 0/1/2/4/8 carves at 1/4/16 additive solids.
// Reports ratios to the uncarved case plus mean marched steps for rayHit.
//
// Method: per configuration, JIT warmup (5000 untimed calls), then adaptive
// iteration sizing (double until a run takes >= 250 ms) and three timed runs
// reporting min/median/max calls per second. Step counts come from the same
// march loop rayHit runs, replicated against the PUBLIC distance() bound
// with a counter; the bench asserts the replica returns exactly rayHit's t
// on every measured ray, so the counts describe the real loop.
import { compileSceneField } from '../engine/world/scene-field.js';

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;

function buildDoc(solids, carves) {
  const entities = [{ id: 'start', regionId: 'r', kind: 'spawn', position: [0, -6, 0.3] }];
  const centers = [];
  for (let i = 0; i < solids; i++) {
    const c = [2.2 * (i - (solids - 1) / 2), 0, 1];
    centers.push(c);
    entities.push({ id: `s${i}`, regionId: 'r', kind: 'ball', position: c, radius: 0.9 });
  }
  for (let j = 0; j < carves; j++) {
    const s = j % solids, c = centers[s];
    entities.push({ id: `c${j}`, regionId: 'r', kind: 'ball', op: 'subtract', target: `s${s}`,
      position: [c[0] + 0.3, c[1], c[2] + 0.4], radius: 0.6 });
  }
  return {
    format: 'nil-scene', version: 1, id: `bench-${solids}x${carves}`,
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
    entities, connections: [],
  };
}

function querySets(centers) {
  const points = [];
  for (const c of centers) {
    points.push([c[0] + 1.5, c[1], c[2]], [c[0], c[1], c[2] + 2], [c[0] - 1.2, c[1] + 0.5, c[2]]);
  }
  points.push([0, -6, 1], [9, 9, 9]);
  const rays = [];
  for (const c of centers) {
    rays.push([[c[0], -6, c[2]], [0, 1, 0]]);
    rays.push([[c[0] + 2, -6, c[2]], [-0.2, 1, 0.05]]);
  }
  rays.push([[0, -6, 1], [1, 0, 0]]); // miss
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  return { points, rays: rays.map(([p, u]) => [p, norm(u)]) };
}

// Same loop as scene-field rayHit (threshold 1e-6, budget 256), plus counter.
function marchedSteps(f, p, u) {
  let t = 0;
  for (let step = 1; step <= 256; step++) {
    const d = f.distance([p[0] + u[0] * t, p[1] + u[1] * t, p[2] + u[2] * t]);
    if (d < 1e-6) return { t, steps: step };
    t += d;
    if (t > 1e6) break;
  }
  return { t: Infinity, steps: 256 };
}

function measure(callsPerIter, run) {
  for (let i = 0; i < 5000; i++) run(i); // warmup, untimed: a cold JIT is not a measurement
  let iters = 1000;
  for (;;) {
    const t0 = nowMs();
    for (let i = 0; i < iters; i++) run(i);
    if (nowMs() - t0 >= 250 || iters >= 2e6) break;
    iters *= 4;
  }
  const rates = [];
  for (let r = 0; r < 3; r++) {
    const t0 = nowMs();
    for (let i = 0; i < iters; i++) run(i);
    rates.push((iters / (nowMs() - t0)) * 1000);
  }
  rates.sort((a, b) => a - b);
  return { iters, min: rates[0], med: rates[1], max: rates[2] };
}

const fmt = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${(x / 1e3).toFixed(1)}k`);
const results = [];
for (const solids of [1, 4, 16]) {
  for (const carves of [0, 1, 2, 4, 8]) {
    const f = compileSceneField(buildDoc(solids, carves));
    const { points, rays } = querySets(
      Array.from({ length: solids }, (_, i) => [2.2 * (i - (solids - 1) / 2), 0, 1]));
    const distance = measure(points.length, (i) => f.distance(points[i % points.length]));
    const normal = measure(points.length, (i) => f.normal(points[i % points.length]));
    const rayHit = measure(rays.length, (i) => f.rayHit(...rays[i % rays.length]));
    let steps = null;
    if (carves > 0) {
      let total = 0, hits = 0;
      for (const [p, u] of rays) {
        const { t, steps: s } = marchedSteps(f, p, u);
        if (t === f.rayHit(p, u) || (t === Infinity && f.rayHit(p, u) === Infinity)) {
          total += s;
          hits++;
        } else throw new Error(`replica disagrees with rayHit at ${JSON.stringify(p)}`);
      }
      steps = total / hits;
    }
    results.push({ solids, carves, distance, normal, rayHit, steps });
    console.log(`done ${solids} solids x ${carves} carves`);
  }
}

console.log('\n# calls/sec: min / med / max (rounded in table to med)');
console.log('| solids | carves | distance | normal | rayHit | mean march steps |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const r of results) {
  console.log(`| ${r.solids} | ${r.carves} | ${fmt(r.distance.med)} `
    + `(${fmt(r.distance.min)}-${fmt(r.distance.max)}) | ${fmt(r.normal.med)} `
    + `(${fmt(r.normal.min)}-${fmt(r.normal.max)}) | ${fmt(r.rayHit.med)} `
    + `(${fmt(r.rayHit.min)}-${fmt(r.rayHit.max)}) | ${r.steps === null ? 'closed form' : r.steps.toFixed(1)} |`);
}
console.log('\n# ratios to uncarved (median rates)');
console.log('| solids | carves | distance | normal | rayHit |');
console.log('| --- | --- | --- | --- | --- |');
for (const solids of [1, 4, 16]) {
  const base = results.find((r) => r.solids === solids && r.carves === 0);
  for (const r of results.filter((x) => x.solids === solids)) {
    const ratio = (a, b) => (a / b).toFixed(2);
    console.log(`| ${solids} | ${r.carves} | ${ratio(r.distance.med, base.distance.med)} `
      + `| ${ratio(r.normal.med, base.normal.med)} | ${ratio(r.rayHit.med, base.rayHit.med)} |`);
  }
}
