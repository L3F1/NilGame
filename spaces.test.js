// Registration must preserve the renderer ABI and saved option order.
import assert from 'node:assert/strict';
import { SPACES, spaceFor, spaceForOption } from './spaces.js';
import { fragFor } from './shader.js';

assert.deepEqual(SPACES.map((s) => [s.key, s.shaderId]),
  [['h3', 0], ['s3', 1], ['h2r', 2], ['s2r', 3]]);
assert.deepEqual(SPACES.map((s) => s.option),
  ['hyperbolic', 'spherical', 'H^2 x R', 'S^2 x R']);
for (const space of SPACES) {
  assert.equal(spaceFor(space.key), spaceForOption(space.option));
  assert.ok(Object.isFrozen(space));
  assert.ok(!fragFor(space.key).includes('__GEOM_ID__'));
  assert.ok(fragFor(space.key).includes(`#define GEOM (${space.shaderId})`));
}
assert.equal(fragFor(-1), fragFor('h3'));
assert.equal(fragFor(1), fragFor('s3'));
// Object prototype names and mathematical-only spaces must not resolve.
for (const key of ['e3', 'toString', '__proto__', undefined]) {
  assert.throws(() => spaceFor(key), /Unknown geometry/);
  assert.throws(() => fragFor(key), /Unknown geometry/);
}
assert.throws(() => spaceForOption('flat'), /Unknown geometry option/);
console.log('space registration and shader compatibility passed');
