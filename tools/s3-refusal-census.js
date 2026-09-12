// MUSE-73 bounded CPU refusal census for the current E3/full-S3 editor.
//
// CPU ONLY: every ray is one model.pixelSight query in Node. No renderer, no
// shader, no GPU, no browser. Unresolved answers are contract refusals, NOT
// errors: this census counts and classifies them, it does not diagnose GPU
// purple pixels. No geometry math is reimplemented here; all directions come
// from the model's own pixelSight and all motion from model.act/advance.
//
//   node tools/s3-refusal-census.js [--out <path>]
//
// Samples a deterministic 65x49 grid (range 64) at four poses:
//   flat-spawn     model.act('spawn-flat')
//   sphere-spawn   model.act('spawn-sphere')
//   antipode       sphere spawn + ACTUAL movement (model.advance) ~pi*R forward
//   approach-exit  model.act('approach-exit')
// Asserts each view is non-vacuous and totals add up. The COUNTS lines are the
// stability contract: run twice, diff them, timings excluded (none recorded).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnectedGlobalPreview, GLOBAL_FLIGHT_SPEED } from '../app/connected-global-model.js';

const WIDTH = 65, HEIGHT = 49, RANGE = 64;
const SCENE = 'levels/fixtures/connected-global.nil.json';
const RAYS_PER_VIEW = WIDTH * HEIGHT;

// Coverage means only a known chart boundary. Unsupported operations, invalid
// states and ambiguous event ordering must never be explained away as coverage.
function coverageOnly(result) {
  return result.reason === 'domain-exit' || (result.reason === 'aperture-query'
    && Array.isArray(result.apertures) && result.apertures.length > 0
    && result.apertures.every(a => a.reason === 'domain-exit'));
}

export function classify(startRegionId, result) {
  if (!['hit', 'miss', 'unresolved'].includes(result.status)) throw Error('Unknown query status');
  const base = {
    status: result.status,
    endRegionId: result.regionId,
    distance: result.status === 'hit' ? result.distance : null,
    crossings: (result.crossings || []).map((c) => ({
      fromId: c.fromId, fromRegionId: c.fromRegionId,
      toRegionId: c.toRegionId, distance: c.distance,
    })),
  };
  if (result.status === 'hit') {
    const q = result.query || {};
    return {
      ...base, class: 'resolved',
      owner: q.owner ?? q.id ?? q.additiveOwner ?? null,
      method: q.method ?? null,
    };
  }
  if (result.status === 'miss') return { ...base, class: 'resolved', reason: result.reason };
  const detail = { ...base, class: coverageOnly(result) ? 'domain-only' : 'non-domain-refusal', reason: result.reason };
  if (result.query) {
    detail.nestedQuery = {
      status: result.query.status ?? null,
      reason: result.query.reason ?? null,
      owner: result.query.owner ?? result.query.id ?? null,
    };
  }
  if (Array.isArray(result.apertures)) {
    detail.apertures = result.apertures.map((a) => ({
      fromId: a.fromId, portalId: a.portalId ?? null,
      reason: a.reason ?? null, uncertaintyFrom: a.uncertaintyFrom ?? null,
    }));
  }
  if (result.candidate) detail.candidateDistance = result.candidate.distance ?? null;
  if (result.certifiedLocalDistance !== undefined) detail.certifiedLocalDistance = result.certifiedLocalDistance;
  return detail;
}

function snapshotPose(name, action, state, extra = {}) {
  for (const v of [state.position, state.camera.forward, state.camera.up, state.camera.right]) {
    if (!Array.isArray(v) || v.length !== state.position.length
      || !v.every(Number.isFinite)) throw Error(`Non-finite camera frame in ${name}`);
  }
  return {
    name, action,
    regionId: state.regionId,
    position: state.position.map(Number),
    forward: state.camera.forward.map(Number),
    up: state.camera.up.map(Number),
    right: state.camera.right.map(Number),
    range: RANGE, grid: `${WIDTH}x${HEIGHT}`,
    ...extra,
  };
}

function main() {
  const outPath = process.argv.includes('--out')
    ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const scene = JSON.parse(readFileSync(SCENE, 'utf8'));
  const model = createConnectedGlobalPreview(scene);

  // Antipode is reached by ACTUAL movement (model.advance), never a teleport:
  // fly straight from sphere spawn ~pi*R. R comes from the compiled world,
  // never a local constant.
  const positioners = [
    { name: 'flat-spawn', action: "act('spawn-flat')", run: () => model.act('spawn-flat') },
    { name: 'sphere-spawn', action: "act('spawn-sphere')", run: () => model.act('spawn-sphere') },
    {
      name: 'antipode', action: 'sphere spawn + advance(0.04,[0,1,0]) x N',
      run: () => {
        model.act('spawn-sphere');
        const startRegion = model.state.regionId;
        const R = model.world.regions.get(model.state.regionId).space.curvatureRadius;
        const target = Math.PI * R, stepLen = GLOBAL_FLIGHT_SPEED * 0.04;
        let steps = 0;
        while (!model.halted && steps * stepLen < target && steps < 400) {
          model.advance(0.04, [0, 1, 0]);
          steps++;
        }
        if (model.halted || model.state.regionId !== startRegion || steps * stepLen < target)
          throw Error('Antipode approach did not complete in its starting region');
        return {
          advanceSteps: steps, nominalTravel: steps * stepLen, antipodeTarget: target,
          halted: model.halted, motion: model.motion,
        };
      },
    },
    { name: 'approach-exit', action: "act('approach-exit')", run: () => model.act('approach-exit') },
  ];

  const views = [];
  for (const positioner of positioners) {
    const extra = positioner.run() || {};
    const pose = snapshotPose(positioner.name, positioner.action, model.state, extra);
    const counts = { hit: 0, miss: 0, unresolved: 0 };
    const causes = new Map();
    const samples = { hit: null, miss: null, unresolved: [] };
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const r = model.pixelSight(WIDTH, HEIGHT, x, y, RANGE);
        const c = classify(pose.regionId, r);
        counts[c.status]++;
        const key = c.status === 'unresolved' ? `unresolved:${c.reason}` : c.status;
        causes.set(key, (causes.get(key) || 0) + 1);
        if (c.status === 'hit' && !samples.hit) samples.hit = { x, y, ...c };
        if (c.status === 'miss' && !samples.miss) samples.miss = { x, y, ...c };
        if (c.status === 'unresolved' && samples.unresolved.length < 5) samples.unresolved.push({ x, y, ...c });
      }
    }
    const total = counts.hit + counts.miss + counts.unresolved;
    if (total !== RAYS_PER_VIEW) throw Error(`${positioner.name}: total ${total} != ${RAYS_PER_VIEW}`);
    if (counts.hit + counts.miss === 0) throw Error(`${positioner.name}: vacuous view, no resolved ray`);
    views.push({ name: positioner.name, pose, counts, causes: Object.fromEntries([...causes.entries()].sort()), samples });
  }

  const totals = { hit: 0, miss: 0, unresolved: 0 };
  for (const v of views) {
    totals.hit += v.counts.hit; totals.miss += v.counts.miss; totals.unresolved += v.counts.unresolved;
  }
  const grand = totals.hit + totals.miss + totals.unresolved;
  if (grand !== RAYS_PER_VIEW * views.length) throw Error(`Grand total ${grand} mismatch`);
  if (totals.hit === 0 || totals.miss === 0) throw Error('Census vacuous: missing hit or miss family');

  const lines = [];
  lines.push(`SCENE ${SCENE}  GRID ${WIDTH}x${HEIGHT}=${RAYS_PER_VIEW}/view  RANGE ${RANGE}`);
  for (const v of views) {
    lines.push(`POSE ${v.name} region=${v.pose.regionId} pos=[${v.pose.position.map((n) => n.toFixed(4)).join(',')}]`);
    lines.push(`COUNTS ${v.name} ${JSON.stringify(v.counts)}`);
  }
  lines.push(`COUNTS TOTAL ${JSON.stringify(totals)}`);
  const allCauses = new Map();
  for (const v of views) {
    for (const [k, n] of Object.entries(v.causes)) allCauses.set(k, (allCauses.get(k) || 0) + n);
  }
  lines.push(`CAUSES ${JSON.stringify(Object.fromEntries([...allCauses.entries()].sort((a, b) => b[1] - a[1])))}`);
  for (const v of views) {
    for (const s of v.samples.unresolved.slice(0, 2)) {
      lines.push(`RAY ${v.name} x=${s.x} y=${s.y} status=${s.status} class=${s.class} reason=${s.reason}`
        + ` endRegion=${s.endRegionId} crossings=${s.crossings.length}`
        + (s.nestedQuery ? ` nested=${s.nestedQuery.status}/${s.nestedQuery.reason}` : '')
        + (s.apertures ? ` apertures=${JSON.stringify(s.apertures)}` : ''));
    }
  }
  const output = `${lines.join('\n')}\n`;
  process.stdout.write(output);
  if (outPath) {
    writeFileSync(outPath, JSON.stringify({
      scene: SCENE, width: WIDTH, height: HEIGHT, range: RANGE,
      views: views.map((v) => ({ ...v, samples: v.samples })),
      totals,
    }, null, 1));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
