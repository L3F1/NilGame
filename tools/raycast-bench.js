// MUSE-35: what does the marched path cost now?
//
// Compares rayCast method:'analytic' against method:'march' on the SAME
// scenes and rays, reported separately -- hits, misses and indeterminates
// never mix, because a miss costs a marcher its whole budget and costs the
// analytic path almost nothing. Statuses are observed, not assumed: the
// table counts what each method actually returned.
//
// Method: per scene x bucket x method, JIT warmup (3000 untimed rays), then
// adaptive repeats (one untimed pass sizes REPS so a run takes >= 50 ms)
// and five timed runs reporting min/median/max microseconds per ray. All
// options are engine defaults (maxSteps 2048, hitEpsilon 1e-6); the command
// and host print with the table, and every number below is reproducible
// from them. This says NOTHING about frame time (CPU ray throughput is not
// a GPU number); the caveat travels with the table.
import { compileSceneField } from '../engine/world/scene-field.js';
import os from 'node:os';

const nowMs = () => Number(process.hrtime.bigint()) / 1e6;
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const unit = (v) => norm(v);

function docOf(id, entities) {
  return {
    format: 'nil-scene', version: 2, id,
    units: { name: 'design-unit', playerRadius: 0.25 },
    regions: [{ id: 'r', geometry: { kind: 'e3', curvatureRadius: 1 }, topology: 'cover', extent: 20 }],
    entities: [{ id: 'start', regionId: 'r', kind: 'spawn', position: [0, -8, 0.3] }, ...entities],
    connections: [],
  };
}

const ball = (id, x, r = 0.9) => ({ id, regionId: 'r', kind: 'ball', position: [x, 0, 1], radius: r });
const carve = (id, target, x, dx = 0.3, dz = 0.4, r = 0.6) =>
  ({ id, regionId: 'r', kind: 'ball', op: 'subtract', target, position: [x + dx, 0, 1 + dz], radius: r });

function raysFor(centers, radii) {
  const hit = [], miss = [], graze = [];
  for (let k = 0; k < centers.length; k++) {
    const [cx, cz, r] = [centers[k][0], centers[k][1], radii[k]];
    hit.push([[cx, -6, cz], unit([0, 1, 0])]);
    hit.push([[cx - 3, -6, cz + 1], unit([0.4, 1, -0.1])]);
    miss.push([[cx, -6, cz], unit([0, -1, 0])]); // aimed away
    miss.push([[cx + 6, -6, cz], unit([0, 1, 0.3])]); // parallel, offset past
    graze.push([[cx + r + 0.01, -6, cz], unit([0, 1, 0])]); // tangent skim
    graze.push([[cx + r + 0.06, -6, cz], unit([-0.02, 1, 0])]); // hairline miss
  }
  return { hit, miss, graze };
}

const SCENES = [
  {
    id: 'plain-3', desc: '3 balls, no modifiers',
    doc: () => docOf('bench-plain-3', [ball('s0', -2.2), ball('s1', 0), ball('s2', 2.2)]),
    rays: () => raysFor([[-2.2, 1], [0, 1], [2.2, 1]], [0.9, 0.9, 0.9]),
  },
  {
    id: 'carve-1', desc: '3 balls, one carve on s0',
    doc: () => docOf('bench-carve-1', [ball('s0', -2.2), ball('s1', 0), ball('s2', 2.2), carve('c0', 's0', -2.2)]),
    rays: () => raysFor([[-2.2, 1], [0, 1], [2.2, 1]], [0.9, 0.9, 0.9]),
  },
  {
    id: 'carve-8', desc: '4 balls, eight carves spread over all four',
    doc: () => {
      const e = [ball('s0', -3.3), ball('s1', -1.1), ball('s2', 1.1), ball('s3', 3.3)];
      ['s0', 's1', 's2', 's3'].forEach((s, k) => {
        const x = [-3.3, -1.1, 1.1, 3.3][k];
        e.push(carve(`c${2 * k}`, s, x), carve(`c${2 * k + 1}`, s, x, -0.3, -0.4, 0.5));
      });
      return docOf('bench-carve-8', e);
    },
    rays: () => raysFor([[-3.3, 1], [-1.1, 1], [1.1, 1], [3.3, 1]], [0.9, 0.9, 0.9, 0.9]),
  },
  {
    id: 'concentrated', desc: '4 balls, six carves all on s0, rest untouched',
    doc: () => {
      const e = [ball('s0', -3.3), ball('s1', -1.1), ball('s2', 1.1), ball('s3', 3.3)];
      for (let j = 0; j < 6; j++) {
        e.push(carve(`c${j}`, 's0', -3.3, 0.3 * Math.cos(j), 0.4 * Math.sin(j), 0.45 + 0.05 * j));
      }
      return docOf('bench-concentrated', e);
    },
    rays: () => raysFor([[-3.3, 1], [-1.1, 1], [1.1, 1], [3.3, 1]], [0.9, 0.9, 0.9, 0.9]),
  },
  {
    id: 'coincident', desc: 'two boxes sharing the z=2 face plane exactly',
    doc: () => docOf('bench-coincident', [
      { id: 'boxa', regionId: 'r', kind: 'box', position: [0, 0, 1], halfExtent: [1, 1, 1] },
      { id: 'boxb', regionId: 'r', kind: 'box', position: [0, 0, 3], halfExtent: [1, 1, 1] },
      { id: 's3', regionId: 'r', kind: 'ball', position: [4, 0, 1], radius: 0.9 },
    ]),
    rays: () => ({
      hit: [[[0, -6, 2], unit([0, 1, 0])], [[0, 0, 6], unit([0, 0, -1])], [[4, -6, 1], unit([0, 1, 0])]],
      miss: [[[0, -6, 2], unit([0, -1, 0])], [[9, 9, 9], unit([0, 0, -1])]],
      graze: [[[1.01, -6, 2], unit([0, 1, 0])], [[1.06, -6, 2], unit([-0.02, 1, 0])]],
    }),
  },
];

function timeBucket(field, rays, method) {
  for (let k = 0; k < 3000; k++) {
    const [p, u] = rays[k % rays.length];
    field.rayCast(p, u, { method });
  }
  const t0 = nowMs();
  for (const [p, u] of rays) field.rayCast(p, u, { method });
  const passMs = Math.max(nowMs() - t0, 1e-3);
  const reps = Math.max(1, Math.min(20000, Math.ceil(50 / passMs)));
  const runs = [];
  for (let run = 0; run < 5; run++) {
    const t1 = nowMs();
    for (let k = 0; k < reps; k++) {
      for (const [p, u] of rays) field.rayCast(p, u, { method });
    }
    runs.push((nowMs() - t1) / (reps * rays.length) * 1000);
  }
  runs.sort((a, b) => a - b);
  // Observed statuses and march steps come from one untimed pass.
  const seen = { hit: 0, miss: 0, indeterminate: 0 };
  let steps = [];
  for (const [p, u] of rays) {
    const r = field.rayCast(p, u, { method });
    seen[r.status] = (seen[r.status] ?? 0) + 1;
    if (method === 'march') steps.push(r.steps);
  }
  steps.sort((a, b) => a - b);
  const med = (a) => a.length ? a[Math.floor(a.length / 2)] : 0;
  return { n: rays.length, ...seen, stepsMed: method === 'march' ? med(steps) : 0, stepsMax: method === 'march' ? steps[steps.length - 1] : 0,
    usMin: runs[0], usMed: runs[2], usMax: runs[4] };
}

const rows = [];
for (const scene of SCENES) {
  const field = compileSceneField(scene.doc());
  const buckets = scene.rays();
  for (const bucket of ['hit', 'miss', 'graze']) {
    for (const method of ['analytic', 'march']) {
      rows.push({ scene: scene.id, bucket, method, ...timeBucket(field, buckets[bucket], method) });
    }
  }
}

const host = `${os.platform()} ${os.arch()} ${os.cpus()[0].model} x${os.cpus().length}`;
console.log(`# raycast-bench — node ${process.version} — ${host}`);
console.log(`# command: node tools/raycast-bench.js`);
console.log(`# defaults: maxSteps 2048, hitEpsilon 1e-6, maxDistance extent*8; 3000-ray warmup, 5 runs, min/med/max us per ray`);
console.log(`# THIS SAYS NOTHING ABOUT FRAME TIME. CPU ray throughput is not a GPU number.`);
console.log(`| scene | bucket | method | n | hit | miss | indet | stepsMed | stepsMax | usMin | usMed | usMax |`);
console.log(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
for (const r of rows) {
  console.log(`| ${r.scene} | ${r.bucket} | ${r.method} | ${r.n} | ${r.hit} | ${r.miss} | ${r.indeterminate} | ${r.stepsMed} | ${r.stepsMax} | ${r.usMin.toFixed(2)} | ${r.usMed.toFixed(2)} | ${r.usMax.toFixed(2)} |`);
}
