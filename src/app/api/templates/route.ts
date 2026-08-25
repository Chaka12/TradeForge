import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const templates = await db.chartTemplate.findMany({
    orderBy: { createdAt: 'desc' },
  });

  const data = templates.map((t) => ({
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    config: JSON.parse(t.config),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, symbol, config } = body;

  if (!name || config == null) {
    return NextResponse.json(
      { error: 'Missing required fields: name, config.' },
      { status: 400 },
    );
  }

  const configStr = typeof config === 'string' ? config : JSON.stringify(config);

  const template = await db.chartTemplate.create({
    data: {
      name,
      symbol: symbol ?? null,
      config: configStr,
    },
  });

  return NextResponse.json({
    data: {
      id: template.id,
      name: template.name,
      symbol: template.symbol,
      config: JSON.parse(template.config),
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Missing required query param: id.' },
      { status: 400 },
    );
  }

  const template = await db.chartTemplate.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  await db.chartTemplate.delete({ where: { id } });

  return NextResponse.json({ success: true, id });
}
