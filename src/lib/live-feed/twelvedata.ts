// ============================================================================
// Twelve Data Provider — https://twelvedata.com/docs
// ============================================================================

import { registerProvider, type LiveDataProvider, type LiveTick, type WsMessage } from './provider';
import type { OHLCVBar, Timeframe } from '@/types/trading';
import { TIMEFRAMES } from '@/types/trading';

// ---------------------------------------------------------------------------
// Symbol mapping
// ---------------------------------------------------------------------------

/** Map TradeForge symbols to Twelve Data format */
const SYMBOL_MAP: Record<string, string> = {
  // US Stocks
  AAPL: 'AAPL',
  GOOGL: 'GOOGL',
  MSFT: 'MSFT',
  AMZN: 'AMZN',
  TSLA: 'TSLA',
  NVDA: 'NVDA',
  META: 'META',
  NFLX: 'NFLX',
  JPM: 'JPM',
  V: 'V',
  DIS: 'DIS',
  AMD: 'AMD',

  // Indices (Twelve Data uses ^ prefix for some)
  SPX: 'SPX',
  NDX: 'NDX',
  NASDAQ: 'NASDAQ',
  DJI: 'DJI',
  RUT: 'RUT',
  VIX: 'VIX',

  // Forex
  'EUR/USD': 'EUR/USD',
  'GBP/USD': 'GBP/USD',
  'USD/JPY': 'USD/JPY',
  'USD/CHF': 'USD/CHF',
  'AUD/USD': 'AUD/USD',
  'USD/CAD': 'USD/CAD',
  'NZD/USD': 'NZD/USD',
  'EUR/JPY': 'EUR/JPY',
  'GBP/JPY': 'GBP/JPY',
  'EUR/GBP': 'EUR/GBP',
  'EUR/AUD': 'EUR/AUD',
  'GBP/AUD': 'GBP/AUD',

  // Commodities
  GOLD: 'GOLD',
  XAUUSD: 'XAU/USD',
  SILVER: 'SILVER',
  OIL: 'CL',
  NATGAS: 'NG',
  COPPER: 'HG',

  // Crypto
  'BTC/USD': 'BTC/USD',
  'ETH/USD': 'ETH/USD',
  'SOL/USD': 'SOL/USD',
  'BNB/USD': 'BNB/USD',
  'XRP/USD': 'XRP/USD',

  // Futures (CME)
  ES: 'ES',
  NQ: 'NQ',
  YM: 'YM',
  CL: 'CL',
  GC: 'GC',
};

// ---------------------------------------------------------------------------
// Timeframe mapping
// ---------------------------------------------------------------------------

const TF_MAP: Record<string, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1H': '1h',
  '3H': '3h',
  '4H': '4h',
  '8H': '8h',
  '12H': '12h',
  '1D': '1day',
  '1W': '1week',
  '1M': '1month',
};

// ---------------------------------------------------------------------------
// Twelve Data REST helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not set');
  return key;
}

interface TwelveDataCandleResponse {
  status: string;
  symbol: string;
  interval: string;
  currency: string;
  exchange_timezone: string;
  exchange: string;
  mic_code: string;
  type: string;
  values: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>;
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const twelveDataProvider: LiveDataProvider = {
  name: 'twelvedata',

  toProviderSymbol(symbol: string): string | null {
    return SYMBOL_MAP[symbol] ?? null;
  },

  hasLiveSupport(symbol: string): boolean {
    return symbol in SYMBOL_MAP;
  },

  toProviderResolution(timeframe: Timeframe): string {
    return TF_MAP[timeframe] ?? '1day';
  },

  getBarPeriodSeconds(timeframe: Timeframe): number {
    return TIMEFRAMES[timeframe]?.seconds ?? 86400;
  },

  async fetchHistoricalBars(
    symbol: string,
    timeframe: Timeframe,
    limit = 500,
    startDate?: string,
    endDate?: string,
  ): Promise<OHLCVBar[]> {
    const providerSymbol = this.toProviderSymbol(symbol);
    if (!providerSymbol) throw new Error(`No Twelve Data mapping for symbol: ${symbol}`);

    const interval = this.toProviderResolution(timeframe);
    const apiKey = getApiKey();

    const params = new URLSearchParams({
      symbol: providerSymbol,
      interval,
      outputsize: String(Math.min(limit, 5000)),
      apikey: apiKey,
    });

    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);

    const url = `https://api.twelvedata.com/time_series?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Twelve Data API error ${res.status}: ${text}`);
    }

    const json: TwelveDataCandleResponse = await res.json();

    if (json.status === 'error') {
      throw new Error(`Twelve Data API error: ${JSON.stringify(json)}`);
    }

    if (!json.values || !Array.isArray(json.values)) {
      return [];
    }

    // Twelve Data returns values in descending order (newest first)
    const bars: OHLCVBar[] = json.values
      .reverse()
      .map((v) => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: parseInt(v.volume, 10) || 0,
      }))
      .filter((b) => b.time > 0 && b.open > 0);

    return bars;
  },

  getWsUrl(): string {
    const apiKey = getApiKey();
    return `wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`;
  },

  getWsMessages(symbol: string): WsMessage {
    const providerSymbol = this.toProviderSymbol(symbol);
    if (!providerSymbol) throw new Error(`No Twelve Data mapping for symbol: ${symbol}`);

    // Twelve Data WS subscribes via JSON-RPC style
    const subscribeJson = JSON.stringify({
      action: 'subscribe',
      params: {
        symbols: providerSymbol,
      },
    });

    const unsubscribeJson = JSON.stringify({
      action: 'unsubscribe',
      params: {
        symbols: providerSymbol,
      },
    });

    return { subscribe: subscribeJson, unsubscribe: unsubscribeJson };
  },

  parseWsMessage(raw: string): LiveTick | null {
    try {
      const msg = JSON.parse(raw);

      // Twelve Data price event
      if (msg.event === 'price' && msg.symbol && msg.price) {
        return {
          symbol: msg.symbol,
          price: parseFloat(msg.price),
          volume: parseFloat(msg.volume || '0'),
          timestamp: Math.floor((msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()) / 1000),
        };
      }

      return null;
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Auto-register
// ---------------------------------------------------------------------------

registerProvider(twelveDataProvider);
