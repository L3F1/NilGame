import assert from 'node:assert/strict';
import {selectAdditiveEntry} from './engine/geometry/additive-event-order.js';
const q=(owner,lower,upper,kind='entry')=>({owner,status:'roots',events:[{lower,upper,kind}]});
const select=queries=>selectAdditiveEntry(queries,{maxDistance:10,outsideCertified:true});
assert.equal(select([q('near',1,2),q('far',3,4,'ambiguous')]).owner,'near');
assert.equal(select([q('far',3,4,'ambiguous'),q('near',1,2)]).owner,'near');
assert.equal(select([q('a',1,3),q('b',2,4)]).status,'unresolved');
assert.equal(select([q('a',1,2),q('b',2,4)]).status,'unresolved');
assert.equal(select([q('a',0,1)]).status,'unresolved');
assert.equal(select([q('a',9,10)]).status,'unresolved');
assert.equal(select([q('a',1,2,'exit')]).status,'unresolved');
assert.equal(select([q('a',1,2),{owner:'unknown',status:'unresolved',events:[]}]).status,'unresolved');
assert.equal(select([{owner:'empty',status:'miss',events:[]}]).status,'miss');
assert.throws(()=>selectAdditiveEntry([],{maxDistance:10}),/outside/);
// Sample real event times within every band: any asserted first entry must be
// strictly earlier for all sampled assignments, independent of midpoint order.
let resolved=0;
for(let a=1;a<5;a+=.5)for(let b=1;b<5;b+=.5){
  const bands=[q('a',a,a+.75),q('b',b,b+.5)],answer=select(bands);
  if(answer.status!=='entry')continue;resolved++;
  const selected=bands.find(x=>x.owner===answer.owner),other=bands.find(x=>x.owner!==answer.owner);
  for(const x of [selected.events[0].lower,selected.events[0].upper])
  for(const y of [other.events[0].lower,other.events[0].upper])assert.ok(x<y);
}
assert.ok(resolved>0);
console.log(`Additive interval ordering: ${resolved} sampled strict orders; overlaps, ties, uncertain prefixes and horizons refuse`);
