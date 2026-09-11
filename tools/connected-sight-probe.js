// A CPU DIAGNOSTIC IMAGE OF CONNECTED SIGHT. NOT A SCREENSHOT OF THE GAME.
//
// Every pixel is one `traceRegionSight` query on this CPU, in Node, with no
// renderer, no shader and no GPU involved at any point. The picture exists so
// a person can SEE what the query answered across a whole view at once: which
// region owns the hit, which solid was hit, where the answer was a miss and,
// above all, where it was UNRESOLVED. Nothing here may be quoted as a frame
// time, a rendering result, or evidence that connected rendering works.
//
//   node tools/connected-sight-probe.js [options]
//     --scene <path>   scene document (default levels/fixtures/connected-sight.nil.json)
//     --pose <name>    entry-spawn | doorway | far-spawn   (default entry-spawn)
//     --width/--height sample grid (default 96x72)
//     --fov <degrees>  VERTICAL field of view (default 70)
//     --range <units>  maxDistance handed to each query (default 32)
//     --work <n>       maxWork handed to each query (default 2048)
//     --scale <n>      nearest-neighbour magnification of the SAVED png only
//     --out <path>     png path (default connected-sight.png)
//     --packet <path>  json path (default connected-sight.json)
//
// The packet records the scene, the exact pose, the range and the colour
// legend, so another host repeats the same sample and compares ANSWERS rather
// than comparing pictures.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { hostname, platform } from 'node:os';
import { pathToFileURL } from 'node:url';
import { compileRegionWorld } from '../engine/world/region-world.js';
import { traceRegionSight } from '../engine/world/region-sight.js';
import { createCameraFrame, turn } from '../engine/world/camera-frame.js';

export const PROBE_DEFAULTS = Object.freeze({
  scene: 'levels/fixtures/connected-sight.nil.json',
  pose: 'entry-spawn', width: 96, height: 72, fov: 70, range: 32, work: 2048, scale: 1,
});

// NAMED POSES, so a report says WHERE it stood in one word and a rerun puts
// the camera back. A pose is a region, a chart position and a look expressed
// as yaw/pitch against that region's construction frame -- never a raw tangent
// basis typed out by hand, which would not survive a change of curvature.
export const POSES = Object.freeze({
  'entry-spawn': { regionId: 'entry', position: [0, -3, 0], yaw: 0, pitch: 0 },
  doorway: { regionId: 'curve', position: [0, -1, 0], yaw: 0, pitch: 0 },
  'far-spawn': { regionId: 'far', position: [0, -1.5, 0], yaw: 0, pitch: 0 },
});

// ----------------------------------------------------------------- colours
//
// THREE FAMILIES THAT CANNOT BE MISTAKEN FOR EACH OTHER.
//
//   hit        - one FLAT colour per (region, owner). Flat on purpose: depth
//                shading makes a prettier picture and a worse diagnostic,
//                because then two shades of one hue mean two distances and
//                also mean two owners, and a reader cannot tell which.
//   miss       - ONE neutral colour, and the only colour that may read as sky.
//   unresolved - saturated, one per reason, and never the miss colour. An
//                unresolved query is the thing this image exists to show; painted
//                as background it would never be looked at again.
export const MISS_COLOR = Object.freeze([22, 25, 30]);
export const HIT_COLORS = Object.freeze({
  'entry/entry-floor': [58, 78, 120], 'entry/entry-crate': [96, 132, 200],
  'curve/curve-floor': [42, 104, 72], 'curve/curve-wall': [86, 168, 110],
  'curve/curve-door': [150, 214, 150], 'curve/curve-post': [36, 150, 140],
  'far/far-floor': [126, 92, 40], 'far/far-pillar': [196, 150, 66],
  'far/far-target': [246, 206, 96],
});
export const HIT_FALLBACK = Object.freeze([255, 255, 255]);
export const UNRESOLVED_COLORS = Object.freeze({
  'domain-exit': [176, 32, 208], 'work-budget': [255, 96, 0],
  'aperture-side': [255, 40, 120], 'aperture-tie': [236, 64, 64],
  'solid-aperture-tie': [208, 0, 40], 'domain-aperture-tie': [176, 0, 88],
  'crossing-budget': [255, 150, 40], 'event-range': [255, 60, 200],
  'range-boundary': [255, 210, 40], 'invalid-destination': [150, 0, 0],
  'coincident-events': [255, 0, 255], 'ambiguous-origin': [255, 120, 255],
  'ambiguous-occupancy': [200, 60, 255], 'primitive-events': [255, 80, 80],
  'surface-candidate': [255, 170, 170], 'numerical-stall': [180, 60, 0],
  'invalid-field': [120, 0, 60], 'work-budget-primitive': [255, 130, 0],
});
export const UNRESOLVED_FALLBACK = Object.freeze([255, 0, 128]);

/** The colour and the legend key for one finished query. */
export function colorFor(result) {
  if (result.status === 'hit') {
    const owner = result.query?.owner ?? result.query?.surfaceOwner ?? 'unknown';
    return { rgb: HIT_COLORS[`${result.regionId}/${owner}`] ?? HIT_FALLBACK,
      key: `hit ${result.regionId}/${owner}` };
  }
  if (result.status === 'miss') return { rgb: MISS_COLOR, key: 'miss within range' };
  return { rgb: UNRESOLVED_COLORS[result.reason] ?? UNRESOLVED_FALLBACK,
    key: `unresolved ${result.reason}` };
}

// -------------------------------------------------------------------- png
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** Truecolour 8-bit PNG, filter 0 on every scanline, RGB row-major input. */
export function encodePng(pixels, width, height) {
  if (pixels.length !== width * height * 3) throw new Error('pixel buffer does not match the given size');
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(pixels.buffer ?? pixels, pixels.byteOffset ?? 0, pixels.length)
      .copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))]);
}
function magnify(pixels, width, height, scale) {
  if (scale === 1) return pixels;
  const out = Buffer.alloc(width * scale * height * scale * 3);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < width * scale; x++) {
      const source = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 3;
      pixels.copy(out, (y * width * scale + x) * 3, source, source + 3);
    }
  }
  return out;
}

// ------------------------------------------------------------------ sample
/**
 * The camera for a named pose, built from the region's own construction frame.
 *
 * `space.frame` is a construction basis, which is exactly what a POSE wants: a
 * repeatable starting orientation. It is not a claim about a walker's carried
 * frame, which is path-dependent and belongs to the walker.
 */
export function poseCamera(world, pose) {
  const region = world.regions.get(pose.regionId);
  if (!region) throw new Error(`Unknown region ${pose.regionId}`);
  const position = region.space.decode(pose.position);
  const basis = region.space.frame(position);
  return turn(createCameraFrame(region.space, position, { forward: basis[1], up: basis[2] }),
    { yaw: pose.yaw ?? 0, pitch: pose.pitch ?? 0 });
}

/**
 * One ray per pixel, in the SAME convention the shader and the marker overlay
 * use: both axes are normalised by HEIGHT, so the quoted field of view is the
 * vertical one and the horizontal follows from the aspect ratio. Row 0 is the
 * top of the image, which is +up.
 */
export function pixelDirection(space, camera, { width, height, fov }, px, py) {
  const focal = 1 / Math.tan((fov * Math.PI / 180) / 2);
  const u = (2 * (px + 0.5) - width) / height;
  const v = (height - 2 * (py + 0.5)) / height;
  const raw = camera.forward.map((f, i) => f * focal + camera.right[i] * u + camera.up[i] * v);
  return space.normalize(camera.position, raw);
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))];
}

/**
 * Sample the whole grid. Returns pixels, one record per ray, and the counts
 * and timing summary. Exported so the acceptance test samples exactly what the
 * tool saves, instead of a second copy of this loop that could drift from it.
 */
export function sampleSight(world, pose, options = {}) {
  const settings = { ...PROBE_DEFAULTS, ...options };
  const { width, height } = settings;
  const camera = poseCamera(world, pose);
  const space = world.regions.get(pose.regionId).space;
  const pixels = Buffer.alloc(width * height * 3);
  const rays = new Array(width * height);
  const statuses = new Map(), reasons = new Map(), owners = new Map(), legend = new Map();
  const works = [], times = [];
  let queryNanoseconds = 0n;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const direction = pixelDirection(space, camera, settings, px, py);
      const started = process.hrtime.bigint();
      const result = traceRegionSight(world,
        { regionId: pose.regionId, position: camera.position, direction },
        { maxDistance: settings.range, maxWork: settings.work });
      const elapsed = process.hrtime.bigint() - started;
      queryNanoseconds += elapsed;
      times.push(Number(elapsed) / 1000);
      const { rgb, key } = colorFor(result);
      const at = (py * width + px) * 3;
      pixels[at] = rgb[0]; pixels[at + 1] = rgb[1]; pixels[at + 2] = rgb[2];
      legend.set(key, rgb);
      statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
      if (result.status === 'unresolved') reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
      if (result.status === 'hit') {
        const owner = `${result.regionId}/${result.query?.owner ?? result.query?.surfaceOwner ?? 'unknown'}`;
        owners.set(owner, (owners.get(owner) ?? 0) + 1);
      }
      works.push(result.work);
      rays[py * width + px] = { px, py, key, direction, result };
    }
  }
  const sortedWork = [...works].sort((a, b) => a - b);
  const sortedTime = [...times].sort((a, b) => a - b);
  return {
    camera, pixels, rays, legend,
    counts: {
      status: Object.fromEntries([...statuses].sort()),
      unresolvedReason: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1])),
      hitOwner: Object.fromEntries([...owners].sort((a, b) => b[1] - a[1])),
    },
    work: {
      total: works.reduce((sum, x) => sum + x, 0),
      min: sortedWork[0], max: sortedWork[sortedWork.length - 1],
      median: percentile(sortedWork, 0.5), p90: percentile(sortedWork, 0.9),
      budget: settings.work, atBudget: works.filter((x) => x >= settings.work).length,
    },
    // CPU QUERY TIME. One Node thread, one query per ray, no renderer in the
    // loop. There is no GPU in this measurement and no frame was presented.
    cpuQueryTiming: {
      totalMilliseconds: Number(queryNanoseconds) / 1e6, rays: times.length,
      meanMicroseconds: times.reduce((sum, x) => sum + x, 0) / times.length,
      medianMicroseconds: percentile(sortedTime, 0.5),
      p99Microseconds: percentile(sortedTime, 0.99),
    },
  };
}

/** A repeatable record of one ray: what a second host needs to compare. */
export function rayRecord(label, ray) {
  const result = ray.result;
  return {
    label, pixel: [ray.px, ray.py], direction: [...ray.direction], class: ray.key,
    status: result.status, reason: result.reason, regionId: result.regionId,
    distance: result.distance, work: result.work,
    owner: result.query?.owner ?? null, surfaceOwner: result.query?.surfaceOwner ?? null,
    additiveOwners: result.query?.additiveOwners ?? null, contact: result.query?.contact ?? null,
    crossings: result.crossings.map((crossing) => ({ id: crossing.id,
      fromRegionId: crossing.fromRegionId, toRegionId: crossing.toRegionId, distance: crossing.distance })),
    segments: result.segments.map((segment) => ({ regionId: segment.regionId, distance: segment.distance })),
  };
}

/** The named rays a report quotes, then one exemplar of every other class. */
function selectRays(sample, width, named) {
  const chosen = [], seen = new Set();
  for (const [label, [px, py]] of Object.entries(named)) {
    const ray = sample.rays[py * width + px];
    if (ray) { chosen.push(rayRecord(label, ray)); seen.add(ray.key); }
  }
  for (const ray of sample.rays) {
    if (seen.has(ray.key)) continue;
    seen.add(ray.key);
    chosen.push(rayRecord(`first ${ray.key}`, ray));
  }
  return chosen;
}

function revision() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown'; }
}

export function parseArguments(argv) {
  const settings = { ...PROBE_DEFAULTS, out: 'connected-sight.png', packet: 'connected-sight.json' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = String(argv[i]).replace(/^--/, ''), value = argv[i + 1];
    if (!(key in settings)) throw new Error(`Unknown option ${argv[i]}`);
    if (value === undefined) throw new Error(`Option --${key} needs a value`);
    settings[key] = typeof settings[key] === 'number' ? Number(value) : value;
    if (typeof settings[key] === 'number' && !Number.isFinite(settings[key])) {
      throw new Error(`Option --${key} needs a number`);
    }
  }
  return settings;
}

export function runProbe(options = {}) {
  const settings = { ...PROBE_DEFAULTS, out: 'connected-sight.png', packet: 'connected-sight.json', ...options };
  const scene = JSON.parse(readFileSync(settings.scene, 'utf8'));
  const world = compileRegionWorld(scene);
  const pose = POSES[settings.pose];
  if (!pose) throw new Error(`Unknown pose ${settings.pose}; try ${Object.keys(POSES).join(', ')}`);
  const sample = sampleSight(world, pose, settings);
  const packet = {
    what: 'CPU traceRegionSight sample. Not a rendered frame, not a GPU measurement.',
    scene: { path: settings.scene, id: scene.id, version: scene.version },
    host: { name: hostname(), platform: platform(), node: process.version, revision: revision() },
    pose: {
      name: settings.pose, regionId: pose.regionId, position: [...pose.position],
      yaw: pose.yaw ?? 0, pitch: pose.pitch ?? 0,
      camera: { position: [...sample.camera.position], forward: [...sample.camera.forward],
        up: [...sample.camera.up], right: [...sample.camera.right] },
    },
    sampling: {
      width: settings.width, height: settings.height,
      verticalFieldOfViewDegrees: settings.fov, maxDistance: settings.range, maxWork: settings.work,
      convention: 'u=(2*(px+0.5)-W)/H; v=(H-2*(py+0.5))/H; dir=normalize(forward/tan(fov/2)+right*u+up*v)',
    },
    counts: sample.counts, work: sample.work, cpuQueryTiming: sample.cpuQueryTiming,
    legend: Object.fromEntries([...sample.legend].sort()),
    rays: selectRays(sample, settings.width, {
      centre: [Math.floor(settings.width / 2), Math.floor(settings.height / 2)],
      'top-left': [0, 0], 'bottom-right': [settings.width - 1, settings.height - 1],
    }),
  };
  writeFileSync(settings.out, encodePng(
    magnify(sample.pixels, settings.width, settings.height, settings.scale),
    settings.width * settings.scale, settings.height * settings.scale));
  writeFileSync(settings.packet, `${JSON.stringify(packet, null, 2)}\n`);
  return { sample, packet, world, settings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const settings = parseArguments(process.argv.slice(2));
  const { packet } = runProbe(settings);
  const line = (label, value) => console.log(`${label.padEnd(24)} ${value}`);
  line('scene', `${packet.scene.id} (${packet.scene.path})`);
  line('pose', `${packet.pose.name} in ${packet.pose.regionId} at [${packet.pose.position}]`);
  line('sampling', `${settings.width}x${settings.height}, ${settings.fov} deg vertical, `
    + `range ${settings.range}, maxWork ${settings.work}`);
  line('host', `${packet.host.name} (${packet.host.platform}) node ${packet.host.node} @ ${packet.host.revision}`);
  console.log('\nstatus');
  for (const [key, value] of Object.entries(packet.counts.status)) line(`  ${key}`, value);
  console.log('unresolved reasons');
  const reasons = Object.entries(packet.counts.unresolvedReason);
  if (!reasons.length) console.log('  (none)');
  for (const [key, value] of reasons) line(`  ${key}`, value);
  console.log('hit owners');
  for (const [key, value] of Object.entries(packet.counts.hitOwner)) line(`  ${key}`, value);
  console.log('\nwork per ray');
  line('  min/median/p90/max', `${packet.work.min}/${packet.work.median}/${packet.work.p90}/${packet.work.max}`);
  line('  total / at budget', `${packet.work.total} / ${packet.work.atBudget} rays`);
  console.log('\nCPU query time (one Node thread; NOT a GPU frame time)');
  line('  total', `${packet.cpuQueryTiming.totalMilliseconds.toFixed(2)} ms for ${packet.cpuQueryTiming.rays} rays`);
  line('  mean/median/p99', `${packet.cpuQueryTiming.meanMicroseconds.toFixed(1)}/`
    + `${packet.cpuQueryTiming.medianMicroseconds.toFixed(1)}/`
    + `${packet.cpuQueryTiming.p99Microseconds.toFixed(1)} us`);
  console.log(`\nwrote ${settings.out} and ${settings.packet}`);
}
