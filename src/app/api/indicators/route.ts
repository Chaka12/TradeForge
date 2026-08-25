import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { INDICATORS } from '@/lib/engine/indicators';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const custom = searchParams.get('custom');

  if (custom === 'true') {
    // List custom indicator plugins from DB
    const plugins = await db.indicatorPlugin.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const data = plugins.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      code: p.code,
      parameters: JSON.parse(p.parameters),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json({ data });
  }

  // List all built-in indicators (strip the calculate function)
  const data = Object.values(INDICATORS).map((ind) => ({
    name: ind.name,
    displayName: ind.displayName,
    description: ind.description,
    parameters: ind.parameters,
  }));

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, code, parameters } = body;

  if (!name || !code) {
    return NextResponse.json(
      { error: 'Missing required fields: name, code.' },
      { status: 400 },
    );
  }

  const plugin = await db.indicatorPlugin.create({
    data: {
      name,
      description: description ?? null,
      code,
      parameters: parameters ? JSON.stringify(parameters) : '{}',
    },
  });

  return NextResponse.json({
    data: {
      id: plugin.id,
      name: plugin.name,
      description: plugin.description,
      code: plugin.code,
      parameters: JSON.parse(plugin.parameters),
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
    },
  });
}
