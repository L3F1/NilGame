// CPU reference for connected sight. Physical arclength, zero body radius,
// no player exit offset. S3 uses Boolean events by default; the optional
// marcher certifies empty travel only, never a surface hit from a small bound.
import { PORTAL_PLANE_TOLERANCE } from './region-portal.js';
import { castSphericalRegion } from './s3-ray-cast.js';
import { castSphericalBalls } from '../geometry/spherical-cover.js';

export function traceRegionSight(world, ray, {
  maxDistance = 32, maxWork = 2048, maxCrossings = 4, surfaceTolerance = 1e-7,
  s3Method = 'events',
} = {}) {
  if (!world?.regions || !Array.isArray(world.portals)) throw new Error('Expected compiled region world');
  if (!Number.isFinite(maxDistance) || maxDistance < 0) throw new Error('Invalid maxDistance');
  if (!Number.isInteger(maxWork) || maxWork < 0) throw new Error('Invalid maxWork');
  if (!Number.isInteger(maxCrossings) || maxCrossings < 0) throw new Error('Invalid maxCrossings');
  if (!Number.isFinite(surfaceTolerance) || surfaceTolerance <= 0) throw new Error('Invalid surfaceTolerance');
  if (!['events','march'].includes(s3Method)) throw new Error('Invalid s3Method');
  let regionId = ray.regionId, position = ray.position.slice(), direction = ray.direction.slice();
  let distance = 0, work = 0, reverseId = null;
  const crossings = [], segments = [];
  const result = (status, reason, extra = {}) => ({ status, reason, regionId,
    position: position.slice(), direction: direction.slice(), distance,
    remainingDistance: Math.max(0, maxDistance - distance), work, crossings, segments, ...extra });
  const spend = () => { if (work >= maxWork) return false; work++; return true; };
  for (;;) {
    const region = world.regions.get(regionId);
    if (!region) throw new Error(`Unknown region ${regionId}`);
    const { space, field } = region;
    space.validatePoint(position); space.validateTangent(position, direction);
    if (Math.abs(space.norm(position, direction) - 1) > 1e-8) throw new Error('Sight direction must be unit length');
    if (!space.withinDomain(position)) return result('unresolved', 'domain-exit');
    const remaining = Math.max(0, maxDistance - distance);
    if (!spend()) return result('unresolved', 'work-budget');
    const domain = space.boundaryDistance(position, direction, remaining);
    let end = Math.min(remaining, domain), gate = null, gateTie = false;
    for (const portal of world.portals.filter(p => p.fromRegionId === regionId)) {
      if (!spend()) return result('unresolved', 'work-budget');
      const height = portal.signedHeight(position);
      // A newly mapped ray emerges from this exact endpoint. Only that reverse
      // event is suppressed. An unrelated on-plane start has no side ownership.
      if (Math.abs(height) <= PORTAL_PLANE_TOLERANCE &&
          space.distance(portal.center, position) <= portal.radius) {
        if (portal.fromId !== reverseId) return result('unresolved', 'aperture-side', { aperture: portal.fromId });
        if(space.coverage!=='s3-cover')continue;
        // Suppress only the zero event. Global crossing searches future roots
        // and still rejects the antipodal disc of this finite aperture.
      }
      const event = portal.crossing(position, direction, end, 0);
      if (!event) continue;
      if (event.distance > end) return result('unresolved', 'event-range');
      if (gate && Math.abs(event.distance - end) <= PORTAL_PLANE_TOLERANCE) gateTie = true;
      else { gate = portal; gateTie = false; }
      end = event.distance;
    }
    let local = 0, hit = null;
    if (space.kind === 'e3') {
      // One bounded analytic query; its primitive count is compile-time capped.
      if (!spend()) return result('unresolved', 'work-budget');
      const query = field.rayCast(position, direction, { maxDistance: end });
      if (query.status === 'indeterminate') return result('unresolved', query.reason, { query });
      if (query.status === 'hit') { local = query.t; hit = query; }
      else {
        // Range subtraction and transported coordinates can put an endpoint
        // root a few ulps outside the requested interval. Do not extend the ray
        // and call that a hit, or turn that uncertainty into a confident miss.
        if (!spend()) return result('unresolved', 'work-budget');
        if (field.distance(space.step(position, direction, end)) <= surfaceTolerance)
          return result('unresolved', 'range-boundary', { certifiedLocalDistance: end });
        local = end;
      }
    } else if(space.coverage==='s3-cover') {
      if(!Array.isArray(region.balls))return result('unresolved','unsupported-global-field');
      const query=castSphericalBalls(space,region.balls,position,direction,{maxDistance:end,maxTests:maxWork-work});
      work+=query.tests;
      if(query.status==='unresolved')return result('unresolved',query.reason,{query});
      if(query.status==='hit'){local=query.distance;hit={...query,t:query.distance,owner:query.id,method:'global-s3-balls'};}
      else local=end;
    } else if (s3Method==='events') {
      const query=castSphericalRegion(region,position,direction,{maxDistance:end,maxWork:maxWork-work});
      work+=query.work;
      if (query.status==='unresolved') return result('unresolved',query.reason,{query});
      if (query.status==='hit') {
        local=query.distance;
        hit={...query,t:query.distance,owner:query.additiveOwner,method:'s3-events'};
      } else local=end;
    } else {
      // Safe exterior traversal. A tiny positive BOUND need not be close to any
      // surface (corners/cutters); never turn it into a confident hit or miss.
      for (;;) {
        if (!spend()) return result('unresolved', 'work-budget', { certifiedLocalDistance: local });
        const at = space.step(position, direction, local), d = field.distance(at);
        if (Number.isNaN(d) || d === -Infinity) return result('unresolved', 'invalid-field');
        if (d <= surfaceTolerance) return result('unresolved', 'surface-candidate', {
          candidate: { position: at, distance: distance + local, fieldValue: d },
          certifiedLocalDistance: local,
        });
        if (local === end || d > end - local) { local = end; break; }
        const next = local + d;
        if (!(next > local)) return result('unresolved', 'numerical-stall');
        local = next;
      }
    }
    const leg = space.stepWithTransport(position, direction, local);
    segments.push({ regionId, start: position.slice(), end: leg.position.slice(), distance: local });
    position = leg.position; direction = leg.direction; distance += local;
    if (hit) {
      if (gate && Math.abs(local - end) <= PORTAL_PLANE_TOLERANCE)
        return result('unresolved', 'solid-aperture-tie');
      return result('hit', null, { query: hit });
    }
    if (gate) {
      if (gateTie) return result('unresolved', 'aperture-tie');
      if (Math.abs(domain - end) <= PORTAL_PLANE_TOLERANCE) return result('unresolved', 'domain-aperture-tie');
      if (crossings.length >= maxCrossings) return result('unresolved', 'crossing-budget');
      if (!spend()) return result('unresolved', 'work-budget');
      const transit = gate.transit(position), destination = world.regions.get(gate.toRegionId);
      if (!destination || !destination.space.withinDomain(transit.position)) return result('unresolved', 'invalid-destination');
      const outgoing = transit.carry(direction);
      destination.space.validateTangent(transit.position, outgoing);
      crossings.push({ id: gate.id, fromId: gate.fromId, toId: gate.toId,
        fromRegionId: regionId, toRegionId: gate.toRegionId, distance,
        entry: position.slice(), exit: transit.position.slice() });
      regionId = gate.toRegionId; position = transit.position; direction = outgoing;
      reverseId = gate.toId;
      continue;
    }
    if (domain <= remaining) return result('unresolved', 'domain-exit');
    return result('miss', 'range');
  }
}
