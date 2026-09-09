import { compileSceneField, editScene } from '../engine/world/scene-field.js';
import { BALL_FIRST_PERSON_GLSL } from '../engine/geometry/ball-shader.js';
import { e3Space, clearance, resolveOverlap } from '../engine/world/collision.js';
import { stepWalker } from '../engine/world/walker.js';
const $=id=>document.getElementById(id), canvas=$('c');
const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
if(!gl) throw new Error('WebGL2 is required');
function shader(type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const program=gl.createProgram();
gl.attachShader(program,shader(gl.VERTEX_SHADER,`#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}`));
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,BALL_FIRST_PERSON_GLSL));gl.linkProgram(program);
if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
const U=Object.fromEntries(['uBall','uRes','uEye','uFwd','uRight','uUp','uExtent','uPlane','uHasPlane']
  .map(n=>[n,gl.getUniformLocation(program,n)]));
const ballLocation=U.uBall,sizeLocation=U.uRes;
// The room has a floor, so gravity has something to land on. ball-lab.nil.json
// is still loadable and is what the Godot parity artifacts are built from.
const response=await fetch('../levels/fixtures/room.nil.json');
if(!response.ok)throw new Error('Cannot load ball fixture');
let scene=compileSceneField(await response.json()).document(), undo=[],redo=[];

// --- the probe: a finite-radius player, colliding with the SAME field ------
//
// This is the edit/play boundary. The probe queries the compiled scene, which
// is the object the shader's uniform comes from, so there is exactly one
// answer to "where is the ball" and no chance of the picture and the collision
// disagreeing.
const space=e3Space();
const spawnOf=doc=>doc.entities.find(e=>e.kind==='spawn').position.slice();
const probe={position:spawnOf(scene),velocity:[0,0,0],
  radius:scene.units.playerRadius,grounded:false};
let yaw=Math.PI/2,pitch=-0.15,playing=false,last=null,lastContact='';
const keys=new Set();
const SPEED=3.2;
// Gravity is a lab setting, not a fact about the space: with it off this is
// the free-flight probe from before, which is still the only sensible mode in
// a scene with no plane to stand on.
const gravityOn=()=>$('gravity').checked;

function basis(){
  // right = normalize(forward x worldUp), up = right x forward. Getting the
  // sign of `right` wrong negates `up` with it, which rotates the whole view a
  // half turn about the forward axis -- it draws the FLOOR ABOVE THE HORIZON
  // and looks like a plane-equation bug rather than a camera one.
  const cp=Math.cos(pitch),f=[Math.cos(yaw)*cp,Math.sin(yaw)*cp,Math.sin(pitch)];
  const r=[Math.sin(yaw),-Math.cos(yaw),0];
  return {f,r,u:[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]]};
}
function want(){
  const {f,r}=basis(),v=[0,0,0];
  const add=(d,k)=>{for(let i=0;i<3;i++)v[i]+=d[i]*k;};
  if(keys.has('KeyW'))add(f,1); if(keys.has('KeyS'))add(f,-1);
  if(keys.has('KeyD'))add(r,1); if(keys.has('KeyA'))add(r,-1);
  if(!gravityOn()){
    if(keys.has('Space'))add([0,0,1],1);
    if(keys.has('ShiftLeft')||keys.has('ShiftRight'))add([0,0,1],-1);
  } else {
    // Walking: flatten the aim, or looking up would walk you into the sky.
    v[2]=0;
  }
  const n=Math.hypot(...v);
  return n>1e-9?v.map(x=>x*SPEED/n):[0,0,0];
}

/**
 * The EDIT/PLAY TRANSACTION POLICY, chosen explicitly rather than by accident.
 *
 * Authoring is never blocked by where the player happens to stand: the edit is
 * applied, and the probe is then made legal against the new field. If it can be
 * pushed out, it is. If it cannot -- dead centre of a ball, where every
 * direction is equally "out" and there is no honest push -- it respawns.
 * Refusing the edit instead would mean an author could not grow a ball while
 * standing in it, which is a worse rule and a confusing one.
 */
function reconcile(field){
  const out=resolveOverlap(field,space,probe.position,probe.radius);
  if(out.status==='clear')return '';
  if(out.status==='pushed'){
    probe.position=out.position;probe.velocity=[0,0,0];
    return 'the edit reached the player, who was pushed clear';
  }
  probe.position=spawnOf(scene);probe.velocity=[0,0,0];
  return 'the edit trapped the player, who respawned';
}

function draw(){
  const field=compileSceneField(scene);
  canvas.width=Math.max(1,Math.round(canvas.clientWidth*devicePixelRatio));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight*devicePixelRatio));
  gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
  const {f,r,u}=basis();
  gl.uniform4fv(ballLocation,field.ballUniform()||[0,0,0,-1]);
  gl.uniform2f(sizeLocation,canvas.width,canvas.height);
  gl.uniform3fv(U.uEye,probe.position);gl.uniform3fv(U.uFwd,f);
  gl.uniform3fv(U.uRight,r);gl.uniform3fv(U.uUp,u);
  gl.uniform1f(U.uExtent,field.extent);
  gl.uniform4fv(U.uPlane,field.planeUniform()||[0,0,1,0]);
  gl.uniform1f(U.uHasPlane,field.hasPlane?1:0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  const ballUniform=field.ballUniform();
  if(ballUniform)['x','y','z','radius'].forEach((id,i)=>$(id).value=ballUniform[i]);
  const gap=clearance(field,probe.position,probe.radius);
  $('query').textContent=`Player clearance ${gap.toFixed(3)}`
    +`${gap<0?' - OVERLAPPING':''}${probe.grounded?', on the ground':''}.`
    +` ${field.solidCount} solid${field.solidCount===1?'':'s'}.`
    +`${lastContact?' '+lastContact:''}`;
  $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
}

function frame(now){
  if(!playing)return;
  // Clamp dt at BOTH ends. The lower one is the one that bites: a first
  // callback stamped before the clock was read gives a NEGATIVE dt, which runs
  // the integrator backwards. See CLAUDE.md, "Clamp dt at BOTH ends".
  const dt=last===null?0:Math.min(Math.max((now-last)/1000,0),0.05);
  last=now;
  const field=compileSceneField(scene);
  const target=want();
  let out;
  if(gravityOn()){
    out=stepWalker(field,space,probe,dt,{want:target,jump:keys.has('Space')});
    probe.grounded=out.grounded;
  } else {
    // Free flight: the control IS the velocity, so nothing accumulates.
    out=stepWalker(field,space,{...probe,velocity:target},dt,
      {gravity:0,want:target,jump:false});
    probe.grounded=false;
  }
  probe.position=out.position;probe.velocity=out.velocity;
  lastContact=out.contacts.length
    ?`Contact normal ${out.contacts[0].map(n=>n.toFixed(2)).join(', ')}.`
    :out.stalled?'Solver stalled - grazing a surface.':'';
  draw();
  requestAnimationFrame(frame);
}

function setPlaying(on){
  playing=on;last=null;
  $('play').textContent=on?'Stop (Esc)':'Play from spawn';
  canvas.style.cursor=on?'crosshair':'default';
  if(on){probe.position=spawnOf(scene);probe.velocity=[0,0,0];probe.grounded=false;lastContact='';
    canvas.requestPointerLock?.();requestAnimationFrame(frame);}
  else {document.exitPointerLock?.();keys.clear();draw();}
}
$('play').onclick=()=>setPlaying(!playing);
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.code==='Escape'&&playing){setPlaying(false);return;}
  if(playing){keys.add(e.code);if(e.code==='Space')e.preventDefault();}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('mousemove',e=>{
  if(!playing)return;
  yaw-=e.movementX*0.0025;
  pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*0.0025));
});
function commit(next){
  const compiled=compileSceneField(next);
  undo.push(scene);redo=[];scene=compiled.document();
  lastContact=reconcile(compiled);
  draw();
}
$('editor').onsubmit=e=>{
  e.preventDefault();
  try{
    const id=compileSceneField(scene).ballId;
    if(!id)throw new Error('This scene has no ball to edit');
    commit(editScene(scene,id,{position:['x','y','z'].map(k=>Number($(k).value)),radius:Number($('radius').value)}));
    $('status').textContent='Ball updated';
  }
  catch(error){$('status').textContent=error.message;draw();}
};
const step=(from,to)=>{if(!from.length)return;to.push(scene);scene=from.pop();
  lastContact=reconcile(compileSceneField(scene));draw();};
$('undo').onclick=()=>step(undo,redo);
$('redo').onclick=()=>step(redo,undo);
$('save').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(scene,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='ball-lab.nil.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('load').onchange=async()=>{
  const file=$('load').files[0];if(!file)return;
  try{commit(JSON.parse(await file.text()));$('status').textContent=`Loaded ${file.name}`;}
  catch(error){$('status').textContent=error.message;}
};
new ResizeObserver(draw).observe(canvas);draw();

// Opt-in executable smoke check, served by page-check --ball-lab.
if(new URLSearchParams(location.search).has('check')){
  const checks=[];
  const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
  let err='';
  try{
    const initial=JSON.stringify(scene);
    const pixels=()=>{const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const before=pixels();
    const ballId=compileSceneField(scene).ballId;
    check('the room has a floor and a ball',compileSceneField(scene).hasPlane&&!!ballId);
    // The camera must not be upside down. A negated `right` negates `up` with
    // it and turns the view a half turn, which draws the floor above the
    // horizon -- visible instantly, and invisible to every other check here.
    const savedPitch=pitch;pitch=0;
    check('camera up points along world up',basis().u[2]>0.99);
    check('camera right is perpendicular to forward',
      Math.abs(basis().r.reduce((a,x,i)=>a+x*basis().f[i],0))<1e-9);
    pitch=savedPitch;
    $('x').value=.5;$('radius').value=.4;
    $('editor').requestSubmit();
    check('form edits the authored ball',compileSceneField(scene).ballUniform()[0]===.5);
    check('field updates',Math.abs(compileSceneField(scene).distance([.5,0,.9])+.4)<1e-9);
    check('uniform updates',Math.abs(gl.getUniform(program,ballLocation)[3]-.4)<1e-6);
    check('render changes',pixels().some((v,i)=>v!==before[i]));
    $('undo').click();check('undo restores document',JSON.stringify(scene)===initial);
    $('redo').click();check('redo restores edit',compileSceneField(scene).ballUniform()[0]===.5);
    const roundtrip=JSON.stringify(scene);commit(JSON.parse(roundtrip));
    check('JSON round trip',JSON.stringify(scene)===roundtrip);
    $('x').value=99;$('editor').requestSubmit();
    check('invalid edit is atomic',JSON.stringify(scene)===roundtrip);

    // --- the walker, through the real DOM controls ------------------------
    setPlaying(true);
    const spawn=spawnOf(scene);
    check('play starts at the authored spawn',probe.position.every((x,i)=>x===spawn[i]));
    check('the spawn has room for the player',clearance(compileSceneField(scene),probe.position,probe.radius)>0);

    // Fall onto the authored floor and stay there.
    probe.position=[0,-3,6];probe.velocity=[0,0,0];probe.grounded=false;
    let sank=false;
    for(let i=0;i<600;i++){
      const out=stepWalker(compileSceneField(scene),space,probe,1/60);
      probe.position=out.position;probe.velocity=out.velocity;probe.grounded=out.grounded;
      if(clearance(compileSceneField(scene),probe.position,probe.radius)<-1e-6)sank=true;
    }
    check('a fall lands on the floor',probe.grounded);
    check('and never sinks through it',!sank);
    check('resting height is the probe radius',Math.abs(probe.position[2]-probe.radius)<5e-3);

    // Walk, and stay on the ground while doing it.
    const startY=probe.position[1];
    for(let i=0;i<120;i++){
      const out=stepWalker(compileSceneField(scene),space,probe,1/60,{want:[0,3,0]});
      probe.position=out.position;probe.velocity=out.velocity;probe.grounded=out.grounded;
    }
    check('walking covers ground',probe.position[1]>startY+1.5);
    check('walking stays on the floor',Math.abs(probe.position[2]-probe.radius)<2e-2);

    // One enormous step: the tunnelling case, through the real field.
    const far=stepWalker(compileSceneField(scene),space,
      {position:[0,-3,500],velocity:[0,0,0],radius:probe.radius,grounded:false},2);
    check('a 500-unit fall still stops at the floor',
      clearance(compileSceneField(scene),far.position,probe.radius)>=-1e-6);

    // The editor case: grow the ball over the player beside it.
    probe.position=[1.0,0,.9];probe.velocity=[0,0,0];
    const note=reconcile(compileSceneField(editScene(scene,ballId,{position:[0,0,.9],radius:1.2})));
    check('an edit that reaches the player moves them clear',note!=='');
    draw();
    const shown=pixels();
    check('the play view renders more than one flat colour',
      shown.some((v,i)=>i%4<3&&v!==shown[i%4]));
    setPlaying(false);
    check('stopping play leaves the document untouched',JSON.stringify(scene)===roundtrip);
    check('no GL errors',gl.getError()===gl.NO_ERROR);
  }catch(error){err=error.stack;}
  await fetch('/__report',{method:'POST',body:JSON.stringify({err,boot:$('boot').textContent,hud:'E3 ball authoring lab',px:'render compared',checks})});
}
