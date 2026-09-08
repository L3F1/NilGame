// Render the exact native fixture in WebGL2 on the real GPU, then compare RGBA.
// No game simulation, UI or browser screenshots influence the comparison.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fragFor, VERT } from '../shader.js';

const root = new URL('../experiments/godot/', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('generated/views.json', root), 'utf8'));
const output = new URL('results/webgl/', root);
mkdirSync(output, { recursive: true });
const programs = Object.fromEntries([...new Set(fixture.views.map((v) => v.geometry))].map((key) => [key, fragFor(key)]));
const page = `<canvas width="${fixture.width}" height="${fixture.height}"></canvas><script>
const fixture = ${JSON.stringify(fixture)}, sources = ${JSON.stringify(programs)};
const vertex = ${JSON.stringify(VERT)};
const frame = () => new Promise(requestAnimationFrame);
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
const encode = bytes => { let text = ''; for (let i=0;i<bytes.length;i+=16384) text += String.fromCharCode(...bytes.subarray(i,i+16384)); return btoa(text); };
(async () => {
  try {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2', {antialias:false, preserveDrawingBuffer:true});
    if (!gl) throw Error('WebGL2 unavailable');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const report = {device: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      width:canvas.width, height:canvas.height, views:[]};
    const compiled = {};
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    const build = (type, code) => { const shader = gl.createShader(type); gl.shaderSource(shader,code); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader)); return shader; };
    for (const view of fixture.views) {
      let linkMs = 0;
      if (!compiled[view.geometry]) {
        const begin = performance.now(), p = gl.createProgram();
        gl.attachShader(p,build(gl.VERTEX_SHADER,vertex)); gl.attachShader(p,build(gl.FRAGMENT_SHADER,sources[view.geometry]));
        gl.linkProgram(p); if (!gl.getProgramParameter(p,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
        compiled[view.geometry] = p; linkMs = performance.now()-begin;
      }
      const p = compiled[view.geometry]; gl.useProgram(p);
      const pos = gl.getAttribLocation(p,'aPos'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      for (const [key,value] of Object.entries(view.uniforms)) {
        const loc = gl.getUniformLocation(p,key); if (loc === null) continue;
        if (key === 'uPlayer') gl.uniformMatrix4fv(loc,false,value);
        else if (key === 'uRes') gl.uniform2fv(loc,value);
        else if (key === 'uMarkN' || key === 'uCutN') gl.uniform1i(loc,value);
        else gl.uniform1f(loc,value);
      }
      const draw = () => gl.drawArrays(gl.TRIANGLES,0,3);
      for (let i=0;i<15;i++) { draw(); await frame(); }
      const gpu = [];
      if (timer) for (let i=0;i<15;i++) {
        const q = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT,q); draw(); gl.endQuery(timer.TIME_ELAPSED_EXT);
        let ready = false;
        for (let wait=0;wait<120;wait++) { await frame(); if (gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)) {ready=true;break;} }
        if (!ready) throw Error('GPU timer timed out');
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
        gl.deleteQuery(q);
      }
      draw(); gl.finish();
      if (gl.getError() !== gl.NO_ERROR) throw Error('WebGL draw/readback error');
      const raw = new Uint8Array(canvas.width*canvas.height*4), top = new Uint8Array(raw.length);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,raw);
      for (let y=0;y<canvas.height;y++) top.set(raw.subarray(y*canvas.width*4,(y+1)*canvas.width*4),(canvas.height-1-y)*canvas.width*4);
      report.views.push({id:view.id, shader_prepare_ms:linkMs, gpu_median_ms:gpu.length ? median(gpu) : null,
        rgba:encode(top), png:canvas.toDataURL('image/png').split(',')[1]});
    }
    await fetch('/report',{method:'POST',body:JSON.stringify(report)});
  } catch(error) { await fetch('/report',{method:'POST',body:JSON.stringify({error:String(error)})}); }
})();</script>`;

const browsers = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]
  .filter(Boolean).map((dir) => join(dir, 'Google/Chrome/Application/chrome.exe'));
const chrome = browsers.find(existsSync);
if (!chrome) throw new Error('Chrome not found');
const profile = mkdtempSync(join(tmpdir(), 'nil-native-reference-'));
let browser, timeout;
const report = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    if (req.url === '/report' && req.method === 'POST') {
      // THE CAP MUST SCALE WITH THE FIXTURE, and when it does not the symptom
      // names nothing. Every view posts back a base64 RGBA buffer plus a PNG,
      // about 2.5 MB a view at 640x360, so a fixed 16 MB ceiling silently
      // stopped accepting somewhere past the sixth. Destroying the request
      // makes the page's fetch reject, the catch block then tries to POST the
      // error down the same dead socket, and the whole run surfaces as
      // 'TypeError: Failed to fetch' -- which reads like a browser or network
      // fault and is really this line. Same failure `tools/sdf-check.js` had
      // when its fourth case pushed the DOM dump past execFileSync's maxBuffer.
      const limit = 8000000 * Math.max(fixture.views.length, 8);
      const chunks = []; let size = 0, overflowed = false;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) { overflowed = true; req.destroy(); } else chunks.push(chunk);
      });
      req.on('close', () => {
        if (!overflowed) return;
        clearTimeout(timeout); server.close();
        reject(Error(`Reference payload exceeded ${limit} bytes with `
          + `${fixture.views.length} views. Raise the limit in this file.`));
      });
      req.on('end', () => {
        try { const data = JSON.parse(Buffer.concat(chunks)); res.end('ok'); clearTimeout(timeout); server.close(); resolve(data); }
        catch (error) { res.statusCode=400; res.end(); clearTimeout(timeout); server.close(); reject(error); }
      });
    } else { res.setHeader('Content-Type','text/html'); res.end(page); }
  });
  server.listen(0, '127.0.0.1', () => {
    browser = spawn(chrome, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking', '--use-angle=d3d11', '--enable-gpu',
      '--disable-background-timer-throttling', `http://127.0.0.1:${server.address().port}`],
    {windowsHide:true, stdio:'ignore'});
    browser.on('error', (error) => { clearTimeout(timeout); server.close(); reject(error); });
  });
  timeout = setTimeout(() => { server.closeAllConnections(); server.close(); reject(Error('Reference timed out')); }, 60000 + 30000 * fixture.views.length);
}).finally(() => browser?.kill());
if (report.error) throw Error(report.error);
for (const view of report.views) {
  writeFileSync(new URL(`${view.id}.rgba`, output), Buffer.from(view.rgba,'base64'));
  writeFileSync(new URL(`${view.id}.png`, output), Buffer.from(view.png,'base64'));
  delete view.rgba; delete view.png;
}
writeFileSync(new URL('report.json', output), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
