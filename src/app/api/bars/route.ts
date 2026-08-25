import { NextRequest, NextResponse } from 'next/server';
import { generateOHLCV, SEED_SYMBOLS } from '@/lib/engine/data-generator';
import type { OHLCVBar, Timeframe } from '@/types/trading';
import { TIMEFRAMES } from '@/types/trading';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolName = searchParams.get('symbol');
  const timeframe = (searchParams.get('timeframe') ?? '1D') as Timeframe;
  const limitStr = searchParams.get('limit');

  if (!symbolName) {
    return NextResponse.json({ error: 'Missing required query param: symbol' }, { status: 400 });
  }

  // Validate symbol exists in our seed config
  const config = SEED_SYMBOLS.find((s) => s.symbol === symbolName);
  if (!config) {
    return NextResponse.json({ error: `Unknown symbol: ${symbolName}` }, { status: 404 });
  }

  const limit = limitStr ? Math.min(Math.max(parseInt(limitStr, 10) || 500, 1), 5000) : 500;

  // Universal time range: all timeframes share the same start/end so
  // drawings with absolute timestamps map correctly across TFs.
  const UNIVERSAL_DAYS_BACK = 500;
  const now = new Date();
  const universalStart = new Date(now.getTime() - UNIVERSAL_DAYS_BACK * 86400 * 1000);
  universalStart.setHours(0, 0, 0, 0);

  // Calculate how many bars fit in the universal range for this timeframe
  const tfSeconds = TIMEFRAMES[timeframe]?.seconds ?? 86400;
  const universalEndTs = Math.floor(now.getTime() / 1000);
  const universalStartTs = Math.floor(universalStart.getTime() / 1000);
  const timeRangeSeconds = universalEndTs - universalStartTs;
  const maxBars = Math.min(5000, Math.max(100, Math.floor(timeRangeSeconds / tfSeconds)));

  // Generate bars entirely in-memory (deterministic — same inputs = same output)
  const bars = generateOHLCV(symbolName, universalStart, maxBars, timeframe);

  // Return the last `limit` bars
  const resultBars = bars.slice(-limit);

  const data: OHLCVBar[] = resultBars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  return NextResponse.json({ data });
}
