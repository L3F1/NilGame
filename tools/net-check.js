// tools/net-check.js — does the multiplayer path actually connect?
//
//   node tools/net-check.js
//
// Two halves, and neither can be checked by reading.
//
// THE RELAY. tools/relay.js is a hand-written RFC 6455 server: a SHA-1
// handshake and a frame codec with three length encodings. It serves the game
// as well, so a path that climbs out of the project has to be refused. All of
// that is exercised here over a real socket, with a blob the size of a real
// SDP - three kilobytes, which is the only length that uses the 16-bit path.
//
// THE PEER CONNECTION. net.js drives WebRTC, and WebRTC in a headless browser
// is exactly the sort of thing that works in theory. So this loads net.js in
// Chrome and connects it TO ITSELF: one page, two RTCPeerConnections, the host
// and join blobs passed between them by hand, then a real state packet sent
// down a real DataChannel and unpacked at the far end. If that round trip
// works, two machines will work, because nothing in between is different.
//
// Not run by anything else and imported by nothing: dev only, like the rest of
// tools/. physics.test.js covers the packet format on its own, which is the
// part that can be tested without a browser at all.

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RELAY_PORT = 8781;
const PAGE_PORT = 8782;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}  ${detail}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const c = [
    `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  const hit = c.find((p) => p && existsSync(p));
  if (!hit) { console.error('no Chrome found; edit findBrowser()'); process.exit(2); }
  return hit;
}

// ========================================================================
console.log('\nthe relay');
// ========================================================================

const relay = spawn(process.execPath, [join(ROOT, 'tools', 'relay.js'), String(RELAY_PORT)],
  { cwd: ROOT, stdio: 'ignore' });
await wait(900);

try {
  const r = await fetch(`http://127.0.0.1:${RELAY_PORT}/`);
  check('it serves the game at the root',
    r.status === 200 && (await r.text()).includes('<canvas'));
  const js = await fetch(`http://127.0.0.1:${RELAY_PORT}/net.js`);
  check('and the modules, as javascript',
    js.status === 200 && (js.headers.get('content-type') || '').includes('javascript'));
  check('and 404s what is not there',
    (await fetch(`http://127.0.0.1:${RELAY_PORT}/nope.js`)).status === 404);
  // A path that climbs out of the project is either a mistake or an attack.
  const esc = await fetch(`http://127.0.0.1:${RELAY_PORT}/../../../Windows/win.ini`);
  check('and refuses to serve outside the project', esc.status !== 200, `got ${esc.status}`);
} catch (e) {
  check('the relay answered http at all', false, e.message);
}

// A blob the size of a real SDP. Anything shorter uses the 7-bit length and
// never touches the 16-bit path, which is the one a handshake actually needs.
const big = 'x'.repeat(3000);
const got = await new Promise((resolve) => {
  const a = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/`);
  const b = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/`);
  const timer = setTimeout(() => resolve(null), 4000);
  let ready = 0;
  const go = () => {
    if (++ready < 2) return;
    a.send(JSON.stringify({ room: 'r1', role: 'host' }));
    b.send(JSON.stringify({ room: 'r1', role: 'join' }));
    setTimeout(() => a.send(JSON.stringify({ room: 'r1', sdp: big })), 120);
  };
  a.onopen = go; b.onopen = go;
  b.onmessage = (e) => { clearTimeout(timer); resolve(JSON.parse(e.data).sdp); };
  a.onmessage = () => { clearTimeout(timer); resolve('IT ECHOED TO THE SENDER'); };
});
check('a full-size blob reaches the other end of the room, whole', got === big,
  got === null ? 'nothing arrived' : `${String(got).length} chars back`);

const leaked = await new Promise((resolve) => {
  const a = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/`);
  const b = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/`);
  const timer = setTimeout(() => resolve(false), 1500);
  let ready = 0;
  const go = () => {
    if (++ready < 2) return;
    b.send(JSON.stringify({ room: 'beta', role: 'join' }));
    setTimeout(() => a.send(JSON.stringify({ room: 'alpha', sdp: 'secret' })), 120);
  };
  a.onopen = go; b.onopen = go;
  b.onmessage = () => { clearTimeout(timer); resolve(true); };
});
check('and does not leak into a different room', leaked === false);
relay.kill();

// ========================================================================
console.log('\nthe peer connection');
// ========================================================================

// One page, two peers, the blobs passed between them in JavaScript instead of
// by a human with a clipboard. Every line of net.js's handshake runs.
const page = `<!doctype html><meta charset="utf-8"><body>
<script type="module">
import { netHost, netJoin, netFinish, netOnPacket, netSendPacket, netLive,
         netState, netNote, packState, unpackState } from '/net.js';
const say = (o) => fetch('/__report', { method: 'POST', body: JSON.stringify(o) });
window.addEventListener('error', (e) => say({ err: e.message }));
window.addEventListener('unhandledrejection', (e) => say({ err: 'rejected: ' + e.reason }));

// net.js holds ONE connection, which is right for the game and awkward here,
// so the far end is built with the same raw API by hand. That is honest: it is
// the other machine, and the other machine is not this module.
const far = new RTCPeerConnection({ iceServers: [] });
let farCh = null;
far.ondatachannel = (e) => { farCh = e.channel; farCh.binaryType = 'arraybuffer'; };
const farGathered = () => new Promise((res) => {
  if (far.iceGatheringState === 'complete') return res();
  far.onicegatheringstatechange = () => { if (far.iceGatheringState === 'complete') res(); };
  setTimeout(res, 4000);
});

try {
  const offer = await netHost();
  await far.setRemoteDescription(JSON.parse(atob(offer)));
  const answer = await far.createAnswer();
  await far.setLocalDescription(answer);
  await farGathered();
  await netFinish(btoa(JSON.stringify(far.localDescription)));

  const t0 = Date.now();
  while (!netLive() && Date.now() - t0 < 12000) await new Promise((r) => setTimeout(r, 50));

  let echoed = null;
  if (netLive() && farCh) {
    // The far end echoes whatever it is sent; net.js unpacks the echo.
    const back = new Promise((res) => { netOnPacket(res); setTimeout(() => res(null), 4000); });
    farCh.onmessage = (e) => farCh.send(e.data);
    netSendPacket(packState({
      world: 1, seq: 42, health: 73, hurt: 0.5,
      M: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0.1,0.2,0.3,1.07],
      vel: [0.5, -0.25, 0.125],
      boom: [1, 2, 3, 4],
      blockState: 2, block: [5, 6, 7, 8], blockR: 0.34,
      decoy: null, cut: null, blast: null,
    }));
    echoed = await back;
  }
  say({ live: netLive(), state: netState(), note: netNote(), echoed, offerLen: offer.length });
} catch (e) { say({ err: e.message + ' [' + netState() + ']' }); }
</script></body>`;

let done = null;
const srv = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/__report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { res.writeHead(200); res.end('ok'); done(JSON.parse(body)); });
    return;
  }
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page);
    return;
  }
  const f = join(ROOT, decodeURIComponent(url));
  if (!existsSync(f)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => srv.listen(PAGE_PORT, r));

const child = spawn(findBrowser(), [
  '--headless=new', `--user-data-dir=${join(tmpdir(), 'netcheck')}`,
  '--no-first-run', '--no-default-browser-check',
  `http://127.0.0.1:${PAGE_PORT}/`,
], { stdio: 'ignore' });

const report = await new Promise((resolve) => {
  done = resolve;
  setTimeout(() => resolve(null), 40000);
});
child.kill();
srv.close();

if (!report) {
  check('the page reported back', false, 'nothing within 40 s');
} else if (report.err) {
  check('net.js ran without throwing', false, report.err);
} else {
  check('the handshake blob is a pasteable single token',
    report.offerLen > 200 && report.offerLen < 20000, `${report.offerLen} characters`);
  check('two peers connect over a real data channel', report.live === true,
    `${report.state} - ${report.note}`);
  const e = report.echoed;
  check('and a state packet survives the wire intact',
    !!e && e.world === 1 && e.seq === 42 && e.health === 73
    && Math.abs(e.vel[2] - 0.125) < 1e-6 && Math.abs(e.M[15] - 1.07) < 1e-6
    && e.blockState === 2 && Math.abs(e.blockR - 0.34) < 1e-6 && e.decoy === null,
    e ? JSON.stringify(e).slice(0, 120) : 'nothing came back');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
