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
    fields(entity, ['id', 'regionId', 'kind', 'position', 'radius', 'forward', 'up'], 'entity');
    identify(entity.id, ids, 'entity.id');
    const chart = charts.get(entity.regionId);
    requireValue(chart, `entity ${entity.id}: unknown region ${entity.regionId}`);
    requireValue(['ball', 'spawn', 'objective', 'anchor'].includes(entity.kind), `entity ${entity.id}: unsupported kind`);
    vector(entity.position, `entity ${entity.id}.position`);
    chart.decode(entity.position);
    if (entity.kind === 'ball' || entity.kind === 'anchor') {
      positive(entity.radius, `entity ${entity.id}.radius`);
    } else requireValue(entity.radius === undefined, `entity ${entity.id}: radius only applies to balls and anchors`);
    const clearance = entity.kind === 'spawn' ? scene.units.playerRadius : (entity.radius || 0);
    requireValue(Math.hypot(...entity.position) + clearance <= chart.maxDistance,
      `entity ${entity.id}: bounds straddle chart extent`);
    if (entity.kind === 'anchor') {
      vector(entity.forward, `anchor ${entity.id}.forward`);
      vector(entity.up, `anchor ${entity.id}.up`);
      const dot = entity.forward.reduce((sum, n, i) => sum + n * entity.up[i], 0);
      requireValue(Math.abs(Math.hypot(...entity.forward) - 1) < 1e-8
        && Math.abs(Math.hypot(...entity.up) - 1) < 1e-8 && Math.abs(dot) < 1e-8,
      `anchor ${entity.id}: forward and up must be orthonormal`);
    } else requireValue(entity.forward === undefined && entity.up === undefined,
      `entity ${entity.id}: orientation only applies to anchors`);
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
