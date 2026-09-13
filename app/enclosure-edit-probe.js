import {createConnectedGlobalPreview} from './connected-global-model.js';

// Reuse the two independently compiled programs, restoring the caller's world
// even if a check fails. Never mutate the caller's document/history/player.
export function checkEnclosureEdits(model,renderer,reference){
  const original=model.world,width=65,height=49,records=[];
  const same=(a,b)=>a.pixels.every((v,i)=>v===b.pixels[i])&&a.distances.every((v,i)=>v===b.distances[i]);
  const pose=s=>JSON.stringify([s.regionId,s.position,s.camera.forward,s.camera.right,s.camera.up,s.velocity]);
  const editor=createConnectedGlobalPreview(model.document(),{experimentalH3:true,installWorld:world=>{
    renderer.replaceWorld(world);reference.replaceWorld(world);
  }});
  const startPose=pose(editor.state);
  function read(name){
    const state=editor.state,off=renderer.read(state,width,height),old=reference.read(state,width,height);
    if(!same(old,off))throw Error('Edited candidate-off changed ordinary rendering: '+name);
    const on=renderer.read(state,width,height,{sphericalMissPass:true});let recovered=0;
    for(let i=0;i<width*height;i++){
      const j=4*i;
      if(off.pixels[j]!==2&&(!off.pixels.slice(j,j+4).every((v,k)=>v===on.pixels[j+k])||off.distances[i]!==on.distances[i]))
        throw Error('Edited certificate changed resolved pixel '+name+': '+i);
      if(off.pixels[j]===2&&on.pixels[j]!==2){
        const cpu=editor.pixelSight(width,height,i%width,Math.floor(i/width),renderer.packed.maxDistance,state);
        if(on.pixels[j]===1&&(cpu.status!=='hit'||cpu.regionId!==renderer.packed.ids[on.pixels[j+1]-1]
          ||cpu.query.owner!==renderer.packed.primitiveIds[on.pixels[j+2]-1]||Math.abs(cpu.distance-on.distances[i])>.001)
          ||on.pixels[j]===0&&cpu.status!=='miss')throw Error('Edited recovery disagrees with CPU '+name+': '+i);
        recovered++;
      }
    }
    if(renderer.missPass.status!=='generated'||!renderer.missPass.stats.lastAssociation)
      throw Error('Edited certificate was not regenerated '+name);
    records.push({name,revision:renderer.missPass.revision,recovered,settledChanged:0,offChanged:0});
    return on;
  }
  function change(name,operation){
    const revision=renderer.missPass.revision;
    if(!operation())throw Error('Expected real editor transaction '+name);
    if(renderer.missPass.revision!==revision+1||renderer.missPass.stats.lastAssociation!==null
      ||renderer.missPass.stats.lastStatus!=='world-replaced')throw Error('Edit retained certificate association '+name);
    if(pose(editor.state)!==startPose)throw Error('Edit moved the camera/player '+name);
    return read(name);
  }
  try{
    const baseline=read('baseline');
    const edited=change('resize-s3-ball',()=>editor.editEntities([{id:'north-landmark',patch:{radius:.78}}]));
    const saved=JSON.parse(JSON.stringify(editor.document()));
    if(same(baseline,edited))throw Error('Edit fixture did not change visible geometry');
    const undone=change('undo',()=>editor.undoEdit());
    if(!same(baseline,undone))throw Error('Undo did not restore baseline packet');
    const redone=change('redo',()=>editor.redoEdit());
    if(!same(edited,redone))throw Error('Redo did not restore edited packet');
    change('undo-before-load',()=>editor.undoEdit());
    const loaded=change('json-load',()=>editor.loadDocument(saved));
    if(!same(edited,loaded))throw Error('JSON load did not restore edited packet');
    const revision=renderer.missPass.revision,association=renderer.missPass.stats.lastAssociation;
    let refused=false;
    try{editor.editEntities([{id:'north-landmark',patch:{radius:-1}}]);}catch{refused=true;}
    if(!refused||renderer.missPass.revision!==revision||renderer.missPass.stats.lastAssociation!==association)
      throw Error('Refused edit changed renderer revision/association');
    if(!same(loaded,read('refused-edit')))throw Error('Refused edit changed rendered scene');
    return {records,visibleEdit:true,posePreserved:true,undoRedoLoadIdentical:true,refusalAtomic:true,
      scope:'one S3 ball resize, fixed E3 camera, 65x49; packet comparisons, not general edit proof'};
  }finally{
    renderer.replaceWorld(original);reference.replaceWorld(original);
  }
}
