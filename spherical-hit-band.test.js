import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileConnectedCoverWorld} from './engine/world/connected-cover-world.js';
import {sphericalBallExterior} from './engine/geometry/spherical-root-bounds.js';
import {selectAdditiveEntry} from './engine/geometry/additive-event-order.js';
import {sphericalHitBandCensus} from './app/spherical-hit-band-census.js';
// Measurement guard for the hit-side decision in SPHERICAL_ROOT_PRECISION.md.
// It checks the ORDERING contract on the pixels the live shader refuses: a
// named first entry must be the traced owner and must bracket the traced root,
// a widened input box must lose the answer instead of changing it, and an
// uncertified start must refuse. It certifies no shading position or normal.
const doc=JSON.parse(readFileSync('levels/fixtures/connected-three-geometries.nil.json','utf8'));
const world=compileConnectedCoverWorld(doc,{experimentalH3:true});
const start=world.spawn('flat');
const pose={regionId:start.regionId,position:start.position,camera:start.camera};
const census=sphericalHitBandCensus({world,pose});
assert.equal(census.label,'spherical-hit-band');
assert.ok(census.summary.flagged>0,'No pixel reaches the tangency guard this census exists to measure');
assert.equal(census.records.length,census.summary.flagged);

let entries=0,misses=0;
for(const record of census.records){
  const where=`${record.x},${record.y}`;
  assert.equal(record.transfer.status,'bounded',`Transfer refused at ${where}`);
  assert.ok(record.guard.length,`Unflagged pixel recorded at ${where}`);
  assert.ok(record.exterior.certified,`Start not certified outside at ${where}: ${record.exterior.refused}`);
  if(record.cpu.status==='hit'){
    entries++;
    assert.equal(record.entry.status,'entry',`Traced hit left unordered at ${where}: ${record.entry.reason}`);
    assert.equal(record.entry.owner,record.cpu.owner,`Ordered entry names a different ball at ${where}`);
    // Ordering only: the band must bracket the traced root, and must not be a
    // range boundary dressed up as an interior answer.
    assert.ok(record.entry.lower>0&&record.entry.upper<record.remaining,`Boundary band at ${where}`);
    assert.ok(record.containsTracedRoot,
      `Band ${record.entry.lower}..${record.entry.upper} misses traced root ${record.tracedRoot} at ${where}`);
    assert.ok(record.bandWidth>0,`Zero-width band at ${where}`);
  }else{
    misses++;
    // A traced miss must never be promoted to an entry by this ordering.
    assert.equal(record.entry.status,'miss',`Traced miss ordered as ${record.entry.status} at ${where}`);
  }
  // Separation is finite: every pixel loses its answer at some wider input box,
  // so a passing census is a measurement and not a vacuous success.
  assert.ok(record.inflationLimit>=1&&record.inflationFailure,`No measured separation limit at ${where}`);
  assert.notEqual(record.inflationFailure.status,'entry',
    `A widened box still claimed an entry at ${where}`);
  assert.ok(record.inflationFailure.owner===null||record.inflationFailure.owner===record.entry.owner,
    `A widened box changed the named owner at ${where}`);
}
assert.ok(entries>0&&misses>0,'Census must cover traced hits and traced misses');
assert.equal(census.summary.missingTracedRoot,0);
assert.equal(census.summary.exteriorRefused,0);

// The exterior certificate is a strict proof in one direction only.
const ball=world.regions.get('sphere').balls[0],R=world.regions.get('sphere').space.curvatureRadius;
const exact={center:ball.center,centerError:[0,0,0,0],radius:ball.radius,radiusError:0,curvatureRadius:R};
const inside=sphericalBallExterior({point:ball.center,pointError:[0,0,0,0],...exact});
assert.equal(inside.status,'unresolved');
assert.equal(inside.reason,'start-not-certified-outside');
const antipode=sphericalBallExterior({point:ball.center.map(v=>-v),pointError:[0,0,0,0],...exact});
assert.equal(antipode.status,'outside');
// An unmeasured point is a refusal, not an assumed exterior.
const blind=sphericalBallExterior({point:ball.center.map(v=>-v),pointError:[2,2,2,2],...exact});
assert.equal(blind.status,'unresolved');
assert.throws(()=>sphericalBallExterior({point:[0,0,0,1],...exact}),/missing input-error bounds/);

// Ordering itself still refuses an uncertified start and a non-E3 census entry.
assert.throws(()=>selectAdditiveEntry([],{maxDistance:1}),/certified outside starts/);
assert.throws(()=>sphericalHitBandCensus({world,pose:{...pose,regionId:'sphere'}}),/E3 entry region/);
assert.throws(()=>sphericalHitBandCensus({world,pose,inflations:[2,4]}),/Inflation factors/);

console.log(`spherical hit band: ${census.summary.flagged} guarded pixels, ${entries} ordered entries `
  +`(band width ${census.summary.bandWidth.min.toPrecision(3)}..${census.summary.bandWidth.max.toPrecision(3)}), `
  +`${misses} certified misses, separation limits ${JSON.stringify(census.summary.inflation)}`);
