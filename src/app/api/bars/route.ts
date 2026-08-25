import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateOHLCV, SEED_SYMBOLS } from '@/lib/engine/data-generator';
import type { OHLCVBar, Timeframe } from '@/types/trading';
import { TIMEFRAMES } from '@/types/trading';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolName = searchParams.get('symbol');
  const timeframe = (searchParams.get('timeframe') ?? '1D') as Timeframe;
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  const limitStr = searchParams.get('limit');

  if (!symbolName) {
    return NextResponse.json({ error: 'Missing required query param: symbol' }, { status: 400 });
  }

  const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 500, 1), 5000) : 500;
  const start = startStr ? parseInt(startStr, 10) : undefined;
  const end = endStr ? parseInt(endStr, 10) : undefined;

  // Look up the symbol
  let symbol = await db.symbol.findUnique({ where: { name: symbolName } });

  // Universal time range: all timeframes share the same start/end so
  // drawings with absolute timestamps map correctly across TFs.
  const UNIVERSAL_DAYS_BACK = 500;
  const now = new Date();
  const universalStart = new Date(now.getTime() - UNIVERSAL_DAYS_BACK * 86400 * 1000);
  universalStart.setHours(0, 0, 0, 0);
  const universalStartTs = Math.floor(universalStart.getTime() / 1000);
  const universalEndTs = Math.floor(now.getTime() / 1000);
  const MAX_BARS = 5000;

  // If no symbol exists, create it and generate 1D bars
  if (!symbol) {
    const config = SEED_SYMBOLS.find((s) => s.symbol === symbolName);
    if (!config) {
      return NextResponse.json({ error: `Unknown symbol: ${symbolName}` }, { status: 404 });
    }

    const createdSymbol = await db.symbol.create({
      data: {
        name: config.symbol,
        exchange: 'SIM',
        type: config.category === 'Forex' ? 'forex'
          : config.category === 'Crypto' ? 'crypto'
          : config.category === 'Commodities' ? 'commodity'
          : config.category === 'Futures' ? 'futures'
          : config.category === 'Indices' ? 'index'
          : 'stock',
      },
    });

    symbol = createdSymbol;

    // Generate 1D bars for the universal range
    const dailyBars = generateOHLCV(symbolName, universalStart, 500, '1D');

    await db.bar.createMany({
      data: dailyBars.map((bar) => ({
        symbolId: createdSymbol.id,
        timestamp: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
        timeframe: '1D',
      })),
    });
  }

  // Build the where clause
  const where: Record<string, unknown> = { symbolId: symbol.id, timeframe };

  if (start !== undefined) {
    where.timestamp = { ...(where.timestamp as Record<string, unknown>), gte: start };
  }
  if (end !== undefined) {
    where.timestamp = { ...(where.timestamp as Record<string, unknown>), lte: end };
  }

  // Query bars sorted by timestamp
  let bars = await db.bar.findMany({
    where,
    orderBy: { timestamp: 'asc' },
    take: limit,
  });

  // If no bars found for this timeframe, generate them using the UNIVERSAL time range
  if (bars.length === 0) {
    const tfSeconds = TIMEFRAMES[timeframe]?.seconds ?? 86400;
    const timeRangeSeconds = universalEndTs - universalStartTs;
    const barCount = Math.min(MAX_BARS, Math.max(100, Math.floor(timeRangeSeconds / tfSeconds)));

    const generatedBars = generateOHLCV(symbolName, universalStart, barCount, timeframe);

    await db.bar.createMany({
      data: generatedBars.map((bar) => ({
        symbolId: symbol.id,
        timestamp: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: BigInt(Math.round(bar.volume)),
        timeframe,
      })),
    });

    bars = await db.bar.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
    });
  }

  // If a range is specified but take doesn't get the right slice, we need to handle it
  // Prisma take just takes the first N, so if there's a start param we need last N
  let resultBars = bars;
  if (bars.length > limit) {
    resultBars = bars.slice(-limit);
  }

  const data: OHLCVBar[] = resultBars.map((b) => ({
    time: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: Number(b.volume),
  }));

  return NextResponse.json({ data });
}
