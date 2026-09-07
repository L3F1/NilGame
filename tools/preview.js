// tools/preview.js — render the real app to a PNG, headless.
//
//   node tools/preview.js out.png
//   node tools/preview.js out.png "curved = false;"
//   node tools/preview.js out.png "player = [2,-9,4]; yaw = 1.6; pitch = -0.2;"
//
// The second argument is JavaScript spliced into main.js after it has run, so
// it can set any of its top-level bindings: player, vel, yaw, pitch, curved,
// grapple, marchSteps.
//
// Env: CW / CH render size (default 300x200), FRAMES loop iterations (3).
//
// No web server: file:// refuses ES modules, and a local server is not
// reachable from a sandboxed child process. Instead the module graph is
// bundled into one classic script below. Same code, same shader, same GL
// calls — only the module wrapper differs.
//
// Rendering is software (SwiftShader), so keep it small. 300x200 takes about
// a second; a full viewport takes minutes.

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const out = resolve(process.argv[2] || 'preview.png');
const inject = process.argv[3] || '';
const CW = Number(process.env.CW || 300);
const CH = Number(process.env.CH || 200);
const FRAMES = Number(process.env.FRAMES || 3);

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) { console.error('no Chrome or Edge found; edit findBrowser()'); process.exit(2); }
  return hit;
}

// --- a very small bundler ----------------------------------------------
// Each module becomes an IIFE returning its exports, so module scope stays
// module scope. Flat concatenation would work too, right up until two files
// declare a helper with the same name and the whole page dies on a redeclare.
// It understands only the import style this project uses:
//     import { a, b } from './x.js';
//     export function f  /  export const K

const sources = new Map();
const order = [];
function visit(file) {
  if (sources.has(file)) return;
  const code = readFileSync(join(ROOT, file), 'utf8');
  sources.set(file, code);
  for (const m of code.matchAll(/from\s+'\.\/([^']+)'/g)) visit(m[1]);
  order.push(file);          // dependencies first
}
visit('main.js');

function wrap(file, code) {
  const names = [];
  // `async function` counts too. It did not, and net.js is full of them, so
  // the bundle came out with a bare `export` in it and the page died with
  // "Unexpected token 'export'" - which looks exactly like a syntax error in
  // the game rather than in this file.
  code = code.replace(
    /^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_, kw, id) => { names.push(id); return `${kw} ${id}`; });
  code = code.replace(
    /^import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)';?/gm,
    (_, list, from) => `const {${list}} = __m['${from}'];`);
  // SAY SO when the source uses an import form this cannot rewrite, instead of
  // emitting a bundle with a live `import` in it and letting the browser
  // produce an error that points at the wrong thing. Renamed and namespace
  // imports are the two that keep happening; the browser is perfectly happy
  // with both, so they only ever break here.
  const left = code.match(/^\s*(import|export)\s.*$/m);
  if (left) {
    throw new Error(
      `tools/preview.js cannot bundle this line of ${file}:\n\n    ${left[0].trim()}\n\n`
      + 'It understands only:  import { a, b } from \'./x.js\';  and\n'
      + 'export function / export async function / export const / let / class.\n'
      + 'Renamed imports (import { a as b }) and namespace imports\n'
      + '(import * as ns) are NOT supported - the browser is fine with both,\n'
      + 'so this is the only place they break. Rewrite the import, or teach\n'
      + 'this function the form.');
  }
  // The injected snippet goes inside main.js so it can see its locals.
  if (file === 'main.js' && inject) code += `\n${inject}\n`;
  return `__m['${file}'] = (function () {\n${code}\nreturn {${names.join(',')}};\n})();`;
}

const bundle = `const __m = {};\n` + order.map((f) => wrap(f, sources.get(f))).join('\n');

const mode = process.env.MODE || 'shot';

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const harness = `
<style>html,body{background:#111}canvas{width:${CW}px!important;height:${CH}px!important}
${mode === 'shot' ? '#hud{display:none}' : ''}</style>
<script>
window.addEventListener('error', function (e) {
  document.title = 'PAGE_ERROR';
  document.documentElement.setAttribute('data-err', e.message);
});
(function () {
  // Stop the frame loop after a few frames. Software rendering is slow, and
  // an endless requestAnimationFrame loop means Chrome's virtual clock never
  // runs out, so the screenshot never fires.
  var raf = window.requestAnimationFrame, n = 0;
  window.requestAnimationFrame = function (cb) {
    if (n++ >= ${FRAMES}) { document.title = 'FRAMES_DONE'; return 0; }
    return raf(cb);
  };
})();
</script>`;

const page = html
  .replace('</head>', harness + '</head>')
  .replace('<script type="module" src="./main.js"></script>', `<script>\n${bundle}\n</script>`);

const dir = mkdtempSync(join(tmpdir(), 'nilpreview-'));
const file = join(dir, 'bundle.html');
writeFileSync(file, page, 'utf8');

const t0 = Date.now();
try {
  const dump = execFileSync(findBrowser(), [
    '--headless=new',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--window-size=560,360', '--hide-scrollbars',
    '--virtual-time-budget=20000',
    ...(mode === 'dom' ? ['--dump-dom'] : [`--screenshot=${out}`]),
    'file:///' + file.replace(/\\/g, '/'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 });

  if (mode === 'dom') {
    const d = String(dump);
    const pick = (re, dflt) => (d.match(re) || [null, dflt])[1];
    console.log('title:', pick(/<title>([^<]*)<\/title>/, '(none)'));
    console.log('error:', pick(/data-err="([^"]*)"/, '(none)'));
    console.log('hud  :\n  ' + pick(/<div id="hud">([\s\S]*?)<\/div>/, '(empty)')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .trim().split('\n').join('\n  '));
  } else {
    console.log(`wrote ${out} (${Date.now() - t0}ms)`);
  }
} catch (e) {
  console.error('browser failed:', e.killed ? 'timed out' : `exit ${e.status}`);
  console.error('bundle left at:', file);
  process.exit(1);
}
