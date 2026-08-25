// ============================================================================
// Live Feed barrel export — import from '@/lib/live-feed'
// ============================================================================

// Ensure providers are registered (side-effect imports)
import './twelvedata';
import './finnhub';

export { getActiveProvider, getRegisteredProviders } from './provider';
export type { LiveDataProvider, LiveTick, WsMessage } from './provider';

/** Check if a symbol supports live data with the active provider (server-side) */
export function hasLiveSupport(symbol: string): boolean {
  try {
    const provider = getActiveProvider();
    return provider.hasLiveSupport(symbol);
  } catch {
    return false;
  }
}

/** Client-safe check: symbols known to have live data support.
 *  This list covers all symbols mapped in the Twelve Data provider
 *  (the active provider). Kept in sync manually — if a new provider
 *  is added, add its symbols here too. */
export const LIVE_SYMBOLS: Set<string> = new Set([
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'JPM', 'V', 'DIS', 'AMD',
  'SPX', 'NDX', 'NASDAQ', 'DJI', 'RUT', 'VIX',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD',
  'EUR/JPY', 'GBP/JPY', 'EUR/GBP', 'EUR/AUD', 'GBP/AUD',
  'GOLD', 'XAUUSD', 'SILVER', 'OIL', 'NATGAS', 'COPPER',
  'BTC/USD', 'ETH/USD', 'SOL/USD', 'BNB/USD', 'XRP/USD',
  'ES', 'NQ', 'YM', 'CL', 'GC',
]);
