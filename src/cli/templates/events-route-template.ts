export const EVENTS_ROUTE_TEMPLATE = `import { startWatcher, addSSEWriter } from 'idml-ui/server';

const CONFIG_PATH = process.env.ISD_UI_CONFIG_PATH!;

startWatcher(CONFIG_PATH);

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': ping\\n\\n'));

      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\\n\\n'));
        } catch {
          clearInterval(interval);
        }
      }, 25_000);

      const unregister = addSSEWriter(controller as any);

      return () => {
        clearInterval(interval);
        unregister();
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    },
  });
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
`;
