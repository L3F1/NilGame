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
