import { compileBallScene, editBallScene } from '../engine/world/ball-scene.js';
import { BALL_PREVIEW_GLSL } from '../engine/geometry/ball-shader.js';
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
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,BALL_PREVIEW_GLSL));gl.linkProgram(program);
if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
const ballLocation=gl.getUniformLocation(program,'uBall'),sizeLocation=gl.getUniformLocation(program,'uRes');
const response=await fetch('../levels/fixtures/ball-lab.nil.json');
if(!response.ok)throw new Error('Cannot load ball fixture');
let scene=compileBallScene(await response.json()).document(), undo=[],redo=[];
function draw(){
  const ball=compileBallScene(scene);
  canvas.width=Math.max(1,Math.round(canvas.clientWidth*devicePixelRatio));
  canvas.height=Math.max(1,Math.round(canvas.clientHeight*devicePixelRatio));
  gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);
  gl.uniform4fv(ballLocation,ball.uniform());gl.uniform2f(sizeLocation,canvas.width,canvas.height);
  gl.drawArrays(gl.TRIANGLES,0,3);
  ['x','y','z','radius'].forEach((id,i)=>$(id).value=ball.uniform()[i]);
  $('query').textContent=`Signed distance at origin: ${ball.distance([0,0,0]).toFixed(4)}. Negative means inside the ball.`;
  $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
}
function commit(next){
  const valid=compileBallScene(next).document();undo.push(scene);redo=[];scene=valid;draw();
}
$('editor').onsubmit=e=>{
  e.preventDefault();
  try{commit(editBallScene(scene,['x','y','z'].map(id=>Number($(id).value)),Number($('radius').value)));$('status').textContent='Ball updated';}
  catch(error){$('status').textContent=error.message;draw();}
};
$('undo').onclick=()=>{if(undo.length){redo.push(scene);scene=undo.pop();draw();}};
$('redo').onclick=()=>{if(redo.length){undo.push(scene);scene=redo.pop();draw();}};
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
    check('no GL errors',gl.getError()===gl.NO_ERROR);
  }catch(error){err=error.stack;}
  await fetch('/__report',{method:'POST',body:JSON.stringify({err,boot:$('boot').textContent,hud:'E3 ball authoring lab',px:'render compared',checks})});
}
