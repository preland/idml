# Changelog

All notable changes to `idml-ui` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/) (pre-1.0: breaking changes bump the minor).

## 0.3.0

### Added

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
  is now pure `id`. Build/run/verify and the supported `.idml` subset, decisions,
  and roadmap are documented in `backends/id/README.md` and `DECISIONS.md`.

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
