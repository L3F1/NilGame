import assert from 'node:assert/strict';
import { classify } from './tools/s3-refusal-census.js';

const verdict = (reason, extra = {}) => classify('source', {
  status: 'unresolved', regionId: 'destination', reason, ...extra,
});
assert.equal(verdict('domain-exit').class, 'domain-only');
for (const reason of ['aperture-side', 'invalid-destination', 'domain-aperture-tie',
  'unsupported-geometry', 'unsupported-global-field', 'unsupported-h3-field',
  'budget-exhausted', 'unknown-future-reason']) {
  assert.notEqual(verdict(reason).class, 'domain-only', reason);
}
const domain = { fromId: 'gate-a', reason: 'domain-exit' };
const numeric = { fromId: 'gate-b', reason: 'tangent-ambiguity' };
assert.equal(verdict('aperture-query', { apertures: [domain] }).class, 'domain-only');
for (const apertures of [[], [domain, numeric], [numeric, domain], [{}]]) {
  assert.notEqual(verdict('aperture-query', { apertures }).class, 'domain-only');
}
const mixed = verdict('aperture-query', { apertures: [domain, numeric] });
assert.equal(mixed.status, 'unresolved');
assert.equal(mixed.endRegionId, 'destination');
assert.deepEqual(mixed.apertures.map(a => a.reason), ['domain-exit', 'tangent-ambiguity']);
assert.equal(classify('source', { status: 'miss', reason: 'range' }).class, 'resolved');
assert.throws(() => classify('source', { status: 'unexpected' }), /status/);
console.log('Refusal census classification passed: coverage, mixed provenance, unknowns and resolved results');
