// ============================================================================
// GET /api/live/config?symbol=EUR/USD
// Returns WebSocket URL and provider name (provider-agnostic)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/live-feed';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol param' }, { status: 400 });
  }

  try {
    const provider = getActiveProvider();

    if (!provider.hasLiveSupport(symbol)) {
      return NextResponse.json({ error: `Live data not supported for ${symbol}` }, { status: 404 });
    }

    return NextResponse.json({
      provider: provider.name,
      wsUrl: provider.getWsUrl(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
