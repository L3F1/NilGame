import {readFileSync,writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {compileConnectedCoverWorld} from '../engine/world/connected-cover-world.js';
import {sphericalHitBandCensus} from '../app/spherical-hit-band-census.js';
// Regenerates docs/qa/spherical-hit-band-evidence.json from the same module the
// spherical-hit-band suite checks. CPU only: no browser, no GPU claim.
const fixture='levels/fixtures/connected-three-geometries.nil.json';
const world=compileConnectedCoverWorld(JSON.parse(readFileSync(fixture,'utf8')),{experimentalH3:true});
const start=world.spawn('flat');
const started=Date.now();
const census=sphericalHitBandCensus({world,
  pose:{regionId:start.regionId,position:start.position,camera:start.camera}});
const evidence={date:new Date().toISOString().slice(0,10),
  base:execSync('git rev-parse --short HEAD').toString().trim(),
  host:`${process.platform}/Node ${process.versions.node}`,
  command:'node tools/spherical-hit-band-evidence.js',
  checked:'node spherical-hit-band.test.js',fixture,wallMs:Date.now()-started,census};
writeFileSync('docs/qa/spherical-hit-band-evidence.json',JSON.stringify(evidence,null,1)+'\n');
console.log(`spherical-hit-band evidence: ${JSON.stringify(census.summary)}`);
