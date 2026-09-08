// Repeatable review viewpoints, kept as data for eventual native-host reuse.
// node tools/render-fixture.js nil-close-column [output.png]
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const data=JSON.parse(readFileSync(new URL('../levels/fixtures/render-regressions.json',import.meta.url),'utf8'));
const name=process.argv[2],fixture=data.views[name];
if(data.version!==1 || !Object.hasOwn(data.views,name)) {
  console.error(`Choose a fixture: ${Object.keys(data.views).join(', ')}`);
  process.exit(1);
}
if(fixture.position.length!==3 || ![...fixture.position,fixture.yaw,fixture.pitch].every(Number.isFinite))
  throw new Error('Invalid fixture coordinates');
const expression=fixture.coordinates==='nil'?'NIL.transMat(position)':
  fixture.coordinates==='h2r-floor'?'H2R.placeAt(...position)':null;
if(!expression)throw new Error('Unsupported fixture coordinate convention');
const code=`applyPreset(${JSON.stringify(fixture.preset)}); run=null; course=null;
const position=${JSON.stringify(fixture.position)}; player=${expression};
yaw=${fixture.yaw}; pitch=${fixture.pitch}; vel=[0,0,0];`;
const result=spawnSync(process.execPath,[fileURLToPath(new URL('./preview.js',import.meta.url)),
  process.argv[3]||`${name}.png`,code],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',windowsHide:true,
  env:{...process.env,CW:process.env.CW||'600',CH:process.env.CH||'400',VW:'800',VH:'500'},
});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
