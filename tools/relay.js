// tools/relay.js — serve the game, and introduce two players to each other.
//
//   node tools/relay.js            then open  http://localhost:8080/
//   node tools/relay.js 9000       to use a different port
//
// TWO JOBS, AND THE SECOND ONE IS TINY.
//
// It is an ordinary static file server for the project directory, so you do
// not need Live Server as well - and it is a WebSocket signalling relay, whose
// entire job is to hand one blob of text to the other member of a named room.
//
// SIGNALLING IS NOT THE GAME TRAFFIC. Once the two browsers have swapped their
// two blobs they talk to each other directly over WebRTC, and nothing else
// goes through here. This process could be killed mid-match and the match
// would carry on. That is why it is allowed to be this small: it is not on the
// hot path, so it does not have to be fast, and it holds no game state, so it
// does not have to be correct about anything except who is in which room.
//
// No dependencies, because the project has none and is not getting any. Node
// has an HTTP server but no WebSocket server, so the handshake and the frame
// format are written out below. They are both short. See RFC 6455.
//
// This file is dev-and-hosting scaffolding: nothing in the game imports it,
// and the copy-and-paste connection path in net.js works without it.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8080;
const ROOT = path.resolve(__dirname, '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.md': 'text/markdown; charset=utf-8',
};

// --- the static half ----------------------------------------------------

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  // Never serve outside the project. A path that escapes ROOT is either a
  // mistake or an attack and neither deserves an answer.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      // The shaders and the level change constantly during development, and a
      // cached copy of either is an hour of debugging a bug you already fixed.
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

// --- the signalling half ------------------------------------------------

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const rooms = new Map();       // name -> Set of sockets

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', '',
  ].join('\r\n'));
  socket.setNoDelay(true);
  wire(socket);
});

function wire(socket) {
  let buf = Buffer.alloc(0);
  let room = null;

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const msg = readFrame(buf);
      if (!msg) break;
      buf = buf.subarray(msg.used);
      if (msg.opcode === 8) { socket.end(); return; }
      if (msg.opcode !== 1) continue;         // text frames only
      let m;
      try { m = JSON.parse(msg.text); } catch (e) { void e; continue; }
      if (!m || typeof m.room !== 'string') continue;
      if (!room) {
        room = m.room;
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room).add(socket);
        console.log(`[relay] ${room}: ${rooms.get(room).size} here`);
      }
      // Forward anything with an sdp to everyone else in the room. That is
      // the whole protocol. The relay does not know or care which blob is an
      // offer and which is an answer - the two ends do.
      if (m.sdp) {
        for (const peer of rooms.get(room)) {
          if (peer !== socket && !peer.destroyed) peer.write(writeFrame(msg.text));
        }
      }
    }
  });

  const bye = () => {
    if (room && rooms.has(room)) {
      rooms.get(room).delete(socket);
      if (rooms.get(room).size === 0) rooms.delete(room);
    }
  };
  socket.on('close', bye);
  socket.on('error', bye);
}

/**
 * One frame off the front of the buffer, or null if it is not all here yet.
 *
 * Client-to-server frames are always MASKED - the spec requires it, and a
 * server that forgets to unmask reads four bytes of key XORed through every
 * byte of the payload and sees convincing garbage.
 */
function readFrame(b) {
  if (b.length < 2) return null;
  const opcode = b[0] & 0x0f;
  const masked = (b[1] & 0x80) !== 0;
  let len = b[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (b.length < off + 2) return null;
    len = b.readUInt16BE(off); off += 2;
  } else if (len === 127) {
    if (b.length < off + 8) return null;
    // Signalling blobs are a couple of kilobytes; anything claiming to need
    // 64 bits of length is not this protocol.
    len = Number(b.readBigUInt64BE(off)); off += 8;
    if (len > 1 << 20) return { used: b.length, opcode: 8, text: '' };
  }
  const keyOff = off;
  if (masked) off += 4;
  if (b.length < off + len) return null;
  const data = Buffer.from(b.subarray(off, off + len));
  if (masked) for (let i = 0; i < len; i++) data[i] ^= b[keyOff + (i & 3)];
  return { used: off + len, opcode, text: data.toString('utf8') };
}

/** And back the other way. Server-to-client frames are never masked. */
function writeFrame(text) {
  const data = Buffer.from(text, 'utf8');
  let head;
  if (data.length < 126) {
    head = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x81; head[1] = 126; head.writeUInt16BE(data.length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([head, data]);
}

server.listen(PORT, () => {
  console.log(`serving ${ROOT}`);
  console.log(`  play here          http://localhost:${PORT}/`);
  console.log(`  relay for signals  ws://localhost:${PORT}/`);
  console.log('');
  console.log('For a game on this network, the other player opens');
  console.log(`  http://<this machine's LAN address>:${PORT}/`);
  console.log('and both press N, pick "relay", and use the same room name.');
});
