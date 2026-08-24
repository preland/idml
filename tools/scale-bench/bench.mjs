#!/usr/bin/env node
/**
 * scale-bench — measure and regression-guard how far a UI's text can be
 * scaled before it starts losing content.
 *
 * Two modes over the same instrumentation (`probe.js`):
 *
 *   sweep        every target × viewport × text-volume × scale, into a
 *                browsable HTML report plus a JSON result you can diff
 *   --interactive  a headful browser with sliders, for finding the number
 *
 * See README.md.
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport } from './report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, inline] = a.slice(2).split('=');
    const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inline !== undefined) out[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

/** Locate a Chromium/Chrome binary, mirroring `__tests__/alignment/measure.ts`. */
function findChromium() {
  const fromEnv = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) return fromEnv;
  for (const cmd of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execSync(`command -v ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (p) return p;
    } catch { /* try the next name */ }
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  console.log(`
scale-bench

  node tools/scale-bench/bench.mjs [options]

  --config <file>       config JSON (default tools/scale-bench/scale-bench.config.json)
  --base-url <url>      override the config's baseUrl
  --out <dir>           output directory (default tools/scale-bench/out)
  --target <a,b>        only these targets
  --viewport <a,b>      only these viewport labels
  --limit <n>           page loads per invocation (default 8; 0 = no limit). Cells are
                        resumed from out/results.json, so repeat until it stops
                        exiting 3. Keeps any one run short enough to debug.
  --fresh               discard recorded cells and start the plan over
  --report              rebuild the report and re-run the gates, no browser
  --tolerance <n>       forgive this many ladder steps in the baseline comparison
  --shots all|none      screenshot every ladder step, or none
                        (default: 1.0x, the first breaking step, and 2.0x)
  --baseline <file>     compare against a previous results.json; exit 1 on regression
  --save-baseline <f>   also write this run to <f>
  --interactive         open a headful browser with the live slider panel
  --headful             run the sweep headful too (for watching it)
`);
  process.exit(0);
}

const configPath = resolve(args.config || join(HERE, 'scale-bench.config.json'));
if (!existsSync(configPath)) {
  console.error(`no config at ${configPath}`);
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
if (args.baseUrl) cfg.baseUrl = args.baseUrl;

const outDir = resolve(args.out || join(HERE, 'out'));
const shotDir = join(outDir, 'shots');

const only = (val, list) => !val || String(val).split(',').includes(list);

/**
 * Two different questions, and a cell answers whichever the config asks.
 *
 * `require` is an absolute conformance claim — no layout damage anywhere in a
 * named scale range — which is what "this UI works from 0.5x to 2.0x" actually
 * means. `safeScale` is the older relative question: how far can this page be
 * pushed past the breakage it already has. The relative form is useful while a
 * page is still broken at 1.0x; the absolute form is the finish line.
 */
function judge(cell) {
  const req = cfg.require;
  if (req) {
    const lo = req.scale ? req.scale[0] : -Infinity;
    const hi = req.scale ? req.scale[1] : Infinity;
    const cap = req.maxBreaking === undefined ? 0 : req.maxBreaking;
    const inRange = cell.steps.filter((s) => s.scale >= lo - 1e-9 && s.scale <= hi + 1e-9);
    const bad = inRange.filter((s) => s.totalBreaking > cap);
    const worst = bad.reduce((w, s) => (!w || s.totalBreaking > w.totalBreaking ? s : w), null);
    return {
      verdict: bad.length ? 'FAIL' : 'pass',
      offending: bad.map((s) => ({ scale: s.scale, breaking: s.totalBreaking })),
      summary: bad.length
        ? `${bad.length}/${inRange.length} steps break (worst ${worst.totalBreaking} at ${worst.scale}x)`
        : `clean ${lo}x-${hi}x`,
    };
  }
  if (!cell.declared) return { verdict: 'no-budget' };
  const ok = cell.window.max !== null && cell.window.max >= cell.declared[1]
    && cell.window.min !== null && cell.window.min <= cell.declared[0];
  return { verdict: ok ? 'pass' : 'FAIL' };
}

const fmtWindow = (cell) => cell.usable
  ? `safe ${cell.window.min}× – ${cell.window.max}×`
  : `NO SAFE WINDOW (legible ${cell.window.min ?? '>ladder'}×, intact ${cell.window.max ?? '<1.0'}×)`;
const targets = cfg.targets.filter((t) => only(args.target, t.name));
const viewports = cfg.viewports.filter((v) => only(args.viewport, v.label));

const chromium = findChromium();
if (!chromium) {
  console.error('no chromium found — set CHROMIUM_PATH');
  process.exit(2);
}

const PROBE = readFileSync(join(HERE, 'probe.js'), 'utf8');
const OVERLAY = readFileSync(join(HERE, 'overlay.js'), 'utf8');
const thresholds = cfg.thresholds || {};
const probeOpts = Object.assign({}, thresholds, { ladder: cfg.ladder });

const LAUNCH_ARGS = ['--ignore-certificate-errors', '--allow-insecure-localhost',
                     '--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];

async function load(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: cfg.timeoutMs || 45000 });
  await new Promise((r) => setTimeout(r, cfg.settleMs || 1200));
  await page.evaluate(PROBE);
  await page.evaluate(() => window.__scaleBench.snapshot());
  await page.evaluate((m) => window.__scaleBench.setMode(m), cfg.scaleMode || 'freeze');
}

async function interactive() {
  const target = targets[0];
  const vp = viewports[0];
  if (!target) { console.error('no such target'); process.exit(2); }
  const browser = await puppeteer.launch({
    executablePath: chromium, headless: false, defaultViewport: null,
    args: [...LAUNCH_ARGS, `--window-size=${vp.w},${vp.h + 90}`],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  /**
   * The panel drives the real viewport rather than a CSS fake, so media
   * queries and vw units resolve exactly as they would on a device of that
   * size — which is the whole point of testing odd aspect ratios.
   */
  await page.exposeFunction('__benchSetViewport', async (w, h) => {
    const width = Math.max(120, Math.min(8192, Math.round(w)));
    const height = Math.max(120, Math.min(8192, Math.round(h)));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    return { width, height };
  });

  await page.exposeFunction('__benchSavePolicies', async (payload) => {
    const file = join(outDir, 'policies.json');
    mkdirSync(outDir, { recursive: true });
    let all = [];
    if (existsSync(file)) { try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { all = []; } }
    all = all.filter((p) => p.page !== payload.page);
    all.push(payload);
    writeFileSync(file, JSON.stringify(all, null, 1));
    console.log(`saved ${payload.policies.length} policy(ies) for ${payload.page} → ${file}`);
    return file;
  });
  const url = cfg.baseUrl + target.path;
  console.log(`opening ${url} at ${vp.label}`);
  await load(page, url);
  await page.evaluate((d, o) => {
    window.__scaleBenchDeclared = d;
    Object.assign(window.__scaleBench.DEFAULTS, o);
  }, target.safeScale || null, probeOpts);
  await page.evaluate(OVERLAY);

  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return;
    try {
      await new Promise((r) => setTimeout(r, cfg.settleMs || 1200));
      await page.evaluate(PROBE);
      await page.evaluate(() => window.__scaleBench.snapshot());
      await page.evaluate((m) => window.__scaleBench.setMode(m), cfg.scaleMode || 'freeze');
      await page.evaluate((d, o) => {
        window.__scaleBenchDeclared = d;
        Object.assign(window.__scaleBench.DEFAULTS, o);
      }, target.safeScale || null, probeOpts);
      await page.evaluate(OVERLAY);
    } catch { /* navigated again mid-inject */ }
  });

  console.log('panel injected. close the browser window to exit.');
  await new Promise((r) => browser.on('disconnected', r));
}

/**
 * Which of two sweeps is the more pessimistic. Pages that render a force
 * simulation or a map lay out differently on every load, so a single sample
 * flaps between adjacent ladder steps and a regression gate built on it cries
 * wolf. Sampling a target `repeat` times and keeping the worst makes the
 * recorded window a floor rather than a coin toss.
 */
const worse = (a, b) => {
  const amax = a.window.max ?? -Infinity, bmax = b.window.max ?? -Infinity;
  if (amax !== bmax) return amax < bmax;
  return (a.window.min ?? Infinity) > (b.window.min ?? Infinity);
};

/** A baseline only needs the windows, so it stays small enough to commit. */
const slim = (r) => ({
  generatedAt: r.generatedAt,
  config: r.config,
  cells: r.cells.map((c) => ({ target: c.target, viewport: { label: c.viewport.label },
    volume: c.volume, window: c.window, usable: c.usable, baseline: c.baseline,
    repeats: c.repeats, spread: c.spread, error: c.error })),
});

/**
 * One chunk of the sweep.
 *
 * Cells are appended to `results.json` as each one finishes and skipped if
 * already recorded, so a run is resumable and no single invocation has to be
 * long. `--limit` caps how many cells a chunk does; when cells remain the exit
 * code is 3 and the gates are deferred to the invocation that finishes the
 * plan.
 */
async function sweep() {
  mkdirSync(shotDir, { recursive: true });
  const RESULTS = join(outDir, 'results.json');
  const key = (c) => `${c.target}|${c.viewport.label}|${c.volume}`;

  const volumes = cfg.volumes || [1];
  const done = new Map();
  if (!args.fresh && existsSync(RESULTS)) {
    for (const c of JSON.parse(readFileSync(RESULTS, 'utf8')).cells || []) done.set(key(c), c);
  }

  const plan = [];
  for (const t of targets) for (const vp of viewports) for (const vol of volumes) plan.push({ t, vp, vol });
  const pending = plan.filter((x) => !done.has(`${x.t.name}|${x.vp.label}|${x.vol}`));
  const limit = args.limit === undefined ? 8 : Number(args.limit);
  const batch = [];
  let budget = limit > 0 ? limit : Infinity;
  if (!args.report) {
    for (const x of pending) {
      const cost = x.t.repeat || cfg.repeat || 1;
      if (batch.length && cost > budget) break;
      batch.push(x);
      budget -= cost;
    }
  }

  const flush = () => {
    const cells = plan.map((x) => done.get(`${x.t.name}|${x.vp.label}|${x.vol}`)).filter(Boolean);
    const results = {
      generatedAt: new Date().toISOString(),
      config: { baseUrl: cfg.baseUrl, ladder: cfg.ladder, volumes, thresholds,
                matrixMetric: cfg.matrixMetric || 'new', require: cfg.require || null },
      cells,
    };
    writeFileSync(RESULTS, JSON.stringify(results, null, 1));
    return results;
  };

  if (batch.length) {
    const browser = await puppeteer.launch({
      executablePath: chromium, headless: args.headful ? false : 'shell', args: LAUNCH_ARGS,
    });
    const page = await browser.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    let n = 0;

    for (const { t, vp, vol } of batch) {
      n++;
      process.stdout.write(`[${n}/${batch.length}] ${t.name} ${vp.label} vol${vol} … `);
      const cell = { target: t.name, path: t.path, viewport: vp, volume: vol,
                     declared: t.safeScale || null, shots: {} };
      try {
        const reps = t.repeat || cfg.repeat || 1;
        const runs = [];
        for (let k = 0; k < reps; k++) {
          await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
          await load(page, cfg.baseUrl + t.path);
          if (vol !== 1) await page.evaluate((v) => window.__scaleBench.setVolume(v), vol);
          runs.push(await page.evaluate((o) => window.__scaleBench.sweep(o), probeOpts));
        }
        const res = runs.reduce((worst, r) => (worse(r, worst) ? r : worst));
        Object.assign(cell, {
          baseline: res.baseline, window: res.window, usable: res.usable,
          repeats: reps,
          spread: reps > 1 ? {
            max: [...new Set(runs.map((r) => r.window.max))],
            min: [...new Set(runs.map((r) => r.window.min))],
          } : undefined,
          steps: res.steps.map((s) => ({ ...s, findings: s.findings.slice(0, 25) })),
        });

        const wanted = new Set();
        if (args.shots !== 'none') {
          if (args.shots === 'all') for (const s of cfg.ladder) wanted.add(s);
          else {
            wanted.add(1);
            const firstBreak = res.steps.find((s) => s.scale >= 1 && s.newBreaking > 0);
            if (firstBreak) wanted.add(firstBreak.scale);
            if (cfg.ladder.includes(2)) wanted.add(2);
          }
        }
        for (const s of cfg.ladder) {
          if (!wanted.has(s)) continue;
          await page.evaluate((v) => window.__scaleBench.setScale(v), s);
          const file = `${t.name}__${vp.label}__v${vol}__s${s}.png`.replace(/[^\w.@×-]/g, '_');
          await page.screenshot({ path: join(shotDir, file) });
          cell.shots[String(s)] = 'shots/' + file;
        }

        Object.assign(cell, judge(cell));
        console.log((cell.summary || fmtWindow(cell)) + ` · ${cell.verdict}`);
      } catch (e) {
        cell.error = String(e).slice(0, 200);
        cell.verdict = 'error';
        console.log('ERROR ' + cell.error);
      }
      done.set(key(cell), cell);
      flush();
    }
    await browser.close();
  }

  const results = flush();
  const cells = results.cells;
  const remaining = pending.length - batch.length;

  writeFileSync(join(outDir, 'report.html'), renderReport(results));
  if (args.saveBaseline) writeFileSync(resolve(args.saveBaseline), JSON.stringify(slim(results), null, 1));
  console.log(`\nreport  ${join(outDir, 'report.html')}`);

  if (remaining > 0) {
    console.log(`${remaining} cell(s) still pending — run again to continue`);
    process.exit(3);
  }

  let bad = cells.filter((c) => c.verdict === 'FAIL' || c.verdict === 'error');
  if (bad.length) {
    console.log(`\n${bad.length} cell(s) failing:`);
    for (const c of bad) {
      const why = c.error ? c.error
        : c.declared ? `declared ${c.declared[0]}×–${c.declared[1]}×, measured ` + fmtWindow(c)
        : (c.summary || fmtWindow(c));
      console.log(`  ${c.target} ${c.viewport.label} vol${c.volume}: ${why}`);
    }
  }

  /**
   * Compare in ladder steps, not raw multipliers, so a target may declare how
   * much sampling noise to forgive. A page whose layout is a force simulation
   * flaps by one step no matter how many times it is sampled; without this the
   * gate reports a regression on an unchanged codebase.
   */
  const maxIdx = (v) => (v === null ? -1 : cfg.ladder.indexOf(v));
  const minIdx = (v) => (v === null ? cfg.ladder.length : cfg.ladder.indexOf(v));
  const tolerance = (name) => {
    const t = cfg.targets.find((x) => x.name === name);
    return (t && t.tolerance !== undefined) ? t.tolerance
      : (args.tolerance !== undefined ? Number(args.tolerance) : (cfg.tolerance || 0));
  };

  if (args.baseline) {
    const prev = JSON.parse(readFileSync(resolve(args.baseline), 'utf8'));
    const key = (c) => `${c.target}|${c.viewport.label}|${c.volume}`;
    const before = new Map(prev.cells.map((c) => [key(c), c]));
    const regressions = [];
    for (const c of cells) {
      const p = before.get(key(c));
      if (!p || p.error || c.error) continue;
      const tol = tolerance(c.target);
      const worseMax = maxIdx(p.window.max) - maxIdx(c.window.max) > tol;
      const worseMin = minIdx(c.window.min) - minIdx(p.window.min) > tol;
      if (worseMax || worseMin) {
        regressions.push(`  ${key(c)}: ${p.window.min ?? '>max'}–${p.window.max ?? '<1'}`
          + `  →  ${c.window.min ?? '>max'}–${c.window.max ?? '<1'}`);
      }
    }
    if (regressions.length) {
      console.log(`\n${regressions.length} regression(s) vs baseline:`);
      console.log(regressions.join('\n'));
      bad = bad.concat(regressions);
    } else {
      console.log('\nno regressions vs baseline');
    }
  }

  process.exit(bad.length ? 1 : 0);
}

await (args.interactive ? interactive() : sweep());
