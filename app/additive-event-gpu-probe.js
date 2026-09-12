import {ADDITIVE_EVENT_ORDER_GLSL,selectAdditiveEntry} from '../engine/geometry/additive-event-order.js';
import {CONNECTED_VERTEX} from '../engine/geometry/connected-shader.js';
export function checkAdditiveOrderGpu(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const gl=canvas.getContext('webgl2',{antialias:false});if(!gl)throw Error('Ordering probe requires WebGL2');gl.disable(gl.DITHER);
  const cases=[[[1,2],[3,4],1,0],[[3,4],[1,2],0,1],[[1,3],[2,4],1,1],[[1,2],[2,4],1,1],
    [[0,1],[3,4],1,1],[[9,10],[11,12],1,1],[[1,2],[3,4],0,1],[[11,12],[13,14],1,1]];
  function build(code){
    const p=gl.createProgram(),fragment=`#version 300 es
precision highp float;precision highp int;
uniform vec4 inputBands;uniform ivec2 inputKinds;out vec4 color;
${code}
void main(){vec2 bands[32];int kinds[32];bands[0]=inputBands.xy;bands[1]=inputBands.zw;
kinds[0]=inputKinds.x;kinds[1]=inputKinds.y;int selected;int status=firstAdditiveEntry(bands,kinds,2,10.,selected);
color=vec4(float(status)/255.,float(selected+1)/255.,0.,1.);}`;
    for(const [type,source] of [[gl.VERTEX_SHADER,CONNECTED_VERTEX],[gl.FRAGMENT_SHADER,fragment]]){
      const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);
    }
    gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
  }
  function run(program,mutant){
    gl.useProgram(program);gl.viewport(0,0,1,1);
    for(const [a,b,ka,kb] of cases){
      const query=(owner,band,kind)=>({owner,status:'roots',events:[{lower:band[0],upper:band[1],kind:kind===1?'entry':'ambiguous'}]});
      const cpu=selectAdditiveEntry([query('a',a,ka),query('b',b,kb)],{maxDistance:10,outsideCertified:true});
      gl.uniform4fv(gl.getUniformLocation(program,'inputBands'),[...a,...b]);gl.uniform2i(gl.getUniformLocation(program,'inputKinds'),ka,kb);
      gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if(gl.getError()!==gl.NO_ERROR)throw Error('Ordering GPU error');
      const status={miss:0,entry:1,unresolved:2}[cpu.status];
      if(pixels[0]!==status||(status===1&&pixels[1]!==(['a','b'].indexOf(cpu.owner)+1))){
        if(mutant)return true;throw Error(`GPU interval order differs from CPU (${a}/${b})`);
      }
    }
    return false;
  }
  const good=build(ADDITIVE_EVENT_ORDER_GLSL),bad=build(ADDITIVE_EVENT_ORDER_GLSL.replace('bands[i].x<=bands[chosen].y','false'));
  try{run(good,false);if(!run(bad,true))throw Error('Overlapping-root mutation escaped GPU check');
    return {label:'additive-event-gpu',cases:cases.length,overlapMutationCaught:true};
  }finally{gl.deleteProgram(good);gl.deleteProgram(bad);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
