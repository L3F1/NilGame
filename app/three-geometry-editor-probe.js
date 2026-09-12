import {galleryRayCensus} from './gallery-ray-census.js';
// Browser-only acceptance through the live editor's controls and renderer.
export async function checkThreeGeometryEditor({model,renderer,canvas,editor,draw,checks,shots,loadDone}){
  const assert=(ok,message)=>{if(!ok)throw Error(message);},json=JSON.stringify;
  const pose=()=>json([model.state.regionId,model.state.position,model.state.camera.forward,model.state.camera.up]);
  const target=()=>model.document().baseScene.entities.find(e=>e.id==='h3-target');
  assert(document.querySelector('#world-preset').value==='three','Three-geometry preset not selected');
  assert(/H3/.test(document.querySelector('h1').textContent),'Missing H3 title');
  draw();shots.push({name:'three-gallery-entry',data:canvas.toDataURL()});
  const census=galleryRayCensus(model,renderer);
  checks.push('Gallery entry census: 19200 CPU/GPU rays, no confident answer disagreements');
  const refine=document.querySelector('#refine-spherical'),smooth=document.querySelector('#smooth');
  const initialSmooth=smooth.checked;
  assert(refine&&!refine.checked,'Refinement must start off');
  smooth.checked=false;refine.checked=true;refine.dispatchEvent(new Event('change'));
  assert(renderer.missPass.status==='generated','Refinement control did not reach live renderer');
  shots.push({name:'three-gallery-refinement',data:canvas.toDataURL()});
  smooth.checked=true;smooth.dispatchEvent(new Event('change'));
  assert(renderer.missPass.status==='antialias-refused'&&/Paused/.test(document.querySelector('#refine-status').textContent),
    'Smoothing must refuse centre-ray certificates and explain why');
  refine.checked=false;refine.dispatchEvent(new Event('change'));
  assert(renderer.missPass.status==='disabled','Refinement toggle did not restore baseline');
  smooth.checked=initialSmooth;smooth.dispatchEvent(new Event('change'));
  checks.push('Real refinement checkbox reaches renderer, refuses AA with explanation, and restores baseline');
  const route=['flat'];
  for(let i=0;i<400&&model.state.regionId!=='hyperbolic';i++){
    model.advance(.04,[0,1,0]);assert(!model.halted,'Forward route halted');
    if(route.at(-1)!==model.state.regionId)route.push(model.state.regionId);
  }
  assert(route.join()==='flat,sphere,hyperbolic',`Forward route ${route}`);
  checks.push('Preset boots; actual flight traverses E3 / full S3 / H3');
  const priorPassDraws=renderer.missPass.stats.draws;
  refine.checked=true;refine.dispatchEvent(new Event('change'));
  assert(renderer.missPass.status==='outside-scope'&&renderer.missPass.stats.draws===priorPassDraws,
    'H3 must skip first-E3-transfer refinement before submitting the pass');
  refine.checked=false;refine.dispatchEvent(new Event('change'));
  checks.push('H3 view skips inapplicable refinement without submitting the extra pass');
  draw();shots.push({name:'three-h3-arrival',data:canvas.toDataURL()});
  const savedPose=pose(),original=json(model.document()),radius=target().radius;
  editor.region.value='hyperbolic';editor.region.dispatchEvent(new Event('change'));
  editor.entity.value='h3-target';editor.entity.dispatchEvent(new Event('change'));
  const before=canvas.toDataURL();editor.radius.value='.7';editor.apply.click();
  assert(target().radius===.7&&pose()===savedPose,'H3 form edit failed or moved camera');
  const edited=json(model.document());
  assert(canvas.toDataURL()!==before,'H3 radius edit did not change image');
  const {pixels,distances}=renderer.read(model.state,41,31);let hits=0;
  for(let y=0;y<31;y++)for(let x=0;x<41;x++){
    const i=y*41+x;if(pixels[i*4]!==1)continue;
    const cpu=model.pixelSight(41,31,x,y,renderer.packed.maxDistance);
    assert(cpu.status==='hit'&&cpu.query.owner===renderer.packed.primitiveIds[pixels[i*4+2]-1]
      &&Math.abs(cpu.distance-distances[i])<.001,`Edited H3 GPU disagreement ${x},${y}`);hits++;
  }
  assert(hits>0,'H3 GPU check had no hits');draw();
  checks.push(`H3 radius form changes image, preserves pose; ${hits} GPU hits agree with CPU`);
  editor.undo.click();assert(json(model.document())===original&&target().radius===radius,'Undo failed');
  editor.redo.click();assert(json(model.document())===edited&&pose()===savedPose,'Redo failed');
  checks.push('H3 undo/redo restores document and preserves camera');
  let blob;const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
  try{
    URL.createObjectURL=b=>{blob=b;return create.call(URL,b);};
    HTMLAnchorElement.prototype.click=function(){};editor.download.click();
  }finally{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;}
  assert(blob,'Download handler produced no blob');const text=await blob.text();
  assert(json(JSON.parse(text))===edited,'Downloaded JSON differs');
  editor.undo.click();
  const files=new DataTransfer();files.items.add(new File([text],'three.nil.json',{type:'application/json'}));
  editor.load.files=files.files;editor.load.dispatchEvent(new Event('change'));await loadDone();
  assert(json(model.document())===edited&&pose()===savedPose,'File load failed or moved camera');
  checks.push('Real download/file-input round trip retains H3 edits and pose');
  editor.radius.value='1.1';editor.apply.click();
  assert(json(model.document())===edited&&pose()===savedPose&&/refused/i.test(editor.message.textContent),'Unsupported H3 radius not atomically refused');
  checks.push('Out-of-envelope H3 edit refused without changing live document or pose');
  // Move fully clear of the aperture before turning; rays have no player offset.
  for(let i=0;i<3;i++)model.advance(.04,[0,1,0]);
  model.advance(0,[0,0,0],{yaw:Math.PI,pitch:0});
  const back=['hyperbolic'];
  for(let i=0;i<400&&model.state.regionId!=='flat';i++){
    model.advance(.04,[0,1,0]);assert(!model.halted,'Return route halted');
    if(back.at(-1)!==model.state.regionId)back.push(model.state.regionId);
  }
  assert(back.join()==='hyperbolic,sphere,flat',`Return route ${back}`);
  draw();shots.push({name:'three-e3-return',data:canvas.toDataURL()});
  checks.push('Edited/reloaded scene returns H3 / full S3 / E3 by actual flight');
  return census;
}
