import assert from 'node:assert/strict';
import {deriveCurveErrorBudget,CURVE_COMPONENT_ERROR,CURVE_DOT_FACTOR} from './engine/geometry/spherical-curve-error.js';
const b=deriveCurveErrorBudget();
assert.ok(b.sine.holds&&b.cosine.holds&&b.dot.holds);
assert.ok(b.sine.upper>0&&b.cosine.upper>0&&b.dot.upper>0);
assert.ok(b.sine.upper<CURVE_COMPONENT_ERROR&&b.cosine.upper<CURVE_COMPONENT_ERROR);
assert.ok(b.dot.upper<CURVE_DOT_FACTOR);
// A norm/amplitude certificate is invariant under a quarter-turn of the
// sin/cos pair. Hit TIME is not. Pin this distinction before reusing the
// exterior contract in a spherical entry-band producer.
{
  const phase=2.2,alpha=.1,R=8,entry=(phase-alpha)*R;
  const shiftedEntry=(phase-alpha-Math.PI/2)*R;
  const field=(t,shift)=>Math.cos(phase)*Math.cos(t/R+shift)
    +Math.sin(phase)*Math.sin(t/R+shift)-Math.cos(alpha);
  for(const theta of [0,.4,1.9,3.2,6.1]){
    const s=Math.sin(theta),c=Math.cos(theta);
    assert.equal(s*s+c*c,c*c+(-s)*(-s),'quarter-turn preserves the computed squared norm');
  }
  for(const [t,shift] of [[entry,0],[shiftedEntry,Math.PI/2]]){
    assert.ok(field(t-1e-4,shift)<0&&field(t+1e-4,shift)>0,'independent sign bracket locates each entry');
  }
  assert.ok(Math.abs(entry-shiftedEntry)>12,'equal amplitude does not constrain entry distance');
  assert.ok(Math.abs(field(entry,Math.PI/2)-(Math.sin(alpha)-Math.cos(alpha)))<1e-14,
    'old entry has the expected nonzero signed field after the quarter-turn');
  assert.ok(field(entry,Math.PI/2)<0,'old entry is outside after the phase shift');
}
console.log('spherical curve error: exact rational budget inequalities passed',JSON.stringify(b));
