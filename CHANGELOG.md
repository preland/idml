# Changelog

All notable changes to `idml-ui` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/) (pre-1.0: breaking changes bump the minor).

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
