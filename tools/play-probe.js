// Appended ONLY by tools/play-check.js, inside the real main.js module scope.
//
// world-probe.js proves that every world STARTS: it applies each preset and
// runs a handful of frames. Nothing proved that a world SURVIVES BEING
// PLAYED, and that is a different question - the bugs that live there need a
// face crossing, a carried object, an ability and a few thousand frames to
// line up. A reported crash in arena fight after "a few seconds of moving
// around" is exactly that shape, and no existing check could have caught it.
//
// The input is seeded, so a failure replays: same --seed, same run.
(async () => {
  const out = { checks: [], err: '', stack: '', where: '', log: [], hud: '' };
  const frames = async (n = 1) => {
    for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame);
  };
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

  // The stack is the whole point of this tool. A bare message says
  // "geom.js:80", which is apply() - a leaf with forty callers.
  window.addEventListener('error', (e) => {
    if (out.err) return;
    out.err = e.message || String(e.error);
    out.stack = (e.error && e.error.stack) || '';
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (out.err) return;
    out.err = `unhandled rejection: ${(e.reason && e.reason.message) || e.reason}`;
    out.stack = (e.reason && e.reason.stack) || '';
  });

  const q = new URLSearchParams(location.search);
  const PRESET = q.get('preset') || 'fight';
  const STEPS = Number(q.get('frames') || 3000);
  const SWITCH = q.get('switch') === '1';
  let seed = (Number(q.get('seed') || 1) >>> 0) || 1;
  // xorshift32: no dependencies, and identical in every browser, so a seed
  // names one exact run rather than "roughly that again".
  const rnd = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };

  // main.js clears `keys` every frame unless the canvas holds pointer lock,
  // and headless Chrome never grants it. This is a SYNTHETIC stand-in: it
  // exercises the movement, physics and rendering path, and proves nothing
  // about real pointer-lock behaviour, which stays a manual check.
  Object.defineProperty(document, 'pointerLockElement',
    { get: () => canvas, configurable: true });

  const MOVE = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft'];
  // In-play abilities only. K and R are world-state controls: K switches the
  // hoop course on and beginRun MOVES the player to its start, so leaving
  // them in the random stream teleports the run back to spawn every few
  // hundred frames and it never travels far enough to cross a face -- which
  // is the one thing this tool is for. World switching has its own --switch.
  const KIT = ['KeyB', 'KeyG', 'KeyV', 'KeyT', 'KeyE', 'KeyQ', 'KeyF', 'KeyH',
               'Digit1', 'Digit2', 'Digit3', 'KeyZ', 'KeyC', 'KeyX'];
  const SWITCH_TO = ['fight', 'hoops', 'grapple', 'light'];
  const held = new Set();
  const openMenu = () => document.getElementById('worlds-button').click();
  const closeMenu = () => document.querySelector('[data-close]').click();
  const settle = async () => { do { await frames(1); } while (menuBusy); };

  async function pickPreset(name) {
    openMenu();
    await frames(2);
    document.querySelector(`[data-preset="${name}"]`).click();
    await settle();
    // Input is isolated while the menu is open, so a run that forgets to
    // close it measures a player standing perfectly still for an hour.
    closeMenu();
    await settle();
  }

  const bad = () => {
    if (out.err) return 'threw';
    if (![...player].every(Number.isFinite)) return 'placement went non-finite';
    if (/NaN|Infinity/.test(hud.textContent || '')) return 'HUD reads NaN';
    return null;
  };

  try {
    await frames(20);
    await pickPreset(PRESET);
    out.checks.push(`preset ${PRESET} applied, menu closed (open=${optOpen})`);
    if (bad()) throw new Error(`already broken after the preset: ${bad()}`);

    // Count folds by ACCUMULATING the rise in main.js's counter, because
    // restartWorld resets it to zero: a K late in the run would otherwise
    // erase the evidence that this run folded at all.
    let folds = 0, prevCrossings = typeof crossings === 'number' ? crossings : 0;
    // Purely random input wanders, and a wandering player can spend a whole
    // run inside one cell -- seed 7 crossed no face in 4000 frames, which is
    // a test that proves nothing. So every run alternates: a WANDER phase
    // that mixes the kit in, and a MARCH phase that just walks a nearly
    // straight line, which in a cell of inradius 1.53 reliably leaves it.
    const CYCLE = 420, MARCH = 170;
    // Holding W is not enough on its own: the arena is a pinwheel of walls, so
    // a march that starts facing one walks on the spot at full speed and still
    // never leaves the cell (seed 9 did exactly that -- 1.98 speed, 0 folds).
    // Watch the position, and when it stops changing, turn hard and try again,
    // which is what a player does when they walk into a wall.
    const SPAN = 60, MIN_TRAVEL = 0.08;
    let mark = point(player), markAt = 0;
    for (let i = 0; i < STEPS; i++) {
      if (i - markAt >= SPAN) {
        const here = point(player);
        if (dist(mark, here) < MIN_TRAVEL) {
          // A big deliberate turn, not another small random one.
          window.dispatchEvent(new MouseEvent('mousemove', {
            movementX: (rnd() < 0.5 ? -1 : 1) * (300 + rnd() * 400),
            movementY: 0, bubbles: true,
          }));
          out.log.push(`f${i} stuck, turning`);
        }
        mark = here; markAt = i;
      }
      const marching = (i % CYCLE) >= CYCLE - MARCH;
      if (marching && !held.has('KeyW')) {
        for (const k of held) release(k);
        held.clear();
        key('KeyW'); held.add('KeyW');
      }
      if (!marching && rnd() < 0.05) {
        const k = MOVE[Math.floor(rnd() * MOVE.length)];
        if (held.has(k)) { release(k); held.delete(k); } else { key(k); held.add(k); }
      }
      // Keep walking. Purely random toggling spends much of a run with
      // nothing held, and a player who never moves never crosses a face -
      // which is the one thing this tool exists to make happen.
      if (!marching && !held.has('KeyW') && !held.has('KeyS') && rnd() < 0.5) {
        key('KeyW'); held.add('KeyW');
      }
      // Not while marching: recall (H) and the anchor swap (E) TELEPORT the
      // player back down their own path, so a march that fires the kit
      // undoes its own travel and the run never leaves the cell. Seed 7 hit
      // recall three times in its last stretch and crossed nothing.
      if (!marching && rnd() < 0.03) {
        const k = KIT[Math.floor(rnd() * KIT.length)];
        out.log.push(`f${i} ${k}`);
        key(k); release(k);
      }
      // The grapple is a hold, not a tap, so press and release separately.
      if (!marching && rnd() < 0.02) {
        canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
        out.log.push(`f${i} grapple`);
      }
      // Always allow the release, or a rope taken out just before a march
      // stays attached and tethers the whole travel phase.
      if (marching || rnd() < 0.03) {
        window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      }
      if (SWITCH && rnd() < 0.004) {
        const n = SWITCH_TO[Math.floor(rnd() * SWITCH_TO.length)];
        out.log.push(`f${i} SWITCH ${n}`);
        for (const k of held) release(k);
        held.clear();
        await pickPreset(n);
      }
      if (!marching) {
        // Gentle turning on purpose: a violently swinging view walks in a
        // tight circle and never leaves the middle of the cell.
        window.dispatchEvent(new MouseEvent('mousemove', {
          movementX: (rnd() - 0.5) * 18, movementY: (rnd() - 0.5) * 8, bubbles: true,
        }));
      }
      await frames(1);
      const now = typeof crossings === 'number' ? crossings : 0;
      if (now > prevCrossings) folds += now - prevCrossings;
      prevCrossings = now;
      const why = bad();
      if (why) {
        out.where = `frame ${i} of ${STEPS}: ${why}; recent input: ${out.log.slice(-5).join(' | ')}`;
        break;
      }
    }
    for (const k of held) release(k);
    // A run that never crossed a face never exercised a fold, and the fold is
    // where every carried object is moved. Say so rather than passing quietly.
    out.checks.push(`played ${out.where ? out.where.split(' ')[1] : STEPS} frames, ${folds} face crossings (counter now ${prevCrossings})`);
    out.crossings = folds;
    out.hud = (hud.textContent || '').split('\n')[0].trim();
  } catch (error) {
    if (!out.err) { out.err = error.message; out.stack = error.stack || ''; }
  }
  out.log = out.log.slice(-30);
  fetch('/__report', { method: 'POST', body: JSON.stringify(out) });
})();
