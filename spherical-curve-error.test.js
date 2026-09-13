import assert from 'node:assert/strict';
import {deriveCurveErrorBudget,CURVE_COMPONENT_ERROR,CURVE_DOT_FACTOR} from './engine/geometry/spherical-curve-error.js';
const b=deriveCurveErrorBudget();
assert.ok(b.sine.holds&&b.cosine.holds&&b.dot.holds);
assert.ok(b.sine.upper>0&&b.cosine.upper>0&&b.dot.upper>0);
assert.ok(b.sine.upper<CURVE_COMPONENT_ERROR&&b.cosine.upper<CURVE_COMPONENT_ERROR);
assert.ok(b.dot.upper<CURVE_DOT_FACTOR);
console.log('spherical curve error: exact rational budget inequalities passed',JSON.stringify(b));
