// Browser-only view. Geometry, simulation, and option rules stay with the caller.
export function createWorldMenu({ presets, onPreset, onOption, onClose }) {
  const panel = document.createElement('section');
  panel.id = 'menu';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'menu-title');
  panel.innerHTML = `
    <div class="menu-shell">
      <header class="menu-header">
        <div><p class="eyebrow">CURVED SPACE / PLAYGROUND</p>
          <h1 id="menu-title">Choose your world</h1>
          <p class="menu-intro">Different geometry. Different ways to move.</p></div>
        <button type="button" class="resume" data-close>Return to game <kbd>O</kbd></button>
      </header>
      <div class="world-grid"></div>
      <p><a href="tools/region-lab.html">Spherical editor</a> · <a href="tools/ball-lab.html">Flat editor</a> · <a href="tools/connected-preview.html">Connected portal preview</a> · <a href="tools/spherical-cover.html">Full S3 loop</a></p>
      <p class="menu-status" role="status" aria-live="polite"></p>
      <details class="settings"><summary>Customize world &amp; performance</summary>
        <p class="settings-help">Settings marked as fixed are required by this world.
          Your previous choices return when you switch back.</p>
        <div class="settings-grid"></div>
      </details>
      <footer class="menu-footer"><span>WASD move · mouse look · R reset · K restart course</span>
        <span>1–9 choose a world · O / Esc close</span></footer>
    </div>`;
  document.body.appendChild(panel);
  const grid = panel.querySelector('.world-grid');
  for (const [index, [key, preset]] of Object.entries(presets).entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'world-card';
    button.dataset.preset = key;
    const badge = document.createElement('span');
    badge.className = 'world-badge';
    badge.textContent = `${String(index + 1).padStart(2, '0')} / ${preset.set.curv}`;
    const title = document.createElement('strong');
    title.textContent = preset.label;
    const note = document.createElement('span');
    note.className = 'world-note';
    note.textContent = preset.note;
    const action = document.createElement('span');
    action.className = 'world-action';
    action.textContent = 'Select world →';
    button.append(badge, title, note, action);
    button.addEventListener('click', () => onPreset(key));
    grid.appendChild(button);
  }
  panel.querySelector('[data-close]').addEventListener('click', onClose);
  // Keep Tab inside the dialog; native buttons/selects handle Enter and Space.
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [...panel.querySelectorAll('button, select, summary')]
      .filter((item) => !item.disabled && item.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  const fields = new Map();
  return {
    element: panel,
    focus() { panel.querySelector('[data-close]').focus(); },
    update({ open, options, values, reasons, selected, busy, status }) {
      panel.hidden = !open;
      panel.setAttribute('aria-busy', String(busy));
      panel.querySelector('.menu-status').textContent = status;
      for (const button of grid.children) {
        button.disabled = busy;
        button.setAttribute('aria-pressed', String(button.dataset.preset === selected));
      }
      for (const [key, option] of Object.entries(options)) {
        if (!fields.has(key)) {
          const row = document.createElement('div');
          row.className = 'setting-row';
          const label = document.createElement('label');
          label.htmlFor = `option-${key}`;
          label.textContent = option.label;
          const select = document.createElement('select');
          select.id = label.htmlFor;
          select.dataset.option = key;
          select.setAttribute('aria-describedby', `reason-${key}`);
          if (key === 'fog') {
            select.title = 'Off: no distance fade. Every world still has a finite view range.';
          }
          for (const value of option.values) {
            const choice = document.createElement('option');
            choice.value = value; choice.textContent = value;
            select.appendChild(choice);
          }
          select.addEventListener('change', () => onOption(key, select.value));
          const reason = document.createElement('small');
          reason.id = `reason-${key}`;
          row.append(label, select, reason);
          if (key === 'fog') {
            const hint = document.createElement('small');
            hint.id = 'hint-fog';
            hint.className = 'fog-hint';
            hint.textContent = 'Off: no distance fade. Every world still has a finite view range.';
            row.append(hint);
            select.setAttribute('aria-describedby', `reason-${key} hint-fog`);
          }
          panel.querySelector('.settings-grid').appendChild(row);
          fields.set(key, { select, reason });
        }
        const { select, reason } = fields.get(key);
        select.value = values[key];
        select.disabled = busy || key in reasons;
        reason.textContent = reasons[key] ? `Fixed: ${reasons[key]}` : '';
      }
    },
  };
}
