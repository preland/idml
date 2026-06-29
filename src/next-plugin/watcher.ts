import chokidar from 'chokidar';

type SSEWriter = WritableStreamDefaultWriter<Uint8Array>;

const writers = new Set<SSEWriter>();
let watcher: ReturnType<typeof chokidar.watch> | null = null;

export function startWatcher(configPath: string): void {
  if (watcher) return;

  watcher = chokidar.watch(configPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('change', () => {
    broadcastConfigChange();
  });

  watcher.on('error', (err) => {
    console.error('[idml] Watcher error:', err);
  });
}

export async function stopWatcher(): Promise<void> {
  if (!watcher) return;
  await watcher.close();
  watcher = null;
}

export function addSSEWriter(writer: SSEWriter): () => void {
  writers.add(writer);
  return () => writers.delete(writer);
}

function broadcastConfigChange(): void {
  const encoder = new TextEncoder();
  const message = encoder.encode(`data: ${JSON.stringify({ type: 'config:change', ts: Date.now() })}\n\n`);

  for (const writer of writers) {
    writer.write(message).catch(() => {
      writers.delete(writer);
    });
  }
}
