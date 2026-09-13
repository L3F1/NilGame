import assert from 'node:assert/strict';
import {summarizeUsage,freshInput,findQuotaRefusals} from './tools/muse-usage.js';
// The ledger is read on a machine with a Muse install, so the aggregation is
// checked here on synthetic records instead. It counts spend and must never
// imply a remaining balance, which no local source reports.
const at=iso=>Date.parse(iso)*1000;
const call=(iso,session,family,usage)=>({recordedAtMicros:at(iso),session,family,kind:'model',usage});
const records=[
  call('2026-09-10T01:00:00Z','a','provider',{input_tokens:1000,output_tokens:100,reasoning_tokens:10,
    cached_tokens:900,cache_read_tokens:900,cache_write_tokens:0}),
  call('2026-09-10T23:59:59Z','a','provider',{input_tokens:500,output_tokens:50,reasoning_tokens:5,
    cached_tokens:0,cache_read_tokens:0,cache_write_tokens:200}),
  call('2026-09-11T00:00:01Z','b','tool',{input_tokens:7,output_tokens:0,reasoning_tokens:0,
    cached_tokens:0,cache_read_tokens:0,cache_write_tokens:0}),
];
const summary=summarizeUsage(records);
assert.equal(summary.total.calls,3);
assert.equal(summary.total.input_tokens,1507);
assert.equal(summary.total.output_tokens,150);
// Days are UTC and ordered newest first, because a quota window is stated in UTC.
assert.deepEqual(summary.days.map(([day])=>day),['2026-09-11','2026-09-10']);
assert.equal(summary.days[1][1].calls,2);
assert.equal(summary.days[0][1].input_tokens,7);
// Cached reads are most of the traffic, so the fresh figure must exclude them.
assert.equal(freshInput(summary.total),607);
assert.equal(freshInput(summary.days[1][1]),600);
assert.deepEqual(summary.sessions.map(([id])=>id),['a','b']);
assert.deepEqual(summary.families.map(([id])=>id),['provider','tool']);
assert.equal(summary.span.from,'2026-09-10T01:00:00.000Z');
assert.equal(summary.span.to,'2026-09-11T00:00:01.000Z');
// Malformed records are dropped, never counted as zero-cost calls.
const guarded=summarizeUsage([...records,null,{},{recordedAtMicros:NaN,usage:{input_tokens:9}},
  {recordedAtMicros:at('2026-09-10T01:00:00Z')}]);
assert.equal(guarded.total.calls,3);
assert.equal(guarded.total.input_tokens,1507);
assert.deepEqual(summarizeUsage([]),{total:{...summarizeUsage([]).total},days:[],sessions:[],
  families:[],span:null});
assert.equal(summarizeUsage([]).total.calls,0);
// The refusal scan must tolerate a missing bridge directory rather than throw.
assert.deepEqual(findQuotaRefusals('no/such/directory'),[]);
console.log(`muse usage: ${summary.total.calls} calls aggregated over `
  +`${summary.days.length} UTC days, ${freshInput(summary.total)} fresh of ${summary.total.input_tokens} input`);
