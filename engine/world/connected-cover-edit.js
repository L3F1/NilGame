// Author-coordinate edits only. Compilation remains the transaction's validator.
// Chart/region ownership and construction kinds are never implicit conversions.
export function patchConnectedEntities(document, edits) {
  if(!Array.isArray(edits)||!edits.length)throw Error('Expected at least one entity edit');
  const next=structuredClone(document),seen=new Set();
  const entities=[...next.baseScene.entities,...next.coverRegions.flatMap(r=>r.entities)];
  for(const edit of edits){
    if(!edit||Object.keys(edit).some(k=>!['id','patch'].includes(k))||seen.has(edit.id))throw Error('Invalid or duplicate entity edit');
    seen.add(edit.id);
    const entity=entities.find(e=>e.id===edit.id),patch=edit.patch;
    if(!entity)throw Error(`Unknown entity ${edit.id}`);
    const allowed=entity.kind==='ball'?['position','radius']:entity.kind==='anchor'?['position','radius','forward','up']:entity.kind==='spawn'?['position']:[];
    if(!allowed.length||!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length
      ||Object.keys(patch).some(k=>!allowed.includes(k)))throw Error('Unsupported property or construction/region/chart conversion');
    Object.assign(entity,structuredClone(patch));
  }
  return next;
}

export function addConnectedBall(document, spec) {
  if(!spec||typeof spec!=='object'||Array.isArray(spec)
    ||Object.keys(spec).some(k=>!['id','regionId','chartId','position','radius'].includes(k)))throw Error('Invalid ball creation record');
  const next=structuredClone(document),base=next.baseScene;
  const ids=[next.id,base.id,...base.regions.map(r=>r.id),...base.entities.map(e=>e.id),...base.connections.map(c=>c.id),
    ...next.coverRegions.flatMap(r=>[r.id,...r.charts.map(c=>c.id),...r.entities.map(e=>e.id)]),...next.connections.map(c=>c.id)];
  if(typeof spec.id!=='string'||! /^[a-z][a-z0-9_-]*$/.test(spec.id)||ids.includes(spec.id))throw Error('New ball needs a unique lowercase ID');
  const ball={id:spec.id,kind:'ball',position:structuredClone(spec.position),radius:spec.radius};
  if(base.regions.some(r=>r.id===spec.regionId)){
    if(Object.hasOwn(spec,'chartId'))throw Error('A bounded-region ball must not name a cover chart');
    base.entities.push({...ball,regionId:spec.regionId});
  }else{
    const region=next.coverRegions.find(r=>r.id===spec.regionId);
    if(!region)throw Error('Unknown ball region');
    if(typeof spec.chartId!=='string'||!region.charts.some(c=>c.id===spec.chartId))throw Error('Choose an author chart owned by the ball region');
    region.entities.push({...ball,chartId:spec.chartId});
  }
  return next;
}

export function removeConnectedBall(document, id) {
  const next=structuredClone(document),lists=[next.baseScene.entities,...next.coverRegions.map(r=>r.entities)];
  const list=lists.find(es=>es.some(e=>e.id===id)),entity=list?.find(e=>e.id===id);
  if(!entity)throw Error('Unknown ball');
  if(entity.kind!=='ball'||(entity.op??'add')!=='add')throw Error('Only additive balls can be removed here; spawns, anchors and modifiers are protected');
  if(lists.some(es=>es.some(e=>e.target===id)))throw Error('Ball is referenced by a modifier; remove or retarget that modifier explicitly');
  list.splice(list.indexOf(entity),1);
  return next;
}

// These helpers produce detached candidates. The host must compile and validate
// the ENTIRE candidate before publishing it (including clearance and GPU caps).
export function addConnectedPortalPair(document, spec) {
  const record=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
    &&Object.keys(value).every(k=>keys.includes(k));
  if(!record(spec,['id','radius','a','b']))throw Error('Invalid portal pair record');
  const next=structuredClone(document),base=next.baseScene;
  const ids=new Set([next.id,base.id,...base.regions.map(r=>r.id),...base.entities.map(e=>e.id),...base.connections.map(c=>c.id),
    ...next.coverRegions.flatMap(r=>[r.id,...r.charts.map(c=>c.id),...r.entities.map(e=>e.id)]),...next.connections.map(c=>c.id)]);
  function reserve(id){
    if(typeof id!=='string'||! /^[a-z][a-z0-9_-]*$/.test(id)||ids.has(id))throw Error('Portal pair needs three globally unique lowercase IDs');
    ids.add(id);
  }
  reserve(spec.id);
  for(const end of [spec.a,spec.b]){
    if(!record(end,['id','regionId','chartId','position','forward','up']))throw Error('Invalid portal endpoint record');
    reserve(end.id);
    const anchor={id:end.id,kind:'anchor',position:structuredClone(end.position),radius:spec.radius,
      forward:structuredClone(end.forward),up:structuredClone(end.up)};
    if(base.regions.some(r=>r.id===end.regionId)){
      if(Object.hasOwn(end,'chartId'))throw Error('A bounded-region anchor must not name a cover chart');
      base.entities.push({...anchor,regionId:end.regionId});
    }else{
      const region=next.coverRegions.find(r=>r.id===end.regionId);
      if(!region||typeof end.chartId!=='string'||!region.charts.some(c=>c.id===end.chartId))throw Error('Choose an author chart owned by the anchor region');
      region.entities.push({...anchor,chartId:end.chartId});
    }
  }
  next.connections.push({id:spec.id,kind:'portal',a:spec.a.id,b:spec.b.id,velocity:'preserve-speed',scale:1});
  return next;
}

export function reconnectConnectedPortals(document, edits) {
  if(!Array.isArray(edits)||!edits.length)throw Error('Expected at least one connection edit');
  const next=structuredClone(document),seen=new Set();
  // Stage every replacement before compilation: a swap may have no valid
  // intermediate graph. Rewritten base links migrate to the envelope, which
  // can resolve both base and cover anchors. Untouched links keep ownership.
  for(const edit of edits){
    if(!edit||typeof edit!=='object'||Array.isArray(edit)||Object.keys(edit).some(k=>!['id','a','b'].includes(k))
      ||typeof edit.a!=='string'||typeof edit.b!=='string'||seen.has(edit.id))throw Error('Invalid or duplicate connection edit');
    seen.add(edit.id);
    const list=next.baseScene.connections.some(c=>c.id===edit.id)?next.baseScene.connections:next.connections;
    const index=list.findIndex(c=>c.id===edit.id);
    if(index<0)throw Error(`Unknown connection ${edit.id}`);
    const replacement={...list[index],a:edit.a,b:edit.b};
    if(list===next.baseScene.connections){list.splice(index,1);next.connections.push(replacement);}
    else list[index]=replacement;
  }
  return next;
}

// Delete exactly the saved pair and its two anchors, never a selected endpoint
// from an unapplied reconnection draft. No recursive/cascading deletion.
export function removeConnectedPortalPair(document, id) {
  const next=structuredClone(document),connections=[next.baseScene.connections,next.connections];
  const matches=connections.flatMap(list=>list.filter(c=>c.id===id).map(connection=>({list,connection})));
  if(typeof id!=='string'||matches.length!==1)throw Error('Choose one existing portal connection');
  const {list,connection}=matches[0],ends=new Set([connection.a,connection.b]);
  if(connection.kind!=='portal'||ends.size!==2)throw Error('Invalid portal pair');
  const entityLists=[next.baseScene.entities,...next.coverRegions.map(r=>r.entities)];
  const entities=entityLists.flat();
  for(const end of ends){
    const anchors=entities.filter(e=>e.id===end);
    if(anchors.length!==1||anchors[0].kind!=='anchor')throw Error('Portal pair must own two anchors');
    if(connections.some(cs=>cs.some(c=>c!==connection&&(c.a===end||c.b===end)))
      ||entities.some(e=>e.target===end))throw Error('Portal anchor is referenced elsewhere; removal refused');
  }
  list.splice(list.indexOf(connection),1);
  for(const es of entityLists)for(let i=es.length-1;i>=0;i--)if(ends.has(es[i].id))es.splice(i,1);
  return next;
}
