// ============================================================================
// GET /api/live/bars?symbol=EUR/USD&timeframe=1H&limit=500
// Provider-agnostic REST proxy for historical OHLCV data
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/live-feed';
import type { Timeframe } from '@/types/trading';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const timeframe = (searchParams.get('timeframe') ?? '1D') as Timeframe;
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '500', 10), 1), 5000);
  const startDate = searchParams.get('start_date') ?? undefined;
  const endDate = searchParams.get('end_date') ?? undefined;

  if (!symbol) {
    return NextResponse.json({ error: 'Missing required query param: symbol' }, { status: 400 });
  }

  try {
    const provider = getActiveProvider();
    const bars = await provider.fetchHistoricalBars(symbol, timeframe, limit, startDate, endDate);
    return NextResponse.json({ data: bars, provider: provider.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
