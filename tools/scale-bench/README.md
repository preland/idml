# scale-bench

Measures how far a UI's text can be scaled before it starts losing content,
and fails when that number regresses.

idml sizes text in `vw`, so browser zoom cannot resize it at all (verified: the
same label measures 24.4px at 100%, 200% and 400% zoom). Any accessibility text
scaling therefore has to come from a multiplier the framework applies itself —
and the question that immediately follows is *how far can it go before the
layout eats the text*. `fit`/`fit-w` boxes emit
`overflow:hidden; text-overflow:ellipsis`, so an idml page never overflows: it
truncates. Document overflow stays at zero while content quietly disappears,
which means the only way to know the safe range is to measure it.

This tool measures it.

## The number it produces

For each page × viewport × text-volume, a **safe window** `[min, max]`:

- `max` — the largest multiplier reached with no truncation, clipping or
  collision the page did not already have at 1.0×.
- `min` — the smallest multiplier at which no text sits below the legibility
  floor (10px by default).

When `min > max` the page has **no safe window**: there is no multiplier at
which it is both legible and intact. That is the interesting failure, and the
report says so in words rather than printing a backwards range.

Two axes matter, not one. Text gets bigger when a user scales it *and* when the
data is wordier than the sample rows, so `volumes` sweeps synthetic text
expansion (each string retargeted to N× its length by repeating its own words)
alongside the scale ladder.

## Finding the number: interactive

```sh
node tools/scale-bench/bench.mjs --interactive \
  --target assignments --viewport laptop-1366x768
```

Opens a real browser with a panel over the running app.

**It scans continuously.** A `MutationObserver` plus a `ResizeObserver` re-measure
on every change the app makes, so a misfit is flagged when it appears rather
than when you remember to ask. Every write the tool itself makes — scaling,
retargeting text, painting marks, applying a policy — happens with the observer
deaf, or the first slider move would feed itself back in and never settle.

**Sliders, past their ends.** Scale and volume have sliders, and both readouts
are clickable: type any value and the slider's range grows to include it. 4× on
a page that breaks at 1.25× is a legitimate thing to want to look at.

**Viewport.** Type a width and height, or pick a preset, and the *real* viewport
changes — the panel calls back into the driving process, which emulates the
device metrics, so media queries and `vw` units resolve exactly as they would at
that size. 3440×600 and 320×900 behave like the real thing, not like a scaled
screenshot. This control needs `--interactive`; pasted into a devtools console
it reports itself unavailable and everything else still works.

**Marks, and picking in the page.** Red for horizontal truncation, orange for
vertical clipping, purple for collisions, blue for text under 10px; the
selected one turns cyan and thickens. The marks button cycles three states:

- `marks: pick` — visible, and **clicking one selects that element**, so a
  misfit can be picked where you can see it instead of hunted for in the list
- `marks: show` — visible but click-through, so the app stays usable underneath
- `marks: off` — hidden

One click does one thing. Selecting from the list or from a mark opens the
remedy picker immediately, and the selection survives the scan its own repaint
triggers — that is why selection lives in the panel's state and is re-applied
on every paint, rather than living in the marks themselves.

**Drag it.** The panel moves by its header and clamps to the viewport. Buttons
in the header do not start a drag.

**sweep** runs the whole ladder and reports the safe window.

## Remedies

Select a flagged element and give it a policy. Each is applied live, so the
next scan — a fraction of a second later — tells you whether it actually fixed
the problem or moved it somewhere else.

| policy | effect |
| --- | --- |
| `truncate` | clip with an ellipsis; content is lost but layout holds |
| `wrap` | let the text run onto more lines; the box grows taller |
| `scroll` | keep the box and let the user scroll inside it |
| `scroll-parent` | scroll the containing box instead of this one |
| `shrink` | this box may take less than its declared share |

Independently of those, **stop scaling past N×** caps the element *and its
subtree*: text there grows with the user's setting up to N× and then stops. The
cap has to inherit, because font-size is written on every element individually —
a cap that did not would leave the capped node's own children growing past it.

`save policies` writes what you have chosen to `out/policies.json`, keyed by
page, with each element's DOM path, its idml node id where one is exposed, and
the spec. **Nothing applies this to production yet** — see below.

## Guarding the number: sweep

```sh
npm run scale-bench                              # one chunk, resumable
npm run scale-bench -- --target changelog        # one page
npm run scale-bench -- --shots all               # screenshot every step
```

Writes `out/report.html` (a clickable matrix — every cell opens the screenshot
and the findings behind it), `out/results.json`, and `out/shots/`.

A cell is appended to `out/results.json` the moment it finishes, and cells
already recorded are skipped, so an invocation does a chunk of the plan rather
than all of it. `--limit` is that chunk, counted in page loads (default 8,
about 25 seconds); when work remains the exit code is **3** and the gates are
deferred to the invocation that finishes the plan. A whole run is therefore a
loop, and a failure lands in a short run you can re-run on its own:

```sh
node tools/scale-bench/bench.mjs --fresh --baseline tools/scale-bench/baseline.json
while [ $? -eq 3 ]; do node tools/scale-bench/bench.mjs --baseline tools/scale-bench/baseline.json; done
```

`--fresh` discards the recorded cells and starts the plan over; without it the
loop resumes. `--report` rebuilds the report and re-runs the gates from
`results.json` without opening a browser.

There are two independent gates, and they answer different questions.

**Did anything get worse?** `baseline.json` is committed and holds the windows as
measured today. The `npm run scale-bench` script compares against it and exits
non-zero if any page's window narrowed, naming the cells that moved. Only cells
present in both runs are compared, so `--target x` still gates correctly.
Re-record it once a change is a deliberate improvement:

```sh
node tools/scale-bench/bench.mjs --save-baseline tools/scale-bench/baseline.json
```

**Have we hit the goal yet?** Optional, per target — add the range a page is
supposed to support:

```json
{ "name": "assignments", "path": "/admin/assignments", "safeScale": [1.0, 1.3] }
```

The bench then exits non-zero unless the measured window *covers* the declared
one, at every viewport and volume, so the budget is a checked claim rather than
a comment. No target ships with one, because at the time of writing no page
reaches 1.3×: set it on a page once you have fixed it, and it stays fixed.

## Options

| flag | meaning |
| --- | --- |
| `--config <file>` | config JSON (default `scale-bench.config.json`) |
| `--base-url <url>` | override the config's `baseUrl` |
| `--out <dir>` | output directory (default `tools/scale-bench/out`) |
| `--target <a,b>` | only these targets |
| `--viewport <a,b>` | only these viewport labels |
| `--shots all\|none` | screenshot every ladder step, or none (default: 1.0×, first breaking step, 2.0×) |
| `--baseline <file>` | compare against a previous `results.json`; exit 1 on regression |
| `--save-baseline <f>` | also write this run to `<f>` |
| `--tolerance <n>` | forgive this many ladder steps in the baseline comparison |
| `--interactive` | headful browser with the slider panel |
| `--headful` | run the sweep headful, to watch it |

Chromium is found on `PATH`, or via `CHROMIUM_PATH` / `PUPPETEER_EXECUTABLE_PATH`
— the same discovery `__tests__/alignment/measure.ts` uses. The app under test
must already be running at `baseUrl`.

## What it measures, and what it does not

Scale is simulated by freezing each element's computed `font-size` and
re-emitting it multiplied — exactly what a `--idml-text-scale` variable would
do. The freeze detaches font-size inheritance and any em-based spacing, which
is deliberate: it isolates text growth from everything else that might move. A
real implementation that also scales padding will break at a *lower* multiplier
than this reports, so treat the measured ceiling as an upper bound.

Overlap detection intersects each run of glyphs with every clipping ancestor
before comparing, because `Range.getClientRects()` otherwise returns the full
untruncated extent of ellipsised text and fabricates collisions. The default
`overlapRatio` is 0.03 — real collisions in the relationship graph sit at 1–11%
of the smaller glyph box, so a coarser threshold misses them.

Not measured: content pushed below the fold (legitimate on scrollable pages),
letterboxed SVG (`preserveAspectRatio` is not distortion), and anything inside
a horizontal scroll strip.

The probe is plain JS with no build step — `probe.js` and `overlay.js` can be
pasted into a devtools console, in that order, to get the same panel on a page
the bench is not driving.

## Non-deterministic pages

`relationships` and `explorer` lay out differently on every load — a force
simulation and a map — so a single sample flaps between adjacent ladder steps
and the gate cries wolf. Sampling a target several times and keeping the
pessimistic result makes the recorded window a floor rather than a coin toss:

```json
{ "name": "relationships", "path": "/admin/relationships", "repeat": 3 }
```

The report annotates those cells with "worst of N", and "varied" when the
samples disagreed. Costs a page load per repeat, so set it only where it is
needed. A `repeat` at the top level applies to every target.

Repeats narrow the noise but do not remove it — label positions on a force
graph are genuinely random. So those targets also forgive one ladder step in
the regression gate:

```json
{ "name": "relationships", "path": "/admin/relationships", "repeat": 3, "tolerance": 1 }
```

The comparison is done in ladder steps, so `tolerance: 1` means "only complain
if the window moved by more than one step". `--tolerance N` sets it for a run;
a top-level `tolerance` sets the default. Leave it at 0 for deterministic
pages — that is where the gate is worth having tight.

## Persisting a policy to production — not built

`out/policies.json` is a record of decisions, not something the app reads. Making
these stick in production runs into three facts about idml, all verified in the
source:

1. **Classes are not the route.** `LAYOUT_CLASS_PATTERNS`
   (`src/parser/idml-parser.ts:410-448`) rejects `overflow-*`, `truncate`,
   `min-w-*` and `shrink` outright — idml deliberately owns geometry. The
   parser's own error text names the intended route instead: "a style-block prop
   (pad/gap/align/overflow, or a raw CSS prop like flexShrink)".
2. **Style blocks can express four of the five policies.** `case 'overflow'`
   (`idml-parser.ts:491`) and the raw-CSS passthrough (`idml-parser.ts:494`) let
   a style block carry `overflow`, `whiteSpace`, `textOverflow`, `minWidth`. Note
   `overflow:` in a style block compiles to `overflowY` only, so a horizontal
   policy needs `overflowX` written explicitly.
3. **The write-back cannot reach them.** `planEdit`
   (`src/parser/source-writer.ts:91-147`) replaces pre-identified source spans
   for exactly five props — `text | height | width | anchor | className`
   (`source-writer.ts:23`). It cannot add a style block, add a keyword, or insert
   anything that had no span at parse time. The bracket spec accepts one sizing
   keyword and no more (`idml-parser.ts:914-928`).

There is also no `capScale` concept anywhere in the framework, and the sizing
vocabulary is closed at seven keywords (`fit`, `fit-w`, `fit-h`, `fill`,
`fill-w`, `fill-h`, `hug`).

So persistence is a change to idml itself, not to this tool. The identity
problem is the other half: `data-idml-id` is emitted only in editor mode
(`src/renderer/LayoutRenderer.tsx:164`) and its value comes from a counter reset
per parse (`idml-parser.ts:1172-1173`, `2277`), so it names a node within a
session but not across an edit.
