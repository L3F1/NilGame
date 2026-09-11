// Acceptance for the connected-sight fixture and its CPU diagnostic probe.
//
// The fixture is an E3 -> S3 -> E3 route: a flat entry room, a spherical middle
// region whose wall is a geodesic cell with a passage CUT from it, and a flat
// far room holding the objective. The claims under test are the ones a level
// has to make good on:
//
//   it loads, it survives a save and a reload, a walker actually WALKS the
//   route with body clearance the whole way, the passage is open to sight
//   while the wall beside it is not, and the diagnostic image says which of
//   those three answers -- hit, miss, unresolved -- each ray got.
//
// Everything here is CPU. No renderer, no shader, no GPU, no browser. The PNG
// this suite inspects is a picture of query answers, not a rendered frame.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { validateScene, parseScene } from './engine/world/document.js';
import { compileRegionWorld } from './engine/world/region-world.js';
import { traceRegionSight } from './engine/world/region-sight.js';
import { moveRegionProbe } from './engine/world/region-motion.js';
import { runProbe, sampleSight, poseCamera, pixelDirection, POSES, MISS_COLOR, HIT_COLORS, UNRESOLVED_COLORS }
  from './tools/connected-sight-probe.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
const near = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

const SCENE_PATH = fileURLToPath(new URL('./levels/fixtures/connected-sight.nil.json', import.meta.url));
const source = () => JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
const world = () => compileRegionWorld(source());
const PLAYER_RADIUS = source().units.playerRadius;

// The route, named once: straight down +y out of the entry spawn, through the
// entry portal, through the cut passage, through the far portal, to the target.
const ROUTE = { regionId: 'entry', position: [0, -3, 0], direction: [0, 1, 0] };
const sight = (w, ray = ROUTE, options = {}) => traceRegionSight(w, ray, options);

// --------------------------------------------------------------- the level
test('the fixture is a valid scene-v2 document that compiles inside the limits', () => {
  const scene = source();
  assert.equal(scene.version, 2);
  validateScene(scene);
  const w = world();
  assert.deepEqual([...w.regions.keys()], ['entry', 'curve', 'far']);
  assert.equal(w.regions.get('curve').space.kind, 's3');
  assert.equal(w.regions.get('curve').space.curvatureRadius, 8);
  // Four directional apertures: two connections, usable from either side.
  assert.equal(w.portals.length, 4);
  const data = w.renderData();
  assert.ok(data.primitives.length <= 64, `${data.primitives.length} primitives`);
  assert.ok(data.primitives.reduce((sum, p) => sum + p.planes.length, 0) <= 192);
  // Open hemisphere: every S3 aperture and every cell face offset is strictly
  // inside a quarter circle, which is what the portal and cell compilers require.
  const quarter = Math.PI * 8 / 2;
  for (const entity of scene.entities.filter((e) => e.regionId === 'curve')) {
    if (entity.kind === 'anchor') assert.ok(entity.radius < quarter && entity.radius > PLAYER_RADIUS);
    if (entity.kind === 'geodesic-cell') for (const h of entity.halfExtent) assert.ok(h < quarter);
  }
});

test('every region has one clear spawn, with room for the whole body', () => {
  const w = world();
  for (const [id, region] of w.regions) {
    assert.equal(region.entities.filter((e) => e.kind === 'spawn').length, 1, `${id} spawn count`);
    const clearance = region.field.distance(region.spawnPosition);
    assert.ok(clearance >= PLAYER_RADIUS, `${id} spawn clearance ${clearance}`);
    assert.ok(region.space.withinDomain(region.spawnPosition));
  }
  // The numbers, so a later edit that halves one of them is visible here.
  near(w.regions.get('entry').field.distance(w.regions.get('entry').spawnPosition), 0.9, 1e-12);
  near(w.regions.get('curve').field.distance(w.regions.get('curve').spawnPosition), 0.65, 1e-12);
  near(w.regions.get('far').field.distance(w.regions.get('far').spawnPosition), 0.9, 1e-12);
});

test('save, reload and recompile answer exactly what the original answered', () => {
  const w = world();
  const saved = `${JSON.stringify(w.document(), null, 2)}\n`;
  const directory = mkdtempSync(join(tmpdir(), 'connected-sight-'));
  try {
    const path = join(directory, 'reloaded.nil.json');
    writeFileSync(path, saved);
    const reloaded = compileRegionWorld(parseScene(readFileSync(path, 'utf8')));
    assert.deepEqual(reloaded.renderData(), w.renderData());
    assert.deepEqual(reloaded.document(), w.document());
    const before = sight(w), after = sight(reloaded);
    assert.equal(after.status, before.status);
    assert.equal(after.regionId, before.regionId);
    assert.equal(after.query.owner, before.query.owner);
    assert.equal(after.distance, before.distance);
    // A second save of the reloaded document is byte-identical: the round trip
    // has a fixed point, so nothing is being quietly rewritten each time.
    assert.equal(`${JSON.stringify(reloaded.document(), null, 2)}\n`, saved);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- the walk
/** Walk forward at a constant speed, sampling body clearance every frame. */
function walkRoute(w, { speed = 2, dt = 1 / 60, frames = 400 } = {}) {
  let state = w.spawn('entry');
  const transits = [], statuses = new Map();
  let worst = Infinity, worstInCurve = Infinity, stopped = null, elapsed = 0;
  for (let frame = 0; frame < frames; frame++) {
    const region = w.regions.get(state.regionId);
    const velocity = region.space.normalize(state.position, state.camera.forward).map((x) => x * speed);
    const result = moveRegionProbe(w, { ...state, velocity }, dt);
    statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
    assert.equal(result.pendingLift, null, `frame ${frame} owed a correction`);
    const from = state.regionId;
    state = { ...result.state };
    elapsed += dt;
    if (state.regionId !== from) transits.push({ frame, from, to: state.regionId, at: elapsed });
    const clearance = w.regions.get(state.regionId).field.distance(state.position);
    worst = Math.min(worst, clearance);
    if (state.regionId === 'curve') worstInCurve = Math.min(worstInCurve, clearance);
    if (result.status === 'stopped') { stopped = { frame, state, clearance }; break; }
  }
  return { state, transits, statuses, worst, worstInCurve, stopped, elapsed };
}

test('a walker actually walks the route, crossing both portals in order', () => {
  const walk = walkRoute(world());
  assert.deepEqual(walk.transits.map((t) => `${t.from}->${t.to}`), ['entry->curve', 'curve->far']);
  assert.ok(walk.transits[0].at < walk.transits[1].at);
  assert.deepEqual([...walk.statuses.keys()].sort(), ['complete', 'stopped']);
  assert.equal(walk.state.regionId, 'far');
  assert.ok(walk.stopped, 'the walk never reached the objective');
  // It stops against the target's surface: centre 2, radius 0.6, body 0.25.
  near(walk.stopped.state.position[1], 2 - 0.6 - PLAYER_RADIUS, 1e-3);
});

test('the body keeps intrinsic clearance the whole way, including the passage', () => {
  const walk = walkRoute(world());
  // Resting contact is clearance EQUAL to the body radius, which is the floor
  // of this quantity and not a violation of it.
  assert.ok(walk.worst >= PLAYER_RADIUS, `worst clearance ${walk.worst}`);
  // Inside the curved region the walk is never in contact at all.
  assert.ok(walk.worstInCurve > PLAYER_RADIUS * 1.5, `worst clearance in curve ${walk.worstInCurve}`);
  near(walk.worstInCurve, 0.432933, 1e-5);
});

test('the field value along the passage is a conservative bound, not the clearance', () => {
  // At the lip of the doorway the field reports the distance to the WALL FACE
  // the walker is about to pass, because the cutter's own bound is equally
  // binding there. The real clearance is larger: the nearest material is the
  // doorway's edge, off to the side. Sampling a ball of 1.25x the reported
  // bound finds nothing solid, which is only possible if the bound understates.
  const w = world(), region = w.regions.get('curve'), space = region.space;
  const start = space.decode([0, -2, 0]);
  const forward = space.normalize(start, space.logAt(start, space.decode([0, -1, 0])));
  let lip = null, bound = Infinity;
  for (let travel = 1.0; travel <= 1.6; travel += 0.005) {
    const at = space.step(start, forward, travel), value = region.field.distance(at);
    if (value < bound) { bound = value; lip = at; }
  }
  assert.ok(bound > PLAYER_RADIUS, `narrowest bound ${bound}`);
  const basis = space.frame(lip);
  let samples = 0;
  for (let i = 0; i < 240; i++) {
    const theta = Math.acos(1 - 2 * (i + 0.5) / 240), phi = i * 2.399963;
    const local = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
    const direction = space.normalize(lip, basis[0].map((_, k) =>
      basis.reduce((sum, axis, j) => sum + axis[k] * local[j], 0)));
    assert.ok(region.field.distance(space.step(lip, direction, bound * 1.25)) > 0,
      `solid found at 1.25x the reported bound along ${local}`);
    samples++;
  }
  assert.equal(samples, 240);
});

// --------------------------------------------------------------- the sight
test('the passage ray reaches the far room and the off-passage ray hits the wall', () => {
  const w = world();
  const through = sight(w);
  assert.equal(through.status, 'hit');
  assert.equal(through.regionId, 'far');
  assert.equal(through.query.owner, 'far-target');
  assert.equal(through.crossings.length, 2);
  // 3 to the entry aperture, 4 across the curved region, 4.4 to the ball face.
  near(through.distance, 11.4, 1e-9);
  near(through.crossings[0].distance, 3, 1e-9);
  near(through.crossings[1].distance, 7, 1e-9);
  assert.deepEqual(through.segments.map((s) => s.regionId), ['entry', 'curve', 'far']);

  const blocked = sight(w, { ...ROUTE, position: [0.62, -3, 0] });
  assert.equal(blocked.status, 'hit');
  assert.equal(blocked.regionId, 'curve');
  assert.equal(blocked.query.owner, 'curve-wall');
  assert.equal(blocked.crossings.length, 1);
  // It stopped ON the wall, by the region's own field and not by this test's
  // arithmetic.
  assert.ok(Math.abs(w.regions.get('curve').field.distance(blocked.position)) < 1e-7);
});

test('the passage is a cut, not a gap authored between two solids', () => {
  const closed = source();
  closed.entities = closed.entities.filter((e) => e.id !== 'curve-door');
  const blocked = sight(compileRegionWorld(closed));
  assert.equal(blocked.status, 'hit');
  assert.equal(blocked.regionId, 'curve');
  assert.equal(blocked.query.owner, 'curve-wall');
  // Without the carve the same ray stops at the wall's near face, 4.65 out:
  // 3 to the aperture, then 1.65 to the face 0.35 short of the chart origin.
  near(blocked.distance, 4.65, 1e-9);
});

test('the carve is scoped to the wall, so the floor under it is unbroken', () => {
  // The doorway cuts DOWN past the floor line, which is what an author wants
  // and is also the thing a global subtraction would get wrong: untargeted, the
  // same cell would take the floor out under the opening. Standing in the
  // doorway and looking down is the question that separates the two.
  const w = world(), space = w.regions.get('curve').space;
  const inside = space.decode([0, 0, 0]);
  const down = space.normalize(inside, space.frame(inside)[2].map((x) => -x));
  const floor = sight(w, { regionId: 'curve', position: inside, direction: down });
  assert.equal(floor.status, 'hit');
  assert.equal(floor.query.owner, 'curve-floor');
  near(floor.distance, 0.9, 1e-12);
  const carve = source().entities.find((e) => e.id === 'curve-door');
  assert.equal(carve.op, 'subtract');
  assert.equal(carve.target, 'curve-wall');
});

test('the authored coordinate half-width is not the physical clearance', () => {
  const w = world(), region = w.regions.get('curve'), space = region.space;
  const halfWidth = (chartHeight) => {
    const at = space.decode([0, 0, chartHeight]);
    const across = space.normalize(at, space.frame(at)[0]);
    let lo = 0, hi = 1.5;
    for (let i = 0; i < 90; i++) {
      const mid = (lo + hi) / 2;
      if (region.field.distance(space.step(at, across, mid)) < 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  };
  // On the chart axis through the origin, normal coordinates ARE arclength and
  // the authored 0.45 is exact. Half a unit up it is not: the doorway's faces
  // are great spheres, so the same authored number is a narrower passage.
  near(halfWidth(0), 0.45, 1e-9);
  const raised = halfWidth(0.7);
  assert.ok(raised < 0.45 - 1e-4, `half-width at height 0.7 was ${raised}`);
  near(raised, 0.448282, 1e-5);
  // And reading the coordinate as an off-axis budget errs the other way for a
  // ray: one entering 0.455 aside -- wider than the authored half-width -- still
  // clears the doorway, because the geodesic converges on its way there.
  assert.equal(sight(w, { ...ROUTE, position: [0.455, -3, 0] }).regionId, 'far');
  assert.equal(sight(w, { ...ROUTE, position: [0.46, -3, 0] }).query.owner, 'curve-wall');
});

test('the authored anchors admit forward traversal from their own spawns', () => {
  const w = world();
  for (const [fromId, start, direction] of [
    ['entry-gate', w.regions.get('entry').spawnPosition, [0, 1, 0]],
    ['curve-out', w.regions.get('curve').spawnPosition, null],
  ]) {
    const portal = w.portals.find((p) => p.fromId === fromId);
    const space = w.regions.get(portal.fromRegionId).space;
    const heading = direction ?? space.normalize(start, space.logAt(start, space.decode([0, 1, 0])));
    // Positive height means the spawn is on the side the aperture admits, and
    // the crossing test agrees that walking forward reaches it.
    assert.ok(portal.signedHeight(start) > 0, `${fromId} rejects its own spawn side`);
    const event = portal.crossing(start, heading, 32, PLAYER_RADIUS);
    assert.ok(event && event.distance > 0, `${fromId} is not reachable by walking forward`);
  }
});

test('refusals are reported, never traded for a shorter range', () => {
  const w = world();
  // A budget too small for the route refuses, and never spends past its cap.
  // This route screens both six-face cells without excluding either: 12 new
  // work units, in addition to the previous 44. The budget is still exact.
  for (const maxWork of [0, 1, 3, 5, 8, 20, 40, 43, 44, 55]) {
    const result = sight(w, ROUTE, { maxWork });
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, 'work-budget');
    assert.ok(result.work <= maxWork, `spent ${result.work} of ${maxWork}`);
  }
  const enough = sight(w, ROUTE, { maxWork: 56 });
  assert.equal(enough.status, 'hit'); assert.equal(enough.work, 56);
  assert.equal(sight(w, ROUTE, { maxCrossings: 1 }).reason, 'crossing-budget');
  // Shortening the range does not turn the same ray into a different scene: it
  // is an honest miss at 11.39 and the same hit at 11.4.
  const short = sight(w, ROUTE, { maxDistance: 11.39 });
  assert.equal(short.status, 'miss');
  near(short.distance, 11.39, 1e-12);
  near(sight(w, ROUTE, { maxDistance: 11.4 }).distance, 11.4, 1e-9);
});

test('a ray that begins exactly on an inactive cutter face refuses the cast', () => {
  // REPORTED, NOT REPAIRED. curve-door overhangs the wall it cuts so the
  // conservative bound stays wide in the doorway; its far faces sit at chart
  // y = +-1.2, in open air, bounding nothing. A query STARTING on one of them
  // has a primitive root at zero range, which the event layer refuses -- so
  // the whole cast refuses from a point that is plainly in open space.
  const w = world(), space = w.regions.get('curve').space;
  const on = space.decode([0, 1.2, 0]);
  assert.ok(w.regions.get('curve').field.distance(on) > 0.5, 'the point is not in open space');
  // Two direction families, two refusals, one cause. A look ALONG the face is
  // coplanar with it; a look ACROSS it has a root at zero range. The event
  // layer declines both, so the reason depends on the aim and the outcome
  // does not.
  const across = space.normalize(on, space.frame(on)[0]);
  const into = space.normalize(on, space.logAt(on, space.decode([1.3, 0.9, 0])));
  const details = [across, into].map((direction) => {
    const refused = sight(w, { regionId: 'curve', position: on, direction });
    assert.equal(refused.status, 'unresolved');
    assert.equal(refused.reason, 'primitive-events');
    return refused.query.detail;
  });
  assert.deepEqual(details,
    ['curve-door: coincident-or-ill-conditioned', 'curve-door: range-boundary']);
  // A hand's breadth away the same look resolves, which is what makes this a
  // knife edge in the authored coordinates rather than a broken region.
  const clear = space.decode([0, 1.19, 0]);
  const resolved = sight(w, { regionId: 'curve', position: clear,
    direction: space.normalize(clear, space.frame(clear)[0]) });
  assert.equal(resolved.status, 'hit');
  assert.equal(resolved.query.owner, 'curve-post');
});

// ---------------------------------------------------------------- the image
function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = new Map();
  let at = 8, data = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at), type = bytes.toString('latin1', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IDAT') data.push(body); else chunks.set(type, body);
    at += 12 + length;
  }
  const header = chunks.get('IHDR');
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.equal(header[8], 8, 'bit depth'); assert.equal(header[9], 2, 'truecolour');
  const raw = inflateSync(Buffer.concat(data));
  const stride = 1 + width * 3;
  assert.equal(raw.length, height * stride);
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    assert.equal(raw[y * stride], 0, `scanline ${y} is filtered`);
    raw.copy(pixels, y * width * 3, y * stride + 1, (y + 1) * stride);
  }
  return { width, height, pixels, at: (x, y) => [...pixels.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)] };
}

function withProbe(options, body) {
  const directory = mkdtempSync(join(tmpdir(), 'connected-sight-image-'));
  try {
    const out = join(directory, 'probe.png'), packetPath = join(directory, 'probe.json');
    const run = runProbe({ scene: SCENE_PATH, out, packet: packetPath, ...options });
    body({ ...run, image: decodePng(readFileSync(out)),
      saved: JSON.parse(readFileSync(packetPath, 'utf8')) });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('the pixel rays use the shader convention, normalised by height', () => {
  const w = world(), region = w.regions.get('entry'), space = region.space;
  const settings = { width: 96, height: 72, fov: 70 };
  const camera = poseCamera(w, POSES['entry-spawn']);
  const focal = 1 / Math.tan((70 * Math.PI / 180) / 2);
  for (const [px, py] of [[0, 0], [48, 36], [95, 71], [12, 60], [95, 36]]) {
    const direction = pixelDirection(space, camera, settings, px, py);
    const u = (2 * (px + 0.5) - settings.width) / settings.height;
    const v = (settings.height - 2 * (py + 0.5)) / settings.height;
    const ahead = space.dot(camera.position, direction, camera.forward);
    near(space.dot(camera.position, direction, camera.right) / ahead, u / focal, 1e-14);
    near(space.dot(camera.position, direction, camera.up) / ahead, v / focal, 1e-14);
    near(space.norm(camera.position, direction), 1, 1e-14);
  }
  // BOTH axes divide by height, so the quoted 70 degrees is the VERTICAL field
  // and the horizontal one follows from 96:72. Dividing the horizontal axis by
  // width instead would make this equality fail by the aspect ratio.
  const edge = pixelDirection(space, camera, settings, 95, 36);
  const halfAngle = Math.atan(space.dot(camera.position, edge, camera.right)
    / space.dot(camera.position, edge, camera.forward));
  near(halfAngle, Math.atan(Math.tan(35 * Math.PI / 180) * (2 * 95.5 - 96) / 72), 1e-14);
  assert.ok(halfAngle > 35 * Math.PI / 180, 'the horizontal field is not wider than the vertical');
});

test('the saved image is the sample, pixel for pixel', () => {
  withProbe({}, ({ sample, image, packet, saved }) => {
    assert.equal(image.width, 96); assert.equal(image.height, 72);
    assert.ok(image.pixels.equals(sample.pixels), 'the png does not match the sampled grid');
    assert.deepEqual(saved, packet);
    // The centre pixel looks through the entry portal, the cut passage and the
    // far portal, and lands on the objective two crossings away.
    const centre = sample.rays[36 * 96 + 48];
    assert.equal(centre.result.status, 'hit');
    assert.equal(centre.result.regionId, 'far');
    assert.equal(centre.result.query.owner, 'far-target');
    assert.equal(centre.result.crossings.length, 2);
    assert.deepEqual(image.at(48, 36), HIT_COLORS['far/far-target']);
    // Ownership across the whole view, not just one ray: three regions appear.
    assert.deepEqual(Object.keys(packet.counts.hitOwner).map((k) => k.split('/')[0])
      .filter((v, i, all) => all.indexOf(v) === i).sort(), ['curve', 'entry', 'far']);
  });
});

/** Every pixel wears the colour of the answer its ray actually got. */
function classify(sample, width) {
  for (const ray of sample.rays) {
    const at = (ray.py * width + ray.px) * 3;
    const rgb = [...sample.pixels.subarray(at, at + 3)];
    if (ray.result.status === 'miss') assert.deepEqual(rgb, [...MISS_COLOR], 'a miss is not the miss colour');
    else assert.notDeepEqual(rgb, [...MISS_COLOR], `${ray.result.status} wears the miss colour`);
  }
}

test('unresolved is never painted as sky, and miss has its own colour', () => {
  const unresolvedColors = new Set(Object.values(UNRESOLVED_COLORS).map(String));
  const hitColors = new Set(Object.values(HIT_COLORS).map(String));
  assert.ok(!unresolvedColors.has(String(MISS_COLOR)), 'a refusal shares the miss colour');
  assert.ok(!hitColors.has(String(MISS_COLOR)), 'a hit shares the miss colour');
  for (const hit of hitColors) assert.ok(!unresolvedColors.has(hit), `${hit} is both a hit and a refusal`);

  // At the documented range the whole background is a REFUSAL: a cover region
  // is a bounded chart, so a ray that leaves it is unresolved/domain-exit and
  // there is no sky behind it to report. Those pixels must not be the miss
  // colour, or the picture would claim empty space was proved empty.
  withProbe({}, ({ sample, image, packet }) => {
    assert.ok(packet.counts.unresolved === undefined ? packet.counts.status.unresolved > 0 : true);
    assert.ok(packet.counts.status.unresolved > 1000, 'expected a refused background');
    assert.deepEqual(Object.keys(packet.counts.unresolvedReason), ['domain-exit']);
    assert.equal(packet.counts.status.miss, undefined);
    assert.deepEqual(image.at(0, 0), UNRESOLVED_COLORS['domain-exit']);
    classify(sample, 96);
  });
  // Shorten the range below the chart and the same view resolves completely:
  // the refusals were the chart running out, not an unproven scene. The same
  // per-pixel rule is applied again HERE, because this is the only run in which
  // a miss exists to be mis-coloured.
  withProbe({ range: 8 }, ({ sample, packet }) => {
    assert.equal(packet.counts.status.unresolved, undefined);
    assert.ok(packet.counts.status.miss > 1000);
    classify(sample, 96);
  });
});

test('the packet repeats: pose, rays and budgets all replay to the same answers', () => {
  withProbe({}, ({ packet, world: w }) => {
    assert.equal(packet.scene.id, 'connected-sight');
    assert.equal(packet.pose.name, 'entry-spawn');
    assert.deepEqual(packet.pose.position, POSES['entry-spawn'].position);
    assert.ok(packet.host.name && packet.host.node && packet.host.revision);
    assert.equal(packet.sampling.width * packet.sampling.height, 96 * 72);
    // Every stored ray is a complete instruction for repeating it.
    for (const record of packet.rays) {
      const replay = traceRegionSight(w,
        { regionId: packet.pose.regionId, position: packet.pose.camera.position, direction: record.direction },
        { maxDistance: packet.sampling.maxDistance, maxWork: packet.sampling.maxWork });
      assert.equal(replay.status, record.status, record.label);
      assert.equal(replay.reason, record.reason, record.label);
      assert.equal(replay.regionId, record.regionId, record.label);
      assert.equal(replay.work, record.work, record.label);
      assert.equal(replay.distance, record.distance);
    }
    // Work is bounded and the report says so honestly: nothing hit the cap, so
    // no pixel in this image is a budget refusal wearing a hit's colour.
    assert.equal(packet.work.atBudget, 0);
    assert.ok(packet.work.max < packet.work.budget);
    assert.ok(packet.cpuQueryTiming.rays === 96 * 72 && packet.cpuQueryTiming.totalMilliseconds > 0);
  });
});

test('a second pose inside the curved region sees the same objective', () => {
  const w = world();
  const sample = sampleSight(w, POSES.doorway, { width: 24, height: 18 });
  const centre = sample.rays[9 * 24 + 12];
  assert.equal(centre.result.regionId, 'far');
  assert.equal(centre.result.query.owner, 'far-target');
  assert.equal(centre.result.crossings.length, 1);
  // The sampled centre pixel is half a pixel off the optical axis, so it is
  // slightly longer than the axis ray. The axis ray itself is exact: 3 to the
  // far aperture and 4.4 on to the target's face.
  assert.ok(Math.abs(centre.result.distance - 7.4) < 0.2, `${centre.result.distance}`);
  const axis = sight(w, { regionId: 'curve', position: sample.camera.position,
    direction: sample.camera.forward });
  near(axis.distance, 7.4, 1e-9);
  assert.equal(axis.query.owner, 'far-target');
  assert.ok(Object.keys(sample.counts.hitOwner).includes('curve/curve-wall'));
});

console.log(`connected sight fixture: ${passed}/${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
