// Server-side only exports
// Note: This entry point must never import from src/renderer/ or src/editor/

export { withUIConfig } from './next-plugin';
export { startWatcher, stopWatcher, addSSEWriter } from './next-plugin/watcher';
export type { UIConfigOptions } from './next-plugin';

// Parser is safe to use server-side (no React dependency)
export { parseIdml, parseIdmlWithSource } from './parser/idml-parser';
export type {
  ParseOptions,
  ParseWithSourceResult,
  ComponentOrigin,
  SourceSpan,
  ItemSrc,
} from './parser/idml-parser';
