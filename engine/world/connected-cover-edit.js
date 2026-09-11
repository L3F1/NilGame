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
