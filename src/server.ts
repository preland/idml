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
  VariantInfo,
  SourceSpan,
  ItemSrc,
} from './parser/idml-parser';

// Source-preserving write-back for the visual editor (server-only).
export { applyEdits, planEdit } from './parser/source-writer';
export type { SpanEdit, EditableProp, EditRequest, EditPlan } from './parser/source-writer';
