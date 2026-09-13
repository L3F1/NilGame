import {createConnectedGlobalPreview} from './connected-global-model.js';
import {createConnectedRenderer} from '../engine/geometry/connected-renderer.js';
import {createMouseLook} from './mouse-look.js';
import {createCameraFrame,rollAgainst} from '../engine/world/camera-frame.js';
const canvas=document.querySelector('#view'),status=document.querySelector('#status'),details=document.querySelector('#details');
const params=new URLSearchParams(location.search);
const checking=params.has('check'),threeGeometry=params.get('preset')==='three';
const checks=[],shots=[];
async function report(err='',extra={}){await fetch('/__report',{method:'POST',body:JSON.stringify({err,hud:status.textContent,checks,shots,...extra})});}
function failure(error){status.textContent=`Preview stopped: ${error.message||error}`;if(checking)report(String(error.stack||error));}
try {
  const response=await fetch(threeGeometry?'../levels/fixtures/connected-three-geometries-gallery.nil.json':'../levels/fixtures/connected-global.nil.json');if(!response.ok)throw Error(`Scene HTTP ${response.status}`);
  const scene=await response.json();
  // The model calls installWorld only for edits, never for its initial compile.
  let renderer;
  const model=createConnectedGlobalPreview(scene,{experimentalH3:threeGeometry,installWorld:nextWorld=>renderer.replaceWorld(nextWorld)}),coldStart=performance.now();
  renderer=createConnectedRenderer(canvas,model.world,{experimentalH3:threeGeometry});
  document.querySelector('#world-preset').value=threeGeometry?'three':'classic';
  document.querySelector('#open-preset').onclick=()=>{
    const url=new URL(location.href);url.searchParams.delete('check');
    url.searchParams.set('preset',document.querySelector('#world-preset').value);
    location.assign(url.href);
  };
  if(threeGeometry){
    document.title='NilGame - E3 / complete S3 / H3 editor';
    document.querySelector('h1').textContent='E3 / COMPLETE S3 / H3 editor';
    document.querySelector('#world-description').textContent='Experimental three-geometry world: flat E3 opens into complete S3 (radius 8), then bounded H3 (radius 8, chart extent 12). H3 supports balls of radius .25 to 1 and apertures .35 to 1. Unsupported edits are refused. The spherical region has no chart boundary.';
    document.querySelector('#route-description').textContent='Hold W from the flat spawn to enter S3, pass its antipode, and enter H3. Turn around after emerging to return through the same portal. Paired balls mark the sides of each opening; fly between them. Balls are solid landmarks, not portals. The flat return faces a destination ball. No gravity.';
  }
  // Four rays are affordable on the tested GPU, but not software fallback.
  // This is a starting preference, not a performance guarantee; keep the toggle.
  const defaultSmoothing=!/SwiftShader|llvmpipe|softpipe|software/i.test(renderer.hardware);
  document.querySelector('#smooth').checked=defaultSmoothing;
  // CPU comparisons use the renderer's own range; never a local default.
  const maxDistance=renderer.packed.maxDistance;
  if(!Number.isFinite(maxDistance)||maxDistance<=0)throw Error('Renderer packet lacks maxDistance');
  const mouse=createMouseLook(),keys=new Set();let playing=false,last=null;
  const dimensions=()=>{const width=Number(document.querySelector('#quality').value);return{width,height:width*3/4};};
  // Colour-only style; debug packets must not depend on it.
  const appearance=()=>({polished:document.querySelector('#polished').checked,ao:document.querySelector('#ao').checked});
  // Smooth edges averages four display samples; the diagnostics view always shows single centre rays.
  const smoothing=()=>document.querySelector('#smooth').checked&&!document.querySelector('#diagnostics').checked;
  function draw(){
    const refining=document.querySelector('#refine-spherical').checked;
    renderer.draw(model.state,{...dimensions(),...appearance(),antialias:smoothing(),sphericalMissPass:refining,aaRefinement:true,diagnostics:document.querySelector('#diagnostics').checked});
    const passStatus=renderer.missPass.status;
    document.querySelector('#refine-status').textContent=!refining
      ? 'Off. Resolves some uncertain edges; other purple pixels remain.'
      :passStatus==='antialias-refused'?'Paused: turn off Smooth edges to use spherical refinement.'
      :passStatus==='outside-scope'?'Waiting for a flat-region view through a spherical portal.'
      :passStatus==='resource-limit'?'Paused: refinement exceeds the memory or device limit. Choose a lower resolution (640 x 480 or below with Smooth edges).'
      :passStatus==='generated'?(smoothing()?'On with Smooth edges for eligible portal views. Other uncertain pixels remain purple.':'On for eligible portal views. Other uncertain pixels remain purple.')
      :`Unavailable (${passStatus}). The original rendering is still in use.`;
    status.textContent=model.status();
    const guide=model.renderGuide(),near=guide.nearest,aim=guide.aimed;
    document.querySelector('#portal-hint').textContent=[
      near?`Nearest: ${near.name}, ${near.distance.toFixed(2)} units by shortest path, ${near.side} side.`:'',
      aim?`Crosshair: ${aim.name} after ${aim.distance.toFixed(2)} units of forward travel. ${aim.bodyFits?'Body fits the aperture; destination checked on crossing.':'Too close to the rim for your body — aim nearer the centre.'}`:
        guide.solid?`Crosshair hits solid ${guide.solid}; green balls are landmarks, not portals.`:'No entering portal on the crosshair ray. Approach a portal from its front side.'
    ].join(' ');
    syncEditControls();
  }
  function stop(){playing=false;keys.clear();mouse.reset(false,performance.now());last=null;}
  document.querySelector('#controls').onclick=e=>{if(e.target.dataset.action){stop();document.exitPointerLock();
    try{model.act(e.target.dataset.action);draw();}catch(error){editor.message.textContent=`Placement refused: ${error.message||error}`;}}};
  canvas.onclick=()=>{if(!model.halted)canvas.requestPointerLock()?.catch(e=>{status.textContent=`Mouse capture failed: ${e.message}`;});};
  document.addEventListener('pointerlockchange',()=>{stop();playing=document.pointerLockElement===canvas;mouse.reset(playing,performance.now());});
  document.addEventListener('mousemove',e=>mouse.push(e.movementX,e.movementY,performance.now()));
  document.addEventListener('keydown',e=>{if(playing&&['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{stop();document.exitPointerLock();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();document.exitPointerLock();}});
  document.querySelector('#quality').onchange=draw;
  document.querySelector('#refine-spherical').onchange=draw;
  document.querySelector('#diagnostics').onchange=draw;
  document.querySelector('#polished').onchange=draw;
  document.querySelector('#ao').onchange=draw;
  document.querySelector('#smooth').onchange=draw;
  // Bounded entity editing. The model validates candidates and owns history; the page only builds
  // patches in each entity's own chart-local coordinates. No chart conversion happens here.
  const editor=Object.fromEntries(['region','entity','frame','x','y','z','radius','fx','fy','fz','ux','uy','uz',
    'apply','remove','undo','redo','download','load','message'].map(k=>[k,document.querySelector(`#edit-${k}`)]));
  const editable=typeof model.editEntities==='function',axes=['x','y','z'];
  // Only an anchor carries a construction frame; its forward/up are edited in that anchor's own
  // unchanged frame, never derived from the camera, a world up axis or the partner endpoint.
  const EDITABLE={ball:['position','radius'],anchor:['position','radius','orientation'],spawn:['position']};
  const forwardKeys=['fx','fy','fz'],upKeys=['ux','uy','uz'];
  let selectedFields=[],loading=Promise.resolve(),loadGeneration=0;
  // Ball creation/removal. The page never picks a chart or position for the author: a cover region
  // requires an explicit chart choice, and a flat region's ball carries no chartId at all.
  const ballForm=Object.fromEntries(['id','chart','x','y','z','radius','create'].map(k=>[k,document.querySelector(`#ball-${k}`)]));
  const creatable=editable&&typeof model.addBall==='function'&&typeof model.removeBall==='function';
  // Only additive balls; spawns, anchors and modifiers stay protected. The compiler refuses referenced balls.
  const removable=e=>e?.kind==='ball'&&(e.op===undefined||e.op==='add');
  let selectedEntity=null,pendingSelection=null,suggestedId='',creationRegion=null;
  // Portal pair creation and reconnection. Each endpoint owns its region, chart and construction frame;
  // the page never converts between charts, normalizes a frame, or invents a missing value.
  const endpointFields=['id','region','chart','x','y','z','fx','fy','fz','ux','uy','uz'];
  const endpointForm=end=>Object.fromEntries(endpointFields.map(k=>[k,document.querySelector(`#portal-${end}-${k}`)]));
  const portalForm={id:document.querySelector('#portal-id'),radius:document.querySelector('#portal-radius'),
    create:document.querySelector('#portal-create'),a:endpointForm('a'),b:endpointForm('b')};
  const reconnectForm={rows:document.querySelector('#reconnect-rows'),apply:document.querySelector('#reconnect-apply')};
  // Removal rows are built from the SAVED connections only; a reconnection draft never names them.
  const removeForm={rows:document.querySelector('#remove-rows')};
  const pairable=editable&&typeof model.addPortalPair==='function'&&typeof model.reconnectPortals==='function';
  const pairRemovable=editable&&typeof model.removePortalPair==='function';
  const portalSuggestions={id:'',a:'',b:''};
  const endpointRegion={a:null,b:null};
  const anchorRows=doc=>entityRows(doc).filter(r=>r.entity.kind==='anchor')
    .map(r=>({id:r.entity.id,label:`${r.entity.id} · ${r.frame} of ${r.regionId}`}));
  const connectionRows=doc=>[...doc.baseScene.connections.map(c=>({connection:c,owner:'base scene'})),
    ...(doc.connections||[]).map(c=>({connection:c,owner:'connected envelope'}))];
  const worldIds=doc=>new Set([doc.id,doc.baseScene.id,...doc.baseScene.regions.map(r=>r.id),...doc.baseScene.entities.map(e=>e.id),
    ...doc.baseScene.connections.map(c=>c.id),...(doc.coverRegions||[]).flatMap(r=>[r.id,...r.charts.map(c=>c.id),...r.entities.map(e=>e.id)]),...(doc.connections||[]).map(c=>c.id)]);
  const entityRows=doc=>[...doc.baseScene.entities.map(entity=>({regionId:entity.regionId,frame:`region ${entity.regionId}`,entity})),
    ...(doc.coverRegions||[]).flatMap(r=>r.entities.map(entity=>({regionId:r.id,frame:`chart ${entity.chartId}`,entity})))];
  const regionRows=doc=>[...doc.baseScene.regions.map(r=>({id:r.id,label:`${r.id} · ${r.geometry.kind} region`})),
    ...(doc.coverRegions||[]).map(r=>({id:r.id,label:`${r.id} · ${r.geometry.kind} cover · ${r.charts.length} charts`}))];
  // Every connection naming the anchor; apertures must stay equal, so radius edits resize all of them together.
  const portalPartners=(doc,id)=>[...new Set([...doc.baseScene.connections,...(doc.connections||[])]
    .flatMap(c=>c.a===id?[c.b]:c.b===id?[c.a]:[]).filter(other=>other!==id))];
  function setOptions(select,rows){
    const previous=select.value;
    select.replaceChildren(...rows.map(({id,label})=>new Option(label,id)));
    select.value=rows.some(r=>r.id===previous)?previous:rows[0]?.id??'';
  }
  function syncEditControls(){
    if(!editable)return;
    const halted=model.halted;
    editor.apply.disabled=halted||!selectedFields.length;
    editor.undo.disabled=halted||!model.canUndo;editor.redo.disabled=halted||!model.canRedo;
    editor.load.disabled=halted;
    ballForm.create.disabled=halted||!creatable;
    editor.remove.disabled=halted||!creatable||!removable(selectedEntity);
    portalForm.create.disabled=halted||!pairable;
    reconnectForm.apply.disabled=halted||!pairable||!reconnectForm.rows.querySelector('select');
    for(const button of removeForm.rows.querySelectorAll('button'))button.disabled=halted||!pairRemovable;
  }
  // Chart choices belong to the endpoint's own region; a bounded region carries no chart at all.
  function refreshEndpoint(end,form,doc=model.document()){
    const cover=(doc.coverRegions||[]).find(r=>r.id===form.region.value);
    setOptions(form.chart,cover?[{id:'',label:'Choose chart…'},...cover.charts.map(c=>({id:c.id,label:c.id}))]
      :[{id:'',label:'none (region coordinates)'}]);
    if(endpointRegion[end]!==form.region.value)form.chart.value='';
    endpointRegion[end]=form.region.value;
    form.chart.disabled=!cover;
  }
  // Rows mirror the saved graph; unapplied row choices are discarded when the document changes.
  function refreshReconnect(doc=model.document()){
    const anchors=anchorRows(doc);
    reconnectForm.rows.replaceChildren(...connectionRows(doc).map(({connection,owner})=>{
      const row=document.createElement('p'),name=document.createElement('span');
      name.textContent=`${connection.id} (${owner}) `;row.append(name);
      for(const end of ['a','b']){
        const select=document.createElement('select');
        select.id=`reconnect-${connection.id}-${end}`;
        select.dataset.connection=connection.id;select.dataset.end=end;
        select.replaceChildren(...anchors.map(({id,label})=>new Option(label,id)));
        select.value=connection[end];
        const wrap=document.createElement('label');wrap.append(`${end} `,select);row.append(wrap);
      }
      return row;
    }));
  }
  // One button per SAVED pair, naming the connection and the two endpoints the document records.
  // An empty list still renders, as its own sentence rather than a blank panel.
  function refreshRemovals(doc=model.document()){
    const rows=connectionRows(doc);
    if(!rows.length){
      const empty=document.createElement('p');
      empty.id='remove-empty';
      empty.textContent='No portal pairs in this world. Create one above to connect regions again.';
      removeForm.rows.replaceChildren(empty);
      return;
    }
    removeForm.rows.replaceChildren(...rows.map(({connection,owner})=>{
      const row=document.createElement('p'),button=document.createElement('button');
      button.type='button';button.id=`remove-portal-${connection.id}`;
      button.textContent=`Remove ${connection.id}: ${connection.a} ↔ ${connection.b}`;
      button.onclick=()=>editAction(()=>{
        // Re-read the saved record at click time; the rows above may hold unapplied choices.
        const saved=connectionRows(model.document()).find(r=>r.connection.id===connection.id)?.connection;
        if(!saved)throw Error(`Unknown connection ${connection.id}`);
        model.removePortalPair(saved.id);
        return `Removed portal ${saved.id} and its anchors ${saved.a} and ${saved.b}. You have not moved, and no route is promised: Undo, load a file or use a spawn.`;
      });
      row.append(button,` (${owner}) — deletes anchors ${connection.a} and ${connection.b}.`);
      return row;
    }));
  }
  // Rebuild selectors and fields from the model's current document.
  function refreshEditor(){
    const doc=model.document(),rows=entityRows(doc);
    setOptions(editor.region,regionRows(doc));
    setOptions(editor.entity,rows.filter(r=>r.regionId===editor.region.value).map(r=>({id:r.entity.id,label:`${r.entity.id} · ${r.entity.kind} · ${r.frame}`})));
    if(pendingSelection!==null&&[...editor.entity.options].some(o=>o.value===pendingSelection))editor.entity.value=pendingSelection;
    pendingSelection=null;
    const row=rows.find(r=>r.entity.id===editor.entity.value),e=row?.entity;
    selectedEntity=e||null;selectedFields=EDITABLE[e?.kind]||[];
    // Chart choices follow the selected region; the empty choice must be replaced explicitly.
    const cover=(doc.coverRegions||[]).find(r=>r.id===editor.region.value);
    setOptions(ballForm.chart,cover?[{id:'',label:'Choose chart…'},...cover.charts.map(c=>({id:c.id,label:c.id}))]:[{id:'',label:'none (region coordinates)'}]);
    if(creationRegion!==editor.region.value)ballForm.chart.value='';
    creationRegion=editor.region.value;
    ballForm.chart.disabled=!cover;
    // Replace the suggestion only if the author has not typed their own ID.
    const current=ballForm.id.value.trim();
    if(!current||current===suggestedId){const ids=worldIds(doc);let n=1;while(ids.has(`ball-${n}`))n++;suggestedId=`ball-${n}`;ballForm.id.value=suggestedId;}
    // Portal endpoints pick their own regions, so they never follow the entity selector.
    for(const end of ['a','b']){setOptions(portalForm[end].region,regionRows(doc));refreshEndpoint(end,portalForm[end],doc);}
    // Three user-visible IDs; each suggestion is replaced only while the author has not typed their own.
    {const ids=worldIds(doc);let n=1;
      while(['','-a','-b'].some(suffix=>ids.has(`portal-${n}${suffix}`)))n++;
      for(const [key,field] of [['id',portalForm.id],['a',portalForm.a.id],['b',portalForm.b.id]]){
        const current=field.value.trim(),fresh=`portal-${n}${key==='id'?'':`-${key}`}`;
        if(!current||current===portalSuggestions[key]){portalSuggestions[key]=fresh;field.value=fresh;}
      }}
    refreshReconnect(doc);
    refreshRemovals(doc);
    const position=selectedFields.includes('position'),radius=selectedFields.includes('radius');
    const orientation=selectedFields.includes('orientation');
    axes.forEach((k,i)=>{editor[k].disabled=!position;editor[k].value=position?String(e.position[i]):'';});
    editor.radius.disabled=!radius;editor.radius.value=radius?String(e.radius):'';
    // Components of the anchor's own construction frame, shown exactly as saved.
    for(const [keys,vectorKey] of [[forwardKeys,'forward'],[upKeys,'up']])
      keys.forEach((k,i)=>{editor[k].disabled=!orientation;editor[k].value=orientation?String(e[vectorKey]?.[i]??''):'';});
    editor.frame.textContent=!e?'No entities in this region.':
      `${e.id} (${e.kind}) in ${row.frame} of ${row.regionId}${e.forward?`; forward [${e.forward}], up [${e.up}] in that frame${orientation?', editable below (this anchor only)':' (read-only)'}`:''}${selectedFields.length?'':'; not editable here'}.`;
    syncEditControls();
  }
  function numberField(key,input=editor[key]){
    const text=input.value.trim(),value=Number(text);
    if(!text||!Number.isFinite(value))throw Error(`${key} must be a finite number`);
    return value;
  }
  // Explicit ownership and author coordinates; JSON property order is immaterial.
  function buildBall(){
    const doc=model.document(),regionId=editor.region.value,id=ballForm.id.value.trim();
    if(!regionId)throw Error('Select a region');
    if(!id)throw Error('Enter an ID for the new ball');
    const ball={id,regionId};
    if((doc.coverRegions||[]).some(r=>r.id===regionId)){
      if(!ballForm.chart.value)throw Error('Choose the chart the ball position is written in');
      ball.chartId=ballForm.chart.value;
    }
    ball.position=axes.map(k=>numberField(`ball ${k}`,ballForm[k]));
    ball.radius=numberField('ball radius',ballForm.radius);
    return ball;
  }
  // One endpoint of a new pair. chartId is omitted entirely for a bounded region, not sent empty.
  function buildEndpoint(end,form,doc){
    const regionId=form.region.value,id=form.id.value.trim();
    if(!regionId)throw Error(`Select a region for endpoint ${end.toUpperCase()}`);
    if(!id)throw Error(`Enter an ID for endpoint ${end.toUpperCase()}`);
    const endpoint={id,regionId};
    if((doc.coverRegions||[]).some(r=>r.id===regionId)){
      if(!form.chart.value)throw Error(`Choose the chart endpoint ${end.toUpperCase()} is written in`);
      endpoint.chartId=form.chart.value;
    }
    const read=(keys,label)=>keys.map((k,i)=>numberField(`endpoint ${end.toUpperCase()} ${label} ${axes[i]}`,form[k]));
    endpoint.position=read(axes,'position');
    // Author-frame components, passed through unchanged: no normalization, no ambient world up.
    endpoint.forward=read(['fx','fy','fz'],'forward');
    endpoint.up=read(['ux','uy','uz'],'up');
    return endpoint;
  }
  function buildPortalPair(){
    const doc=model.document(),id=portalForm.id.value.trim();
    if(!id)throw Error('Enter an ID for the new connection');
    return {id,radius:numberField('portal radius',portalForm.radius),
      a:buildEndpoint('a',portalForm.a,doc),b:buildEndpoint('b',portalForm.b,doc)};
  }
  // Every changed row travels in ONE batch so a swap never needs a valid intermediate graph.
  // Untouched rows are left out: rewriting a base connection would migrate its ownership.
  function buildReconnect(){
    const doc=model.document(),saved=new Map(connectionRows(doc).map(({connection})=>[connection.id,connection]));
    const edits=new Map();
    for(const select of reconnectForm.rows.querySelectorAll('select')){
      const edit=edits.get(select.dataset.connection)||{id:select.dataset.connection};
      edit[select.dataset.end]=select.value;edits.set(edit.id,edit);
    }
    const batch=[];
    for(const edit of edits.values()){
      if(!edit.a||!edit.b)throw Error(`Choose both endpoints for connection ${edit.id}`);
      const connection=saved.get(edit.id);
      if(!connection)throw Error(`Unknown connection ${edit.id}`);
      if(edit.a!==connection.a||edit.b!==connection.b)batch.push(edit);
    }
    return batch.length?batch:null;
  }
  // Only changed properties are patched; a paired radius goes into the same editEntities call.
  function buildEdits(){
    const doc=model.document(),row=entityRows(doc).find(r=>r.entity.id===editor.entity.value);
    if(!row)throw Error('Select an entity');
    const e=row.entity,fields=EDITABLE[e.kind]||[],patch={},edits=[{id:e.id,patch}];
    if(!fields.length)throw Error(`${e.kind} entities are not editable here`);
    if(fields.includes('position')){const p=axes.map(k=>numberField(k));if(p.some((v,i)=>v!==e.position[i]))patch.position=p;}
    if(fields.includes('radius')){
      const r=numberField('radius');
      if(r!==e.radius){patch.radius=r;if(e.kind==='anchor')for(const id of portalPartners(doc,e.id))edits.push({id,patch:{radius:r}});}
    }
    // Orientation travels as both vectors, verbatim, for THIS anchor only: apertures need not stay
    // parallel, so the partner is never rotated. Nothing here normalizes or repairs a bad frame.
    if(fields.includes('orientation')){
      const forward=forwardKeys.map((k,i)=>numberField(`forward ${axes[i]}`,editor[k]));
      const up=upKeys.map((k,i)=>numberField(`up ${axes[i]}`,editor[k]));
      if(forward.some((v,i)=>v!==e.forward?.[i])||up.some((v,i)=>v!==e.up?.[i])){patch.forward=forward;patch.up=up;}
    }
    return Object.keys(patch).length?edits:null;
  }
  // Validation errors go to the edit message only: no fatal failure and no redraw over the old image.
  function editAction(action,{fromLoad=false}={}){
    if(!fromLoad)loadGeneration++;
    stop();document.exitPointerLock();
    let done;
    try{done=action();}catch(error){editor.message.textContent=`Edit refused: ${error.message||error}`;syncEditControls();return false;}
    editor.message.textContent=done;refreshEditor();
    try{draw();}catch(error){failure(error);}
    return true;
  }
  if(!editable){document.querySelector('#editor').disabled=true;editor.message.textContent='Editing is unavailable: this model has no edit history.';}
  else {
    editor.region.onchange=editor.entity.onchange=()=>{editor.message.textContent='';refreshEditor();};
    editor.apply.onclick=()=>editAction(()=>{
      const edits=buildEdits();if(!edits)return 'No changes to apply.';
      model.editEntities(edits);return `Applied edit to ${edits.map(e=>e.id).join(' and ')}.`;
    });
    ballForm.create.onclick=()=>editAction(()=>{
      const ball=buildBall();model.addBall(ball);
      // Select the new entity and offer a fresh ID; failures above keep the author's input.
      pendingSelection=ball.id;ballForm.id.value='';
      return `Created ball ${ball.id} in ${ball.chartId?`chart ${ball.chartId} of `:'region '}${ball.regionId}.`;
    });
    // No confirmation: Undo restores the ball.
    editor.remove.onclick=()=>editAction(()=>{
      const e=entityRows(model.document()).find(r=>r.entity.id===editor.entity.value)?.entity;
      if(!removable(e))throw Error('Only added balls can be removed');
      model.removeBall(e.id);return `Removed ball ${e.id}. Undo restores it.`;
    });
    if(!creatable){document.querySelector('#ball-form').disabled=true;editor.message.textContent='Creating and removing balls is unavailable: this model lacks addBall/removeBall.';}
    for(const end of ['a','b'])portalForm[end].region.onchange=()=>{editor.message.textContent='';refreshEndpoint(end,portalForm[end]);};
    portalForm.create.onclick=()=>editAction(()=>{
      const pair=buildPortalPair();model.addPortalPair(pair);
      // Offer fresh IDs; a refused pair keeps everything the author typed.
      for(const field of [portalForm.id,portalForm.a.id,portalForm.b.id])field.value='';
      const where=e=>`${e.chartId?`chart ${e.chartId} of `:'region '}${e.regionId}`;
      return `Created portal ${pair.id}: ${pair.a.id} in ${where(pair.a)} and ${pair.b.id} in ${where(pair.b)}, aperture radius ${pair.radius}. Enter each end from its forward side, travelling toward −forward.`;
    });
    reconnectForm.apply.onclick=()=>editAction(()=>{
      const batch=buildReconnect();if(!batch)return 'No connection changes to apply.';
      model.reconnectPortals(batch);
      return `Reconnected ${batch.map(e=>`${e.id} (${e.a} ↔ ${e.b})`).join(', ')} in one transaction.`;
    });
    if(!pairable){for(const id of ['#portal-form','#reconnect-form'])document.querySelector(id).disabled=true;
      editor.message.textContent='Creating and reconnecting portals is unavailable: this model lacks addPortalPair/reconnectPortals.';}
    if(!pairRemovable){document.querySelector('#remove-form').disabled=true;
      editor.message.textContent='Removing portal pairs is unavailable: this model lacks removePortalPair.';}
    editor.undo.onclick=()=>editAction(()=>{model.undoEdit();return 'Undid the last edit.';});
    editor.redo.onclick=()=>editAction(()=>{model.redoEdit();return 'Redid the edit.';});
    editor.download.onclick=()=>{
      const doc=model.document(),url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`${doc.id||'connected-global'}.nil.json`;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);editor.message.textContent=`Downloaded ${link.download}.`;
    };
    editor.load.onchange=()=>{
      const generation=++loadGeneration;
      const file=editor.load.files[0];stop();document.exitPointerLock();
      loading=(file?file.text():Promise.resolve(null))
        .then(text=>{if(generation===loadGeneration&&text!==null)editAction(()=>{model.loadDocument(JSON.parse(text));return `Loaded ${file.name}.`;},{fromLoad:true});},
          error=>{if(generation===loadGeneration)editor.message.textContent=`Edit refused: could not read file (${error.message||error})`;})
        .finally(()=>{if(generation===loadGeneration)editor.load.value='';});
    };
    refreshEditor();
  }
  const wish=()=>[Number(keys.has('KeyD'))-Number(keys.has('KeyA')),Number(keys.has('KeyW'))-Number(keys.has('KeyS')),Number(keys.has('Space'))-Number(keys.has('ShiftLeft')||keys.has('ShiftRight'))];
  function frame(time){try{
    const dt=last===null?0:Math.min(.04,(time-last)/1000);last=time;
    if(playing){model.advance(dt,wish(),mouse.drain());draw();if(model.halted){stop();document.exitPointerLock();}}
    requestAnimationFrame(frame);
  }catch(e){stop();failure(e);}}
  draw();
  if(checking)renderer.finish();
  const coldReadyWallMs=performance.now()-coldStart;
  if(!checking)requestAnimationFrame(frame);
  else if(threeGeometry){
    const {checkThreeGeometryEditor}=await import('./three-geometry-editor-probe.js');
    const {checkPortalTransferGpu}=await import('./portal-transfer-gpu-probe.js');
    const transfer=checkPortalTransferGpu(model.document());
    const {checkAdditiveOrderGpu}=await import('./additive-event-gpu-probe.js');
    const {checkE3BallLineGpu}=await import('./e3-ball-line-probe.js');
    const e3Line=await checkE3BallLineGpu();
    checks.push('E3 closest-approach roots: independent packed surface brackets and legacy mutation');
    const ordering=checkAdditiveOrderGpu();
    checks.push('GPU interval event ordering: strict order, overlaps, horizons and negative mutation');
    checks.push('Candidate GPU portal transfer: interval enclosure and missing-transport mutation');
    const census=await checkThreeGeometryEditor({model,renderer,canvas,editor,draw,checks,shots,loadDone:()=>loading});
    const {checkSphericalMissExperiment}=await import('./spherical-miss-experiment.js');
    const exclusion=await checkSphericalMissExperiment(census);
    const {checkRefinementEnclosure}=await import('./refinement-enclosure-probe.js');
    const {captureTransferEnclosureBands}=await import('./refinement-transfer-capture.js');
    const enclosure=await checkRefinementEnclosure(captureTransferEnclosureBands(census));
    checks.push('Standalone enclosure export/member prototype: exact dyadic references and unsafe-shortcut mutations');
    // Live opt-in exclusion pass, through the ACTUAL renderer: the same pose is
    // drawn with the pass off and on. The baseline is preserved -- the off pass
    // is the existing path, and anything other than an unresolved pixel turning
    // into a certified answer is a failure, not an improvement.
    const livePass=await (async()=>{
      const width=160,height=120,state={...model.state,regionId:census.pose.regionId,
        position:census.pose.position,camera:{forward:census.pose.forward,right:census.pose.right,up:census.pose.up}};
      const quantiles=values=>{const v=[...values].sort((a,b)=>a-b);
        return v.length?{samples:v.length,p50:v[Math.floor(v.length*.5)],max:v.at(-1)}:null;};
      const frameCost=async options=>{
        const width=320,height=240; // Default playable viewport, independent of the160x120 census.
        renderer.draw(state,{width,height,...options});renderer.finish();
        await new Promise(resolve=>setTimeout(resolve,20));
        const wall=[];renderer.times.length=0;
        for(let i=0;i<12;i++){const t=performance.now();
          renderer.draw(state,{width,height,timer:true,...options});renderer.finish();wall.push(performance.now()-t);
          await new Promise(resolve=>setTimeout(resolve,20));}
        // Drain the submitted samples before changing timing cases. Otherwise
        // slow baseline results can be attributed to the following opt-in case.
        const deadline=performance.now()+2000;
        do{
          await new Promise(resolve=>setTimeout(resolve,20));
          renderer.draw(state,{width,height,...options});
        }while(renderer.times.length<12&&performance.now()<deadline);
        if(renderer.timerSupported&&renderer.times.length!==12)
          throw Error(`Live frame timing incomplete: ${renderer.times.length}/12; cannot compare cases`);
        return {width,height,drawFinishCallMs:quantiles(wall),gpuMs:quantiles(renderer.times),
          gpuStatus:!renderer.timerSupported?'unsupported':renderer.times.length?'measured':'unavailable'};
      };
      // Diagnostic-only captures: every channel is a SEPARATE invocation. Keep
      // both shader sources unchanged while isolating the intermittent drift.
      const captureDrift=async(index,reason)=>{
        const rows=[];
        for(let k=0;k<8;k++){
          const sphericalMissPass=!!(k%2),options={sphericalMissPass};
          const packet=renderer.read(state,width,height,options);
          const primary=renderer.readPrimaryRays(state,width,height,options).map(v=>v[index]);
          const debug=renderer.readMissPass(state,width,height,{...options,certificatePixel:index});
          const joint=renderer.readE3RayDistance(state,width,height,options);
          const jointRayDistance=joint.status==='read'?[...joint.values.slice(4*index,4*index+4)]:joint.status;
          rows.push({jointRayDistance,sphericalMissPass,status:[...packet.pixels.slice(4*index,4*index+4)],
            distance:packet.distances[index],primary,finalActive:debug.bytes[4*index],
            cumulativeOmissions:debug.bytes[4*index+1],debugStatus:debug.bytes[4*index+2],
            passStatus:debug.status,candidate: sphericalMissPass?debug.candidates.sample:null});
        }
        const {CONNECTED_FRAGMENT}=await import('../engine/geometry/connected-shader.js');
        const {SPHERICAL_MISS_PASS_FRAGMENT}=await import('../engine/geometry/spherical-miss-pass-glsl.js');
        const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
        return {reason,pixel:[index%width,Math.floor(index/width)],width,height,range:maxDistance,
          state,hardware:renderer.hardware,revision:renderer.missPass.revision,
          mainShader:await hash(CONNECTED_FRAGMENT),passShader:await hash(SPHERICAL_MISS_PASS_FRAGMENT),
          packedWorld:await hash(JSON.stringify(Array.from(renderer.packed.texture))),
          sequence:'before160 -> timing320 -> baselineAgain160 -> refined160 -> timing320 (unless baseline failed) -> eight alternating160 reads; packet(debug1,2,3), primary(debug4..7), evidence(debug8)',
          separateInvocations:true,jointScope:'Each jointRayDistance is xyz primary plus traced distance from ONE additional debug11 invocation; E3 primary w is zero. It does not reconstruct preceding debug2.',rows};
      };
      const before=renderer.read(state,width,height);
      const beforeShot=(renderer.draw(state,{width,height}),canvas.toDataURL());
      const baselineCost=await frameCost({});
      const baselineAgain=renderer.read(state,width,height);
      for(let i=0;i<width*height;i++)if(before.pixels[4*i]!==2&&before.distances[i]!==baselineAgain.distances[i]){
        const capture=await captureDrift(i,'baseline-drift');
        const primaryAgain=renderer.readPrimaryRays(state,width,height);
        throw Error(`Unrefined baseline drift after resize/timing at ${i%width},${Math.floor(i/width)}: distance ${before.distances[i]} -> ${baselineAgain.distances[i]}, repeated primary ${primaryAgain.map(v=>v[i])}; capture ${JSON.stringify(capture)}`);
      }
      checks.push('Unrefined settled distances remain identical after the320x240 timing/resize sequence');
      const after=renderer.read(state,width,height,{sphericalMissPass:true});
      const evidence=renderer.readMissPass(state,width,height);
      renderer.draw(state,{width,height,sphericalMissPass:true});
      const afterShot=canvas.toDataURL();
      const passCost=await frameCost({sphericalMissPass:true});
      const record={label:'live-miss-pass',regionId:state.regionId,width,height,range:maxDistance,
        status:renderer.missPass.status,supported:renderer.missPass.supported,
        counters:renderer.missPass.stats,certificatePixels:evidence.candidates,
        acceptedPixels:evidence.accepted,certificateOmissions:evidence.omissions,
        recoveredPixels:0,cpuDisagreements:0,changedStatus:0,baselineCost,passCost};
      record.driftCapture=await captureDrift(43*width+6,'standing-witness');
      for(let i=0;i<width*height;i++){
        const was=before.pixels.slice(4*i,4*i+4),now=after.pixels.slice(4*i,4*i+4);
        if(was.every((v,k)=>v===now[k])&&before.distances[i]===after.distances[i])continue;
        record.changedStatus++;
        if(was[0]!==2){
          const primary=options=>renderer.readPrimaryRays(state,width,height,options).map(values=>values[i]);
          const off=primary({sphericalMissPass:false}),on=primary({sphericalMissPass:true});
          const repeatedOff=renderer.read(state,width,height).distances[i];
          throw Error(`Live miss pass changed a settled pixel ${i%width},${Math.floor(i/width)}: ${[...was]} -> ${[...now]}, distance ${before.distances[i]} -> ${after.distances[i]}, repeated off ${repeatedOff}, primary ${off} -> ${on}; capture ${JSON.stringify(record.driftCapture)}`);
        }
        if(now[0]===2)continue;
        record.recoveredPixels++;
        // A recovered pixel must agree with the independent CPU query.
        const cpu=model.pixelSight(width,height,i%width,Math.floor(i/width),maxDistance,state);
        const region=renderer.packed.ids[now[1]-1],owner=renderer.packed.primitiveIds[now[2]-1];
        if(now[0]===1&&(cpu.status!=='hit'||cpu.regionId!==region||cpu.query.owner!==owner
          ||Math.abs(after.distances[i]-cpu.distance)>.001)
          ||now[0]===0&&cpu.status!=='miss'){
          record.cpuDisagreements++;
          throw Error(`Live miss pass disagrees with CPU at ${i%width},${Math.floor(i/width)}: GPU ${[...now]} ${region}/${owner}, CPU ${cpu.status}/${cpu.reason}/${cpu.query?.owner}`);
        }
      }
      if(record.status==='generated'&&record.recoveredPixels===0)
        throw Error('Live gallery miss pass recovered no fringe pixels; this is not an exercised acceptance');
      shots.push({name:'live-miss-pass-off',data:beforeShot},{name:'live-miss-pass-on',data:afterShot});
      checks.push(`live exclusion pass ${record.status} (${record.certificatePixels.certified}/${width*height} certified pixels, ${record.acceptedPixels} accepted, ${record.certificateOmissions} omissions): ${record.recoveredPixels} previously unresolved pixels resolved, ${record.cpuDisagreements} CPU disagreements, no settled pixel changed; frame cost ${JSON.stringify(record.baselineCost.gpuMs)} -> ${JSON.stringify(record.passCost.gpuMs)} (${record.passCost.gpuStatus})`);
      return record;
    })();
    const {checkAARefinement}=await import('./aa-refinement-probe.js');
    const aaRefinement=await checkAARefinement({model,renderer,canvas,shots,state:{...model.state,regionId:census.pose.regionId,position:census.pose.position,camera:{forward:census.pose.forward,right:census.pose.right,up:census.pose.up}}});
    checks.push('AA refinement atlas: independent supersampled reference, consumption and centre-debug parity');
    const {checkRefinementMotion}=await import('./refinement-motion-probe.js');
    const motion=await checkRefinementMotion(model,renderer);
    checks.push('Refinement motion: E3/S3/H3 round trip, strict settled parity; GPU timing status '+motion.arms.map(a=>a.timingStatus).join('/'));
    await report('',{connectedGlobalEvidence:[{label:'three-geometry-editor',hardware:renderer.hardware,coldReadyWallMs},transfer,e3Line,ordering,census,exclusion,enclosure,livePass,aaRefinement,motion]});
  } else {
    const records=[],poses=[];
    if(!/no gravity/i.test(document.body.textContent)||!/COMPLETE S3/.test(document.body.textContent))throw Error('Page lost its complete-S3/no-gravity label');
    function compare(label){
      const width=80,height=60,state=model.state,{pixels,distances,normals}=renderer.read(state,width,height);
      const record={label,regionId:state.regionId,position:[...state.position],maxDistance,cpuHits:0,gpuHits:0,cpuMisses:0,cpuUnresolved:0,extraUnresolved:0,boundaryPixels:0,worst:0,worstNormal:0,owners:{}};
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*width+x,cpu=model.pixelSight(width,height,x,y,maxDistance,state);
        const gpu=pixels[4*i],region=renderer.packed.ids[pixels[4*i+1]-1],owner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
        if(cpu.status==='hit'){record.cpuHits++;record.owners[cpu.query.owner]=(record.owners[cpu.query.owner]||0)+1;}
        else if(cpu.status==='miss')record.cpuMisses++;else record.cpuUnresolved++;
        if(gpu===2&&pixels[4*i+3]===1){
          record.boundaryPixels++;
          if(cpu.status!=='unresolved'||cpu.reason!=='domain-exit'||cpu.regionId!==region)throw Error(`${label}: boundary display concealed ${cpu.status}/${cpu.reason}/${cpu.regionId}`);
        }
        if(gpu===1){
          record.gpuHits++;
          if(cpu.status!=='hit'||region!==cpu.regionId||owner!==cpu.query.owner)throw Error(`${label} ${x},${y}: GPU hit ${region}/${owner}, CPU ${cpu.status}/${cpu.reason}/${cpu.regionId}/${cpu.query?.owner}`);
          const error=Math.abs(distances[i]-cpu.distance);record.worst=Math.max(record.worst,error);
          if(error>.001)throw Error(`${label} ${x},${y} ${region}/${owner}: GPU ${distances[i]}, CPU ${cpu.distance}, error ${error}`);
          if(cpu.query.normal){const normalError=Math.hypot(...cpu.query.normal.map((v,k)=>v-(normals[4*i+k]/255*2-1)));record.worstNormal=Math.max(record.worstNormal,normalError);if(normalError>.015)throw Error(`${label} ${x},${y}: normal error ${normalError}`);}
        }else if(gpu===0&&cpu.status!=='miss')throw Error(`${label} ${x},${y}: GPU miss, CPU ${cpu.status}/${cpu.reason}`);
        else if(gpu===2&&cpu.status==='hit')record.extraUnresolved++;
        else if(gpu>2)throw Error(`${label}: invalid GPU status ${gpu}`);
      }
      if(record.cpuHits&&record.gpuHits<record.cpuHits*.95)throw Error(`${label}: too many GPU refusals (${record.gpuHits}/${record.cpuHits} hits)`);
      // Empty-sphere views can be all misses; record that rather than claiming parity evidence.
      record.vacuous=record.cpuHits===0;
      records.push(record);
      checks.push(`${label} (${state.regionId}): CPU/GPU status, region, owner, distance and normal over 80x60 (${record.gpuHits}/${record.cpuHits} hits${record.vacuous?'; NO CPU HITS — vacuous view':''})`);
      poses.push({label,state});draw();shots.push({name:label,data:canvas.toDataURL()});
    }
    // One pixel straight through BOTH portals to the far target.
    model.act('spawn-flat');
    {
      const state=model.state,cpu=model.pixelSight(1,1,0,0,maxDistance,state),gpu=renderer.read(state,1,1);
      if(cpu.status!=='hit'||cpu.query.owner!=='flat-target'||cpu.crossings.length!==2)throw Error(`CPU straight sight ${cpu.status}/${cpu.query?.owner}/${cpu.crossings.length}`);
      const owner=renderer.packed.primitiveIds[gpu.pixels[2]-1],region=renderer.packed.ids[gpu.pixels[1]-1];
      if(gpu.pixels[0]!==1||owner!=='flat-target'||region!=='flat')throw Error(`GPU straight sight ${[...gpu.pixels]} (${region}/${owner})`);
      if(Math.abs(gpu.distances[0]-cpu.distance)>.001)throw Error(`Straight sight distance GPU ${gpu.distances[0]}, CPU ${cpu.distance}`);
      records.push({label:'straight-two-portals',cpu:cpu.distance,gpu:gpu.distances[0]});
      checks.push(`one-pixel sight through both portals hits flat-target at ${cpu.distance.toFixed(4)} (range ${maxDistance})`);
    }
    compare('spawn');
    // Actual real-time model advance flat -> complete S3 -> flat; poses are captured on the way.
    const visited=['flat'];let quarter=false,antipode=false,frames=0;
    for(;frames<3000;frames++){
      model.advance(1/60,[0,1,0]);
      if(model.halted)throw Error(`Flight halted at frame ${frames}: ${model.motion}`);
      const s=model.state;if(s.regionId!==visited.at(-1))visited.push(s.regionId);
      if(s.regionId==='sphere'){
        if(!model.status().includes('COMPLETE S3'))throw Error('Status does not say COMPLETE S3');
        if(!quarter&&s.position[3]<=0){quarter=true;compare('quarter');}
        if(!antipode&&s.position[3]<-.999){antipode=true;compare('antipode');}
      }
      if(visited.length===3&&s.position[1]>.5)break;
    }
    if(visited.join()!=='flat,sphere,flat'||!quarter||!antipode)throw Error(`Route ${visited} quarter ${quarter} antipode ${antipode}`);
    checks.push(`${frames} real-time advance frames flat/sphere/flat through quarter and antipode`);
    compare('return');
    {
      // Appearance at the flat return pose: flat-target is in direct view.
      if(typeof renderer.readColor!=='function')throw Error('Renderer lacks readColor(state,width,height,{polished,ao}); appearance checks pending lead renderer');
      const polishedBox=document.querySelector('#polished'),aoBox=document.querySelector('#ao');
      if(!polishedBox.checked||!aoBox.checked)throw Error('Polished lighting and AO must start checked');
      // Clicking fires the real change handlers, which redraw the canvas.
      const setAppearance=(polished,ao)=>{if(polishedBox.checked!==polished)polishedBox.click();if(aoBox.checked!==ao)aoBox.click();};
      const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
      const packets=(r,state,width,height,options)=>{const {pixels,distances,normals}=r.read(state,width,height,options);return [pixels,new Uint8Array(distances.buffer,distances.byteOffset,distances.byteLength),normals];};
      const color=(r,state,width,height,options)=>{
        const c=r.readColor(state,width,height,options);
        if(!(c instanceof Uint8Array)||c.length!==width*height*4)throw Error(`readColor returned ${c?.constructor?.name}/${c?.length}, expected Uint8Array RGBA ${width}x${height}`);
        return c;
      };
      const state=model.state,W=80,H=60,reference=packets(renderer,state,W,H);
      for(const [polished,ao] of [[false,true],[false,false],[true,false],[true,true]]){
        setAppearance(polished,ao);
        for(const options of [undefined,appearance()]){
          const got=packets(renderer,state,W,H,options);
          if(!got.every((p,k)=>same(p,reference[k])))throw Error(`Debug packets changed after toggling to polished=${polished} ao=${ao} (${options?'explicit':'default'} read options)`);
        }
      }
      checks.push('identical status/region/owner, distance and normal packets across polished/AO toggles (80x60)');
      const hit=i=>reference[0][4*i]===1;
      const basic=color(renderer,state,W,H,{polished:false,ao:false}),polishedColor=color(renderer,state,W,H,{polished:true,ao:false});
      if(!same(basic,color(renderer,state,W,H,{polished:false,ao:false})))throw Error('readColor is not repeatable');
      let hits=0,styled=0,aoBrightened=0;
      const withAO=color(renderer,state,W,H,{polished:true,ao:true});
      for(let i=0;i<W*H;i++){
        if(!hit(i))continue;hits++;
        if(Math.max(...[0,1,2].map(k=>Math.abs(basic[4*i+k]-polishedColor[4*i+k])))>=12)styled++;
        if([0,1,2].some(k=>withAO[4*i+k]>polishedColor[4*i+k]))aoBrightened++;
      }
      if(!hits)throw Error('Appearance pose has no GPU hits');
      if(styled<hits*.1)throw Error(`Polished lighting is not visibly different: ${styled}/${hits} hit pixels changed by >=12/255`);
      if(aoBrightened){
        const examples=[];for(let i=0;i<W*H&&examples.length<4;i++)if(hit(i)&&[0,1,2].some(k=>withAO[4*i+k]>polishedColor[4*i+k]))examples.push({i,ao:[...withAO.slice(4*i,4*i+3)],off:[...polishedColor.slice(4*i,4*i+3)]});
        throw Error(`AO brightened ${aoBrightened}/${hits} hit pixels: ${JSON.stringify(examples)}`);
      }
      checks.push(`polished lighting visibly changes ${styled}/${hits} hit pixels; AO brightens none`);
      const shot=name=>{const data=canvas.toDataURL();shots.push({name,data});return data;};
      setAppearance(false,false);const basicShot=shot('appearance-basic');
      setAppearance(true,false);shot('appearance-polished-noao');
      setAppearance(true,true);const polishedShot=shot('appearance-polished');
      if(basicShot===polishedShot)throw Error('Checkbox toggles did not change the drawn canvas');
      records.push({label:'appearance',pose:'return',hits,styled,aoBrightened});

      // Test-only clone: an E3 floor just under flat-target gives AO a contact to find.
      const floorScene=structuredClone(scene),target=floorScene.baseScene.entities.find(e=>e.id==='flat-target');
      if(target?.regionId!=='flat'||target.position[2]!==0||target.radius!==.6)throw Error('AO fixture expects flat-target at z=0 with radius .6');
      floorScene.baseScene.entities.push({id:'ao-floor',regionId:'flat',kind:'plane',position:[0,0,-.65],up:[0,0,1]});
      const floorModel=createConnectedGlobalPreview(floorScene),floorCanvas=document.createElement('canvas'),floorRenderer=createConnectedRenderer(floorCanvas,floorModel.world);
      if(renderer.packed.primitiveIds.includes('ao-floor')||model.world.renderData().primitives.some(p=>p.id==='ao-floor'))throw Error('AO floor leaked into the main fixture');
      const FW=160,FH=120,floorPackets=packets(floorRenderer,state,FW,FH,{polished:true,ao:true});
      for(const options of [undefined,{polished:true,ao:false},{polished:false,ao:false},{polished:false,ao:true}])
        if(!packets(floorRenderer,state,FW,FH,options).every((p,k)=>same(p,floorPackets[k])))throw Error(`Floor debug packets depend on appearance ${JSON.stringify(options)}`);
      const fp=floorPackets[0],floorMax=floorRenderer.packed.maxDistance,ownerAt=i=>floorRenderer.packed.primitiveIds[fp[4*i+2]-1];
      const floorOwners={},floorDistances=new Float32Array(floorPackets[1].buffer,floorPackets[1].byteOffset,FW*FH);
      for(let i=0;i<FW*FH;i++)if(fp[4*i]===1)floorOwners[ownerAt(i)]=(floorOwners[ownerAt(i)]||0)+1;
      if(!floorOwners['ao-floor']||!floorOwners['flat-target'])throw Error(`AO fixture view lacks floor or target: ${JSON.stringify(floorOwners)}`);
      // Sparse CPU spot check that the clone renders the intended geometry.
      for(let y=0;y<FH;y+=6)for(let x=0;x<FW;x+=6){
        const i=y*FW+x;if(fp[4*i]!==1)continue;
        const cpu=floorModel.pixelSight(FW,FH,x,y,floorMax,state);
        if(cpu.status!=='hit'||cpu.query.owner!==ownerAt(i)||Math.abs(floorDistances[i]-cpu.distance)>.001)
          throw Error(`AO fixture ${x},${y}: GPU ${ownerAt(i)}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
      }
      const floorAO=color(floorRenderer,state,FW,FH,{polished:true,ao:true}),floorNoAO=color(floorRenderer,state,FW,FH,{polished:true,ao:false});
      const luma=(c,i)=>.2126*c[4*i]+.7152*c[4*i+1]+.0722*c[4*i+2];
      let floorHits=0,darkened=0,brightened=0;const darkenedOwners={};
      for(let i=0;i<FW*FH;i++){
        if(fp[4*i]!==1)continue;floorHits++;
        if([0,1,2].some(k=>floorAO[4*i+k]>floorNoAO[4*i+k]))brightened++;
        if(luma(floorNoAO,i)-luma(floorAO,i)>=6){darkened++;darkenedOwners[ownerAt(i)]=(darkenedOwners[ownerAt(i)]||0)+1;}
      }
      if(brightened)throw Error(`AO brightened ${brightened}/${floorHits} floor-fixture hit pixels`);
      if(darkened<16)throw Error(`AO darkened only ${darkened}/${floorHits} floor-fixture hit pixels by >=6/255 luma (need 16)`);
      checks.push(`AO floor fixture (160x120): ${darkened}/${floorHits} hit pixels darkened, none brightened ${JSON.stringify(darkenedOwners)}`);
      for(const [name,options] of [['ao-floor-basic',{polished:false,ao:false}],['ao-floor-polished-noao',{polished:true,ao:false}],['ao-floor-polished',{polished:true,ao:true}]]){
        floorRenderer.draw(state,{width:320,height:240,...options});shots.push({name,data:floorCanvas.toDataURL()});
      }
      records.push({label:'ao-floor',pose:'return',owners:floorOwners,floorHits,darkened,darkenedOwners,brightened});

      // Smooth edges at the return pose (flat-target silhouette in view): four quarter-pixel samples,
      // averaged as sqrt(mean(c^2)); any numerical refusal keeps the display pixel magenta.
      const smoothBox=document.querySelector('#smooth'),diagnosticsBox=document.querySelector('#diagnostics');
      if(smoothBox.checked!==defaultSmoothing)throw Error('Smooth edges default does not match the renderer policy');
      if(diagnosticsBox.checked)throw Error('Unresolved-ray highlight must start unchecked');
      const setSmooth=on=>{if(smoothBox.checked!==on)smoothBox.click();};
      for(const samplePose of poses.filter(p=>['spawn','quarter','return'].includes(p.label))){
      const state=samplePose.state;
      const SW=320,SH=240,centrePackets=packets(renderer,state,SW,SH);
      for(const on of [false,true]){
        setSmooth(on);
        for(const options of [undefined,{antialias:false},{antialias:true},{...appearance(),antialias:on},{antialias:true,diagnostics:true}])
          if(!packets(renderer,state,SW,SH,options).every((p,k)=>same(p,centrePackets[k])))throw Error(`Debug packets depend on smoothing: checkbox ${on}, options ${JSON.stringify(options)}`);
      }
      checks.push(`identical status/region/owner, distance and normal packets with antialias false/true and Smooth edges toggled (${SW}x${SH})`);
      // Independent same-pose reference: a separate renderer at 2x resolution, centre rays only.
      // High-resolution pixel (2x+dx,2y+dy) has exactly the ray of low-resolution sample (x+.25+dx/2,y+.25+dy/2).
      const refRenderer=createConnectedRenderer(document.createElement('canvas'),model.world),highStatus=refRenderer.read(state,2*SW,2*SH).pixels;
      const smoothRecord={label:'smooth-edges',pose:samplePose.label,width:SW,height:SH,reference:`${2*SW}x${2*SH} centre rays`,styles:[]};
      for(const style of [{polished:true,ao:true},{polished:false,ao:false}]){
        const high=color(refRenderer,state,2*SW,2*SH,{...style,antialias:false});
        const centre=color(renderer,state,SW,SH,{...style,antialias:false}),smooth=color(renderer,state,SW,SH,{...style,antialias:true});
        if(!same(centre,color(renderer,state,SW,SH,style)))throw Error(`readColor antialias must default to false ${JSON.stringify(style)}`);
        if(!same(smooth,color(renderer,state,SW,SH,{...style,antialias:true})))throw Error('Smoothed readColor is not repeatable');
        let eligible=0,worst=0,changed=0,magenta=0;
        for(let y=0;y<SH;y++)for(let x=0;x<SW;x++){
          const i=y*SW+x,samples=[0,1].flatMap(dy=>[0,1].map(dx=>(2*y+dy)*2*SW+2*x+dx));
          if(Math.max(...[0,1,2].map(k=>Math.abs(smooth[4*i+k]-centre[4*i+k])))>=12)changed++;
          // Refusal kind 1 is the domain boundary pattern, which may average; every other refusal is numerical.
          const unresolved=samples.find(j=>highStatus[4*j]===2&&highStatus[4*j+3]!==1);
          if(unresolved!==undefined){
            magenta++;
            if([0,1,2].some(k=>Math.abs(smooth[4*i+k]-high[4*unresolved+k])>2))throw Error(`Smooth edges ${x},${y}: numerical refusal averaged to ${[...smooth.slice(4*i,4*i+3)]}, expected uncertainty colour ${[...high.slice(4*unresolved,4*unresolved+3)]}`);
            continue;
          }
          if(!samples.every(j=>highStatus[4*j]===1))continue;
          eligible++;
          for(let k=0;k<3;k++){
            const expected=255*Math.sqrt(samples.reduce((sum,j)=>sum+(high[4*j+k]/255)**2,0)/4),error=Math.abs(smooth[4*i+k]-expected);
            worst=Math.max(worst,error);
            if(error>2)throw Error(`Smooth edges ${x},${y} channel ${k} ${JSON.stringify(style)}: got ${smooth[4*i+k]}, 2x reference sqrt(mean(c^2)) ${expected.toFixed(2)} from ${samples.map(j=>high[4*j+k])}`);
          }
        }
        if(eligible<256)throw Error(`Smooth edges reference has only ${eligible} pixels whose four 2x rays all hit (need 256)`);
        if(changed<32)throw Error(`Smooth edges visibly change only ${changed} pixels by >=12/255 vs centre sampling (need 32); antialias ignored?`);
        smoothRecord.styles.push({...style,eligible,worst,changed,magenta});
        checks.push(`Smooth edges ${JSON.stringify(style)}: ${eligible} all-hit pixels match 2x sqrt(mean(c^2)) within ${worst.toFixed(2)}/255; ${changed} pixels visibly differ from centre sampling; ${magenta} numerical-refusal pixels stay magenta`);
      }
      records.push(smoothRecord);
      }
      // Same view, before/after, through the real checkbox handlers.
      setSmooth(false);const smoothOff=shot('smooth-edges-off');
      setSmooth(true);const smoothOn=shot('smooth-edges-on');
      if(smoothOff===smoothOn)throw Error('Smooth edges checkbox did not change the drawn canvas');
      diagnosticsBox.click();const diagnosticSmooth=canvas.toDataURL();
      setSmooth(false);const diagnosticCentre=canvas.toDataURL();
      setSmooth(true);diagnosticsBox.click();
      if(diagnosticSmooth!==diagnosticCentre)throw Error('Unresolved-ray highlight changed with Smooth edges; it must use centre rays');
      checks.push('Smooth edges checkbox changes the display; unresolved-ray highlight is identical with it on or off');
      draw();
    }
    model.act('spawn-sphere');model.advance(0,[0,0,0],{yaw:.6,pitch:.3});
    for(let i=0;i<30;i++){model.advance(.04,[.4,1,.3]);if(model.halted)throw Error(`Noncentral flight halted: ${model.motion}`);}
    model.advance(0,[0,0,0],{yaw:-1.1,pitch:-.2});
    const p=model.state.position;if(!(Math.hypot(p[1],p[2])*8>.5))throw Error('Noncentral pose stayed on the route plane');
    compare('noncentral-turned');
    for(let i=0;i<600;i++)model.advance(0,[0,0,0],{yaw:.04*Math.cos(i/15),pitch:.04*Math.sin(i/15)});
    if(Math.abs(rollAgainst(model.state.camera,model.referenceUp))>1e-9)throw Error('Mouse loops rolled against carried up');
    checks.push('no roll after 600 look updates in complete S3');
    document.querySelector('[data-action="approach-exit"]').click();
    if(model.renderGuide().aimed?.id!=='sphere-exit'||!model.renderGuide().aimed.bodyFits)throw Error('Exit approach guide is wrong');
    draw();shots.push({name:'exit-approach',data:canvas.toDataURL()});
    for(let i=0;i<45&&model.state.regionId==='sphere';i++)model.advance(1/60,[0,1,0]);
    if(model.halted||model.state.regionId!=='flat')throw Error('Second exit approach did not cross');
    checks.push('explicit second-exit approach crosses via real-time controls');
    for(const region of ['sphere','flat']){
      model.act(`spawn-${region}`);model.look({yaw:-.5});
      let limits=0;
      for(let i=0;i<160;i++){
        model.advance(.016,[0,1,0]);
        if(model.motion.includes('budget-exhausted'))limits++;
        if(model.halted)throw Error(`${region} contact halted: ${model.motion}`);
      }
      if(!limits)throw Error(`${region} contact did not exercise work limit`);
      const from=[...model.state.position],space=model.world.regions.get(region).space;
      for(let i=0;i<20;i++)model.advance(.016,[0,-1,0]);
      if(model.halted||space.distance(from,model.state.position)<.5)throw Error(`${region} retreat failed`);
      if(Math.abs(rollAgainst(model.state.camera,model.referenceUp))>1e-9)throw Error('Contact recovery rolled camera');
      draw();checks.push(`${region} contact and retreat without reset, bounded recovery and upright camera`);
    }
    for(const pose of poses){
      renderer.times.length=0;const timings=[],intervals=[];let previous;
      for(let i=0;i<90;i++){const timestamp=await new Promise(requestAnimationFrame);if(i>=15&&previous!==undefined)intervals.push(timestamp-previous);previous=timestamp;const t=performance.now();renderer.draw(pose.state,{...dimensions(),...appearance(),timer:i>=15});if(i>=15)timings.push(performance.now()-t);}
      for(let i=0;i<4;i++){await new Promise(requestAnimationFrame);renderer.draw(pose.state,{...dimensions(),...appearance()});}
      records.push({pose:pose.label,hardware:renderer.hardware,resolution:dimensions(),gpuTimerSupported:renderer.timerSupported,gpuMs:[...renderer.times],cpuSubmitMs:timings,presentIntervalsMs:intervals});
    }
    {
      // Centre vs smoothed display timed separately (never pooled) at one pose and resolution.
      for(const pose of poses.filter(p=>['spawn','quarter','return'].includes(p.label))){
      const resolution=dimensions();
      const smoothTiming={label:'smooth-edges-timing',pose:pose.label,hardware:renderer.hardware,resolution,gpuTimerSupported:renderer.timerSupported};
      for(const antialias of [false,true]){
        const options={...resolution,...appearance(),antialias},nextFrame=()=>new Promise(requestAnimationFrame),cpuSubmitMs=[];
        // Warm-up also drains late query results from the previous mode before the buffer is cleared.
        for(let i=0;i<15;i++){await nextFrame();renderer.draw(pose.state,options);}
        renderer.times.length=0;
        for(let i=0;i<75;i++){await nextFrame();const t=performance.now();renderer.draw(pose.state,{...options,timer:true});cpuSubmitMs.push(performance.now()-t);}
        for(let i=0;i<10;i++){await nextFrame();renderer.draw(pose.state,options);}
        smoothTiming[antialias?'antialiasTrue':'antialiasFalse']={gpuMs:[...renderer.times],cpuSubmitMs};
      }
      records.push(smoothTiming);
      }
    }
    {
      // Bounded editing through the real form controls. Needs the lead model history API and renderer.replaceWorld.
      if(!editable||typeof renderer.replaceWorld!=='function')throw Error('Edit checks pending lead integration: model.editEntities and renderer.replaceWorld are required');
      const $=s=>document.querySelector(s);
      const canon=value=>JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
      const pose=()=>{const s=model.state;return canon({regionId:s.regionId,position:s.position,forward:s.camera.forward,up:s.camera.up,right:s.camera.right,referenceUp:model.referenceUp,halted:model.halted});};
      const entity=id=>entityRows(model.document()).find(r=>r.entity.id===id)?.entity;
      const pick=(select,value)=>{if(![...select.options].some(o=>o.value===value))throw Error(`#${select.id} has no option ${value}`);select.value=value;select.dispatchEvent(new Event('change'));};
      const choose=(regionId,id)=>{pick(editor.region,regionId);pick(editor.entity,id);};
      const type=(key,value)=>{editor[key].value=String(value);editor[key].dispatchEvent(new Event('input'));};
      const refused=()=>/^Edit refused/.test(editor.message.textContent);
      const accepted=label=>{if(refused())throw Error(`${label} refused: ${editor.message.textContent}`);};
      const expectButtons=label=>{if(editor.undo.disabled!==!model.canUndo||editor.redo.disabled!==!model.canRedo)throw Error(`${label}: Undo/Redo buttons do not reflect canUndo/canRedo`);};
      const expectFields=(label,id)=>{
        const e=entity(id);
        if(editor.entity.value!==id||axes.some((k,i)=>Number(editor[k].value)!==e.position[i])||e.radius!==undefined&&Number(editor.radius.value)!==e.radius)
          throw Error(`${label}: form does not show the current document for ${id}`);
      };
      const snapshot=()=>({doc:canon(model.document()),undo:model.canUndo,redo:model.canRedo,undoButton:editor.undo.disabled,redoButton:editor.redo.disabled,pose:pose(),image:canvas.toDataURL(),world:model.world,status:status.textContent});
      const expectUnchanged=(label,before)=>{
        if(!refused())throw Error(`${label}: no refusal in the edit message`);
        if(/Preview stopped/.test(status.textContent))throw Error(`${label}: reported as a fatal failure`);
        const after=snapshot();for(const k of Object.keys(before))if(after[k]!==before[k])throw Error(`${label} changed ${k}`);
      };
      const images=()=>{const color=renderer.readColor(model.state,80,60);draw();return color;};
      const spotCheck=(label,state=model.state,owners={})=>{
        const W=80,H=60,max=renderer.packed.maxDistance,{pixels,distances}=renderer.read(state,W,H);let hits=0;
        for(let y=0;y<H;y+=4)for(let x=0;x<W;x+=4){
          const i=y*W+x;if(pixels[4*i]!==1)continue;
          const cpu=model.pixelSight(W,H,x,y,max,state),owner=renderer.packed.primitiveIds[pixels[4*i+2]-1];
          if(cpu.status!=='hit'||cpu.query.owner!==owner||Math.abs(distances[i]-cpu.distance)>.001)throw Error(`${label} ${x},${y}: GPU ${owner}/${distances[i]}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
          hits++;owners[owner]=(owners[owner]||0)+1;
        }
        draw();if(!hits)throw Error(`${label}: no sampled GPU hits`);return hits;
      };
      // The page's own download handler, with the object URL captured and the browser download suppressed.
      const download=async()=>{
        const blobs=[],names=[],createURL=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;
        URL.createObjectURL=blob=>{blobs.push(blob);return createURL.call(URL,blob);};
        HTMLAnchorElement.prototype.click=function(){names.push(this.download);};
        try{editor.download.click();}finally{URL.createObjectURL=createURL;HTMLAnchorElement.prototype.click=click;}
        if(blobs.length!==1||names.length!==1||!/\.json$/.test(names[0]))throw Error(`Download produced ${blobs.length} blobs named ${names}`);
        return blobs[0].text();
      };
      // The page's own file-input handler, fed a real File.
      const load=async(text,name)=>{
        const files=new DataTransfer();files.items.add(new File([text],name,{type:'application/json'}));
        editor.load.files=files.files;editor.load.dispatchEvent(new Event('change'));await loading;
      };
      const editRecord={label:'editing'};
      if(model.canUndo||model.canRedo||!editor.undo.disabled||!editor.redo.disabled)throw Error('Edit history must start empty with Undo/Redo disabled');
      const originalText=await download(),doc0=canon(model.document());
      if(canon(JSON.parse(originalText))!==doc0)throw Error('Downloaded original JSON differs from model.document()');

      // S3 ball radius edit at a pose that shows the landmark.
      $('[data-action="spawn-sphere"]').click();
      const landmarkPixels=()=>{const {pixels}=renderer.read(model.state,80,60);let n=0;for(let i=0;i<80*60;i++)if(pixels[4*i]===1&&renderer.packed.primitiveIds[pixels[4*i+2]-1]==='north-landmark')n++;return n;};
      const findLandmark=()=>{for(const pitch of [0,-.4,.8]){model.look({pitch});for(let i=0;i<42;i++){if(landmarkPixels()>=20)return true;model.look({yaw:.15});}}return false;};
      if(!findLandmark())throw Error('No sphere pose shows north-landmark');
      draw();
      const pose0=pose(),world0=model.world,image0=canvas.toDataURL(),color0=images();
      choose('sphere','north-landmark');
      const label=editor.entity.selectedOptions[0].textContent;
      if(!/ball/.test(label)||!/north-chart/.test(label))throw Error(`Entity option lacks kind or chart: ${label}`);
      if(editor.x.disabled||editor.radius.disabled)throw Error('Ball position/radius fields are disabled');
      expectFields('select north-landmark','north-landmark');
      if(entity('north-landmark').radius!==.6)throw Error('Edit fixture expects north-landmark radius .6');
      type('radius',.75);editor.apply.click();accepted('S3 radius edit');
      const doc1=canon(model.document()),expected=JSON.parse(doc0);
      expected.coverRegions.find(r=>r.id==='sphere').entities.find(e=>e.id==='north-landmark').radius=.75;
      if(doc1!==canon(expected))throw Error('S3 radius edit did not change exactly north-landmark radius');
      if(model.world===world0)throw Error('model.world did not update after an edit');
      if(pose()!==pose0)throw Error('S3 radius edit moved the player or camera');
      const image1=canvas.toDataURL();if(image1===image0)throw Error('S3 radius edit did not change the drawn canvas');
      const color1=images();let changed=0;
      for(let i=0;i<80*60;i++)if([0,1,2].some(k=>color1[4*i+k]!==color0[4*i+k]))changed++;
      if(changed<8)throw Error(`S3 radius edit changed only ${changed} pixels`);
      editRecord.radiusChangedPixels=changed;editRecord.spotHits=spotCheck('after S3 radius edit');
      if(!model.canUndo||model.canRedo)throw Error('After edit: expected undo available, redo empty');
      expectButtons('after edit');expectFields('after edit','north-landmark');
      checks.push(`S3 north-landmark radius .6 -> .75 via form: ${changed}/4800 pixels changed, pose kept, sparse CPU/GPU agreement on the replaced world`);

      editor.undo.click();accepted('Undo');
      if(canon(model.document())!==doc0)throw Error('Undo did not restore the exact document');
      if(pose()!==pose0||canvas.toDataURL()!==image0)throw Error('Undo changed pose or did not restore the original image');
      if(model.canUndo||!model.canRedo)throw Error('After undo: expected redo only');
      expectButtons('after undo');expectFields('after undo','north-landmark');
      editor.redo.click();accepted('Redo');
      if(canon(model.document())!==doc1||pose()!==pose0||canvas.toDataURL()!==image1)throw Error('Redo did not restore the edited document, pose and image');
      expectButtons('after redo');expectFields('after redo','north-landmark');
      checks.push('Undo restores the exact document and image; Redo restores the edited document and image');

      // Save and reload.
      const savedText=await download();
      if(canon(JSON.parse(savedText))!==doc1)throw Error('Downloaded JSON differs from the edited document');
      if(canon(createConnectedGlobalPreview(JSON.parse(savedText)).document())!==doc1)throw Error('Fresh model load of saved JSON differs');
      editor.undo.click();accepted('Undo before load');
      await load(savedText,'edited.nil.json');accepted('File load');
      if(canon(model.document())!==doc1||pose()!==pose0||canvas.toDataURL()!==image1)throw Error('File load did not restore the saved document/image with pose kept');
      expectButtons('after load');expectFields('after load','north-landmark');
      {const before=snapshot();await load('{"format":','broken.json');expectUnchanged('malformed JSON file',before);}
      checks.push('Download JSON equals document(); fresh model and file-input load reproduce it exactly; malformed file refused without change');

      // Delayed file reads cannot overwrite a newer file choice or an applied edit.
      const fileText=File.prototype.text;let releaseSlow;
      File.prototype.text=function(){return this.name==='slow.nil.json'?new Promise(resolve=>{releaseSlow=resolve;}):fileText.call(this);};
      try{
        for(const newer of ['file','edit']){
          const staleLoad=load(originalText,'slow.nil.json');
          if(newer==='file')await load(savedText,'newer.nil.json');
          else{choose('sphere','north-landmark');type('radius',.72);editor.apply.click();accepted('edit during file read');}
          const kept=snapshot();releaseSlow(originalText);await staleLoad;
          const after=snapshot();for(const k of Object.keys(kept))if(after[k]!==kept[k])throw Error(`Late file overwrote newer ${newer}: ${k}`);
          if(newer==='edit'){editor.undo.click();accepted('undo concurrent edit');}
        }
      }finally{File.prototype.text=fileText;}
      checks.push('late file reads cannot overwrite a newer file selection or property edit');

      // Invalid radii: rejected by the model (negative) and by the GPU packet range (S3 angular radius > .1).
      for(const radius of [-.5,1.2]){
        choose('sphere','north-landmark');type('radius',radius);
        const before=snapshot();editor.apply.click();expectUnchanged(`invalid north-landmark radius ${radius}`,before);
      }
      if(editor.message===status||editor.message.getAttribute('role')!=='status')throw Error('Edit errors need their own role=status message');
      checks.push('invalid radii -0.5 and 1.2 refused in the edit message: document, history, pose, world and image unchanged');

      // Paired anchor radius: both ends in one editEntities call, restored by one undo.
      choose('flat','flat-entry');
      if(!/anchor/.test(editor.entity.selectedOptions[0].textContent)||editor.radius.disabled)throw Error('Anchor radius field unavailable');
      const pairedBefore=canon(model.document()),undoBefore=model.canUndo,calls=[],descriptor=Object.getOwnPropertyDescriptor(model,'editEntities');
      if(descriptor?.writable)model.editEntities=edits=>{calls.push(structuredClone(edits));return descriptor.value.call(model,edits);};
      try{type('radius',.7);editor.apply.click();}finally{if(descriptor?.writable)model.editEntities=descriptor.value;}
      accepted('Paired anchor radius');
      if(descriptor?.writable&&(calls.length!==1||calls[0].length!==2))throw Error(`Paired radius used ${calls.length} editEntities calls: ${JSON.stringify(calls)}`);
      const radii=['flat-entry','sphere-entry','flat-return','sphere-exit'].map(id=>entity(id).radius);
      if(canon(radii)!==canon([.7,.7,.9,.9]))throw Error(`Paired anchor radii ${radii}`);
      if(pose()!==pose0)throw Error('Paired anchor edit moved the player or camera');
      editor.undo.click();accepted('Paired undo');
      if(canon(model.document())!==pairedBefore||model.canUndo!==undoBefore)throw Error('One undo did not restore both anchor radii and prior history');
      checks.push(`flat-entry radius .9 -> .7 also resized sphere-entry in ${descriptor?.writable?'one observed':'one (unobserved)'} editEntities call; one undo restores both`);

      // Spawn position edit; spawn has no radius.
      choose('flat','flat-spawn');
      if(!editor.radius.disabled||editor.y.disabled)throw Error('Spawn fields must be x/y/z only');
      const spawnBefore=canon(model.document());type('y',-2.5);editor.apply.click();accepted('Spawn edit');
      if(canon(entity('flat-spawn').position)!==canon([0,-2.5,0]))throw Error('Spawn position edit failed');
      editor.undo.click();if(canon(model.document())!==spawnBefore)throw Error('Spawn undo differs');

      // Halt forbids edits until reset.
      $('[data-action="spawn-flat"]').click();
      for(let i=0;i<900&&!model.halted;i++)model.advance(1/60,[0,-1,0]);
      if(!model.halted)throw Error('Backward flight did not halt at the flat extent');
      draw();
      if(!editor.apply.disabled||!editor.undo.disabled||!editor.redo.disabled||!editor.load.disabled)throw Error('Edit controls must be disabled while halted');
      if(!ballForm.create.disabled||!portalForm.create.disabled||!reconnectForm.apply.disabled)throw Error('Creation controls must be disabled while halted');
      const removalButtons=()=>[...removeForm.rows.querySelectorAll('button')];
      if(!removalButtons().length||removalButtons().some(b=>!b.disabled))throw Error('Portal removal buttons must be disabled while halted');
      $('[data-action="reset"]').click();
      if(model.halted||editor.apply.disabled||portalForm.create.disabled||reconnectForm.apply.disabled)throw Error('Reset did not re-enable editing');
      if(removalButtons().some(b=>b.disabled))throw Error('Reset did not re-enable the portal removal buttons');
      expectButtons('after reset');
      checks.push('halt disables Apply/Undo/Redo/Load, Create ball, Create portal pair, Apply connections and every portal removal button until reset');

      // Ball creation/removal through the real form controls. Needs lead model.addBall/removeBall.
      if(!creatable)throw Error('Ball create/remove checks pending lead integration: model.addBall and model.removeBall are required');
      {
        const ballRecord={label:'ball-create-remove'};
        const fill=({id,chartId,position,radius})=>{
          ballForm.id.value=id;ballForm.id.dispatchEvent(new Event('input'));
          if(chartId!==undefined)pick(ballForm.chart,chartId);
          axes.forEach((k,i)=>{ballForm[k].value=String(position[i]);ballForm[k].dispatchEvent(new Event('input'));});
          ballForm.radius.value=String(radius);ballForm.radius.dispatchEvent(new Event('input'));
        };
        const refuse=(label,ball,pattern)=>{
          fill(ball);const before=snapshot();ballForm.create.click();expectUnchanged(label,before);
          if(pattern&&!pattern.test(editor.message.textContent))throw Error(`${label}: unexpected refusal ${editor.message.textContent}`);
        };
        // Observe exactly what the page hands the model, when the method is replaceable.
        const addCalls=[],addDescriptor=Object.getOwnPropertyDescriptor(model,'addBall');
        if(addDescriptor?.writable)model.addBall=ball=>{addCalls.push(structuredClone(ball));return addDescriptor.value.call(model,ball);};
        try{
          const textBefore=await download(),docBefore=canon(model.document()),idsBefore=[...renderer.packed.primitiveIds];

          // Protected kinds cannot be removed; additive balls can. Chart choices follow the region.
          for(const [regionId,id,allowed] of [['flat','flat-spawn',false],['flat','flat-entry',false],['flat','flat-return',false],['flat','flat-target',true],
            ['sphere','sphere-spawn',false],['sphere','sphere-entry',false],['sphere','sphere-exit',false],['sphere','north-landmark',true]]){
            choose(regionId,id);
            if(editor.remove.disabled===allowed)throw Error(`Remove button for ${id} should be ${allowed?'enabled':'disabled'}`);
            const charts=[...ballForm.chart.options].map(o=>o.value);
            if(regionId==='flat'?!ballForm.chart.disabled||canon(charts)!==canon(['']):ballForm.chart.disabled||canon(charts)!==canon(['','north-chart','exit-chart','south-chart']))
              throw Error(`Chart choices for ${regionId}: ${charts} disabled=${ballForm.chart.disabled}`);
          }
          if(worldIds(model.document()).has(ballForm.id.value)||!/^[a-z][a-z0-9_-]*$/.test(ballForm.id.value))throw Error(`Suggested ball ID ${ballForm.id.value} is not a fresh valid ID`);
          checks.push('Remove disabled for spawns/anchors, enabled for additive balls; chart choices refresh with region; suggested ID is unique');

          // Base E3 creation never serializes chartId.
          $('[data-action="spawn-flat"]').click();choose('flat','flat-target');
          const flatBall={id:'flat-authored',position:[-3,3,0],radius:.5};
          fill(flatBall);ballForm.create.click();accepted('E3 ball creation');
          const flatEntity=entity('flat-authored');
          if(canon(flatEntity)!==canon({...flatBall,regionId:'flat',kind:'ball'})||'chartId' in flatEntity)throw Error(`E3 ball document entity ${JSON.stringify(flatEntity)}`);
          if(addDescriptor?.writable&&(addCalls.length!==1||'chartId' in addCalls[0]||canon(addCalls[0])!==canon({...flatBall,regionId:'flat'})))throw Error(`E3 addBall call ${JSON.stringify(addCalls)}`);
          if(/chartId/.test(JSON.stringify(JSON.parse(await download()).baseScene.entities.find(e=>e.id==='flat-authored'))))throw Error('Downloaded E3 ball has chartId');
          if(editor.region.value!=='flat'||editor.entity.value!=='flat-authored'||editor.remove.disabled)throw Error('New E3 ball is not selected/removable');
          if(ballForm.id.value==='flat-authored'||worldIds(model.document()).has(ballForm.id.value))throw Error('ID suggestion was not refreshed after creation');
          if(!renderer.packed.primitiveIds.includes('flat-authored'))throw Error('E3 ball missing from GPU packet');
          editor.undo.click();accepted('Undo E3 ball');
          if(canon(model.document())!==docBefore)throw Error('Undo of E3 ball did not restore the document');
          checks.push(`E3 ball created via form without chartId (${addDescriptor?.writable?'observed':'unobserved'} addBall call, document and download); undo removes it`);

          // A ball over the current body (away from every spawn) is refused with nothing changed.
          const spawnPoint=model.state.position.slice();
          for(let i=0;i<15;i++)model.advance(1/60,[0,1,0]);
          const body=model.state.position.slice();draw();
          if(model.halted||model.state.regionId!=='flat'||body.length!==3||Math.hypot(...body.map((v,i)=>v-spawnPoint[i]))<.5)throw Error(`Body-overlap pose unusable: ${model.state.regionId} ${body}`);
          choose('flat','flat-target');
          refuse('ball over current body',{id:'body-ball',position:body,radius:.2},/player clearance|overlap/i);

          // S3: invalid candidates are refused with document, history, pose, world and image unchanged.
          $('[data-action="spawn-sphere"]').click();
          if(!findLandmark())throw Error('No sphere pose shows north-landmark for ball checks');
          draw();choose('sphere','north-landmark');
          const valid={id:'authored-ball',chartId:'north-chart',position:[3,2,0],radius:.6};
          refuse('duplicate ball ID',{...valid,id:'north-landmark'});
          refuse('negative ball radius',{...valid,radius:-.5});
          refuse('ball radius beyond GPU range',{...valid,radius:1.2});
          refuse('ball without chart',{...valid,chartId:''},/chart/);
          refuse('ball without explicit position',{...valid,position:['',2,0]},/finite/);
          checks.push('duplicate ID, radii -0.5/1.2, missing chart, blank position and current-body overlap refused: document, history, pose, world and image unchanged');

          // Create the S3 ball; it is selected and present in document, world and GPU packet.
          const pose1=pose(),calls0=addCalls.length;
          fill(valid);ballForm.create.click();accepted('S3 ball creation');
          const docCreated=canon(model.document()),idsCreated=[...renderer.packed.primitiveIds];
          if(canon(entity('authored-ball'))!==canon({id:'authored-ball',kind:'ball',chartId:'north-chart',position:[3,2,0],radius:.6}))throw Error(`S3 ball entity ${JSON.stringify(entity('authored-ball'))}`);
          {const expected=JSON.parse(docCreated);const s=expected.coverRegions.find(r=>r.id==='sphere');s.entities=s.entities.filter(e=>e.id!=='authored-ball');
            if(canon(expected)!==docBefore)throw Error('S3 ball creation changed more than the new entity');}
          if(addDescriptor?.writable&&canon(addCalls.slice(calls0))!==canon([{id:'authored-ball',regionId:'sphere',chartId:'north-chart',position:[3,2,0],radius:.6}]))throw Error(`S3 addBall call ${JSON.stringify(addCalls.slice(calls0))}`);
          if(editor.region.value!=='sphere'||editor.entity.value!=='authored-ball'||editor.remove.disabled)throw Error('New S3 ball is not selected/removable');
          expectFields('after ball creation','authored-ball');
          if(pose()!==pose1||!model.canUndo||model.canRedo)throw Error('S3 ball creation moved the player or left wrong history');
          expectButtons('after ball creation');
          const worldBall=model.world.regions.get('sphere').balls.find(b=>b.id==='authored-ball');
          if(worldBall?.radius!==.6||!model.world.renderData().primitives.some(p=>p.id==='authored-ball'&&p.regionId==='sphere'))throw Error('S3 ball missing from world/render data');
          if(!idsCreated.includes('authored-ball')||idsCreated.length!==idsBefore.length+1)throw Error(`GPU packet ids after creation: ${idsCreated}`);
          ballRecord.ownerIndex={before:idsBefore,created:idsCreated};

          // Explicit pose 2.5 units from the new ball, on the side away from north-landmark, looking at its centre.
          const centre=worldBall.center.slice(),landmark=model.world.regions.get('sphere').balls.find(b=>b.id==='north-landmark').center.slice();
          const dot4=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
          const aim=()=>{
            const space=model.world.regions.get('sphere').space,theta=2.5/space.curvatureRadius;
            const away=unit(centre.map((x,i)=>dot4(centre,landmark)*x-landmark[i]));
            const p=unit(centre.map((x,i)=>Math.cos(theta)*x+Math.sin(theta)*away[i]));
            return {...model.state,regionId:'sphere',position:p,velocity:p.map(()=>0),camera:createCameraFrame(space,p,{forward:unit(centre.map((x,i)=>x-dot4(p,centre)*p[i])),up:[0,0,1,0]})};
          };
          const centreRay=(label,present)=>{
            const state=aim(),space=model.world.regions.get('sphere').space,max=renderer.packed.maxDistance;
            const cpu=model.pixelSight(1,1,0,0,max,state),gpu=renderer.read(state,1,1);
            const status=gpu.pixels[0],region=renderer.packed.ids[gpu.pixels[1]-1],owner=renderer.packed.primitiveIds[gpu.pixels[2]-1];
            const result={label,cpu:cpu.status,owner:cpu.query?.owner??null,cpuDistance:cpu.distance,gpuDistance:gpu.distances[0]};
            if(present){
              const expected=space.distance(state.position,centre)-.6;result.analytic=expected;
              if(Math.abs(expected-1.9)>1e-7||cpu.status!=='hit'||cpu.query.owner!=='authored-ball'||cpu.crossings.length||Math.abs(cpu.distance-expected)>1e-4)
                throw Error(`${label}: CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}, analytic ${expected}`);
            }else if(cpu.status==='hit'&&cpu.query.owner==='authored-ball')throw Error(`${label}: CPU still hits removed authored-ball`);
            if(cpu.status==='hit'){if(status!==1||owner!==cpu.query.owner||region!==cpu.regionId||Math.abs(gpu.distances[0]-cpu.distance)>.001)throw Error(`${label}: GPU ${status}/${region}/${owner}/${gpu.distances[0]}, CPU hit ${cpu.regionId}/${cpu.query.owner}/${cpu.distance}`);}
            else if(cpu.status==='miss'?status!==0:status!==2)throw Error(`${label}: GPU status ${status}, CPU ${cpu.status}/${cpu.reason}`);
            const owners={};result.spotHits=spotCheck(`${label} aimed view`,state,owners);result.owners=owners;
            if(!!owners['authored-ball']!==present)throw Error(`${label}: aimed view authored-ball pixels ${owners['authored-ball']||0}, expected ${present?'some':'none'}`);
            ballRecord[label]=result;return result;
          };
          const created=centreRay('created',true);
          renderer.draw(aim(),{...dimensions(),...appearance(),antialias:smoothing()});
          shots.push({name:'ball-created-aimed',data:canvas.toDataURL()});draw();
          ballRecord.createdSpotHits=spotCheck('after ball creation');
          // Removing an EARLIER primitive shifts the new ball's GPU owner index.
          const indexBefore=renderer.packed.primitiveIds.indexOf('authored-ball');
          choose('sphere','north-landmark');editor.remove.click();accepted('Remove earlier owner');
          if(renderer.packed.primitiveIds.indexOf('authored-ball')!==indexBefore-1)throw Error('Expected owner index shift');
          centreRay('shifted-owner',true);
          editor.undo.click();accepted('Restore earlier owner');
          if(canon(renderer.packed.primitiveIds)!==canon(idsCreated))throw Error('Undo failed to restore owner indices');
          choose('sphere','authored-ball');
          checks.push(`authored-ball in north-chart [3,2,0] r .6: centre ray CPU ${created.cpuDistance.toFixed(5)} vs analytic 1.9 vs GPU ${created.gpuDistance.toFixed(5)}; owner indices re-decoded after packet growth`);

          // Remove / undo / redo through the buttons, then save and reload both ways.
          const expectState=(label,doc,ids,present)=>{
            if(canon(model.document())!==doc)throw Error(`${label}: document differs`);
            if(canon(renderer.packed.primitiveIds)!==canon(ids))throw Error(`${label}: GPU packet ids ${renderer.packed.primitiveIds}`);
            if(pose()!==pose1)throw Error(`${label}: player or camera moved`);
            if([...editor.entity.options].some(o=>o.value==='authored-ball')!==present&&editor.region.value==='sphere')throw Error(`${label}: entity list disagrees`);
            expectButtons(label);centreRay(label,present);spotCheck(label);
          };
          editor.remove.click();accepted('Remove authored-ball');
          if(editor.entity.value==='authored-ball'||!model.canUndo||model.canRedo)throw Error('Removal left the ball selected or wrong history');
          expectState('removed',docBefore,idsBefore,false);
          editor.undo.click();accepted('Undo removal');expectState('undo-removal',docCreated,idsCreated,true);
          editor.redo.click();accepted('Redo removal');expectState('redo-removal',docBefore,idsBefore,false);
          editor.undo.click();accepted('Undo removal again');expectState('undo-removal-again',docCreated,idsCreated,true);
          const savedBall=await download();
          if(canon(JSON.parse(savedBall))!==docCreated)throw Error('Downloaded JSON lacks the created ball');
          editor.undo.click();accepted('Undo creation');expectState('undo-creation',docBefore,idsBefore,false);
          await load(savedBall,'ball.nil.json');accepted('Load with ball');expectState('load-with-ball',docCreated,idsCreated,true);
          await load(textBefore,'before-ball.nil.json');accepted('Load without ball');expectState('load-without-ball',docBefore,idsBefore,false);
          draw();shots.push({name:'ball-removed-reloaded',data:canvas.toDataURL()});
          checks.push('Remove/Undo/Redo and JSON download/load add and remove authored-ball exactly: document, GPU owner ids, centre ray and sparse CPU/GPU views agree; pose kept');
        }finally{if(addDescriptor?.writable)model.addBall=addDescriptor.value;}
        records.push(ballRecord);
      }

      // Portal pair creation and reconnection through the real form controls.
      if(!pairable)throw Error('Portal authoring checks pending lead integration: model.addPortalPair and model.reconnectPortals are required');
      {
        const portalRecord={label:'portal-authoring'};
        const fillEnd=(form,end)=>{
          form.id.value=end.id;form.id.dispatchEvent(new Event('input'));
          pick(form.region,end.regionId);
          if(end.chartId!==undefined)pick(form.chart,end.chartId);
          for(const [keys,values] of [[axes,end.position],[['fx','fy','fz'],end.forward],[['ux','uy','uz'],end.up]])
            keys.forEach((k,i)=>{form[k].value=String(values[i]);form[k].dispatchEvent(new Event('input'));});
        };
        const fillPair=spec=>{
          portalForm.id.value=spec.id;portalForm.id.dispatchEvent(new Event('input'));
          portalForm.radius.value=String(spec.radius);portalForm.radius.dispatchEvent(new Event('input'));
          fillEnd(portalForm.a,spec.a);fillEnd(portalForm.b,spec.b);
        };
        const refusePair=(label,spec,pattern)=>{
          fillPair(spec);const before=snapshot();portalForm.create.click();expectUnchanged(label,before);
          if(pattern&&!pattern.test(editor.message.textContent))throw Error(`${label}: unexpected refusal ${editor.message.textContent}`);
        };
        const row=(id,end)=>{const s=document.querySelector(`#reconnect-${id}-${end}`);if(!s)throw Error(`No reconnect row for ${id} ${end}`);return s;};
        const setRow=(id,end,value)=>{const s=row(id,end);if(![...s.options].some(o=>o.value===value))throw Error(`Row ${id}.${end} has no anchor ${value}`);s.value=value;};
        const links=()=>{const d=model.document();return [...d.baseScene.connections,...d.connections];};
        const link=id=>links().find(c=>c.id===id);
        const portalOf=fromId=>model.world.portals.find(p=>p.fromId===fromId);
        const wiring=()=>canon(model.world.portals.map(p=>[p.id,p.fromId,p.toId,p.fromRegionId,p.toRegionId,p.radius]));
        // The same endpoints the Node authoring test uses.
        const spec={id:'bench-nook',radius:.9,
          a:{id:'flat-bench',regionId:'flat',position:[6,0,0],forward:[0,-1,0],up:[0,0,1]},
          b:{id:'sphere-nook',regionId:'sphere',chartId:'exit-chart',position:[1,1,0],forward:[1,0,0],up:[0,0,1]}};
        // A pose three units in front of the new flat aperture, aimed at its centre along -forward.
        // The world is replaced by every edit, so the frame is always built from the CURRENT space.
        const benchPose=()=>{const p=[6,-3,0],space=model.world.regions.get('flat').space;
          return {...model.state,regionId:'flat',position:p,velocity:[0,0,0],camera:createCameraFrame(space,p,{forward:[0,1,0],up:[0,0,1]})};};
        const aperture=(label,present)=>{
          const state=benchPose(),W=80,H=60,max=renderer.packed.maxDistance;
          const axisCpu=model.pixelSight(1,1,0,0,max,state),axisGpu=renderer.read(state,1,1);
          const gpuStatus=axisGpu.pixels[0],region=renderer.packed.ids[axisGpu.pixels[1]-1],owner=renderer.packed.primitiveIds[axisGpu.pixels[2]-1];
          const axisCrossings=axisCpu.crossings.filter(c=>c.fromId==='flat-bench').length;
          if(present?!axisCrossings:axisCrossings)throw Error(`${label}: axis ray crosses flat-bench ${axisCrossings} times`);
          if(axisCpu.status==='hit'){
            if(gpuStatus!==1||owner!==axisCpu.query.owner||region!==axisCpu.regionId||Math.abs(axisGpu.distances[0]-axisCpu.distance)>.001)
              throw Error(`${label} axis: GPU ${gpuStatus}/${region}/${owner}/${axisGpu.distances[0]}, CPU hit ${axisCpu.regionId}/${axisCpu.query.owner}/${axisCpu.distance}`);
          }else if(axisCpu.status==='miss'?gpuStatus!==0:gpuStatus!==2)throw Error(`${label} axis: GPU status ${gpuStatus}, CPU ${axisCpu.status}/${axisCpu.reason}`);
          const {pixels,distances}=renderer.read(state,W,H);
          let sampled=0,gpuHits=0,crossings=0,crossedHits=0;const owners={};
          for(let y=0;y<H;y+=3)for(let x=0;x<W;x+=3){
            const i=y*W+x,cpu=model.pixelSight(W,H,x,y,max,state);sampled++;
            if(cpu.crossings.some(c=>c.fromId==='flat-bench'))crossings++;
            if(pixels[4*i]===1){
              if(cpu.crossings.some(c=>c.fromId==='flat-bench'))crossedHits++;
              gpuHits++;const o=renderer.packed.primitiveIds[pixels[4*i+2]-1];owners[o]=(owners[o]||0)+1;
              if(cpu.status!=='hit'||cpu.query.owner!==o||renderer.packed.ids[pixels[4*i+1]-1]!==cpu.regionId||Math.abs(distances[i]-cpu.distance)>.001)
                throw Error(`${label} ${x},${y}: GPU ${o}/${distances[i]}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
            }else if(pixels[4*i]===0&&cpu.status!=='miss')throw Error(`${label} ${x},${y}: GPU miss, CPU ${cpu.status}`);
          }
          if(present?!crossings:crossings)throw Error(`${label}: ${crossings} sampled rays cross flat-bench, expected ${present?'some':'none'}`);
          if(present&&!crossedHits)throw Error(`${label}: no GPU surface hit beyond the created aperture`);
          const result={label,sampled,gpuHits,crossings,crossedHits,owners,axis:{cpu:axisCpu.status,owner:axisCpu.query?.owner??null,
            cpuDistance:axisCpu.distance,gpuDistance:axisGpu.distances[0],gpuStatus,route:axisCpu.crossings.map(c=>c.fromId)}};
          portalRecord[label]=result;draw();return result;
        };
        $('[data-action="spawn-flat"]').click();draw();
        const poseBefore=pose(),docBefore=canon(model.document()),textBefore=await download(),wiringBefore=wiring();
        const undoBefore=model.canUndo,portalsBefore=model.world.portals.length;

        // Rows show the saved graph, over every anchor in the document.
        for(const c of links())for(const end of ['a','b']){
          if(row(c.id,end).value!==c[end])throw Error(`Reconnect row ${c.id}.${end} shows ${row(c.id,end).value}, document says ${c[end]}`);
          if(canon([...row(c.id,end).options].map(o=>o.value))!==canon(['flat-entry','flat-return','sphere-entry','sphere-exit']))
            throw Error(`Reconnect row ${c.id}.${end} anchor choices ${[...row(c.id,end).options].map(o=>o.value)}`);
        }
        aperture('before-creation',false);
        checks.push(`reconnect rows list ${links().map(c=>c.id)} with every anchor as a choice and the saved endpoints selected`);

        // Invalid or occupied candidates are refused with document, history, pose, world and image unchanged.
        refusePair('duplicate connection ID',{...spec,id:'enter-sphere'},/unique/);
        refusePair('duplicate endpoint ID',{...spec,a:{...spec.a,id:'flat-entry'}},/unique/);
        refusePair('negative aperture radius',{...spec,radius:-.9});
        refusePair('blank forward component',{...spec,a:{...spec.a,forward:['',-1,0]}},/finite/);
        refusePair('cover endpoint without a chart',{...spec,b:{...spec.b,chartId:''}},/chart/);
        refusePair('non-orthonormal construction frame',{...spec,b:{...spec.b,up:[1,0,0]}},/orthonormal/);
        {
          // Reconnecting onto an endpoint another pair still owns is refused, not stolen.
          setRow('enter-sphere','b','flat-return');
          const before=snapshot();reconnectForm.apply.click();expectUnchanged('reconnect onto an occupied endpoint',before);
          if(!/already connected/i.test(editor.message.textContent))throw Error(`Occupied endpoint refusal: ${editor.message.textContent}`);
          if(link('leave-sphere').b!=='flat-return')throw Error('Refused reconnection disturbed the owning pair');
          setRow('enter-sphere','b','sphere-entry');
          reconnectForm.apply.click();
          if(refused()||!/No connection changes/.test(editor.message.textContent))throw Error(`Unchanged rows: ${editor.message.textContent}`);
          if(model.canUndo!==undoBefore||canon(model.document())!==docBefore)throw Error('Unchanged rows created a history entry');
        }
        checks.push('duplicate connection/endpoint IDs, negative radius, blank forward component, missing chart, non-orthonormal frame and an occupied reconnection target refused: document, history, pose, world and image unchanged; unchanged rows apply nothing');

        const addCalls=[],addDescriptor=Object.getOwnPropertyDescriptor(model,'addPortalPair');
        const reconnectCalls=[],reconnectDescriptor=Object.getOwnPropertyDescriptor(model,'reconnectPortals');
        if(addDescriptor?.writable)model.addPortalPair=s=>{addCalls.push(structuredClone(s));return addDescriptor.value.call(model,s);};
        if(reconnectDescriptor?.writable)model.reconnectPortals=e=>{reconnectCalls.push(structuredClone(e));return reconnectDescriptor.value.call(model,e);};
        try{
          fillPair(spec);portalForm.create.click();accepted('portal pair creation');
          const docCreated=canon(model.document()),wiringCreated=wiring();
          const anchors={'flat-bench':{id:'flat-bench',kind:'anchor',regionId:'flat',position:[6,0,0],radius:.9,forward:[0,-1,0],up:[0,0,1]},
            'sphere-nook':{id:'sphere-nook',kind:'anchor',chartId:'exit-chart',position:[1,1,0],radius:.9,forward:[1,0,0],up:[0,0,1]}};
          for(const [id,expected] of Object.entries(anchors))if(canon(entity(id))!==canon(expected))throw Error(`Created anchor ${id}: ${JSON.stringify(entity(id))}`);
          if('chartId' in entity('flat-bench'))throw Error('Bounded endpoint serialized a chartId');
          if(addDescriptor?.writable&&(addCalls.length!==1||'chartId' in addCalls[0].a
            ||canon(addCalls[0])!==canon({id:'bench-nook',radius:.9,a:{id:'flat-bench',regionId:'flat',position:[6,0,0],forward:[0,-1,0],up:[0,0,1]},
              b:{id:'sphere-nook',regionId:'sphere',chartId:'exit-chart',position:[1,1,0],forward:[1,0,0],up:[0,0,1]}})))
            throw Error(`addPortalPair call ${JSON.stringify(addCalls)}`);
          if(model.document().baseScene.connections.some(c=>c.id==='bench-nook'))throw Error('New connection landed in the base scene');
          if(canon(link('bench-nook'))!==canon({id:'bench-nook',kind:'portal',a:'flat-bench',b:'sphere-nook',velocity:'preserve-speed',scale:1}))
            throw Error(`New connection record ${JSON.stringify(link('bench-nook'))}`);
          if(model.world.portals.length!==portalsBefore+2||portalOf('flat-bench').toId!=='sphere-nook'
            ||portalOf('sphere-nook').toRegionId!=='flat'||portalOf('flat-bench').radius!==.9)throw Error('New pair is not wired both ways in the world');
          {const expected=JSON.parse(docCreated);
            expected.baseScene.entities=expected.baseScene.entities.filter(e=>e.id!=='flat-bench');
            const s=expected.coverRegions.find(r=>r.id==='sphere');s.entities=s.entities.filter(e=>e.id!=='sphere-nook');
            expected.connections=expected.connections.filter(c=>c.id!=='bench-nook');
            if(canon(expected)!==docBefore)throw Error('Pair creation changed more than the two anchors and their connection');}
          if(pose()!==poseBefore||!model.canUndo||model.canRedo)throw Error('Pair creation moved the player or left wrong history');
          expectButtons('after pair creation');
          if(/chartId/.test(JSON.stringify(JSON.parse(await download()).baseScene.entities.find(e=>e.id==='flat-bench'))))throw Error('Downloaded bounded anchor has chartId');
          const ids=worldIds(model.document());
          for(const field of [portalForm.id,portalForm.a.id,portalForm.b.id])
            if(ids.has(field.value)||!/^[a-z][a-z0-9_-]*$/.test(field.value))throw Error(`Portal ID suggestion ${field.value} is not fresh and valid`);
          const created=aperture('created',true);
          renderer.draw(benchPose(),{...dimensions(),...appearance(),antialias:smoothing()});
          shots.push({name:'portal-pair-created',data:canvas.toDataURL()});draw();
          checks.push(`bench-nook created from one form: flat-bench (no chartId) and sphere-nook in exit-chart, radius .9, wired both ways; ${created.crossings}/${created.sampled} sampled rays cross the new aperture, axis ray ${created.axis.cpu} via ${created.axis.route} with CPU/GPU status, owner and distance agreeing on ${created.gpuHits} sampled GPU hits`);

          // One undo removes the whole pair; redo restores it.
          editor.undo.click();accepted('Undo pair creation');
          if(canon(model.document())!==docBefore||wiring()!==wiringBefore)throw Error('Undo did not remove the whole pair');
          if(entity('flat-bench')||entity('sphere-nook'))throw Error('Undo left an orphan anchor');
          aperture('after-undo',false);
          editor.redo.click();accepted('Redo pair creation');
          if(canon(model.document())!==docCreated||wiring()!==wiringCreated)throw Error('Redo did not restore the pair');
          aperture('after-redo',true);
          checks.push('one Undo removes both anchors and the connection (no ray crosses the aperture); Redo restores all three');

          // Final swap: both changed rows travel in one reconnect batch.
          const swapBefore=canon(model.document());
          setRow('enter-sphere','b','sphere-exit');setRow('leave-sphere','a','sphere-entry');
          const calls0=reconnectCalls.length;
          reconnectForm.apply.click();accepted('Endpoint swap');
          if(reconnectDescriptor?.writable&&canon(reconnectCalls.slice(calls0))!==canon([[{id:'enter-sphere',a:'flat-entry',b:'sphere-exit'},{id:'leave-sphere',a:'sphere-entry',b:'flat-return'}]]))
            throw Error(`Swap used ${reconnectCalls.length-calls0} reconnect calls: ${JSON.stringify(reconnectCalls.slice(calls0))}`);
          if(portalOf('flat-entry').toId!=='sphere-exit'||portalOf('sphere-entry').toId!=='flat-return')throw Error('Swap did not exchange the endpoints');
          if(canon(link('bench-nook'))!==canon({id:'bench-nook',kind:'portal',a:'flat-bench',b:'sphere-nook',velocity:'preserve-speed',scale:1}))throw Error('Swap disturbed the untouched pair');
          if(pose()!==poseBefore)throw Error('Swap moved the player or camera');
          const docSwapped=canon(model.document());
          for(const c of links())for(const end of ['a','b'])if(row(c.id,end).value!==c[end])throw Error(`Rows do not show the swapped graph for ${c.id}.${end}`);
          aperture('after-swap',true);
          renderer.draw(benchPose(),{...dimensions(),...appearance(),antialias:smoothing()});
          shots.push({name:'portal-swap',data:canvas.toDataURL()});draw();
          checks.push(`enter-sphere/leave-sphere endpoints exchanged in ${reconnectDescriptor?.writable?'one observed':'one (unobserved)'} reconnectPortals batch; bench-nook untouched; pose kept`);

          // Save, reload and undo the swap.
          const savedText=await download();
          if(canon(JSON.parse(savedText))!==docSwapped)throw Error('Downloaded JSON differs from the swapped document');
          if(canon(createConnectedGlobalPreview(JSON.parse(savedText)).document())!==docSwapped)throw Error('Fresh model load of the swapped JSON differs');
          editor.undo.click();accepted('Undo swap');
          if(canon(model.document())!==swapBefore||portalOf('flat-entry').toId!=='sphere-entry')throw Error('Undo did not restore the original connections');
          editor.redo.click();accepted('Redo swap');
          if(canon(model.document())!==docSwapped)throw Error('Redo did not restore the swap');
          await load(savedText,'portals.nil.json');accepted('Load swapped document');
          if(canon(model.document())!==docSwapped||pose()!==poseBefore)throw Error('File load did not reproduce the swapped document with the pose kept');
          aperture('reloaded',true);
          await load(textBefore,'before-portals.nil.json');accepted('Load document without the pair');
          if(canon(model.document())!==docBefore||wiring()!==wiringBefore)throw Error('Loading the earlier file did not remove the pair');
          aperture('reloaded-without-pair',false);
          checks.push('swapped document downloads, reloads in a fresh model and through the file input, and undo/redo restore both graphs exactly; reloading the earlier file removes the pair and its aperture');
        }finally{
          if(addDescriptor?.writable)model.addPortalPair=addDescriptor.value;
          if(reconnectDescriptor?.writable)model.reconnectPortals=reconnectDescriptor.value;
        }
        records.push(portalRecord);
      }

      // Portal pair removal and existing-anchor reorientation through the real controls.
      if(!pairRemovable)throw Error('Portal removal checks pending lead integration: model.removePortalPair is required');
      {
        const removalRecord={label:'portal-removal'};
        const links=()=>{const d=model.document();return [...d.baseScene.connections,...d.connections];};
        const link=id=>links().find(c=>c.id===id);
        const wiring=()=>canon(model.world.portals.map(p=>[p.id,p.fromId,p.toId,p.fromRegionId,p.toRegionId,p.radius]));
        const portalOf=fromId=>model.world.portals.find(p=>p.fromId===fromId);
        const packetPortals=()=>renderer.packed.counts[3];
        const removeButton=id=>{const b=document.querySelector(`#remove-portal-${id}`);if(!b)throw Error(`No removal button for ${id}`);return b;};
        const removeButtons=()=>[...removeForm.rows.querySelectorAll('button')].map(b=>b.id);
        const label=c=>`Remove ${c.id}: ${c.a} ↔ ${c.b}`;
        const row=(id,end)=>{const s=document.querySelector(`#reconnect-${id}-${end}`);if(!s)throw Error(`No reconnect row for ${id} ${end}`);return s;};
        const setRow=(id,end,value)=>{const s=row(id,end);if(![...s.options].some(o=>o.value===value))throw Error(`Row ${id}.${end} has no anchor ${value}`);s.value=value;};
        const anchorsIn=doc=>entityRows(doc).filter(r=>r.entity.kind==='anchor').map(r=>r.entity.id).sort();
        // An explicit pose on an aperture's axis: `away` units in front of the anchor centre, looking at it.
        const probePose=(regionId,position,forward,up)=>{
          const space=model.world.regions.get(regionId).space;
          return {...model.state,regionId,position,velocity:position.map(()=>0),camera:createCameraFrame(space,position,{forward,up})};
        };
        // Axis ray plus a stride-3 grid: centre-route evidence only, never a whole-aperture proof.
        // `beyond` asks for a GPU surface hit through the aperture; it is only claimed where the
        // destination is known to hold one, never assumed for a rewired route.
        const probe=(name,state,fromId,present,beyond=present)=>{
          const W=80,H=60,max=renderer.packed.maxDistance;
          const axisCpu=model.pixelSight(1,1,0,0,max,state),axisGpu=renderer.read(state,1,1);
          const gpuStatus=axisGpu.pixels[0],region=renderer.packed.ids[axisGpu.pixels[1]-1],owner=renderer.packed.primitiveIds[axisGpu.pixels[2]-1];
          const axisCrossings=axisCpu.crossings.filter(c=>c.fromId===fromId).length;
          if(present?!axisCrossings:axisCrossings)throw Error(`${name}: axis ray crosses ${fromId} ${axisCrossings} times`);
          if(axisCpu.status==='hit'){
            if(gpuStatus!==1||owner!==axisCpu.query.owner||region!==axisCpu.regionId||Math.abs(axisGpu.distances[0]-axisCpu.distance)>.001)
              throw Error(`${name} axis: GPU ${gpuStatus}/${region}/${owner}/${axisGpu.distances[0]}, CPU hit ${axisCpu.regionId}/${axisCpu.query.owner}/${axisCpu.distance}`);
          }else if(axisCpu.status==='miss'?gpuStatus!==0:gpuStatus!==2)throw Error(`${name} axis: GPU status ${gpuStatus}, CPU ${axisCpu.status}/${axisCpu.reason}`);
          const {pixels,distances}=renderer.read(state,W,H);
          let sampled=0,gpuHits=0,crossings=0,crossedHits=0;const owners={};
          for(let y=0;y<H;y+=3)for(let x=0;x<W;x+=3){
            const i=y*W+x,cpu=model.pixelSight(W,H,x,y,max,state);sampled++;
            if(cpu.crossings.some(c=>c.fromId===fromId))crossings++;
            if(pixels[4*i]===1){
              if(cpu.crossings.some(c=>c.fromId===fromId))crossedHits++;
              gpuHits++;const o=renderer.packed.primitiveIds[pixels[4*i+2]-1];owners[o]=(owners[o]||0)+1;
              if(cpu.status!=='hit'||cpu.query.owner!==o||renderer.packed.ids[pixels[4*i+1]-1]!==cpu.regionId||Math.abs(distances[i]-cpu.distance)>.001)
                throw Error(`${name} ${x},${y}: GPU ${o}/${distances[i]}, CPU ${cpu.status}/${cpu.query?.owner}/${cpu.distance}`);
            }else if(pixels[4*i]===0&&cpu.status!=='miss')throw Error(`${name} ${x},${y}: GPU miss, CPU ${cpu.status}`);
          }
          if(present?!crossings:crossings)throw Error(`${name}: ${crossings} sampled rays cross ${fromId}, expected ${present?'some':'none'}`);
          if(beyond&&!crossedHits)throw Error(`${name}: no GPU surface hit beyond the ${fromId} aperture`);
          const result={name,fromId,sampled,gpuHits,crossings,crossedHits,owners,axis:{cpu:axisCpu.status,owner:axisCpu.query?.owner??null,
            cpuDistance:axisCpu.distance,gpuDistance:axisGpu.distances[0],gpuStatus,route:axisCpu.crossings.map(c=>c.fromId)}};
          removalRecord[name]=result;draw();return result;
        };
        // Saved images use the probe's own pose, not the unchanged player pose.
        const probeShot=(name,state)=>{renderer.draw(state,{...dimensions(),...appearance(),antialias:smoothing()});
          shots.push({name,data:canvas.toDataURL()});draw();};
        // Straight in front of flat-entry on its saved axis (enter travelling toward −forward).
        const entryPose=()=>probePose('flat',[0,-3,0],[0,1,0],[0,0,1]);

        $('[data-action="spawn-flat"]').click();draw();
        const poseBefore=pose(),docBefore=canon(model.document()),textBefore=await download(),wiringBefore=wiring();
        if(typeof packetPortals()!=='number')throw Error('GPU packet does not report a portal count');
        const portalsBefore=packetPortals(),anchorsBefore=anchorsIn(model.document());
        if(links().length!==2||model.world.portals.length!==4)throw Error(`Removal checks expect two saved pairs, found ${links().map(c=>c.id)}`);

        // Every saved pair gets exactly one button, naming the connection and both saved endpoints.
        for(const c of links())if(removeButton(c.id).textContent!==label(c))throw Error(`Removal button for ${c.id} reads ${removeButton(c.id).textContent}`);
        if(canon(removeButtons())!==canon(links().map(c=>`remove-portal-${c.id}`)))throw Error(`Removal buttons ${removeButtons()} for connections ${links().map(c=>c.id)}`);
        probe('before-removal',entryPose(),'flat-entry',true);
        checks.push(`removal buttons ${links().map(c=>label(c))} name the saved connection and both saved endpoints`);

        // Undo is still subject to the body/aperture check: removal is allowed, restoring under the body is not.
        removeButton('enter-sphere').click();accepted('Remove enter-sphere for the undo-safety check');
        for(let i=0;i<8;i++)document.querySelector('[data-action="forward"]').click();
        if(Math.abs(model.state.position[1])>1e-9||model.halted)throw Error(`Aperture walk ended at ${model.state.position}`);
        {
          const before=snapshot();editor.undo.click();expectUnchanged('Undo that would restore an aperture under the body',before);
          if(!model.canUndo)throw Error('Refused Undo dropped the history entry');
          if(!/aperture/i.test(editor.message.textContent))throw Error(`Aperture refusal text: ${editor.message.textContent}`);
        }
        document.querySelector('[data-action="back"]').click();
        editor.undo.click();accepted('Undo after stepping off the aperture');
        if(canon(model.document())!==docBefore||wiring()!==wiringBefore)throw Error('Undo did not restore the pair after stepping aside');
        checks.push('removal allowed while standing in the region; Undo refused (history kept) while the body is on the restored aperture, accepted one step back');

        // Removal reads the SAVED graph after a swap, never the unapplied rows above it.
        $('[data-action="spawn-flat"]').click();draw();
        setRow('enter-sphere','b','sphere-exit');setRow('leave-sphere','a','sphere-entry');
        reconnectForm.apply.click();accepted('Swap before removal');
        if(link('enter-sphere').b!=='sphere-exit'||link('leave-sphere').a!=='sphere-entry')throw Error('Swap before removal did not take');
        const docSwapped=canon(model.document()),wiringSwapped=wiring(),poseSwapped=pose();
        for(const c of links())if(removeButton(c.id).textContent!==label(c))throw Error(`Removal button after the swap reads ${removeButton(c.id).textContent}, saved ${label(c)}`);
        setRow('enter-sphere','b','sphere-entry');setRow('leave-sphere','a','sphere-exit');
        if(removeButton('enter-sphere').textContent!==label(link('enter-sphere')))throw Error('Removal button followed an unapplied reconnection draft');
        removeButton('enter-sphere').click();accepted('Remove the swapped enter-sphere');
        if(!/flat-entry/.test(editor.message.textContent)||!/sphere-exit/.test(editor.message.textContent))throw Error(`Removal message: ${editor.message.textContent}`);
        const docOne=canon(model.document()),wiringOne=wiring();
        if(canon(links().map(c=>c.id))!==canon(['leave-sphere']))throw Error(`Connections after removal ${links().map(c=>c.id)}`);
        if(canon(anchorsIn(model.document()))!==canon(['flat-return','sphere-entry']))throw Error(`Anchors after removal ${anchorsIn(model.document())}`);
        if(model.world.portals.some(p=>['flat-entry','sphere-exit'].includes(p.fromId)||['flat-entry','sphere-exit'].includes(p.toId)))throw Error('World still links a removed anchor');
        if(model.world.portals.length!==2||packetPortals()!==portalsBefore-2)throw Error(`Portal links after removal: world ${model.world.portals.length}, packet ${packetPortals()}`);
        if(portalOf('sphere-entry').toId!=='flat-return')throw Error('Removal disturbed the surviving pair');
        if([...editor.entity.options].some(o=>o.value==='flat-entry')&&editor.region.value==='flat')throw Error('Removed anchor still offered in the entity list');
        if(document.querySelector('#reconnect-enter-sphere-a'))throw Error('Reconnect rows still show the removed connection');
        if(canon(removeButtons())!==canon(['remove-portal-leave-sphere']))throw Error(`Removal buttons after removal ${removeButtons()}`);
        if(pose()!==poseSwapped)throw Error('Removal moved the player or camera');
        if(!model.canUndo||model.canRedo)throw Error('Removal left the wrong history');
        expectButtons('after removal');
        probe('after-removal',entryPose(),'flat-entry',false);
        checks.push('removing the swapped enter-sphere deleted exactly flat-entry, sphere-exit and their connection: saved endpoints (not the draft rows), no anchor left behind, two fewer world and GPU-packet portal links, surviving pair untouched, pose kept, no ray crosses the removed aperture');

        // The final pair may go: empty portal lists still render and the page still draws.
        removeButton('leave-sphere').click();accepted('Remove the last pair');
        const docNone=canon(model.document()),textNone=await download();
        if(links().length||anchorsIn(model.document()).length)throw Error(`Zero-pair document still has ${links().length} connections and ${anchorsIn(model.document())} anchors`);
        if(model.world.portals.length||packetPortals())throw Error(`Zero-pair world ${model.world.portals.length} / packet ${packetPortals()} portal links`);
        if(!document.querySelector('#remove-empty')||removeButtons().length)throw Error('Zero-pair removal list did not render its empty message');
        if(reconnectForm.rows.querySelector('select')||!reconnectForm.apply.disabled)throw Error('Zero-pair reconnect form still offers rows');
        if(/Preview stopped/.test(status.textContent))throw Error(`Zero-pair draw failed: ${status.textContent}`);
        const guide=model.renderGuide();
        if(guide.nearest!==null||guide.aimed!==null)throw Error('Zero-pair guide still reports a portal');
        if(!/No entering portal|Crosshair hits solid/.test(document.querySelector('#portal-hint').textContent))throw Error(`Zero-pair hint: ${document.querySelector('#portal-hint').textContent}`);
        const noneProbe=probe('zero-portals',entryPose(),'flat-entry',false);
        // A portal-free room may be seen entirely past the surviving landmark; record that rather
        // than claiming parity evidence from a view with no GPU hits at all.
        removalRecord.zeroPortalVacuous=!noneProbe.gpuHits;
        probeShot('portals-removed',entryPose());
        {
          // No auto-teleport and no silent recovery: the exit helper refuses and the player stays put.
          const poseNone=pose();
          document.querySelector('[data-action="approach-exit"]').click();
          if(pose()!==poseNone)throw Error('approach-exit moved the player with no portals left');
          if(!/refused/i.test(editor.message.textContent))throw Error(`approach-exit with no portals: ${editor.message.textContent}`);
          if(/Preview stopped/.test(status.textContent))throw Error('approach-exit with no portals was reported as fatal');
        }
        checks.push(`last pair removed: zero world and GPU-packet portal links, empty removal/reconnect lists still rendered, guide reports no portal, the portal-free view still draws and its ${noneProbe.sampled} sampled rays agree between CPU and GPU (${noneProbe.gpuHits} hits${noneProbe.gpuHits?'':'; NO GPU HITS — vacuous parity'}), and the exit helper refuses without moving the player`);

        // Undo, redo and file reload across both removals.
        editor.undo.click();accepted('Undo the last removal');
        if(canon(model.document())!==docOne||wiring()!==wiringOne)throw Error('Undo did not restore the last pair');
        editor.undo.click();accepted('Undo the first removal');
        if(canon(model.document())!==docSwapped||wiring()!==wiringSwapped)throw Error('Undo did not restore the swapped graph');
        for(const c of links())if(removeButton(c.id).textContent!==label(c))throw Error('Undo did not rebuild the removal buttons from the restored graph');
        // The swapped route leads somewhere this fixture makes no promise about, so only the
        // restored crossing and CPU/GPU agreement are claimed here.
        probe('after-undo',entryPose(),'flat-entry',true,false);
        editor.redo.click();accepted('Redo the first removal');editor.redo.click();accepted('Redo the last removal');
        if(canon(model.document())!==docNone)throw Error('Redo did not reapply both removals');
        await load(textNone,'no-portals.nil.json');accepted('Load the zero-pair file');
        if(canon(model.document())!==docNone||pose()!==poseSwapped)throw Error('Zero-pair file load changed the document or pose');
        if(!document.querySelector('#remove-empty'))throw Error('Loaded zero-pair document lost its empty removal list');
        if(canon(createConnectedGlobalPreview(JSON.parse(textNone)).document())!==docNone)throw Error('Fresh model load of the zero-pair JSON differs');
        await load(textBefore,'both-pairs.nil.json');accepted('Load the two-pair file');
        if(canon(model.document())!==docBefore||wiring()!==wiringBefore||canon(anchorsIn(model.document()))!==canon(anchorsBefore))throw Error('Reloading the earlier file did not restore both pairs');
        probe('reloaded',entryPose(),'flat-entry',true);
        checks.push('both removals undo, redo and survive a JSON download/reload (fresh model and file input); reloading the earlier file restores both pairs and their apertures');

        // Existing-anchor orientation: explicit components in the anchor's own frame, this anchor only.
        {
          const fields=[...forwardKeys,...upKeys];
          choose('flat','flat-target');
          if(fields.some(k=>!editor[k].disabled))throw Error('Orientation fields must be disabled for a ball');
          choose('flat','flat-spawn');
          if(fields.some(k=>!editor[k].disabled))throw Error('Orientation fields must be disabled for a spawn');
          choose('flat','flat-entry');
          if(fields.some(k=>editor[k].disabled))throw Error('Orientation fields must be enabled for an anchor');
          if(canon(fields.map(k=>Number(editor[k].value)))!==canon([0,-1,0,0,0,1]))throw Error(`Orientation fields show ${fields.map(k=>editor[k].value)}`);
          checks.push('forward/up fields appear only for anchors and show the saved construction frame');

          // The straight axis route through the saved frame, measured from the spawn two units out.
          const straight=model.pixelSight(1,1,0,0,renderer.packed.maxDistance,probePose('flat',[0,-2,0],[0,1,0],[0,0,1]));
          if(straight.status!=='hit'||straight.query.owner!=='flat-target'||straight.crossings.length!==2)
            throw Error(`Saved-frame axis route ${straight.status}/${straight.query?.owner}/${straight.crossings.length}`);

          const turn=(f,u)=>{[...forwardKeys,...upKeys].forEach((k,i)=>{editor[k].value=String([...f,...u][i]);editor[k].dispatchEvent(new Event('input'));});};
          for(const [name,f,u,pattern] of [
            ['parallel forward and up',[0,-1,0],[0,-1,0],/orthonormal/],
            ['non-unit forward',[0,-2,0],[0,0,1],/orthonormal/],
            ['blank up component',[0,-1,0],['',0,1],/finite/]]){
            choose('flat','flat-entry');turn(f,u);
            const before=snapshot();editor.apply.click();expectUnchanged(`rotation with ${name}`,before);
            if(pattern&&!pattern.test(editor.message.textContent))throw Error(`${name}: unexpected refusal ${editor.message.textContent}`);
          }
          if(canon(entity('flat-entry').forward)!==canon([0,-1,0]))throw Error('A refused rotation normalized or wrote the saved frame');
          checks.push('rotations with a parallel frame, a non-unit forward and a blank component refused unchanged: nothing is normalized for the author');

          // Turn flat-entry only; its partner, the other pair and the player pose stay as they are.
          const forward=[-.6,-.8,0],up=[0,0,1],partner=canon(entity('sphere-entry')),otherPair=canon(entity('flat-return'));
          const partnerNormal=canon(portalOf('sphere-entry').normal),poseSaved=pose();
          const calls=[],descriptor=Object.getOwnPropertyDescriptor(model,'editEntities');
          if(descriptor?.writable)model.editEntities=edits=>{calls.push(structuredClone(edits));return descriptor.value.call(model,edits);};
          try{choose('flat','flat-entry');turn(forward,up);editor.apply.click();}finally{if(descriptor?.writable)model.editEntities=descriptor.value;}
          accepted('Rotate flat-entry');
          if(descriptor?.writable&&(calls.length!==1||canon(calls[0])!==canon([{id:'flat-entry',patch:{forward,up}}])))
            throw Error(`Rotation sent ${JSON.stringify(calls)}`);
          if(canon(entity('flat-entry'))!==canon({id:'flat-entry',regionId:'flat',kind:'anchor',position:[0,0,0],radius:.9,forward,up}))
            throw Error(`Rotated anchor ${JSON.stringify(entity('flat-entry'))}`);
          if(canon(entity('sphere-entry'))!==partner||canon(entity('flat-return'))!==otherPair)throw Error('Rotation changed another anchor');
          if(canon(link('enter-sphere'))!==canon({id:'enter-sphere',kind:'portal',a:'flat-entry',b:'sphere-entry',velocity:'preserve-speed',scale:1}))throw Error('Rotation changed the connection record');
          if(canon(portalOf('flat-entry').normal)!==canon(forward))throw Error(`Rotated directed portal normal ${portalOf('flat-entry').normal}`);
          if(canon(portalOf('sphere-entry').normal)!==partnerNormal)throw Error('Rotation turned the partner aperture');
          if(pose()!==poseSaved)throw Error('Rotation moved the player or camera');
          expectFields('after rotation','flat-entry');
          const docRotated=canon(model.document());

          // The aperture now faces the new axis: same transported route, three units out instead of two.
          const turned=probePose('flat',[-1.8,-2.4,0],[.6,.8,0],[0,0,1]);
          const seen=probe('rotated-aperture',turned,'flat-entry',true);
          if(seen.axis.cpu!=='hit'||seen.axis.owner!=='flat-target'||canon(seen.axis.route)!==canon(['flat-entry','sphere-exit']))
            throw Error(`Rotated axis ray ${seen.axis.cpu}/${seen.axis.owner} via ${seen.axis.route}`);
          if(Math.abs(seen.axis.cpuDistance-(straight.distance+1))>1e-4)throw Error(`Rotated axis distance ${seen.axis.cpuDistance}, saved-frame route + 1 unit ${straight.distance+1}`);
          probeShot('portal-rotated-aperture',turned);
          removalRecord.rotation={forward,up,savedRoute:straight.distance,turnedRoute:seen.axis.cpuDistance,gpuDistance:seen.axis.gpuDistance};
          checks.push(`flat-entry turned to forward [${forward}] in its own frame (one observed editEntities edit, partner and pose untouched): the axis ray three units out crosses flat-entry and sphere-exit to flat-target at ${seen.axis.cpuDistance.toFixed(5)} = saved route ${straight.distance.toFixed(5)} + 1, GPU ${seen.axis.gpuDistance.toFixed(5)}, with CPU/GPU agreement on ${seen.gpuHits} sampled hits`);

          const rotatedText=await download();
          if(canon(JSON.parse(rotatedText))!==docRotated)throw Error('Downloaded JSON differs from the rotated document');
          editor.undo.click();accepted('Undo rotation');
          if(canon(model.document())!==docBefore||canon(portalOf('flat-entry').normal)!==canon([0,-1,0]))throw Error('Undo did not restore the saved frame');
          editor.redo.click();accepted('Redo rotation');
          if(canon(model.document())!==docRotated)throw Error('Redo did not restore the rotated frame');
          await load(rotatedText,'rotated.nil.json');accepted('Load the rotated file');
          if(canon(model.document())!==docRotated||pose()!==poseSaved)throw Error('Rotated file load changed the document or pose');
          probe('rotated-reloaded',probePose('flat',[-1.8,-2.4,0],[.6,.8,0],[0,0,1]),'flat-entry',true);
          await load(textBefore,'saved-frame.nil.json');accepted('Load the saved-frame file');
          if(canon(model.document())!==docBefore)throw Error('Reloading did not restore the saved frame');
          checks.push('rotation undo/redo, JSON download and file reload restore the turned and saved frames exactly, with the player pose kept');
        }
        if(pose()!==poseBefore)throw Error('Removal and rotation checks moved the player overall');
        records.push(removalRecord);
      }

      // Round trip to the original file, then fly the original route.
      await load(originalText,'connected-global.nil.json');accepted('Original load');
      if(canon(model.document())!==doc0)throw Error('Loading the original download did not restore the original document');
      $('[data-action="spawn-flat"]').click();
      const route=['flat'];
      for(let i=0;i<3000;i++){
        model.advance(1/60,[0,1,0]);
        if(model.halted)throw Error(`Original route halted after round trip: ${model.motion}`);
        const s=model.state;if(s.regionId!==route.at(-1))route.push(s.regionId);
        if(route.length===3&&s.position[1]>.5)break;
      }
      if(route.join()!=='flat,sphere,flat')throw Error(`Route after round trip: ${route}`);
      draw();shots.push({name:'edit-roundtrip-return',data:canvas.toDataURL()});
      editRecord.roundTripSpotHits=spotCheck('after round trip');
      checks.push('original download loaded through the file input; original flat/sphere/flat route flies');
      records.push(editRecord);
    }
    records.push({coldReadyWallMs});
    details.textContent=JSON.stringify(records,null,2);draw();
    await report('',{connectedGlobalEvidence:records});
  }
}catch(error){failure(error);}
