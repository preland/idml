# Changelog

All notable changes to `idml-ui` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/) (pre-1.0: breaking changes bump the minor).

## Unreleased

Everything below is on `master` but **not yet published to npm** — the registry
still serves 0.3.0. A release needs a version bump and `npm publish`.

### Added

- **`vars { }` block.** Declares the CSS custom properties the UI is tuned by
  (`vars { --idml-radius: 0.3vw }`) beside the variants that spend them, rather
  than in a stylesheet the DSL cannot see. Compiled to one document-level
  `:root` rule, so a portalled `Modal` inherits them too. A non-custom-property
  key is a parse error.

- **`Gesture` builtin.** `Gesture("pan", onPan)` binds a drag, `"zoom"` the
  wheel, `"brush"` a drag that reports the span it covered — interactions the
  DSL previously could not express, since a handler only ever fired on click.
  Renders nothing and takes no layout space, like `Hotkey`. Distances are
  reported in pixels *and* as a fraction of the container. `"zoom:ctrl"` requires
  a modifier so an unmodified wheel still scrolls the page.

- **`Hotkey` builtin, and a double-click handler.** `Hotkey("Escape", close)`
  binds a document-level key to a method; Ctrl and Meta are interchangeable so
  one binding covers both platforms. A *second* handler argument now binds to
  `onDoubleClick`.

- **Dimension parameters on a `define`.** A bare parameter name in a definition
  body's `[height,width]` binds to the number the call site passed, so one
  definition can be opened at each caller's own size. Naming a non-parameter, or
  binding a non-number to one, is a parse error.

- **Percentages in a style block.** `minWidth: 100%` is now expressible; a `%` in
  a `[height,width]` field is still rejected, since those numbers already are
  percentages.

- **Container-query units for font sizes.** A `fontSize` authored in `cqw`/`cqh`
  is pinned to its own box, and the scale-bench multiplier leaves it alone — such
  a size has already declared itself a fraction of its container.

- **`scale-bench` (`tools/scale-bench`).** Loads a page across viewport x scale x
  text-volume, detects truncation, clipping, overlap and sub-legible text, and
  fails against a saved baseline. Two gates: relative (`safeScale`) and absolute
  (`require`).

- **`ConfigRenderer` accepts `initialFormValues`** to seed the form scope.

### Changed

- **A `Modal` is sized by its own `[h,w]`.** The panel portals out of the cell
  the layout built for it, so those percentages now land on the panel itself and
  read against the viewport-sized backdrop. Previously they sized a box nobody
  saw. An explicit `width`/`height` in the style block still wins. *Existing
  modals will change size.*

- **A `Checkbox` or `Radio` keeps its intrinsic width.** The renderer's blanket
  `width: 100%` stretched a fixed square into a rectangle. Its cell still
  reserves the declared `[h,w]`.

- **Table cells spend whitespace before truncating.** Cell gutters are flex
  siblings carrying a large shrink factor, so the browser gives up padding first,
  per-column and on demand, and only truncates once the gutters hit zero. A
  truncated cell reveals its full content on focus (no React state, no JS).
  Measured on the changelog page at 1920x1080: 15 -> 5 breaking elements at
  1.25x, 28 -> 15 at 1.5x. Resting layout unchanged.

### Fixed

- **`Button` `borderWidth` actually draws.** `BUTTON_BASE`'s `border: none` left
  border-style at `none`, so an authored width computed to 0 and the border never
  appeared.

- **No self-limiting `%`-cap on a `fit` leaf in a content-flow parent.** The cap
  was a share of the width the child itself produced, so it could never reach the
  space the parent actually had. An authored raw-CSS `maxWidth` still survives.

- **`LayoutRenderer` no longer discards an authored `flexShrink`** — the default
  now sits above the spread, not below it.

## 0.3.0

### Added

- **Visual editor: parent highlight.** The preview now outlines the *parent
  container* of the highlighted node (emerald) alongside the node itself (amber
  hover / blue selection), so an element's container is always visible.

### Fixed

- **Style-block values may start with a hyphen.** The tokenizer now accepts
  vendor-prefixed CSS values (`display: -webkit-box`) and negative numbers
  (`marginTop: -0.5vw`) in a style block, instead of throwing "Unexpected
  character '-'".

- **`Repeat` lays out along either axis, in either mode.** A `Repeat` now flows
  its items in its parent container's direction for BOTH layout modes: equal-fill
  in a definite parent (each item 1/N of the axis) and natural-size + scroll in a
  content-flow parent (the container fits or scrolls its main axis). Previously
  the content-flow case was column-only, so a *horizontal* scrolling strip wasn't
  expressible — now a `Row` with `overflowX: auto` (or `fit-w`) holding a `Repeat`
  gives a horizontal strip, exactly as a scrolling `Col` gives a vertical list.
  Backward-compatible: existing vertical lists and equal-fill grids are unchanged.

- **idml is now backend-agnostic — first `id`-language backend (`backends/id/`).**
  idml starts to become a *code-agnostic* UI spec: the `.idml` language is the
  contract, and the runtime is a pluggable backend. Alongside the existing
  TypeScript/React backend (`src/`), there is now a **pure-[`id`](https://github.com/preland/id)
  backend** that reads an `.idml` document, resolves its exact-fill percentage
  layout to absolute pixels, and renders it into a software framebuffer — with
  **no TypeScript, JavaScript, or npm anywhere in the loop** (parse, layout, and
  render are all `id`, compiled to a native binary).
- The id backend's layout resolver reproduces the reference JS resolver
  (`id_development/nativeapp/scripts/build-scene.mjs`, which imports idml's TS
  parser) to the pixel on `todo.idml` — the piece that previously required Node
  is now pure `id`.
- The backend resolves **real colours and direction from the `define` block**
  and draws **text labels** via a pure-`id` 8×8 bitmap font. It builds under both
  id compilers (`bin/idc` and the strict `idc.py`), so `src/` fully honours id's
  rule-of-3. A self-verifying `examples/stress-test.idml` exercises nesting,
  Row/Col direction, colour parsing, exact-fill proportions, and text; `verify.sh`
  checks it pixel-by-pixel. Build/run/verify, the supported `.idml` subset,
  decisions, and roadmap are documented in `backends/id/README.md` and
  `DECISIONS.md`.

This release is additive: the TypeScript backend and public API are unchanged.

## 0.2.0

### Breaking

- **Exact-fill layout model.** Sizing keywords were redefined so every container
  fills its parent exactly: `hug` now means *fill remaining space* (previously
  "grow"), and `fit` means *natural size, capped and counted* (previously
  "content-hug"). Configs and `.idml` pages authored against the old semantics
  must re-author their sizing keywords. The layout validator and test suite were
  rewritten for the new model.

### Added

- **Visual editor round-trip.** The browser editor (`/idml/editor`) now writes
  edits back to `.idml` source via surgical source patching rather than
  regeneration, with source-position tracking, undo, an anchor picker, and
  viewport hover/right-click selection including containers and an ancestor
  breadcrumb. New parser export `parseIdmlWithSource`.
- Position-absolute children are treated as out-of-flow (enables anchored flyouts).
- Content-height tables stack their rows instead of equal-filling.

### Fixed

- The page tree re-renders on viewport resize.
- Corrected the editor route referenced in the README (`/idml/editor`).

## 0.1.0

- Initial release: config-driven UI framework for Next.js 15 + TypeScript +
  Tailwind, `.idml` DSL parser, renderer, design tokens, data binding, and the
  browser-based visual editor.
