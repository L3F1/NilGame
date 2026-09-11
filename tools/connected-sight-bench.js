// CPU CONNECTED-SIGHT BENCHMARK. NOT A FRAME TIME, NOT A GPU MEASUREMENT.
//
// Repeats the existing `sampleSight` grid from tools/connected-sight-probe.js
// for every named pose in POSES, on one Node thread, with no renderer, no
// shader and no GPU involved. Reports wall-sample milliseconds and query-only
// milliseconds separately, plus work/counts determinism across repeats.
//
//   node tools/connected-sight-bench.js [--out <path>] [--scene <p>]
//     [--width <n>] [--height <n>] [--fov <deg>] [--range <n>] [--work <n>]
//     [--warmups <n>] [--repeats <n>]
//
// Defaults: grid 96x72, range/work/fov/scene from PROBE_DEFAULTS, 2 warmups,
// 9 measured repeats. The first observed sample is preserved as
// first-for-pose and excluded from measured statistics. Only the first pose
// starts before any sampling in this process; later poses share warmed code.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, arch, hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { compileRegionWorld } from '../engine/world/region-world.js';
import { POSES, PROBE_DEFAULTS, sampleSight } from './connected-sight-probe.js';

export const BENCH_DEFAULTS = Object.freeze({
  scene: PROBE_DEFAULTS.scene,
  width: 96, height: 72, fov: PROBE_DEFAULTS.fov,
  range: PROBE_DEFAULTS.range, work: PROBE_DEFAULTS.work,
  warmups: 2, repeats: 9,
});

// Hard caps keep a bounded assignment from becoming an unbounded soak.
export const BENCH_CAPS = Object.freeze({
  repeats: 25, warmups: 5, pixels: 65536, work: 65536, range: 1024,
});

function fail(message) {
  throw new Error(message);
}

function positiveInt(name, value, cap) {
  if (!Number.isInteger(value) || value < 1) fail(`Option --${name} needs a positive integer (got ${value})`);
  if (cap !== undefined && value > cap) fail(`Option --${name} capped at ${cap} (got ${value})`);
  return value;
}

export function parseBenchArguments(argv) {
  const settings = {
    scene: BENCH_DEFAULTS.scene, out: null,
    width: BENCH_DEFAULTS.width, height: BENCH_DEFAULTS.height,
    fov: BENCH_DEFAULTS.fov, range: BENCH_DEFAULTS.range, work: BENCH_DEFAULTS.work,
    warmups: BENCH_DEFAULTS.warmups, repeats: BENCH_DEFAULTS.repeats,
  };
  const numbers = new Set(['width', 'height', 'fov', 'range', 'work', 'warmups', 'repeats']);
  for (let i = 0; i < argv.length; i += 2) {
    const key = String(argv[i]).replace(/^--/, '');
    const value = argv[i + 1];
    if (!String(argv[i]).startsWith('--') || !Object.hasOwn(settings, key)) fail(`Unknown option ${argv[i]}`);
    if (value === undefined) fail(`Option --${key} needs a value`);
    settings[key] = numbers.has(key) ? Number(value) : value;
    if (numbers.has(key) && !Number.isFinite(settings[key])) fail(`Option --${key} needs a number`);
  }
  settings.width = positiveInt('width', settings.width);
  settings.height = positiveInt('height', settings.height);
  if (settings.width * settings.height > BENCH_CAPS.pixels) {
    fail(`Grid capped at ${BENCH_CAPS.pixels} pixels (got ${settings.width * settings.height})`);
  }
  if (!(settings.fov > 0 && settings.fov < 180)) fail(`Option --fov needs 0 < fov < 180 (got ${settings.fov})`);
  settings.range = positiveInt('range', settings.range, BENCH_CAPS.range);
  settings.work = positiveInt('work', settings.work, BENCH_CAPS.work);
  settings.warmups = positiveInt('warmups', settings.warmups, BENCH_CAPS.warmups);
  settings.repeats = positiveInt('repeats', settings.repeats, BENCH_CAPS.repeats);
  return settings;
}

function revision() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

function cpuModel() {
  try {
    const models = cpus().map((c) => c.model.trim()).filter(Boolean);
    const counts = new Map();
    for (const m of models) counts.set(m, (counts.get(m) ?? 0) + 1);
    return [...counts].map(([m, n]) => `${m} x${n}`).join('; ') || 'unknown';
  } catch { return 'unknown'; }
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))];
}

function summarize(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return {
    n: sorted.length, min: sorted[0], median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9), max: sorted[sorted.length - 1],
  };
}

function canon(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function snapshotSample(sample) {
  return {
    wallMs: sample.wallMs,
    queryMs: sample.sample.cpuQueryTiming.totalMilliseconds,
    counts: sample.sample.counts,
    work: sample.sample.work,
  };
}

export function runBench(options = {}) {
  const settings = { ...BENCH_DEFAULTS, out: null, ...options };
  const scene = JSON.parse(readFileSync(settings.scene, 'utf8'));
  const compileStarted = process.hrtime.bigint();
  const world = compileRegionWorld(scene);
  const compileWallMs = Number(process.hrtime.bigint() - compileStarted) / 1e6;
  const grid = { width: settings.width, height: settings.height, fov: settings.fov };
  const sampleOptions = { ...grid, range: settings.range, work: settings.work };
  const clock = () => process.hrtime.bigint();
  const poses = {};
  let deterministic = true;
  const mismatches = [];
  for (const name of Object.keys(POSES)) {
    const pose = POSES[name];
    const measure = () => {
      const started = clock();
      const sample = sampleSight(world, pose, sampleOptions);
      const wallMs = Number(clock() - started) / 1e6;
      return { sample, wallMs };
    };
    const cold = snapshotSample(measure());
    for (let w = 0; w < settings.warmups; w++) measure(); // discarded warmups
    const measured = [];
    for (let r = 0; r < settings.repeats; r++) measured.push(snapshotSample(measure()));
    // Determinism: every measured repeat must match the first exactly.
    const first = measured[0];
    const firstKey = canon({ counts: first.counts, work: first.work });
    for (let r = 1; r < measured.length; r++) {
      if (canon({ counts: measured[r].counts, work: measured[r].work }) !== firstKey) {
        deterministic = false;
        mismatches.push(`${name} repeat ${r} differs from repeat 0`);
      }
    }
    poses[name] = {
      pose: { regionId: pose.regionId, position: [...pose.position], yaw: pose.yaw ?? 0, pitch: pose.pitch ?? 0 },
      rays: settings.width * settings.height,
      firstForPose: {
        firstSampleInProcess: name === Object.keys(POSES)[0],
        note: 'First sample for this pose; later poses share warmed code. Not shader/OS cold start.',
        wallMs: cold.wallMs, queryMs: cold.queryMs,
      },
      wallMs: summarize(measured.map((m) => m.wallMs)),
      queryMs: summarize(measured.map((m) => m.queryMs)),
      work: {
        total: first.work.total, min: first.work.min, median: first.work.median,
        p90: first.work.p90, max: first.work.max,
        budget: first.work.budget, atBudget: first.work.atBudget,
      },
      counts: first.counts,
    };
  }

  const result = {
    what: 'CPU traceRegionSight cost. One Node thread, no renderer/GPU. Milliseconds are NOT frame times.',
    host: { name: hostname(), os: `${platform()} ${release()} ${arch()}`, cpu: cpuModel(), node: process.version },
    revision: revision(),
    compileWallMs,
    scene: { path: settings.scene, id: scene.id, version: scene.version },
    defaults: {
      grid: `${settings.width}x${settings.height}`, fov: settings.fov,
      range: settings.range, work: settings.work,
      warmups: settings.warmups, repeats: settings.repeats,
    },
    deterministic, mismatches,
    poses,
  };
  if (settings.out) writeFileSync(settings.out, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let settings;
  try {
    settings = parseBenchArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(2);
  }
  const result = runBench(settings);
  const line = (label, value) => console.log(`${label.padEnd(28)} ${value}`);
  const fmt = (s) => `${s.min.toFixed(2)}/${s.median.toFixed(2)}/${s.p90.toFixed(2)}/${s.max.toFixed(2)}`;
  line('host', `${result.host.name} (${result.host.os}) node ${result.host.node}`);
  line('cpu', result.host.cpu);
  line('scene', `${result.scene.id} (${result.scene.path}) @ ${result.revision}`);
  line('grid/range/work', `${result.defaults.grid}, fov ${result.defaults.fov}, range ${result.defaults.range}, work ${result.defaults.work}`);
  for (const [name, pose] of Object.entries(result.poses)) {
    console.log(`\npose ${name} (${pose.rays} rays, first-for-pose wall ${pose.firstForPose.wallMs.toFixed(2)} ms / query ${pose.firstForPose.queryMs.toFixed(2)} ms)`);
    line('  wall ms min/med/p90/max', fmt(pose.wallMs));
    line('  query ms min/med/p90/max', fmt(pose.queryMs));
    line('  work min/med/p90/max', `${pose.work.min}/${pose.work.median}/${pose.work.p90}/${pose.work.max}`);
    line('  total work / at budget', `${pose.work.total} / ${pose.work.atBudget}`);
    line('  status', JSON.stringify(pose.counts.status));
    line('  unresolved', JSON.stringify(pose.counts.unresolvedReason));
  }
  console.log(`\ndeterministic across repeats: ${result.deterministic ? 'yes' : `NO -- ${result.mismatches.join('; ')}`}`);
  if (settings.out) console.log(`wrote ${settings.out}`);
  if (!result.deterministic) process.exit(1);
}
