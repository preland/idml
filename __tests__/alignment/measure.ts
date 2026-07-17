/**
 * Empirical layout-measurement harness.
 *
 * The conversion tests prove the declared `[h%,w%]` survive into `LayoutDef`.
 * This harness goes one step further and proves the *rendered* result honours
 * them: it renders the REAL `LayoutRenderer` to HTML, loads it in a real
 * Chromium (so flexbox actually runs), and measures every node's pixel box.
 *
 * We deliberately render `LayoutRenderer` through a hand-built `ConfigContext`
 * rather than `ConfigProvider`, because `ConfigProvider` only commits its config
 * from a `useEffect`, which never fires under `renderToStaticMarkup`.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execSync } from 'node:child_process';
import type { Browser } from 'puppeteer-core';
import { parseIdml } from '../../src/parser/idml-parser';
import { ConfigContext } from '../../src/renderer/ConfigProvider';
import { LayoutRenderer } from '../../src/renderer/LayoutRenderer';
import type { UIConfig } from '../../src/types';

/** A measured DOM node: its pixel box plus computed `display`, mirroring the
 *  `LayoutDef` tree one-to-one (one `[data-idml-node]` div per layout node). */
export interface Measured {
  x: number;
  y: number;
  width: number;
  height: number;
  display: string;
  children: Measured[];
}

/** Locate a Chromium/Chrome binary, or return null so suites can skip. */
export function findChromium(): string | null {
  const fromEnv = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv) return fromEnv;
  for (const cmd of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try {
      const p = execSync(`command -v ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (p) return p;
    } catch {
      /* not found — try the next name */
    }
  }
  return null;
}

/** Wrap the renderer output in a strict-reset document at a known root size. */
function htmlDoc(config: UIConfig, page: number): string {
  const pageDef = config.pages[page];
  const tree = React.createElement(
    ConfigContext.Provider,
    {
      value: {
        config,
        darkMode: false,
        setDarkMode: () => {},
        tokenVars: {},
        debug: false,
        editorMode: false,
      },
    },
    // Mirror ConfigRenderer's page wrapper: a 100vw × 100vh flex column, so the
    // root layout's 100%/100% resolves against the viewport we set in Chromium.
    React.createElement(
      'div',
      {
        'data-idml-page': pageDef.route,
        style: { width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' },
      },
      React.createElement(LayoutRenderer, { layout: pageDef.layout, components: pageDef.components })
    )
  );
  const body = renderToStaticMarkup(tree);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;width:100%}
</style></head><body>${body}</body></html>`;
}

let browserPromise: Promise<Browser> | null = null;

/** Lazily launch (and reuse) a single headless Chromium for the whole suite. */
async function getBrowser(exe: string): Promise<Browser> {
  if (!browserPromise) {
    const puppeteer = (await import('puppeteer-core')).default;
    browserPromise = puppeteer.launch({
      executablePath: exe,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export interface MeasureOptions {
  exe: string;
  viewport?: { width: number; height: number };
  /** `resolve` for `import`s inside the .idml source (multi-file fixtures). */
  resolve?: (path: string) => string;
}

/** Parse `.idml`, render it for real, and return the measured layout tree. */
export async function measure(source: string, opts: MeasureOptions): Promise<Measured> {
  return measureDom(source, opts, () => {
    const walk = (el: Element): Measured => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const kids = Array.from(el.children).filter((c) => c.hasAttribute('data-idml-node'));
      return {
        x: r.x, y: r.y, width: r.width, height: r.height, display: cs.display, children: kids.map(walk),
      };
    };
    const rootEl = document.querySelector('[data-idml-node]');
    if (!rootEl) throw new Error('no [data-idml-node] root rendered');
    return walk(rootEl) as unknown as Measured;
  });
}

/**
 * Render a `.idml` source for real in Chromium and run an arbitrary in-page
 * probe against the live DOM, returning whatever it produces. Used for bespoke
 * measurements (e.g. a specific element's computed styles) the generic tree
 * walker doesn't capture.
 */
export async function measureDom<T>(
  source: string,
  opts: MeasureOptions,
  probe: () => T
): Promise<T> {
  const viewport = opts.viewport ?? { width: 1000, height: 1000 };
  const config = parseIdml(source, opts.resolve ? { resolve: opts.resolve } : undefined);
  const browser = await getBrowser(opts.exe);
  const page = await browser.newPage();
  try {
    await page.setViewport(viewport);
    await page.setContent(htmlDoc(config, 0), { waitUntil: 'load' });
    return (await page.evaluate(probe)) as T;
  } finally {
    await page.close();
  }
}
