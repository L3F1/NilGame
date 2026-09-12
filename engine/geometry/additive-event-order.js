// Select a provably first ENTRY band for additive solids, all with certified
// outside starts. Not a CSG sweep, hit-point estimate, or normal certificate.
export function selectAdditiveEntry(queries,{maxDistance,outsideCertified}={}){
  if(outsideCertified!==true)throw Error('Additive ordering requires certified outside starts');
  if(!Number.isFinite(maxDistance)||maxDistance<0)throw Error('Invalid ordering range');
  const owners=new Set(),events=[];
  for(const q of queries){
    if(typeof q.owner!=='string'||owners.has(q.owner)||!['miss','roots','unresolved'].includes(q.status)||!Array.isArray(q.events))throw Error('Invalid additive root query');
    owners.add(q.owner);
    if(q.status==='miss'){if(q.events.length)throw Error('Miss must have no events');continue;}
    if(!q.events.length){events.push({lower:0,upper:maxDistance,kind:'ambiguous',owner:q.owner});continue;}
    for(const e of q.events){
      if(!Number.isFinite(e.lower)||!Number.isFinite(e.upper)||e.lower>e.upper||!['entry','exit','ambiguous'].includes(e.kind))throw Error('Invalid root band');
      if(e.upper<0||e.lower>maxDistance)continue;
      events.push({...e,owner:q.owner,boundary:!!e.boundary||e.lower<=0||e.upper>=maxDistance});
    }
  }
  events.sort((a,b)=>a.lower-b.lower);
  if(!events.length)return {status:'miss'};
  const first=events[0];
  if(first.kind!=='entry'||first.boundary)return {status:'unresolved',reason:'first-event-uncertain'};
  // Equal endpoints are a possible tie, not evidence of a strict order. Later
  // uncertainty does not suppress a foreground entry whose whole band precedes it.
  if(events.slice(1).some(e=>e.lower<=first.upper))return {status:'unresolved',reason:'overlapping-events'};
  return {status:'entry',owner:first.owner,lower:first.lower,upper:first.upper};
}

// Same ordering contract for prevalidated GPU event packets: kind1 entry,
// kind0 other/uncertain. Capacity32 is explicit; caller must not truncate.
export const ADDITIVE_EVENT_ORDER_GLSL=`
int firstAdditiveEntry(vec2 bands[32],int kinds[32],int count,float horizon,out int chosen){
  chosen=-1;if(count<0||count>32)return 2;
  for(int i=0;i<32;i++){if(i>=count)break;
    if(any(isnan(bands[i]))||any(isinf(bands[i]))||bands[i].x>bands[i].y)return 2;
    if(bands[i].y<0.||bands[i].x>horizon)continue;
    if(chosen<0||bands[i].x<bands[chosen].x)chosen=i;
  }
  if(chosen<0)return 0;
  if(kinds[chosen]!=1||bands[chosen].x<=0.||bands[chosen].y>=horizon)return 2;
  for(int i=0;i<32;i++){if(i>=count)break;if(i==chosen||bands[i].y<0.||bands[i].x>horizon)continue;
    if(bands[i].x<=bands[chosen].y)return 2;
  }
  return 1;
}
`;
