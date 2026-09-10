import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geometry } from './geom.js';
import { createChart, transferPoint, transferStretch } from './engine/geometry/charts.js';
import { parseScene, prepareScene, validateScene } from './engine/world/document.js';
import { modulePath } from './tools/module-path.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
}
function near(a, b, tolerance = 1e-8) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}
const kinds = ['e3', 'h3', 's3'];
const ks = [0, -1, 1];
for (let i = 0; i < kinds.length; i++) {
  const kind = kinds[i], G = geometry(ks[i]);
  test(`${kind}: round trip in translated and rotated chart`, () => {
    const origin = G.matMul(G.translation([0.15, -0.2, 0.1]),
      [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const before = origin.slice();
    const chart = createChart({ kind, origin, maxDistance: 1.5 });
    origin.fill(0); // Chart owns its origin; editor edits cannot mutate it.
    for (const offset of [[0, 0, 0], [0.5, 0.4, -0.2], [-1, 0.1, 0.5]]) {
      const point = chart.decode(offset);
      chart.encode(point).forEach((n, j) => near(n, offset[j]));
      near(chart.distance(G.point(before), point), Math.hypot(...offset));
    }
  });
}
for (const from of kinds) for (const to of kinds) {
  test(`${from} -> ${to}: reversible radial transfer and measured distortion`, () => {
    const source = createChart({ kind: from, maxDistance: 2 });
    const target = createChart({ kind: to, maxDistance: 2 });
    const p = source.decode([1, 0, 0]);
    const mapped = transferPoint(source, target, p);
    transferPoint(target, source, mapped).forEach((n, i) => near(n, p[i]));
    near(target.distance(target.decode([0, 0, 0]), mapped), 1);
    const angle = 1e-4;
    const q = source.decode([Math.cos(angle), Math.sin(angle), 0]);
    const measured = target.distance(mapped, transferPoint(source, target, q)) / source.distance(p, q);
    near(measured, transferStretch(source, target, 1).transverse, 1e-7);
    assert.deepEqual(transferStretch(source, target, 0), { radial: 1, transverse: 1, volume: 1 });
  });
}
test('Curvature radius sets physical distance and angular scale', () => {
  const small = createChart({ kind: 's3', maxDistance: 2 });
  const large = createChart({ kind: 's3', curvatureRadius: 2, maxDistance: 2 });
  near(large.distance(large.decode([0, 0, 0]), large.decode([1, 0, 0])), 1);
  near(large.angularScale(1), 2 * Math.sin(0.5));
  assert.ok(large.angularScale(1) > small.angularScale(1));
});
test('Invalid chart definitions are rejected', () => {
  for (const options of [
    { kind: 'nil' }, { kind: 's3', maxDistance: Math.PI },
    { kind: 's3', curvatureRadius: 0 }, { kind: 's3', maxDistance: Infinity },
    { kind: 'h3', maxDistance: 5 }, { kind: 'e3', curvatureRadius: 2 },
    { kind: 'h3', origin: new Array(16).fill(0) },
  ]) assert.throws(() => createChart(options));
});
test('Invalid points, bounds and the antipode fail rather than collapse', () => {
  const sphere = createChart({ kind: 's3', maxDistance: 2 });
  assert.throws(() => sphere.encode([0, 0, 0, -1]), /antipode/);
  assert.throws(() => sphere.encode([0, 0, 0, 2]), /belong/);
  assert.throws(() => sphere.decode([3, 0, 0]), /extent/);
  assert.throws(() => sphere.decode([NaN, 0, 0]), /finite/);
  assert.throws(() => transferStretch(sphere, sphere, -1), /nonnegative/);
  assert.throws(() => transferStretch(sphere, sphere, NaN), /extent/);
  const source = createChart({ kind: 'e3', maxDistance: 3 });
  assert.throws(() => transferPoint(source, sphere, source.decode([2.5, 0, 0])), /extent/);
});

const json = readFileSync(new URL('./levels/fixtures/connected-lab.nil.json', import.meta.url), 'utf8');
test('Scene survives JSON round trip and prepares points in the correct geometry', () => {
  const scene = parseScene(json), before = JSON.stringify(scene);
  assert.deepEqual(parseScene(before), scene);
  const { regions, points } = prepareScene(scene);
  for (const entity of scene.entities) {
    regions.get(entity.regionId).encode(points.get(entity.id)).forEach((n, i) => near(n, entity.position[i]));
  }
  assert.equal(JSON.stringify(scene), before);
  near(points.get('sphere-ball')[3], Math.cos(0.5));
  assert.equal(points.get('flat-ball')[3], 1);
});
const invalidEdits = [
  (s) => { s.version = 3; },
  (s) => { s.regions[0].geometry.kind = 'h2r'; },
  (s) => { s.regions[0].topology = 'torus'; },
  (s) => { s.entities[0].regionId = 'missing'; },
  (s) => { s.entities[1].id = s.entities[0].id; },
  (s) => { s.entities[1].position[0] = Infinity; },
  (s) => { s.entities[1].radius = 2; },
  (s) => { s.entities[0].position = [2, 0, 0]; },
  (s) => { s.connections[0].a = 'start'; },
  (s) => { s.connections[0].scale = 0.5; },
  (s) => { s.connections[0].velocity = 'magic'; },
  (s) => { s.entities[4].up = [0, 1, 0]; },
  (s) => { s.entities[5].radius = 0.3; },
  (s) => { s.connections.push({ ...s.connections[0], id: 'second-door' }); },
  (s) => { s.geometryBubble = true; },
  (s) => { s.entities = s.entities.filter((e) => e.kind !== 'spawn'); },
];
invalidEdits.forEach((edit, i) => test(`Unsupported/malformed scene ${i + 1} rejected`, () => {
  const scene = JSON.parse(json); edit(scene);
  assert.throws(() => validateScene(scene));
}));
test('Preview resolves nested relative imports without collisions or root escapes', () => {
  assert.equal(modulePath('main.js', './engine/runtime/world-motion.js'), 'engine/runtime/world-motion.js');
  assert.equal(modulePath('engine/runtime/world-motion.js', '../../s3.js'), 's3.js');
  assert.equal(modulePath('engine/world/document.js', '../geometry/charts.js'), 'engine/geometry/charts.js');
  assert.notEqual(modulePath('app/a.js', './shared.js'), modulePath('engine/a.js', './shared.js'));
  assert.throws(() => modulePath('app/a.js', '../../outside.js'), /outside/);
  assert.throws(() => modulePath('main.js', 'node:fs'), /relative/);
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
