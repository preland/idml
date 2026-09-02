/**
 * Live control panel for the scale bench.
 *
 * Injected next to `probe.js` in `bench.mjs --interactive`. The page is
 * re-measured continuously as it changes, so every misfit is flagged as it
 * appears rather than when you remember to ask. Each flagged element can be
 * given a remedy — cap its scaling, truncate, wrap, scroll, or scroll its
 * parent — applied live so you can see the result before deciding to keep it.
 *
 * Viewport control needs the `__benchSetViewport` binding that `--interactive`
 * exposes; pasted into a devtools console the rest still works and that one
 * control reports itself unavailable.
 */
(() => {
  if (document.getElementById('__scaleBenchPanel')) return;
  const B = window.__scaleBench;
  if (!B) { console.error('[scale-bench] probe.js must load first'); return; }

  const declared = window.__scaleBenchDeclared || null;
  const MARK_MODES = [
    { key: 'pick', label: 'marks: pick', show: true, interactive: true },
    { key: 'show', label: 'marks: show', show: true, interactive: false },
    { key: 'off', label: 'marks: off', show: false, interactive: false },
  ];

  const ui = { scale: 1, volume: 1, markMode: 0, last: null, selected: null };

  const COLORS = { 'truncate-x': '#ef4444', 'clip-y': '#f97316', overlap: '#a855f7',
                   tiny: '#3b82f6', 'doc-overflow-x': '#eab308' };
  const PRESETS = [
    [320, 900], [390, 844], [720, 1280], [800, 600], [1024, 600], [1280, 1024],
    [1366, 768], [1920, 1080], [2560, 1080], [3440, 768], [3840, 2160],
  ];

  const panel = document.createElement('div');
  panel.id = '__scaleBenchPanel';
  panel.setAttribute('data-scale-bench', '');
  panel.style.cssText = [
    'position:fixed', 'top:12px', 'right:12px', 'left:auto', 'width:352px', 'max-height:94vh',
    'overflow:auto', 'z-index:2147483647', 'background:#0f172af7', 'color:#e2e8f0',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace', 'border-radius:10px',
    'padding:12px', 'box-shadow:0 8px 32px #000a', 'border:1px solid #334155',
  ].join(';');

  panel.innerHTML = `
    <div id="sbBar" style="display:flex;align-items:center;gap:8px;margin:-8px -8px 8px;padding:8px;border-radius:8px 8px 0 0">
      <strong title="drag to move" style="font-size:13px;flex:1">scale-bench</strong>
      <span id="sbLive" title="continuous scanning" style="color:#4ade80">● live</span>
      <button id="sbMin" style="all:unset;cursor:pointer;padding:0 6px;color:#94a3b8">–</button>
    </div>
    <div id="sbBody">
      <label style="display:block;margin-bottom:2px">text scale
        <b id="sbScaleV" class="sbNum" title="click to type a value">1.00</b>×</label>
      <input id="sbScale" type="range" min="0.7" max="2.5" step="0.05" value="1" style="width:100%">
      <label style="display:block;margin:8px 0 2px">text volume
        <b id="sbVolV" class="sbNum" title="click to type a value">1.00</b>×</label>
      <input id="sbVol" type="range" min="0.5" max="2.5" step="0.05" value="1" style="width:100%">

      <div style="display:flex;align-items:center;gap:4px;margin:10px 0 0">
        <span style="color:#94a3b8">viewport</span>
        <input id="sbVpW" class="sbIn" type="number" style="width:58px">
        <span style="color:#64748b">×</span>
        <input id="sbVpH" class="sbIn" type="number" style="width:58px">
        <button id="sbVpGo" class="sbBtn">set</button>
        <select id="sbVpPreset" class="sbIn" style="flex:1;min-width:0"></select>
      </div>
      <div id="sbVpNote" style="color:#64748b;margin:3px 0 0"></div>

      <div style="display:flex;gap:6px;margin:10px 0 8px;flex-wrap:wrap">
        <button id="sbSweep" class="sbBtn">sweep</button>
        <button id="sbMarks" class="sbBtn">marks: on</button>
        <button id="sbMode" class="sbBtn">freeze</button>
        <button id="sbReset" class="sbBtn">reset</button>
        <button id="sbSave" class="sbBtn">save policies</button>
      </div>

      <div id="sbCounts" style="margin-bottom:8px"></div>
      <div id="sbWindow" style="margin-bottom:8px"></div>
      <div id="sbPolicy"></div>
      <div id="sbList"></div>
      <div id="sbSaved" style="margin-top:8px"></div>
    </div>
    <style>
      #__scaleBenchPanel .sbBtn{all:unset;cursor:pointer;background:#1e293b;border:1px solid #475569;
        border-radius:5px;padding:3px 7px;font:inherit;color:#e2e8f0}
      #__scaleBenchPanel .sbBtn:hover{background:#334155}
      #__scaleBenchPanel .sbBtn.on{background:#1d4ed8;border-color:#3b82f6}
      #__scaleBenchPanel .sbIn{background:#0b1220;border:1px solid #475569;border-radius:4px;
        color:#e2e8f0;font:inherit;padding:2px 4px}
      #__scaleBenchPanel .sbNum{cursor:pointer;border-bottom:1px dotted #64748b}
      #__scaleBenchPanel .sbRow{padding:3px 0;border-top:1px solid #1e293b;cursor:pointer}
      #__scaleBenchPanel .sbRow:hover{background:#1e293b}
      #__scaleBenchPanel .sbRow.sel{background:#1e3a8a55}
      #__scaleBenchPanel .sbFixed{opacity:.55}
    </style>`;
  document.body.appendChild(panel);

  const $ = (id) => panel.querySelector('#' + id);

  const chip = (label, n, color) =>
    `<span style="display:inline-block;margin:0 6px 4px 0;padding:1px 6px;border-radius:4px;`
    + `background:${color}22;color:${color};border:1px solid ${color}66">${label} ${n}</span>`;

  const describe = (f) =>
    f.kind === 'overlap' ? `${f.pct}% "${f.a}" ⟷ "${f.b}"`
      : f.kind === 'tiny' ? `${f.px}px "${f.text}"`
      : f.kind === 'doc-overflow-x' ? `+${f.byPx}px wide`
      : `−${f.lostPct}% "${f.text}"`;

  /**
   * Turn a measurement into the panel's contents. Called by the watcher on
   * every change, so it must be cheap and must not itself disturb the page
   * beyond repainting the marks.
   */
  function render(m) {
    ui.last = m;
    $('sbCounts').innerHTML =
      chip('truncated', m.counts.truncateX, COLORS['truncate-x'])
      + chip('clipped', m.counts.clipY, COLORS['clip-y'])
      + chip('overlap', m.counts.overlap, COLORS.overlap)
      + chip('under 10px', m.counts.tiny, COLORS.tiny);

    renderList();
    paintMarks();
    renderPolicy();
    renderSaved();
  }

  function renderList() {
    const m = ui.last;
    if (!m) return;
    const rows = m.findings.slice().sort((a, b) => (b.lostPct || b.pct || 0) - (a.lostPct || a.pct || 0));
    ui.rows = rows;
    $('sbList').innerHTML = rows.slice(0, 16).map((f, i) => {
      const fixed = B.state.policies.has(f.path);
      const sel = ui.selected === f.path ? ' sel' : '';
      return `<div class="sbRow${sel}${fixed ? ' sbFixed' : ''}" data-i="${i}">`
        + `<span style="color:${COLORS[f.kind]}">${f.kind}</span> ${describe(f)}`
        + (fixed ? ' <span style="color:#4ade80">✓ policy</span>' : '') + '</div>';
    }).join('') + (rows.length > 16 ? `<div style="color:#64748b;padding-top:4px">+${rows.length - 16} more</div>` : '');

    $('sbList').querySelectorAll('.sbRow').forEach((row) => {
      row.onclick = () => select(rows[+row.dataset.i]);
    });
  }

  /** The remedy picker for whichever misfit is selected. */
  function renderPolicy() {
    const path = ui.selected;
    if (!path) { $('sbPolicy').innerHTML = ''; return; }
    const active = B.state.policies.get(path);
    const mode = active && active.spec.mode;
    const cap = active && active.spec.capScale;
    const buttons = Object.entries(B.POLICIES).map(([k, p]) =>
      `<button class="sbBtn sbPol${mode === k ? ' on' : ''}" data-mode="${k}" title="${p.hint}">${p.label}</button>`
    ).join(' ');
    $('sbPolicy').innerHTML = `
      <div style="border:1px solid #334155;border-radius:6px;padding:7px;margin-bottom:8px">
        <div style="color:#94a3b8;margin-bottom:5px;word-break:break-all">selected · ${path.split('/').slice(-3).join('/')}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${buttons}</div>
        <div style="display:flex;gap:5px;align-items:center">
          <span style="color:#94a3b8">stop scaling past</span>
          <input id="sbCap" class="sbIn" type="number" step="0.05" style="width:58px"
            value="${cap === undefined || cap === null ? '' : cap}" placeholder="—">
          <span style="color:#64748b">×</span>
          <button id="sbCapSet" class="sbBtn">apply</button>
          <button id="sbPolClear" class="sbBtn">clear</button>
        </div>
      </div>`;
    $('sbPolicy').querySelectorAll('.sbPol').forEach((b) => {
      b.onclick = () => {
        const spec = { mode: b.dataset.mode === mode ? null : b.dataset.mode };
        if (cap !== undefined && cap !== null) spec.capScale = cap;
        B.setPolicy(path, spec);
        B.refresh();
      };
    });
    $('sbCapSet').onclick = () => {
      const v = parseFloat($('sbCap').value);
      B.setPolicy(path, { mode: mode || null, capScale: Number.isFinite(v) ? v : null });
      B.refresh();
    };
    $('sbPolClear').onclick = () => { B.clearPolicy(path); B.refresh(); };
  }

  function renderSaved() {
    const p = B.exportPolicies();
    if (!p.length) { $('sbSaved').innerHTML = ''; return; }
    $('sbSaved').innerHTML = `<div style="color:#94a3b8;border-top:1px solid #334155;padding-top:5px">`
      + `${p.length} policy(ies) set — "save policies" writes them out</div>`;
  }

  /**
   * Every mark is repainted on every scan, so a selection cannot live in the
   * marks themselves — it lives in `ui.selected` and is re-applied by
   * `paintMarks`. Otherwise the first click would be erased by the scan that
   * its own highlight triggered, and the second click would look like the one
   * that worked.
   */
  function paintMarks() {
    const mode = MARK_MODES[ui.markMode];
    if (!mode.show || !ui.last) { B.unhighlight(); return; }
    B.highlight(ui.last.findings, { selected: ui.selected, interactive: mode.interactive });
  }

  function select(f) {
    ui.selected = f && f.path;
    renderList();
    renderPolicy();
    paintMarks();
  }

  /** Click a readout to type a value the slider cannot reach. */
  function editable(labelId, apply) {
    $(labelId).onclick = () => {
      const cur = $(labelId).textContent;
      const input = document.createElement('input');
      input.className = 'sbIn';
      input.style.width = '52px';
      input.value = cur;
      $(labelId).replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const v = parseFloat(input.value);
        const b = document.createElement('b');
        b.id = labelId;
        b.className = 'sbNum';
        b.title = 'click to type a value';
        b.textContent = Number.isFinite(v) ? v.toFixed(2) : cur;
        input.replaceWith(b);
        editable(labelId, apply);
        if (Number.isFinite(v)) apply(v);
      };
      input.onblur = commit;
      input.onkeydown = (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') input.blur(); };
    };
  }

  const setScale = (v) => {
    ui.scale = v;
    const s = $('sbScale');
    if (v > +s.max) s.max = String(v);
    if (v < +s.min) s.min = String(v);
    s.value = String(v);
    $('sbScaleV').textContent = v.toFixed(2);
    B.setScale(v);
    B.refresh();
  };
  const setVolume = (v) => {
    ui.volume = v;
    const s = $('sbVol');
    if (v > +s.max) s.max = String(v);
    if (v < +s.min) s.min = String(v);
    s.value = String(v);
    $('sbVolV').textContent = v.toFixed(2);
    B.setVolume(v);
    B.refresh();
  };

  $('sbScale').oninput = (e) => setScale(+e.target.value);
  $('sbVol').oninput = (e) => setVolume(+e.target.value);
  editable('sbScaleV', setScale);
  editable('sbVolV', setVolume);

  $('sbVpPreset').innerHTML = '<option value="">preset…</option>'
    + PRESETS.map(([w, h]) => `<option value="${w}x${h}">${w}×${h}</option>`).join('');
  const syncVp = () => {
    $('sbVpW').value = String(innerWidth);
    $('sbVpH').value = String(innerHeight);
  };
  syncVp();
  const applyVp = async (w, h) => {
    if (!window.__benchSetViewport) {
      $('sbVpNote').innerHTML = '<span style="color:#fbbf24">needs --interactive (no viewport binding)</span>';
      return;
    }
    $('sbVpNote').textContent = `applying ${w}×${h}…`;
    await window.__benchSetViewport(w, h);
    setTimeout(() => {
      syncVp();
      $('sbVpNote').textContent = `${innerWidth}×${innerHeight} · ratio ${(innerWidth / innerHeight).toFixed(2)}`;
      B.refresh();
    }, 350);
  };
  $('sbVpGo').onclick = () => applyVp(+$('sbVpW').value, +$('sbVpH').value);
  $('sbVpPreset').onchange = (e) => {
    if (!e.target.value) return;
    const [w, h] = e.target.value.split('x').map(Number);
    $('sbVpW').value = w; $('sbVpH').value = h;
    applyVp(w, h);
  };

  $('sbMarks').onclick = () => {
    ui.markMode = (ui.markMode + 1) % MARK_MODES.length;
    $('sbMarks').textContent = MARK_MODES[ui.markMode].label;
    $('sbMarks').title = MARK_MODES[ui.markMode].interactive
      ? 'marks capture clicks — click one to select it'
      : 'marks are visible but click through to the app';
    paintMarks();
  };
  $('sbMarks').textContent = MARK_MODES[ui.markMode].label;

  B.state.onMarkClick = (f) => select(f);
  $('sbMode').onclick = () => {
    const next = B.state.mode === 'freeze' ? 'var' : 'freeze';
    B.setMode(next);
    $('sbMode').textContent = next;
    setScale(ui.scale);
  };
  $('sbReset').onclick = () => {
    B.reset();
    ui.selected = null;
    setScale(1);
    setVolume(1);
  };
  $('sbMin').onclick = () => {
    const b = $('sbBody');
    b.style.display = b.style.display === 'none' ? '' : 'none';
  };

  $('sbSave').onclick = async () => {
    const payload = { page: location.pathname, viewport: { w: innerWidth, h: innerHeight },
                      scale: ui.scale, volume: ui.volume, policies: B.exportPolicies() };
    if (window.__benchSavePolicies) {
      const r = await window.__benchSavePolicies(payload);
      $('sbSaved').innerHTML = `<span style="color:#4ade80">saved → ${r}</span>`;
    } else {
      console.log('[scale-bench] policies', JSON.stringify(payload, null, 2));
      $('sbSaved').innerHTML = '<span style="color:#fbbf24">no save binding — written to the console</span>';
    }
  };

  $('sbSweep').onclick = () => {
    $('sbWindow').textContent = 'sweeping…';
    setTimeout(() => {
      const r = B.sweep();
      const w = r.window;
      const verdict = !r.usable ? '<span style="color:#ef4444">NO SAFE WINDOW</span>'
        : `<span style="color:#22c55e">safe ${w.min.toFixed(2)}× – ${w.max.toFixed(2)}×</span>`;
      const vs = declared
        ? `<div style="color:#94a3b8">declared ${declared[0]}× – ${declared[1]}× · `
          + ((w.max !== null && w.max >= declared[1] && w.min !== null && w.min <= declared[0])
              ? '<span style="color:#22c55e">met</span>'
              : '<span style="color:#ef4444">NOT met</span>') + '</div>'
        : '';
      const strip = r.steps.map((s) => {
        const c = s.newBreaking ? '#ef4444' : s.tiny ? '#3b82f6' : '#22c55e';
        return `<span title="${s.scale}× — ${s.newBreaking} new, ${s.tiny} tiny"
          style="display:inline-block;width:30px;text-align:center;padding:1px 0;margin-right:2px;
          border-radius:3px;background:${c}33;color:${c}">${s.scale}</span>`;
      }).join('');
      $('sbWindow').innerHTML = verdict + vs + '<div style="margin-top:4px">' + strip + '</div>';
      B.refresh();
    }, 20);
  };

  if (declared) {
    $('sbWindow').innerHTML = `<div style="color:#94a3b8">declared ${declared[0]}× – ${declared[1]}× · press sweep</div>`;
  }

  /**
   * Drag by the header. The panel is positioned from the right by default, so
   * the first drag switches it to left/top — otherwise it would fight its own
   * anchor and jump.
   */
  (() => {
    const bar = $('sbBar');
    let dx = 0, dy = 0, dragging = false;
    bar.style.cursor = 'move';
    bar.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      dragging = true;
      panel.style.right = 'auto';
      panel.style.left = r.left + 'px';
      panel.style.top = r.top + 'px';
      e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const w = panel.offsetWidth, h = 40;
      panel.style.left = Math.max(0, Math.min(innerWidth - w, e.clientX - dx)) + 'px';
      panel.style.top = Math.max(0, Math.min(innerHeight - h, e.clientY - dy)) + 'px';
    });
    addEventListener('mouseup', () => { dragging = false; });
  })();

  B.watch(render);
  addEventListener('resize', syncVp);
})();
