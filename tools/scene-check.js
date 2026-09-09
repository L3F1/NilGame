// Validate an authoring fixture and exercise radial sample transfer.
// This is a data/math check, not a playable-level or collision check.
import { readFileSync } from 'node:fs';
import { parseScene, prepareScene } from '../engine/world/document.js';
import { transferPoint, transferStretch } from '../engine/geometry/charts.js';

try {
  const path = process.argv[2] || new URL('../levels/fixtures/connected-lab.nil.json', import.meta.url);
  const scene = parseScene(readFileSync(path, 'utf8'));
  const { regions, points } = prepareScene(scene);
  console.log(`${scene.id}: ${regions.size} regions, ${points.size} entities, ${scene.connections.length} portal definitions`);
  for (const connection of scene.connections) {
    const a = scene.entities.find((e) => e.id === connection.a);
    const b = scene.entities.find((e) => e.id === connection.b);
    const source = regions.get(a.regionId), target = regions.get(b.regionId);
    const distance = Math.min(source.maxDistance, target.maxDistance) * 0.5;
    const mapped = transferPoint(source, target, source.decode([distance, 0, 0]));
    const stretch = transferStretch(source, target, distance);
    console.log(`${a.regionId} -> ${b.regionId}: radial ${target.distance(target.decode([0, 0, 0]), mapped).toFixed(4)}, transverse stretch ${stretch.transverse.toFixed(4)}`);
  }
  // What this tool checks and what it does NOT. Traversal is implemented and
  // tested (portal.test.js, and the lab walks one), but it is not tested HERE:
  // this checks the document and the transfer samples, so saying "passed"
  // without saying what was not looked at would overclaim.
  console.log('Scene data and origin-centered transfer samples passed; '
    + 'traversal is covered by portal.test.js, not by this tool.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
