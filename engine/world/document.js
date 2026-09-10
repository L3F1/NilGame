// Versioned authoring data, independent of the browser or any native engine.
// v1 describes bounded cover regions and portal intent. It does not load a
// playable scene, implement portal crossing or enable mixed-geometry rendering.
import { createChart } from '../geometry/charts.js';

export const SCENE_VERSION = 1;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function fields(value, allowed, path) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${path}: expected object`);
  for (const key of Object.keys(value)) requireValue(allowed.includes(key), `${path}.${key}: unknown field`);
}
function vector(value, path) {
  requireValue(Array.isArray(value) && value.length === 3 && value.every(Number.isFinite), `${path}: expected 3 finite numbers`);
}
function positive(value, path) {
  requireValue(Number.isFinite(value) && value > 0, `${path}: expected positive finite number`);
}
function identify(value, ids, path) {
  requireValue(typeof value === 'string' && /^[a-z][a-z0-9_-]*$/.test(value), `${path}: use a lowercase stable ID`);
  requireValue(!ids.has(value), `${path}: duplicate ID ${value}`);
  ids.add(value);
}

/** Validate without repairing, mutating or discarding unsupported author intent. */
export function validateScene(scene) {
  fields(scene, ['format', 'version', 'id', 'units', 'regions', 'entities', 'connections'], 'scene');
  requireValue(scene.format === 'nil-scene', 'scene.format: expected nil-scene');
  requireValue(scene.version === SCENE_VERSION, `scene.version: expected ${SCENE_VERSION}; migration required`);
  const ids = new Set();
  identify(scene.id, ids, 'scene.id');
  fields(scene.units, ['name', 'playerRadius'], 'units');
  requireValue(scene.units.name === 'design-unit', 'units.name: expected design-unit');
  positive(scene.units.playerRadius, 'units.playerRadius');
  for (const key of ['regions', 'entities', 'connections']) requireValue(Array.isArray(scene[key]), `${key}: expected array`);
  requireValue(scene.regions.length > 0, 'regions: at least one region required');
  const charts = new Map();
  for (const region of scene.regions) {
    fields(region, ['id', 'geometry', 'topology', 'extent'], 'region');
    identify(region.id, ids, 'region.id');
    fields(region.geometry, ['kind', 'curvatureRadius'], `region ${region.id}.geometry`);
    positive(region.geometry.curvatureRadius, `region ${region.id}.curvatureRadius`);
    requireValue(region.topology === 'cover', `region ${region.id}: v1 supports cover regions only`);
    positive(region.extent, `region ${region.id}.extent`);
    charts.set(region.id, createChart({ ...region.geometry, maxDistance: region.extent }));
  }
  const entities = new Map();
  for (const entity of scene.entities) {
    fields(entity, ['id', 'regionId', 'kind', 'position', 'radius', 'forward', 'up', 'op', 'target'], 'entity');
    identify(entity.id, ids, 'entity.id');
    const chart = charts.get(entity.regionId);
    requireValue(chart, `entity ${entity.id}: unknown region ${entity.regionId}`);
    requireValue(['ball', 'plane', 'spawn', 'objective', 'anchor'].includes(entity.kind), `entity ${entity.id}: unsupported kind`);
    vector(entity.position, `entity ${entity.id}.position`);
    chart.decode(entity.position);
    if (entity.kind === 'ball' || entity.kind === 'anchor') {
      positive(entity.radius, `entity ${entity.id}.radius`);
    } else requireValue(entity.radius === undefined, `entity ${entity.id}: radius only applies to balls and anchors`);
    // BOOLEANS. A solid may be ADDED to the scene or SUBTRACTED from it -- a
    // doorway is a wall minus a box. Only the solid kinds have an op, because
    // subtracting a spawn point is not a thing that means anything, and
    // accepting it silently would leave an author wondering why nothing
    // happened. Absent means 'add', so every document written before booleans
    // existed keeps its meaning exactly.
    if (entity.op !== undefined) {
      requireValue(['ball', 'plane'].includes(entity.kind),
        `entity ${entity.id}: op applies to balls and planes, not ${entity.kind}`);
      requireValue(['add', 'subtract', 'intersect'].includes(entity.op),
        `entity ${entity.id}.op: expected "add", "subtract" or "intersect", `
        + `got ${JSON.stringify(entity.op)}`);
      // AN INTERSECT MUST SAY WHAT IT CLIPS. Subtraction without a target
      // removes material, which is visible and recoverable; intersection
      // without one deletes everything OUTSIDE itself, and for a plane that
      // is half the world. Same shape of operation, very different blast
      // radius when it is a mistake, so this one is refused rather than
      // guessed at.
      if (entity.op === 'intersect') {
        requireValue(entity.target !== undefined,
          `entity ${entity.id}: an intersect must name the solid it clips `
          + '(a global intersect would delete everything outside it)');
      }
    }
    // WHAT A CARVE CUTS. Absent, it cuts everything -- which sounds simpler
    // and is the wrong default for authoring: cutting a doorway through a wall
    // with a global subtraction takes the FLOOR out of the doorway too, and
    // the author is left standing over a hole wondering what they did. So a
    // carve may name the one solid it applies to.
    if (entity.target !== undefined) {
      requireValue(entity.op === 'subtract' || entity.op === 'intersect',
        `entity ${entity.id}: target only applies to a subtract or an intersect`);
      requireValue(entity.target !== entity.id,
        `entity ${entity.id}: a carve cannot target itself`);
    }
    const clearance = entity.kind === 'spawn' ? scene.units.playerRadius : (entity.radius || 0);
    requireValue(Math.hypot(...entity.position) + clearance <= chart.maxDistance,
      `entity ${entity.id}: bounds straddle chart extent`);
    // A PLANE is unbounded inside its region, so `position` is a point ON it
    // rather than an extent: only that anchor point has to lie in the chart.
    // `up` is the outward normal -- the side with room on it. The solid half
    // is the other one, which is why a floor points up rather than down.
    if (entity.kind === 'plane') {
      requireValue(entity.up !== undefined, `plane ${entity.id}: up is required`);
      vector(entity.up, `plane ${entity.id}.up`);
      requireValue(Math.abs(Math.hypot(...entity.up) - 1) < 1e-8,
        `plane ${entity.id}.up: expected a unit normal`);
    }
    if (entity.kind === 'anchor') {
      vector(entity.forward, `anchor ${entity.id}.forward`);
      vector(entity.up, `anchor ${entity.id}.up`);
      const dot = entity.forward.reduce((sum, n, i) => sum + n * entity.up[i], 0);
      requireValue(Math.abs(Math.hypot(...entity.forward) - 1) < 1e-8
        && Math.abs(Math.hypot(...entity.up) - 1) < 1e-8 && Math.abs(dot) < 1e-8,
      `anchor ${entity.id}: forward and up must be orthonormal`);
    } else {
      requireValue(entity.forward === undefined, `entity ${entity.id}: forward only applies to anchors`);
      requireValue(entity.up === undefined || entity.kind === 'plane',
        `entity ${entity.id}: up applies to anchors and planes`);
      requireValue(entity.kind !== 'plane' || entity.up !== undefined,
        `plane ${entity.id}: up is required`);
    }
    entities.set(entity.id, entity);
  }
  requireValue(scene.entities.some((entity) => entity.kind === 'spawn'), 'entities: at least one spawn required');
  const connected = new Set();
  for (const connection of scene.connections) {
    fields(connection, ['id', 'kind', 'a', 'b', 'velocity', 'scale'], 'connection');
    identify(connection.id, ids, 'connection.id');
    requireValue(connection.kind === 'portal', `connection ${connection.id}: only portal intent supported`);
    requireValue(connection.velocity === 'preserve-speed' && connection.scale === 1,
      `connection ${connection.id}: v1 requires preserve-speed and scale 1`);
    requireValue(connection.a !== connection.b, `connection ${connection.id}: endpoints must differ`);
    const endpoints = [connection.a, connection.b].map((id) => {
      const anchor = entities.get(id);
      requireValue(anchor?.kind === 'anchor', `connection ${connection.id}: unknown anchor ${id}`);
      requireValue(!connected.has(id), `anchor ${id}: already connected`);
      connected.add(id);
      return anchor;
    });
    requireValue(endpoints[0].radius === endpoints[1].radius,
      `connection ${connection.id}: aperture radii must match`);
  }
  return scene;
}

export function parseScene(json) {
  return validateScene(JSON.parse(json));
}

/** Build model points for tooling. Rendering/collision need separate adapters. */
export function prepareScene(scene) {
  validateScene(scene);
  const regions = new Map(scene.regions.map((region) => [region.id,
    createChart({ ...region.geometry, maxDistance: region.extent })]));
  const points = new Map(scene.entities.map((entity) => [entity.id,
    regions.get(entity.regionId).decode(entity.position)]));
  return { regions, points };
}
