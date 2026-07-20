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
cat examples/todo.idml | ./idml-id            > frame.ppm   # render to a PPM image
cat examples/todo.idml | ./idml-id --rects                  # print resolved x y w h rects
magick frame.ppm frame.png                                  # (optional) PPM -> PNG
```

`./verify.sh` builds and checks both paths headlessly (no display needed) — it
asserts the demo layout's exact geometry and that `todo.idml` renders a full
640×460 frame.

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

## Supported `.idml` subset (0.3.0)

**Parsed & resolved:** the layout tree of `Row`/`Col`/leaf nodes with
`[h, w, align]` percentage dimensions, arbitrary nesting, `(…)` argument lists
(skipped for layout), `{ … }` / `{}` child blocks, `#` line comments, `#rrggbb`
colours, and backtick class-strings. Percentage exact-fill layout for both axes.

**Known limitations / scope boundaries** (see `DECISIONS.md` for the why, and
the roadmap below):

- **Direction** is inferred from the node name: `Row` → horizontal, everything
  else → vertical. For `todo.idml` this is correct for every container except a
  1-child `Badge` (a `Row`-based `define`), where direction is moot. Full
  resolution of a `define`'s base kind is not yet wired.
- **Colours** in the render cycle a debug palette so nested regions read as
  distinct blocks; they are **not** yet pulled from each node's `bg`/`fg`
  `define`. The layout is what's proven here, not the skin.
- **Text** is not yet drawn. `id_development/nativeapp` already has a pure-`id`
  8×8 bitmap-font renderer (`gfx/draw/text`) to fold in.
- Sizing keywords beyond plain percentages (`hug`, `fit`, `fit-w/-h`) are
  ignored — `todo.idml` uses plain percentages throughout.

## Roadmap to fully retiring the JS build step

The native app (`id_development/nativeapp`) still generates `layout.gen.id` +
the font with two Node scripts (`build-scene.mjs`, `build-font.mjs`). To remove
Node from that project entirely:

1. **Colours from defines** — parse the leading `Name:Kind \`class\` { bg fg }`
   block into a name→colour map (the lexer already emits the colour + class
   tokens); use it in `paint`.
2. **`define`-aware direction** — map each user node name to its base
   `Row`/`Col`, replacing the name heuristic.
3. **Text** — fold in nativeapp's `gfx/draw/text` + `glyphs.gen.id` (the font is
   frozen public-domain data; `build-font.mjs` is only a one-off regenerator, so
   it is already out of the build/run loop).
4. **Emit `layout.gen.id`** — add a mode that prints the resolved geometry as
   `id` source, so this backend *is* the scene compiler and `build-scene.mjs`
   (the last Node in the loop) is deleted.

Each is additive; the parse + exact-fill core they build on is done and verified
here.
