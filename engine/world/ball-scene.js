// First scene-v1 runtime adapter: one E3 cover, one spawn and one solid ball.
// Deliberately rejects features that this host cannot execute. No DOM/graphics.
import { validateScene } from './document.js';

function vector(p) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite))
    throw new Error('Expected three finite coordinates');
}

export function compileBallScene(source) {
  validateScene(source);
  if (source.regions.length !== 1 || source.regions[0].geometry.kind !== 'e3'
      || source.connections.length || source.entities.length !== 2
      || source.entities.filter(e => e.kind === 'spawn').length !== 1
      || source.entities.filter(e => e.kind === 'ball').length !== 1)
    throw new Error('Ball lab supports one E3 cover, one spawn, one ball and no connections');
  const scene = structuredClone(source);
  const ball = scene.entities.find(e => e.kind === 'ball');
  const center = ball.position.slice(), radius = ball.radius;
  const delta = p => { vector(p); return p.map((x, i) => x - center[i]); };
  return Object.freeze({
    id: ball.id, regionId: ball.regionId,
    capabilities: Object.freeze({ distance: 'exact', intersection: 'exact', normal: 'exact-except-center' }),
    document: () => structuredClone(scene),
    uniform: () => [...center, radius],
    distance(p) { return Math.hypot(...delta(p)) - radius; },
    normal(p) { const v = delta(p), d = Math.hypot(...v); return d ? v.map(x => x / d) : null; },
    rayHit(p, direction) {
      const v = delta(p); vector(direction);
      if (Math.abs(Math.hypot(...direction) - 1) > 1e-8) throw new Error('Ray direction must be unit length');
      const c = v.reduce((s, x) => s + x * x, 0) - radius * radius;
      if (c <= 0) return 0; // first occupied point when the ray starts inside
      const b = v.reduce((s, x, i) => s + x * direction[i], 0), disc = b * b - c;
      return b >= 0 || disc < 0 ? Infinity : c / (-b + Math.sqrt(disc));
    },
  });
}

/** Immutable edit: failed validation leaves the original scene untouched. */
export function editBallScene(source, position, radius) {
  const current = compileBallScene(source), next = current.document();
  const ball = next.entities.find(e => e.id === current.id);
  ball.position = position.slice(); ball.radius = radius;
  return compileBallScene(next).document();
}
