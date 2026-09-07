// net.js — two players in the same manifold, over WebRTC.
//
// WHAT IS ORDINARY HERE AND WHAT IS NOT
//
// The netcode is completely ordinary: an unreliable data channel, each peer
// authoritative over its own body, twenty state packets a second, and the
// remote body smoothed between them. Nothing about that is special and nothing
// about it should be.
//
// The STATE is the part that is not ordinary, and it is worth being precise
// about why it turns out to be easy anyway.
//
// A player's position is a point of H^3/Gamma, and a point of a quotient has
// infinitely many names - one per group element. Two peers walking the same
// route will in general be holding DIFFERENT representatives of the same
// place, because each folded at whatever moment its own substep crossed a
// face. So a naive "send me your coordinates" is meaningless: my (0.4, 0, 0.6)
// and your (0.4, 0, 0.6) are the same point only by luck.
//
// The fix is already in the game, because the renderer needed it first.
// reduceToDomain is CANONICAL - reduce(g*p) is exactly reduce(p) for every g
// in the group, which hyp.test.js pins - so the folded representative is a
// genuine name for a point of the manifold, agreed on by anyone running the
// same group. Fold everything before it goes on the wire and the packet means
// the same thing at both ends.
//
// Two consequences worth stating:
//
//   - BOTH PEERS MUST BE IN THE SAME WORLD. The two worlds use different
//     groups and therefore different fundamental domains, so a folded point
//     from one is nonsense in the other. The world index rides in every
//     packet and the receiver refuses to draw a mismatch.
//   - EVERY DISTANCE BETWEEN PLAYERS IS AN ORBIT DISTANCE. Folded coordinates
//     can differ by a whole cell for two players standing next to each other
//     across a face. physics.orbitDist is the only correct comparison, and it
//     is what the hit tests already use.
//
// Interest management, if this ever grew past two players, is INVERTED
// compared to a flat game: volume grows like e^(2r), so almost everyone is
// far away and cheap to cull, and the handful of people near you dominate.
// A flat game's uniform grid is exactly the wrong data structure.
//
// No DOM is touched here, and nothing browser-only is referenced at module
// scope, so this file imports cleanly under Node and the packet format can be
// tested there. See physics.test.js.

// --- the packet ---------------------------------------------------------
//
// One fixed-size Float32Array. Fixed-size because there is nothing here worth
// the complexity of a variable layout: 56 floats is 224 bytes, and at 20 Hz
// that is under four kilobytes a second, which is nothing on any connection
// that can carry voice.
//
// Everything positional in here has been FOLDED by the sender. See above.

export const PACKET_FLOATS = 56;

export const F = {
  TYPE: 0,          // 1 = state
  WORLD: 1,         // 0 bounded (octagon), 1 open (dodecahedron)
  SEQ: 2,
  HEALTH: 3,
  HURT: 4,
  M: 5,             // 5..20  placement, column-major, folded
  VEL: 21,          // 21..23 velocity in FRAME components
  BOOM_ON: 24,
  BOOM: 25,         // 25..28
  BLOCK_ON: 29,     // 0 none, 1 forming, 2 solid
  BLOCK: 30,        // 30..33
  BLOCK_R: 34,
  DECOY_ON: 35,
  DECOY: 36,        // 36..39
  CUT_ON: 40,
  CUT_AT: 41,       // 41..44
  CUT_N: 45,        // 45..48  the plane normal, carried by the same element
  BLAST_ON: 49,
  BLAST: 50,        // 50..53
  BLAST_R: 54,
  SPARE: 55,
};

/** Build a packet from a plain description. Nothing here is browser-only. */
export function packState(s) {
  const a = new Float32Array(PACKET_FLOATS);
  a[F.TYPE] = 1;
  a[F.WORLD] = s.world | 0;
  a[F.SEQ] = s.seq | 0;
  a[F.HEALTH] = s.health;
  a[F.HURT] = s.hurt || 0;
  for (let i = 0; i < 16; i++) a[F.M + i] = s.M[i];
  for (let i = 0; i < 3; i++) a[F.VEL + i] = s.vel[i];
  const put = (on, base, p) => {
    a[on] = p ? 1 : 0;
    if (p) for (let i = 0; i < 4; i++) a[base + i] = p[i];
  };
  put(F.BOOM_ON, F.BOOM, s.boom);
  a[F.BLOCK_ON] = s.blockState || 0;
  if (s.block) for (let i = 0; i < 4; i++) a[F.BLOCK + i] = s.block[i];
  a[F.BLOCK_R] = s.blockR || 0;
  put(F.DECOY_ON, F.DECOY, s.decoy);
  a[F.CUT_ON] = s.cut ? 1 : 0;
  if (s.cut) {
    for (let i = 0; i < 4; i++) a[F.CUT_AT + i] = s.cut.at[i];
    for (let i = 0; i < 4; i++) a[F.CUT_N + i] = s.cut.N[i];
  }
  a[F.BLAST_ON] = s.blast ? 1 : 0;
  if (s.blast) {
    for (let i = 0; i < 4; i++) a[F.BLAST + i] = s.blast.at[i];
    a[F.BLAST_R] = s.blast.r;
  }
  return a;
}

/** And read one back. Returns null for anything that is not a state packet. */
export function unpackState(a) {
  if (!a || a.length < PACKET_FLOATS || a[F.TYPE] !== 1) return null;
  const get = (base) => [a[base], a[base + 1], a[base + 2], a[base + 3]];
  return {
    world: a[F.WORLD] | 0,
    seq: a[F.SEQ] | 0,
    health: a[F.HEALTH],
    hurt: a[F.HURT],
    M: Array.from(a.subarray(F.M, F.M + 16)),
    vel: [a[F.VEL], a[F.VEL + 1], a[F.VEL + 2]],
    boom: a[F.BOOM_ON] > 0.5 ? get(F.BOOM) : null,
    blockState: a[F.BLOCK_ON] | 0,
    block: a[F.BLOCK_ON] > 0.5 ? get(F.BLOCK) : null,
    blockR: a[F.BLOCK_R],
    decoy: a[F.DECOY_ON] > 0.5 ? get(F.DECOY) : null,
    cut: a[F.CUT_ON] > 0.5 ? { at: get(F.CUT_AT), N: get(F.CUT_N) } : null,
    blast: a[F.BLAST_ON] > 0.5 ? { at: get(F.BLAST), r: a[F.BLAST_R] } : null,
  };
}

// --- the connection -----------------------------------------------------
//
// WebRTC, because it is the only way for two browsers to talk to each other
// DIRECTLY, and direct is what a fighting game wants: a relayed packet takes
// two trips and one of them is to a machine neither player is sitting at.
//
// Signalling is the awkward part of WebRTC and there is no way round it: the
// two ends have to exchange one blob of text each before they can find one
// another. Two ways to do that are wired up here.
//
//   COPY AND PASTE. No server of any kind. The host generates an offer, sends
//   it to the other player by whatever they already use to talk - a message,
//   an email - and pastes back the answer. Slightly clumsy, completely free,
//   and it works over the open internet.
//
//   A RELAY. tools/relay.js is a ~150-line WebSocket server with no
//   dependencies whose entire job is to hand one blob to the other end of a
//   named room. Run it on one machine for a LAN game, or on any host with an
//   open port for the internet. It sees the two handshake blobs and nothing
//   else: once the peers connect, the game traffic does not go near it.
//
// ICE is gathered fully before the blob is produced (no trickle), so each blob
// is self-contained and pasteable. That costs a second or two at connect time
// and saves a whole message-ordering problem.

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

let pc = null;
let ch = null;
let onPacketCb = null;
let state = 'idle';     // idle | offering | answering | waiting | live | failed
let note = '';

export function netState() { return state; }
export function netNote() { return note; }
export function netLive() { return state === 'live' && ch && ch.readyState === 'open'; }
export function netOnPacket(cb) { onPacketCb = cb; }

function fresh() {
  netClose();
  pc = new RTCPeerConnection({ iceServers: ICE });
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      state = 'failed';
      note = 'the connection dropped';
    }
  };
  return pc;
}

export function netClose() {
  if (ch) { try { ch.close(); } catch (e) { void e; } }
  if (pc) { try { pc.close(); } catch (e) { void e; } }
  ch = null; pc = null;
  state = 'idle'; note = '';
}

/** Wire a data channel up once we have one, from either side. */
function adopt(c) {
  ch = c;
  ch.binaryType = 'arraybuffer';
  ch.onopen = () => { state = 'live'; note = 'connected'; };
  ch.onclose = () => { if (state === 'live') { state = 'failed'; note = 'the other player left'; } };
  ch.onmessage = (e) => {
    if (!onPacketCb) return;
    const p = unpackState(new Float32Array(e.data));
    if (p) onPacketCb(p);
  };
}

/** Wait for ICE gathering to finish, so the SDP blob is complete. */
function gathered(conn) {
  return new Promise((resolve) => {
    if (conn.iceGatheringState === 'complete') { resolve(); return; }
    // A cap, because a network with no reachable STUN server never completes
    // and the host-candidate-only blob is perfectly good on a LAN.
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 4000);
    conn.onicegatheringstatechange = () => {
      if (conn.iceGatheringState === 'complete') done();
    };
  });
}

// The blobs are base64 so they survive being pasted into a chat window that
// helpfully reformats whitespace. SDP is line-oriented and a stray newline is
// fatal to it, which is exactly the sort of thing a chat client does.
const enc = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '');
const dec = (s) => JSON.parse(atob(s.trim().replace(/\s+/g, '')));

/** HOST: make an offer to send to the other player. */
export async function netHost() {
  const conn = fresh();
  // ordered:false, maxRetransmits:0 - an unreliable channel, on purpose. A
  // state packet that arrives late is worse than useless: it would overwrite a
  // newer one. Twenty a second means the next is 50 ms away, so a lost packet
  // costs one frame of smoothing and nothing else.
  adopt(conn.createDataChannel('play', { ordered: false, maxRetransmits: 0 }));
  const offer = await conn.createOffer();
  await conn.setLocalDescription(offer);
  await gathered(conn);
  state = 'offering';
  note = 'send this code to the other player, then paste their reply';
  return enc(conn.localDescription);
}

/** JOIN: take the host's offer, return the answer to send back. */
export async function netJoin(offerCode) {
  const conn = fresh();
  conn.ondatachannel = (e) => adopt(e.channel);
  await conn.setRemoteDescription(dec(offerCode));
  const answer = await conn.createAnswer();
  await conn.setLocalDescription(answer);
  await gathered(conn);
  state = 'answering';
  note = 'send this code back to the host';
  return enc(conn.localDescription);
}

/** HOST: finish, with the answer the other player sent back. */
export async function netFinish(answerCode) {
  if (!pc) throw new Error('there is no offer outstanding');
  await pc.setRemoteDescription(dec(answerCode));
  state = 'waiting';
  note = 'connecting...';
}

/** Send one packet, if there is anywhere to send it. */
export function netSendPacket(a) {
  if (!netLive()) return false;
  try { ch.send(a); return true; } catch (e) { void e; return false; }
}

// --- automatic signalling, through a relay ------------------------------
//
// Same handshake, with the copying and pasting done by a socket. The relay
// only ever forwards two blobs between the two members of a named room; it
// does not see a single frame of the game.

export async function netConnectVia(url, room, asHost) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
    const fail = (why) => { state = 'failed'; note = why; try { ws.close(); } catch (e) { void e; } reject(new Error(why)); };
    const timer = setTimeout(() => fail('the relay did not answer'), 8000);
    ws.onerror = () => { clearTimeout(timer); fail('could not reach the relay'); };
    ws.onopen = async () => {
      ws.send(JSON.stringify({ room, role: asHost ? 'host' : 'join' }));
      if (asHost) {
        state = 'waiting';
        note = 'waiting for the other player';
        const offer = await netHost();
        ws.send(JSON.stringify({ room, sdp: offer }));
        state = 'waiting';
        note = 'waiting for the other player';
      }
    };
    ws.onmessage = async (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { void err; return; }
      if (!msg.sdp) return;
      clearTimeout(timer);
      if (asHost) {
        await netFinish(msg.sdp);
      } else {
        const answer = await netJoin(msg.sdp);
        ws.send(JSON.stringify({ room, sdp: answer }));
      }
      state = 'waiting';
      note = 'connecting...';
      resolve(true);
      setTimeout(() => { try { ws.close(); } catch (err) { void err; } }, 3000);
    };
  });
}
