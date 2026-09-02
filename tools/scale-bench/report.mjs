/**
 * Renders a sweep result into a single browsable HTML page.
 *
 * The page is the point of the tool: a matrix of viewport × volume against the
 * scale ladder, so the scale at which a page starts losing content is a cell
 * you can see and click through to the screenshot that proves it.
 */

const COLORS = {
  'truncate-x': '#ef4444', 'clip-y': '#f97316', overlap: '#a855f7',
  tiny: '#3b82f6', 'doc-overflow-x': '#eab308',
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A window is only usable when the page is legible before it breaks. When the
 * two cross — text still under 10px at a scale that already truncates — the
 * page has no safe zoom at all, which is the finding worth shouting about.
 */
const windowCell = (c) => {
  const note = c.repeats > 1
    ? ` <span style="color:#64748b">worst of ${c.repeats}${c.spread && c.spread.max.length > 1 ? ', varied' : ''}</span>`
    : '';
  if (c.usable) {
    return `<span style="color:#4ade80">${c.window.min.toFixed(2)}× – ${c.window.max.toFixed(2)}×</span>` + note;
  }
  const legible = c.window.min === null ? 'never legible on this ladder' : `legible from ${c.window.min.toFixed(2)}×`;
  const intact = c.window.max === null ? 'already breaking at 1.00×' : `intact to ${c.window.max.toFixed(2)}×`;
  return `<span style="color:#f87171">none</span> <span style="color:#64748b">(${legible}, ${intact})</span>` + note;
};

export function renderReport(results) {
  const cells = results.cells;
  const metric = results.config.matrixMetric || 'new';
  const req = results.config.require || null;
  const targets = [...new Set(cells.map((c) => c.target))];

  const summaryRows = cells.map((c, i) => {
    const v = c.error ? 'error' : c.verdict;
    const color = v === 'pass' ? '#16a34a' : v === 'no-budget' ? '#64748b' : '#dc2626';
    return `<tr data-cell="${i}" class="row">
      <td>${esc(c.target)}</td><td>${esc(c.viewport.label)}</td><td>${c.volume.toFixed(2)}×</td>
      <td>${c.error ? '—' : c.baseline.breaking}</td>
      <td>${c.error ? '—' : c.baseline.tiny}</td>
      <td>${c.error ? esc(c.error.slice(0, 40)) : (req ? esc(c.summary || '') : windowCell(c))}</td>
      <td>${c.declared ? c.declared[0] + '× – ' + c.declared[1] + '×' : '—'}</td>
      <td style="color:${color};font-weight:600">${esc(v)}</td></tr>`;
  }).join('');

  const matrices = targets.map((t) => {
    const rows = cells.filter((c) => c.target === t);
    const ladder = results.config.ladder;
    const head = ladder.map((s) => `<th>${s}×</th>`).join('');
    const body = rows.map((c) => {
      const idx = cells.indexOf(c);
      if (c.error) {
        return `<tr><th class="lbl">${esc(c.viewport.label)} · ${c.volume.toFixed(2)}×</th>
          <td colspan="${ladder.length}" class="err">${esc(c.error.slice(0, 90))}</td></tr>`;
      }
      const tds = c.steps.map((st) => {
        const n = metric === 'total' ? st.totalBreaking : st.newBreaking;
        const inReq = !req || (st.scale >= req.scale[0] - 1e-9 && st.scale <= req.scale[1] + 1e-9);
        const cls = n === 0 ? (st.tiny ? 'ok tiny' : 'ok') : n <= 2 ? 'warn' : 'bad';
        const shot = c.shots[String(st.scale)] ? ' shot' : '';
        return `<td class="cell ${cls}${shot}${inReq ? '' : ' out'}" data-cell="${idx}" data-scale="${st.scale}"
          title="${st.totalBreaking} breaking (${st.newBreaking} new) · ${st.tiny} under 10px">${n || (st.tiny ? '·' : '✓')}</td>`;
      }).join('');
      return `<tr><th class="lbl">${esc(c.viewport.label)} · ${c.volume.toFixed(2)}×</th>${tds}</tr>`;
    }).join('');
    return `<h2>${esc(t)}</h2>
      <table class="matrix"><thead><tr><th class="lbl"></th>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }).join('');

  return `<meta charset="utf-8"><title>scale-bench</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;padding:24px 24px 46vh;background:#0b1220;color:#e2e8f0;
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  h1{font-size:16px;margin:0 0 4px} h2{font-size:14px;margin:26px 0 6px;color:#93c5fd}
  .meta{color:#64748b;margin-bottom:18px}
  table{border-collapse:collapse;margin-bottom:8px}
  th,td{padding:3px 8px;text-align:left;border-bottom:1px solid #1e293b;white-space:nowrap}
  thead th{color:#94a3b8;font-weight:500}
  .row:hover{background:#1e293b;cursor:pointer}
  .matrix td.cell{text-align:center;cursor:default;border:1px solid #0b1220;font-weight:600}
  .matrix td.ok{background:#16a34a33;color:#4ade80}
  .matrix td.ok.tiny{background:#3b82f633;color:#93c5fd}
  .matrix td.warn{background:#f59e0b33;color:#fbbf24}
  .matrix td.bad{background:#dc262633;color:#f87171}
  .matrix td.shot{cursor:zoom-in;outline:1px solid #64748b}
  .matrix td.out{opacity:.35}
  .matrix th.lbl{color:#94a3b8;font-weight:400}
  .err{color:#f87171}
  #detail{position:fixed;left:0;right:0;bottom:0;height:44vh;background:#020617f2;
    border-top:1px solid #334155;display:none;grid-template-columns:1fr 420px;gap:12px;padding:26px 12px 12px}
  #detail.on{display:grid}
  #shot{overflow:auto;background:#000;border:1px solid #1e293b}
  #shot img{display:block;max-width:100%}
  #finds{overflow:auto}
  #close{position:absolute;right:10px;top:6px;cursor:pointer;color:#94a3b8}
  .f{padding:2px 0;border-bottom:1px solid #131c31}
</style>
<h1>scale-bench</h1>
<div class="meta">${esc(results.generatedAt)} · ${esc(results.config.baseUrl)} ·
  ladder ${results.config.ladder.join(' ')} · volumes ${results.config.volumes.join(' ')}</div>

<h2>safe windows</h2>
<table><thead><tr><th>page</th><th>viewport</th><th>volume</th><th>base breaks</th>
  <th>base &lt;10px</th><th>measured safe window</th><th>declared</th><th></th></tr></thead>
<tbody>${summaryRows}</tbody></table>

${matrices}

<div id="detail"><span id="close">close ✕</span><div id="shot"></div><div id="finds"></div></div>
<script>
const DATA = ${JSON.stringify(cells).replace(/</g, '\\u003c')};
const COLORS = ${JSON.stringify(COLORS)};
const detail = document.getElementById('detail');
function show(i, scale) {
  const c = DATA[i];
  if (!c || c.error) return;
  const st = c.steps.find(s => String(s.scale) === String(scale)) || c.steps.find(s => s.scale === 1);
  const src = c.shots[String(st.scale)];
  document.getElementById('shot').innerHTML = src
    ? '<img src="' + src + '">'
    : '<div style="padding:20px;color:#64748b">no screenshot captured at ' + st.scale + '× — rerun with --shots all</div>';
  const list = st.findings.map(f => {
    const d = f.kind === 'overlap' ? f.pct + '% "' + f.a + '" ⟷ "' + f.b + '"'
      : f.kind === 'doc-overflow-x' ? '+' + f.byPx + 'px wide'
      : '−' + f.lostPct + '% "' + (f.text || '') + '"';
    return '<div class="f"><span style="color:' + (COLORS[f.kind] || '#fff') + '">' + f.kind + '</span> ' + d
      + '<div style="color:#475569">' + (f.path || '') + '</div></div>';
  }).join('');
  document.getElementById('finds').innerHTML =
    '<b>' + c.target + '</b> · ' + c.viewport.label + ' · vol ' + c.volume + '× · scale ' + st.scale + '×<br>'
    + '<span style="color:#94a3b8">' + st.newBreaking + ' new breaks, ' + st.tiny + ' under 10px</span><hr style="border-color:#1e293b">'
    + (list || '<span style="color:#64748b">nothing new at this scale</span>');
  detail.classList.add('on');
}
document.querySelectorAll('.matrix td.cell').forEach(td =>
  td.onclick = () => show(+td.dataset.cell, td.dataset.scale));
document.querySelectorAll('tr.row').forEach(tr =>
  tr.onclick = () => show(+tr.dataset.cell, 1));
document.getElementById('close').onclick = () => detail.classList.remove('on');
</script>`;
}
