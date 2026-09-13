// What has Muse actually spent? The client offers no usage or quota command,
// its bridge JSONL carries no token counts, and the provider only mentions the
// limit when refusing: "Subscription quota exhausted. Your usage window resets
// at ...". But every session log records per-call usage, so the spend side can
// be read locally even though the remaining side cannot.
//
// This is a PROXY LEDGER, not the provider's meter. It counts what the client
// recorded; the subscription may weight models differently, discount cached
// reads, or bill on a window this cannot see. Use it to learn where YOUR
// ceiling falls: run a window, watch the totals, and note where the refusal
// lands. After one window that number is measured rather than guessed.
import {createReadStream,existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const FIELDS=['input_tokens','output_tokens','reasoning_tokens','cached_tokens',
  'cache_read_tokens','cache_write_tokens'];
const blank=()=>Object.fromEntries([...FIELDS.map(f=>[f,0]),['calls',0]]);
// Cached reads are usually not billed like fresh input, and here they are 94%
// of the total, so a ledger that only shows input tokens is misleading.
export const freshInput=bucket=>bucket.input_tokens-bucket.cache_read_tokens;
const day=micros=>new Date(Math.round(micros/1000)).toISOString().slice(0,10);

// Pure so the aggregation is testable without a Muse install.
export function summarizeUsage(records){
  const days=new Map(),sessions=new Map(),families=new Map();
  let earliest=null,latest=null;
  for(const record of records){
    if(!record||typeof record!=='object'||!record.usage)continue;
    const at=Number(record.recordedAtMicros);
    if(!Number.isFinite(at)||at<=0)continue;
    earliest=earliest===null?at:Math.min(earliest,at);
    latest=latest===null?at:Math.max(latest,at);
    for(const [key,map] of [[day(at),days],[record.session??'unknown',sessions],
      [record.family??'unknown',families]]){
      const bucket=map.get(key)??blank();
      bucket.calls++;
      for(const field of FIELDS)bucket[field]+=Number(record.usage[field]??0);
      if(map===sessions){bucket.first=Math.min(bucket.first??at,at);bucket.last=Math.max(bucket.last??at,at);}
      map.set(key,bucket);
    }
  }
  const total=blank();
  for(const bucket of days.values()){total.calls+=bucket.calls;
    for(const field of FIELDS)total[field]+=bucket[field];}
  const sortEntries=map=>[...map.entries()].sort((a,b)=>b[1].input_tokens-a[1].input_tokens);
  return {total,
    days:[...days.entries()].sort((a,b)=>a[0]<b[0]?1:-1),
    sessions:sortEntries(sessions),families:sortEntries(families),
    span:earliest===null?null:{from:new Date(earliest/1000).toISOString(),
      to:new Date(latest/1000).toISOString()}};
}


// Per-assignment view. The cost of an agent run is dominated by re-sending its
// context: every turn pays for the whole conversation so far, so the startup
// floor is paid once per TURN, not once per run. Reporting that share is what
// makes "fewer turns" and "read less" measurable instead of folklore.
export function bridgeCost(session){
  const {calls,firstContext,lastContext,freshInput,cacheRead,output}=session;
  const totalInput=freshInput+cacheRead;
  return {...session,totalInput,
    floorShare:calls&&totalInput?firstContext*calls/totalInput:null,
    growth:firstContext?lastContext/firstContext:null,
    // What one more turn would cost at the context this run ended with.
    marginalTurn:lastContext};
}

// The refusal is the only place the provider states the window, so keep every
// one that has been observed: two of them bound the window length.
export function findQuotaRefusals(runsRoot){
  const found=[];
  if(!existsSync(runsRoot))return found;
  for(const run of readdirSync(runsRoot)){
    const runDir=join(runsRoot,run);
    if(!statSync(runDir).isDirectory())continue;
    for(const task of readdirSync(runDir)){
      const log=join(runDir,task,'agent.stdout.jsonl');
      if(!existsSync(log))continue;
      const text=readFileSync(log,'latin1');
      const match=text.match(/Subscription quota exhausted[^"]*?resets at ([0-9TZ:.\-]+)/);
      if(match)found.push({task,run,resetsAt:match[1],observed:statSync(log).mtime.toISOString()});
    }
  }
  return found.sort((a,b)=>a.observed<b.observed?1:-1);
}

// Session logs are tens of megabytes, so stream them and parse only the lines
// that can carry usage at all.
// Per-session context curve, for the bridge view: the first and last prompt
// sizes say how much a run accumulated, which is what later turns pay for.
export async function readSessionCurve(file){
  const out={calls:0,freshInput:0,cacheRead:0,output:0,firstContext:null,lastContext:null};
  const reader=createInterface({input:createReadStream(file,{encoding:'utf8'}),crlfDelay:Infinity});
  for await(const line of reader){
    if(!line.includes('"usage":{'))continue;
    let event;try{event=JSON.parse(line);}catch{continue;}
    const usage=event.payload?.event?.usage;
    if(!usage||!('input_tokens' in usage))continue;
    out.calls++;
    out.freshInput+=usage.input_tokens-usage.cache_read_tokens;
    out.cacheRead+=usage.cache_read_tokens;
    out.output+=usage.output_tokens;
    out.firstContext=out.firstContext??usage.input_tokens;
    out.lastContext=usage.input_tokens;
  }
  return out;
}

async function readSessionUsage(file,session,since){
  const records=[];
  const reader=createInterface({input:createReadStream(file,{encoding:'utf8'}),crlfDelay:Infinity});
  for await(const line of reader){
    if(!line.includes('"usage":{')&&!line.includes('"usage_family"'))continue;
    let event;
    try{event=JSON.parse(line);}catch{continue;}
    const at=Number(event.recorded_at);
    if(!Number.isFinite(at)||(since&&at<since))continue;
    const stack=[[event.payload,'unknown']];
    while(stack.length){
      const [node,inherited]=stack.pop();
      if(!node||typeof node!=='object')continue;
      const family=node.usage_family??node.family??inherited;
      if(node.usage&&typeof node.usage==='object'&&'input_tokens' in node.usage)
        records.push({recordedAtMicros:at,session,family,kind:'model',
          model:node.model??'unknown',usage:node.usage});
      // The provider's own accounting stream: flat token fields, classified by
      // family, with a reported flag. Kept apart from the model-call ledger so
      // neither can be quoted as the other.
      // The accounting record sits one level below its usage_family tag, and it
      // is told apart from a raw usage object by carrying reported/unit.
      else if('input_tokens' in node&&('reported' in node||node.unit==='tokens'))
        records.push({recordedAtMicros:at,session,family,kind:'accounted',
          reported:node.reported===true,usage:node});
      for(const value of Object.values(node))if(value&&typeof value==='object')stack.push([value,family]);
    }
  }
  return records;
}

function sessionLogs(root){
  const logs=[];
  const walk=directory=>{
    for(const entry of readdirSync(directory,{withFileTypes:true})){
      const path=join(directory,entry.name);
      if(entry.isDirectory()&&entry.name!=='subagent'&&entry.name!=='tool-outputs')walk(path);
      else if(entry.isFile()&&entry.name==='session.jsonl')logs.push(path);
    }
  };
  walk(root);
  return logs;
}

// Default to the Muse home the bridge already knows about, so nothing is
// hardcoded to one machine's user.
export function defaultSessionRoot(){
  const config=join(ROOT,'.agent-bridge','config.json');
  if(!existsSync(config))return null;
  const muse=JSON.parse(readFileSync(config,'utf8')).muse;
  const home=/^(\/home\/[^/]+)\//.exec(muse??'')?.[1];
  const distro=JSON.parse(readFileSync(config,'utf8')).distro??'Ubuntu';
  return home?`//wsl.localhost/${distro}${home}/.local/share/muse/sessions`:null;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  const rootArg=args.indexOf('--root');
  const daysArg=args.indexOf('--days');
  const root=rootArg>=0?args[rootArg+1]:defaultSessionRoot();
  const windowDays=daysArg>=0?Number(args[daysArg+1]):7;
  if(!root||!existsSync(root)){
    console.log(`No Muse session logs at ${root??'(unknown root)'}. Pass --root <path>.`);
    process.exit(0);
  }
  // Join a bridge assignment to its session log through the session id the run
  // stream announces, so no database and no path convention is relied on.
  const bridgeSessions=new Map();
  const runsRoot=join(ROOT,'.agent-bridge','runs');
  if(existsSync(runsRoot))for(const run of readdirSync(runsRoot)){
    for(const task of readdirSync(join(runsRoot,run))){
      const log=join(runsRoot,run,task,'agent.stdout.jsonl');
      if(!existsSync(log))continue;
      const head=readFileSync(log,'latin1').slice(0,200000);
      const id=/"stream":\{"kind":"session","id":"([0-9a-f-]+)"/.exec(head)?.[1];
      if(id)bridgeSessions.set(id,task);
    }
  }
  const since=(Date.now()-windowDays*86400000)*1000;
  const records=[];
  for(const log of sessionLogs(root)){
    if(statSync(log).mtimeMs*1000<since)continue;
    records.push(...await readSessionUsage(log,log.split(/[\\/]/).at(-2),since));
  }
  const summary=summarizeUsage(records.filter(r=>r.kind==='model'));
  const accounted=summarizeUsage(records.filter(r=>r.kind==='accounted'&&r.reported));
  const thousands=n=>n.toLocaleString('en-US');
  console.log(`Muse local usage ledger - PROXY, not the provider's meter`);
  console.log(`root ${root}`);
  console.log(summary.span?`records ${summary.span.from} .. ${summary.span.to}`:'no usage records found');
  const row=(label,bucket)=>label.padEnd(12)+String(bucket.calls).padStart(7)
    +thousands(freshInput(bucket)).padStart(13)+thousands(bucket.cache_read_tokens).padStart(13)
    +thousands(bucket.output_tokens).padStart(10)+thousands(bucket.reasoning_tokens).padStart(11);
  console.log('\n'+'UTC day'.padEnd(12)+'calls'.padStart(7)+'fresh input'.padStart(13)
    +'cache read'.padStart(13)+'output'.padStart(10)+'reasoning'.padStart(11));
  for(const [date,bucket] of summary.days)console.log(row(date,bucket));
  console.log(row('total',summary.total));
  if(accounted.families.length){
    console.log("\nthe client's own reported accounting, by family");
    for(const [family,bucket] of accounted.families)
      // This stream reports its own input total and does not split the cache
      // out the way a model call does, so show it raw rather than pretending.
      console.log(`  ${family.padEnd(12)} ${String(bucket.calls).padStart(6)} records  `
        +`${thousands(bucket.input_tokens).padStart(12)} input as reported  ${thousands(bucket.output_tokens).padStart(9)} output`);
  }
  console.log('\nlargest sessions in this span');
  for(const [session,bucket] of summary.sessions.slice(0,8))
    console.log(`  ${session.slice(0,8)}  ${String(bucket.calls).padStart(5)} calls  ${thousands(bucket.input_tokens).padStart(12)} input  `
      +`${thousands(bucket.output_tokens).padStart(8)} output  ${new Date(bucket.first/1000).toISOString()}`);
  if(args.includes('--bridge')){
    console.log('\nbridge assignments, newest first');
    console.log('  '+'assignment'.padEnd(30)+'turns'.padStart(6)+'total input'.padStart(13)
      +'output'.padStart(8)+'ctx first'.padStart(11)+'ctx last'.padStart(10)+'floor share'.padStart(13));
    const seen=sessionLogs(root)
      .map(log=>({log,name:bridgeSessions.get(log.split(/[\\/]/).at(-2))}))
      .filter(entry=>entry.name)
      .sort((a,b)=>statSync(b.log).mtimeMs-statSync(a.log).mtimeMs);
    for(const {log,name} of seen.slice(0,12)){
      const curve=bridgeCost({...await readSessionCurve(log),name});
      if(!curve.calls)continue;
      console.log('  '+String(curve.name).slice(0,29).padEnd(30)+String(curve.calls).padStart(6)
        +thousands(curve.totalInput).padStart(13)+thousands(curve.output).padStart(8)
        +thousands(curve.firstContext).padStart(11)+thousands(curve.lastContext).padStart(10)
        +`${Math.round(curve.floorShare*100)}%`.padStart(13));
    }
    console.log('  floor share = startup context re-sent every turn, as a fraction of all input.');
    console.log('  A file of T tokens read at turn k of N adds about T*(N-k) input tokens.');
  }
  const refusals=findQuotaRefusals(join(ROOT,'.agent-bridge','runs'));
  // Totals since a stated reset are the closest thing to "used this window".
  const sinceArg=args.indexOf('--since');
  const boundary=sinceArg>=0?args[sinceArg+1]:refusals[0]?.resetsAt?.replace(/\.$/,'');
  if(boundary&&!Number.isNaN(Date.parse(boundary))){
    const from=Date.parse(boundary)*1000;
    const window=summarizeUsage(records.filter(r=>r.recordedAtMicros>=from));
    console.log(`
since ${boundary}: ${window.total.calls} calls, `
      +`${thousands(freshInput(window.total))} fresh input, ${thousands(window.total.output_tokens)} output`);
  }
  console.log(refusals.length?'\nobserved quota refusals (the only statement of the window)':'\nno quota refusal recorded in .agent-bridge/runs');
  for(const refusal of refusals.slice(0,5))
    console.log(`  ${refusal.observed}  ${refusal.task}  window resets at ${refusal.resetsAt}`);
  console.log('\nThis counts spend, never remaining balance: the client exposes no quota query.');
  console.log('To calibrate a ceiling, note the totals when a refusal lands, then compare windows.');
}
