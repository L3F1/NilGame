// Analytic E3 ray occupancy. Each convex primitive occupies a closed interval
// on the complete ray line. Intersections clip intervals; subtraction removes
// the cutter's OPEN interior. Exact duplicate subtraction is simplified by the
// scene compiler. Newly collapsed Boolean intervals are indeterminate: a
// one-dimensional ray interval cannot prove whether a coincident surface has
// occupied volume beside it. Primitive tangencies remain legitimate contacts.
// A reported `uncertainty` is a parameter on the COMPLETE ray line and may be
// negative; csgRayCast alone decides what a value behind the origin means.
// No field marching, DOM or renderer assumptions belong in this module.
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const at = (p, u, t) => p.map((x, i) => x + u[i] * t);
const event = (solid, sign = 1) => [{ solid, sign }];
const combine = (a, b) => [...a, ...b].filter((x, i, all) =>
  all.findIndex((y) => y.solid.id === x.solid.id && y.sign === x.sign) === i);
const flip = (events) => events.map((x) => ({ solid: x.solid, sign: -x.sign }));
const tolerance = (a, b) => 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

/** Compiled primitives supply their field normal and optional box local frame. */
export function primitiveRayInterval(solid, p, u) {
  const e = event(solid);
  const result = (lo, hi) => ({ intervals: [{ lo, hi, enter: e, exit: e }], uncertainty: Infinity });
  const miss = () => ({ intervals: [], uncertainty: Infinity });
  const unknown = (t = 0) => ({ intervals: [], uncertainty: t });
  if (solid.kind === 'ball') {
    const v = p.map((x, i) => x - solid.center[i]);
    const a = dot(u, u), middle = -dot(v, u) / a;
    const closest = at(v, u, middle), rho2 = dot(closest, closest);
    const disc = solid.radius * solid.radius - rho2;
    if (![middle, rho2, disc].every(Number.isFinite)) return unknown();
    // Near cancellation cannot justify a confident miss. This guard also
    // catches loss from subtracting a long ray from a distant centre.
    const error = 64 * Number.EPSILON * (solid.radius ** 2 + rho2
      + Math.max(...v.map(Math.abs)) * Math.hypot(...closest));
    if (disc < 0) return -disc <= error ? unknown(middle) : miss();
    const half = Math.sqrt(disc / a);
    return result(middle - half, middle + half);
  }
  if (solid.kind === 'box') {
    const q = solid.localPoint ? solid.localPoint(p) : p.map((x, i) => x - solid.center[i]);
    const d = solid.localDirection ? solid.localDirection(u) : u;
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < 3; i++) {
      // Only exactly zero is parallel. Tiny slopes can hit within a long
      // finite query and must not be rounded into confident misses.
      if (d[i] === 0) { if (Math.abs(q[i]) > solid.halfExtent[i]) return miss(); continue; }
      let l = (-solid.halfExtent[i] - q[i]) / d[i];
      let h = (solid.halfExtent[i] - q[i]) / d[i];
      if (!Number.isFinite(l) || !Number.isFinite(h)) return unknown();
      if (l > h) [l, h] = [h, l];
      lo = Math.max(lo, l); hi = Math.min(hi, h);
      if (lo > hi) return lo - hi <= tolerance(lo, hi) ? unknown(lo) : miss();
    }
    return result(lo, hi);
  }
  if (solid.kind === 'plane') {
    const height = dot(p, solid.normal) - solid.offset, denom = dot(u, solid.normal);
    if (![height, denom].every(Number.isFinite)) return unknown();
    if (denom === 0) return height <= 0 ? result(-Infinity, Infinity) : miss();
    const t = -height / denom;
    if (!Number.isFinite(t)) return unknown();
    return denom < 0 ? result(t, Infinity) : result(-Infinity, t);
  }
  throw new Error(`No E3 analytic interval for ${solid.kind}`);
}

function intersection(a, b, note) {
  const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
  if (lo > hi) {
    if (lo - hi <= tolerance(lo, hi)) note(lo);
    return [];
  }
  return [{ lo, hi,
    degenerate: a.degenerate || b.degenerate || (lo === hi && a.lo !== a.hi && b.lo !== b.hi),
    enter: a.lo === b.lo ? combine(a.enter, b.enter) : a.lo > b.lo ? a.enter : b.enter,
    exit: a.hi === b.hi ? combine(a.exit, b.exit) : a.hi < b.hi ? a.exit : b.exit }];
}

function subtraction(a, b, note) {
  if (b.lo === b.hi || b.hi < a.lo || b.lo > a.hi) {
    for (const [x, y] of [[b.hi, a.lo], [b.lo, a.hi]]) {
      const gap = Math.abs(x - y);
      if (Number.isFinite(gap) && gap > 0 && gap <= tolerance(x, y)) note(Math.max(x, y));
    }
    return [a];
  }
  const out = [];
  if (b.lo >= a.lo && Number.isFinite(b.lo)) out.push({
    lo: a.lo, hi: Math.min(a.hi, b.lo), enter: a.enter,
    degenerate: a.degenerate || (a.lo !== a.hi && b.lo === a.lo),
    exit: b.lo === a.hi ? combine(a.exit, flip(b.enter)) : flip(b.enter),
  });
  if (b.hi <= a.hi && Number.isFinite(b.hi)) out.push({
    lo: Math.max(a.lo, b.hi), hi: a.hi,
    degenerate: a.degenerate || (a.lo !== a.hi && b.hi === a.hi),
    enter: b.hi === a.lo ? combine(a.enter, flip(b.exit)) : flip(b.exit), exit: a.exit,
  });
  return out;
}

/** Per-additive-solid CSG: irrelevant modifiers never affect its query. */
export function csgRayCast(added, modsFor, p, u, maxDistance) {
  const cached = new Map();
  const get = (s) => {
    if (!cached.has(s.id)) cached.set(s.id, primitiveRayInterval(s, p, u));
    return cached.get(s.id);
  };
  let best = Infinity, bestOwner = null, boundary = [], touch = false, uncertainty = Infinity;
  // An ambiguity BEHIND the origin cannot change what the ray meets ahead of
  // it: the uncertain span carries no measure, so adding or removing a point
  // at t < 0 leaves every forward interval exactly where it was. Clamping
  // such a t to zero made a ray aimed AWAY from a tangency answer
  // 'indeterminate' from a standing start -- a confident refusal on the
  // easiest ray there is. The margin keeps an ambiguity that straddles the
  // origin, where occupancy at t = 0 really is in doubt.
  const note = (t) => {
    if (t < -tolerance(t, 0)) return;
    uncertainty = Math.min(uncertainty, Math.max(0, t));
  };
  for (const base of added) {
    const primitive = get(base);
    note(primitive.uncertainty);
    let intervals = primitive.intervals;
    for (const mod of modsFor.get(base.id)) {
      const cutter = get(mod.solid);
      note(cutter.uncertainty);
      if (mod.sign > 0) {
        intervals = intervals.flatMap((a) => cutter.intervals.flatMap((b) => intersection(a, b, note)));
      } else {
        for (const b of cutter.intervals) intervals = intervals.flatMap((a) => subtraction(a, b, note));
      }
      if (!intervals.length) break;
    }
    for (const span of intervals) {
      if (span.hi < 0) continue;
      const t = Math.max(0, span.lo);
      if (t > maxDistance) continue;
      if (span.degenerate) { note(t); continue; }
      // Inside-start occupancy is deliberate. There is no surface normal at
      // this t; the caller can separately ask the field for a contact normal.
      const events = span.lo === span.hi ? combine(span.enter, span.exit)
        : t === span.lo ? span.enter : t === span.hi ? span.exit : [];
      if (t < best) { best = t; bestOwner = base.id; boundary = events; touch = span.lo === span.hi; }
      else if (t === best) { boundary = combine(boundary, events); }
    }
  }
  const common = { exhausted: false, steps: 0, method: 'analytic' };
  if (uncertainty <= maxDistance && uncertainty <= best) return {
    ...common, status: 'indeterminate', t: Infinity, hit: false,
    reason: 'floating-point-boundary', uncertainFrom: uncertainty, owner: null, normal: null,
  };
  if (best === Infinity) return { ...common, status: 'miss', t: Infinity, hit: false, owner: null, normal: null };
  const point = at(p, u, best);
  const normals = boundary.map(({ solid, sign }) => {
    const n = solid.kind === 'plane' ? solid.normalAt(point) : solid.normal(point);
    return n && n.map((x) => sign * x);
  });
  const normal = normals.find(Boolean) || null;
  const unique = !!normal && normals.every((n) => n && n.every((x, i) => Math.abs(x - normal[i]) <= 1e-12))
    && boundary.every(({ solid }) => !solid.normalInfo || solid.normalInfo(point).unique);
  return { ...common, status: 'hit', t: best, hit: true, owner: bestOwner,
    surfaceOwner: boundary[0]?.solid.id ?? null, point, normal,
    normalUnique: unique, contact: boundary.length ? touch ? 'touch' : 'boundary' : 'inside',
  };
}
