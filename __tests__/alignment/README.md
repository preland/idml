# Alignment tests

These guard the framework's core promise: **the percentage sizes an author
writes in `.isdw` are faithfully realized in the rendered layout.**

Two layers, fastest first:

### 1. `conversion-alignment.test.ts` — fast, no browser

Asserts that the declared `[height%, width%]` of every element survives the
`parse → convert` pipeline unchanged in `LayoutDef.size`, across the
transformations that could silently corrupt it:

- nested `Row`/`Col` tiling
- `define` expansion (call-site dims on the wrapper, body dims inside)
- `Children` slot threading
- `Table` sugar (column widths preserved on generated cells)
- anchors (must not alter size)
- out-of-flow nodes (`Modal` / out-of-flow `define`) get `display:contents`
  and so consume no flow space

Runs in jsdom as part of `npm test`.

### 2. `layout-pixels.test.ts` — empirical, real Chromium

Renders the **real** `LayoutRenderer` to HTML, loads it in a headless Chromium
(via `puppeteer-core`, pointed at the system browser), and measures every
node's pixel box with `getBoundingClientRect`. It then asserts the measured box
equals the box implied by the declared cumulative percentages (±1px).

This catches regressions the conversion tests can't — e.g. a renderer change
that drops `flex-shrink:0`, adds padding to a container, or mishandles
`display:contents` would break percentage fidelity while leaving
`LayoutDef.size` untouched.

**Browser discovery / skipping.** It looks for `chromium`, `chromium-browser`,
`google-chrome`, or `google-chrome-stable` on `PATH` (override with
`CHROMIUM_PATH`). If none is found the whole suite skips cleanly — it never
turns into a red build on a machine without a browser.

## Running

```bash
npm test                 # everything (empirical part auto-skips w/o a browser)
npm run test:align       # just this directory
CHROMIUM_PATH=/path/to/chromium npm run test:align
```

## Adding a fixture

Add a case to `layout-pixels.test.ts` and call `check(source)` — it parses the
`.isdw`, renders + measures it, and compares against the declared percentages.
Keep empirical fixtures to pure `Row`/`Col` tiling so the DOM maps one-to-one to
the `LayoutDef` tree; exercise components and out-of-flow nodes in the
conversion tests (or with a bespoke assertion, as the `Modal` case shows).
