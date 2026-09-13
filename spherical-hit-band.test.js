import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileConnectedCoverWorld} from './engine/world/connected-cover-world.js';
import {sphericalBallExterior} from './engine/geometry/spherical-root-bounds.js';
import {sphericalRootBounds} from './engine/geometry/spherical-root-bounds.js';
import {selectAdditiveEntry} from './engine/geometry/additive-event-order.js';
import {sphericalHitBandCensus} from './app/spherical-hit-band-census.js';
import {buildSamples} from './tools/glsl-transcendental-probe.js';
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
    // What the band leaves undecided about the PICTURE. The enclosure covers
    // both uncertain inputs, so it can be no tighter than either one alone.
    assert.equal(record.shading.status,'bounded',`Normal unbounded at ${where}: ${record.shading.reason}`);
    assert.ok(record.shading.diameter>0&&record.shading.degrees>0&&record.shading.colourSteps>0,
      `Degenerate shading spread at ${where}`);
    assert.ok(record.shading.band>0&&record.shading.ray>0,`Missing shading contribution at ${where}`);
    assert.ok(record.shading.diameter>=record.shading.band
      &&record.shading.diameter>=record.shading.ray,`Shading enclosure tighter than one source at ${where}`);
    // The two band-end normals are computed without any interval machinery, so
    // an enclosure narrower than their separation is unsound, not tighter.
    assert.ok(record.shading.endpointChord>0,`No independent normal witness at ${where}`);
    assert.ok(record.shading.diameter>=record.shading.endpointChord,
      `Shading enclosure ${record.shading.diameter} excludes its own band ends `
      +`${record.shading.endpointChord} at ${where}`);
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
  // The coefficient arithmetic a GPU consumer would execute must reach the same
  // decision. A binary32 model that came out NARROWER would be a modelling
  // error, not a better bound.
  assert.equal(record.binary32.status,record.entry.status,`Binary32 coefficients differ at ${where}`);
  assert.equal(record.binary32.owner,record.entry.owner??null,`Binary32 owner differs at ${where}`);
  assert.ok(record.binary32.certified,`Binary32 start not certified outside at ${where}`);
  if(record.entry.status==='entry')assert.ok(record.binary32.widening>=1,
    `Binary32 band narrower than the binary64 band at ${where}`);
  // The transcendental sweep is a requirement on the consumer's arctangent and
  // arccosine, so a traced hit must show where that requirement bites.
  if(record.cpu.status==='hit'){
    assert.ok(record.binary32.allowanceFailure,`No measured transcendental limit at ${where}`);
    assert.ok(record.binary32.allowanceLimit>0&&
      record.binary32.allowanceLimit<record.binary32.allowanceFailure.allowance,`Unordered limit at ${where}`);
    assert.notEqual(record.binary32.allowanceFailure.status,'entry',
      `A looser transcendental still claimed an entry at ${where}`);
    assert.equal(record.binary32.allowanceFailure.owner,null,
      `A looser transcendental named an owner at ${where}`);
  }
}
assert.ok(entries>0&&misses>0,'Census must cover traced hits and traced misses');
assert.equal(census.summary.missingTracedRoot,0);
assert.equal(census.summary.shading.unresolved,0);
assert.ok(census.summary.shading.maxColourSteps>0,'Shading spread was never measured');
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
assert.throws(()=>sphericalHitBandCensus({world,pose,allowances:[2**-11]}),/Transcendental allowances/);
// A consumer allowance is an input to the contract, and an invalid one refuses.
for(const bad of [-1,2,NaN,Infinity])assert.throws(()=>sphericalRootBounds({a:1,b:0,c:.5,
  errorA:0,errorB:0,errorC:0,curvatureRadius:1,maxDistance:1,phaseAllowance:bad}),/Invalid spherical/);
// Each consumer allowance must reach the bands on its own: an arctangent model
// that is silently dropped would leave a band the consumer cannot honour.
const coefficients={a:1,b:0,c:.5,errorA:1e-9,errorB:1e-9,errorC:1e-9,curvatureRadius:1,maxDistance:3};
const tight=sphericalRootBounds(coefficients);
assert.equal(tight.status,'roots');
for(const allowance of ['phaseAllowance','angleAllowance']){
  const loose=sphericalRootBounds({...coefficients,[allowance]:1e-3});
  assert.ok(loose.events[0].lower<tight.events[0].lower-5e-4
    &&loose.events[0].upper>tight.events[0].upper+5e-4,`${allowance} did not widen the bands`);
}

// The backend accuracy probe is browser-only, but the plumbing that aims it at
// the right numbers is checkable here: it must carry the census coefficients,
// not just its own sweep, or the measurement answers a different question.
const samples=buildSamples(census);
const fromCensus=samples.filter(s=>s.kind.startsWith('census:'));
// A ball the ray misses has amplitude below the constant, so its ratio leaves
// the arccosine domain and carries no accuracy question. Every ORDERED pixel
// must still reach the probe with the coefficients it was ordered by.
for(const record of census.records.filter(r=>r.binary32?.status==='entry'))
  assert.ok(fromCensus.some(s=>s.kind===`census:${record.x},${record.y}:${record.binary32.owner}`),
    `Ordered pixel ${record.x},${record.y} never reaches the accuracy probe`);
assert.ok(fromCensus.length>=entries&&fromCensus.every(s=>Math.abs(s.ratio)<=1),
  'Probe census samples must stay inside the arccosine domain');
assert.ok(samples.length>fromCensus.length+500,'The sweep must not collapse to the census points');
for(const sample of samples){
  assert.ok(Number.isFinite(sample.a)&&Number.isFinite(sample.b)&&Math.abs(sample.ratio)<=1,
    `Unusable probe sample ${JSON.stringify(sample)}`);
  assert.ok(Math.fround(sample.a)===sample.a&&Math.fround(sample.ratio)===sample.ratio,
    'Probe samples must be binary32 so the oracle sees the same input');
}
assert.ok(fromCensus.some(s=>Math.abs(1-s.ratio)<1e-3),
  'The tangency-grazing ratios the guard fires on must reach the probe');

console.log(`spherical hit band: ${census.summary.flagged} guarded pixels, ${entries} ordered entries `
  +`(band width ${census.summary.bandWidth.min.toPrecision(3)}..${census.summary.bandWidth.max.toPrecision(3)}), `
  +`${misses} certified misses, box separation limits ${JSON.stringify(census.summary.inflation)}, `
  +`binary32 coefficients agree with widening <=${census.summary.binary32.widening.max.toPrecision(3)}x, `
  +`transcendental allowance limits ${JSON.stringify(census.summary.binary32.allowance)} rad, `
  +`normal pinned to ${census.summary.shading.maxDegrees.toPrecision(3)} deg `
  +`(${census.summary.shading.maxColourSteps.toPrecision(3)} of 255 colour steps)`);
