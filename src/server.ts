// Server-side only exports
// Note: This entry point must never import from src/renderer/ or src/editor/

export { withUIConfig } from './next-plugin';
export { startWatcher, stopWatcher, addSSEWriter } from './next-plugin/watcher';
export type { UIConfigOptions } from './next-plugin';
