// Appended ONLY by page-check --worlds, inside the real main.js module scope.
// Exercises real DOM controls and input against the actual WebGL application.
(async () => {
  const checks = [];
  const check = (condition, name) => {
    if (!condition) throw new Error(name);
    checks.push(name);
  };
  const frames = async (count = 4) => {
    for (let i = 0; i < count; i++) await new Promise(requestAnimationFrame);
  };
  const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const openMenu = () => document.getElementById('worlds-button').click();
  const closeMenu = () => document.querySelector('[data-close]').click();
  const settle = async () => { do { await frames(1); } while (menuBusy); };
  function validPlacement(label) {
    check([...player, ...vel].every(Number.isFinite), `${label}: finite state`);
    const k = geomKey();
    const p = k === 'h2r' ? H2R.point(player) : k === 's2r' ? S2R.point(player) : player.slice(12, 16);
    // Each model has its own defining equation, and mixing them up is the
    // whole reason resetForCurvature exists. E^3/Lambda's is the degenerate
    // one: the model is the affine plane x3 = 1, not a quadric at all.
    const form = k === 'h3' ? dot(p, p) : k === 's3' ? p.reduce((s, x) => s + x * x, 0)
      : k === 'h2r' ? H2R.hdot(p, p) : (k === 'e3t' || k === 'nil') ? p[3] : S2R.sdot(p, p);
    check(Math.abs(form - (k === 'h3' || k === 'h2r' ? -1 : 1)) < 1e-6,
      `${label}: placement lies in ${k}`);
    // And the flat one must also stay inside the cell -- nothing else folds
    // the player there, so an unfolded run is the float32 failure waiting.
    if (k === 'e3t') {
      check(p.slice(0, 3).every((x) => Math.abs(x) <= 1.5 + 1e-6),
        `${label}: flat placement is folded into the cell`);
    }
    check(!/NaN|Infinity/.test(hud.textContent), `${label}: finite HUD`);
    check(gl.getError() === gl.NO_ERROR, `${label}: WebGL clean`);
  }
  try {
    await frames(20);
    validPlacement('startup');
    for (const name of PRESET_KEYS) {
      openMenu();
      check(optOpen && !worldMenu.element.hidden, `${name}: menu opens`);
      document.querySelector(`[data-preset="${name}"]`).click();
      await settle();
      check(lastPreset === name, `${name}: preset applied through card`);
      const before = JSON.stringify(player);
      const timeBefore = run && run.t;
      let draws = 0;
      const drawArrays = gl.drawArrays;
      gl.drawArrays = function (...args) { draws++; return drawArrays.apply(this, args); };
      key('KeyW'); key('KeyF'); key('KeyR');
      await frames(5);
      gl.drawArrays = drawArrays;
      check(draws === 0, `${name}: covered scene does not render`);
      check(JSON.stringify(player) === before, `${name}: menu blocks movement and reset`);
      check(!run || run.t === timeBefore, `${name}: menu pauses course`);
      check(keys.size === 0, `${name}: menu has no held movement`);
      for (const k of Object.keys(forcedOpts)) {
        check(document.getElementById(`option-${k}`).disabled, `${name}: ${k} fixed in menu`);
      }
      closeMenu();
      await frames(8);
      validPlacement(name);
      key('KeyW'); await frames(6); release('KeyW');
      key('KeyR');
      if (geomKey() === 's3') check(JSON.stringify(player) === JSON.stringify(S3G.IDENTITY), 'S3 reset uses spherical spawn');
      if (geomKey() === 'h2r') check(JSON.stringify(player) === JSON.stringify(H2R.dropperStart()), 'dropper reset uses deck');
      if (geomKey() === 's2r') check(JSON.stringify(player) === JSON.stringify(S2R.lapStart()), 'lap reset uses start line');
      await frames(5);
      validPlacement(`${name} reset`);
      if (geomKey() !== 'h3') {
        const state = JSON.stringify(player);
        for (const code of ['KeyQ', 'KeyV', 'KeyH', 'KeyT', 'KeyE', 'KeyF']) key(code);
        check(JSON.stringify(player) === state, `${name}: H3 abilities cannot alter placement`);
      }
    }
    openMenu();
    document.querySelector('[data-preset="fight"]').click();
    await settle();
    closeMenu(); await frames(3);
    key('KeyB');
    check(boomerangPoint() !== null, 'H3 throw active before geometry switch');
    openMenu();
    document.querySelector('[data-preset="sphere"]').click();
    await settle();
    const programs = sceneProgs.size;
    closeMenu(); await frames(3);
    check(boomerangPoint() === null && markN === 0 && cutN === 0,
      'switch clears H3 throw and excludes H3 markers');
    key('KeyK'); await frames(3);
    check(optVal('course') === 'off', 'S3 K does not start an H3 course');
    validPlacement('S3 K');
    openMenu();
    document.querySelector('[data-preset="fight"]').click();
    await settle();
    // Every registered geometry has been visited by the preset sweep above, so
    // the cache holds one program each and revisiting builds nothing. Derived
    // from SPACES rather than written out, so adding a geometry does not need
    // this line edited -- it needed it once, at four.
    check(sceneProgs.size === programs && programs === SPACES.length,
      `revisits reuse all ${SPACES.length} cached scene programs`);
    const fullPixels = canvas.width * canvas.height;
    const select = document.getElementById('option-resolution');
    select.value = '50%'; select.dispatchEvent(new Event('change'));
    await settle();
    check(canvas.width * canvas.height <= fullPixels * .251, '50% resolution uses one quarter of the pixels');
    check(renderScale === .5, 'resolution menu changes renderer');
    closeMenu(); await frames(4);
    key('KeyW');
    window.dispatchEvent(new Event('blur'));
    check(keys.size === 0, 'focus loss clears held movement');
    validPlacement('return to H3');
    check(!document.getElementById('boot').textContent, 'no boot errors');
    await fetch('/__report', { method: 'POST', body: JSON.stringify({
      checks, hud: hud.textContent, err: window.__err || '', boot: '', px: 'world transitions checked',
    }) });
  } catch (error) {
    await fetch('/__report', { method: 'POST', body: JSON.stringify({
      checks, hud: hud.textContent, err: error.stack || String(error), boot: '', px: '',
    }) });
  }
})();
