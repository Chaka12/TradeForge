// ============================================================================
// GET /api/live/ws-messages?symbol=EUR/USD
// Returns provider-specific subscribe/unsubscribe WebSocket messages
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
    const msgs = provider.getWsMessages(symbol);
    return NextResponse.json(msgs);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}