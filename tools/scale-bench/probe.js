/**
 * In-page instrumentation for the scale bench.
 *
 * Loaded into a live page (by `bench.mjs`, or pasted into a devtools console).
 * It can (a) simulate a user text-scale multiplier, (b) simulate more or less
 * text than the app currently shows, and (c) report every place the resulting
 * render loses or collides with content.
 *
 * Scale is simulated by freezing each element's computed `font-size` and
 * re-emitting it multiplied, which is exactly what a `--idml-text-scale`
 * variable would do — so breakage measured here is breakage the real feature
 * would have to bound. The freeze also detaches font-size inheritance and any
 * em-based spacing, which is deliberate: it isolates *text* growth from
 * everything else that might move.
 */
(() => {
  if (window.__scaleBench) return;

  const DEFAULTS = {
    minFontPx: 10,
    overlapRatio: 0.03,
    overlapAreaPx: 4,
    ladder: [0.9, 1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.0],
  };

  const SEL = 'body *:not([data-scale-bench]):not([data-scale-bench] *)';

  const state = { fonts: null, texts: null, seenEl: null, seenText: null,
                  scale: 1, volume: 1, mode: 'freeze', busy: false, watch: null,
                  capOf: new WeakMap(), capCount: 0, policies: new Map(),
                  onMarkClick: null };

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    return !(s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0);
  };

  /** Structural identity for an element, stable across scale/volume changes. */
  const pathOf = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
      const p = n.parentElement;
      let i = 1;
      if (p) for (const sib of p.children) { if (sib === n) break; if (sib.tagName === n.tagName) i++; }
      parts.unshift(n.tagName.toLowerCase() + ':' + i);
    }
    return parts.join('/');
  };

  const ownText = (el) => {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t;
  };

  const short = (s, n) => {
    const t = (s || '').trim().replace(/\s+/g, ' ');
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  const intersect = (a, b) => {
    const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right);
    const t = Math.max(a.top, b.top), bo = Math.min(a.bottom, b.bottom);
    return r > l && bo > t ? { left: l, right: r, top: t, bottom: bo, width: r - l, height: bo - t } : null;
  };

  /**
   * The rect a run of glyphs actually paints into, after every clipping
   * ancestor and the viewport. Without this, ellipsis-truncated text reports
   * the invisible remainder of its string and fabricates overlaps.
   */
  const visibleRect = (el, rect) => {
    let r = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              width: rect.width, height: rect.height };
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (!/hidden|auto|scroll|clip/.test(s.overflow + s.overflowX + s.overflowY)) continue;
      r = intersect(r, n.getBoundingClientRect());
      if (!r) return null;
    }
    return intersect(r, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
  };

  /**
   * Adopt any element or text node that appeared since the last pass.
   *
   * Capture has to be incremental, not a re-scan: once a scale is applied the
   * page's computed font-sizes are our own output, so re-reading them would
   * record the scaled value as the natural one and the next scale would
   * compound. New elements also inherit from already-scaled parents, so the
   * page is put back on its authored sizes for the duration of the capture.
   */
  function sync() {
    const newEls = [];
    const newText = [];
    for (const el of document.querySelectorAll(SEL)) {
      if (!state.seenEl.has(el)) newEls.push(el);
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || state.seenText.has(n)) continue;
        const v = n.nodeValue;
        if (!v || v.trim().length < 3 || !/[A-Za-z]/.test(v)) continue;
        newText.push(n);
      }
    }

    if (newEls.length) {
      const active = state.scale;
      const restoreNeeded = active !== 1 && state.mode === 'freeze';
      if (restoreNeeded) restoreFonts();
      for (const el of newEls) {
        const px = parseFloat(getComputedStyle(el).fontSize);
        state.seenEl.add(el);
        if (px > 0) {
          state.fonts.push({ el, px, inline: el.style.getPropertyValue('font-size'),
                             prio: el.style.getPropertyPriority('font-size') });
        }
      }
      if (restoreNeeded) applyScale(active);
    }

    for (const n of newText) {
      state.seenText.add(n);
      const rec = { node: n, original: n.nodeValue };
      state.texts.push(rec);
      if (state.volume !== 1) rec.node.nodeValue = retarget(rec.original, state.volume);
    }

    const live = (rec) => (rec.el || rec.node).isConnected;
    if (state.fonts.length > 4000) state.fonts = state.fonts.filter(live);
    if (state.texts.length > 4000) state.texts = state.texts.filter(live);

    return { elements: state.fonts.length, textNodes: state.texts.length,
             added: newEls.length + newText.length };
  }

  /** Forget everything and capture the page as it stands now. */
  function snapshot() {
    state.fonts = [];
    state.texts = [];
    state.seenEl = new WeakSet();
    state.seenText = new WeakSet();
    state.scale = 1;
    state.volume = 1;
    sync();
    return { elements: state.fonts.length, textNodes: state.texts.length };
  }

  const ensure = () => { if (!state.fonts) snapshot(); };

  /**
   * Put every element back on the font-size it was authored with. idml emits
   * `font-size` as an inline style, so a bare removeProperty would delete the
   * page's own sizing and drop it to the browser default — restore, don't clear.
   */
  function restoreFonts() {
    for (const rec of state.fonts) {
      if (rec.inline) rec.el.style.setProperty('font-size', rec.inline, rec.prio);
      else rec.el.style.removeProperty('font-size');
    }
  }

  /** A font-size written in container-query units is pinned to its own box. */
  const PINNED_UNIT = /\dcq(w|h|i|b|min|max)\b/i;

  /**
   * 'freeze' simulates the multiplier by re-emitting every computed font-size,
   * which works on a page that has no scaling feature yet. Once idml actually
   * ships a `--idml-text-scale` variable, switch to 'var' to bench the real
   * implementation through the same instrumentation.
   */
  function setMode(mode) {
    if (mode === state.mode) return;
    ensure();
    restoreFonts();
    document.documentElement.style.removeProperty('--idml-text-scale');
    state.scale = 1;
    state.mode = mode;
  }

  /**
   * A cap set on an element governs its whole subtree — font-size is written
   * on every element individually, so a cap that did not inherit would leave
   * the capped node's own children growing past it.
   */
  function capFor(el) {
    if (!state.capCount) return undefined;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = state.capOf.get(n);
      if (c !== undefined) return c;
    }
    return undefined;
  }

  function applyScale(scale) {
    if (state.mode === 'var') {
      document.documentElement.style.setProperty('--idml-text-scale', String(scale));
    } else if (scale === 1) {
      restoreFonts();
    } else {
      for (const rec of state.fonts) {
        // Text authored in container-query units has already declared its size
        // as a fraction of its own box. Multiplying it would contradict that
        // declaration — the whole point of writing it that way is that the
        // string keeps one share of its container whatever the user's setting.
        if (PINNED_UNIT.test(rec.inline)) continue;
        const cap = capFor(rec.el);
        const s = cap === undefined ? scale : Math.min(scale, cap);
        rec.el.style.setProperty('font-size', (rec.px * s).toFixed(3) + 'px', 'important');
      }
    }
  }

  function setScale(scale) {
    ensure();
    applyScale(scale);
    state.scale = scale;
  }

  /**
   * Synthetic text-volume stress: retarget each string to `volume`x its length
   * by repeating its own words (or truncating). Not a translation — a way to
   * ask "does this layout still hold when the data is wordier than the sample".
   */
  const retarget = (s, volume) => {
    const lead = s.match(/^\s*/)[0];
    const trail = s.match(/\s*$/)[0];
    const core = s.trim();
    const target = Math.max(1, Math.round(core.length * volume));
    if (target === core.length) return s;
    if (target < core.length) return lead + (core.slice(0, target).trimEnd() || core[0]) + trail;
    const words = core.split(/\s+/);
    let out = core;
    for (let i = 0; out.length < target; i++) out += ' ' + words[i % words.length];
    return lead + out.slice(0, target).trimEnd() + trail;
  };

  function setVolume(volume) {
    ensure();
    for (const rec of state.texts) {
      try { rec.node.nodeValue = volume === 1 ? rec.original : retarget(rec.original, volume); }
      catch { /* node detached by a re-render */ }
    }
    state.volume = volume;
  }

  function reset() {
    ensure();
    restoreFonts();
    document.documentElement.style.removeProperty('--idml-text-scale');
    for (const rec of state.texts) { try { rec.node.nodeValue = rec.original; } catch { /* detached */ } }
    state.scale = 1;
    state.volume = 1;
    unhighlight();
  }

  /**
   * Every place the current render loses or collides with content.
   * `tiny` is reported separately from the rest: shrinking causes it and
   * scaling *up* cures it, so it sets the floor of the safe window while the
   * others set the ceiling.
   */
  function measure(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    const findings = [];
    const glyphs = [];
    const add = (kind, key, o) => findings.push(Object.assign({ kind, key }, o));

    for (const el of document.querySelectorAll(SEL)) {
      if (!isVisible(el)) continue;
      const s = getComputedStyle(el);
      const path = pathOf(el);
      const text = ownText(el);
      const cw = el.clientWidth, ch = el.clientHeight;

      if (text.trim()) {
        const px = parseFloat(s.fontSize);
        if (px && px < cfg.minFontPx) {
          add('tiny', 'tiny|' + path, { path, text: short(text, 40), px: +px.toFixed(1) });
        }
      }

      if (cw > 0 && /hidden|clip/.test(s.overflowX === 'visible' ? s.overflow : s.overflowX)
          && el.scrollWidth > cw + 1) {
        add('truncate-x', 'truncate-x|' + path, {
          path, text: short(text || el.textContent, 40),
          lostPct: Math.round((1 - cw / el.scrollWidth) * 100),
          needPx: el.scrollWidth, hasPx: cw,
        });
      }
      if (ch > 0 && /hidden|clip/.test(s.overflowY === 'visible' ? s.overflow : s.overflowY)
          && el.scrollHeight > ch + 1) {
        add('clip-y', 'clip-y|' + path, {
          path, text: short(text || el.textContent, 40),
          lostPct: Math.round((1 - ch / el.scrollHeight) * 100),
          needPx: el.scrollHeight, hasPx: ch,
        });
      }

      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const rect of rg.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          const v = visibleRect(el, rect);
          if (!v || v.width < 2 || v.height < 2) continue;
          glyphs.push({ el, path, v, text: short(n.nodeValue, 28) });
        }
      }
    }

    const seen = new Set();
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) {
        const A = glyphs[i], B = glyphs[j];
        if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const ov = intersect(A.v, B.v);
        if (!ov) continue;
        const area = ov.width * ov.height;
        const smaller = Math.min(A.v.width * A.v.height, B.v.width * B.v.height);
        if (area < cfg.overlapAreaPx || area / smaller < cfg.overlapRatio) continue;
        const key = 'overlap|' + [A.path, B.path].sort().join('~');
        if (seen.has(key)) continue;
        seen.add(key);
        add('overlap', key, { path: A.path, path2: B.path, a: A.text, b: B.text,
                              pct: Math.round((area / smaller) * 100) });
      }
    }

    if (document.documentElement.scrollWidth > innerWidth + 1) {
      add('doc-overflow-x', 'doc-overflow-x|root', {
        path: 'html', text: '', byPx: document.documentElement.scrollWidth - innerWidth });
    }

    const breaking = findings.filter((f) => f.kind !== 'tiny');
    return {
      scale: state.scale,
      volume: state.volume,
      viewport: { w: innerWidth, h: innerHeight },
      findings,
      counts: {
        breaking: breaking.length,
        tiny: findings.length - breaking.length,
        truncateX: findings.filter((f) => f.kind === 'truncate-x').length,
        clipY: findings.filter((f) => f.kind === 'clip-y').length,
        overlap: findings.filter((f) => f.kind === 'overlap').length,
      },
    };
  }

  /**
   * Sweep the ladder at the current volume and return the safe window:
   * `max` is the largest scale reached with no breakage the page did not
   * already have at 1.0; `min` is the smallest scale at which no text sits
   * below the legibility floor. `usable` is false when they cross — the page
   * cannot be both legible and intact at any scale on the ladder.
   */
  function sweep(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});
    const restore = state.scale;
    const wasBusy = state.busy;
    state.busy = true;
    setScale(1);
    const base = measure(cfg);
    const baseKeys = new Set(base.findings.filter((f) => f.kind !== 'tiny').map((f) => f.key));

    const steps = [];
    for (const s of cfg.ladder) {
      setScale(s);
      const m = measure(cfg);
      const fresh = m.findings.filter((f) => f.kind !== 'tiny' && !baseKeys.has(f.key));
      steps.push({ scale: s, tiny: m.counts.tiny, newBreaking: fresh.length,
                   totalBreaking: m.counts.breaking, findings: fresh });
    }
    setScale(restore);
    state.busy = wasBusy;

    let max = null;
    for (const st of steps) {
      if (st.scale < 1) continue;
      if (st.newBreaking > 0) break;
      max = st.scale;
    }
    const legible = steps.find((st) => st.tiny === 0);
    const min = legible ? legible.scale : null;
    return { baseline: base.counts, steps, window: { min, max },
             usable: min !== null && max !== null && min <= max };
  }


  /**
   * Re-measure whenever the page changes, instead of waiting to be asked.
   *
   * Every write this module makes — scaling, retargeting text, painting marks,
   * applying a policy — is itself a mutation, so the observer is deaf while
   * `state.busy` is set. Without that the first scale change would feed itself
   * back in and never settle.
   */
  function watch(onResult, opts) {
    unwatch();
    const delay = (opts && opts.delayMs) || 220;
    let timer = null;

    const run = () => {
      timer = null;
      state.busy = true;
      try {
        ensure();
        sync();
        const m = measure(opts);
        state.result = m;
        if (onResult) onResult(m);
      } finally {
        state.busy = false;
      }
    };
    const schedule = () => {
      if (state.busy) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delay);
    };

    const relevant = (rec) => {
      const t = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement;
      return !(t && t.closest && t.closest('[data-scale-bench]'));
    };
    const mo = new MutationObserver((records) => {
      if (state.busy) return;
      if (records.some(relevant)) schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true,
                                attributes: true, attributeFilter: ['style', 'class', 'hidden'] });

    const ro = new ResizeObserver(() => schedule());
    ro.observe(document.documentElement);
    ro.observe(document.body);

    const onResize = () => schedule();
    addEventListener('resize', onResize);

    state.watch = { stop() { mo.disconnect(); ro.disconnect(); removeEventListener('resize', onResize);
                            if (timer) clearTimeout(timer); }, run };
    run();
    return state.watch;
  }

  function unwatch() {
    if (state.watch) state.watch.stop();
    state.watch = null;
  }

  /** Run one measurement now, without waiting for the debounce. */
  function refresh() {
    if (state.watch) state.watch.run();
    else { ensure(); sync(); state.result = measure(); }
    return state.result;
  }


  /**
   * Remedies a misfit element can be given.
   *
   * Each is applied live as inline style so the effect is visible immediately
   * and can be measured by the very next pass; `capScale` is different in kind
   * because it feeds `applyScale` rather than the element's own style, which is
   * why it is stored separately.
   */
  const POLICIES = {
    truncate: {
      label: 'truncate',
      hint: 'clip with an ellipsis; content is lost but layout holds',
      css: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' },
    },
    wrap: {
      label: 'wrap',
      hint: 'let the text run onto more lines; the box grows taller',
      css: { whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'visible', textOverflow: 'clip' },
    },
    scroll: {
      label: 'scroll',
      hint: 'keep the box and let the user scroll inside it',
      css: { overflow: 'auto', textOverflow: 'clip', minWidth: '0' },
    },
    'scroll-parent': {
      label: 'scroll parent',
      hint: 'scroll the containing box instead of this one',
      css: { overflow: 'visible', whiteSpace: 'nowrap' },
      parentCss: { overflow: 'auto', minWidth: '0' },
    },
    shrink: {
      label: 'shrink to fit',
      hint: 'this box may take less than its declared share',
      css: { minWidth: '0', flexShrink: '1' },
    },
  };

  const applyCss = (el, css, store) => {
    for (const k of Object.keys(css)) {
      if (store && store[k] === undefined) store[k] = el.style[k];
      el.style[k] = css[k];
    }
  };

  /**
   * Give one element a policy. `capScale` may accompany any of them (or stand
   * alone as `{ capScale: n }`) and stops that subtree growing past n.
   */
  function setPolicy(path, spec) {
    const el = elementAt(path);
    if (!el) return null;
    const wasBusy = state.busy;
    state.busy = true;
    try {
      clearPolicy(path, true);
      const rec = { path, spec, prev: {}, prevParent: {}, el };
      if (spec.mode && POLICIES[spec.mode]) {
        const p = POLICIES[spec.mode];
        applyCss(el, p.css, rec.prev);
        if (p.parentCss && el.parentElement) applyCss(el.parentElement, p.parentCss, rec.prevParent);
      }
      if (spec.capScale !== undefined && spec.capScale !== null) {
        state.capOf.set(el, spec.capScale);
        state.capCount++;
        rec.capped = true;
      }
      state.policies.set(path, rec);
      applyScale(state.scale);
      return rec;
    } finally {
      state.busy = wasBusy;
    }
  }

  function clearPolicy(path, keepBusy) {
    const rec = state.policies.get(path);
    if (!rec) return false;
    const wasBusy = state.busy;
    state.busy = true;
    try {
      for (const k of Object.keys(rec.prev)) rec.el.style[k] = rec.prev[k];
      if (rec.el.parentElement) {
        for (const k of Object.keys(rec.prevParent)) rec.el.parentElement.style[k] = rec.prevParent[k];
      }
      if (rec.capped) { state.capOf.delete(rec.el); state.capCount--; }
      state.policies.delete(path);
      applyScale(state.scale);
      return true;
    } finally {
      state.busy = keepBusy ? true : wasBusy;
    }
  }

  /** Resolve a `pathOf` string back to the element it names. */
  function elementAt(path) {
    for (const el of document.querySelectorAll(SEL)) if (pathOf(el) === path) return el;
    return null;
  }

  /**
   * The policies as data, ready to be persisted.
   *
   * `idmlId` is the node the element came from, but it is only present when the
   * app runs in editor mode (LayoutRenderer.tsx:164 gates it) and its value is
   * a per-parse counter, so it identifies a node within a session and not
   * across an edit. Anything durable has to be resolved against the source
   * spans server-side; this is the handle to do that with.
   */
  function exportPolicies() {
    const out = [];
    for (const [path, rec] of state.policies) {
      const el = rec.el;
      const owner = el.closest('[data-idml-id]');
      out.push({
        path,
        idmlId: owner ? owner.getAttribute('data-idml-id') : null,
        page: document.querySelector('[data-idml-page]')?.getAttribute('data-idml-page') || null,
        text: (el.textContent || '').trim().slice(0, 60),
        spec: rec.spec,
      });
    }
    return out;
  }

  const MARK_ID = '__scaleBenchMarks';

  function unhighlight() {
    const layer = document.getElementById(MARK_ID);
    if (layer) layer.remove();
  }

  const COLORS = { 'truncate-x': '#ef4444', 'clip-y': '#f97316', overlap: '#a855f7',
                   tiny: '#3b82f6', 'doc-overflow-x': '#eab308' };

  /**
   * Paint an outline over each finding's element.
   *
   * The boxes are clickable when `interactive` is set, so a misfit can be
   * picked in the page instead of hunted for in the list — the layer itself
   * stays click-through and only the boxes take the pointer, so the rest of the
   * app is still usable around them. `selected` is drawn heavier and stays on
   * top, which is what keeps a selection visible when the watcher repaints a
   * moment later.
   */
  function highlight(findings, opts) {
    const o = opts || {};
    unhighlight();
    const layer = document.createElement('div');
    layer.id = MARK_ID;
    layer.setAttribute('data-scale-bench', '');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    const byPath = new Map();
    for (const el of document.querySelectorAll(SEL)) byPath.set(pathOf(el), el);
    for (const f of findings || []) {
      for (const p of [f.path, f.path2]) {
        const el = p && byPath.get(p);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const color = COLORS[f.kind] || '#ef4444';
        const isSel = o.selected && (p === o.selected);
        const box = document.createElement('div');
        box.__finding = f;
        box.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;`
          + `height:${r.height}px;outline:${isSel ? 3 : 2}px solid ${isSel ? '#38bdf8' : color};`
          + `background:${isSel ? '#38bdf8' : color}${isSel ? '33' : '22'};`
          + `${o.interactive ? 'pointer-events:auto;cursor:pointer;' : ''}`
          + (isSel ? 'outline-offset:1px;' : '');
        layer.appendChild(box);
      }
    }
    if (o.interactive) {
      layer.addEventListener('click', (e) => {
        const box = e.target;
        if (!box || !box.__finding) return;
        e.preventDefault();
        e.stopPropagation();
        if (state.onMarkClick) state.onMarkClick(box.__finding);
      }, true);
    }
    document.body.appendChild(layer);
    return layer.children.length;
  }

  window.__scaleBench = { snapshot, sync, watch, unwatch, refresh,
                          setPolicy, clearPolicy, elementAt, exportPolicies, POLICIES,
                          setScale, setMode, setVolume, reset, measure, sweep,
                          highlight, unhighlight, pathOf, state, DEFAULTS };
})();
