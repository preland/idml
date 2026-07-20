# idml · id backend

A **pure-[`id`](https://github.com/preland/id) implementation of idml** — it
reads an `.idml` document, resolves its percentage *exact-fill* layout to
absolute pixels, and renders it into a software framebuffer. When idml runs on
this backend there is **no TypeScript, no JavaScript, and no npm anywhere in the
loop** — parsing, layout, and rendering are all `id`, compiled to a native
binary by the `id` compiler.

This is the first step of idml 0.3.0's direction: idml as a **code-agnostic UI
spec**. The `.idml` language stays the contract; the *runtime* becomes a
pluggable backend. The original backend (`../../src`) resolves an `.idml` to a
React/Next tree in TypeScript; **this** backend resolves the same `.idml` to
native pixels in `id`.

```
  .idml  ──►  lex (id)  ──►  parse + exact-fill layout (id)  ──►  framebuffer (id)  ──►  PPM
             │
             └─ zero TS / JS / npm — just the id compiler and cc
```

## Build & run

The only tool required is the `id` compiler (`bin/idc`) from an
[`id_development`](https://github.com/preland/id) checkout.

```sh
ID_REPO=~/git/id_development ./build.sh          # -> ./idml-id (native binary)

# id has no file-open builtin, so a document is piped in on stdin:
cat examples/todo.idml        | ./idml-id          > frame.ppm   # render to a PPM image
cat examples/stress-test.idml | ./idml-id          > stress.ppm  # the diagnostic (below)
cat examples/todo.idml        | ./idml-id --rects                # print resolved x y w h rects
magick frame.ppm frame.png                                       # (optional) PPM -> PNG
```

The backend builds under **both** id compilers — `bin/idc` (primary) and the
strict reference `idc.py` — so the whole `src/` tree honours id's rule-of-3
(≤3 functions/file, ≤3 actions/block, ≤3 entries/directory).

`./verify.sh` builds and checks everything headlessly (no display needed): the
demo layout's exact geometry, a full `todo.idml` render, and the **stress test**
checked pixel-by-pixel.

### The stress test — `examples/stress-test.idml`

A single `.idml` that renders correctly **only if every feature works**, so it
doubles as a smoke test for a fresh build. Each region targets one feature:

- **Title** — text rendering + a `define`'s `fg` colour.
- **Swatches** — a `Row` of four equal cells: horizontal tiling + four parsed
  `bg` colours + labels. Wrong direction stacks them; wrong colour parsing tints
  them wrong.
- **Grid** — a `Row` of two `Col`s, each split in two: a dark/light **checker-
  board** that only comes out right if Row-vs-Col nesting alternates correctly.
- **Bars** — a `Row` split 10/20/30/40: a left-to-right **staircase** that only
  lines up if exact-fill percentage widths resolve to the right pixels.

`verify.sh` asserts the checkerboard quadrants, swatch colours, staircase
extremes, and title-ink presence — a broken or half-built backend fails there.

## How it works

The backend is an `id` project (`src/`), a wide shallow tree of tiny functions
(id's rule-of-3: ≤3 functions/file, ≤3 actions/block). The pipeline:

| stage | files | what it does |
| --- | --- | --- |
| **read** | `src/io` | slurp the `.idml` from stdin; a `slice` (substring) helper |
| **lex** | `src/lex` | one pass → a token stream (idents, numbers, strings, `#rrggbb` colours, class-strings, punctuation). Handles idml comments, `#hex` colours (via a hex-lookahead), and backtick class-strings |
| **parse + layout** | `src/parse` | recursive descent over the layout tree (`Name(args)[h,w,align] { … }`). Layout is **fused into the parse**: each node's pixel rect is computed from its parent's rect and the node's percentage header, so no AST is stored — exactly the shape id's constraints favour |
| **render** | `src/parse/paint*`, `src/gfx` | fill each node's rect into an `int[]` framebuffer (`0xRRGGBB`); dump it as a P3 PPM. The `gfx/` framebuffer + PPM code is vendored from `id_development/nativeapp` |

The layout rule matches idml's plain-percentage exact-fill and the reference
resolver (`nativeapp/scripts/build-scene.mjs`): in a **Col**, each child's
height is its `h%` of the parent and width fills; in a **Row**, each child's
width is its `w%` and height fills. Children tile along the main axis with a
running offset.

### Verified against the JavaScript resolver

Run on the real `nativeapp/ui/todo.idml`, this backend reproduces
`build-scene.mjs`'s pixel geometry within ±1–3 px (the only difference is
rounding: this backend rounds `(v·pct+50)/100`, matching `Math.round`). E.g. the
card rect resolves to `90 41 461 377` — identical to the JS output. So the piece
that previously required Node (`build-scene.mjs` imports idml's **TypeScript**
`parseIdml`) is now done in pure `id`.

## Supported `.idml` subset

**Parsed, resolved & rendered:**

- The layout tree of `Row`/`Col`/leaf nodes with `[h, w, align]` percentage
  dimensions, arbitrary nesting, `(…)` argument lists, and `{ … }` / `{}` child
  blocks. Percentage exact-fill layout for both axes.
- The `define` block: `Name:Kind \`class\` { bg: #rrggbb  fg: #rrggbb }` →
  **`define`-aware direction** (a node's flex direction is its definition's base
  `Row`/`Col`) and **real colours** (each node fills with its `bg`; built-ins,
  spacers, and text-only nodes are transparent).
- **Text**: a node's first string argument is drawn as a label in its `fg`
  colour, via a pure-`id` 8×8 bitmap font (vendored from
  `id_development/nativeapp/gfx/draw/text`).
- `#` line comments, `#rrggbb` colours (hex-lookahead disambiguates from
  comments), backtick class-strings.

**Scope boundaries** (see `DECISIONS.md`; roadmap below):

- **Data bindings** (`@ref`, `~model`, handlers) are parsed but not resolved —
  they carry no literal, so e.g. `BadgeNum(@remaining)` draws no text. Wiring a
  data source is app-level.
- **Tailwind class references** are intentionally ignored — a styling-wrapper
  syntax will replace them later (explicit 0.3.0 non-goal).
- Sizing keywords beyond plain percentages (`hug`, `fit`, `fit-w/-h`) are
  ignored — the example `.idml`s use plain percentages throughout.
- Hex colours are read as lowercase/decimal digits (uppercase A–F not mapped).

## Roadmap to fully retiring the JS build step

The native app (`id_development/nativeapp`) still generates `layout.gen.id` with
a Node script (`build-scene.mjs`, which imports idml's **TypeScript** parser).
The parse + exact-fill layout + colours + text it needs are now all done here in
pure `id`; what remains to delete that last Node step:

1. **Emit `layout.gen.id`** — add an output mode that prints the resolved
   geometry + palette as `id` source (the app's fixed slot legend), so this
   backend *is* the scene compiler and `build-scene.mjs` is removed. (The font's
   `build-font.mjs` emits frozen public-domain data and is already out of the
   build/run loop.)
2. **Data bindings** — resolve `@ref`/`~model` against an app-provided source so
   dynamic text (counts, field values) renders.

Both are additive on the parse + layout + paint core, which is done and verified
here (see `verify.sh`).
