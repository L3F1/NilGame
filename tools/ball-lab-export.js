import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { compileBallScene } from '../engine/world/ball-scene.js';
import { BALL_PREVIEW_GLSL } from '../engine/geometry/ball-shader.js';
const source=JSON.parse(readFileSync(new URL('../levels/fixtures/ball-lab.nil.json',import.meta.url),'utf8'));
const ball=compileBallScene(source);
const target=new URL('../experiments/godot/generated/',import.meta.url);
mkdirSync(target,{recursive:true});
writeFileSync(new URL('ball-scene.json',target),JSON.stringify(ball.document(),null,2));
const shader=BALL_PREVIEW_GLSL.replace(/^#version.*\n/,'').replace('precision highp float;','')
  .replace('out vec4 fragColor;','').replace('void main()','void fragment()')
  .replaceAll('gl_FragCoord.xy','(vec2(UV.x,1.0-UV.y)*uRes)').replaceAll('fragColor=','COLOR=');
writeFileSync(new URL('ball-preview.gdshader',target),'shader_type canvas_item;\nrender_mode unshaded, blend_disabled;\n'+shader);
const points=Array.from({length:80},(_,i)=>[Math.sin(i*2.3),Math.cos(i*.7),i/40-.5]);
writeFileSync(new URL('ball-golden.json',target),JSON.stringify(points.map(p=>({p,d:ball.distance(p)}))));
console.log('Exported validated E3 ball document, shared shader and 80 independent CPU samples');
