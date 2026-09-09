import { compileBallScene, editBallScene } from '../engine/world/ball-scene.js';
import { BALL_FIRST_PERSON_GLSL } from '../engine/geometry/ball-shader.js';
import { e3Space, clearance, resolveOverlap, moveProbe } from '../engine/world/collision.js';
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
const U=Object.fromEntries(['uBall','uRes','uEye','uFwd','uRight','uUp','uExtent']
  .map(n=>[n,gl.getUniformLocation(program,n)]));
const ballLocation=U.uBall,sizeLocation=U.uRes;
const response=await fetch('../levels/fixtures/ball-lab.nil.json');
if(!response.ok)throw new Error('Cannot load ball fixture');
let scene=compileBallScene(await response.json()).document(), undo=[],redo=[];

// --- the probe: a finite-radius player, colliding with the SAME field ------
//
// This is the edit/play boundary. The probe queries the compiled scene, which
// is the object the shader's uniform comes from, so there is exactly one
// answer to "where is the ball" and no chance of the picture and the collision
// disagreeing.
const space=e3Space();
const spawnOf=doc=>doc.entities.find(e=>e.kind==='spawn').position.slice();
const probe={position:spawnOf(scene),velocity:[0,0,0],radius:scene.units.playerRadius};
let yaw=Math.PI/2,pitch=-0.15,playing=false,last=null,lastContact='';
const keys=new Set();
const SPEED=2.4;

function basis(){
  const cp=Math.cos(pitch),f=[Math.cos(yaw)*cp,Math.sin(yaw)*cp,Math.sin(pitch)];
  const r=[-Math.sin(yaw),Math.cos(yaw),0];
  return {f,r,u:[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]]};
}
function want(){
  const {f,r}=basis(),v=[0,0,0];
  const add=(d,k)=>{for(let i=0;i<3;i++)v[i]+=d[i]*k;};
  if(keys.has('KeyW'))add(f,1); if(keys.has('KeyS'))add(f,-1);
  if(keys.has('KeyD'))add(r,1); if(keys.has('KeyA'))add(r,-1);
  if(keys.has('Space'))add([0,0,1],1);
  if(keys.has('ShiftLeft')||keys.has('ShiftRight'))add([0,0,1],-1);
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
  const ball=compileBallScene(scene);
  canvas.width=Math.max(1,Math.round(canvas.clientWidth*devicePixelRatio));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight*devicePixelRatio));
  gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
  const {f,r,u}=basis();
  gl.uniform4fv(ballLocation,ball.uniform());gl.uniform2f(sizeLocation,canvas.width,canvas.height);
  gl.uniform3fv(U.uEye,probe.position);gl.uniform3fv(U.uFwd,f);
  gl.uniform3fv(U.uRight,r);gl.uniform3fv(U.uUp,u);
  gl.uniform1f(U.uExtent,scene.regions[0].extent);
  gl.drawArrays(gl.TRIANGLES,0,3);
  ['x','y','z','radius'].forEach((id,i)=>$(id).value=ball.uniform()[i]);
  const gap=clearance(ball,probe.position,probe.radius);
  $('query').textContent=`Signed distance at origin: ${ball.distance([0,0,0]).toFixed(4)}`
    +` (negative is inside the ball). Player clearance: ${gap.toFixed(4)}`
    +`${gap<0?' - OVERLAPPING':''}.${lastContact?' '+lastContact:''}`;
  $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
}

function frame(now){
  if(!playing)return;
  // Clamp dt at BOTH ends. The lower one is the one that bites: a first
  // callback stamped before the clock was read gives a NEGATIVE dt, which runs
  // the integrator backwards. See CLAUDE.md, "Clamp dt at BOTH ends".
  const dt=last===null?0:Math.min(Math.max((now-last)/1000,0),0.05);
  last=now;
  const field=compileBallScene(scene);
  const target=want();
  // No gravity and no ground: the document has no floor entity, so inventing
  // one here would make the collision field disagree with the scene. This
  // moves the probe and lets the ball stop it, which is exactly the query
  // boundary being tested.
  probe.velocity=target;
  const out=moveProbe(field,space,probe,dt);
  probe.position=out.position;
  lastContact=out.contacts.length?`Touching the ball (normal ${out.contacts[0].map(n=>n.toFixed(2)).join(', ')}).`
    :out.stalled?'Contact solver stalled - grazing.':'';
  draw();
  requestAnimationFrame(frame);
}

function setPlaying(on){
  playing=on;last=null;
  $('play').textContent=on?'Stop (Esc)':'Play from spawn';
  canvas.style.cursor=on?'crosshair':'default';
  if(on){probe.position=spawnOf(scene);probe.velocity=[0,0,0];lastContact='';
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
  const compiled=compileBallScene(next);
  undo.push(scene);redo=[];scene=compiled.document();
  lastContact=reconcile(compiled);
  draw();
}
$('editor').onsubmit=e=>{
  e.preventDefault();
  try{commit(editBallScene(scene,['x','y','z'].map(id=>Number($(id).value)),Number($('radius').value)));$('status').textContent='Ball updated';}
  catch(error){$('status').textContent=error.message;draw();}
};
const step=(from,to)=>{if(!from.length)return;to.push(scene);scene=from.pop();
  lastContact=reconcile(compileBallScene(scene));draw();};
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
    $('x').value=.5;$('radius').value=.4;
    $('editor').requestSubmit();
    check('form edits authored ball',compileBallScene(scene).uniform()[0]===.5);
    check('field updates',Math.abs(compileBallScene(scene).distance([.5,0,.25])+.4)<1e-12);
    check('uniform updates',Math.abs(gl.getUniform(program,ballLocation)[3]-.4)<1e-6);
    check('render changes',pixels().some((v,i)=>v!==before[i]));
    $('undo').click();check('undo restores document',JSON.stringify(scene)===initial);
    $('redo').click();check('redo restores edit',compileBallScene(scene).uniform()[0]===.5);
    const roundtrip=JSON.stringify(scene);commit(JSON.parse(roundtrip));
    check('JSON round trip',JSON.stringify(scene)===roundtrip);
    $('x').value=4;$('editor').requestSubmit();
    check('invalid edit is atomic',JSON.stringify(scene)===roundtrip);

    // --- the probe, exercised through the real DOM controls ---------------
    const spawn=spawnOf(scene);
    setPlaying(true);
    check('play starts at the authored spawn',probe.position.every((x,i)=>x===spawn[i]));
    check('the spawn has room for the player',clearance(compileBallScene(scene),probe.position,probe.radius)>0);
    // Aim straight at the ball and drive into it. A point test would pass
    // through at this speed; a swept one cannot.
    const centre=compileBallScene(scene).uniform().slice(0,3);
    const toBall=centre.map((c,i)=>c-probe.position[i]);
    yaw=Math.atan2(toBall[1],toBall[0]);
    pitch=Math.atan2(toBall[2],Math.hypot(toBall[0],toBall[1]));
    keys.add('KeyW');
    let touched=false,worst=Infinity;
    for(let i=0;i<240;i++){
      const before=probe.position.slice();
      const out=moveProbe(compileBallScene(scene),space,{...probe,velocity:want()},1/60);
      probe.position=out.position;
      if(out.contacts.length)touched=true;
      worst=Math.min(worst,clearance(compileBallScene(scene),probe.position,probe.radius));
      if(touched&&probe.position.every((x,j)=>Math.abs(x-before[j])<1e-9))break;
    }
    keys.delete('KeyW');
    // One check for the whole walk, not one per frame: a per-frame check
    // inflates the reported total and says the same thing 240 times.
    check('the probe never enters the ball while walking into it',worst>=-1e-6);
    check('walking into the ball registers a contact',touched);
    // A camera inside geometry fills the screen with one flat colour, which
    // looks exactly like a shader that failed to compile. Prove the play view
    // is a picture.
    draw();
    const shown=pixels();
    check('the play view renders more than one flat colour',
      shown.some((v,i)=>i%4<3&&v!==shown[i%4]));

    // One enormous step: the tunnelling case, through the real field.
    probe.position=spawn.slice();
    const far=moveProbe(compileBallScene(scene),space,
      {...probe,velocity:centre.map((c,i)=>(c-spawn[i])*1000)},1,{maxSteps:4096});
    check('a 1000x step still stops at the surface',
      clearance(compileBallScene(scene),far.position,probe.radius)>=-1e-6);

    // The editor case: grow the ball over the player and check the policy.
    probe.position=centre.slice(0,2).concat(centre[2]+0.2);
    const note=reconcile(compileBallScene(editBallScene(scene,centre,1.2)));
    check('an edit that reaches the player moves them clear',note!=='');
    setPlaying(false);
    check('stopping play leaves the document untouched',JSON.stringify(scene)===roundtrip);
    check('no GL errors',gl.getError()===gl.NO_ERROR);
  }catch(error){err=error.stack;}
  await fetch('/__report',{method:'POST',body:JSON.stringify({err,boot:$('boot').textContent,hud:'E3 ball authoring lab',px:'render compared',checks})});
}
