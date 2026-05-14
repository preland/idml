export const CONFIG_ROUTE_TEMPLATE = `import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import fs from 'node:fs/promises';

const CONFIG_PATH = process.env.ISD_UI_CONFIG_PATH!;

export async function GET() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    return NextResponse.json(
      { error: \`Failed to read config: \${err instanceof Error ? err.message : String(err)}\` },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const tmp = CONFIG_PATH + '.tmp';

    await fs.writeFile(tmp, JSON.stringify(body, null, 2), 'utf-8');
    await fs.rename(tmp, CONFIG_PATH);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: \`Failed to write config: \${err instanceof Error ? err.message : String(err)}\` },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
`;
