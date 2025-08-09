import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const meta = {
      name: (file as any).name || 'uploaded',
      type: (file as any).type || 'application/octet-stream',
      size: (file as any).size || 0
    };

    let preview = '';
    if (/^text\/|\/csv$/.test(meta.type) || /\.(txt|csv)$/i.test(meta.name)) {
      const buf = Buffer.from(await (file as any).arrayBuffer());
      preview = buf.toString('utf8').slice(0, 4000);
    }

    return NextResponse.json({ success: true, meta, preview });
  } catch (error) {
    console.error('Parse-file error:', error);
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 });
  }
}
